/**
 * เลือกเพจที่จะเชื่อม — /settings/channels/select (feature 00018 — หน้าเลือกเพจหลัง OAuth)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx
 *   — card + card-header border-dashed section header + PageBreadcrumb (หน้าพี่น้อง)
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว. หน้านี้เป็นแค่เปลือก:
 * ข้อมูลเพจอยู่หลัง httpOnly cookie (user token) จึงต้อง fetch ฝั่ง client (SelectPagesClient)
 * — server อ่าน cookie นั้นมา render ตรงไม่ได้เพราะ token ถูกจงใจไม่ส่งออกไปฝั่งไหนนอกจาก 2 route
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import type { Metadata } from 'next'
import { SelectPagesClient } from './SelectPagesClient'

export const metadata: Metadata = { title: 'เลือกเพจที่จะเชื่อม' }

export default function SelectPagesPage() {
  return (
    <>
      <PageBreadcrumb
        title="เลือกเพจที่จะเชื่อม"
        trail={[
          { label: 'ตั้งค่า', href: '/settings' },
          { label: 'ช่องทางแชท', href: '/settings/channels' },
          { label: 'เลือกเพจ' },
        ]}
      />

      <div className="card">
        {/* section header — Paces border-dashed pattern เดียวกับหน้า channels */}
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm uppercase w-full justify-center">
            <Icon icon="brand-facebook" className="text-base" aria-hidden="true" />
            เลือกเพจที่จะเชื่อม
          </h5>
        </div>

        <SelectPagesClient />
      </div>
    </>
  )
}
