/**
 * PROTOTYPE — โค้ดทิ้ง ห้าม merge เข้า main
 *
 * คำถามที่ตอบ: "แผงข้อมูลลูกค้าควรจัดยังไงให้ใช้ง่ายกว่านี้" (user สั่ง 2026-08-18)
 *
 * 🛑 ด่านกัน prod: หน้านี้เปิดได้โดยไม่ต้องล็อกอิน (อยู่นอก `/seller/` — `proxy.ts:188`
 *    เด้ง `/seller/*` ไป sign-in) ⇒ ถ้าเผลอ push ขึ้น main ลูกค้าจะเดินเข้ามาเจอ
 *    แผงปลอมที่มีข้อมูลสมมติ จึงบังคับ 404 บน production build เสมอ
 *    ไม่ให้ขึ้นกับ "ความตั้งใจว่าจะไม่ push"
 *
 *   เปิดที่:  http://localhost:3000/proto-customer-panel?variant=V1
 */

import { notFound } from 'next/navigation'
import ProtoCustomerPanelClient from './ProtoCustomerPanelClient'

export default async function ProtoCustomerPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  // อ่าน variant ฝั่ง server แล้วส่งเป็น prop — ไม่ต้อง setState ใน effect
  // (กัน lint `react-hooks/set-state-in-effect` และอาการแบบแรกวาบก่อนสลับ)
  const { variant } = await searchParams
  return <ProtoCustomerPanelClient initialVariant={variant} />
}
