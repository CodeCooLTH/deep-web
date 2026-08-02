'use client'

/**
 * SalesChartCard — การ์ด mini ยอดขาย (command center) จิ้ม → เปิด SalesChartSheet เต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (.card/.card-body shell + chg indicator: arrow-up/arrow-down + text-success/text-danger)
 *
 * Sparkline = div bars ธรรมดา (ไม่ใช่ ApexChart) — เป็น mini indicator ระดับไอคอน ไม่ใช่กราฟที่ต้อง build
 * chart options จริง จึงไม่เข้าเงื่อนไข HR10 (แค่ flex + bg utility, ไม่มี charting library ใด ๆ)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, profitDisplay } from '@/lib/format-money'
import type { SalesSeries } from '../_constants/command-center'
import SalesChartSheet from './SalesChartSheet'

type Props = {
  /** null/undefined = fetch เดือนนี้ล้มตอน SSR → ซ่อนการ์ดทั้งหมด (honest-hide) */
  initialSeries: SalesSeries | null | undefined
}

export default function SalesChartCard({ initialSeries }: Props) {
  const [open, setOpen] = useState(false)

  if (!initialSeries) return null

  const {
    values, confirmedValues, unconfirmedValues, expenseValues,
    total, prevTotal, futureFromIndex, totalExpense, netProfit,
  } = initialSeries
  // prevTotal===0 → คำนวณ % ไม่ได้ (หาร 0) → ซ่อน chg indicator
  const chg = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
  // ไม่ผ่าน gate สิทธิ์ค่าใช้จ่าย → ไม่มีกำไรให้แสดง: hero กลับไปเป็นยอดขายเหมือนเดิม
  const profit = totalExpense != null ? profitDisplay(netProfit ?? 0) : null

  // sparkline = ทั้งเดือน (ทุกวัน) — ไม่ slice ท้าย ไม่งั้นต้นเดือน (วันนี้ยังน้อย) จะโดนตัดออกจนเห็นแต่แท่งอนาคตว่าง
  const sparkValues = values
  const sparkFutureFrom = futureFromIndex

  /**
   * สเกลร่วมสองทิศ — 1px เหนือเส้นฐานกับ 1px ใต้เส้นฐาน มีค่าเท่ากันเป็นบาท
   * แบ่งความสูงตามอัตราส่วน max(ยอดขาย):max(ค่าใช้จ่าย) ของช่วงนั้นเอง แทน 50/50 ตายตัว
   *   → เดือนที่ค่าใช้จ่ายน้อย แถบล่างบางเอง ไม่กินที่
   *   → เดือนที่ค่าใช้จ่ายท่วมยอดขาย แถบล่างสูงกว่าแถบบนทันที = สัญญาณที่ต้องเห็นให้ได้ใน 56px
   * expenseValues === undefined = ไม่ผ่าน gate → คงสไปรค์ไลน์ทิศเดียวเหมือนเดิมทุกประการ
   */
  const expValues = expenseValues ?? null
  const maxSale = Math.max(0, ...sparkValues)
  const maxExp = expValues ? Math.max(0, ...expValues) : 0
  const upShare = maxSale / Math.max(1, maxSale + maxExp)
  const max = Math.max(1, maxSale)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card w-full text-start"
        aria-label="ดูรายงานยอดขายและกำไร"
      >
        <div className="card-body">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon icon="chart-bar" className="size-4 text-primary" />
              <span className="text-sm font-bold text-dark">ยอดขายและกำไร</span>
              <span className="text-sm text-default-700">· เดือนนี้</span>
            </div>
            <Icon icon="chevron-right" className="size-4 text-default-700" />
          </div>

          {/* ตัวเลขพระเอก = กำไรสุทธิ (ร้านที่มีสิทธิ์ดู) ส่วนยอดขายลงมาเป็นบรรทัดรอง
              เดิม hero เป็นยอดขายซึ่งไม่หักค่าใช้จ่าย ผู้ใช้จึงไม่รู้กำไรจริง (feedback prod 2026-08-02)
              %เทียบเดือนก่อนต้องอยู่ข้าง "ขายได้" เพราะ prevTotal คือยอดขายเดือนก่อน ไม่ใช่กำไรเดือนก่อน */}
          {/* ต้อง render label เสมอ — `profit.text` ไม่มีคำนำหน้าแล้ว ทิศทางสื่อผ่าน label + สี
              ถ้าไม่มี label ตัวเลขจะลอยจนอ่านไม่ออกว่าเป็นกำไรหรือยอดขาย */}
          <p className="text-default-700 text-xs">{profit ? profit.label : 'ยอดขาย'}</p>
          <p className={`text-xl font-bold ${profit ? profit.toneClass : 'text-dark'}`}>
            {profit ? profit.text : formatBaht(total)}
          </p>
          {(profit || chg != null) && (
            <p className="mb-3 flex items-center gap-2 text-sm text-default-700">
              {profit && <span>ยอดขายทั้งหมด {formatBaht(total)}</span>}
              {chg != null && (
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold ${
                    chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'
                  }`}
                >
                  {chg !== 0 && <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-3.5" aria-hidden="true" />}
                  {Math.abs(chg)}%
                </span>
              )}
            </p>
          )}

          {/* สไปรค์ไลน์สองทิศ — เหนือเส้นฐาน = ยอดขาย (น้ำเงิน=ยืนยันแล้ว / เหลือง=รอยืนยัน / เทา=อนาคต),
              ใต้เส้นฐาน = ค่าใช้จ่าย (แดง) สเกลร่วมกัน 1px = จำนวนบาทเท่ากันทั้งบนและล่าง
              สีตรงกับซีรีส์ในชีตเป๊ะ: bg-primary=chart-primary · bg-warning=warning · bg-danger=chart-beta
              ยังเป็น div bars ธรรมดา ไม่ใช่ charting library → ไม่เข้าเงื่อนไข HR10 (ดู comment บนไฟล์) */}
          <div className={expValues ? 'flex h-14 flex-col' : 'h-12'}>
            <div
              className="flex items-end gap-0.5"
              style={expValues ? { height: `${upShare * 100}%` } : { height: '100%' }}
            >
              {sparkValues.map((v, i) => {
                const pct = Math.max(4, Math.round((v / max) * 100))
                const isFuture = i >= sparkFutureFrom
                if (isFuture || v <= 0) {
                  return <div key={i} className="flex-1 rounded-t-sm bg-default-200" style={{ height: `${pct}%` }} />
                }
                const uPct = Math.round(((unconfirmedValues[i] ?? 0) / v) * 100)
                return (
                  <div key={i} className="flex flex-1 flex-col overflow-hidden rounded-t-sm" style={{ height: `${pct}%` }}>
                    <div className="bg-warning" style={{ height: `${uPct}%` }} />
                    <div className="flex-1 bg-primary" />
                  </div>
                )
              })}
            </div>
            {expValues && (
              <>
                <div className="bg-default-300 h-px" aria-hidden="true" />
                <div className="flex flex-1 items-start gap-0.5">
                  {expValues.map((e, i) => (
                    <div
                      key={i}
                      className="bg-danger flex-1 rounded-b-sm"
                      style={{ height: e > 0 ? `${Math.max(4, Math.round((e / Math.max(1, maxExp)) * 100))}%` : 0 }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </button>

      {open && <SalesChartSheet initialSeries={initialSeries} onClose={() => setOpen(false)} />}
    </>
  )
}
