// Camera / lighting presets. Coordinates in metres; city core near the origin,
// water to the south (+z). Every preset is deterministic.

const corniche = {
  width: 30,
  lanes: 3,
  points: [
    [-6000, 15, 300], [-3000, 15, 360], [-1600, 16, 400], [-700, 17, 430], [200, 18, 420],
    [1100, 18, 400], [2000, 17, 330], [3200, 16, 230], [6000, 15, 120],
  ],
};
const bridge = {
  width: 28,
  lanes: 3,
  points: [[3600, 26, 2600], [2300, 32, 1900], [1300, 36, 1450], [300, 34, 1120], [-700, 28, 880], [-1500, 22, 650], [-2100, 17, 470], [-3200, 15, 380]],
};
const loop = {
  width: 18,
  lanes: 2,
  points: [[-260, 12, 380], [-80, 24, 300], [-60, 34, 160], [-240, 40, 60], [-480, 36, 120], [-560, 26, 280], [-420, 18, 400]],
};
const cityWest = {
  width: 26,
  lanes: 3,
  points: [[-5200, 26, -1100], [-3200, 28, -760], [-1700, 32, -380], [-950, 36, -40], [-560, 34, 230], [-120, 26, 360], [500, 19, 412]],
};
const cityEast = {
  width: 26,
  lanes: 3,
  points: [[5600, 26, -1500], [3400, 30, -980], [1900, 34, -560], [1050, 38, -180], [820, 32, 180], [1150, 20, 392]],
};
const ringNorth = {
  width: 30,
  lanes: 3,
  points: [[-5200, 30, -900], [-2600, 32, -1500], [-600, 34, -1750], [1400, 34, -1650], [3600, 32, -1150], [6000, 30, -600]],
};

const twilight = { sunDir: [-0.82, -0.05, -0.42], night: 0.0, cloud: 0.85, lit: 0.42, fogDensity: 0.00008, fogHeight: 220, exposure: 0.55 };
const blue = { sunDir: [-0.85, -0.12, -0.45], night: 0.45, cloud: 0.7, lit: 0.46, fogDensity: 0.00007, fogHeight: 180, exposure: 0.6 };
const night = { sunDir: [-0.85, -0.3, -0.45], night: 0.88, cloud: 0.5, lit: 0.7, fogDensity: 0.00007, fogHeight: 160, exposure: 0.9 };

export const PRESETS = {
  'hero-desktop': {
    ...twilight,
    camera: [900, 380, 2350],
    target: [-430, 130, -350],
    fov: 32,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.42, radius: 0.32, threshold: 1.4 },
  },
  'hero-mobile': {
    ...twilight,
    camera: [380, 140, 1650],
    target: [-30, 250, -230],
    fov: 46,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.42, radius: 0.32, threshold: 1.4 },
  },
  'night-desktop': {
    ...night,
    camera: [900, 380, 2350],
    target: [-430, 130, -350],
    fov: 32,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.42, radius: 0.32, threshold: 1.4 },
  },
  'night-mobile': {
    ...night,
    camera: [380, 140, 1650],
    target: [-30, 250, -230],
    fov: 46,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.42, radius: 0.32, threshold: 1.4 },
  },
  'movement-desktop': {
    ...blue,
    camera: [420, 300, 1150],
    target: [-360, 50, 170],
    fov: 42,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.42, radius: 0.32, threshold: 1.4 },
  },
  'movement-mobile': {
    ...blue,
    camera: [200, 330, 1050],
    target: [-300, 60, 200],
    fov: 58,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.42, radius: 0.32, threshold: 1.4 },
  },
  'enter-desktop': {
    ...blue,
    camera: [430, 150, 520],
    target: [-60, 360, -210],
    fov: 38,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.5, radius: 0.35, threshold: 1.3 },
  },
  'enter-mobile': {
    ...blue,
    camera: [300, 130, 420],
    target: [-20, 330, -200],
    fov: 56,
    highways: [corniche, bridge, loop, ringNorth, cityWest, cityEast],
    bloom: { strength: 0.5, radius: 0.35, threshold: 1.3 },
  },
};
