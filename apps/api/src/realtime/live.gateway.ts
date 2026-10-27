import { WS_NAMESPACE, WsEvents, type WorkerMessage } from '@madar/shared';
import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { parse as parseCookie } from 'cookie';
import type Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { ACCESS_COOKIE, TokensService } from '../auth/tokens.service';
import type { AuthUser } from '../common/auth.decorators';
import { REDIS_SUB } from '../database/redis.module';
import { ProjectAccessService } from '../projects/project-access.service';

const subscribeSchema = z.object({ runId: z.string().uuid() });
const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim());

/**
 * Real-time relay. The worker publishes to Redis; this gateway forwards to the
 * sockets in `run:<id>` rooms. Joining a room requires an authenticated socket
 * AND read access to the run's project — the same check as the REST API.
 */
@WebSocketGateway({ namespace: WS_NAMESPACE, cors: { origin: allowedOrigins, credentials: true }, transports: ['websocket', 'polling'] })
export class LiveGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(LiveGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly tokens: TokensService,
    private readonly auth: AuthService,
    private readonly access: ProjectAccessService,
    @Inject(REDIS_SUB) private readonly sub: Redis,
  ) {}

  afterInit(): void {
    void this.sub.psubscribe('madar:run:*', 'madar:user:*');
    this.sub.on('pmessage', (_pattern, channel, raw) => this.relay(channel, raw));
  }

  async onModuleDestroy(): Promise<void> {
    await this.sub.punsubscribe().catch(() => undefined);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const fromAuth = (client.handshake.auth as { token?: string } | undefined)?.token;
      const cookies = parseCookie(client.handshake.headers.cookie ?? '');
      const token = fromAuth ?? cookies[ACCESS_COOKIE];
      if (!token) throw new Error('no token');
      const claims = this.tokens.verifyAccess(token);
      if (!(await this.auth.isSessionActive(claims.sid))) throw new Error('revoked');
      const user: AuthUser = { id: claims.sub, email: claims.email, role: claims.role, displayName: claims.name };
      client.data.user = user;
      await client.join(`user:${user.id}`);
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage(WsEvents.subscribeRun)
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const parsed = subscribeSchema.safeParse(body);
    const user = client.data.user as AuthUser | undefined;
    if (!parsed.success || !user) return { ok: false, error: 'Invalid request' };
    try {
      await this.access.assertRun(user, parsed.data.runId, 'read');
    } catch {
      return { ok: false, error: 'Run not found' };
    }
    await client.join(`run:${parsed.data.runId}`);
    return { ok: true };
  }

  @SubscribeMessage(WsEvents.unsubscribeRun)
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const parsed = subscribeSchema.safeParse(body);
    if (parsed.success) await client.leave(`run:${parsed.data.runId}`);
    return { ok: true };
  }

  private relay(channel: string, raw: string): void {
    try {
      if (channel.startsWith('madar:user:')) {
        const userId = channel.slice('madar:user:'.length);
        this.server.to(`user:${userId}`).emit(WsEvents.notification, JSON.parse(raw));
        return;
      }
      const runId = channel.slice('madar:run:'.length);
      const room = this.server.to(`run:${runId}`);
      const msg = JSON.parse(raw) as WorkerMessage;
      switch (msg.type) {
        case 'frame': {
          // Frames are high-frequency and replaceable: volatile emit drops them for
          // slow clients instead of buffering stale positions.
          const p = msg.payload;
          const data = Buffer.from(p.data as string, 'base64');
          const congestion = p.congestion ? Buffer.from(p.congestion as string, 'base64') : undefined;
          room.volatile.emit(WsEvents.frame, { runId, t: p.t, count: p.count, data, congestion });
          break;
        }
        case 'progress':
          room.emit(WsEvents.progress, msg.payload);
          break;
        case 'status':
          room.emit(WsEvents.status, msg.payload);
          break;
        case 'sample':
          room.emit(WsEvents.sample, msg.payload);
          break;
        case 'event':
          room.emit(WsEvents.simEvent, msg.payload);
          break;
      }
    } catch (e) {
      this.logger.warn(`Dropped malformed message on ${channel}: ${(e as Error).message}`);
    }
  }
}
