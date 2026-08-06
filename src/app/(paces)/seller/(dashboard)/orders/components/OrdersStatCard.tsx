/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersStatCard.tsx
 *       theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/data.ts
 *         (orderStatData บรรทัด 32-70 — icon + สีวงกลมต่อสถานะ)
 *
 * เดิมไฟล์นี้ลอกมาจาก widgets/charts/RevenueStat.tsx (การ์ด + sparkline กราฟแท่ง) ซึ่งเป็น
 * "คนละหน้า" กับหน้า orders ที่กำลังทำ — user เทียบกับเดโม Paces /apps/ecommerce/orders แล้ว
 * บอกว่าไม่เหมือนกันเลย (2026-08-05) จึงเปลี่ยนมายึด OrdersStatCard ของหน้า orders จริง
 *
 * Adaptations:
 * - 4 สถานะ (ธีมมี 5 ใบ: completed/pending/canceled/new/returned) — ของเราคือ enum Order.status
 * - icon/สีวงกลม 3 ใน 4 มาจาก orderStatData ของธีมตรงตัว; SHIPPED ธีมไม่มีสถานะเทียบ จึงใช้
 *   ORDER_STATUS_META.SHIPPED.icon ('truck') ใน src/lib/order-display.ts ซึ่งเป็น SSOT ของ
 *   ไอคอน/สีสถานะออเดอร์อยู่แล้ว — ไม่ใช่การเดาไอคอนเอง (docs/conventions/no-emoji-use-icons.md)
 * - badge %เปลี่ยนแปลง 7 วัน มี invert logic ของ CANCELLED (stat-change-tone.ts) ที่ธีมไม่มี
 * - Stripped: ApexChart/sparkline, prefix/suffix, บรรทัด "ทั้งหมด" ใต้ตัวเลข (ธีมไม่มี และชื่อ
 *   สถานะที่อยู่ข้างล่างบอกอยู่แล้วว่าเป็นยอดสะสม)
 *
 * เป็น server component ได้ (ไม่มี ApexChart แล้ว) — CountUp เป็น client component ในตัวมันเอง
 */

import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import type { OrderStatCardData } from './data'
import { getStatChangeTone, STAT_CHANGE_TONE_CLASS } from './stat-change-tone'

/**
 * icon + สีต่อสถานะ
 *
 * วงกลมเป็น **พื้นอ่อน + ไอคอนสี** ไม่ใช่พื้นทึบ+ไอคอนขาวแบบเดิม — user สั่ง 2026-08-06
 * ให้ใช้โครงเดียวกับการ์ดสถิติหน้าสินค้า (products/components/ProductStats.tsx ซึ่งมาจาก
 * theme .../ecommerce/(products)/products/components/ProductStats.tsx) ที่ใช้
 * `bg-{tone}/15 text-{tone}` · จุดกลมบรรทัดล่างใช้สีเดียวกัน
 *
 * ไอคอนตัวนี้ซ้ำกับชื่อสถานะที่อยู่เหนือมันในการ์ดใบเดียวกัน จึงเป็นกราฟิกประกอบ ไม่ใช่ตัว
 * สื่อความหมายเดี่ยว ๆ — ต่างจาก badge ข้อความข้าง ๆ ที่ต้องผ่าน AA จริง (ใช้ -ink ผ่าน
 * STAT_CHANGE_TONE_CLASS)
 */
const STATUS_VISUAL: Record<
  OrderStatCardData['status'],
  { icon: string; iconClass: string; bullet: string }
> = {
  PENDING:   { icon: 'hourglass', iconClass: 'bg-warning/15 text-warning', bullet: 'text-warning' },
  SHIPPED:   { icon: 'truck',     iconClass: 'bg-info/15 text-info',       bullet: 'text-info'    }, // SSOT ORDER_STATUS_META.SHIPPED (tone=info)
  CONFIRMED: { icon: 'check',     iconClass: 'bg-success/15 text-success', bullet: 'text-success' },
  CANCELLED: { icon: 'x',         iconClass: 'bg-danger/15 text-danger',   bullet: 'text-danger'  },
}

const OrdersStatCard = ({ item }: { item: OrderStatCardData }) => {
  // badge tone ตาม changePct — CANCELLED invert (ยอดยกเลิกเพิ่ม = แย่ ไม่ใช่ดี) (S-A1)
  // ดู stat-change-tone.ts สำหรับตรรกะเต็ม + เหตุผลที่แยกเป็น pure function
  const badgeClass = STAT_CHANGE_TONE_CLASS[getStatChangeTone(item.status, item.changePct)]
  const changeLabel = item.changePct > 0 ? `+${item.changePct}%` : `${item.changePct}%`
  const visual = STATUS_VISUAL[item.status]

  return (
    <div className="card">
      <div className="card-body">
        {/* โครง 3 ชั้นตาม ProductStats: ชื่อ / [icon] ตัวเลข [%] / [จุด] ป้าย … ค่า */}
        <div className="mb-2 flex items-center justify-between">
          <h5 title={item.title} className="card-title text-sm">
            {item.title}
          </h5>
        </div>
        <div className="my-5 flex items-center gap-2.5">
          <div className={cn('flex size-9 items-center justify-center rounded-full', visual.iconClass)}>
            <Icon icon={visual.icon} className="size-5.5 text-2xl" />
          </div>
          {/* tabular-nums: ตัวเลขไม่ขยับตำแหน่งตอน CountUp ไล่เลข และการ์ด 4 ใบเรียงตรงกัน */}
          <h3 className="text-xl tabular-nums">
            <CountUp start={0} end={item.totalCount} duration={1} decimals={0} />
          </h3>
          <span className={cn('badge ms-auto py-0 text-xs font-medium', badgeClass)}>{changeLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className={cn('flex items-center gap-1', visual.bullet)}>
              <Icon icon="circle-filled" className="align-middle" />
            </span>
            {/* บรรทัดล่างบอกยอด 30 วันล่าสุด — ตัวเลขเดียวกับที่ใช้คิด % ข้างบน ไม่ใช่ค่าใหม่
                ที่คำนวณคนละทาง (badge บอก "เปลี่ยนไปเท่าไร" บรรทัดนี้บอก "เปลี่ยนจากฐานเท่าไร") */}
            <span className="text-default-400 text-sm">30 วันล่าสุด</span>
          </div>
          <span className="font-semibold tabular-nums">{item.recentCount}</span>
        </div>
      </div>
    </div>
  )
}

export default OrdersStatCard
