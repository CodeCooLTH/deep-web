/**
 * ยอดขายรายสินค้า — รายงานไทม์ซีรีส์รายเดือน (feature 00063)
 *
 * Base (โครงหน้า: breadcrumb → แถบควบคุม → การ์ดกราฟ → การ์ดตาราง):
 *   src/app/(paces)/seller/(dashboard)/reports/agents/page.tsx
 *   (ซึ่ง copy โครงมาจาก theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx)
 *
 * ── สิ่งที่ไฟล์นี้รับผิดชอบ ──────────────────────────────────────────────────
 * ตัดสินสิทธิ์ · แปลง query · เรียก service · ส่งของที่ serialize ได้ลงไปให้ client
 * **ไม่มีสูตรอะไรอยู่ในไฟล์นี้เลย** — เกณฑ์ทั้งหมดอยู่ใน `src/lib/product-sales-month.ts`
 * ซึ่งมีเทส `[blocker]` เป็นด่าน
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { authOptions } from '@/lib/auth'
import { formatMonthYearTH, formatTimeHM } from '@/lib/format-date'
import {
  MIN_MONTH_ISO,
  daysInMonth,
  futureFromDayIndex,
  isCurrentThaiMonth,
  maxSelectableMonth,
  parseMonthParam,
  referenceDayIndex,
  shiftMonthIso,
} from '@/lib/product-sales-month'
import { resolveProductReportAccess } from '@/services/product-report-access.service'
import { getProductSalesMonth } from '@/services/product-sales-series.service'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import MonthSwitcher from './components/MonthSwitcher'
import ProductSalesClient from './components/ProductSalesClient'

export const metadata: Metadata = { title: 'ยอดขายรายสินค้า' }

const TITLE = 'ยอดขายรายสินค้า'
const SUBTITLE = 'รายงาน'

type SearchParams = { month?: string }

export default async function ProductSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const access = await resolveProductReportAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )

  if (access.kind === 'NO_SHOP') {
    return (
      <>
        <PageBreadcrumb title={TITLE} subtitle={SUBTITLE} />
        <SellerEmptyState
          icon="building-store"
          title="ยังไม่มีร้านค้า"
          description="ต้องสร้างร้านก่อนจึงจะดูรายงานยอดขายรายสินค้าได้"
          action={{ label: 'สร้างร้านค้า', href: '/shop' }}
        />
      </>
    )
  }

  if (access.kind === 'WRONG_VERTICAL') {
    /**
     * 🛑 การ์ดข้อความ ไม่ใช่ redirect เงียบ (user เคาะ 2026-08-29) — ผู้ที่กดลิงก์มาจากที่อื่น
     * ต้องรู้ว่าเกิดอะไรขึ้น การเด้งกลับหน้าแรกเฉย ๆ อ่านเป็น "ระบบพัง"
     * นี่เป็นหน้าแรกของระบบที่กั้นตาม vertical ที่ระดับหน้าจอ (ที่มีอยู่ก่อนกั้นแค่ระดับ API/เมนู)
     */
    return (
      <>
        <PageBreadcrumb title={TITLE} subtitle={SUBTITLE} />
        <SellerEmptyState
          icon="chart-bar-off"
          title="รายงานนี้ใช้ได้เฉพาะร้านขายออนไลน์"
          description={'รายงานนี้นับยอดเป็น "ชิ้น" ต่อวันที่ลูกค้าสั่ง จึงใช้ได้เฉพาะร้านที่ขายสินค้าเป็นชิ้น ร้านบริการและบ้านพักดูยอดขายได้ที่หน้าภาพรวมร้านค้า'}
          action={{ label: 'ไปหน้าภาพรวมร้านค้า', href: '/dashboard' }}
        />
      </>
    )
  }

  if (access.kind === 'FORBIDDEN') {
    return (
      <>
        <PageBreadcrumb title={TITLE} subtitle={SUBTITLE} />
        {/* ไม่มีปุ่ม action โดยตั้งใจ — ผู้ใช้ไปหน้าอื่นแก้ปัญหานี้เองไม่ได้ ต้องให้เจ้าของร้านแก้ */}
        {/* 🛑 ต้องเรียกสวิตช์ด้วยชื่อที่ผู้ใช้เห็นจริงบนหน้าจัดการพนักงาน
            ("ให้พนักงานเห็นข้อมูลการเงิน" — FinanceVisibilityToggle) ไม่ใช่คำที่เราคิดเอง
            ไม่งั้นเจ้าของร้านหาสวิตช์ไม่เจอ (HR16) */}
        <SellerEmptyState
          icon="lock"
          title="ยังไม่มีสิทธิ์ดูรายงานนี้"
          description={'รายงานนี้เป็นข้อมูลการเงินของร้าน เจ้าของร้านต้องเปิดสวิตช์ "ให้พนักงานเห็นข้อมูลการเงิน" ที่หน้าจัดการพนักงานก่อน คุณจึงจะเห็นได้'}
        />
      </>
    )
  }

  const now = new Date()
  const month = parseMonthParam(sp.month, now)
  const monthLabel = formatMonthYearTH(new Date(Date.UTC(month.year, month.month0, 1)))

  /** เพดานบน/ล่างของปุ่ม ‹ › — ชนแล้วต้องเป็นปุ่มที่กดไม่ได้ ไม่ใช่ปุ่มที่พาไปหน้า clamped */
  const max = maxSelectableMonth(now)
  const maxNum = max.year * 12 + max.month0
  const [minY, minM] = MIN_MONTH_ISO.split('-').map(Number)
  const minNum = minY * 12 + (minM - 1)
  const curNum = month.year * 12 + month.month0
  const prevHref = curNum - 1 >= minNum ? `?month=${shiftMonthIso(month.iso, -1)}` : null
  const nextHref = curNum + 1 <= maxNum ? `?month=${shiftMonthIso(month.iso, 1)}` : null

  const monthNav = (
    <MonthSwitcher
      iso={month.iso}
      year={month.year}
      month0={month.month0}
      prevHref={prevHref}
      nextHref={nextHref}
    />
  )

  /** สถานะที่ไม่ได้เรนเดอร์ตัวหลัก (ว่าง/ล้มเหลว/ไม่มีสิทธิ์) — ต้องมีตัวเลือกเดือนครบทุกจอ */
  const header = <PageBreadcrumb title={TITLE} subtitle={SUBTITLE} action={monthNav} />

  /**
   * 🛑 หัวของ **เส้นทางหลัก** ต่างจากข้างบน 2 อย่าง เฉพาะบนมือถือ:
   * (1) ซ่อนชื่อหน้า เพราะ `SellerMobileHeader` พิมพ์คำเดียวกันเป๊ะอยู่แล้วห่างกัน 40px
   *     (ยืนยันด้วยเทส [blocker] ใน `getSellerPageTitle.test.ts` — วันที่มีคนถอด route นี้
   *     ออกจากเมนู หัวจอจะกลายเป็น "Deep ผู้ขาย" เงียบ ๆ แล้วหน้าจะไม่มีชื่ออะไรเหลือเลย)
   * (2) ซ่อนตัวเลือกเดือน เพราะมันย้ายไปอยู่ในแถบเครื่องมือ **ติดบน** ของ ProductSalesClient
   *     ซึ่งตามผู้ใช้ไปตลอดเวลาที่เลื่อน
   */
  const headerMain = (
    <PageBreadcrumb
      title={TITLE}
      subtitle={SUBTITLE}
      hideTitleBelowMd
      action={<span className="max-md:hidden">{monthNav}</span>}
    />
  )

  /**
   * 🛑 ฐานข้อมูลล่มต้องไม่หน้าตาเหมือน "เดือนนี้ขายไม่ได้เลย" — บทเรียนเดียวกับ `/customers`
   * และ `/reports/agents` ปล่อยให้ throw ขึ้นมาแล้วแยก UI คนละแบบ
   */
  let data
  try {
    data = await getProductSalesMonth(access.shop.id, month.year, month.month0)
  } catch (e) {
    console.error('[reports/products] getProductSalesMonth failed', e)
    return (
      <>
        {header}
        <SellerErrorState
          title="โหลดรายงานไม่สำเร็จ"
          message="ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว — ข้อมูลของคุณยังอยู่ครบ ลองใหม่อีกครั้งได้เลย"
          retryHref={`/reports/products?month=${month.iso}`}
        />
      </>
    )
  }

  /**
   * 🛑 ต้องเช็ค `orderCount === 0` ควบคู่เสมอ — `hasAnyProduct` นับแถวในตาราง `Product`
   * แต่รายงานนี้มีเส้นทางชั้นหนึ่งสำหรับ `productId === null` (แถว "รายการที่พิมพ์เอง")
   * ⇒ ร้านที่ปิดการขายในแชทและพิมพ์ชื่อของเองโดยไม่เคยสร้างสินค้าในระบบ จะถูกตีกลับด้วย
   * "ร้านนี้ยังไม่มีสินค้า" ทั้งที่ `data.rows` มียอดทั้งเดือนอยู่ในมือแล้ว
   * — และนั่นคือกลุ่มผู้ใช้ที่เกณฑ์ `status != CANCELLED` ถูกเลือกมาเพื่อเขาโดยเฉพาะ
   * (พบโดย /impeccable critique 2026-08-29 · ยืนยันกับ service แล้ว)
   */
  if (!data.hasAnyProduct && data.orderCount === 0) {
    return (
      <>
        {header}
        <SellerEmptyState
          icon="package-off"
          title="ร้านนี้ยังไม่มีสินค้า"
          description="เพิ่มสินค้าอย่างน้อยหนึ่งชิ้นก่อน จึงจะเริ่มเห็นรายงานยอดขายรายสินค้าได้"
          action={{ label: 'เพิ่มสินค้าแรก', href: '/products/new' }}
        />
      </>
    )
  }

  const days = daysInMonth(month.year, month.month0)

  return (
    <>
      {headerMain}

      {month.clamped && (
        /* ลิงก์เก่าที่ถูกแชร์ต่อกันไม่ควรพาไปหน้าพัง — ถอยมาเดือนปัจจุบันแล้วบอกว่าเกิดอะไรขึ้น */
        <p className="text-default-700 bg-default-100 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>เดือนที่ระบุมาในลิงก์ใช้ไม่ได้ — แสดงข้อมูลของ {monthLabel} แทน</span>
        </p>
      )}

      {data.orderCount === 0 ? (
        <div className="card">
          <div className="card-body">
            <SellerEmptyState
              compact
              icon="calendar-off"
              title={`ยังไม่มีคำสั่งซื้อใน ${monthLabel}`}
              description="ลองเลือกเดือนอื่นด้วยปุ่มลูกศรด้านบน"
            />
            <p className="text-default-400 mt-2 text-center text-xs">
              <Link href="/orders" className="text-primary underline">
                ดูคำสั่งซื้อทั้งหมด
              </Link>
            </p>
          </div>
        </div>
      ) : (
        /**
         * 🛑 `key` ผูกกับเดือน — `?month=` เป็น soft navigation ของ route เดิม React จึงคง
         * component ไว้และ `useState` initializer ไม่รันใหม่ ⇒ ย้ายจาก ส.ค. ไป ก.ค. แล้วกราฟ
         * ยังพล็อตคีย์ของ ส.ค. ทับข้อมูล ก.ค. (สินค้าที่ไม่มีในเดือนใหม่กลายเป็นเส้นแบน 0)
         * และที่ 768–1023px ไม่มีช่องติ๊กให้แก้เลย · เดือนใหม่ = รายงานใหม่ รีเซ็ตทั้งชุดถูกแล้ว
         */
        <ProductSalesClient
          key={month.iso}
          rows={data.rows}
          days={days}
          year={month.year}
          month0={month.month0}
          monthLabel={monthLabel}
          futureFrom={futureFromDayIndex(month.year, month.month0, now)}
          refDayIndex={referenceDayIndex(month.year, month.month0, now)}
          isCurrentMonth={isCurrentThaiMonth(month.year, month.month0, now)}
          orderCount={data.orderCount}
          truncated={data.truncated}
          monthIso={month.iso}
          prevHref={prevHref}
          nextHref={nextHref}
          freshnessNote={`ข้อมูล ณ ${formatTimeHM(now)} น. วันนี้ · ตัวเลขของเดือนเก่าเปลี่ยนได้ ถ้ามีคนคีย์ออเดอร์ย้อนหลัง`}
        />
      )}
    </>
  )
}
