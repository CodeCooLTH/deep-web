/**
 * ExpenseLockedCard — locked/insufficient-access card สำหรับ /expenses (PACKAGE_LOCKED / STAFF_NOT_ALLOWED)
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/page.tsx:70-91 (no-shop card markup —
 *   .card.mx-auto.max-w-2xl.text-center + icon + CTA) — ปรับ copy/icon/CTA ตาม state
 * Copy/icon ตาม UX-Design-Spec.md §A "Layout — PACKAGE_LOCKED state" / "STAFF_NOT_ALLOWED state"
 * (component เดียว prop variant ตาม Theme Source Mapping table)
 *
 * pure presentational — ไม่มี state/client directive (RSC-safe, Paces ใช้ next/link ตรง ไม่ใช่ MUI
 * component={Link} → Hard Rule 2 ไม่ทับ)
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type Variant = 'PACKAGE_LOCKED' | 'STAFF_NOT_ALLOWED'

type Props = {
  variant: Variant
}

const COPY: Record<Variant, { icon: string; iconClass: string; title: string; body: string }> = {
  PACKAGE_LOCKED: {
    icon: 'lock',
    iconClass: 'text-warning',
    title: 'ฟีเจอร์นี้อยู่ใน Business Package',
    body: 'ติดตามต้นทุนสินค้า บันทึกค่าใช้จ่าย และดูรายงานกำไร-ขาดทุนแบบเต็มรูป — ปลดล็อกได้ด้วย Business Package ทุกแพ็กเกจที่จ่ายเงิน',
  },
  STAFF_NOT_ALLOWED: {
    icon: 'lock',
    iconClass: 'text-default-400',
    title: 'ยังไม่ได้รับสิทธิ์เข้าถึงข้อมูลนี้',
    body: 'เจ้าของร้านยังไม่เปิดให้พนักงานเห็นข้อมูลการเงิน ติดต่อเจ้าของร้านหากต้องการเข้าถึง',
  },
}

export default function ExpenseLockedCard({ variant }: Props) {
  const copy = COPY[variant]

  return (
    <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
      <Icon icon={copy.icon} width={64} height={64} className={`mx-auto mb-4 ${copy.iconClass}`} aria-hidden="true" />
      <h2 className="text-dark mb-2 text-xl font-bold">{copy.title}</h2>
      <p className="text-default-400 mb-6">{copy.body}</p>
      {/* STAFF_NOT_ALLOWED: ไม่มีปุ่ม action — ไม่มีอะไรให้ admin ทำเอง (ตาม spec) */}
      {variant === 'PACKAGE_LOCKED' && (
        <Link
          href="/business"
          className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
        >
          ดูแพ็กเกจ Business
          <Icon icon="arrow-right" width={18} height={18} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
