/**
 * 🛑 'use client' โดยตั้งใจ — ไม่ใช่เพราะต้องการ interactivity
 *
 * ป้าย "หน้าหลัก" ต้องตามภาษาที่ผู้ใช้เลือก ทางเลือกฝั่งเซิร์ฟเวอร์คือทำให้ component นี้เป็น
 * `async` แล้วเรียก `getT()` — ซึ่งใช้ไม่ได้ เพราะมี `loading.tsx` **13 ไฟล์** ที่เรนเดอร์
 * component นี้เป็น Suspense fallback: fallback ที่ suspend เองคือ fallback ที่ไม่มีอะไรให้แสดง
 * ระหว่างรอ ⇒ อ่านเป็นจอว่างแทนที่จะเป็นโครงหน้า
 *
 * ปลอดภัยเพราะผู้เรียกทั้ง 72 ไฟล์อยู่ใต้ `(paces)/layout.tsx` ซึ่ง mount `LocaleProvider` ไว้แล้ว
 * (`useT()` โยนเมื่ออยู่นอก provider โดยตั้งใจ — ดู LocaleProvider.tsx)
 */
'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import Icon from './wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export type Crumb = { label: string; href?: string }

type PageBreadcrumbProps = {
  title: string
  trail?: Crumb[]
  subtitle?: string
  homeHref?: string
  homeLabel?: string
  /**
   * ปุ่ม/ควบคุมระดับหน้า วางชิดขวาคู่กับ breadcrumb (เช่น "ลิงก์เชิญพนักงาน" ของ /admins)
   * optional — หน้าที่ไม่ส่งมาได้ layout เดิมทุกประการ (ไม่ render wrapper เพิ่ม)
   */
  action?: ReactNode
}

const PageBreadcrumb = ({
  title,
  trail,
  subtitle,
  homeHref = '/',
  homeLabel,
  action,
}: PageBreadcrumbProps) => {
  // ป้าย "หน้าหลัก" เป็นคำของเรา ไม่ใช่ของผู้ใช้ ⇒ ต้องตามภาษาที่เลือก
  // (ผู้เรียกส่ง homeLabel มาเองได้เมื่อหน้านั้นอยากเรียกจุดตั้งต้นด้วยชื่ออื่น)
  const t = useT()
  const home = homeLabel ?? t.common.home
  const crumbs: Crumb[] = trail ?? (subtitle ? [{ label: subtitle }] : [])

  const breadcrumb = (
    <div className="hidden items-center gap-1.25 text-sm font-semibold md:flex">
      <Link href={homeHref} className="text-sm font-medium">
        {home}
      </Link>
      <Icon icon="chevron-right" className="shrink-0 text-sm rtl:rotate-180" />
      {crumbs.map((c) => (
        <span key={`${c.label}-${c.href ?? ''}`} className="inline-flex items-center gap-1.25">
          {c.href ? (
            <Link href={c.href} className="text-sm font-medium">
              {c.label}
            </Link>
          ) : (
            <span className="text-sm font-medium">{c.label}</span>
          )}
          <Icon icon="chevron-right" className="shrink-0 text-sm rtl:rotate-180" />
        </span>
      ))}
      <span className="text-default-400 text-sm font-medium" aria-current="page">
        {title}
      </span>
    </div>
  )

  return (
    <div className="page-title-head">
      <h4 className="page-main-title">{title}</h4>
      {action ? (
        // จับ breadcrumb + action เป็นก้อนเดียวเพื่อให้ justify-between ของ .page-title-head
        // ยังแบ่งเป็น "ชื่อหน้า | ที่เหลือ" เหมือนเดิม (ถ้าปล่อยเป็น 3 ลูก จะกระจายห่างผิดจังหวะ)
        <div className="flex items-center gap-3">
          {breadcrumb}
          {action}
        </div>
      ) : (
        breadcrumb
      )}
    </div>
  )
}

export default PageBreadcrumb
