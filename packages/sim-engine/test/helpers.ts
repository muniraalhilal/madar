import type { CityNetwork, NetworkLink, NetworkNode } from '../src/index.js';

/** Builds a tiny network from a list of [from, to, length] edges, with node coordinates. */
export function tinyNetwork(
  nodes: [string, number, number, NetworkNode['kind']?][],
  edges: [string, string, number, Partial<NetworkLink>?][],
  extra: Partial<CityNetwork> = {},
): CityNetwork {
  return {
    id: 'tiny',
    name: 'tiny',
    version: 'test',
    nodes: nodes.map(([id, x, y, kind]) => ({ id, name: id, kind: kind ?? 'priority', x, y, districtId: null })),
    links: edges.map(([from, to, length, rest]) => ({
      id: `${from}>${to}`,
      name: `${from}-${to}`,
      from,
      to,
      length,
      lanes: 1,
      speedLimit: 10,
      saturationFlow: 1800,
      roadClass: 'collector' as const,
      ...rest,
    })),
    signals: [],
    districts: [],
    buildings: [],
    zones: [],
    baseDemandVehPerHour: 0,
    ...extra,
  };
}
