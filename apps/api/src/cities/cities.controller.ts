import { energyQuerySchema, nearQuerySchema } from '@madar/shared';
import { simulateCityEnergy } from '@madar/sim-engine';
import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod';
import { CitiesService } from './cities.service';

@ApiTags('cities')
@Controller('cities')
@RequirePermission('city:read')
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  list() {
    return this.cities.list();
  }

  @Get(':cityId')
  summary(@Param('cityId') cityId: string) {
    return this.cities.summary(cityId);
  }

  @Get(':cityId/map')
  @Header('Cache-Control', 'private, max-age=300')
  map(@Param('cityId') cityId: string) {
    return this.cities.map(cityId);
  }

  @Get(':cityId/roads/:code')
  road(@Param('cityId') cityId: string, @Param('code') code: string) {
    return this.cities.road(cityId, code);
  }

  @Get(':cityId/intersections/:code')
  intersection(@Param('cityId') cityId: string, @Param('code') code: string) {
    return this.cities.intersection(cityId, code);
  }

  @Get(':cityId/buildings/near')
  near(@Param('cityId') cityId: string, @Query(new ZodPipe(nearQuerySchema)) q: z.infer<typeof nearQuerySchema>) {
    return this.cities.buildingsNear(cityId, q.x, q.y, q.radius);
  }

  @Get(':cityId/locate')
  locate(@Param('cityId') cityId: string, @Query(new ZodPipe(nearQuerySchema)) q: z.infer<typeof nearQuerySchema>) {
    return this.cities.locate(cityId, q.x, q.y);
  }

  /** Building energy model for a synthetic hot day under the given levers. Pure computation, no persistence. */
  @Get(':cityId/energy')
  async energy(@Param('cityId') cityId: string, @Query(new ZodPipe(energyQuerySchema)) q: z.infer<typeof energyQuerySchema>) {
    const { network } = await this.cities.get(cityId);
    const baseline = simulateCityEnergy(network);
    const scenario = simulateCityEnergy(network, q);
    return {
      baseline,
      scenario,
      savingKwh: baseline.dailyKwh - scenario.dailyKwh,
      savingPercent: baseline.dailyKwh ? ((baseline.dailyKwh - scenario.dailyKwh) / baseline.dailyKwh) * 100 : 0,
      kind: 'estimate' as const,
    };
  }
}
