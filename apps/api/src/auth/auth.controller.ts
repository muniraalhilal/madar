import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@madar/shared';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthedRequest, type AuthUser } from '../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { UsersService } from '../users/users.service';
import { AuthService, type SessionTokens } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE, TokensService } from './tokens.service';

const client = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
  ) {}

  private setCookies(res: Response, s: SessionTokens) {
    res.cookie(ACCESS_COOKIE, s.accessToken, this.tokens.cookieOptions('access'));
    res.cookie(REFRESH_COOKIE, s.refreshToken, this.tokens.cookieOptions('refresh'));
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @ApiZodBody(registerSchema)
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(body, client(req));
    this.setCookies(res, session);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(body, client(req));
    this.setCookies(res, session);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string })?.refreshToken;
    if (!token) throw new UnauthorizedException('No refresh token');
    const session = await this.auth.refresh(token, client(req));
    this.setCookies(res, session);
    return { user: session.user, accessToken: session.accessToken, refreshToken: req.cookies?.[REFRESH_COOKIE] ? undefined : session.refreshToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE], req.user?.id, client(req));
    res.clearCookie(ACCESS_COOKIE, { ...this.tokens.cookieOptions('access'), maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...this.tokens.cookieOptions('refresh'), maxAge: undefined });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getPublic(user.id);
  }
}
