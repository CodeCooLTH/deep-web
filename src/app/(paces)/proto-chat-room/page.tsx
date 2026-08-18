/**
 * PROTOTYPE — โค้ดทิ้ง ห้าม merge เข้า main
 *
 * 🛑 ด่านกัน prod: หน้านี้เปิดได้โดย **ไม่ต้องล็อกอิน** (วางไว้นอก `/seller/` เพื่อให้ดูสะดวก)
 *    ⇒ ถ้าเผลอ push ขึ้น main เมื่อไหร่ ลูกค้าจะเดินเข้ามาเจอห้องแชทปลอมที่มีข้อมูลสมมติ
 *    ⇒ บังคับ 404 บน production build เสมอ ไม่ให้ขึ้นกับ "ความตั้งใจว่าจะไม่ push"
 *
 *    HR15: การ deploy เกิดจากการ push ขึ้น main เท่านั้น — ตอนนี้ยังไม่ commit ด้วยซ้ำ
 *    (`git diff` ว่างเปล่า ไม่มีไฟล์เดิมถูกแก้แม้แต่บรรทัดเดียว) ด่านนี้เป็นชั้นที่สอง
 *    เผื่อกรณีที่ชั้นแรกพลาด
 */

import { notFound } from 'next/navigation'
import ProtoChatRoomClient from './ProtoChatRoomClient'

export default async function ProtoChatRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  // อ่าน variant ฝั่ง server แล้วส่งเป็น prop — ไม่ต้อง setState ใน effect
  // (แก้ทั้ง lint `react-hooks/set-state-in-effect` และอาการ "B2 วาบหนึ่งเฟรมก่อนสลับ")
  const { variant } = await searchParams
  return <ProtoChatRoomClient initialVariant={variant} />
}
