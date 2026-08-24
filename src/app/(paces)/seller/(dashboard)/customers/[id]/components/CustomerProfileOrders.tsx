/**
 * CustomerProfileOrders — รายการออเดอร์ทั้งหมดของลูกค้าคนนี้กับร้านนี้ (feature 00057)
 *
 * 🛑 **จงใจไม่ยก `OrderCard.tsx` มาทั้งใบ** — การ์ดนั้นมี items/shipping/payment ซ้อน 4 ชั้น
 * ซึ่งในบริบท "ดูประวัติทั้งหมดของคนนี้" เป็นข้อมูลซ้ำซ้อน (กดเข้าไปดูรายละเอียดเต็มได้จากแถว
 * อยู่แล้ว) และทำให้เห็นออเดอร์ต่อจอน้อยลงมาก — ที่นี่ต้องการ "กวาดตาดูทั้งประวัติ" ไม่ใช่
 * "อ่านใบเดียวให้ละเอียด"
 *
 * server component ล้วน — ทั้งแถวเป็นลิงก์ ปุ่มแชทเป็นลิงก์ซ้อน (stretched-link)
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import { formatDateTime } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { ORDER_STATUS_META } from '@/lib/order-display'
import type { CustomerDirectoryOrder } from '@/lib/customer-directory'

type Props = {
  orders: CustomerDirectoryOrder[]
  /** คำนามผันตาม vertical (`ORDER_VOCAB.noun`) — ห้ามต่อคำเอง */
  vocabNoun: string
}

export default function CustomerProfileOrders({ orders, vocabNoun }: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">
          {vocabNoun}ทั้งหมด ({orders.length})
        </h4>
      </div>
      <div className="flex flex-col">
        {orders.map((o) => {
          const meta = ORDER_STATUS_META[o.status]
          return (
            <div
              key={o.publicToken}
              className="border-default-100 relative flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
              {/* stretched-link: ทั้งแถวกดเข้าออเดอร์ ปุ่มแชทยกขึ้น z-10 ให้กดแยกได้ */}
              <Link
                href={`/orders/${o.publicToken}`}
                className="absolute inset-0 z-0"
                aria-label={`เปิด${vocabNoun} ${formatOrderNo(o.publicToken, o.createdAtISO)}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-default-900 mb-0 truncate font-mono text-sm font-medium">
                  {formatOrderNo(o.publicToken, o.createdAtISO)}
                </p>
                <p className="text-default-500 text-2xs mb-0">
                  {formatDateTime(o.createdAtISO)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-default-900 mb-0 text-sm font-semibold tabular-nums">
                  {formatBaht(o.totalAmount)}
                </p>
                {meta && (
                  <span className={`badge text-2xs inline-flex items-center gap-1 ${meta.cls}`}>
                    <Icon icon={meta.icon} className="text-xs" aria-hidden="true" />
                    {meta.label}
                  </span>
                )}
              </div>
              {/* ผูกกับเธรดที่สร้างออเดอร์ใบนี้จริง (Order.conversationId) — ไม่มีค่า = ไม่ render
                  ปุ่ม **ห้ามเดาเธรดจากเบอร์/Customer** (schema เพิ่มคอลัมน์นี้มาเพื่อเลิกเดาพอดี) */}
              {o.conversationId ? (
                <Link
                  href={`/inbox/${o.conversationId}`}
                  className="text-default-400 hover:text-primary relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-full lg:size-8"
                  aria-label={`เปิดแชทของ${vocabNoun}นี้`}
                  title="เปิดแชท">
                  <Icon icon="message-circle" className="text-sm" aria-hidden="true" />
                </Link>
              ) : (
                // ตรึงที่ว่างไว้ให้เท่ากับปุ่ม เพื่อให้ chevron ของทุกแถวอยู่แนวเดียวกัน
                <span className="size-11 shrink-0 lg:size-8" aria-hidden="true" />
              )}
              <Icon
                icon="chevron-right"
                className="text-default-300 shrink-0 text-sm"
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
