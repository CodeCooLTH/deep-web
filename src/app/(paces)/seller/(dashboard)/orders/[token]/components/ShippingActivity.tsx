/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 *
 * copy จากธีมตรง ๆ ทั้งโครง — user เอาภาพ Shipping Activity ของธีมมาเทียบแล้วบอกว่า "ไม่เห็นเหมือนเลย"
 * รอบนี้จึงยึดทุกคลาสที่ธีมมี ไม่ประดิษฐ์เพิ่ม:
 *   `card-body p-7.5` · แถว `flex gap-x-base` · คอลัมน์เวลา `w-15 text-end md:w-25`
 *   · จุด `size-3.5 rounded-full` · เส้นประ `after:absolute after:start-1/2 after:top-4
 *     after:bottom-0 after:w-px after:border-e -ms-px after:border-dashed`
 *   · เนื้อหา `h5` หัวข้อ / `p` คำอธิบาย / `span` ผู้กระทำ · ระยะห่างแถว `pb-15`
 *
 * (รอบก่อนผมเปลี่ยนจุดเป็นไอคอนในวงกลม 32px ซึ่งยิ่งทำให้ห่างจากธีม — ถอยกลับแล้ว)
 *
 * ต่างจากธีม 3 จุด เป็นข้อบังคับ ไม่ใช่รสนิยม:
 *   1. ธีมมี `Tracking No: <Link href="">` ที่เป็นลิงก์เปล่า → ตัดทิ้ง (กดแล้วไม่ไปไหน = affordance หลอก)
 *   2. ธีมใช้ `text-default-400` กับคำอธิบาย/เวลา = วัดได้ 2.46:1 ตก AA → `text-default-700`
 *   3. สีจุด: ธีมไล่ `bg-light` ให้แถวแรกแล้ว `bg-success` ที่เหลือแบบตายตัวตาม index — ที่นี่เขียว
 *      แปลว่า "เหตุการณ์นี้เกิดขึ้นแล้วจริง" ซึ่งเป็นจริงกับทุกแถวของ log (มันคือบันทึกอดีต ไม่ใช่
 *      แถบขั้นตอนที่มีอนาคต) ยกเว้นเหตุการณ์ยกเลิกที่ใช้แดง — ไม่ขัด Verified-Means-Green เพราะ
 *      ไม่มีแถวไหนใน log ที่ "ยังไม่เกิด"
 *
 * ข้อมูลมาจากตาราง OrderEvent (feature 00031) — ออเดอร์ที่สร้างก่อนระบบเริ่มบันทึกจะมีเฉพาะ
 * เหตุการณ์ที่ backfill ย้อนหลังได้ ซึ่งอาจไม่มีเลย ต้องมี empty-state ที่บอกสาเหตุ ไม่ใช่กล่องว่าง
 */

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTimeTH } from '@/lib/format-date'
import { ORDER_EVENT_META, describeOrderEvent, type OrderEventView } from '@/lib/order-event'

export default function ShippingActivity({
  events,
  orderNoun = 'คำสั่งซื้อ',
}: {
  events: OrderEventView[]
  orderNoun?: string
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ประวัติ{orderNoun}</h4>
      </div>
      <div className="card-body p-7.5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="history-off" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
            <p className="text-default-800 text-sm font-medium">ยังไม่มีประวัติให้แสดง</p>
            {/* บอกสาเหตุ ไม่ใช่แค่ "ไม่มีข้อมูล" — ออเดอร์เก่าไม่มีประวัติเพราะระบบเพิ่งเริ่มบันทึก
                ไม่ใช่เพราะหน้าจอพัง */}
            <p className="text-default-700 mt-1 text-xs">
              {orderNoun}นี้สร้างก่อนระบบเริ่มบันทึกประวัติ — เหตุการณ์ใหม่หลังจากนี้จะแสดงที่นี่
            </p>
          </div>
        ) : (
          <div>
            {events.map((ev, idx) => {
              const meta = ORDER_EVENT_META[ev.type]
              const desc = describeOrderEvent(ev)
              const isLast = idx === events.length - 1
              return (
                <div className="flex gap-x-base" key={ev.id}>
                  <div className="w-15 shrink-0 text-end md:w-25">
                    <span className="text-default-700 text-xs">{formatDateTimeTH(ev.occurredAtISO)}</span>
                  </div>
                  <div
                    className={cn(
                      'after:border-default-300 relative -ms-px after:absolute after:start-1/2 after:top-4 after:bottom-0 after:w-px after:border-e after:border-dashed',
                      isLast && 'after:hidden',
                    )}
                  >
                    <div className="relative z-10 flex items-center justify-center">
                      <div
                        className={cn('size-3.5 rounded-full', meta.tone === 'danger' ? 'bg-danger' : 'bg-success')}
                      />
                    </div>
                  </div>
                  <div className={cn('min-w-0 flex-1', isLast ? '' : 'pb-15')}>
                    <h5 className="text-default-800 mb-1.25 text-sm font-medium">{meta.label}</h5>
                    {desc && <p className="text-default-700 mb-1.25 text-sm break-words">{desc}</p>}
                    {/* ไม่มีทั้ง actor และชื่อที่ freeze ไว้ = ระบบทำเอง — ห้ามเดาชื่อเจ้าของร้านมาเติม */}
                    <span className="text-default-800 text-xs font-semibold">
                      โดย {ev.actorLabel ?? 'ระบบ'}
                    </span>
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
