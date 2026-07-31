/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/projects/activity/components/ExpandedActivity.tsx
 *
 * ปรับจาก Paces "Expended Activity Stream":
 * - copy layout skeleton (icon-in-dashed-circle ซ้าย + เส้น dashed แนวตั้ง, title+badge, เวลาขวา, description)
 * - DROP แถว user avatar+link ของ demo → แทนด้วย actor label ("ระบบ"/"ผู้ขาย"/"ผู้ซื้อ")
 *   เพราะ SafePay ไม่เก็บ per-event human actor (Hard Rule 6: adapt asset เข้า data จริง ไม่ปล่อย demo ค้าง)
 * - data ยัง derive จาก state machine จริงของ order SafePay (logic เดิมคงทั้งหมด — แก้เฉพาะ render layer):
 *   (PENDING → SHIPPED → CONFIRMED ; NO_SHIPPING: PENDING → CONFIRMED ; * → CANCELLED)
 * - badge สี/dot สี map ตาม state: done=success, SHIPPED active=primary(น้ำเงิน), pending=default-300, cancelled=danger
 * - แสดง shipmentTracking provider/trackingNo ถ้ามี (PHYSICAL orders) ใต้ actor; เลขพัสดุ font-mono ได้ (latin/ตัวเลข)
 * - คง: empty-state ที่ชัดเจน ถ้า status ไม่รู้จัก
 */

import { cn } from '@/utils/helpers'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { ORDER_STATUS_META } from '@/lib/order-display'

// actor ที่รับผิดชอบแต่ละ step (SafePay ไม่มี per-event user record → label ธรรมดา)
const STEP_ACTOR: Record<string, string> = {
  PENDING: 'ระบบ',
  SHIPPED: 'ผู้ขาย',
  CONFIRMED: 'ผู้ซื้อ',
  CANCELLED: 'ระบบ',
}

const STATUS_LABELS: Record<string, { title: string; description: string; icon: string; done: boolean }> = {
  PENDING: {
    title: 'สร้างคำสั่งซื้อแล้ว',
    description: 'ผู้ขายสร้างคำสั่งซื้อแล้ว รอผู้ซื้อยืนยัน',
    icon: 'file-plus',
    done: true,
  },
  SHIPPED: {
    title: 'จัดส่งแล้ว',
    description: 'ผู้ขายส่งสินค้าออกแล้ว',
    icon: 'truck',
    done: true,
  },
  CONFIRMED: {
    title: 'คำสั่งซื้อสำเร็จ',
    description: 'ผู้ซื้อยืนยันรับสินค้า/บริการเรียบร้อย',
    icon: 'circle-check-filled',
    done: true,
  },
  CANCELLED: {
    title: 'ยกเลิกแล้ว',
    description: 'คำสั่งซื้อถูกยกเลิก',
    icon: 'circle-x',
    done: false,
  },
}

/**
 * tone (จาก ORDER_STATUS_META) → class ของวงกลม dashed + icon
 * ต้องเขียน class เต็มแบบ static — Tailwind สแกน source ตรง ๆ `border-${tone}` จะไม่ถูก generate
 */
const TONE_ACCENT: Record<string, { ring: string; icon: string }> = {
  warning: { ring: 'border-warning', icon: 'text-warning' },
  info: { ring: 'border-info', icon: 'text-info' },
  success: { ring: 'border-success', icon: 'text-success' },
  danger: { ring: 'border-danger', icon: 'text-danger' },
}

// ลำดับ state ตาม state machine ใหม่ (CANCELLED ไม่อยู่ใน flow ปกติ)
// NO_SHIPPING path ตัด SHIPPED ออก — ผ่าน visibleFlow filter ด้านล่าง
const FLOW_ORDER = ['PENDING', 'SHIPPED', 'CONFIRMED']

export type ShippingActivityData = {
  status: string
  /** fulfillmentMode snapshot — ใช้กำหนด SHIPPED step visibility (spec §2) */
  fulfillmentMode: string
  createdAtISO: string
  /**
   * เวลาที่ออเดอร์เปลี่ยนสถานะล่าสุด — ใช้เป็นเวลาของ step ปัจจุบัน
   * เดิม step หลังจาก "สร้างออเดอร์" ไม่มีเวลาเลย (เช่น "จัดส่งแล้ว" ลอย ๆ ไม่รู้ส่งวันไหน)
   * ยังไม่ใช่ timestamp ต่อ event จริง (schema ไม่มี) — เป็นค่าที่ใกล้เคียงที่สุดที่มี
   */
  updatedAtISO: string
  shipmentTracking?: {
    provider: string
    trackingNo: string
  } | null
}

interface ShippingActivityProps {
  data: ShippingActivityData
}

const ShippingActivity = ({ data }: ShippingActivityProps) => {
  const { status, fulfillmentMode, createdAtISO, updatedAtISO, shipmentTracking } = data

  // สร้าง timeline จาก state machine
  // ถ้า fulfillmentMode=NO_SHIPPING ไม่มี SHIPPED step — ตัดออก (spec §3 ShippingActivity)
  const visibleFlow = fulfillmentMode === 'SHIPPED'
    ? FLOW_ORDER
    : FLOW_ORDER.filter((s) => s !== 'SHIPPED')

  const isCancelled = status === 'CANCELLED'

  // หา index ของ current status ใน flow
  const currentIdx = visibleFlow.indexOf(status)

  // สร้าง timeline items: เฉพาะ step ที่ผ่านมาแล้ว (done) + step ถัดไป (pending)
  // ถ้า cancelled → แสดง flow ที่ผ่านมา + CANCELLED step ท้าย
  const timelineItems: Array<{
    key: string
    title: string
    description: string
    icon: string
    isDone: boolean
    isPending: boolean
    time?: string
  }> = []

  if (isCancelled) {
    // แสดง PENDING เป็นจุดเริ่ม (done)
    const created = STATUS_LABELS['PENDING']
    timelineItems.push({
      key: 'PENDING',
      title: created.title,
      description: created.description,
      icon: created.icon,
      isDone: true,
      isPending: false,
      time: formatDateTime(createdAtISO),
    })
    // CANCELLED step
    const cancelled = STATUS_LABELS['CANCELLED']
    timelineItems.push({
      key: 'CANCELLED',
      title: cancelled.title,
      description: cancelled.description,
      icon: cancelled.icon,
      isDone: false,
      isPending: false,
      // เวลายกเลิก = ครั้งสุดท้ายที่ออเดอร์ถูกแตะ
      time: formatDateTime(updatedAtISO),
    })
  } else {
    visibleFlow.forEach((stepKey, idx) => {
      const meta = STATUS_LABELS[stepKey]
      if (!meta) return
      const isDone = idx <= currentIdx
      const isPending = idx === currentIdx + 1
      // แสดงเฉพาะ step ที่ผ่านมาแล้วและ step ถัดไป (pending)
      if (!isDone && !isPending) return

      timelineItems.push({
        key: stepKey,
        title: meta.title,
        description: meta.description,
        icon: meta.icon,
        isDone,
        isPending,
        // step แรก = เวลาสร้าง; step ปัจจุบันที่ไม่ใช่ step แรก = เวลาเปลี่ยนสถานะล่าสุด
        // (step ที่ผ่านมาแล้วตรงกลางยังไม่มีเวลา — schema ไม่ได้เก็บ timestamp ต่อ event)
        time:
          idx === 0
            ? formatDateTime(createdAtISO)
            : idx === currentIdx
              ? formatDateTime(updatedAtISO)
              : undefined,
      })
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ประวัติสถานะคำสั่งซื้อ</h4>
      </div>
      <div className="card-body p-5 sm:p-7.5">
        {timelineItems.length === 0 ? (
          <p className="text-default-400 text-sm text-center py-4">ไม่มีข้อมูลสถานะ</p>
        ) : (
          <div>
            {timelineItems.map((item, idx) => {
              const isLast = idx === timelineItems.length - 1

              // ── สี/ป้ายของแต่ละ step ───────────────────────────────────────────
              // เดิม hardcode map ซ้อนขึ้นมาเองที่นี่ ทำให้สถานะเดียวกันคนละสีกับ badge ใน
              // StatusHero บนหน้าจอเดียวกัน (SHIPPED: ฟ้า vs น้ำเงิน) และ PENDING ขึ้นเขียวทั้งที่
              // ออเดอร์ยังไม่จบ (เขียว = "ยืนยันแล้ว" เท่านั้น) → ยึด ORDER_STATUS_META เป็น SSOT
              //
              // step ที่ผ่านไปแล้ว = เขียว (เสร็จจริง) · step ปัจจุบัน = สีตามสถานะจาก SSOT
              // · step ที่ยังไม่ถึง = neutral
              const meta = ORDER_STATUS_META[item.key]
              const isCurrent = !item.isPending && item.key === status

              const accent = item.isPending
                ? { ring: 'border-default-300', icon: 'text-default-300' }
                : isCurrent
                  ? TONE_ACCENT[meta?.tone ?? 'success']
                  : TONE_ACCENT.success

              // badge: step ปัจจุบันใช้ label+สีชุดเดียวกับ StatusHero เป๊ะ ๆ
              // step ที่ผ่านแล้วบอกแค่ "เสร็จแล้ว" (ไม่แย่งสายตากับสถานะปัจจุบัน)
              const badge = item.isPending
                ? {
                    label: item.key === 'SHIPPED' ? 'รอจัดส่ง' : item.key === 'CONFIRMED' ? 'รอยืนยัน' : 'รอ',
                    className: 'bg-default-100 text-default-400',
                  }
                : isCurrent && meta
                  ? { label: meta.label, className: meta.cls }
                  : { label: 'เสร็จแล้ว', className: 'bg-success/15 text-success' }

              // actor: แสดงเฉพาะ step ที่เกิดขึ้นแล้ว (ไม่แสดงบน step ที่ยังไม่ถึง)
              const actor = item.isPending ? null : STEP_ACTOR[item.key]

              return (
                <div className="flex gap-x-base" key={item.key}>
                  {/* คอลัมน์ซ้าย: icon-in-dashed-circle + เส้น dashed แนวตั้ง (ซ่อนที่ step สุดท้าย) */}
                  <div
                    className={cn(
                      'after:border-default-300 relative after:absolute after:start-1/2 after:top-7 after:bottom-0 after:w-px after:border-e -ms-px after:border-dashed shrink-0',
                      isLast ? 'after:hidden' : ''
                    )}
                  >
                    <div className="relative z-10 flex items-center justify-center">
                      <div className={cn('flex size-7.5 items-center justify-center rounded-full border border-dashed', accent.ring)}>
                        <Icon icon={item.icon} className={cn('text-lg', accent.icon)} />
                      </div>
                    </div>
                  </div>

                  {/* คอลัมน์ขวา: title+badge / เวลา / description / actor — min-w-0 ให้ข้อความไทยพันบรรทัดได้ */}
                  <div className={cn('flex-1 min-w-0', isLast ? '' : 'pb-5')}>
                    <div className="flex justify-between gap-2">
                      {/* title ต้องไม่ใช่ heading จริง (h5) — theme ต้นทาง (ExpandedActivity.tsx) ซ้อน
                          badge <span> ไว้ใน <h5> ทำให้เกิด heading ปลอมซ้ำหลายอันต่อหน้า + screen-reader
                          outline พัง (S-3). ใช้ <p> + badge เป็น sibling แทน — WCAG AA เป็น non-negotiable
                          ใน PRODUCT.md จึงจงใจไม่ copy จุดนี้ตรง ๆ จาก theme (Hard Rule 6 อนุญาตให้ adapt
                          เมื่อ theme เองผิด)
                          ขนาด/สีที่ใช้มาจาก design spec 2026-07-31-seller-order-detail-v5-design.md §4
                          (`text-md font-medium text-default-800`) — ไม่ใช่ "เหมือน h5 เดิม": h5 ของ Paces
                          ไม่ได้ set font-size ใน _reboot.css จึง inherit token --text-body + --color-body-color
                          ของเดิม การเปลี่ยนมาเป็น --text-md/--color-default-800 จึงเป็นการเปลี่ยนตาม spec
                          โดยตั้งใจ ไม่ใช่ของที่บังเอิญเท่ากัน */}
                      <div className="flex items-center min-w-0 mb-1.25">
                        <p className={cn('text-md font-medium', item.isPending ? 'text-default-400' : 'text-default-800')}>
                          {item.title}
                        </p>
                        <span className={cn('badge badge-label ms-2.5', badge.className)}>{badge.label}</span>
                      </div>
                      {(item.time || item.isPending) && (
                        <span className="text-xs whitespace-nowrap shrink-0 text-default-400">
                          {item.time ?? 'รอดำเนินการ'}
                        </span>
                      )}
                    </div>
                    {/* break-words ให้ข้อความไทยยาวพันบรรทัดได้ในคอลัมน์แคบ */}
                    {/* text-default-300 บน body text (description) contrast ไม่พอ (S-11) → ใช้ text-default-400 เสมอ
                        ไม่ว่า pending หรือไม่ — border-default-300/after:border-default-300 (เส้น divider) ไม่แตะ */}
                    <p className="mb-1.25 text-sm break-words text-default-400">
                      {item.description}
                    </p>
                    {actor && <span className="text-default-500 text-xs">{actor}</span>}
                    {/* shipment tracking info สำหรับ SHIPPED step */}
                    {item.key === 'SHIPPED' && shipmentTracking && (
                      <p className="text-default-400 text-xs mt-0.5">
                        {shipmentTracking.provider} · เลขพัสดุ:{' '}
                        {/* font-mono เฉพาะเลขพัสดุ (latin/ตัวเลข) — ไม่กระทบ Anuphan (HR5) */}
                        <span className="font-mono">{shipmentTracking.trackingNo}</span>
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShippingActivity
