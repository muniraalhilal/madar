import {
  createScenarioSchema,
  proposeSignalsSchema,
  updateScenarioSchema,
  type CreateScenarioInput,
  type UpdateScenarioInput,
} from '@madar/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { CurrentUser, RequirePermission, type AuthUser } from '../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { ProjectAccessService } from '../projects/project-access.service';
import { ScenariosService } from './scenarios.service';

@ApiTags('scenarios')
@Controller()
export class ScenariosController {
  constructor(
    private readonly scenarios: ScenariosService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get('projects/:projectId/scenarios')
  @RequirePermission('scenario:read')
  async list(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Query('saved') saved?: string) {
    await this.access.assert(user, projectId, 'read');
    return this.scenarios.list(projectId, { savedOnly: saved === 'true' });
  }

  @Post('projects/:projectId/scenarios')
  @RequirePermission('scenario:write')
  @ApiZodBody(createScenarioSchema)
  async create(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodPipe(createScenarioSchema)) body: CreateScenarioInput,
  ) {
    await this.access.assert(user, projectId, 'write');
    return this.scenarios.create(user, projectId, body);
  }

  @Get('projects/:projectId/incidents')
  @RequirePermission('scenario:read')
  async incidents(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    await this.access.assert(user, projectId, 'read');
    return this.scenarios.projectIncidents(projectId);
  }

  @Get('scenarios/:id')
  @RequirePermission('scenario:read')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertScenario(user, id, 'read');
    return this.scenarios.detail(id);
  }

  @Patch('scenarios/:id')
  @RequirePermission('scenario:write')
  @ApiZodBody(updateScenarioSchema)
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateScenarioSchema)) body: UpdateScenarioInput) {
    await this.access.assertScenario(user, id, 'write');
    return this.scenarios.update(user, id, body);
  }

  @Post('scenarios/:id/duplicate')
  @RequirePermission('scenario:write')
  async duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const projectId = await this.access.assertScenario(user, id, 'write');
    const src = await this.scenarios.detail(id);
    return this.scenarios.create(user, projectId, { name: `${src.name} (copy)`.slice(0, 80), description: src.description, kind: 'variant', baseScenarioId: id });
  }

  @Delete('scenarios/:id')
  @HttpCode(204)
  @RequirePermission('scenario:write')
  async archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertScenario(user, id, 'write');
    await this.scenarios.archive(user, id);
  }

  @Post('scenarios/:id/propose-signals')
  @HttpCode(200)
  @RequirePermission('scenario:read')
  @ApiZodBody(proposeSignalsSchema)
  async propose(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(proposeSignalsSchema)) body: z.infer<typeof proposeSignalsSchema>) {
    await this.access.assertScenario(user, id, 'read');
    return this.scenarios.proposeSignals(id, body.runId, body.intersectionCodes);
  }
}
