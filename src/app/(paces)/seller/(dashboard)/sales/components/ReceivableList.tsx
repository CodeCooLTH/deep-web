'use client'

/**
 * ReceivableList — รายการบิลที่ยังเก็บเงินไม่ครบ พร้อมทางเข้าไปทวง (feature 00067 FR-FIN-13)
 *
 * Base: src/app/(paces)/seller/_follow-up/FollowUpCard.tsx (โครงรายการของ Paces ที่ทั้งแถวเป็นลิงก์
 *   + ไอคอนวงกลมซ้าย + ตัวเลขชิดขวา) ซึ่ง copy มาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/kanban/components/TaskItem.tsx อีกที
 *
 * 🛑 นี่คือสิ่งที่แอปบัญชีทำไม่ได้ — Deep มีบิลกับห้องแชทอยู่ระบบเดียวกัน ผู้ขายจึงกดจากยอดค้าง
 * เข้าไปทักลูกค้าได้ในคลิกเดียว ไม่ต้องไปเปิดอีกแอปแล้วหาชื่อเอง
 */
import { useCallback, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import type { ReceivableItem, ReceivableSummary } from '@/services/receivable.service'

type Props = {
  summary: ReceivableSummary
  initialItems: ReceivableItem[]
  initialCursor: string | null
  /** query string ของช่วงเวลาปัจจุบัน (เช่น `range=month`) — ต้องตรงกับที่ RSC ใช้คำนวณ summary */
  rangeQuery: string
  basisNote: string
}

export default function ReceivableList({
  summary,
  initialItems,
  initialCursor,
  rangeQuery,
  basisNote,
}: Props) {
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  /**
   * โหลดเพิ่มล้ม = ค้างรายการเดิมไว้ + ขึ้นปุ่มลองใหม่
   * toast อย่างเดียวหายไปเองแล้วผู้ใช้ไม่รู้ว่ารายการยังไม่ครบ (แพตเทิร์นเดียวกับ ExpenseWorkspace)
   */
  const [failed, setFailed] = useState(false)

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/finance/receivables?${rangeQuery}&cursor=${encodeURIComponent(cursor)}`)
      if (!res.ok) throw new Error(String(res.status))
      const data: { items: ReceivableItem[]; nextCursor: string | null } = await res.json()
      setItems((prev) => [...prev, ...data.items])
      setCursor(data.nextCursor)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [cursor, loading, rangeQuery])

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ต้องตามเก็บ</h4>
        {summary.outstandingCount > 0 && (
          <span className="badge bg-warning/15 text-warning-ink">{summary.outstandingCount} รายการ</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card-body">
          <SellerEmptyState
            icon="circle-check"
            title="เก็บเงินครบทุกงานแล้ว"
            description="ไม่มีบิลที่ค้างรับในช่วงเวลานี้"
          />
        </div>
      ) : (
        <ul className="divide-default-200 divide-y">
          {items.map((it) => (
            <li key={it.orderId}>
              {/*
                ทั้งแถวเป็นลิงก์เดียว — ปลายทางคือห้องแชทต้นทางของบิลใบนี้ถ้ามี
                🛑 `conversationId` เป็น null ได้จริงและเป็นเรื่องปกติ (ออเดอร์ก่อน 2026-08-12
                จงใจไม่ backfill เพราะการเดาเธรดจากเบอร์โทรคือบั๊กเดิมที่คอลัมน์นี้ถูกสร้างมาแก้)
                กรณีนั้นพาไปหน้าบิลแทน ซึ่งยังมีข้อมูลครบให้ติดต่อลูกค้าต่อได้
              */}
              <Link
                href={it.conversationId ? `/inbox/${it.conversationId}` : `/orders/${it.publicToken}`}
                className="hover:bg-default-100 flex min-h-11 items-center gap-3 px-5 py-3.5"
              >
                <span className="bg-warning/15 flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon
                    icon={it.conversationId ? 'message-circle' : 'file-text'}
                    className="text-warning-ink text-lg"
                    aria-hidden="true"
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-default-800 block truncate text-sm font-medium">{it.customerName}</span>
                  <span className="text-default-700 block truncate text-xs">
                    {it.title ? `${it.title} · ` : ''}
                    {it.orderNo}
                  </span>
                </span>

                <span className="shrink-0 text-end">
                  <span className="text-warning-ink block text-sm font-semibold tabular-nums">
                    {formatBaht(it.outstandingAmount)}
                  </span>
                  <span className="text-default-700 block text-xs">
                    {it.daysOutstanding > 0 ? `ค้าง ${it.daysOutstanding} วัน` : 'เปิดบิลวันนี้'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(cursor || failed) && (
        <div className="card-body pt-0 text-center">
          {failed && <p className="text-danger-ink mb-2 text-xs">โหลดรายการเพิ่มไม่สำเร็จ</p>}
          {/* `bg-light text-dark` ไม่ใช่ `btn-light` — คลาสนั้นไม่มีนิยามใน CSS ที่คอมไพล์แล้ว
              (มีเทส paces-phantom-btn-classes คุมอยู่) precedent: ExpenseList.tsx:201 */}
          <button
            type="button"
            className="btn bg-light text-dark inline-flex min-h-11 items-center gap-1.5"
            onClick={loadMore}
            disabled={loading}
          >
            {loading && <Icon icon="loader-2" className="size-4 animate-spin" aria-hidden="true" />}
            {failed ? 'ลองใหม่' : 'ดูเพิ่ม'}
          </button>
        </div>
      )}

      {/* นิยามยอดขายของแท็บนี้ — ต่างจากแท็บกำไรโดยเจตนา ต้องอยู่บนจอเสมอ (Hard Rule 16) */}
      <div className="card-body border-default-200 text-default-700 border-t border-dashed pt-4 text-xs leading-relaxed">
        {basisNote}
      </div>
    </div>
  )
}
