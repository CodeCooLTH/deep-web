'use client'

// ตัวคนในฉาก: โมเดล Kenney (CC0) ท่า Idle/Walking_A/Sit_Chair_Idle · โหลดไม่ได้ = แคปซูลแบบ mockup
// สีสถานะ = จานใต้เท้า (ตัว Kenney มีลายในตัว ทาสีทั้งตัวไม่ได้) — เป็นจุดที่ต่างจาก mockup
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Group, Material, Mesh } from 'three'
import { ENTRANCE, routeBetween, type StageActor, type Vec } from '@/lib/chat-desk/scene-layout'
import type { DeskEvent } from '@/lib/chat-desk/types'
import { FLOOR_RING_Y, FloorDisc, Guarded } from './parts'
import { MATERIAL as M, type SceneTokens } from './scene-colors'

const KENNEY = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f']
const pickModel = (id: string) => KENNEY[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % KENNEY.length]
// Kenney ตัวสูง ~0.55 หน่วยตั้งต้น → ×1.6 ให้ความสูงใกล้แคปซูลใน mockup (ค่าเดียวกับต้นแบบ gochat)
const MODEL_SCALE = 1.6

export type Anim = 'Idle' | 'Walking_A' | 'Sit_Chair_Idle'

function Capsule({ color, seated, opacity }: { color: string; seated: boolean; opacity: number }) {
  const solid = opacity >= 1
  return (
    <group>
      <mesh position={[0, seated ? 0.78 : 0.6, 0]} castShadow={solid}>
        <capsuleGeometry args={[0.24, 0.5, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} transparent={!solid} opacity={opacity} />
      </mesh>
      <mesh position={[0, seated ? 1.38 : 1.2, 0]} castShadow={solid}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color={M.skin} roughness={0.85} transparent={!solid} opacity={opacity} />
      </mesh>
    </group>
  )
}

function KenneyModel({ who, anim, opacity, still }: { who: string; anim: Anim; opacity: number; still: boolean }) {
  const { scene, animations } = useGLTF(`/chat-desk/kenney/${who}.glb`, false)
  const { model, clones } = useMemo(() => {
    const clones: Material[] = []
    const m = cloneSkinned(scene)
    m.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = opacity >= 1
      if (opacity < 1 && !Array.isArray(mesh.material)) {
        const c = mesh.material.clone()
        c.transparent = true; c.opacity = opacity; c.depthWrite = false
        mesh.material = c
        clones.push(c)
      }
    })
    return { model: m, clones }
  }, [scene, opacity])
  // material ที่ clone เองไม่ถูก GC ฝั่ง GPU — คืนเมื่อ opacity เปลี่ยน/ถอด component (geometry/texture ใช้ร่วมกับ scene จึงไม่แตะ)
  useEffect(() => () => { clones.forEach((c) => c.dispose()) }, [clones])
  const { actions } = useAnimations(animations, model)
  useEffect(() => {
    const a = actions[anim] ?? actions.Idle
    a?.reset().fadeIn(0.2).play()
    // ลดการเคลื่อนไหว: ค้างท่าแรกของคลิป (ยังเห็นนั่ง/ยืน แต่ไม่ขยับ)
    a?.setEffectiveTimeScale(still ? 0 : 1)
    return () => { a?.fadeOut(0.2) }
  }, [actions, anim, still])
  return <primitive object={model} scale={MODEL_SCALE} />
}

/** ตัวคนหนึ่งตัว (ไม่มีตำแหน่ง/วง) — ใช้ทั้งลูกค้าและคนที่นั่งประจำโต๊ะ */
export function Figure({ id, anim, seated, color, opacity = 1, still }: {
  id: string; anim: Anim; seated: boolean; color: string; opacity?: number; still: boolean
}) {
  const fallback = <Capsule color={color} seated={seated} opacity={opacity} />
  return (
    <Guarded url={`/chat-desk/kenney/${pickModel(id)}.glb`} fallback={fallback}>
      {/* นั่งแล้วยกขึ้น/ถอยหลังนิดให้สะโพกตรงเบาะ (ค่าจากต้นแบบ gochat) */}
      <group position={[0, seated ? 0.12 : 0, seated ? -0.1 : 0]}>
        <KenneyModel who={pickModel(id)} anim={anim} opacity={opacity} still={still} />
      </group>
    </Guarded>
  )
}

const SPEED = 3.2 // หน่วยต่อวินาที

export type ActorProps = {
  actor: StageActor
  tokens: SceneTokens
  /** เหตุการณ์ของห้องนี้ที่ต้องเล่น (อยู่ใน ≤20 รายการแรก) — ไม่มี = วางทันที */
  ev?: DeskEvent
  /** ตำแหน่งเริ่มต้น (ผี LEAVE เริ่มจากที่เดิมก่อนออก) */
  from?: Vec
  reduced: boolean
  selected: boolean
  onSelect: (id: string) => void
  onArrive?: (id: string) => void
}

export function Actor({ actor, tokens, ev, from, reduced, selected, onSelect, onArrive }: ActorProps) {
  const { id, pos, seated, ry, customer } = actor
  const ref = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const path = useRef<Vec[]>([])
  const born = useRef(false)
  const [walking, setWalking] = useState(false)
  const play = !!ev && !reduced
  const evType = ev?.type
  const [px, pz] = pos

  useEffect(() => {
    const g = ref.current
    if (!g) return
    if (!born.current) {
      born.current = true
      const start = from ?? (play && evType === 'ENTER' ? ENTRANCE : [px, pz])
      g.position.set(start[0], 0, start[1])
      g.rotation.y = ry
    }
    if (!play) { g.position.set(px, 0, pz); g.rotation.y = ry; path.current = []; setWalking(false); return }
    path.current = routeBetween([g.position.x, g.position.z], [px, pz])
    setWalking(true)
    // from/ry เป็นค่าตั้งต้นของตัวนี้ตลอดอายุ ไม่ต้องรันใหม่เมื่อมันเปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, pz, play, evType])

  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const next = path.current[0]
    if (next) {
      const dx = next[0] - g.position.x, dz = next[1] - g.position.z
      const dist = Math.hypot(dx, dz)
      const step = SPEED * Math.min(dt, 0.1)
      if (dist <= step) { g.position.set(next[0], 0, next[1]); path.current.shift() }
      else { g.position.x += (dx / dist) * step; g.position.z += (dz / dist) * step; g.rotation.y = Math.atan2(dx, dz) }
      if (!path.current.length) { g.rotation.y = ry; setWalking(false); onArrive?.(id) }
    }
    if (ring.current) {
      // แดงเกินเวลา: วงขยาย+จาง วนซ้ำ · ลดการเคลื่อนไหว = นิ่ง
      const p = reduced ? 0 : (state.clock.elapsedTime / 0.9) % 1
      ring.current.scale.setScalar(1 + p * 0.7)
      ;(ring.current.material as { opacity: number }).opacity = reduced ? 0.85 : 0.9 * (1 - p)
    }
  })

  const color = tokens.status[customer.status]
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(id) }
  return (
    <group
      ref={ref} onClick={click}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      <FloorDisc color={color} radius={0.42} />
      {customer.status === 'OVERDUE' && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_RING_Y + 0.01, 0]}>
          <ringGeometry args={[0.36, 0.5, 40]} />
          <meshBasicMaterial color={tokens.danger} transparent opacity={0.85} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} depthWrite={false} />
        </mesh>
      )}
      {selected && <FloorDisc color={tokens.primary} radius={0.72} inner={0.6} y={FLOOR_RING_Y + 0.02} />}
      <Figure id={id} anim={walking ? 'Walking_A' : seated ? 'Sit_Chair_Idle' : 'Idle'} seated={seated && !walking} color={color} still={reduced} />
    </group>
  )
}
