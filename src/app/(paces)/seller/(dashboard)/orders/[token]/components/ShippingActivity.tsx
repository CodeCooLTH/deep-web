/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 *
 * ปรับจาก Paces ShippingActivity:
 * - ลบ data mock (shippingTimelineData + trackingNo + trackingBy) ออก
 * - แทนด้วย timeline ที่ derive จาก status จริงของ order SafePay
 * - SafePay ไม่มี shipping-carrier event feed → derive timeline จาก state machine
 *   (PENDING → SHIPPED → CONFIRMED ; NO_SHIPPING: PENDING → CONFIRMED ; * → CANCELLED) พร้อม createdAt ที่รู้
 * - แสดง shipmentTracking provider/trackingNo ถ้ามี (PHYSICAL orders)
 * - คง: timeline layout, dot-and-line CSS, card structure
 * - empty-state ที่ชัดเจน ถ้า status ไม่รู้จัก
 */

import { cn } from '@/utils/helpers'
import Icon from '@/components/wrappers/Icon'

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
      time: new Date(createdAtISO).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' }) +
        ' ' + new Date(createdAtISO).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
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
        time: idx === 0
          ? new Date(createdAtISO).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' }) +
            ' ' + new Date(createdAtISO).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
          : undefined,
      })
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ประวัติสถานะออเดอร์</h4>
      </div>
      <div className="card-body p-4 sm:p-7.5">
        {timelineItems.length === 0 ? (
          <p className="text-default-400 text-sm text-center py-4">ไม่มีข้อมูลสถานะ</p>
        ) : (
          <div>
            {timelineItems.map((item, idx) => (
              <div className="flex gap-x-base" key={item.key}>
                {/* คอลัมน์เวลา */}
                <div className="w-12 text-end sm:w-15 md:w-25">
                  {item.time ? (
                    <span className="text-default-400 text-xs">{item.time}</span>
                  ) : item.isPending ? (
                    <span className="text-default-300 text-xs">รอดำเนินการ</span>
                  ) : null}
                </div>

                {/* เส้น timeline */}
                <div
                  className={cn(
                    'after:border-default-300 relative after:absolute after:start-1/2 after:top-4 after:bottom-0 after:w-px after:border-e -ms-px after:border-dashed',
                    idx === timelineItems.length - 1 ? 'after:hidden' : ''
                  )}
                >
                  <div className="relative z-10 flex items-center justify-center">
                    {item.isPending ? (
                      // step ที่ยังไม่ถึง — วงกลมเส้นขอบ
                      <div className="size-3.5 rounded-full border-2 border-default-300 bg-white" />
                    ) : item.isDone ? (
                      // SHIPPED = active/in-progress → bg-primary (น้ำเงิน); CONFIRMED/อื่น done → bg-success
                      <div className={`size-3.5 rounded-full ${item.key === 'SHIPPED' ? 'bg-primary' : 'bg-success'}`} />
                    ) : (
                      // CANCELLED
                      <div className="size-3.5 rounded-full bg-danger" />
                    )}
                  </div>
                </div>

                {/* เนื้อหา */}
                <div className={`flex-1 ${idx === timelineItems.length - 1 ? '' : 'pb-8 sm:pb-15'}`}>
                  <h5 className={`mb-1.25 flex items-center gap-1.5 ${item.isPending ? 'text-default-400' : ''}`}>
                    <Icon
                      icon={item.icon}
                      className={`text-sm ${
                        item.isDone && !item.isPending
                          ? item.key === 'SHIPPED'
                            ? 'text-primary' // SHIPPED done → น้ำเงิน สอดคล้องกับ dot
                            : 'text-success'
                          : item.isPending
                            ? 'text-default-300'
                            : 'text-danger'
                      }`}
                    />
                    {item.title}
                  </h5>
                  <p className="text-default-400 mb-1.25 text-sm">{item.description}</p>
                  {/* shipment tracking info สำหรับ SHIPPED step */}
                  {item.key === 'SHIPPED' && shipmentTracking && (
                    <p className="text-default-400 text-xs">
                      {shipmentTracking.provider} · เลขพัสดุ:{' '}
                      <span className="badge bg-default-100 text-default-700 font-mono">
                        {shipmentTracking.trackingNo}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShippingActivity
