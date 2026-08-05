/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 *
 * copy จากธีมตรง ๆ: `card-body p-7.5` + แถว `flex gap-x-base` + คอลัมน์เวลา `w-15 text-end md:w-25`
 * + จุด `size-3.5 rounded-full` + เส้นประ `after:absolute after:start-1/2 after:top-4 after:bottom-0
 * after:w-px after:border-e -ms-px after:border-dashed` + เนื้อหา `h5` หัวข้อ / `p` คำอธิบาย /
 * `span` "By {คน}"
 *
 * adapt จากธีม:
 *   - ธีมระบายจุดของทุกเหตุการณ์ที่ผ่านมาแล้วเป็น `bg-success` หมด — ผิดกฎ Verified-Means-Green
 *     ของเรา (เขียวสงวนให้ "ยืนยันสำเร็จ") ที่นี่เขียวเฉพาะผู้ซื้อยืนยันรับของ แดงเฉพาะการยกเลิก
 *     ที่เหลือเป็นกลาง — โทนมาจาก ORDER_EVENT_META (SSOT)
 *   - ธีมมี `Tracking No: <Link href="">` เปล่า → ตัดทิ้ง (affordance หลอก)
 *   - ธีมใช้ `text-default-400` กับคำอธิบาย/เวลา = 2.46:1 ตก AA → `text-default-700`
 *   - เพิ่มรูปผู้กระทำ (ธีมมีแต่ข้อความ "By ...") เพราะเรามี avatar จริง
 *   - `pb-15` ของธีมห่างเกินไปสำหรับ log ที่มีหลายสิบแถว → `pb-6`
 *
 * ข้อมูลมาจากตาราง OrderEvent (feature 00031) — ออเดอร์ที่สร้างก่อนระบบเริ่มบันทึกจะมีเฉพาะ
 * เหตุการณ์ที่ backfill ย้อนหลังได้ ซึ่งอาจไม่มีเลย ต้องมี empty-state ที่บอกสาเหตุ ไม่ใช่กล่องว่าง
 */

import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'
import { cn } from '@/utils/helpers'
import { formatDateTimeTH } from '@/lib/format-date'
import { ORDER_EVENT_META, describeOrderEvent, type OrderEventView } from '@/lib/order-event'

const DOT_CLS: Record<'neutral' | 'success' | 'danger', string> = {
  neutral: 'bg-default-300',
  success: 'bg-success',
  danger: 'bg-danger',
}

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
                  {/* คอลัมน์เวลาแยกซ้ายตามธีม — ซ่อนที่ <md เพราะวันที่ไทยเต็มไม่พอดีใน 60px */}
                  <div className="hidden w-25 shrink-0 text-end md:block">
                    <span className="text-default-700 text-xs">{formatDateTimeTH(ev.occurredAtISO)}</span>
                  </div>
                  <div
                    className={cn(
                      'after:border-default-300 relative -ms-px after:absolute after:start-1/2 after:top-4 after:bottom-0 after:w-px after:border-e after:border-dashed',
                      isLast && 'after:hidden',
                    )}
                  >
                    <div className="relative z-10 flex items-center justify-center">
                      <div className={cn('size-3.5 rounded-full', DOT_CLS[meta.tone])} />
                    </div>
                  </div>
                  <div className={cn('min-w-0 flex-1', isLast ? '' : 'pb-6')}>
                    <p className="text-default-800 mb-1 flex items-center gap-1.5 text-sm font-medium">
                      <Icon icon={meta.icon} className="text-default-700 text-base shrink-0" aria-hidden="true" />
                      {meta.label}
                    </p>
                    {/* มือถือไม่มีคอลัมน์เวลา — เวลาลงมาอยู่ใต้หัวข้อแทน */}
                    <p className="text-default-700 mb-1 text-2xs md:hidden">{formatDateTimeTH(ev.occurredAtISO)}</p>
                    {desc && <p className="text-default-700 mb-1 text-xs break-words">{desc}</p>}
                    {ev.actorLabel ? (
                      <span className="flex items-center gap-1.5">
                        {ev.actorAvatar ? (
                          <Image
                            alt={ev.actorLabel}
                            className="size-4.5 shrink-0 rounded-full object-cover"
                            height={18}
                            src={ev.actorAvatar}
                            width={18}
                          />
                        ) : (
                          <span className="bg-default-200 flex size-4.5 shrink-0 items-center justify-center rounded-full">
                            <Icon icon="user" className="text-default-700 text-2xs" aria-hidden="true" />
                          </span>
                        )}
                        <span className="text-default-800 text-2xs font-medium break-words">{ev.actorLabel}</span>
                      </span>
                    ) : (
                      // ไม่มีทั้ง actor และ snapshot = ระบบทำเอง — ห้ามเดาชื่อเจ้าของร้านมาเติม
                      <span className="text-default-700 text-2xs">ระบบ</span>
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
