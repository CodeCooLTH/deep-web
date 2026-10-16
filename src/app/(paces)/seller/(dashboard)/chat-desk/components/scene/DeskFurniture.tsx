'use client'

// โต๊ะ 1 ตัว: พรม · โต๊ะ · หน้าโต๊ะสีตามชนิด · จอ · เก้าอี้ · คนประจำโต๊ะ (แอดมิน/ผี "นอกระบบ"/Meta AI/บอท)
import type { DeskTable } from '@/lib/chat-desk/types'
import type { Vec } from '@/lib/chat-desk/scene-layout'
import { Box } from './parts'
import { Figure } from './Person'
import { MATERIAL as M, type SceneTokens } from './scene-colors'

export function DeskFurniture({ table, at, tokens, selected, reduced }: {
  table: DeskTable; at: Vec; tokens: SceneTokens; selected: boolean; reduced: boolean
}) {
  const [x, z] = at
  // แอดมินออฟไลน์: ทั้งโต๊ะจาง (BR-CD-33) · online=null (ตรวจไม่ได้) ไม่จาง
  const o = table.kind === 'ADMIN' && table.online === false ? 0.5 : 1
  const front = tokens.table[table.kind]
  return (
    <group>
      {selected && <Box size={[3.8, 0.02, 4.6]} pos={[x, 0.01, z + 0.5]} color={tokens.primary} cast={false} />}
      <Box size={[3.4, 0.03, 4.2]} pos={[x, 0.02, z + 0.5]} color={M.rug[table.kind]} opacity={o} cast={false} />
      <Box size={[2.1, 0.08, 0.9]} pos={[x, 0.76, z]} color={M.deskTop} opacity={o} />
      <Box size={[2.1, 0.72, 0.08]} pos={[x, 0.36, z + 0.42]} color={front} opacity={o} />
      <Box size={[0.7, 0.45, 0.06]} pos={[x + 0.4, 1.06, z - 0.2]} color={M.monitor} opacity={o} />
      <Box size={[0.7, 0.4, 0.65]} pos={[x, 0.2, z - 0.95]} color={M.deskChair} opacity={o} />
      <Box size={[0.7, 0.7, 0.1]} pos={[x, 0.65, z - 1.25]} color={M.deskChair} opacity={o} />
      <group position={[x, 0, z - 0.95]}>
        {table.kind === 'ADMIN' && <Figure id={table.userId ?? table.key} anim="Sit_Chair_Idle" seated color={tokens.table.ADMIN} opacity={o === 1 ? 1 : 0.35} still={reduced} />}
        {table.kind === 'EXTERNAL' && <Figure id={table.key} anim="Sit_Chair_Idle" seated color={tokens.table.EXTERNAL} opacity={0.45} still={reduced} />}
        {table.kind === 'META_AI' && (
          <mesh position={[0, 1.25, 0]} castShadow>
            <octahedronGeometry args={[0.28]} />
            <meshStandardMaterial color={M.metaGem} roughness={0.85} emissive={M.metaGlow} emissiveIntensity={0.4} />
          </mesh>
        )}
        {table.kind === 'BOT' && (
          <group>
            <Box size={[0.6, 0.7, 0.5]} pos={[0, 0.75, 0]} color={M.botBody} />
            <Box size={[0.5, 0.42, 0.45]} pos={[0, 1.32, 0]} color={M.botHead} />
            <Box size={[0.36, 0.08, 0.02]} pos={[0, 1.36, 0.23]} color={M.botVisor} cast={false} />
          </group>
        )}
      </group>
      {/* โทรศัพท์บนโต๊ะ "ตอบนอก Deep" */}
      {table.kind === 'EXTERNAL' && <Box size={[0.22, 0.04, 0.4]} pos={[x - 0.5, 0.82, z]} color={M.monitor} />}
    </group>
  )
}
