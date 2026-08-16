/**
 * 00049 AI Command Center — จอเดียวที่ user เห็นงานทั้งสายพานและเคาะอนุมัติได้
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/PipelinePage.tsx
 *   (โครง kanban เลื่อนแนวนอน + หัวคอลัมน์พร้อมตัวนับ)
 *
 * RSC wrapper pattern: mirror `admin/(dashboard)/topups/page.tsx`
 * 🛑 หน้านี้ **ไม่ดึงข้อมูลฝั่ง server** ต่างจาก topups โดยตั้งใจ — บอร์ดต้อง poll ทุก 15–30 วิ
 * อยู่แล้ว การ render ครั้งแรกจาก server จะได้ข้อมูลที่เก่ากว่ารอบ poll แรกไม่กี่วินาที
 * แลกกับการยิง GitHub เพิ่ม 1 ครั้งต่อการโหลดหน้า (โควตา 5,000/ชม. ต้องประหยัด — SRS NFR)
 * ⇒ ปล่อยให้ client island ยิงเองรอบเดียว แล้วแสดง skeleton ระหว่างรอ
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import CommandCenterClient from './components/CommandCenterClient'

export const metadata: Metadata = { title: 'สายพานงาน AI' }

export default async function CommandCenterPage() {
  // Admin gate ของ "หน้า" — API route แต่ละตัวเช็คของตัวเองอีกชั้น (SDS TD-005)
  const admin = await requireAdmin()
  if (!admin) redirect('/auth/sign-in')

  return <CommandCenterClient />
}
