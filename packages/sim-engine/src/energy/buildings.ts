import type { Building, BuildingUse, CityNetwork } from '../core/types.js';

/**
 * Simplified building-energy model (hourly, one synthetic hot-climate day).
 *
 *   E_b(h) = A_b · EUI_use / 8760 · shape_use(h) · [ (1 − c) + c · cooling(h) ] · (1 − lighting saving)
 *
 * - A_b: gross floor area (m²)
 * - EUI_use: assumed annual energy-use intensity per use type (kWh/m²·yr)
 * - shape_use(h): normalised daily load shape (mean = 1)
 * - c: share of load that is cooling; cooling(h) scales with the gap between
 *   outdoor temperature and the setpoint (degree-hour proxy), normalised so a
 *   typical hour = 1
 *
 * Every coefficient below is an illustrative modelling assumption chosen for a
 * fictional city. They are documented so results are explainable — they are not
 * measured statistics and must not be presented as such.
 */

export const ENERGY_ASSUMPTIONS = {
  euiKwhPerM2Year: { office: 230, residential: 170, retail: 300, mixed: 220, civic: 190, hotel: 290 } as Record<BuildingUse, number>,
  coolingShare: { office: 0.55, residential: 0.6, retail: 0.5, mixed: 0.55, civic: 0.5, hotel: 0.55 } as Record<BuildingUse, number>,
  lightingShare: 0.18,
  baseSetpointC: 24,
  /** Synthetic outdoor temperature: mean and half-amplitude, °C. Peak at 15:00. */
  outdoorMeanC: 33,
  outdoorAmplitudeC: 7,
  note: 'Illustrative assumptions for a fictional city; not calibrated against real buildings.',
};

const SHAPES: Record<BuildingUse, number[]> = {
  office: [0.35, 0.33, 0.32, 0.32, 0.34, 0.42, 0.7, 1.15, 1.5, 1.62, 1.66, 1.68, 1.64, 1.66, 1.68, 1.64, 1.55, 1.3, 0.95, 0.7, 0.55, 0.46, 0.4, 0.37],
  residential: [0.7, 0.62, 0.58, 0.56, 0.58, 0.7, 0.95, 1.1, 0.98, 0.85, 0.82, 0.85, 0.92, 0.95, 0.98, 1.05, 1.18, 1.36, 1.5, 1.55, 1.48, 1.32, 1.06, 0.86],
  retail: [0.3, 0.28, 0.27, 0.27, 0.28, 0.32, 0.45, 0.7, 1.0, 1.25, 1.4, 1.48, 1.52, 1.5, 1.48, 1.5, 1.56, 1.62, 1.66, 1.6, 1.44, 1.12, 0.7, 0.4],
  mixed: [0.5, 0.46, 0.44, 0.44, 0.46, 0.55, 0.8, 1.1, 1.3, 1.35, 1.36, 1.38, 1.38, 1.38, 1.38, 1.38, 1.38, 1.36, 1.26, 1.1, 0.95, 0.82, 0.68, 0.56],
  civic: [0.3, 0.3, 0.3, 0.3, 0.3, 0.36, 0.6, 1.1, 1.6, 1.75, 1.78, 1.78, 1.72, 1.74, 1.72, 1.6, 1.3, 0.9, 0.6, 0.45, 0.38, 0.34, 0.32, 0.3],
  hotel: [0.82, 0.78, 0.76, 0.75, 0.76, 0.85, 1.02, 1.15, 1.08, 0.98, 0.95, 0.98, 1.04, 1.02, 1.0, 1.02, 1.06, 1.12, 1.2, 1.24, 1.2, 1.12, 1.0, 0.9],
};

// Normalise every shape to mean 1 at load time.
for (const k of Object.keys(SHAPES) as BuildingUse[]) {
  const s = SHAPES[k];
  const m = s.reduce((a, b) => a + b, 0) / s.length;
  SHAPES[k] = s.map((v) => v / m);
}

export function outdoorTemperature(hour: number): number {
  const a = ENERGY_ASSUMPTIONS;
  return a.outdoorMeanC + a.outdoorAmplitudeC * Math.cos((2 * Math.PI * (hour - 15)) / 24);
}

export interface EnergyScenario {
  /** Cooling setpoint change in °C (+1 = warmer setpoint = less cooling). Range −3…+4. */
  setpointDelta: number;
  /** Fraction of lighting load removed by efficiency upgrades, 0…0.6. */
  lightingSaving: number;
  /** Occupancy / activity scale, 0.5…1.5. */
  occupancyScale: number;
}

export const DEFAULT_ENERGY_SCENARIO: EnergyScenario = { setpointDelta: 0, lightingSaving: 0, occupancyScale: 1 };

export function validateEnergyScenario(e: EnergyScenario): string[] {
  const issues: string[] = [];
  if (!(e.setpointDelta >= -3 && e.setpointDelta <= 4)) issues.push('setpointDelta must be between −3 and +4 °C');
  if (!(e.lightingSaving >= 0 && e.lightingSaving <= 0.6)) issues.push('lightingSaving must be 0–0.6');
  if (!(e.occupancyScale >= 0.5 && e.occupancyScale <= 1.5)) issues.push('occupancyScale must be 0.5–1.5');
  return issues;
}

/** Mean degree-hours above the *baseline* setpoint — the normalisation constant. */
const BASELINE_DEGREE_HOURS = (() => {
  let s = 0;
  for (let h = 0; h < 24; h++) s += Math.max(0, outdoorTemperature(h) - ENERGY_ASSUMPTIONS.baseSetpointC);
  return s / 24;
})();

/** Cooling demand index for an hour; 1 = an average hour at the baseline setpoint. */
function coolingIndex(hour: number, setpoint: number): number {
  const gap = Math.max(0, outdoorTemperature(hour) - setpoint);
  return BASELINE_DEGREE_HOURS > 0 ? gap / BASELINE_DEGREE_HOURS : 0;
}

export function buildingHourlyLoad(b: Building, scenario: EnergyScenario = DEFAULT_ENERGY_SCENARIO): number[] {
  const a = ENERGY_ASSUMPTIONS;
  const setpoint = a.baseSetpointC + scenario.setpointDelta;
  const hourlyBase = (b.floorArea * (a.euiKwhPerM2Year[b.use] ?? 200)) / 8760;
  const c = a.coolingShare[b.use] ?? 0.5;
  const shape = SHAPES[b.use];
  const out: number[] = [];
  for (let h = 0; h < 24; h++) {
    const activity = 1 + ((shape[h] as number) - 1) * scenario.occupancyScale;
    const nonCooling = (1 - c) * activity * (1 - a.lightingShare * scenario.lightingSaving / (1 - c));
    const cooling = c * coolingIndex(h, setpoint) * (0.6 + 0.4 * activity);
    out.push(hourlyBase * Math.max(0, nonCooling + cooling));
  }
  return out;
}

export interface DistrictEnergy {
  districtId: string;
  hourlyKwh: number[];
  dailyKwh: number;
  peakKw: number;
  peakHour: number;
  floorArea: number;
  intensityKwhPerM2Day: number;
}

export interface CityEnergyResult {
  hourlyKwh: number[];
  dailyKwh: number;
  peakKw: number;
  peakHour: number;
  districts: DistrictEnergy[];
  byUse: Record<string, number>;
  temperatureC: number[];
  topBuildings: { buildingId: string; name: string; dailyKwh: number; intensity: number }[];
  scenario: EnergyScenario;
  assumptions: typeof ENERGY_ASSUMPTIONS;
}

export function simulateCityEnergy(network: CityNetwork, scenario: EnergyScenario = DEFAULT_ENERGY_SCENARIO): CityEnergyResult {
  const issues = validateEnergyScenario(scenario);
  if (issues.length) throw new RangeError(issues.join('; '));
  const hourly = new Array<number>(24).fill(0);
  const byDistrict = new Map<string, { hourly: number[]; area: number }>();
  const byUse: Record<string, number> = {};
  const per: { buildingId: string; name: string; dailyKwh: number; intensity: number }[] = [];
  for (const b of network.buildings) {
    const load = buildingHourlyLoad(b, scenario);
    const d = byDistrict.get(b.districtId) ?? { hourly: new Array<number>(24).fill(0), area: 0 };
    let daily = 0;
    load.forEach((v, h) => {
      hourly[h] = (hourly[h] as number) + v;
      d.hourly[h] = (d.hourly[h] as number) + v;
      daily += v;
    });
    d.area += b.floorArea;
    byDistrict.set(b.districtId, d);
    byUse[b.use] = (byUse[b.use] ?? 0) + daily;
    per.push({ buildingId: b.id, name: b.name, dailyKwh: daily, intensity: b.floorArea ? daily / b.floorArea : 0 });
  }
  const peak = (xs: number[]) => xs.reduce((best, v, i) => (v > best.v ? { v, i } : best), { v: -Infinity, i: 0 });
  const p = peak(hourly);
  const districts: DistrictEnergy[] = [...byDistrict.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([districtId, d]) => {
      const dp = peak(d.hourly);
      const daily = d.hourly.reduce((s, v) => s + v, 0);
      return { districtId, hourlyKwh: d.hourly, dailyKwh: daily, peakKw: dp.v, peakHour: dp.i, floorArea: d.area, intensityKwhPerM2Day: d.area ? daily / d.area : 0 };
    });
  return {
    hourlyKwh: hourly,
    dailyKwh: hourly.reduce((s, v) => s + v, 0),
    peakKw: p.v,
    peakHour: p.i,
    districts,
    byUse,
    temperatureC: Array.from({ length: 24 }, (_, h) => outdoorTemperature(h)),
    topBuildings: per.sort((a, b) => b.dailyKwh - a.dailyKwh || (a.buildingId < b.buildingId ? -1 : 1)).slice(0, 10),
    scenario,
    assumptions: ENERGY_ASSUMPTIONS,
  };
}
