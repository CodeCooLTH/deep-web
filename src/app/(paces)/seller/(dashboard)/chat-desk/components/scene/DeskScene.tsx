'use client'

// ฉาก 3D โต๊ะแชท (R3F) — ยกเว้น HR1 (มติ user 2026-10-16) ตาม mockup 2026-10-16-00077-chat-desk-mockup.html
// Base: gochat 3D-Chat-Desk (ยกเว้น HR1 มติ 2026-10-16) — เอาแนวทาง (portal/วงยกพื้น/clone ครั้งเดียว) ไม่ copy ทั้งก้อน
// ★ อ่านอย่างเดียว: คลิกได้แค่ "เลือกดู" ไม่มีทางย้าย/มอบแชทจากฉาก
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { splitEvents } from '@/lib/chat-desk/scene-model'
import { EXIT, deskSlots, layoutActors, type StageActor, type Vec } from '@/lib/chat-desk/scene-layout'
import type { DeskCanvasProps, DeskCustomer, DeskEvent } from '@/lib/chat-desk/types'
import { CameraRig, createSceneRefs } from './camera'
import { DeskFurniture } from './DeskFurniture'
import { Lounge } from './Lounge'
import { Overlay } from './Overlay'
import { Actor } from './Person'
import { MATERIAL as M, readTokens } from './scene-colors'
import { Walls } from './Walls'

type Ghost = { actor: StageActor; ev: DeskEvent; from: Vec }

const ghostOf = (ev: DeskEvent, from: Vec): Ghost => {
  const r = ev.room
  const customer: DeskCustomer = {
    id: r.id, name: r.name, platform: r.platform, pageId: r.pageId, since: null,
    status: r.state === 'AT_DESK' ? 'RECENT' : 'WAITING',
  }
  return { actor: { id: r.id, customer, pos: EXIT, seated: false, ry: Math.PI }, ev, from }
}

export default function DeskScene(p: DeskCanvasProps) {
  const { view, events, reducedMotion: reduced } = p
  const refs = useMemo(createSceneRefs, [])
  const tokens = useMemo(readTokens, [])
  const slots = useMemo(() => deskSlots(view.tables), [view.tables])
  const actors = useMemo(() => layoutActors(view), [view])
  const animate = useMemo(() => splitEvents(events).animate, [events])
  const evById = useMemo(() => new Map(animate.map((e) => [e.roomId, e])), [animate])

  // คนที่ออกจากฉาก (LEAVE) ไม่อยู่ใน view แล้ว → ผีเดินจากตำแหน่งสุดท้ายไปประตูทางออกแล้วหาย
  // ⚠ ต้องส่ง events กับ view ใน commit เดียวกัน ไม่งั้น lastPos ลืมตำแหน่งไปก่อน
  const lastPos = useRef(new Map<string, Vec>())
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  useEffect(() => {
    if (reduced) return
    const present = new Set(actors.map((a) => a.id))
    const add = animate.filter((e) => e.type === 'LEAVE' && !present.has(e.roomId)).map((e) => ghostOf(e, lastPos.current.get(e.roomId) ?? EXIT))
    if (add.length) setGhosts((g) => [...g.filter((x) => !add.some((y) => y.actor.id === x.actor.id)), ...add])
    // รันตามเหตุการณ์ชุดใหม่เท่านั้น (actors เปลี่ยนทุก poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate])
  useEffect(() => { lastPos.current = new Map(actors.map((a) => [a.id, a.pos])) }, [actors])

  return (
    <div className="relative size-full overflow-hidden">
      <Canvas
        orthographic flat shadows dpr={[1, 2]} frameloop={p.paused ? 'never' : 'always'}
        camera={{ position: [28, 33, 28], zoom: 20, near: -200, far: 400 }}
        gl={{ antialias: true, alpha: true }}
        role="img" aria-label="ฉาก 3D ห้องแชทของร้าน (ข้อมูลชุดเดียวกับโหมดรายการ)"
      >
        <hemisphereLight args={[M.lightSky, M.lightGround, 1.5]} />
        <directionalLight
          position={[9, 16, 7]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005}
          shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16}
        />
        <Walls refs={refs} />
        <Lounge />
        {view.tables.map((t) => (
          <DeskFurniture key={t.key} table={t} at={slots.get(t.key) ?? [0, 0]} tokens={tokens} selected={p.selectedTableKey === t.key} reduced={reduced} />
        ))}
        {actors.map((a) => (
          <Actor key={a.id} actor={a} tokens={tokens} ev={evById.get(a.id)} reduced={reduced} selected={p.selectedRoomId === a.id} onSelect={p.onSelectRoom} />
        ))}
        {ghosts.map((g) => (
          <Actor
            key={`ghost:${g.actor.id}`} actor={g.actor} tokens={tokens} ev={g.ev} from={g.from} reduced={reduced} selected={false}
            onSelect={() => {}} onArrive={(id) => setGhosts((cur) => cur.filter((x) => x.actor.id !== id))}
          />
        ))}
        <CameraRig rotation={p.rotation} zoom={p.zoom} leftInset={p.leftInset ?? 0} reduced={reduced} refs={refs} />
      </Canvas>
      <Overlay
        view={view} shopName={p.shopName} hideNumbers={p.hideNumbers} refs={refs} slots={slots} actors={actors}
        onSelectRoom={p.onSelectRoom} onSelectTable={p.onSelectTable} onOpenLounge={p.onOpenLounge} onOpenHiddenTables={p.onOpenHiddenTables}
      />
    </div>
  )
}
