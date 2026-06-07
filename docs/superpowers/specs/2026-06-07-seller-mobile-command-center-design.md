# Design Spec — Seller Mobile Command Center

วันที่: 2026-06-07 · phase: seller-mobile-responsive · สถานะ: APPROVED (visual mockup V2 อนุมัติโดย user)
mockup: `docs/mockups/home/command-center-v2.html` (FAB speed-dial), `command-center-v1.html` (CTA variant — superseded)

## Goal

seller ที่เปิดบนมือถือ/แท็บเล็ต (≤1024px) เข้ามาเจอ **command center** เป็นหน้าแรก — กริด shortcut ไปทุกหน้างานพร้อม badge/ตัวเลข live + FAB speed-dial มุมขวาล่างสำหรับ action "สร้าง" — แทนที่จะเจอ desktop dashboard ยัดลงจอ. Desktop (≥1024px) เห็น dashboard เดิมไม่เปลี่ยน.

## Architecture & Routing

- **ไม่สร้าง route ใหม่** — ใช้ landing เดิม `/dashboard` (seller subdomain เข้ามา redirect มาที่นี่) เป็นจุดเดียว
- `dashboard/page.tsx` (RSC) fetch ข้อมูลครั้งเดียว แล้ว render 2 ฝั่งด้วย Tailwind breakpoint `lg` (1024px):
  - `<div className="lg:hidden">` → `<CommandCenter data={...} />` (mobile + tablet ≤1024px)
  - `<div className="hidden lg:block">` → dashboard เดิม (desktop ≥1024px, ไม่แตะ)
- กราฟ ApexCharts ของ desktop ใช้ `next/dynamic` (มีอยู่แล้ว) ไม่ถ่วง mobile payload
- **ไม่มี viewport redirect** — render ถูกตั้งแต่ paint แรก ไม่ flash. (server ไม่รู้ viewport จึงต้องใช้ CSS breakpoint ไม่ใช่ JS redirect)

## Components

ทุก component ต้อง **copy จาก Paces theme** (Hard Rule 1) — theme source ที่แน่นอนให้ safepay-ux + Explore ระบุ (ดู §Theme Sourcing).

1. **`CommandCenter`** (RSC, `src/app/(paces)/seller/(dashboard)/dashboard/_command-center/CommandCenter.tsx`)
   container: greeting (ชื่อร้าน + trust score มินิ) → hero tiles → quick-access grid → ลิงก์ "ดูรายงานเต็ม" → mount `<CreateFab/>`
2. **`CommandTile`** (RSC) — การ์ด shortcut: ไอคอน chip (tabler) + label ไทย + badge/ตัวเลข live + `next/link` ไปหน้าเป้าหมาย. รับ props: `href, icon, label, value?, valueColor?, iconBg, iconColor`
3. **Hero tiles** (2 ช่อง grid-cols-2) — คำสั่งซื้อ (pending count เด่น) + เติมเงิน/SMS (wallet balance) — variant ของ CommandTile ที่ตัวเลขใหญ่กว่า
4. **`CreateFab`** (**client component** `'use client'`) — FAB speed-dial มุมขวาล่าง:
   - main FAB (60px, น้ำเงิน) toggle open/close (`+` ↔ `×`)
   - open → backdrop dim (`bg-black/25`) + ปุ่มย่อย 3 ตัวกางขึ้น แต่ละตัว = label pill ขาว + round mini-FAB สี:
     - สร้างออเดอร์ → `/orders/new` (icon `tabler:shopping-cart-plus`, น้ำเงิน)
     - สร้างสินค้า → `/products/new-v2` (icon `tabler:box`, indigo) *(route ยืนยันกับ planner)*
     - สร้างหมวดหมู่ → `/categories` create (icon `tabler:category-plus`, amber) *(route/flow ยืนยันกับ planner)*
   - ปิดเมื่อ: กด ×, กด backdrop, กด ESC, หรือเลือก action
   - a11y: `aria-expanded`, focus trap ขณะ open, ปุ่มมี aria-label

## Data

หน้า `dashboard/page.tsx` (RSC) ประกอบ object เดียวส่งเข้า CommandCenter:

```ts
type CommandCenterData = {
  shopName: string
  trustScore: number          // มีอยู่แล้วใน dashboard
  pendingOrderCount: number    // orders ที่ status = รอดำเนินการ (PENDING)
  walletBalance: number        // ฿ คงเหลือ
  productActiveCount: number
  categoryCount: number
  customerCount: number
  reviewAvgRating: number | null  // หรือ reviewCount
  verificationLevel: 'L1' | 'L2' | 'L3' | 'PENDING' | 'NONE'
}
```

- ส่วนใหญ่ดึงจาก service ที่ dashboard ใช้อยู่แล้ว (shop, trust-score, order, wallet)
- ตัวที่ยังไม่มี query (เช่น `pendingOrderCount`, `productActiveCount`, `customerCount`) = developer เพิ่ม service function เล็ก ๆ (read-only count) — **ไม่แตะ schema → ไม่ต้อง safepay-database**
- planner ต้อง map แต่ละ field → service function ที่มี/ต้องเพิ่ม ก่อน develop

## Error Handling

- badge ตัวใด query พลาด/เป็น null → tile แสดง label เฉย ๆ ไม่มีตัวเลข (ไม่ throw, ไม่ block กริด)
- ทุก tile เป็นลิงก์ตรง ใช้งานได้แม้ badge ขาด
- CreateFab ทำงานฝั่ง client ล้วน ไม่พึ่ง data

## Accessibility & Touch

- ทุก tile + FAB touch target ≥ 44px (mockup: tile การ์ดใหญ่, mini-FAB 48px, main FAB 60px)
- FAB: focus trap ขณะ open, ESC ปิด, backdrop กดปิด
- ตัวอักษร Anuphan, contrast ผ่าน (label ink บนพื้นขาว)

## Tablet (768–1024px)

- เห็น command center เหมือน mobile (เพราะ ≤1024px = `lg:hidden`)
- กริด quick-access ขยายจาก 3-col → อาจ 4-col ที่ `sm:`/`md:` (safepay-ux กำหนด); hero ยัง 2-col
- ไม่มี sidebar (offcanvas) — command center คือ navigation หลัก

## Out of Scope (กันบานปลาย)

- ไม่ทำ bottom-nav bar
- ไม่ทำ PWA / manifest / service worker
- ไม่แตะ desktop dashboard (≥1024px)
- ไม่ redesign หน้าปลายทาง (orders/products list) — เป็นงาน responsive-fix แยก (S-3/S-4/S-5 ใน baseline)
- FAB อยู่เฉพาะ command center home (mobile/tablet) — ไม่ทำ global FAB ทุกหน้าใน phase นี้ (ตัวเลือก Phase 2)
- ไม่ทำหน้า "สร้างหมวดหมู่" ใหม่ถ้ายังไม่มี — ถ้า categories ยังไม่มี create flow → FAB ลิงก์ไปหน้า categories เฉย ๆ (planner ยืนยัน)

## Theme Sourcing (ให้ safepay-ux + Explore ระบุก่อน build)

- **CommandTile / hero card** → หา Paces source: เดา `StatisticCard` ที่ dashboard ใช้ หรือ widget/stat card ใน `theme/paces/Admin/TS/src/`
- **FAB speed-dial** → Paces/Preline มี component FAB หรือ dropdown/speed-dial ไหม? ถ้าไม่มีตรง ๆ → copy ปุ่ม + dropdown pattern ที่ใกล้สุด แล้วปรับ (ระบุ Base: ให้ชัดว่า adapt จากอะไร)
- ทุก commit UI ต้องมี `Base:` line
```
