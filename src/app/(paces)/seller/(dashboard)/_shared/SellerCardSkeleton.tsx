/**
 * SellerCardSkeleton — skeleton loading components สำหรับ seller pages
 *
 * Base (multi-source):
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx
 *     (bg-default-300 block h-X w-Y animate-pulse rounded, L75-83)
 *   - theme/paces/Admin/TS/src/app/(admin)/ui/spinners/page.tsx (card structure)
 *   - theme/paces/Admin/TS/src/assets/css/custom/_card.css (card, card-body, card-header)
 *
 * export หลายตัวจากไฟล์เดียว — loading.tsx import ตามต้องการ
 * ใช้ pulse bars จาก Paces placeholder primitive: `bg-default-300 animate-pulse rounded`
 *
 * ─── กฎการเลือก skeleton (skeleton ต้อง mirror หน้าจริงเสมอ) ───
 *   1. หน้า list ที่เป็น "ตาราง" บน desktop → SellerTableSkeleton
 *      (เช่น /products /customers /categories — ตารางล้วน)
 *   2. หน้า list ที่ responsive (ตาราง desktop / การ์ด mobile เช่น /orders) → ใช้ทั้งคู่
 *      ตาม breakpoint หน้าจริง: `hidden lg:block` SellerTableSkeleton
 *      + `lg:hidden` SellerOrderCardSkeleton
 *   3. หน้า stat / form / grid → SellerCardSkeleton / SellerChartSkeleton ตาม layout
 *   ห้ามเลือก skeleton คนละชนิดกับ layout หน้าจริงบน breakpoint เดียวกัน (เช่น orders desktop
 *   เป็นตาราง แต่โชว์ skeleton การ์ด = ผิด — บทเรียน 2026-06-16)
 */

/** PulseBar — bar เดี่ยวสำหรับ compose skeleton (export ให้หน้าที่ layout ไม่ใช่การ์ดประกอบเองได้) */
export const PulseBar = ({ className }: { className?: string }) => (
  <span className={`bg-default-300 block animate-pulse rounded ${className ?? ''}`} />
)

/**
 * SellerCardSkeleton — mimic stat card (title สั้น + value กลาง + sub บาง)
 * ใช้สำหรับ stat card, form section, หรือข้อมูลทั่วไป
 */
export const SellerCardSkeleton = () => (
  <div className="card">
    <div className="card-body space-y-3">
      {/* title สั้น */}
      <PulseBar className="h-3.5 w-1/3" />
      {/* value กลาง (ตัวเลขหลัก) */}
      <PulseBar className="h-7 w-1/2" />
      {/* sub text บาง */}
      <PulseBar className="h-3 w-2/3" />
      <span className="sr-only">กำลังโหลด...</span>
    </div>
  </div>
)

/**
 * SellerTableSkeleton — mimic data table (header + 5 แถว)
 * ใช้สำหรับ orders, products, customers, categories
 */
export const SellerTableSkeleton = () => (
  <div className="card">
    {/* header row */}
    <div className="card-header">
      <PulseBar className="h-4 w-32" />
      <PulseBar className="h-8 w-24 rounded-full" />
    </div>
    <div className="card-body space-y-3 p-0">
      {/* 5 แถวจำลอง table rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-3 border-b border-default-200 last:border-0"
        >
          {/* checkbox placeholder */}
          <PulseBar className="h-4 w-4 shrink-0" />
          {/* content cols */}
          <PulseBar className="h-3.5 w-24" />
          <PulseBar className="h-3.5 flex-1" />
          <PulseBar className="h-3.5 w-16" />
          <PulseBar className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
    <span className="sr-only">กำลังโหลด...</span>
  </div>
)

/**
 * SellerChartSkeleton — mimic chart area สูง ~360px
 * ใช้สำหรับ sales, dashboard chart section
 */
export const SellerChartSkeleton = () => (
  <div className="card">
    <div className="card-header">
      <PulseBar className="h-4 w-40" />
      <PulseBar className="h-8 w-28 rounded-full" />
    </div>
    <div className="card-body">
      <PulseBar className="h-[360px] w-full rounded" /> {/* HR7 carve-out (เดิม): พื้นที่กราฟ — ApexChart กำหนดความสูงเป็น px ผ่าน prop `height` ไม่มี Paces token ให้ใช้ */}
      <span className="sr-only">กำลังโหลด...</span>
    </div>
  </div>
)

/**
 * SellerOrderCardSkeleton — mimic การ์ดออเดอร์ (mobile card layout)
 * ใช้ใน /seller/orders/loading.tsx แทน table skeleton (list page ใช้ card view บน mobile)
 *
 * โครงสร้าง:
 *   - header row: avatar วงกลม + 2 บรรทัดข้อความ (ชื่อผู้ซื้อ + หมายเลขออเดอร์)
 *   - 2 item row: icon placeholder + 2 ช่องข้อมูล
 *   - footer: badge status + action button pulse
 *
 * render 4 การ์ดใน space-y-2.5 — export นี้คือ SellerOrderCardSkeleton (ไม่ replace ตัวเดิม)
 */
const OrderCard = () => (
  <div className="card">
    {/* header row: avatar + 2 line */}
    <div className="card-header gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <PulseBar className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <PulseBar className="h-3.5 w-28" />
          <PulseBar className="h-3 w-20" />
        </div>
      </div>
      <PulseBar className="h-5 w-16 rounded-full" />
    </div>
    {/* 2 item rows */}
    <div className="card-body space-y-3 py-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <PulseBar className="h-4 w-4 shrink-0 rounded" />
          <PulseBar className="h-3.5 w-24" />
          <PulseBar className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
    {/* footer */}
    <div className="border-t border-default-200 px-5 py-3 flex items-center justify-between gap-2">
      <PulseBar className="h-5 w-20 rounded-full" />
      <PulseBar className="h-8 w-28 rounded" />
    </div>
  </div>
)

/**
 * SellerOrderCardSkeleton — render 4 การ์ด order placeholder ใน space-y-2.5
 */
export const SellerOrderCardSkeleton = () => (
  <div className="space-y-2.5">
    <span className="sr-only">กำลังโหลด...</span>
    {Array.from({ length: 4 }).map((_, i) => (
      <OrderCard key={i} />
    ))}
  </div>
)

/**
 * SellerProductCardSkeleton — mimic การ์ดสินค้า (mobile card layout, ProductCard.tsx)
 * ใช้ใน /seller/products/loading.tsx คู่กับ SellerTableSkeleton (mirror hidden lg:block / lg:hidden)
 *
 * โครงสร้าง mirror ProductCard.tsx: รูปเหลี่ยม(size-14) + 2 บรรทัด(ชื่อ+ประเภท) ซ้าย, ราคา+badge ขวา,
 * เส้นประคั่น, แถวท้าย: ข้อความสั้น + แถวปุ่ม 3 ปุ่ม
 */
const ProductCard = () => (
  <div className="card">
    <div className="card-body space-y-2.5 !py-3 !px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <PulseBar className="size-14 shrink-0 rounded-lg" />
          <div className="min-w-0 space-y-1.5">
            <PulseBar className="h-3.5 w-32" />
            <PulseBar className="h-3 w-20" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <PulseBar className="h-4 w-14" />
          <PulseBar className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-dashed border-default-200 pt-2.5">
        <PulseBar className="h-3 w-24" />
        <div className="flex items-center gap-1.5">
          <PulseBar className="h-11 w-11 rounded-lg" />
          <PulseBar className="h-11 w-11 rounded-lg" />
          <PulseBar className="h-11 w-11 rounded-lg" />
        </div>
      </div>
    </div>
  </div>
)

/**
 * SellerProductCardSkeleton — render 4 การ์ดสินค้า placeholder ใน space-y-3 (ตรงกับ ProductCard list)
 */
export const SellerProductCardSkeleton = () => (
  <div className="space-y-3">
    <span className="sr-only">กำลังโหลด...</span>
    {Array.from({ length: 4 }).map((_, i) => (
      <ProductCard key={i} />
    ))}
  </div>
)

/**
 * SellerInboxSkeleton — mimic ContactList row (feat 00011 Deep Chat, S-11)
 * ใช้ใน /inbox/loading.tsx — mirror layout หน้าจริง: card > divide-y row (avatar + 2 line + time)
 */
const InboxRow = () => (
  <div className="flex items-center justify-between gap-3 px-3.75 py-3 border-b border-default-100 last:border-0">
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <PulseBar className="size-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <PulseBar className="h-3.5 w-28" />
        <PulseBar className="h-3 w-40" />
      </div>
    </div>
    <PulseBar className="h-3 w-10 shrink-0" />
  </div>
)

export const SellerInboxSkeleton = () => (
  <div className="card">
    <div className="card-body !p-0">
      <span className="sr-only">กำลังโหลด...</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <InboxRow key={i} />
      ))}
    </div>
  </div>
)

/**
 * SellerThreadSkeleton — mimic chat bubble สลับซ้ายขวา (feat 00011 Deep Chat, S-12)
 * ใช้ใน /inbox/[conversationId]/loading.tsx
 */
const Bubble = ({ align }: { align: 'start' | 'end' }) => (
  <div className={`flex items-end gap-2.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
    {align === 'start' && <PulseBar className="size-8 shrink-0 rounded-full" />}
    <PulseBar className={`h-10 rounded-lg ${align === 'end' ? 'w-40' : 'w-52'}`} />
    {align === 'end' && <PulseBar className="size-8 shrink-0 rounded-full" />}
  </div>
)

/** className: ต่อท้าย `.card` ให้ caller คุมเรขาคณิตได้ (เช่น `min-w-0 h-full flex-1` ให้ตรงกับ
 *  การ์ดเธรดจริงใน ChatThread.tsx เป๊ะ) — ไม่ส่ง = พฤติกรรมเดิมทุกประการ (h-fit เต็มความกว้าง)
 *  `.card` เป็น `flex flex-col` อยู่แล้ว (custom/_card.css) และ `.card-body` เป็น `flex-auto`
 *  → พอสูงเต็ม แถบ composer จะถูกดันไปติดล่างเองเหมือนหน้าจริง ไม่ต้องใส่ mt-auto */
export const SellerThreadSkeleton = ({ className }: { className?: string } = {}) => (
  <div className={`card ${className ?? ''}`}>
    <div className="card-header">
      <div className="flex items-center gap-3">
        <PulseBar className="size-9 rounded-full" />
        <PulseBar className="h-4 w-32" />
      </div>
    </div>
    <div className="card-body space-y-5 py-6">
      <span className="sr-only">กำลังโหลด...</span>
      <Bubble align="start" />
      <Bubble align="end" />
      <Bubble align="start" />
      <Bubble align="end" />
    </div>
    <div className="border-t border-default-300 border-dashed px-6 py-3.75">
      <PulseBar className="h-10 w-full rounded" />
    </div>
  </div>
)

// default export ชี้ไปที่ SellerCardSkeleton เพื่อ convenience import
export default SellerCardSkeleton
