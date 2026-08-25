/**
 * CustomerStatCard — การ์ดสถิติ 1 ใบบนหัวหน้า `/customers` (feature 00057 รอบ UI)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersStatCard.tsx
 *
 * ต่างจากธีม 3 จุด พร้อมเหตุผล:
 *
 * 1. **ไม่ใช้ `<CountUp>`** — ธีมให้ตัวเลขวิ่งตอนโหลดทุกใบ แต่หน้านี้เป็นเครื่องมือทำงาน
 *    ผู้ขายเปิดมาเพื่ออ่านตัวเลขทันที ไม่ใช่มาดูอนิเมชัน (Impeccable `Mode: Operate`)
 * 2. **ไม่มี badge % เปลี่ยนแปลง** — ธีมมีเพราะเป็น demo data ที่แต่งค่า `change` ไว้
 *    เราไม่มีข้อมูลย้อนหลังมาเทียบ ใส่ไปก็เป็นเลขที่ไม่มีที่มา
 * 3. **ตัด `uppercase` ออกจากหัวข้อ** — ภาษาไทยไม่มี case คลาสนี้จึงไม่มีผลกับภาพ
 *    แต่ผิดหลักการเขียนของระบบ (Sentence case)
 *
 * `text-lg` ไม่ใช่ `text-xl` ของธีม — ที่ `lg:grid-cols-4` การ์ดกว้างราว 270px และค่าที่ยาวที่สุด
 * คือจำนวนเต็มหลักร้อย/เปอร์เซ็นต์ ซึ่งพอดีอยู่แล้ว ส่วน `tabular-nums` กันตัวเลขขยับตอนค่าเปลี่ยน
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type CustomerStatItem = {
  /** ค่าที่จัดรูปมาแล้ว (เช่น `96%`, `฿284,300`, `397`) — ห้ามส่งตัวเลขดิบมาให้ที่นี่จัดรูปเอง */
  value: string
  title: string
  /** บรรทัดขยายใต้หัวข้อ — ไม่มีข้อมูลรองที่มีความหมายจริงก็ไม่ต้องส่ง (ห้ามยัด filler) */
  caption?: string
  icon: string
  /** คลาสพื้นหลังของวงกลมไอคอน เช่น `bg-primary` */
  tone: string
}

export default function CustomerStatCard({ item }: { item: CustomerStatItem }) {
  return (
    <div className="card h-full">
      <div className="card-body">
        <div className="mb-5 flex w-full items-center justify-between gap-3">
          <h3 className="text-default-900 text-lg font-bold tabular-nums">{item.value}</h3>
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full!',
              item.tone,
            )}>
            <Icon icon={item.icon} className="size-5.5 text-white" aria-hidden="true" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-default-900 text-xs font-bold">{item.title}</span>
          {item.caption && <span className="text-2xs text-default-400">{item.caption}</span>}
        </div>
      </div>
    </div>
  )
}
