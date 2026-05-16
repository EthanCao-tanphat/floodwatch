import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { LandingScreen } from './LandingScreen'

interface Props {
  onContinue: () => void
}

type Pin = {
  id: string
  lat: number
  lng: number
  kind: 'primary' | 'secondary'
}

const EARTH_TEXTURE_URL = '/earth-night.jpg'
const GLOBE_RADIUS = 2.2
const BORDER_RADIUS = GLOBE_RADIUS * 1.008
const BORDER_OPACITY = 0.18
const PINS: Pin[] = [
  { id: 'vietnam', lat: 14.0583, lng: 108.2772, kind: 'primary' },
  { id: 'jakarta', lat: -6.2088, lng: 106.8456, kind: 'secondary' },
  { id: 'manila', lat: 14.5995, lng: 120.9842, kind: 'secondary' },
  { id: 'bangkok', lat: 13.7563, lng: 100.5018, kind: 'secondary' },
  { id: 'hanoi', lat: 21.0278, lng: 105.8342, kind: 'secondary' },
  { id: 'hcmc', lat: 10.8231, lng: 106.6297, kind: 'primary' },
]

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

function lonLatToVector3(lon: number, lat: number, radius: number) {
  return latLngToVector3(lat, lon, radius)
}

function interpolateGreatCircle(start: THREE.Vector3, end: THREE.Vector3, segments = 5) {
  const points: THREE.Vector3[] = []
  const a = start.clone().normalize()
  const b = end.clone().normalize()
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  const omega = Math.acos(dot)
  const sinOmega = Math.sin(omega)

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    let point: THREE.Vector3
    if (sinOmega < 1e-5) {
      point = a.clone().lerp(b, t).normalize()
    } else {
      const scaleA = Math.sin((1 - t) * omega) / sinOmega
      const scaleB = Math.sin(t * omega) / sinOmega
      point = a
        .clone()
        .multiplyScalar(scaleA)
        .add(b.clone().multiplyScalar(scaleB))
        .normalize()
    }
    point.multiplyScalar(start.length())
    points.push(point)
  }

  return points
}

function pushRingSegments(
  ring: number[][],
  positions: number[],
  radius: number,
  curveSegments = 5
) {
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[i + 1]
    if (Math.abs(lon2 - lon1) > 180) continue

    const start = lonLatToVector3(lon1, lat1, radius)
    const end = lonLatToVector3(lon2, lat2, radius)
    const curve = interpolateGreatCircle(start, end, curveSegments)

    for (let j = 0; j < curve.length - 1; j += 1) {
      const a = curve[j]
      const b = curve[j + 1]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
}

function buildBorderPositions(geojson: any, radius: number) {
  const positions: number[] = []
  const features = Array.isArray(geojson?.features) ? geojson.features : []

  for (const feature of features) {
    const geometry = feature?.geometry
    if (!geometry) continue

    if (geometry.type === 'Polygon') {
      for (const ring of geometry.coordinates as number[][][]) {
        pushRingSegments(ring, positions, radius)
      }
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates as number[][][][]) {
        for (const ring of polygon) {
          pushRingSegments(ring, positions, radius)
        }
      }
    }
  }

  return positions
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

function createFallbackEarthTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height)
  ocean.addColorStop(0, '#071526')
  ocean.addColorStop(0.45, '#0d3047')
  ocean.addColorStop(1, '#06101f')
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.12)'
  ctx.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 64) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }
  for (let y = 64; y < canvas.height; y += 64) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }

  const land = ctx.createLinearGradient(0, 120, 0, 410)
  land.addColorStop(0, '#315e55')
  land.addColorStop(1, '#122d2b')
  ctx.fillStyle = land
  ctx.shadowColor = 'rgba(20, 184, 166, 0.4)'
  ctx.shadowBlur = 18

  const blobs: Array<[number, number, number, number, number]> = [
    [520, 190, 150, 70, -0.2],
    [610, 255, 120, 95, 0.25],
    [690, 300, 58, 88, -0.18],
    [775, 330, 84, 58, 0.1],
    [255, 215, 120, 80, 0.1],
    [300, 315, 78, 110, -0.15],
    [430, 340, 72, 70, 0.2],
    [840, 210, 88, 54, -0.2],
  ]

  for (const [x, y, rx, ry, rotation] of blobs) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(248, 113, 113, 0.85)'
  ctx.beginPath()
  ctx.arc(820, 252, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    ctx.fillRect(x, y, 1, 1)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createPulseTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const gradient = ctx.createRadialGradient(128, 128, 42, 128, 128, 118)
  gradient.addColorStop(0, 'rgba(255, 77, 93, 0)')
  gradient.addColorStop(0.54, 'rgba(255, 77, 93, 0)')
  gradient.addColorStop(0.68, 'rgba(255, 110, 124, 0.84)')
  gradient.addColorStop(0.84, 'rgba(255, 77, 93, 0.28)')
  gradient.addColorStop(1, 'rgba(255, 77, 93, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function GlobeIntro({ onContinue }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !supportsWebGL()) {
      setFallback(true)
      return
    }

    let frame = 0
    let disposed = false
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const sphereSegments = isMobile ? 32 : 64
    let clouds: THREE.Mesh | null = null
    let cloudMaterial: THREE.ShaderMaterial | null = null
    let borderMaterial: THREE.LineBasicMaterial | null = null
    const clickTargets: THREE.Object3D[] = []

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x050914, 8, 16)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0.15, 7.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x050914, 1)
    container.appendChild(renderer.domElement)

    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)
    let bloomPass: UnrealBloomPass | null = null
    if (!isMobile) {
      bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.28, 0.96)
      composer.addPass(bloomPass)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableZoom = false
    controls.enablePan = false
    controls.rotateSpeed = 0.4
    controls.dampingFactor = 0.05
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.65
    controls.addEventListener('start', () => {
      controls.autoRotate = false
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const globeGroup = new THREE.Group()
    globeGroup.position.x = isMobile ? 0.7 : 1.56
    globeGroup.position.y = isMobile ? -0.08 : -0.02
    globeGroup.rotation.y = Math.PI
    scene.add(globeGroup)

    const ambient = new THREE.AmbientLight(0x87a9ff, 1.1)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(4, 2, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x38bdf8, 1.6)
    rim.position.set(-5, 1, -3)
    scene.add(rim)

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: createFallbackEarthTexture(),
      roughness: 0.82,
      metalness: 0.04,
    })
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, sphereSegments, sphereSegments),
      earthMaterial
    )
    globeGroup.add(earth)
    setLoaded(true)

    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        if (disposed) return
        texture.colorSpace = THREE.SRGBColorSpace
        earthMaterial.map = texture
        earthMaterial.needsUpdate = true
      },
      undefined,
      () => setLoaded(true)
    )

    fetch('/sea-borders.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`Border fetch failed: ${response.status}`)
        return response.json()
      })
      .then((geojson) => {
        if (disposed) return
        const positions = buildBorderPositions(geojson, BORDER_RADIUS)
        if (!positions.length) return

        const borderGeometry = new THREE.BufferGeometry()
        borderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        borderMaterial = new THREE.LineBasicMaterial({
          color: 0x5da9ff,
          transparent: true,
          opacity: 0,
          depthTest: true,
          depthWrite: false,
        })
        const borders = new THREE.LineSegments(borderGeometry, borderMaterial)
        globeGroup.add(borders)
      })
      .catch(() => {
        borderMaterial = null
      })

    cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: isMobile ? 0.14 : 0.18 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uOpacity;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);

          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));

          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            v += amp * noise(p);
            p *= 2.0;
            amp *= 0.5;
          }
          return v;
        }

        float makeClouds(vec2 uv) {
          float large = fbm(uv * 14.0);
          float detail = fbm(uv * 68.0);
          float cloud = large * detail;
          return smoothstep(0.4, 0.57, cloud);
        }

        void main() {
          vec2 cloudUv = vUv + vec2(uTime * 0.0075, 0.0);
          float clouds = makeClouds(cloudUv);
          vec3 cloudColor = vec3(0.85, 0.9, 1.0);
          gl_FragColor = vec4(cloudColor, clouds * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.005, sphereSegments, sphereSegments),
      cloudMaterial
    )
    clouds.rotation.y = 0.18
    globeGroup.add(clouds)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.045, sphereSegments, sphereSegments),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.78 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
            gl_FragColor = vec4(0.16, 0.62, 0.95, 0.82) * intensity;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      })
    )
    globeGroup.add(atmosphere)

    const pinMaterialPrimary = new THREE.MeshStandardMaterial({
      color: 0xff4d5d,
      emissive: new THREE.Color('#ff415f'),
      emissiveIntensity: 2.25,
      roughness: 0.28,
      metalness: 0.04,
    })
    const pinMaterialSecondary = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: new THREE.Color('#9fb0c8'),
      emissiveIntensity: 0.12,
      roughness: 0.4,
      metalness: 0.04,
    })
    const pulseTexture = createPulseTexture()
    const pulseSprites: Array<{ sprite: THREE.Sprite; phase: number }> = []

    for (const pin of PINS) {
      const pos = latLngToVector3(pin.lat, pin.lng, GLOBE_RADIUS + 0.04)
      const anchor = new THREE.Group()
      anchor.position.copy(pos)
      globeGroup.add(anchor)

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(pin.kind === 'primary' ? 0.055 : 0.04, 18, 18),
        pin.kind === 'primary' ? pinMaterialPrimary : pinMaterialSecondary
      )
      marker.userData.pinId = pin.id
      marker.userData.primary = pin.kind === 'primary'
      anchor.add(marker)
      clickTargets.push(marker)

      if (pin.id === 'vietnam' && pulseTexture) {
        for (const phase of [0, Math.PI * 0.55]) {
          const pulse = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: pulseTexture,
              color: 0xff5b6b,
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
          )
          pulse.scale.setScalar(0.34)
          pulse.position.set(0, 0, 0.01)
          marker.add(pulse)
          pulseSprites.push({ sprite: pulse, phase })
        }
      }
    }

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      composer.setSize(width, height)
      if (bloomPass) bloomPass.setSize(width, height)
    }

    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      if (clouds) clouds.rotation.y += 0.0008
      const time = performance.now() * 0.0036
      if (cloudMaterial) {
        cloudMaterial.uniforms.uTime.value = time
      }
      if (borderMaterial && borderMaterial.opacity < BORDER_OPACITY) {
        borderMaterial.opacity = Math.min(borderMaterial.opacity + 0.005, BORDER_OPACITY)
      }
      for (const { sprite, phase } of pulseSprites) {
        const pulsePhase = (Math.sin(time + phase) + 1) / 2
        sprite.scale.setScalar(0.26 + pulsePhase * 0.26)
        const material = sprite.material as THREE.SpriteMaterial
        material.opacity = 0.16 + (1 - pulsePhase) * 0.46
      }
      for (const target of clickTargets) {
        if (target.userData.pinId === 'vietnam') {
          const pulse = 1 + Math.sin(time) * 0.18
          target.scale.setScalar(pulse)
        } else if (target.userData.pinId === 'hcmc') {
          target.scale.setScalar(1)
        }
      }
      composer.render()
    }

    const handlePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(clickTargets, false)[0]
      if (hit?.object.userData.primary) onContinue()
    }

    resize()
    animate()
    window.addEventListener('resize', resize)
    renderer.domElement.addEventListener('pointerdown', handlePointer)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('pointerdown', handlePointer)
      controls.dispose()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose()
      })
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [onContinue])

  if (fallback) return <LandingScreen onContinue={onContinue} />

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#030712] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,rgba(14,165,233,0.08),transparent_30%),linear-gradient(180deg,#030712_0%,#040816_55%,#02040d_100%)]" />
      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-label="Interactive globe intro"
      />

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-400">loading earth data</div>
        </div>
      )}

      <div className="absolute left-6 top-6 sm:left-10 sm:top-10 max-w-sm">
        <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">FloodWatch HCMC</div>
        <h1 className="mt-3 text-3xl sm:text-5xl font-semibold leading-tight tracking-normal">
          Flood risk before it reaches your route.
        </h1>
        <p className="mt-4 text-sm sm:text-base leading-6 text-slate-300">
          Click a red pilot pin to enter the dashboard for motorbike passability forecasting.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="absolute right-5 top-5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 shadow-xl backdrop-blur transition hover:bg-white/20"
      >
        Skip
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-cyan-200/20 bg-slate-950/55 px-4 py-2 text-xs text-slate-300 backdrop-blur">
        Red pilot pins open the dashboard
      </div>
    </div>
  )
}
