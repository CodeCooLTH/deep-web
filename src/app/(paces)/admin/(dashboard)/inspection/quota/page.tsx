/**
 * /admin/inspection/quota — โควตารับสมัครรายเดือนต่อขั้น (feature 00060 · T13 · UX Design Spec
 * Surface D, ร่างสั้น: "จัดการโควตา: form-input ตัวเลขต่อขั้นต่อเดือน + ปุ่มบันทึก")
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/page.tsx (RSC wrapper pattern) +
 *   `_forms.css` (`form-input`) — ฟอร์มตัวเลข 4 ช่องต่อขั้น ไม่มี theme page เฉพาะสำหรับ "โควตา"
 *   จึงยึด card + form-input ตาม §4 ของ paces-component-reference.md
 *
 * 🛑 `year`/`month` ต้องมาจาก `thaiDayKey()` เดียวกับที่ `GET /api/admin/inspection/quota`
 * ใช้เป็นค่าเริ่มต้น — ห้ามคำนวณ `new Date().getFullYear()`/`getMonth()` เอง (UTC) ไม่งั้น
 * เดือนที่แสดงตอนโหลดหน้ากับเดือนที่ query ตอน backend จะเหลื่อมกัน 7 ชั่วโมงในบางช่วงเวลา
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { requireAdmin } from '@/lib/auth'
import { thaiDayKey } from '@/lib/format-date'
import { getIntakeQuotaOverview } from '@/services/inspection-admin.service'
import QuotaFormClient from './components/QuotaFormClient'

export const metadata: Metadata = { title: 'โควตารายเดือน — ตรวจสอบร้าน' }

export default async function AdminInspectionQuotaPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/admin/auth/sign-in')

  const [year, month] = thaiDayKey(new Date()).split('-').map(Number)
  const quotas = await getIntakeQuotaOverview(year, month)

  return (
    <>
      <PageBreadcrumb title="โควตารายเดือน" trail={[{ label: 'ระบบ' }, { label: 'ตรวจสอบร้าน', href: '/inspection' }]} />
      <QuotaFormClient initialYear={year} initialMonth={month} initialQuotas={quotas} />
    </>
  )
}
