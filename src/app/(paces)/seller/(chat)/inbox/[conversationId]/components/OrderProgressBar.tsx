'use client'

/**
 * OrderProgressBar — แถบสถานะออเดอร์ใต้หัวเธรด (งาน Order Progress 2026-08-05)
 *
 * มือถือ/แท็บเล็ต (<1280px) เท่านั้น — จอ ≥1280px (xl) มี CustomerPanel persistent ที่เห็น
 * การ์ดออเดอร์พร้อม timeline อยู่แล้ว แถบนี้จะซ้ำ (breakpoint ต้องตรงกับ `xl:block` ของ
 * CustomerPanel ใน page.tsx เสมอ — เคยมีบทเรียน iPad Pro 1024-1279 ตกหล่นทั้งสองทาง)
 *
 * ยุบเป็นค่าตั้งต้นเสมอ ไม่จำสถานะกาง (เหมือน ThreadStatusBar): แถบนี้เป็นทางลัดดูสถานะ
 * ไม่ใช่ alert — โทน primary ไม่ใช่ warning/danger
 *
 * Base: ./ThreadStatusBar.tsx (โครงยุบ/กาง + truncate + badge +N + ปุ่มย่อ)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { SHIPPING_STAGE_LABEL } from '@/lib/order-stage'
import { filterActiveOrders, orderShippingStage, STAGE_CHIP_CLS } from '@/lib/chat-order-progress'
import ShipmentStepper from '../../../_components/ShipmentStepper'
import { useDraftOrders } from '../../../_components/DraftOrderProvider'
import type { CustomerPanelOrder } from './CustomerPanel'

export default function OrderProgressBar({
  orders,
  conversationId,
  customerName,
  channel,
  customerAvatar,
}: {
  orders: CustomerPanelOrder[]
  conversationId: string
  customerName: string
  channel: string
  customerAvatar: string | null
}) {
  const [open, setOpen] = useState(false)
  const { openDraft } = useDraftOrders()

  // "ยังไม่จบงาน" ตัดสินด้วย deriveShippingStage ตัวเดียวกับไทล์ Command Center — ห้ามเขียนซ้ำ
  const active = filterActiveOrders(orders)
  if (active.length === 0) return null

  const head = active[0]
  const headStage = orderShippingStage(head)
  const headLabel = headStage === 'DONE' ? '' : SHIPPING_STAGE_LABEL[headStage]
  const displayNo = (o: CustomerPanelOrder) => o.orderNo || o.token.slice(0, 8).toUpperCase()

  // แตะการ์ดใบไหน → หน้าต่างพัสดุเดิม (ย่อได้ ค้างข้ามห้อง) — กลไกเดียวกับปุ่มพัสดุใน
  // CustomerPanel ไม่เปิดโมดัลแบบใหม่ (จะได้มีวิธีเดียว พฤติกรรมเดียว)
  const openShipment = (token: string) =>
    openDraft({
      conversationId,
      customerName,
      channel,
      customerAvatar,
      kind: 'SHIPMENT',
      shipmentOrderToken: token,
    })

  return (
    <div className="px-4 pt-4 xl:hidden">
      {open ? (
        <div className="space-y-2">
          {/* เกิน ~4 ใบให้เลื่อนในตัวเอง — แถบกางห้ามดันเธรดจนข้อความหายทั้งจอ */}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {active.map((o) => {
              const stage = orderShippingStage(o)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openShipment(o.token)}
                  aria-label={`ดูรายละเอียดพัสดุของคำสั่งซื้อ ${displayNo(o)}`}
                  className="border-default-200 bg-card hover:bg-default-50 block w-full rounded-lg border px-3 py-2.5 text-start transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-default-900 text-xs font-bold tabular-nums">{displayNo(o)}</span>
                    {stage !== 'DONE' && (
                      <span className={`${STAGE_CHIP_CLS[stage]} rounded px-1.5 py-0.5 text-2xs font-medium`}>
                        {SHIPPING_STAGE_LABEL[stage]}
                      </span>
                    )}
                    <span className="text-primary ms-auto text-xs font-bold">
                      ฿{Number(o.totalAmount).toLocaleString('th-TH')}
                    </span>
                  </span>
                  {o.shipment?.status != null ? (
                    <>
                      <span className="mt-1.5 block">
                        <ShipmentStepper
                          shipmentStatus={o.shipment.status}
                          carrierStatus={o.shipment.carrierStatus ?? null}
                          size="sm"
                          showNotice={false}
                        />
                      </span>
                      {o.shipment.trackingNo && (
                        <span className="text-default-700 mt-1 block truncate text-2xs">
                          {o.shipment.courierName ? `${o.shipment.courierName} · ` : ''}
                          {o.shipment.trackingNo}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-default-700 mt-1 block text-2xs">
                      ไม่มีหมายเลขพัสดุ — สั่งซื้อเมื่อ {formatDateTime(new Date(o.createdAt))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-default-700 hover:text-default-700 flex items-center gap-1 text-xs font-medium"
          >
            <Icon icon="chevron-up" className="text-sm" />
            ย่อสถานะออเดอร์
          </button>
        </div>
      ) : (
        <div className="bg-primary/15 text-primary-ink flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="truck-delivery" className="shrink-0 text-lg" aria-hidden="true" />
          {/* min-w-0 + truncate: คงความสูง 1 บรรทัดเสมอ — รายละเอียดเต็มอยู่ในตัวกาง */}
          <span className="min-w-0 flex-1 truncate">
            {displayNo(head)} · {headLabel}
          </span>
          {active.length > 1 && (
            <span className="bg-card/60 shrink-0 rounded px-1.5 text-xs font-semibold">+{active.length - 1}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={
              active.length > 1 ? `ดูสถานะออเดอร์ทั้ง ${active.length} รายการ` : 'ดูรายละเอียดสถานะออเดอร์'
            }
            title="ดูรายละเอียด"
            className="hover:bg-card/50 -m-1 flex shrink-0 items-center rounded p-1"
          >
            <Icon icon="chevron-down" className="text-base" />
          </button>
        </div>
      )}
    </div>
  )
}
