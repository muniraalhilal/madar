'use client';
import type { CityNetwork, Point } from '@madar/sim-engine';
import { useEffect, useState } from 'react';
import { api } from './api';

export type CityMapData = CityNetwork & { bounds: { minX: number; maxX: number; minY: number; maxY: number } };
let cache: Promise<CityMapData> | null = null;

/** The city network from the API (PostGIS-backed), loaded once per session. */
export function useCityMap(cityId = 'madar-city') {
  const [city, setCity] = useState<CityMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cache ??= api<CityMapData>(`/cities/${cityId}/map`);
    cache.then(setCity).catch((e: Error) => {
      cache = null;
      setError(e.message);
    });
  }, [cityId]);
  return { city, error };
}

export function polylineFor(city: CityNetwork, linkId: string): Point[] {
  const l = city.links.find((x) => x.id === linkId);
  if (!l) return [];
  const a = city.nodes.find((n) => n.id === l.from)!;
  const b = city.nodes.find((n) => n.id === l.to)!;
  return [a, ...(l.shape ?? []), b];
}
