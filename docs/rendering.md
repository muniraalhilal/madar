# Rendering the landing-page imagery

All images on the landing page are rendered from the fictional city by `tools/render` — a Three.js scene run in headless Chromium (WebGL2 via SwiftShader), so it works on a machine without a GPU.

What is in the scene: a procedurally generated metropolis (≈ 360 towers and 18,000 urban blocks), landmark towers with original designs (the twisting soft-triangle Madar Tower with its orbital crown, a faceted spire, sky-bridged twins, a curved slab), a physically-inspired twilight sky (azimuth-dependent afterglow, belt of Venus, stratus and cirrus), aerial perspective, a curtain-wall facade shader (per-panel reflections, floor-clustered interior lighting, sub-pixel filtering so distant towers don't shimmer), elevated highways with long-exposure light trails, a planar-reflection bay, bloom, ACES tone mapping and a final grade. Colours follow the MADAR palette.

```bash
cd tools/render
node render.mjs hero-desktop 3840 2160 1.5     # one still: native 4K, 1.5× supersampled
./render-all.sh                                # all stills (desktop 3840×2160, mobile 1440×3120)
node seq.mjs hero-desktop 1920 1080 90 out/seq/hero-desktop 1.25   # scroll-scrubbed flight
node export-media.mjs                          # responsive AVIF/WebP sets → apps/web/public/media
```

Desktop and mobile are separate camera compositions (not crops). Every published size is a downscale of the native render; nothing is upscaled. Presets live in `src/presets.js`, flights in `src/flights.js`.

To use licensed photography instead, drop files named like `hero-desktop-1920.avif/.webp` into `apps/web/public/media` (same names and widths) and update the `alt` text — no code changes are needed. Credit photographers in the footer and never present a photo of a real place as output of the simulation.
