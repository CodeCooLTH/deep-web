'use client'

/**
 * BestSellerStrip — "สินค้าขายดี" บน command center (< lg) → จิ้ม → /orders/new?product=<id> (pre-add, feature Quick Create)
 *
 * Base (โครง section): OrderStatusBand.tsx — .card/.card-header !py-3/.card-title
 *   (sibling-surface-parity: ทุก section ใน CommandCenter เป็น .card เหมือนกัน)
 * Base (การ์ดสินค้า): src/app/(paces)/seller/(dashboard)/orders/new/components/ProductGrid.tsx
 *   สาขา grid — การ์ดแนวตั้ง rounded-xl + ProductThumb `aspect-video w-full` + ชื่อ line-clamp-2
 *   → ราคา. เป็น sibling ตรงตัวที่สุด: การ์ดสินค้าที่ "จิ้มแล้วเพิ่มลงออเดอร์" เหมือนกัน
 *
 * ประวัติทรงการ์ด (อย่าวนกลับ):
 * - เดิม w-24 + รูป `aspect-square` → รูป 96×96px กินเกินครึ่งการ์ด และร้านส่วนใหญ่สินค้าไม่มีรูป
 *   ⇒ กล่องเทาว่าง 4 ใบเป็นตัวเด่นที่สุดของ section (ปัญหาเดียวกับที่ ProductGrid บันทึกไว้
 *   แล้วแก้ด้วย aspect-video — ที่นี่ยกมาใช้ชุดเดียวกัน ไม่ใช่คิดใหม่)
 * - 2026-08-06 เคยเปลี่ยนเป็นการ์ดแนวนอน (รูป 56px ซ้าย) เพื่อล็อกความสูง แต่ w-56 ทำให้จอ 390px
 *   เห็นแค่ ~1.5 ใบ ⇒ user สั่งกลับเป็นแนวตั้ง "เพิ่ม width หน่อยก็ได้" → w-28 (112px, เห็น ~3.2 ใบ)
 * - ความสูงเท่ากันทุกใบมาจาก `min-h-8` ที่ชื่อ (จอง 2 บรรทัดของ text-xs = 2rem เสมอ) ไม่ใช่จาก
 *   การบังคับความสูงการ์ด — ชื่อ 1 บรรทัดกับ 2 บรรทัดจึงไม่ทำให้ราคา/ยอดขายของแต่ละใบเหลื่อมกัน
 *   (นี่คือ "การ์ดไม่สมส่วน" ที่ user รายงาน)
 *
 * ว่าง (ร้านใหม่/ไม่มียอดสั่งซื้อ) → ไม่ render ทั้งการ์ด (honest-hide แบบ SalesChartCard)
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { resolveProductVocab } from '@/lib/seller-menu'
import ProductThumb from '../../orders/new/components/ProductThumb'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Product {
  id: string
  name: string
  price: number
  image: string | null
  /** จำนวนสั่งซื้อรวม (sum qty; PENDING+SHIPPED+CONFIRMED — ไม่รวม CANCELLED) — โชว์ "สั่งซื้อแล้ว X ชิ้น" */
  soldCount: number
}

interface Props {
  products: Product[]
  /**
   * ประเภทกิจการของร้าน — resolve เป็นคำที่นี่ ไม่ใช่รับ ProductVocab สำเร็จรูปมาจาก server
   *
   * IMPORTANT: นี่คือ client component — `ProductVocab` มีช่อง `soldLine` เป็น **ฟังก์ชัน** ซึ่ง React
   * serialize ข้ามเส้น server→client ไม่ได้ — ส่งมาทั้งก้อนแล้วทั้งหน้า throw ตอน render
   * (พังจริงบน prod 2026-08-07; `tsc` และ `next build` มองไม่เห็นเพราะหน้านี้เป็น dynamic
   * จึงไม่ถูก render ตอนบิลด์). สตริงเดี่ยว ๆ อย่าง orderNoun ส่งได้ปกติ — ปัญหาอยู่ที่ฟังก์ชัน
   *
   * ร้านคิวงานขาย "บริการ" ที่นับเป็น "ครั้ง" ไม่ใช่ "ชิ้น" — soldLine จึงเป็นทั้งประโยค
   * ไม่ใช่ verb+unit ให้ที่นี่ต่อเอง (ประโยคไทยผันไม่เท่ากันทุก vertical)
   */
  vertical?: string
}

export default function BestSellerStrip({ products, vertical }: Props) {
  const vocab = resolveProductVocab(vertical ?? 'ONLINE_SALES')
  const router = useRouter()
  if (!products.length) return null

  // สินค้าเดียว → การ์ดเต็มความกว้าง (ไม่ให้เป็นการ์ดแคบใบเดียวลอยมุมซ้ายกลางพื้นที่ว่าง — เคสที่ user รายงาน)
  const single = products.length === 1

  return (
    <div className="card">
      <div className="card-header !py-3 flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          {/* trophy คงสี warning เดิม — สี = ตัวตนของ "ขายดี" ไม่ใช่ icon นำทางแบบพี่น้อง */}
          <Icon icon="trophy" className="size-4 text-warning" />
          {vocab.bestSellerTitle}
        </h4>
        {/* label เดียวกับปุ่มบน TopSellingProducts (เดสก์ท็อป) — ปลายทางเดียวกัน /products */}
        <Link href="/products" className="text-primary text-sm font-medium inline-flex items-center gap-0.5">
          {vocab.viewAllLabel}
          <Icon icon="chevron-right" className="size-4" />
        </Link>
      </div>

      <div className="card-body !p-4">
        {/* scroll-snap + ซ่อน scrollbar (pattern เดียวกับ CarouselGrid) ให้เลื่อนนิ่งบนมือถือ */}
        <div
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/orders/new?product=${p.id}`)}
              aria-label={`${p.name} ${formatThb(p.price)} ${vocab.soldLine(String(p.soldCount))} — เพิ่มลงออเดอร์ใหม่`}
              className={`${single ? 'w-full' : 'w-28 shrink-0 snap-start'} overflow-hidden rounded-xl border border-default-200 bg-card text-left transition-transform duration-150 hover:shadow-sm active:scale-95`}
            >
              {/* ProductThumb: สัดส่วนคุมที่กรอบ ไม่ใช่ที่ <img> (img เป็น replaced element มี intrinsic
                  ratio ของตัวเอง สั่งทับตรง ๆ ไม่มีผล) + มี fallback ตอนรูปโหลดไม่ขึ้น (onError) ซึ่ง
                  <img> ดิบที่เคยเขียนไว้ตรงนี้ไม่มี — รูปเสียแล้วได้ไอคอนรูปแตกของเบราว์เซอร์ */}
              <ProductThumb src={p.image} alt={p.name} className="aspect-video w-full" iconClassName="size-8" />
              <div className="p-2">
                {/* min-h-8 = จอง 2 บรรทัดของ text-xs เสมอ → ราคาของทุกใบอยู่ระดับเดียวกัน */}
                <p className="line-clamp-2 min-h-8 text-xs font-medium text-dark">{p.name}</p>
                <p className="mt-0.5 truncate text-sm font-bold text-primary">{formatThb(p.price)}</p>
                {/* จำนวนสั่งซื้อ (ไม่รวมออเดอร์ที่ยกเลิก) — ลำดับซ้าย→ขวา = ขายดีสุดก่อน */}
                <p className="mt-1 flex items-center gap-1 truncate text-2xs text-default-400">
                  <Icon icon={vocab.soldIcon} className="size-3 shrink-0" />
                  {vocab.soldLine(p.soldCount.toLocaleString('th-TH'))}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
