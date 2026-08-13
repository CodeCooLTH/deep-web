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
import { getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.channels.selectPageTitle }
}

export default async function SelectPagesPage() {
  const t = await getT()
  return (
    <>
      <PageBreadcrumb
        title={t.channels.selectPageTitle}
        trail={[
          { label: t.channels.breadcrumbSettings, href: '/settings' },
          { label: t.channels.pageTitle, href: '/settings/channels' },
          { label: t.channels.selectBreadcrumb },
        ]}
      />

      <div className="card">
        {/* section header — Paces border-dashed pattern เดียวกับหน้า channels */}
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm uppercase w-full justify-center">
            <Icon icon="brand-facebook" className="text-base" aria-hidden="true" />
            {t.channels.selectPageTitle}
          </h5>
        </div>

        <SelectPagesClient />
      </div>
    </>
  )
}
