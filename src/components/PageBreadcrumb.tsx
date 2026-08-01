import Link from 'next/link'
import type { ReactNode } from 'react'
import Icon from './wrappers/Icon'

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
  homeLabel = 'หน้าหลัก',
  action,
}: PageBreadcrumbProps) => {
  const crumbs: Crumb[] = trail ?? (subtitle ? [{ label: subtitle }] : [])

  const breadcrumb = (
    <div className="hidden items-center gap-1.25 text-sm font-semibold md:flex">
      <Link href={homeHref} className="text-sm font-medium">
        {homeLabel}
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
