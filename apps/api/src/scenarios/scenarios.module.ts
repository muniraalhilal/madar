import { Global, Module } from '@nestjs/common';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Global()
@Module({ controllers: [ScenariosController], providers: [ScenariosService], exports: [ScenariosService] })
export class ScenariosModule {}
