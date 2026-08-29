/**
 * MonthSwitcher — ปุ่ม ‹ เดือน › ของรายงานยอดขายรายสินค้า (feature 00062)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (`.btn.btn-icon` + button group)
 *
 * 🛑 เป็น **server component ล้วน** และปุ่มเป็น `<Link>` จริง ไม่ใช่ปุ่มที่แก้ state —
 * ผู้ใช้ต้องกด back ของเบราว์เซอร์แล้วกลับมาเดือนเดิมได้ และส่งลิงก์ให้กันดูได้
 * (แพตเทิร์นเดียวกับ `?from=&to=` ของ `/sales` และ `/reports/agents`)
 *
 * 🛑 `min-h-11 min-w-11` — `.btn.btn-icon` ของธีมสูง 37px ซึ่งต่ำกว่าเกณฑ์พื้นที่นิ้ว 44px
 * ที่ `PRODUCT.md` ประกาศไว้เอง (ท่าเดียวกับที่ `ReportFilters.tsx` ทำกับปุ่ม preset)
 */
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { formatMonthYearTH } from '@/lib/format-date'

type Props = {
  /** `YYYY-MM` ของเดือนที่กำลังดู */
  iso: string
  year: number
  month0: number
  /** null = ไปต่อไม่ได้แล้ว (ชนเพดานบน) — ต้องแสดงปุ่มที่กดไม่ได้ ไม่ใช่ซ่อนปุ่มทิ้ง */
  prevHref: string | null
  nextHref: string | null
}

export default function MonthSwitcher({ iso, year, month0, prevHref, nextHref }: Props) {
  // วันที่ 1 เวลา 07:00 ไทย — ปลอดภัยจากการตกเดือนไม่ว่าเซิร์ฟเวอร์จะอยู่โซนไหน
  const label = formatMonthYearTH(new Date(Date.UTC(year, month0, 1, 0, 0, 0)))

  return (
    <div className="flex items-center gap-1" data-month={iso}>
      <NavButton
        href={prevHref}
        icon="chevron-left"
        label="เดือนก่อนหน้า"
      />
      <span className="text-default-900 min-w-36 text-center text-sm font-semibold">{label}</span>
      <NavButton href={nextHref} icon="chevron-right" label="เดือนถัดไป" />
    </div>
  )
}

function NavButton({
  href,
  icon,
  label,
}: {
  href: string | null
  icon: string
  label: string
}) {
  /**
   * 🛑 ห้ามใช้ `btn-light`/`btn-primary` — `_buttons.css` ของธีมมีแค่ `.btn/.btn-lg/.btn-sm/.btn-icon`
   * (`btn-light` ที่ grep เจอคือ `.btn-light.active` ใน `plugins/_apexcharts.css` = toolbar ของกราฟ
   * คนละเรื่องกัน) สีของปุ่มมาจาก utility เสมอ — คลาสชุดนี้คือชุดที่ใช้อยู่แล้ว 4 จุดในโปรเจกต์
   */
  const base =
    'btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border'
  if (!href) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        title={label}
        className={`${base} text-default-300 pointer-events-none`}>
        <Icon icon={icon} className="text-base rtl:rotate-180" aria-hidden="true" />
      </span>
    )
  }
  return (
    <Link href={href} aria-label={label} title={label} className={base}>
      <Icon icon={icon} className="text-base rtl:rotate-180" aria-hidden="true" />
    </Link>
  )
}
