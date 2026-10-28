import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { buildCity, buildHighway, rng } from './city.js';
import { NOISE, SKY } from './glsl.js';
import { concreteMaterial, emissiveMaterial, facadeMaterial, groundMaterial, sharedUniforms, skyMaterial, trailMaterial } from './materials.js';
import { PRESETS } from './presets.js';

const WATER_Z = 470;

function waterShader(uniforms) {
  return {
    name: 'MadarWater',
    uniforms: {
      color: { value: new THREE.Color(0x7f7f7f) },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      ...uniforms,
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv; varying vec3 vWorld;
      void main(){ vUv = textureMatrix * vec4(position,1.0); vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      ${SKY}
      uniform sampler2D tDiffuse;
      varying vec4 vUv; varying vec3 vWorld;
      void main(){
        vec2 p = vWorld.xz;
        float dist = length(vWorld - cameraPosition);
        // two scales of swell; anisotropic so reflections streak vertically
        vec2 n1 = vec2(fbm(p*vec2(0.020,0.080) + uTime*0.02), fbm(p*vec2(0.020,0.080) + 5.3)) - 0.5;
        vec2 n2 = vec2(vnoise(p*vec2(0.11,0.45)), vnoise(p*vec2(0.11,0.45)+9.1)) - 0.5;
        vec2 n = n1*0.9 + n2*0.35;
        float fade = 1.0 - smoothstep(600.0, 5000.0, dist);
        vec4 uv = vUv;
        uv.xy += vec2(n.x*0.45, n.y*2.4) * mix(1.4, 5.0, fade);
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vec3(n.x*0.35, 1.0, n.y*0.35));
        float fres = 0.02 + 0.98*pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // sparkle: tiny wave facets catching the bright horizon
        float glint = pow(max(vnoise(p*vec2(0.9, 3.5)) - 0.55, 0.0)*2.2, 3.0) * (1.0 - fade*0.5);
        vec3 deep = mix(vec3(0.006,0.007,0.016), vec3(0.002,0.003,0.008), uNight);
        vec3 col = deep + refl*(0.10 + 0.90*fres)*1.1 + skyColor(vec3(0.0, 0.05, -1.0))*glint*0.25;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 }, uGrain: { value: 0.025 }, uSeed: { value: 1.0 }, uLift: { value: new THREE.Vector3(0.010, 0.008, 0.022) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uGrain; uniform float uSeed; uniform vec3 uLift;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed)*43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - uVignette*smoothstep(0.25, 0.85, dot(d*vec2(1.0, 1.2), d*vec2(1.0,1.2))*1.6);
      c.rgb *= v;
      // gentle S-curve + saturation, then lifted indigo blacks
      vec3 l = vec3(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
      c.rgb = mix(l, c.rgb, 1.12);
      c.rgb = clamp(c.rgb, 0.0, 1.0);
      c.rgb = c.rgb*c.rgb*(3.0 - 2.0*c.rgb)*0.35 + c.rgb*0.65;
      c.rgb += uLift;
      c.rgb += (h(gl_FragCoord.xy) - 0.5) * uGrain * (0.4 + c.rgb);
      gl_FragColor = c;
    }`,
};

export async function render(presetName, width, height, supersample = 1) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset ${presetName}`);
  const W = Math.round(width * supersample);
  const H = Math.round(height * supersample);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.exposure ?? 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const uniforms = sharedUniforms(preset);
  const camera = new THREE.PerspectiveCamera(preset.fov, W / H, 2, 30000);
  camera.position.set(...preset.camera);
  camera.lookAt(new THREE.Vector3(...preset.target));
  if (preset.roll) camera.rotateZ(preset.roll);
  if (preset.shift) camera.setViewOffset(W, H, preset.shift[0] * W, preset.shift[1] * H, W, H);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 64, 32), skyMaterial(uniforms));
  scene.add(sky);

  const highwayCurves = preset.highways.map((h) => new THREE.CatmullRomCurve3(h.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal'));
  const corridors = highwayCurves.map((c) => c.getSpacedPoints(400).map((p) => [p.x, p.z]));
  const city = buildCity({ seed: preset.citySeed ?? 2026, corridors });
  scene.add(new THREE.Mesh(city.buildings, facadeMaterial(uniforms)));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 20000).rotateX(-Math.PI / 2).translate(0, 0, WATER_Z - 10000), groundMaterial(uniforms, { waterZ: WATER_Z }));
  scene.add(ground);

  // promenade edge + shoreline lights
  const shore = [];
  const R = rng(77);
  for (let x = -6000; x <= 6000; x += 14) {
    const z = WATER_Z - 6 + Math.sin(x * 0.0011) * 18;
    if (R.next() < 0.85) shore.push(new THREE.Vector3(x, 4.5, z));
  }
  const lampGeo = new THREE.SphereGeometry(0.6, 8, 6);
  const lamps = new THREE.InstancedMesh(lampGeo, emissiveMaterial(uniforms, '#ffd3a0', 6), shore.length);
  shore.forEach((p, i) => lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  scene.add(lamps);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(12000, 3, 14).translate(0, 1.0, WATER_Z), emissiveMaterial(uniforms, '#191726', 1));
  scene.add(quay);

  // highways
  const deckMat = concreteMaterial(uniforms);
  const trailMat = trailMaterial(uniforms);
  for (const [i, ctrl] of preset.highways.entries()) {
    const curve = highwayCurves[i];
    const hw = buildHighway(curve, { width: ctrl.width ?? 26, lanesPerDir: ctrl.lanes ?? 3, segments: ctrl.segments ?? 700, seed: i + 1 });
    scene.add(new THREE.Mesh(hw.deck, deckMat));
    scene.add(new THREE.Mesh(hw.trails, trailMat));
  }

  // emissive details: aviation lights, crown rings, spires
  const red = city.emissive.red;
  const redMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), emissiveMaterial(uniforms, '#ff2a2a', preset.redStrength ?? 9), red.length);
  red.forEach((p, i) => redMesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(p.r, p.r, p.r))));
  scene.add(redMesh);
  const ringMat = { lavender: emissiveMaterial(uniforms, '#a99bff', 7), warm: emissiveMaterial(uniforms, '#ffc89a', 4), white: emissiveMaterial(uniforms, '#e9e6ff', 3) };
  for (const key of ['lavender', 'warm', 'white']) {
    for (const e of city.emissive[key]) {
      let geo;
      if (e.type === 'torus') geo = new THREE.TorusGeometry(e.r, e.tube, 12, 160);
      else if (e.type === 'spire') geo = new THREE.CylinderGeometry(0.2, e.r, e.h, 12).translate(0, e.h / 2, 0);
      else if (e.type === 'box') geo = new THREE.BoxGeometry(e.w + 0.6, e.h, e.d + 0.6).rotateY(e.rot ?? 0);
      else continue;
      const m = new THREE.Mesh(geo, ringMat[key]);
      m.position.set(e.x, e.y, e.z);
      if (e.tilt) m.rotation.set(Math.PI / 2 + e.tilt[0], e.tilt[1], e.tilt[2]);
      if (e.type === 'spire' || e.type === 'box') m.rotation.set(0, 0, 0);
      scene.add(m);
    }
  }

  let placeOrb = () => {};
  // brand orbit ring + orb (an art-directed light sculpture, not a physical structure)
  const ob = city.emissive.orbit;
  if (ob && preset.orbit !== false) {
    const ringMatO = new THREE.ShaderMaterial({
      uniforms: { ...uniforms },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){
        float a = vUv.x; // around the ring
        float across = abs(vUv.y - 0.5)*2.0;
        float core = exp(-across*across*14.0);
        float fade = 0.35 + 0.65*smoothstep(0.0, 0.45, a)*smoothstep(1.0, 0.62, a);
        vec3 c = mix(vec3(0.60,0.52,1.0), vec3(0.92,0.88,1.0), core) * (core*2.6 + 0.25) * fade;
        gl_FragColor = vec4(c, 1.0);
      }`,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ob.r, ob.tube, 16, 512), ringMatO);
    ring.position.set(ob.x, ob.y, ob.z);
    ring.rotation.set(Math.PI / 2 + ob.tilt[0], ob.tilt[1], ob.tilt[2]);
    scene.add(ring);
    const t = ob.orb * Math.PI * 2;
    const local = new THREE.Vector3(Math.cos(t) * ob.r, Math.sin(t) * ob.r, 0).applyEuler(ring.rotation).add(ring.position);
    placeOrb = (u) => {
      const a = u * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * ob.r, Math.sin(a) * ob.r, 0).applyEuler(ring.rotation).add(ring.position);
      orb.position.copy(p);
      halo.position.copy(p);
    };
    const orb = new THREE.Mesh(new THREE.SphereGeometry(16, 48, 32), emissiveMaterial(uniforms, '#d9d0ff', 5));
    orb.position.copy(local);
    scene.add(orb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 24), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(dot(vN, vV),0.0), 2.5); gl_FragColor = vec4(vec3(0.55,0.48,1.0)*f*1.6, 1.0); }`,
    }));
    halo.position.copy(local);
    // The halo is a screen-space glow: keep it (and the orb) out of the planar reflection,
    // where its view-dependent falloff renders as a hard square.
    orb.layers.set(1);
    halo.layers.set(1);
    camera.layers.enable(1);
    scene.add(halo);
  }

  // water (planar reflection)
  const water = new Reflector(new THREE.PlaneGeometry(40000, 12000), {
    textureWidth: Math.round(W * 0.75),
    textureHeight: Math.round(H * 0.75),
    clipBias: 0.002,
    shader: waterShader(uniforms),
    multisample: 4,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.2, WATER_Z + 6000);
  scene.add(water);

  // post
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), preset.bloom?.strength ?? 0.55, preset.bloom?.radius ?? 0.6, preset.bloom?.threshold ?? 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uVignette.value = preset.vignette ?? 0.28;
  grade.uniforms.uGrain.value = (preset.grain ?? 0.02) / supersample;
  composer.addPass(grade);

  const gl = renderer.getContext();
  /** Renders one frame; used for stills and for scroll-scrubbed sequences. */
  const frame = (o = {}) => {
    if (o.camera) camera.position.set(...o.camera);
    camera.lookAt(new THREE.Vector3(...(o.target ?? preset.target)));
    if (o.orb !== undefined) placeOrb(o.orb);
    uniforms.uTime.value = o.time ?? 0;
    composer.render();
    gl.finish();
  };
  frame({});
  window.madarFrame = (o) => {
    frame(o);
    return true;
  };
  return { stats: city.stats, info: renderer.info.render };
}

window.madarRender = render;
