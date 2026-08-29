/**
 * ยอดขายรายสินค้า — รายงานไทม์ซีรีส์รายเดือน (feature 00062)
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

  const header = (
    <PageBreadcrumb
      title={TITLE}
      subtitle={SUBTITLE}
      action={
        <MonthSwitcher
          iso={month.iso}
          year={month.year}
          month0={month.month0}
          prevHref={prevHref}
          nextHref={nextHref}
        />
      }
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

  if (!data.hasAnyProduct) {
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
      {header}

      {month.clamped && (
        /* ลิงก์เก่าที่ถูกแชร์ต่อกันไม่ควรพาไปหน้าพัง — ถอยมาเดือนปัจจุบันแล้วบอกว่าเกิดอะไรขึ้น */
        <p className="text-default-700 bg-default-100 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>เดือนที่ระบุมาในลิงก์ใช้ไม่ได้ — แสดงข้อมูลของ {monthLabel} แทน</span>
        </p>
      )}

      {/**
       * 🛑 `Order.createdAt` = "วันที่ลูกค้าสั่ง" ที่ผู้ขายระบุย้อนหลังได้ 90 วัน / ล่วงหน้า 7 วัน
       * ⇒ ตัวเลขของเดือนที่ปิดไปแล้วยังขยับได้ ผู้ขายที่เปิดดูสองครั้งแล้วเห็นเลขไม่ตรงกัน
       * โดยไม่มีคำอธิบาย จะสรุปว่าระบบคำนวณผิดแล้วเลิกเชื่อทั้งหน้า
       */}
      <p className="text-default-400 mb-3 text-xs">
        ข้อมูล ณ {formatTimeHM(now)} น. วันนี้ · ตัวเลขของเดือนเก่าเปลี่ยนได้ ถ้ามีคนคีย์ออเดอร์ย้อนหลัง
      </p>

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
        <ProductSalesClient
          rows={data.rows}
          days={days}
          year={month.year}
          month0={month.month0}
          monthLabel={monthLabel}
          futureFrom={futureFromDayIndex(month.year, month.month0, now)}
          refDayIndex={referenceDayIndex(month.year, month.month0, now)}
          orderCount={data.orderCount}
          truncated={data.truncated}
        />
      )}
    </>
  )
}
