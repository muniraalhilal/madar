import * as THREE from 'three';
import { FOG, NOISE, SKY } from './glsl.js';

export function sharedUniforms(preset) {
  return {
    uSunDir: { value: new THREE.Vector3(...preset.sunDir).normalize() },
    uNight: { value: preset.night },
    uCloud: { value: preset.cloud ?? 0.8 },
    uTime: { value: preset.time ?? 0 },
    uFogDensity: { value: preset.fogDensity ?? 0.00016 },
    uFogHeight: { value: preset.fogHeight ?? 260 },
    uLit: { value: preset.lit ?? 0.42 },
    uExposureBoost: { value: 1 },
  };
}

export function skyMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      varying vec3 vDir;
      void main(){ gl_FragColor = vec4(skyColor(vDir), 1.0); }`,
  });
}

/**
 * Curtain-wall facade. Each fragment works out which floor and bay it belongs to
 * in world metres, then composes: sky reflection (with per-panel tilt, the
 * "oil-canning" that makes real glass read as glass), interior light behind the
 * glass (whole floors tend to be lit together, as in real offices), mullions and
 * spandrel bands. Pattern detail fades to its average once it falls below a pixel,
 * so distant towers stay clean at any resolution instead of shimmering.
 */
export function facadeMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute vec4 aStyle;   // floorH, bayW, tint, litScale
      attribute float aBase;
      attribute float aKind;   // 0 glass tower, 1 stone/residential, 2 podium/retail
      varying vec3 vWorld; varying vec3 vNormalW; varying float vSeed; varying vec4 vStyle; varying float vBase; varying float vKind;
      void main(){
        vec4 w = modelMatrix * vec4(position,1.0);
        vWorld = w.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
        vSeed = aSeed; vStyle = aStyle; vBase = aBase; vKind = aKind;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      ${FOG}
      uniform float uLit;
      varying vec3 vWorld; varying vec3 vNormalW; varying float vSeed; varying vec4 vStyle; varying float vBase; varying float vKind;

      vec3 warmLight(float r){ return mix(vec3(1.0,0.74,0.46), vec3(1.0,0.86,0.66), r); }
      vec3 coolLight(float r){ return mix(vec3(0.80,0.88,1.0), vec3(0.93,0.95,1.0), r); }

      void main(){
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorld);
        float hRel = vWorld.y - vBase;
        vec3 col;
        if (N.y > 0.6) {
          // roofs: dark membrane with plant boxes catching sky
          float n = vnoise(vWorld.xz*0.15 + vSeed*10.0);
          col = mix(vec3(0.006,0.006,0.010), vec3(0.016,0.014,0.022), n) + skyColor(vec3(0.0,1.0,0.0))*0.03;
        } else if (N.y < -0.6) {
          col = vec3(0.004,0.004,0.007);
        } else {
          vec3 T = normalize(vec3(-N.z, 0.0, N.x));
          float u = dot(vWorld.xz, T.xz);
          float floorH = vStyle.x, bayW = vStyle.y;
          vec2 g = vec2(u / bayW, hRel / floorH);
          vec2 cell = floor(g);
          vec2 f = fract(g);
          vec2 fw = fwidth(g);
          float detail = 1.0 - smoothstep(0.35, 0.9, max(fw.x, fw.y)); // 0 when sub-pixel

          float kind = vKind;
          bool stone = kind > 0.5 && kind < 1.5;
          bool white = kind > 2.5; // silver-white architectural fins (brand landmarks)
          float mullW = stone ? 0.16 : white ? 0.24 : 0.06;
          float spand = stone ? 0.34 : white ? 0.26 : 0.20;
          // mullion & spandrel masks with analytic AA
          float mx = smoothstep(mullW*0.5 - fw.x, mullW*0.5 + fw.x, f.x) * (1.0 - smoothstep(1.0 - mullW*0.5 - fw.x, 1.0 - mullW*0.5 + fw.x, f.x));
          float my = smoothstep(spand - fw.y, spand + fw.y, f.y) * (1.0 - smoothstep(0.97 - fw.y, 0.97 + fw.y, f.y));
          float glass = mix(stone ? 0.45 : white ? 0.55 : 0.72, mx*my, detail);

          // per-panel tilt → reflections break up like real glazing
          vec2 tilt = (hash22(cell + vSeed*31.7) - 0.5) * 0.06 * detail;
          vec3 Np = normalize(N + T*tilt.x + vec3(0.0, tilt.y, 0.0));
          vec3 R = reflect(-V, Np);
          R.y = abs(R.y) * 0.8 + 0.07; // ground bounce reads as dim lower sky
          vec3 refl = skyColor(R);
          float cosT = clamp(dot(Np, V), 0.0, 1.0);
          float fres = 0.10 + 0.90*pow(1.0 - cosT, 5.0); // coated architectural glass
          vec3 tint = mix(vec3(0.20,0.24,0.34), vec3(0.30,0.26,0.36), vStyle.z);
          if (stone) tint = vec3(0.32,0.28,0.30);

          // interior light: floors are switched on in clusters; individual windows vary
          float floorOn = hash12(vec2(cell.y, vSeed*7.3 + floor(cell.x/7.0)));
          float winOn = hash12(cell + vSeed*13.1);
          float litP = min(uLit * vStyle.w, 0.78);
          float lit = step(floorOn, litP*1.15) * step(0.25, winOn) + step(winOn, litP*0.25);
          lit = clamp(lit, 0.0, 1.0);
          float warmth = hash12(cell.yy + vSeed);
          vec3 lightCol = (stone || warmth > 0.4) ? warmLight(winOn) : coolLight(winOn);
          if (white && warmth > 0.3) lightCol = mix(coolLight(winOn), vec3(0.78,0.70,1.0), 0.5);
          float inten = (0.35 + 0.95*pow(hash12(cell*1.7+vSeed), 1.5)) * lit;
          // fake interior depth: brighter toward the ceiling, darker at sill
          inten *= mix(0.55, 1.15, smoothstep(0.25, 0.95, f.y));
          vec3 interior = lightCol * inten;
          // sub-pixel: replace pattern by its average luminance
          vec3 avgInterior = vec3(1.0,0.76,0.52) * litP * mix(0.11, 0.09, uNight);
          // at a distance, lit floors still read as patches and bands, not an even wash
          vec2 coarse = floor(g / vec2(5.0, 3.0));
          float patchy = 0.15 + 1.7 * pow(hash12(coarse + vSeed*3.7), 1.6);
          interior = mix(avgInterior * patchy, interior, detail);

          vec3 glassCol = tint*tint*0.05 + refl*fres + interior*(1.0 - fres)*0.9;
          vec3 frame = stone ? vec3(0.030,0.024,0.028) : vec3(0.006,0.006,0.010);
          if (white) frame = vec3(0.045,0.043,0.062) + refl*0.24 + vec3(0.55,0.45,1.0)*0.04*exp(-hRel/160.0);
          frame += refl*0.07 + vec3(1.0,0.65,0.45)*0.008*(1.0 - uNight);
          col = mix(frame, glassCol, glass);

          // faces turned toward the afterglow are brighter than those in the earth's shadow
          float toward = dot(N.xz, normalize(uSunDir.xz)) * 0.5 + 0.5;
          col *= mix(0.78, 1.12, toward);
          // sunset rim on west-facing facades
          float rim = max(dot(N, normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
          col += vec3(1.0, 0.55, 0.35) * pow(rim, 2.0) * 0.035 * (1.0 - uNight);
          // street-level bounce and contact darkening
          col += vec3(1.0, 0.70, 0.45) * exp(-hRel/14.0) * 0.04;
          col *= mix(0.55, 1.0, smoothstep(0.0, 18.0, hRel));
        }
        col = applyFog(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }`,
    extensions: { derivatives: true },
  });
}

/**
 * Night ground: dark urban fabric with street lighting drawn analytically on
 * several rotated grids (each district has its own orientation), plus
 * pools of light at intersections.
 */
export function groundMaterial(uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uWaterZ: { value: extra.waterZ ?? 1e9 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      ${FOG}
      uniform float uWaterZ;
      varying vec3 vWorld;
      float gridLines(vec2 p, float spacing, float width){
        vec2 g = p / spacing;
        vec2 f = abs(fract(g) - 0.5);
        vec2 fw = fwidth(g);
        vec2 l = 1.0 - smoothstep(width/spacing*0.5 - fw, width/spacing*0.5 + fw, 0.5 - f);
        float m = max(l.x, l.y);
        float aa = 1.0 - smoothstep(0.2, 0.6, max(fw.x, fw.y));
        return mix(width/spacing*1.6, m, aa);
      }
      mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
      void main(){
        vec2 p = vWorld.xz;
        float d = length(p);
        float n = fbm(p*0.004);
        vec3 col = mix(vec3(0.004,0.004,0.008), vec3(0.010,0.009,0.014), n);
        // districts with different grid orientations
        float a = floor(fbm(p*0.0004 + 3.0)*4.0) * 0.39;
        vec2 q = rot(a) * p;
        float spacing = mix(95.0, 160.0, hash12(floor(p/900.0)));
        float streets = gridLines(q, spacing, 14.0);
        float avenues = gridLines(q + 37.0, spacing*4.0, 30.0);
        float lightNoise = 0.6 + 0.4*vnoise(p*0.05);
        vec3 sodium = vec3(1.0, 0.62, 0.32);
        vec3 led = vec3(0.92, 0.88, 1.0);
        col += sodium * streets * 0.10 * lightNoise + led * avenues * 0.07;
        // intersection pools
        vec2 cellp = fract(q/spacing) - 0.5;
        col += sodium * smoothstep(0.12, 0.0, length(cellp)) * 0.03;
        // the city thins out with distance from the core
        float urban = 1.0 - smoothstep(5500.0, 9000.0, d);
        col *= mix(0.25, 1.0, urban);
        col = applyFog(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }`,
    extensions: { derivatives: true },
  });
}

/** Elevated highway deck and parapets: concrete catching city glow + an LED strip. */
export function concreteMaterial(uniforms, ledColor = new THREE.Color('#9b8cff')) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uLed: { value: ledColor } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aLed;
      varying vec3 vWorld; varying vec3 vN; varying float vLed;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vLed = aLed; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      ${FOG}
      uniform vec3 uLed;
      varying vec3 vWorld; varying vec3 vN; varying float vLed;
      void main(){
        vec3 N = normalize(vN);
        vec3 base = vec3(0.018,0.016,0.024);
        vec3 col = base * (0.5 + 0.5*max(N.y,0.0)) + skyColor(N)*0.05;
        col += vec3(1.0,0.6,0.35) * 0.02 * max(-N.y, 0.0); // street glow on undersides
        col += uLed * vLed * 2.6;
        col = applyFog(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Long-exposure light trails: additive streaks along the lanes. */
export function trailMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec2 aDirGain; attribute float aU; attribute float aSeed; attribute float aAcross;
      varying vec3 vTrailCol; varying float vU; varying float vSeed; varying float vAcross; varying vec3 vWorld; varying float vDir;
      void main(){ vDir = aDirGain.x; vTrailCol = (aDirGain.x < 0.5 ? vec3(0.92, 0.90, 1.0) : vec3(0.72, 0.60, 1.0)) * aDirGain.y; /* brand: white and lavender light */ vU=aU; vSeed=aSeed; vAcross=aAcross; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      ${FOG}
      varying vec3 vTrailCol; varying float vU; varying float vSeed; varying float vAcross; varying vec3 vWorld; varying float vDir;
      void main(){
        // platoons flow along the lane over time (opposite directions per carriageway)
        float u = vU + uTime * 26.0 * (vDir < 0.5 ? -1.0 : 1.0);
        // streak density: continuous bright runs with occasional gaps (traffic platoons)
        float s = vnoise(vec2(u*0.035, vSeed*13.0));
        float s2 = vnoise(vec2(u*0.31, vSeed*7.0));
        float intensity = smoothstep(0.12, 0.5, s) * (0.6 + 0.4*s2);
        float a = vAcross*1.6; float core = exp(-a*a); // pow() is undefined for negative bases
        // long exposures saturate: trails are far brighter than anything else in the frame
        vec3 c = vTrailCol * intensity * (0.2 + 2.0*core) * 3.0;
        vec3 fogged = applyFog(c, vWorld);
        // keep emissive energy but let the haze tint it
        c = mix(c, fogged, 0.35) * (1.0 - smoothstep(4500.0, 9000.0, length(vWorld - cameraPosition)));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function emissiveMaterial(uniforms, color, strength = 3) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      ${FOG}
      uniform vec3 uColor; uniform float uStrength; varying vec3 vWorld;
      void main(){ vec3 c = uColor*uStrength; c = mix(c, applyFog(c, vWorld), 0.5); gl_FragColor = vec4(c,1.0); }`,
  });
}
