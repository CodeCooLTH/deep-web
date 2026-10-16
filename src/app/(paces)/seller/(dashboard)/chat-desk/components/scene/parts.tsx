'use client'

// ชิ้นส่วนร่วมของฉาก: กล่อง · ตัวกั้น error ของโมเดล · ของแต่งจาก furniture.glb
import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { BoxGeometry, DoubleSide, type Mesh, type Texture } from 'three'

const UNIT = new BoxGeometry(1, 1, 1)

type Tri = readonly [number, number, number]

export function Box({ size, pos, color, opacity = 1, map, emissive, cast = true }: {
  size: Tri; pos: Tri; color?: string; opacity?: number; map?: Texture; emissive?: string; cast?: boolean
}) {
  const solid = opacity >= 1
  return (
    <mesh geometry={UNIT} scale={size as [number, number, number]} position={pos as [number, number, number]} castShadow={cast && solid} receiveShadow>
      <meshStandardMaterial
        color={color} map={map} roughness={0.85} transparent={!solid} opacity={opacity} depthWrite={solid}
        emissive={emissive} emissiveIntensity={emissive ? 0.4 : 0}
      />
    </mesh>
  )
}

/** วงแบนบนพื้น — ยกเหนือพื้นพรม + polygonOffset กัน z-fighting (วงกะพริบเป็นประ) */
export const FLOOR_RING_Y = 0.09
export function FloorDisc({ color, radius, inner = 0, y = FLOOR_RING_Y, opacity = 1 }: {
  color: string; radius: number; inner?: number; y?: number; opacity?: number
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      {inner ? <ringGeometry args={[inner, radius, 40]} /> : <circleGeometry args={[radius, 32]} />}
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} depthWrite={false} />
    </mesh>
  )
}

/** โมเดล .glb โหลดไม่ได้ (404/ถอดไม่ออก) → fallback แทน ไม่ล้มทั้งฉาก */
export class Soft extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children }
}

const FURNITURE_URL = '/chat-desk/kaykit/furniture.glb'

/** ของแต่งหนึ่งชิ้นจาก furniture.glb (ชื่อ node ตาม SDS §10) — clone ครั้งเดียวด้วย useMemo */
function Piece({ name, pos, ry = 0, k = 1.5 }: { name: string; pos: Tri; ry?: number; k?: number }) {
  const { scene } = useGLTF(FURNITURE_URL, false)
  const obj = useMemo(() => {
    const o = scene.getObjectByName(name)?.clone()
    o?.traverse((m) => { if ((m as Mesh).isMesh) m.castShadow = m.receiveShadow = true })
    return o ?? null
  }, [scene, name])
  return obj ? <primitive object={obj} position={pos as [number, number, number]} rotation={[0, ry, 0]} scale={k} /> : null
}

export function Furniture(p: { name: string; pos: Tri; ry?: number; k?: number }) {
  return <Soft><Suspense fallback={null}><Piece {...p} /></Suspense></Soft>
}
