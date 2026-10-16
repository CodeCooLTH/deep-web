'use client'

// กล้อง isometric + ฉายตำแหน่งป้าย DOM — ตรง placeCam/updateLabels ใน mockup
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, Vector3, type Group, type OrthographicCamera } from 'three'
import { ROOM } from '@/lib/chat-desk/scene-layout'

export type LabelEntry = { el: HTMLElement; pos: Vector3; wall?: 'back' | 'left' }
export type SceneRefs = {
  labels: Map<string, LabelEntry>
  walls: { back: Group | null; left: Group | null }
}
export const createSceneRefs = (): SceneRefs => ({ labels: new Map(), walls: { back: null, left: null } })

const R = 40
const BASE_THETA = Math.PI / 4
const v = new Vector3()

/** ผูกกลุ่มผนังเข้า refs (เรียกจาก ref callback ของ <group>) */
export function setWall(refs: SceneRefs, side: 'back' | 'left', g: Group | null) {
  refs.walls[side] = g
}

// แยกเป็นฟังก์ชันระดับ module: เขียน object ของ three/DOM โดยตรงทุกเฟรม (ไม่ใช่ state ของ React)
function syncWalls(refs: SceneRefs, cam: OrthographicCamera) {
  if (refs.walls.back) refs.walls.back.visible = cam.position.z > 0.5
  if (refs.walls.left) refs.walls.left.visible = cam.position.x > 0.5
}

function projectLabels(refs: SceneRefs, cam: OrthographicCamera, width: number, height: number) {
  for (const l of refs.labels.values()) {
    const hide = l.wall && !refs.walls[l.wall]?.visible
    l.el.style.display = hide ? 'none' : ''
    if (hide) continue
    v.copy(l.pos).project(cam)
    l.el.style.visibility = 'visible'
    l.el.style.transform = `translate(${(((v.x + 1) / 2) * width).toFixed(1)}px,${(((1 - v.y) / 2) * height).toFixed(1)}px) translate(-50%,-100%)`
  }
}

export function CameraRig({ rotation, zoom, leftInset, reduced, refs }: {
  rotation: number; zoom: number; leftInset: number; reduced: boolean; refs: SceneRefs
}) {
  const start = BASE_THETA + rotation * (Math.PI / 2)
  const theta = useRef(start)
  const target = useRef(start)
  const lastRot = useRef(rotation)

  useEffect(() => {
    // ปุ่มหมุนเดินหน้าทีละ 1 (3→0 ก็คือเดินหน้า) จึงสะสมมุมแทนการ lerp ตรงไป rotation*90°
    target.current += ((rotation - lastRot.current + 4) % 4) * (Math.PI / 2)
    lastRot.current = rotation
  }, [rotation])

  useFrame((state, dt) => {
    const cam = state.camera as OrthographicCamera
    const { width, height } = state.size
    theta.current = reduced ? target.current : MathUtils.damp(theta.current, target.current, 8, dt)
    cam.position.set(Math.sin(theta.current) * R, R * 0.82, Math.cos(theta.current) * R)
    cam.lookAt(0, 0.6, 0)
    cam.updateMatrixWorld()

    // ซ่อนผนังฝั่งที่บังกล้อง — เหลือผนังหลัง/ซ้ายเท่าที่อยู่ไกลกล้อง
    syncWalls(refs, cam)

    // zoom พอดีห้อง: วัดกล่องห้องในพิกัดกล้อง
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const cx of [-ROOM.W / 2, ROOM.W / 2]) for (const cy of [0, ROOM.WALL_H]) for (const cz of [-ROOM.D / 2, ROOM.D / 2]) {
      v.set(cx, cy, cz).applyMatrix4(cam.matrixWorldInverse)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const pad = Math.min(leftInset, width * 0.5)
    const fit = Math.min((width - pad - 40) / (x1 - x0), (height - 70) / (y1 - y0))
    cam.zoom = Math.max(fit, 1) * zoom
    if (pad) cam.setViewOffset(width, height, -pad / 2, 0, width, height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()

    projectLabels(refs, cam, width, height)
  })
  return null
}
