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

// actor ที่รับผิดชอบแต่ละ step (SafePay ไม่มี per-event user record → label ธรรมดา)
const STEP_ACTOR: Record<string, string> = {
  PENDING: 'ระบบ',
  SHIPPED: 'ผู้ขาย',
  CONFIRMED: 'ผู้ซื้อ',
  CANCELLED: 'ระบบ',
}

const STATUS_LABELS: Record<string, { title: string; description: string; icon: string; done: boolean }> = {
  PENDING: {
    title: 'สร้างออเดอร์แล้ว',
    description: 'ออเดอร์ถูกสร้างโดย seller รอผู้ซื้อยืนยัน',
    icon: 'file-plus',
    done: true,
  },
  SHIPPED: {
    title: 'จัดส่งแล้ว',
    description: 'สินค้าถูกส่งออกจาก seller แล้ว',
    icon: 'truck',
    done: true,
  },
  CONFIRMED: {
    title: 'ออเดอร์สำเร็จ',
    description: 'ผู้ซื้อยืนยันรับสินค้า/บริการเรียบร้อย',
    icon: 'circle-check-filled',
    done: true,
  },
  CANCELLED: {
    title: 'ยกเลิกแล้ว',
    description: 'ออเดอร์ถูกยกเลิก',
    icon: 'circle-x',
    done: false,
  },
}

// ลำดับ state ตาม state machine ใหม่ (CANCELLED ไม่อยู่ใน flow ปกติ)
// NO_SHIPPING path ตัด SHIPPED ออก — ผ่าน visibleFlow filter ด้านล่าง
const FLOW_ORDER = ['PENDING', 'SHIPPED', 'CONFIRMED']

export type ShippingActivityData = {
  status: string
  /** fulfillmentMode snapshot — ใช้กำหนด SHIPPED step visibility (spec §2) */
  fulfillmentMode: string
  createdAtISO: string
  shipmentTracking?: {
    provider: string
    trackingNo: string
  } | null
}

interface ShippingActivityProps {
  data: ShippingActivityData
}

const ShippingActivity = ({ data }: ShippingActivityProps) => {
  const { status, fulfillmentMode, createdAtISO, shipmentTracking } = data

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
        time: idx === 0 ? formatDateTime(createdAtISO) : undefined,
      })
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ประวัติสถานะออเดอร์</h4>
      </div>
      <div className="card-body p-5 sm:p-7.5">
        {timelineItems.length === 0 ? (
          <p className="text-default-400 text-sm text-center py-4">ไม่มีข้อมูลสถานะ</p>
        ) : (
          <div>
            {timelineItems.map((item, idx) => {
              const isLast = idx === timelineItems.length - 1

              // สี dashed-circle + icon ตาม state (สอดคล้องกับ badge สี)
              // CANCELLED=danger, pending(ยังไม่ถึง)=default-300, SHIPPED active=primary(น้ำเงิน), done อื่น=success
              const accent =
                item.key === 'CANCELLED'
                  ? { ring: 'border-danger', icon: 'text-danger' }
                  : item.isPending
                    ? { ring: 'border-default-300', icon: 'text-default-300' }
                    : item.key === 'SHIPPED'
                      ? { ring: 'border-primary', icon: 'text-primary' }
                      : { ring: 'border-success', icon: 'text-success' }

              // badge label + สี ต่อ state — pending ระบุ step ที่รอให้ชัด (รอจัดส่ง/รอยืนยัน)
              const badge =
                item.key === 'CANCELLED'
                  ? { label: 'ยกเลิก', className: 'bg-danger/15 text-danger' }
                  : item.isPending
                    ? {
                        label: item.key === 'SHIPPED' ? 'รอจัดส่ง' : item.key === 'CONFIRMED' ? 'รอยืนยัน' : 'รอ',
                        className: 'bg-default-100 text-default-400',
                      }
                    : item.key === 'SHIPPED'
                      ? { label: 'กำลังส่ง', className: 'bg-primary/15 text-primary' }
                      : item.key === 'PENDING'
                        ? { label: 'สร้างแล้ว', className: 'bg-success/15 text-success' }
                        : { label: 'สำเร็จ', className: 'bg-success/15 text-success' }

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
                      <h5 className={cn('mb-1.25', item.isPending ? 'text-default-400' : '')}>
                        {item.title}
                        <span className={cn('badge badge-label ms-2.5', badge.className)}>{badge.label}</span>
                      </h5>
                      {(item.time || item.isPending) && (
                        <span className={cn('text-xs whitespace-nowrap shrink-0', item.time ? 'text-default-400' : 'text-default-300')}>
                          {item.time ?? 'รอดำเนินการ'}
                        </span>
                      )}
                    </div>
                    {/* break-words ให้ข้อความไทยยาวพันบรรทัดได้ในคอลัมน์แคบ */}
                    <p className={cn('mb-1.25 text-sm break-words', item.isPending ? 'text-default-300' : 'text-default-400')}>
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
