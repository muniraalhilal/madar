import { runControlSchema, startRunSchema } from '@madar/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermission, type AuthUser } from '../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { ProjectAccessService } from '../projects/project-access.service';
import { RunsService } from './runs.service';

const compareQuery = z.object({ baseline: z.string().uuid(), variant: z.string().uuid() });

@ApiTags('runs')
@Controller()
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly access: ProjectAccessService,
  ) {}

  @Post('scenarios/:id/runs')
  @RequirePermission('run:execute')
  @ApiZodBody(startRunSchema)
  async start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(startRunSchema)) body: z.infer<typeof startRunSchema>) {
    await this.access.assertScenario(user, id, 'write');
    return this.runs.start(user, id, body.pace);
  }

  @Get('projects/:projectId/runs')
  async list(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    await this.access.assert(user, projectId, 'read');
    return this.runs.listForProject(projectId);
  }

  @Get('runs/compare')
  async compare(@CurrentUser() user: AuthUser, @Query(new ZodPipe(compareQuery)) q: z.infer<typeof compareQuery>) {
    await this.access.assertRun(user, q.baseline, 'read');
    await this.access.assertRun(user, q.variant, 'read');
    return this.runs.compare(q.baseline, q.variant);
  }

  @Get('runs/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertRun(user, id, 'read');
    return this.runs.get(id);
  }

  @Get('runs/:id/metrics')
  async metrics(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertRun(user, id, 'read');
    return this.runs.metrics(id);
  }

  @Get('runs/:id/links')
  async links(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertRun(user, id, 'read');
    return this.runs.links(id);
  }

  @Get('runs/:id/intersections')
  async intersections(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertRun(user, id, 'read');
    return this.runs.intersections(id);
  }

  @Get('runs/:id/events')
  async events(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.access.assertRun(user, id, 'read');
    return this.runs.events(id);
  }

  /** Binary playback (see @madar/sim-engine codec), served gzip-encoded for the browser to inflate natively. */
  @Get('runs/:id/playback')
  async playback(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    await this.access.assertRun(user, id, 'read');
    const p = await this.runs.playback(id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Frame-Interval', String(p.frameIntervalS));
    res.setHeader('X-Frame-Count', String(p.frameCount));
    res.end(p.data);
  }

  @Post('runs/:id/control')
  @HttpCode(200)
  @RequirePermission('run:control')
  @ApiZodBody(runControlSchema)
  async control(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(runControlSchema)) body: z.infer<typeof runControlSchema>) {
    await this.access.assertRun(user, id, 'write');
    return this.runs.control(user, id, body.action);
  }
}
