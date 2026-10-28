// Shared GLSL chunks for the MADAR offline renderer.

export const NOISE = /* glsl */ `
float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
`;

/**
 * Physically-inspired twilight sky. `uSunDir` sits just below the horizon; the
 * gradient runs peach → rose → lavender → indigo → midnight with a forward-scatter glow.
 */
export const SKY = /* glsl */ `
uniform vec3 uSunDir;
uniform float uNight;      // 0 = civil twilight, 1 = night
uniform float uCloud;      // cloud amount
uniform float uTime;
vec3 skyColorS(vec3 dir){
  dir = normalize(dir);
  float h = dir.y;
  float e = clamp(h, -0.2, 1.0);
  // vertical gradient stops
  // azimuth: towards the set sun the horizon burns peach; opposite, the earth's
  // shadow sits under a rose band (the "belt of Venus").
  vec2 dh = normalize(dir.xz + 1e-5);
  float sunward = smoothstep(-0.2, 1.0, dot(dh, normalize(uSunDir.xz)));
  vec3 horizon = mix(mix(vec3(0.62, 0.55, 0.78), vec3(1.00, 0.74, 0.62), sunward), vec3(0.30, 0.24, 0.44), uNight);
  vec3 low     = mix(mix(vec3(0.80, 0.66, 0.82), vec3(0.94, 0.70, 0.72), sunward), vec3(0.17, 0.13, 0.30), uNight);
  vec3 mid     = mix(vec3(0.66, 0.60, 0.90), vec3(0.09, 0.08, 0.20), uNight);
  vec3 high    = mix(vec3(0.36, 0.33, 0.62), vec3(0.04, 0.04, 0.10), uNight);
  vec3 zenith  = mix(vec3(0.13, 0.13, 0.30), vec3(0.018,0.02, 0.055), uNight);
  vec3 c = mix(horizon, low, smoothstep(0.0, 0.05, e));
  c = mix(c, mid, smoothstep(0.04, 0.16, e));
  c = mix(c, high, smoothstep(0.14, 0.42, e));
  c = mix(c, zenith, smoothstep(0.40, 0.95, e));
  // forward scattering around the (set) sun
  float sd = max(dot(normalize(vec3(dir.x, max(dir.y,0.0)*0.6, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  float glow = pow(sd, 6.0) * exp(-max(h,0.0)*9.0);
  c += vec3(1.0, 0.55, 0.32) * glow * mix(0.55, 0.12, uNight);
  c += vec3(1.0, 0.75, 0.55) * pow(sd, 60.0) * exp(-max(h,0.0)*30.0) * mix(0.6, 0.05, uNight);
  // below horizon: haze
  if (h < 0.0) c = mix(c, horizon*0.55, smoothstep(0.0, -0.08, h));
  // clouds: thin stratus bands lit from below at the horizon side
  if (h > 0.0 && uCloud > 0.0) {
    vec2 uv = dir.xz / (h + 0.06) * 0.55;
    float n = fbm(uv*vec2(0.55, 2.2) + vec2(uTime*0.01, 0.0));
    float n2 = fbm(uv*vec2(1.4, 4.0) + 7.3);
    float band = smoothstep(0.52, 0.80, n) * (0.55 + 0.45*n2);
    band *= smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.55, 0.9, h));
    // high wispy cirrus catching the last light
    float ci = fbm(uv*vec2(0.22, 1.6) + vec2(3.1, 1.7));
    band = max(band, smoothstep(0.58, 0.82, ci) * smoothstep(0.08, 0.25, h) * (1.0 - smoothstep(0.6, 0.95, h)) * 0.7);
    vec3 lit = mix(vec3(1.0, 0.70, 0.58), vec3(0.62, 0.50, 0.78), smoothstep(0.02, 0.3, h));
    lit = mix(lit, vec3(0.16, 0.13, 0.26), uNight*0.85);
    vec3 shade = mix(vec3(0.40, 0.30, 0.48), vec3(0.06, 0.06, 0.12), uNight);
    vec3 cloudCol = mix(shade, lit, pow(sd, 1.5)*0.75 + 0.25*n2);
    c = mix(c, cloudCol, band * uCloud * 0.85);
  }
  // stars at night
  if (uNight > 0.0 && h > 0.08) {
    vec2 sp = dir.xz / (h+0.2) * 420.0;
    vec2 cell = floor(sp);
    float r = hash12(cell);
    vec2 f = fract(sp) - 0.5 - (hash22(cell)-0.5)*0.6;
    float star = step(0.9965, r) * smoothstep(0.08, 0.0, length(f)) * (0.4 + 0.6*hash12(cell+3.1));
    c += vec3(0.85, 0.88, 1.0) * star * uNight * smoothstep(0.08, 0.4, h) * 1.4;
  }
  return c;
}
// Gradient stops are authored in sRGB; the renderer works in linear light.
vec3 skyColor(vec3 dir){ return pow(max(skyColorS(dir), 0.0), vec3(2.2)); }
`;

/** Aerial perspective: distant geometry dissolves into the horizon colour. */
export const FOG = /* glsl */ `
uniform float uFogDensity;
uniform float uFogHeight;
vec3 applyFog(vec3 col, vec3 worldPos){
  vec3 d = worldPos - cameraPosition;
  float dist = length(d);
  float heightFactor = exp(-max(worldPos.y, 0.0) / uFogHeight);
  float k = dist * uFogDensity * (0.3 + 0.7*heightFactor);
  float f = 1.0 - exp(-k*k*0.5 - k*0.5);
  // near: dim lavender in-scatter; far: converges on the true horizon colour so
  // the ground melts into the sky with no visible edge.
  vec3 dirH = normalize(vec3(d.x, 0.0, d.z));
  vec3 nearCol = skyColor(normalize(dirH + vec3(0.0, 0.16, 0.0))) * 0.40;
  vec3 farCol = skyColor(normalize(dirH + vec3(0.0, 0.004, 0.0)));
  vec3 fogCol = mix(nearCol, farCol, smoothstep(3500.0, 14000.0, dist));
  return mix(col, fogCol, clamp(f, 0.0, 1.0));
}
`;
