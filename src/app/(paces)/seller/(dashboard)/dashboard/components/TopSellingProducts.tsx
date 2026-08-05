/**
 * TopSellingProducts — "สินค้าขายดี" บนแดชบอร์ดเดสก์ท็อป (RSC)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/TopSellingProducts.tsx
 *   — คงโครง .card/.card-header/.card-title + ตารางรูป/ชื่อ/ราคา/จำนวน/ยอดรวม
 *   — ตัด DataTable + tanstack/react-table ของธีมออก: ข้อมูลมีคงที่ 8 แถว ไม่ต้อง sort/paginate/filter
 *     การลาก client table เข้ามาแลกมาด้วย JS ก้อนใหญ่โดยไม่ได้อะไรกลับ (RecentOrder ยังใช้ DataTable
 *     อยู่เพราะมันมี pagination จริง)
 *   — ตัดปุ่ม Export/Import ของธีม (ยังไม่มีปลายทางจริงในระบบ)
 * Base (markup ตาราง): src/app/(paces)/seller/(dashboard)/bookings/page.tsx — `table w-full` + th
 *   `text-default-500 px-4 py-3 text-start text-sm font-medium` ให้ตารางทุกหน้าใน seller หน้าตาเดียวกัน
 *
 * parity กับมือถือ: ราคา/หน่วย/ปลายทางลิงก์ ยกมาจาก BestSellerStrip.tsx ตัวเดียวกัน — จิ้มแถวแล้ว
 * ไปหน้าสร้างออเดอร์พร้อมสินค้านั้น เหมือนจิ้มการ์ดบนมือถือ ไม่ใช่พาไปหน้าสินค้าคนละที่
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

export interface BestSellerProduct {
  id: string
  name: string
  price: number
  image: string | null
  /** จำนวนขายรวม (sum qty) ของออเดอร์ที่ยืนยันแล้ว */
  soldCount: number
}

type Props = {
  products: BestSellerProduct[]
}

const TopSellingProducts = ({ products }: Props) => {
  return (
    <div className="card h-full">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <h4 className="card-title">สินค้าขายดี</h4>
          {/* ป้ายช่วงเวลาแบบเดียวกับโดนัท/แผนที่ — การ์ดนี้เป็นยอดสะสมตลอดชีพ ไม่ตาม filter
              วันนี้/เดือนนี้ ของหน้า ถ้าไม่บอก ผู้ใช้ที่เพิ่งกด "วันนี้" จะอ่าน soldCount เป็นยอดวันนี้ */}
          <span className="badge bg-default-100 text-default-700 text-xs">ตลอดชีพ</span>
        </div>
        <Link href="/products" className="text-primary text-sm">
          ดูสินค้าทั้งหมด ›
        </Link>
      </div>

      <div className="card-body p-0">
        {products.length === 0 ? (
          // ร้านใหม่/ยังไม่มีใบที่ยืนยัน — บอกเกณฑ์ให้ชัดว่าทำไมยังว่าง ไม่ใช่แค่ "ไม่มีข้อมูล"
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
            <span className="flex items-center justify-center rounded-full bg-default-100 text-default-400 size-12">
              <Icon icon="package" className="text-2xl" />
            </span>
            <p className="text-sm font-semibold">ยังไม่มีสินค้าขายดี</p>
            <p className="text-xs text-default-500">อันดับจะขึ้นเมื่อมีคำสั่งซื้อที่ยืนยันแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  {['สินค้า', 'ราคา', 'ขายได้', 'รายได้'].map((h, i) => (
                    <th
                      key={h}
                      className={`text-default-500 px-4 py-3 text-sm font-medium ${i === 0 ? 'text-start' : 'text-end'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <Link href={`/orders/new?product=${p.id}`} className="flex items-center gap-3 group">
                        {p.image ? (
                          // กรอบเป็นตัวคุมสัดส่วน ไม่ใช่ <img> — img มี intrinsic ratio ของตัวเอง
                          // สั่งสัดส่วนที่ตัวมันตรง ๆ ไม่มีผล (บทเรียนเดียวกับ BestSellerStrip)
                          <span className="relative block size-10 shrink-0 overflow-hidden rounded bg-default-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.image} alt={p.name} className="absolute inset-0 size-full object-cover" />
                          </span>
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded bg-default-100 text-default-300">
                            <Icon icon="package" className="text-lg" />
                          </span>
                        )}
                        <span className="line-clamp-2 text-sm font-medium group-hover:text-primary transition-colors">
                          {p.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-end text-sm whitespace-nowrap">{formatThb(p.price)}</td>
                    <td className="px-4 py-3 text-end text-sm font-semibold whitespace-nowrap">
                      {p.soldCount.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-end text-sm whitespace-nowrap">
                      {formatThb(p.price * p.soldCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default TopSellingProducts
