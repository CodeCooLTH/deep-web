'use client'

/**
 * DashboardRangeControl — filter ช่วงเวลา "วันนี้ | เดือนนี้" ระดับหน้า ของแดชบอร์ดเดสก์ท็อป
 *
 * Base: SalesChartCard.tsx segmented pill (in-app precedent — `pillClass` + role="group"
 *   + aria-pressed บน bg-default-100 p-0.5) — ตัวนั้นคุมการ์ดเดียวบนมือถือ ตัวนี้คุมทั้งหน้า
 *   จึงวางไว้ที่แถวหัว (PageBreadcrumb action) ไม่ใช่ในการ์ดใบใดใบหนึ่ง
 *
 * ทำไมเป็น cookie ไม่ใช่ localStorage: หน้าเป็น RSC ที่ fetch ตามช่วงเวลาบน server —
 * cookie ทำให้ SSR อ่านค่าได้ตั้งแต่ request แรก เปิดหน้ามาเป็นช่วงที่เลือกทันที
 * ไม่มี flash "เดือนนี้" ก่อนสลับแบบที่ localStorage (client-only) จะเป็น
 *
 * path=/ โดยตั้งใจ — ห้าม scope เป็น /seller/dashboard: บน seller subdomain เบราว์เซอร์
 * เห็น path เป็น /dashboard (proxy.ts rewrite /seller/* ให้ฝั่ง server เท่านั้น) cookie ที่
 * scope ตาม path ภายในจะไม่ถูกส่งกลับมาเลย
 *
 * สลับแล้ว: เขียน cookie + setState (optimistic — ปุ่มติดทันที) + router.refresh() ใน
 * transition; ระหว่างรอ RSC payload ใหม่ DashboardRangeFade จางเนื้อหา 60% กันคลิกซ้อน
 * ตัวเลขเก่ายังค้างจนชุดใหม่มาแทนพร้อมกัน (ไม่ blank ไม่มี full-screen overlay)
 */

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type DashboardRange = 'today' | 'month'

const COOKIE_NAME = 'seller_dashboard_range'

const RangeCtx = createContext<{
  range: DashboardRange
  isPending: boolean
  select: (r: DashboardRange) => void
} | null>(null)

function useRange() {
  const ctx = useContext(RangeCtx)
  if (!ctx) throw new Error('DashboardRangePills/Fade ต้องอยู่ใต้ DashboardRangeProvider')
  return ctx
}

export function DashboardRangeProvider({
  initialRange,
  children,
}: {
  initialRange: DashboardRange
  children: ReactNode
}) {
  const router = useRouter()
  const [range, setRange] = useState<DashboardRange>(initialRange)
  const [isPending, startTransition] = useTransition()

  const select = (r: DashboardRange) => {
    if (r === range || isPending) return
    setRange(r)
    // เขียนไม่สำเร็จ (private mode) = เสียแค่การจำค่า ครั้งหน้า default เดือนนี้ — ไม่ต้องมี error UI
    document.cookie = `${COOKIE_NAME}=${r}; path=/; max-age=31536000; SameSite=Lax`
    startTransition(() => router.refresh())
  }

  return <RangeCtx.Provider value={{ range, isPending, select }}>{children}</RangeCtx.Provider>
}

export function DashboardRangePills() {
  const { range, isPending, select } = useRange()

  // aria-disabled ไม่ใช่ disabled จริง — disabled attribute ระหว่าง transition ทำ keyboard focus
  // หลุดไป body แล้วผู้ใช้คีย์บอร์ดต้อง Tab ไล่กลับมาใหม่ทั้งหน้า; การกันคลิกซ้อนอยู่ใน
  // guard ของ select() (`r === range || isPending`) อยู่แล้ว attribute จึงมีไว้แค่บอกสถานะ
  const pillClass = (on: boolean) =>
    `min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${
      on ? 'bg-card text-primary shadow' : 'text-default-700'
    } aria-disabled:opacity-70 aria-disabled:cursor-not-allowed`

  return (
    <div className="flex items-center gap-2">
      {/* spinner อยู่นอกกล่อง pill — บอกว่ากำลังโหลดชุดข้อมูลใหม่ โดยไม่ทำให้กล่องขยับ */}
      {isPending && <Icon icon="loader-2" className="size-4 animate-spin text-default-400" aria-hidden="true" />}
      {/* ประกาศผลการสลับให้ screen reader — ข้อมูลทั้งหน้าเปลี่ยนโดยไม่มี navigation ให้รับรู้ */}
      <span className="sr-only" aria-live="polite">
        {isPending ? 'กำลังโหลดข้อมูล' : `แสดงข้อมูล${range === 'today' ? 'วันนี้' : 'เดือนนี้'}`}
      </span>
      <div
        role="group"
        aria-label="ช่วงเวลาที่แสดงในหน้านี้"
        className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5"
      >
        <button
          type="button"
          onClick={() => select('today')}
          aria-pressed={range === 'today'}
          aria-disabled={isPending || undefined}
          className={pillClass(range === 'today')}
        >
          วันนี้
        </button>
        <button
          type="button"
          onClick={() => select('month')}
          aria-pressed={range === 'month'}
          aria-disabled={isPending || undefined}
          className={pillClass(range === 'month')}
        >
          เดือนนี้
        </button>
      </div>
    </div>
  )
}

/** จางเนื้อหาระหว่างรอ refresh — ครอบทุกแถวใต้แถวหัว (รวมการ์ดที่ไม่ตาม filter ด้วย
 *  เพื่อให้ transition อ่านเป็น "ทั้งหน้ากำลังอัปเดต" ก้อนเดียว ไม่ใช่กะพริบเป็นหย่อม ๆ) */
export function DashboardRangeFade({ children }: { children: ReactNode }) {
  const { isPending } = useRange()
  return (
    <div
      aria-busy={isPending}
      className={cn('transition-opacity duration-200', isPending && 'opacity-60 pointer-events-none')}
    >
      {children}
    </div>
  )
}
