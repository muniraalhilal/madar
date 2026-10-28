// Camera flights for scroll-scrubbed sequences: the camera descends from high
// above the bay to the hero framing while the orb travels along the orbit.
export const FLIGHTS = {
  'hero-desktop': {
    from: { camera: [2100, 1150, 4900], target: [-300, 60, -600] },
    to: { camera: [900, 380, 2350], target: [-430, 130, -350] },
    orb: [-0.06, 0.04],
    time: 8,
  },
  'hero-mobile': {
    from: { camera: [1000, 1250, 4200], target: [-40, 90, -400] },
    to: { camera: [380, 140, 1650], target: [-30, 250, -230] },
    orb: [-0.06, 0.04],
    time: 8,
  },
};
