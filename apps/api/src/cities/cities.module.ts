import { Global, Module } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';

@Global()
@Module({ controllers: [CitiesController], providers: [CitiesService], exports: [CitiesService] })
export class CitiesModule {}
