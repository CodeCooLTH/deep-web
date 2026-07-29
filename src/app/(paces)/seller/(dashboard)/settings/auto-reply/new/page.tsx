/**
 * สร้างกลุ่มคำใหม่ — /settings/auto-reply/new (feature 00023, S-13)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/page.tsx (โครง RSC + PageBreadcrumb
 *   + card > card-header) ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/apps/users/
 *   account-settings/page.tsx
 *
 * หน้านี้ตั้งใจให้ "เบา" — ขอแค่ชื่อกลุ่ม แล้วพาไปหน้าแก้ไขเต็มทันที เพราะการบังคับกรอกคำตรวจจับ
 * + คำตอบให้ครบตั้งแต่หน้าแรกทำให้ผู้ใช้เจอฟอร์มยาวก่อนเข้าใจว่ากำลังทำอะไรอยู่
 */
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import NewKeywordForm from './NewKeywordForm'

export const metadata: Metadata = { title: 'สร้างกลุ่มคำ' }

export default function NewKeywordPage() {
  return (
    <>
      <PageBreadcrumb
        title="สร้างกลุ่มคำ"
        trail={[
          { label: 'ตั้งค่า', href: '/settings' },
          { label: 'ตอบแชทอัตโนมัติ', href: '/settings/auto-reply' },
          { label: 'สร้างกลุ่มคำ' },
        ]}
      />
      <NewKeywordForm />
    </>
  )
}
