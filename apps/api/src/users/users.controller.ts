import { changePasswordSchema, updateProfileSchema } from '@madar/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, RequirePermission, type AuthUser, type AuthedRequest } from '../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { extractAccessToken } from '../auth/guards';
import { TokensService } from '../auth/tokens.service';
import { UsersService } from './users.service';

const roleSchema = z.object({ role: z.enum(['admin', 'planner', 'viewer']) });

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {}

  @Patch('me')
  @ApiZodBody(updateProfileSchema)
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>) {
    return this.users.updateProfile(user.id, body.displayName);
  }

  @Post('me/password')
  @HttpCode(204)
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ) {
    const { token } = extractAccessToken(req as never);
    const sid = token ? this.tokens.verifyAccess(token).sid : undefined;
    await this.users.changePassword(user.id, body.currentPassword, body.newPassword, sid);
  }

  @Get('me/sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.users.listSessions(user.id);
  }

  @Get()
  @RequirePermission('user:manage')
  list() {
    return this.users.listAll();
  }

  @Patch(':id/role')
  @RequirePermission('user:manage')
  @ApiZodBody(roleSchema)
  setRole(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(roleSchema)) body: z.infer<typeof roleSchema>) {
    return this.users.setRole(user.id, id, body.role);
  }
}
