# Globe handoff — Kalent

You own `web/src/components/GlobeIntro.tsx`. Here's what's already working and what to polish.

## What works out of the box

- ✅ Three.js scene with PerspectiveCamera, WebGLRenderer, lighting
- ✅ Sphere geometry with NASA Blue Marble texture (auto-loads from CDN)
- ✅ Atmospheric glow via custom shader (additive blending, back-side rendering)
- ✅ 6 country pins at correct lat/lng, rendered as 3D spheres
- ✅ Vietnam pin is red, others gray
- ✅ Auto-rotation, stops on user touch
- ✅ HTML labels overlaid on canvas (better than sprites)
- ✅ Pin labels hide when rotated to the back of globe
- ✅ Click handler via raycasting — clicking Vietnam triggers zoom + handoff
- ✅ Pixel ratio capped at 2 for mobile perf
- ✅ Resize handler
- ✅ Loading state while texture downloads
- ✅ Skip button

## Polish checkpoints

Test after each step. **If anything breaks, git revert and ship the previous step.**

### Checkpoint 1 (1 hr) — better texture
The default NASA Blue Marble looks dated. Options:
- High-res NASA Black Marble (night lights): `https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg`
- Stylized: Mapbox satellite tiles stitched to equirectangular projection (complex)
- Custom-rendered: pre-render a stylized PNG in Figma (1024x512), drop in `web/public/earth.jpg`, reference as `/earth.jpg`

Just swap `EARTH_TEXTURE_URL` at the top of the file.

### Checkpoint 2 (2 hrs) — cloud layer
Add a second sphere slightly larger (radius * 1.005) with a cloud alpha texture, rotating at a different speed. Free texture: `https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png` (water mask). Or generate your own.

```ts
const cloudsGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.005, 64, 64)
const cloudsTex = loader.load('cloud-texture-url')
const cloudsMat = new THREE.MeshPhongMaterial({
  map: cloudsTex,
  transparent: true,
  opacity: 0.4,
})
const clouds = new THREE.Mesh(cloudsGeo, cloudsMat)
scene.add(clouds)
// Inside animate(): clouds.rotation.y += 0.0008
```

### Checkpoint 3 (1 hr) — pin pulse for Vietnam
The Vietnam pin should pulse. Two options:
- Cheap: scale the pin mesh up/down with `Math.sin(performance.now() * 0.003)`
- Pretty: add a ring sprite that scales and fades. See `THREE.Sprite` + `SpriteMaterial`.

### Checkpoint 4 (1 hr) — better drag controls
Right now the auto-rotation just stops on touch. Add OrbitControls so the user can spin the globe themselves:

```ts
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableZoom = false
controls.enablePan = false
controls.rotateSpeed = 0.4
controls.dampingFactor = 0.05
controls.enableDamping = true
// Inside animate(): controls.update()
```

### Checkpoint 5 (2 hrs) — bloom post-processing
Use `EffectComposer` + `UnrealBloomPass` for the glow. Optional, looks great on desktop, expensive on mobile.

### Checkpoint 6 (1 hr) — country borders
Overlay GeoJSON country outlines on the sphere. Free borders dataset: `https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson`. Use `THREE.Line` with great-circle interpolation between coordinate pairs. This makes country selection feel grounded.

## Mobile testing — DO THIS DAY 1

iPhone Safari is the biggest risk. Order of operations:

1. Get `npm run dev` working on your Mac (you've done this).
2. Find your Mac's local IP: `ipconfig getifaddr en0`.
3. On your iPhone, same WiFi: open `http://<your-mac-ip>:5173`.
4. Watch the globe. Stutter? Crash? Black screen?

If it's bad, three escape hatches in order of preference:

- **Lower polygon count**: change `SphereGeometry(GLOBE_RADIUS, 64, 64)` to `SphereGeometry(GLOBE_RADIUS, 32, 32)`. Halves the triangles.
- **Disable atmosphere shader on mobile**: detect mobile, skip the atmosphere mesh.
- **Skip globe entirely on mobile**: detect via `window.matchMedia('(max-width: 768px)').matches`, fall back to `NetworkIntro` only.

## Hard stop — Thursday noon

If by Thursday May 14 noon the globe isn't at "I'd ship this," **revert to NetworkIntro-only**. Don't sink Friday into perfectionism. The submission is more important than the globe.

Ethan owns this call. Show him whatever you have at Thursday noon standup.
