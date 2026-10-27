import { loadCityNetwork, schema as s, type CityIdMaps, type Database } from '@madar/db';
import { RoadGraph, cityBounds, type CityNetwork } from '@madar/sim-engine';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DB } from '../database/database.module';

interface CachedCity {
  network: CityNetwork;
  maps: CityIdMaps;
  graph: RoadGraph;
  loadedAt: number;
}

/**
 * City data is read-mostly and versioned, so the assembled network is cached in
 * memory per (city, version). A version bump in the database invalidates it.
 */
@Injectable()
export class CitiesService {
  private cache = new Map<string, CachedCity>();
  constructor(@Inject(DB) private readonly db: Database) {}

  async list() {
    return this.db
      .select({ id: s.cities.id, name: s.cities.name, version: s.cities.version, description: s.cities.description, isSynthetic: s.cities.isSynthetic })
      .from(s.cities)
      .orderBy(asc(s.cities.name));
  }

  async get(cityId: string): Promise<CachedCity> {
    const [row] = await this.db.select({ version: s.cities.version }).from(s.cities).where(eq(s.cities.id, cityId));
    if (!row) throw new NotFoundException(`City ${cityId} not found`);
    const hit = this.cache.get(cityId);
    if (hit && hit.network.version === row.version) return hit;
    const { network, maps } = await loadCityNetwork(this.db, cityId);
    const entry = { network, maps, graph: new RoadGraph(network), loadedAt: Date.now() };
    this.cache.set(cityId, entry);
    return entry;
  }

  async summary(cityId: string) {
    const { network } = await this.get(cityId);
    const totalFloorArea = network.buildings.reduce((a, b) => a + b.floorArea, 0);
    const laneKm = network.links.reduce((a, l) => a + (l.length * l.lanes) / 1000, 0);
    return {
      id: network.id,
      name: network.name,
      version: network.version,
      synthetic: true,
      bounds: cityBounds(network),
      counts: {
        districts: network.districts.length,
        intersections: network.nodes.filter((n) => n.kind !== 'gateway').length,
        signals: network.signals.length,
        roads: network.links.length,
        buildings: network.buildings.length,
      },
      laneKm,
      totalFloorArea,
      districts: network.districts.map((d) => ({
        ...d,
        buildings: network.buildings.filter((b) => b.districtId === d.id).length,
        intersections: network.nodes.filter((n) => n.districtId === d.id).length,
      })),
    };
  }

  async map(cityId: string) {
    const { network } = await this.get(cityId);
    return { ...network, bounds: cityBounds(network) };
  }

  async road(cityId: string, code: string) {
    const { network } = await this.get(cityId);
    const link = network.links.find((l) => l.id === code);
    if (!link) throw new NotFoundException('Road not found');
    const reverse = network.links.find((l) => l.from === link.to && l.to === link.from);
    return { ...link, capacityVehPerHour: link.lanes * link.saturationFlow, freeFlowTimeS: link.length / link.speedLimit, reverseCode: reverse?.id ?? null };
  }

  async intersection(cityId: string, code: string) {
    const { network } = await this.get(cityId);
    const node = network.nodes.find((n) => n.id === code);
    if (!node) throw new NotFoundException('Intersection not found');
    return {
      ...node,
      incoming: network.links.filter((l) => l.to === code).map((l) => ({ code: l.id, name: l.name, lanes: l.lanes, from: l.from })),
      outgoing: network.links.filter((l) => l.from === code).map((l) => ({ code: l.id, name: l.name, lanes: l.lanes, to: l.to })),
      signal: network.signals.find((p) => p.nodeId === code) ?? null,
    };
  }

  /** Buildings within `radius` metres of a point, nearest first (GiST-backed ST_DWithin + KNN). */
  async buildingsNear(cityId: string, x: number, y: number, radius: number) {
    const pt = sql`ST_SetSRID(ST_MakePoint(${x}, ${y}), 0)`;
    const rows = await this.db.execute<{ code: string; name: string; use: string; height_m: number; distance: number }>(sql`
      select code, name, use, height_m, ST_Distance(footprint, ${pt}) as distance
      from ${s.buildings}
      where city_id = ${cityId} and ST_DWithin(footprint, ${pt}, ${radius})
      order by footprint <-> ${pt}
      limit 25`);
    return rows.rows.map((r) => ({ code: r.code, name: r.name, use: r.use, heightM: Number(r.height_m), distanceM: Number(r.distance) }));
  }

  /** Reverse-geocode a point in the local frame: nearest road and containing district. */
  async locate(cityId: string, x: number, y: number) {
    const pt = sql`ST_SetSRID(ST_MakePoint(${x}, ${y}), 0)`;
    const road = await this.db.execute<{ code: string; name: string; distance: number }>(sql`
      select code, name, ST_Distance(geom, ${pt}) as distance from ${s.roads}
      where city_id = ${cityId} order by geom <-> ${pt} limit 1`);
    const district = await this.db.execute<{ code: string; name: string }>(sql`
      select code, name from ${s.districts} where city_id = ${cityId} and ST_Contains(boundary, ${pt}) limit 1`);
    const r = road.rows[0];
    return {
      road: r ? { code: r.code, name: r.name, distanceM: Number(r.distance) } : null,
      district: district.rows[0] ?? null,
    };
  }
}
