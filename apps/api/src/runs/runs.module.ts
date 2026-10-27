import { Global, Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Global()
@Module({ controllers: [RunsController], providers: [RunsService], exports: [RunsService] })
export class RunsModule {}
