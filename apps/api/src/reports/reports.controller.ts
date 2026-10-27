import { createReportSchema } from '@madar/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentUser, RequirePermission, type AuthUser } from '../common/auth.decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { ProjectAccessService } from '../projects/project-access.service';
import { renderReportHtml, type ReportContent } from './report-render';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get('projects/:projectId/reports')
  async list(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    await this.access.assert(user, projectId, 'read');
    return this.reports.list(projectId);
  }

  @Post('projects/:projectId/reports')
  @RequirePermission('report:write')
  @ApiZodBody(createReportSchema)
  async create(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body(new ZodPipe(createReportSchema)) body: z.infer<typeof createReportSchema>) {
    await this.access.assert(user, projectId, 'write');
    return this.reports.create(user, projectId, body);
  }

  @Get('reports/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.reports.get(id);
    await this.access.assert(user, r.projectId, 'read');
    return r;
  }

  @Get('reports/:id/export.html')
  async export(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.reports.get(id);
    await this.access.assert(user, r.projectId, 'read');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Content-Disposition', `inline; filename="madar-report-${id.slice(0, 8)}.html"`);
    res.send(renderReportHtml(r.content as ReportContent));
  }

  @Delete('reports/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.reports.get(id);
    await this.access.assert(user, r.projectId, 'write');
    await this.reports.remove(user, id);
  }
}
