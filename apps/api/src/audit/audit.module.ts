import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationSchema } from '@madar/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get()
  @RequirePermission('audit:read')
  list(@Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>) {
    return this.audit.list(q.limit, q.offset);
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
