import type { Metadata } from 'next'
import { requireInspectorPage } from './_shared'

export const metadata: Metadata = { title: 'งานตรวจของฉัน' }

/**
 * Layout guard ของ `/inspector` — feature 00060 · T13 · UX Design Spec Surface C
 *
 * ไม่มี theme file ตรงสำหรับ layout นี้ (UX Design Spec: "ไม่มี theme ตรง" สำหรับแถวนี้) —
 * ยึด `(paces)/layout.tsx` ชั้นนอกสุด (Preline+Tailwind+Anuphan) เป็นฐานเดียว ห้ามปนกับ Vuexy
 * และ **ห้าม** ใช้ sidenav/topbar ของฝั่ง seller/admin (ผู้ตรวจไม่มี "ร้าน" ให้สลับ)
 *
 * `requireInspectorPage()` ตรวจ session (โดเมนหลัก) + `User.isInspector` ทุกครั้งที่เปิดหน้า —
 * ไม่ผ่าน = redirect โดยไม่บอกเหตุผล (ไม่ leak URL structure ตาม edge-state ของสเปก)
 */
export default async function InspectorLayout({ children }: { children: React.ReactNode }) {
  await requireInspectorPage()

  return <div className="bg-body-bg min-h-dvh">{children}</div>
}
