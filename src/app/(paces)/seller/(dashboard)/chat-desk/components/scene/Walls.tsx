'use client'

// พื้นไม้ + ผนังหลัง/ซ้าย + ป้ายร้านบนผนัง + ประตูทางเข้า/ออก (ไม้/เทา ไม่ใช่เขียว) — ตรง createDesk ใน mockup
import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { ENTRANCE, EXIT, ROOM } from '@/lib/chat-desk/scene-layout'
import { setWall, type SceneRefs } from './camera'
import { Box, Furniture } from './parts'
import { MATERIAL as M } from './scene-colors'

function woodTexture() {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 512
  const g = cv.getContext('2d')!
  const rows = 8
  const h = 512 / rows
  for (let r = 0; r < rows; r++) {
    let x = -(r % 3) * 90
    while (x < 512) {
      const len = 160 + ((r * 37 + x) % 3) * 40
      const l = 70 + ((r * 13 + Math.abs(x)) % 5) * 2
      g.fillStyle = `hsl(${M.woodHue} 42% ${l}%)`
      g.fillRect(x, r * h, len, h)
      g.fillStyle = 'rgba(110,72,40,.25)'
      g.fillRect(x, r * h, 2, h)
      x += len
    }
    g.fillStyle = 'rgba(110,72,40,.3)'
    g.fillRect(0, r * h + h - 2, 512, 2)
  }
  const t = new CanvasTexture(cv)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(3, 2.2)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function Door({ pos, ry }: { pos: readonly [number, number]; ry: number }) {
  return (
    <group position={[pos[0], 0, pos[1]]} rotation={[0, ry, 0]}>
      <Box size={[0.18, 2.5, 0.16]} pos={[-0.85, 1.25, 0]} color={M.doorFrame} />
      <Box size={[0.18, 2.5, 0.16]} pos={[0.85, 1.25, 0]} color={M.doorFrame} />
      <Box size={[1.88, 0.18, 0.16]} pos={[0, 2.5, 0]} color={M.doorFrame} />
      <Box size={[1.5, 2.38, 0.06]} pos={[0, 1.19, 0.02]} color={M.doorLeaf} />
      <Box size={[0.08, 0.3, 0.08]} pos={[0.5, 1.15, 0.08]} color={M.doorKnob} />
    </group>
  )
}

export function Walls({ refs }: { refs: SceneRefs }) {
  const wood = useMemo(() => woodTexture(), [])
  useEffect(() => () => wood.dispose(), [wood])
  const { W, D, WALL_H } = ROOM
  return (
    <>
      <Box size={[W, 0.3, D]} pos={[0, -0.15, 0]} map={wood} />
      <group ref={(g) => setWall(refs, 'back', g)}>
        <Box size={[W + 0.3, WALL_H, 0.3]} pos={[0, WALL_H / 2, -D / 2 - 0.15]} color={M.wallBack} />
        <Box size={[W, 0.22, 0.06]} pos={[0, 0.11, -D / 2 + 0.03]} color={M.skirting} />
        <Box size={[6.4, 0.9, 0.08]} pos={[4.5, 2.65, -D / 2 + 0.06]} color={M.signBoard} />
        <Door pos={[EXIT[0], -D / 2 + 0.05]} ry={0} />
        <Furniture name="shelf_B_large_decorated" pos={[-8, 1.5, -D / 2 + 0.2]} />
        <Furniture name="pictureframe_large_A" pos={[-8, 2.9, -D / 2 + 0.1]} />
        <Furniture name="pictureframe_medium" pos={[10, 2.5, -D / 2 + 0.1]} />
      </group>
      <group ref={(g) => setWall(refs, 'left', g)}>
        <Box size={[0.3, WALL_H, D]} pos={[-W / 2 - 0.15, WALL_H / 2, 0]} color={M.wallLeft} />
        <Box size={[0.06, 0.22, D]} pos={[-W / 2 + 0.03, 0.11, 0]} color={M.skirting} />
        <Door pos={[-W / 2 + 0.05, ENTRANCE[1]]} ry={Math.PI / 2} />
        <Furniture name="pictureframe_medium" pos={[-W / 2 + 0.1, 2.4, -3]} ry={Math.PI / 2} />
      </group>
      {/* มุมห้องแทนต้นไม้ของ mockup (ต้นไม้ในชุดนี้เป็นกระบองเพชรสีเขียว — ผิดกฎไม่ใช้เขียว) */}
      <Furniture name="cabinet_medium_decorated" pos={[-10, 0, -7.3]} k={1.3} />
      <Furniture name="lamp_standing" pos={[10.2, 0, -7.2]} k={1.2} />
    </>
  )
}
