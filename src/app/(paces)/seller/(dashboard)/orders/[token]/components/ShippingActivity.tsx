/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx
 *
 * copy จากธีม: `card-body p-7.5` · แถว `flex gap-x-base` · คอลัมน์เวลาชิดขวา · `h5` หัวข้อ +
 * `p` คำอธิบาย + ผู้กระทำ · ระยะห่างระหว่างแถว
 *
 * ต่างจากธีม 4 จุด เป็นข้อบังคับ/คำสั่ง user ไม่ใช่รสนิยม:
 *   1. ธีมมี `Tracking No: <Link href="">` ที่เป็นลิงก์เปล่า → ตัดทิ้ง (กดแล้วไม่ไปไหน)
 *   2. ธีมใช้ `text-default-400` กับคำอธิบาย/เวลา = 2.46:1 ตก AA → `text-default-700`/`-800`
 *   3. **จุดกลม 14px → วงกลม 36px ที่เป็นรูปโปรไฟล์ของคนที่ทำ** (user 2026-08-05 "ตรงไหนมี
 *      Profile แสดงผลได้ ให้แสดงด้วย" + "เพิ่มขนาด icon หน่อย") เหตุการณ์ที่ระบบทำเองไม่มีคน
 *      จึงเป็นไอคอน — ห้ามยัดรูปคนปลอมมาเติม · หัวข้อ `min-h-9` เท่าวงกลมเพื่อให้ข้อความ
 *      **จัดกึ่งกลางตรงกับวงกลมพอดี** (user: "อยากให้ข้อความมันตรงกับ Icon")
 *   4. **เส้นประเป็น element จริง ไม่ใช่ `::after`** — ของธีมคำนวณ offset จากขนาดจุด พอจุดโตขึ้น
 *      วัดจากหน้าจริงได้ความสูง 0px คือเส้นหายไปทั้งหมดโดยไม่มีอะไรเตือน
 *
 * ข้อมูลมาจากตาราง OrderEvent (feature 00031) — ออเดอร์ที่สร้างก่อนระบบเริ่มบันทึกจะมีเฉพาะ
 * เหตุการณ์ที่ backfill ย้อนหลังได้ ซึ่งอาจไม่มีเลย ต้องมี empty-state ที่บอกสาเหตุ ไม่ใช่กล่องว่าง
 */

import Image from 'next/image'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTH, formatTimeHM } from '@/lib/format-date'
import { ORDER_EVENT_META, describeOrderEvent, resolveOrderEventLabel, type OrderEventView } from '@/lib/order-event'

export default function ShippingActivity({
  events,
  orderNoun = 'คำสั่งซื้อ',
  createLabel = 'สร้างคำสั่งซื้อ',
}: {
  events: OrderEventView[]
  orderNoun?: string
  createLabel?: string
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ประวัติ{orderNoun}</h4>
      </div>
      <div className="card-body p-5 md:p-7.5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="history-off" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
            <p className="text-default-800 text-sm font-medium">ยังไม่มีประวัติให้แสดง</p>
            {/* บอกสาเหตุ ไม่ใช่แค่ "ไม่มีข้อมูล" — ออเดอร์เก่าไม่มีประวัติเพราะระบบเพิ่งเริ่มบันทึก
                ไม่ใช่เพราะหน้าจอพัง */}
            {/* กริยากลาง "เกิดขึ้น" — "สร้าง"+noun ผิดคำล็อกของ LODGING (เปิดบิลเข้าพัก ไม่ใช่สร้าง) */}
            <p className="text-default-700 mt-1 text-xs">
              {orderNoun}นี้เกิดขึ้นก่อนระบบเริ่มบันทึกประวัติ — เหตุการณ์ใหม่หลังจากนี้จะแสดงที่นี่
            </p>
          </div>
        ) : (
          <div>
            {events.map((ev, idx) => {
              const meta = ORDER_EVENT_META[ev.type]
              const desc = describeOrderEvent(ev)
              const isLast = idx === events.length - 1
              return (
                <div className="flex gap-x-3 md:gap-x-base" key={ev.id}>
                  {/* วันที่/เวลาแยก 2 บรรทัดเสมอ — คอลัมน์นี้แคบและวันที่ไทยยาวกว่าเวลาแบบ
                      "10:20 AM" ของธีมมาก ปล่อยบรรทัดเดียวแล้วตัดเป็น 3 บรรทัดบนมือถือ
                      (ปีตัดออกที่จอเล็ก — ประวัติออเดอร์แทบไม่ข้ามปี) */}
                  <div className="w-14 shrink-0 md:w-25">
                    <span className="flex min-h-9 flex-col items-end justify-center">
                      <span className="text-default-800 text-xs">{formatDateTH(ev.occurredAtISO)}</span>
                      <span className="text-default-700 text-xs">{formatTimeHM(ev.occurredAtISO)}</span>
                    </span>
                  </div>

                  {/* เส้นประเป็น element จริง ไม่ใช่ ::after ที่คำนวณ offset จากขนาดจุด —
                      ของเดิมวัดจากหน้าจริงได้สูง 0px คือมองไม่เห็นเลยสักเส้น */}
                  <div className="flex shrink-0 flex-col items-center">
                    {ev.actorAvatar ? (
                      <Image
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover"
                        height={36}
                        src={ev.actorAvatar}
                        width={36}
                      />
                    ) : ev.actorLabel ? (
                      <span className="bg-default-200 text-default-800 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                        {ev.actorLabel.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      // ไม่มีคนทำ = ระบบทำเอง → ไอคอน ห้ามยัดรูปคนปลอมมาเติมช่อง
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-full',
                          meta.tone === 'danger' ? 'bg-danger/15 text-danger-ink' : 'bg-success/15 text-success-ink',
                        )}
                      >
                        <Icon icon={meta.icon} className="text-base" aria-hidden="true" />
                      </span>
                    )}
                    {!isLast && <span className="border-default-300 w-px flex-1 border-e border-dashed" />}
                  </div>

                  <div className={cn('min-w-0 flex-1', isLast ? '' : 'pb-9')}>
                    {/* min-h-9 เท่ากับวงกลม → หัวข้อจัดกึ่งกลางตรงกับไอคอนพอดี (user 2026-08-05) */}
                    {/* 3 event ของ order-lifecycle ผันตาม vertical (BR-BKU-09) — โดเมนพัสดุคง label กลาง */}
                    <h5 className="text-default-800 flex min-h-9 items-center text-sm font-medium">
                      {resolveOrderEventLabel(ev.type, { noun: orderNoun, createLabel })}
                    </h5>
                    {desc && <p className="text-default-700 mt-0.5 mb-1 text-sm break-words">{desc}</p>}
                    {/* ไม่มีทั้ง actor และชื่อที่ freeze ไว้ = ระบบทำเอง — ห้ามเดาชื่อเจ้าของร้านมาเติม */}
                    <span className="text-default-800 text-xs font-semibold">โดย {ev.actorLabel ?? 'ระบบ'}</span>
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
