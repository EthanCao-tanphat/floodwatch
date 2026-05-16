import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { LandingScreen } from './LandingScreen'

interface Props {
  onContinue: () => void
}

type Pin = {
  id: string
  label: string
  lat: number
  lng: number
  kind: 'primary' | 'secondary'
}

const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg'
const GLOBE_RADIUS = 2.2
const PINS: Pin[] = [
  { id: 'vietnam', label: 'Vietnam', lat: 14.0583, lng: 108.2772, kind: 'primary' },
  { id: 'jakarta', label: 'Jakarta', lat: -6.2088, lng: 106.8456, kind: 'secondary' },
  { id: 'manila', label: 'Manila', lat: 14.5995, lng: 120.9842, kind: 'secondary' },
  { id: 'bangkok', label: 'Bangkok', lat: 13.7563, lng: 100.5018, kind: 'secondary' },
  { id: 'hanoi', label: 'Hanoi', lat: 21.0278, lng: 105.8342, kind: 'secondary' },
  { id: 'hcmc', label: 'HCMC', lat: 10.8231, lng: 106.6297, kind: 'primary' },
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
    let userTouched = false
    const labels: Array<{ pin: Pin; element: HTMLDivElement; object: THREE.Object3D }> = []
    const clickTargets: THREE.Object3D[] = []

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x050914, 8, 16)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0.15, 7.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x050914, 1)
    container.appendChild(renderer.domElement)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const globeGroup = new THREE.Group()
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
    const earth = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64), earthMaterial)
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

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.045, 64, 64),
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
            float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
            gl_FragColor = vec4(0.22, 0.78, 1.0, 1.0) * intensity;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      })
    )
    globeGroup.add(atmosphere)

    const pinMaterialPrimary = new THREE.MeshBasicMaterial({ color: 0xff4d5d })
    const pinMaterialSecondary = new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4d5d,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    })

    for (const pin of PINS) {
      const pos = latLngToVector3(pin.lat, pin.lng, GLOBE_RADIUS + 0.04)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(pin.kind === 'primary' ? 0.055 : 0.04, 18, 18),
        pin.kind === 'primary' ? pinMaterialPrimary : pinMaterialSecondary
      )
      marker.position.copy(pos)
      marker.userData.pinId = pin.id
      marker.userData.primary = pin.kind === 'primary'
      globeGroup.add(marker)
      clickTargets.push(marker)

      if (pin.kind === 'primary') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.14, 28), ringMaterial.clone())
        ring.position.copy(pos.clone().multiplyScalar(1.006))
        ring.lookAt(new THREE.Vector3(0, 0, 0))
        globeGroup.add(ring)
      }

      const label = document.createElement('div')
      label.className = pin.kind === 'primary' ? 'globe-label globe-label-primary' : 'globe-label'
      label.textContent = pin.label
      container.appendChild(label)
      labels.push({ pin, element: label, object: marker })
    }

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const projectLabels = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      for (const item of labels) {
        const world = new THREE.Vector3()
        item.object.getWorldPosition(world)
        const normal = world.clone().normalize()
        const cameraDirection = camera.position.clone().normalize()
        const visible = normal.dot(cameraDirection) > -0.35
        const projected = world.clone().project(camera)
        item.element.style.opacity = visible ? '1' : '0'
        item.element.style.transform = `translate3d(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px, 0) translate(-50%, -50%)`
      }
    }

    const animate = () => {
      frame = requestAnimationFrame(animate)
      if (!userTouched) globeGroup.rotation.y += 0.0024
      for (const target of clickTargets) {
        if (target.userData.primary) {
          const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.16
          target.scale.setScalar(pulse)
        }
      }
      renderer.render(scene, camera)
      projectLabels()
    }

    const handlePointer = (event: PointerEvent) => {
      userTouched = true
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(clickTargets, false)[0]
      if (hit?.object.userData.primary) onContinue()
    }

    const handleMove = () => {
      userTouched = true
    }

    resize()
    animate()
    window.addEventListener('resize', resize)
    renderer.domElement.addEventListener('pointerdown', handlePointer)
    renderer.domElement.addEventListener('pointermove', handleMove, { passive: true })

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('pointerdown', handlePointer)
      renderer.domElement.removeEventListener('pointermove', handleMove)
      labels.forEach((label) => label.element.remove())
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [onContinue])

  if (fallback) return <LandingScreen onContinue={onContinue} />

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#050914] text-white">
      <style>{`
        .globe-label {
          position: absolute;
          left: 0;
          top: 0;
          padding: 4px 8px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          background: rgba(5, 9, 20, 0.62);
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
          will-change: transform, opacity;
        }
        .globe-label-primary {
          border-color: rgba(248, 113, 113, 0.54);
          background: rgba(127, 29, 29, 0.5);
          color: #fecaca;
          box-shadow: 0 0 24px rgba(248, 113, 113, 0.24);
        }
      `}</style>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(14,165,233,0.16),transparent_36%),linear-gradient(180deg,#050914_0%,#07111f_55%,#020617_100%)]" />
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
          Click Vietnam to enter the pilot dashboard for motorbike passability forecasting.
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
        Vietnam and HCMC pins open the dashboard
      </div>
    </div>
  )
}
