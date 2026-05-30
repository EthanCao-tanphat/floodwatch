import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { LandingScreen } from './LandingScreen'
import { LangToggle } from './LangToggle'

interface Props {
  onContinue: () => void
}

type Pin = {
  id: string
  lat: number
  lng: number
  kind: 'primary' | 'secondary'
}

type DebugLine = {
  level: 'warn' | 'error'
  message: string
}

const EARTH_TEXTURE_URL = '/earth-night.jpg'
const GLOBE_RADIUS = 2.1
const HORIZONTAL_DRAG_SPEED = 0.006
const TAP_MOVE_THRESHOLD_PX = 8

const PINS: Pin[] = [
  { id: 'vietnam', lat: 14.0583, lng: 108.2772, kind: 'primary' },
  { id: 'hcmc', lat: 10.8231, lng: 106.6297, kind: 'primary' },
  { id: 'hanoi', lat: 21.0278, lng: 105.8342, kind: 'secondary' },
  { id: 'bangkok', lat: 13.7563, lng: 100.5018, kind: 'secondary' },
  { id: 'manila', lat: 14.5995, lng: 120.9842, kind: 'secondary' },
  { id: 'jakarta', lat: -6.2088, lng: 106.8456, kind: 'secondary' },
]

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

function createFallbackEarthTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height)
  ocean.addColorStop(0, '#071526')
  ocean.addColorStop(0.48, '#0b2a42')
  ocean.addColorStop(1, '#04101d')

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

  const land = ctx.createLinearGradient(0, 120, 0, 420)
  land.addColorStop(0, '#315e55')
  land.addColorStop(1, '#112d2b')

  ctx.fillStyle = land
  ctx.shadowColor = 'rgba(20, 184, 166, 0.35)'
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

  ctx.fillStyle = 'rgba(248, 113, 113, 0.9)'
  ctx.beginPath()
  ctx.arc(820, 252, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  for (let i = 0; i < 180; i += 1) {
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1)
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
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const zoomBoundsRef = useRef({ min: 6.2, max: 10.2 })

  const [fallback, setFallback] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [debugLines, setDebugLines] = useState<DebugLine[]>([])
  const [debugDetails, setDebugDetails] = useState('Waiting for globe renderer...')
  const [debugMode] = useState(() =>
    new URLSearchParams(window.location.search).has('debugGlobe')
  )

  function zoomGlobe(delta: number) {
    const camera = cameraRef.current
    const controls = controlsRef.current

    if (!camera || !controls) return

    const { min, max } = zoomBoundsRef.current
    const direction = camera.position.clone().sub(controls.target)
    const nextDistance = Math.min(max, Math.max(min, direction.length() + delta))

    direction.setLength(nextDistance)
    camera.position.copy(controls.target).add(direction)
    controls.update()
  }

  useEffect(() => {
    const container = containerRef.current

    if (!container) return

    if (!supportsWebGL()) {
      const message = '[GlobeIntro] WebGL is not available. Falling back.'
      console.error(message)
      setDebugLines([{ level: 'error', message }])
      setFallback(true)
      return
    }

    let frame = 0
    let disposed = false

    function pushDebug(level: 'warn' | 'error', message: string, extra?: unknown) {
      const suffix =
        extra instanceof Error
          ? `: ${extra.message}`
          : extra
            ? `: ${String(extra)}`
            : ''

      const fullMessage = `[GlobeIntro] ${message}${suffix}`

      if (level === 'error') console.error(fullMessage, extra)
      else console.warn(fullMessage, extra)

      if (!disposed) {
        setDebugLines((prev) => [...prev, { level, message: fullMessage }].slice(-6))
      }
    }

    console.info('[GlobeIntro] Mounting globe renderer')

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x263751, 10, 18)

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0.02, 8.2)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })

    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x263751, 1)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'

    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableZoom = false
    controls.enableRotate = false
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.rotateSpeed = 0.35
    controls.zoomSpeed = 0.7
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    controls.minPolarAngle = Math.PI / 2
    controls.maxPolarAngle = Math.PI / 2
    controls.minDistance = zoomBoundsRef.current.min
    controls.maxDistance = zoomBoundsRef.current.max
    controlsRef.current = controls

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const clickTargets: THREE.Object3D[] = []
    const activePointers = new Map<number, PointerEvent>()
    const dragState = {
      active: false,
      pointerId: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      moved: false,
      pinchDistance: 0,
    }

    const globeGroup = new THREE.Group()

    // This keeps Vietnam / Southeast Asia facing the camera on load.
    globeGroup.rotation.y = Math.PI

    scene.add(globeGroup)

    const ambient = new THREE.AmbientLight(0x9bb8ff, 1.2)
    scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(4, 2, 5)
    scene.add(key)

    const rim = new THREE.DirectionalLight(0x38bdf8, 1.9)
    rim.position.set(-5, 1.2, -3)
    scene.add(rim)

    const fallbackTexture = createFallbackEarthTexture()

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: fallbackTexture,
      roughness: 0.82,
      metalness: 0.04,
    })

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96),
      earthMaterial
    )

    globeGroup.add(earth)

    const textureLoader = new THREE.TextureLoader()

    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }

        console.info('[GlobeIntro] Earth texture loaded:', EARTH_TEXTURE_URL)

        texture.colorSpace = THREE.SRGBColorSpace
        earthMaterial.map?.dispose()
        earthMaterial.map = texture
        earthMaterial.needsUpdate = true
      },
      undefined,
      (error) => {
        pushDebug(
          'warn',
          `Could not load ${EARTH_TEXTURE_URL}; using generated fallback texture`,
          error
        )
      }
    )

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.05, 96, 96),
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
            float intensity = pow(0.78 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.45);
            gl_FragColor = vec4(0.16, 0.62, 0.95, 0.82) * intensity;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      })
    )

    globeGroup.add(atmosphere)

    const primaryPinMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4d5d,
      emissive: new THREE.Color('#ff415f'),
      emissiveIntensity: 2.4,
      roughness: 0.28,
      metalness: 0.04,
    })

    const secondaryPinMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: new THREE.Color('#9fb0c8'),
      emissiveIntensity: 0.18,
      roughness: 0.4,
      metalness: 0.04,
    })

    const pulseTexture = createPulseTexture()
    const pulseSprites: Array<{ sprite: THREE.Sprite; phase: number }> = []

    for (const pin of PINS) {
      const pos = latLngToVector3(pin.lat, pin.lng, GLOBE_RADIUS + 0.045)

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(pin.kind === 'primary' ? 0.06 : 0.04, 20, 20),
        pin.kind === 'primary' ? primaryPinMaterial : secondaryPinMaterial
      )

      marker.position.copy(pos)
      marker.userData.pinId = pin.id
      marker.userData.primary = pin.kind === 'primary'

      globeGroup.add(marker)
      clickTargets.push(marker)

      if (pin.kind === 'primary' && pulseTexture) {
        for (const phase of [0, Math.PI * 0.65]) {
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

          pulse.position.copy(pos.clone().multiplyScalar(1.004))
          pulse.scale.setScalar(0.34)

          globeGroup.add(pulse)
          pulseSprites.push({ sprite: pulse, phase })
        }
      }
    }

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight

      const mobile = width < 720
      const tablet = width >= 720 && width < 1120
      zoomBoundsRef.current = mobile
        ? { min: 6.2, max: 10.2 }
        : tablet
          ? { min: 5.9, max: 9.8 }
          : { min: 5.7, max: 9.4 }
      controls.minDistance = zoomBoundsRef.current.min
      controls.maxDistance = zoomBoundsRef.current.max

      camera.fov = mobile ? 40 : 34
      camera.aspect = width / Math.max(height, 1)

      camera.position.set(
        0,
        mobile ? 0.12 : 0.02,
        mobile ? 8.7 : tablet ? 8.4 : 8.2
      )

      camera.updateProjectionMatrix()

      const globeScale = mobile ? 0.68 : tablet ? 0.78 : 0.9

      globeGroup.scale.setScalar(globeScale)

      // Key fix: the globe is shifted right, but not far enough to get cropped.
      globeGroup.position.set(
        mobile ? 0 : tablet ? 0.72 : 1.25,
        mobile ? -0.82 : -0.05,
        0
      )

      controls.target.set(0, 0, 0)
      controls.update()

      renderer.setSize(width, height, false)

      const details = [
        `viewport: ${Math.round(width)}x${Math.round(height)}`,
        `camera.z: ${camera.position.z.toFixed(2)}`,
        `globe.scale: ${globeScale.toFixed(2)}`,
        `globe.x: ${globeGroup.position.x.toFixed(2)}`,
        `devicePixelRatio: ${(window.devicePixelRatio || 1).toFixed(2)}`,
      ].join(' | ')

      console.debug('[GlobeIntro] resize', details)

      if (!disposed) setDebugDetails(details)
    }

    const animate = () => {
      frame = requestAnimationFrame(animate)

      const time = performance.now() * 0.0036

      controls.update()

      for (const { sprite, phase } of pulseSprites) {
        const pulsePhase = (Math.sin(time + phase) + 1) / 2
        sprite.scale.setScalar(0.27 + pulsePhase * 0.28)

        const material = sprite.material as THREE.SpriteMaterial
        material.opacity = 0.14 + (1 - pulsePhase) * 0.48
      }

      for (const target of clickTargets) {
        if (target.userData.primary) {
          target.scale.setScalar(1 + Math.sin(time) * 0.12)
        }
      }

      renderer.render(scene, camera)
    }

    const inspectPinAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)

      const hit = raycaster.intersectObjects(clickTargets, false)[0]

      if (hit?.object.userData.primary) {
        console.info('[GlobeIntro] Primary pin clicked:', hit.object.userData.pinId)
        onContinue()
      }
    }

    const pointerDistance = () => {
      const values = [...activePointers.values()]

      if (values.length < 2) return 0

      return Math.hypot(
        values[0].clientX - values[1].clientX,
        values[0].clientY - values[1].clientY
      )
    }

    const handlePointerDown = (event: PointerEvent) => {
      activePointers.set(event.pointerId, event)
      controls.autoRotate = false

      if (activePointers.size === 1) {
        dragState.active = true
        dragState.pointerId = event.pointerId
        dragState.startX = event.clientX
        dragState.startY = event.clientY
        dragState.lastX = event.clientX
        dragState.moved = false
        dragState.pinchDistance = 0
        renderer.domElement.setPointerCapture(event.pointerId)
        return
      }

      dragState.active = false
      dragState.pinchDistance = pointerDistance()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) return

      activePointers.set(event.pointerId, event)

      if (activePointers.size >= 2) {
        const nextDistance = pointerDistance()

        if (dragState.pinchDistance > 0 && nextDistance > 0) {
          zoomGlobe((dragState.pinchDistance - nextDistance) * 0.018)
        }

        dragState.pinchDistance = nextDistance
        return
      }

      if (!dragState.active || event.pointerId !== dragState.pointerId) return

      const dx = event.clientX - dragState.lastX
      const totalDx = event.clientX - dragState.startX
      const totalDy = event.clientY - dragState.startY

      if (Math.hypot(totalDx, totalDy) > TAP_MOVE_THRESHOLD_PX) {
        dragState.moved = true
      }

      globeGroup.rotation.y += dx * HORIZONTAL_DRAG_SPEED
      dragState.lastX = event.clientX
    }

    const handlePointerUp = (event: PointerEvent) => {
      const wasTap =
        dragState.active &&
        event.pointerId === dragState.pointerId &&
        !dragState.moved &&
        activePointers.size === 1

      activePointers.delete(event.pointerId)

      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }

      if (wasTap) inspectPinAt(event)

      if (activePointers.size === 0) {
        dragState.active = false
        dragState.pointerId = -1
        dragState.pinchDistance = 0
      } else if (activePointers.size === 1) {
        const [next] = [...activePointers.values()]
        dragState.active = true
        dragState.pointerId = next.pointerId
        dragState.startX = next.clientX
        dragState.startY = next.clientY
        dragState.lastX = next.clientX
        dragState.moved = false
        dragState.pinchDistance = 0
      }
    }

    const handlePointerCancel = (event: PointerEvent) => {
      activePointers.delete(event.pointerId)

      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }

      if (activePointers.size === 0) {
        dragState.active = false
        dragState.pointerId = -1
        dragState.pinchDistance = 0
      }
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      controls.autoRotate = false
      zoomGlobe(event.deltaY * 0.004)
    }

    resize()
    animate()
    setLoaded(true)

    window.addEventListener('resize', resize)
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel)
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      disposed = true

      cancelAnimationFrame(frame)

      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel)
      renderer.domElement.removeEventListener('wheel', handleWheel)

      controls.dispose()
      cameraRef.current = null
      controlsRef.current = null

      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()

        const material = mesh.material as THREE.Material | THREE.Material[] | undefined

        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose())
        } else {
          material?.dispose()
        }
      })

      renderer.dispose()
      renderer.domElement.remove()

      console.info('[GlobeIntro] Renderer disposed')
    }
  }, [onContinue, debugMode])

  if (fallback) return <LandingScreen onContinue={onContinue} />

  const showDebugPanel = debugMode || debugLines.length > 0

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#263751] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_48%,rgba(14,165,233,0.13),transparent_34%),linear-gradient(180deg,#243752_0%,#263751_48%,#172338_100%)]" />

      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-label="Interactive FloodWatch globe intro"
      />

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-cyan-200/20 bg-slate-950/50 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-300 backdrop-blur">
            Loading earth data
          </div>
        </div>
      )}

      <div className="absolute left-4 top-4 max-w-[370px] rounded-3xl border border-white/10 bg-slate-950/62 p-5 text-white shadow-2xl backdrop-blur sm:left-6 sm:top-6">
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/80">
          FloodWatch HCMC
        </div>

        <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
          Flood risk before it reaches your route.
        </h1>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          Predict motorbike passability before flooding reaches your route.
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-black text-slate-950 shadow-xl transition hover:bg-cyan-50"
        >
          Open dashboard
        </button>
      </div>

      <div className="absolute right-5 top-5">
        <LangToggle />
      </div>

      <div className="absolute right-4 top-[58%] z-30 flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-cyan-100/15 bg-slate-950/62 text-white shadow-2xl backdrop-blur sm:bottom-6 sm:right-6 sm:top-auto sm:translate-y-0">
        <button
          type="button"
          onClick={() => zoomGlobe(-0.65)}
          className="flex h-12 w-12 items-center justify-center border-b border-white/10 text-2xl font-black transition hover:bg-white/10"
          aria-label="Zoom globe in"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => zoomGlobe(0.65)}
          className="flex h-12 w-12 items-center justify-center text-3xl font-black transition hover:bg-white/10"
          aria-label="Zoom globe out"
        >
          -
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-cyan-200/20 bg-slate-950/55 px-4 py-2 text-xs text-slate-300 shadow-xl backdrop-blur">
        Drag sideways, pinch zoom, or tap a red pilot pin
      </div>

      {showDebugPanel && (
        <div className="absolute bottom-5 right-5 z-50 w-[min(420px,calc(100vw-40px))] rounded-2xl border border-amber-300/30 bg-slate-950/85 p-3 font-mono text-[11px] text-slate-200 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-bold uppercase tracking-[0.18em] text-amber-200">
              Globe console
            </div>

            <div className="text-slate-500">
              {debugLines.length ? `${debugLines.length} issue(s)` : 'debug'}
            </div>
          </div>

          {debugMode && (
            <div className="mb-2 rounded-lg bg-white/5 p-2 text-cyan-100">
              {debugDetails}
            </div>
          )}

          {debugLines.length === 0 ? (
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-200">
              No globe errors. Browser console also logs resize/render details.
            </div>
          ) : (
            <div className="space-y-1">
              {debugLines.map((line, index) => (
                <div
                  key={`${line.message}-${index}`}
                  className={
                    line.level === 'error'
                      ? 'rounded-lg bg-red-500/15 p-2 text-red-100'
                      : 'rounded-lg bg-amber-500/15 p-2 text-amber-100'
                  }
                >
                  {line.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
