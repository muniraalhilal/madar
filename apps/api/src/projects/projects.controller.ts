import { addMemberSchema, createProjectSchema, type CreateProjectInput } from '@madar/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, RequirePermission, type AuthUser } from '../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { ProjectAccessService } from './project-access.service';
import { ProjectsService } from './projects.service';

const updateSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(500).optional() });

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get()
  @RequirePermission('project:read')
  list(@CurrentUser() user: AuthUser) {
    return this.projects.listFor(user);
  }

  @Post()
  @RequirePermission('project:create')
  @ApiZodBody(createProjectSchema)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createProjectSchema)) body: CreateProjectInput) {
    return this.projects.create(user, body);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { role } = await this.access.assert(user, id, 'read');
    return { ...(await this.projects.get(id)), myRole: role };
  }

  @Patch(':id')
  @ApiZodBody(updateSchema)
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    await this.access.assert(user, id, 'manage');
    return this.projects.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assert(user, id, 'manage');
    await this.projects.remove(user, id);
  }

  @Post(':id/members')
  @ApiZodBody(addMemberSchema)
  async addMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>) {
    await this.access.assert(user, id, 'manage');
    return this.projects.addMember(user, id, body.email, body.role);
  }

  @Get(':id/activity')
  async activity(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assert(user, id, 'read');
    return this.projects.activity(id);
  }
}
