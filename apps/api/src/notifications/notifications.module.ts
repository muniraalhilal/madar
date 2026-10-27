import { schema as s, type Database } from '@madar/db';
import { Controller, Get, HttpCode, Inject, Injectable, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { CurrentUser, type AuthUser } from '../common/auth.decorators';
import { DB } from '../database/database.module';

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Database) {}
  list(userId: string) {
    return this.db.select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.createdAt)).limit(50);
  }
  async markRead(userId: string, id: string) {
    await this.db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.id, id), eq(s.notifications.userId, userId)));
  }
  async markAll(userId: string) {
    await this.db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt)));
  }
}

@ApiTags('notifications')
@Controller('notifications')
class NotificationsController {
  constructor(private readonly n: NotificationsService) {}
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.n.list(u.id);
  }
  @Post('read-all')
  @HttpCode(204)
  async all(@CurrentUser() u: AuthUser) {
    await this.n.markAll(u.id);
  }
  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.n.markRead(u.id, id);
  }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
