'use client'

// เลานจ์ลูกค้ารอ: พรม + เก้าอี้ 24 ตัว (ว่างก็มีเก้าอี้ ตาม mockup)
import { LOUNGE_SEATS } from '@/lib/chat-desk/constants'
import { LOUNGE_AREA, loungeSeat } from '@/lib/chat-desk/scene-layout'
import { Box } from './parts'
import { MATERIAL as M } from './scene-colors'

// เก้าอี้ตั้งบนผิวพรม (ไม่ฝังลงไป ไม่งั้นดูจมตามที่ต้นแบบเจอ)
const RUG_TOP = 0.045

export function Lounge() {
  const { x, z, w, d } = LOUNGE_AREA
  return (
    <group>
      <Box size={[w, 0.03, d]} pos={[x, 0.015, z]} color={M.loungeRugOuter} cast={false} />
      <Box size={[w - 0.2, 0.02, d - 0.2]} pos={[x, 0.035, z]} color={M.loungeRugInner} cast={false} />
      {Array.from({ length: LOUNGE_SEATS }, (_, i) => {
        const [sx, sz] = loungeSeat(i)
        return (
          <group key={i}>
            <Box size={[1.0, 0.42, 0.9]} pos={[sx, 0.21 + RUG_TOP, sz]} color={M.chairSeat} />
            <Box size={[1.0, 0.7, 0.18]} pos={[sx, 0.6 + RUG_TOP, sz - 0.42]} color={M.chairBack} />
          </group>
        )
      })}
    </group>
  )
}
