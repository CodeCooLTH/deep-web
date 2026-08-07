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
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import { courierLogoUrl } from '@/lib/iship/courier'
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
  pageAvatarUrl,
}: {
  orders: CustomerPanelOrder[]
  conversationId: string
  customerName: string
  channel: string
  customerAvatar: string | null
  /** รูปเพจของเธรด — badge มุม avatar ในหน้าต่าง/ชิปที่ย่อไว้ (user สั่ง 2026-08-07) */
  pageAvatarUrl: string | null
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

  // ข้อความ/พฤติกรรมชุดเดียวกับปุ่มคัดลอกในโมดัลพัสดุ (ShipmentStatusView.handleCopy) —
  // clipboard ต้องการ https บน dev ที่ไม่ใช่ https จะล้มเหลว ต้องบอกตามตรงไม่ใช่เงียบ
  async function copyTracking(trackingNo: string) {
    try {
      await navigator.clipboard.writeText(trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  // แตะการ์ดใบไหน → หน้าต่างพัสดุเดิม (ย่อได้ ค้างข้ามห้อง) — กลไกเดียวกับปุ่มพัสดุใน
  // CustomerPanel ไม่เปิดโมดัลแบบใหม่ (จะได้มีวิธีเดียว พฤติกรรมเดียว)
  const openShipment = (token: string) =>
    openDraft({
      conversationId,
      customerName,
      channel,
      customerAvatar,
      pageAvatarUrl,
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
              const sh = o.shipment
              const logo = courierLogoUrl(sh?.courierCode, sh?.courierName)
              const courierLabel = sh?.courierName ?? sh?.courierCode ?? 'ขนส่ง'
              return (
                /* การ์ดเป็น <div> + แผ่นลิงก์คลุมทั้งใบ ไม่ใช่ <button> ก้อนเดียวเหมือนเดิม —
                   ปุ่มคัดลอกเลขพัสดุอยู่ข้างใน ปุ่มซ้อนปุ่มเป็น HTML ที่ใช้ไม่ได้จริง
                   Base (โครง stretched-link + relative z-10 บนปุ่มจริง):
                   src/app/(paces)/seller/(dashboard)/orders/components/OrderCard.tsx:148 */
                <div
                  key={o.id}
                  className="border-default-200 bg-card relative rounded-lg border px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => openShipment(o.token)}
                    aria-label={`ดูรายละเอียดพัสดุของคำสั่งซื้อ ${displayNo(o)}`}
                    // แผ่นนี้เป็น absolute ส่วนเนื้อการ์ดเป็น static — ของที่ position: static จะถูก
                    // แผ่นนี้ทับไว้ทั้งหมด คลิกตรงไหนของการ์ดก็เข้าแผ่นนี้ (จึงห้ามใส่ relative ให้
                    // เนื้อหา ยกเว้นปุ่มคัดลอกที่ต้องกดได้จริง = relative z-10)
                    // พื้น hover ต้องโปร่ง (bg-default-500/5) ไม่ใช่สีทึบ ไม่งั้นมันบังเนื้อการ์ดตอน hover
                    className="hover:bg-default-500/5 active:bg-default-500/10 absolute inset-0 rounded-lg transition-colors"
                  />

                  <div className="flex items-center gap-2">
                    <span className="text-default-900 text-xs font-bold tabular-nums">{displayNo(o)}</span>
                    {stage !== 'DONE' && (
                      <span className={`${STAGE_CHIP_CLS[stage]} rounded px-1.5 py-0.5 text-2xs font-medium`}>
                        {SHIPPING_STAGE_LABEL[stage]}
                      </span>
                    )}
                    <span className="text-primary ms-auto text-xs font-bold">
                      ฿{Number(o.totalAmount).toLocaleString('th-TH')}
                    </span>
                  </div>

                  {sh?.status != null ? (
                    <>
                      {/* หัวพัสดุ — ยกมาทั้งบล็อกจากการ์ดออเดอร์ในบับเบิล ซึ่งคือจอที่ user ชี้ว่า
                          "ให้เหมือนแบบนี้" (2026-08-07): โลโก้ขนส่ง · ชื่อขนส่งตัวเล็ก · เลขพัสดุ
                          ตัวหนา + ปุ่มคัดลอก. สองการ์ดนี้แสดงของชิ้นเดียวกันคนละที่ ต้องหน้าตาเดียวกัน
                          Base: src/app/(paces)/seller/(chat)/_components/OrderCardView.tsx:141-164 */}
                      <div className="mt-2 flex items-center gap-2">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logo}
                            alt={courierLabel}
                            className="size-8.5 shrink-0 rounded-lg object-contain"
                          />
                        ) : (
                          <span className="bg-default-100 text-default-700 flex size-8.5 shrink-0 items-center justify-center rounded-lg">
                            <Icon icon="truck-delivery" className="text-base" aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-default-700 block truncate text-2xs">{courierLabel}</span>
                          <span className="text-default-900 block truncate text-xs font-bold tabular-nums">
                            {sh.trackingNo ?? '—'}
                          </span>
                        </span>
                        {sh.trackingNo && (
                          // z-10: ยกขึ้นเหนือแผ่นลิงก์ที่คลุมทั้งใบ ไม่งั้นกดแล้วได้หน้าต่างพัสดุแทน
                          <button
                            type="button"
                            onClick={() => void copyTracking(sh.trackingNo!)}
                            aria-label={`คัดลอกเลขพัสดุ ${sh.trackingNo}`}
                            title="คัดลอกเลขพัสดุ"
                            className="btn btn-sm btn-icon text-default-700 hover:bg-default-100 relative z-10 shrink-0"
                          >
                            <Icon icon="copy" className="text-base" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <ShipmentStepper
                          shipmentStatus={sh.status}
                          carrierStatus={sh.carrierStatus ?? null}
                          size="sm"
                          showNotice={false}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-default-700 mb-0 mt-1 text-2xs">
                      ไม่มีหมายเลขพัสดุ — สั่งซื้อเมื่อ {formatDateTime(new Date(o.createdAt))}
                    </p>
                  )}
                </div>
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
