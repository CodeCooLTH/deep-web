# Seller Command Center v10 — Design Spec

> **สถานะ:** Design approved (brainstorm) 2026-06-21 — รอ user review spec → ทำ implementation plan
> **Mockup:** `./2026-06-21-seller-command-center-v10-mockup.html` (โฟลเดอร์เดียวกับไฟล์นี้; ต้นฉบับ iteration `docs/mockups/home/command-center-v10.html`)
> **safepay-ux Design Spec:** ออกแล้ว (compact hero + carousel + theme source mapping) — สรุปฝังในเอกสารนี้
> **Scope:** seller mobile `(paces)/seller/(dashboard)/**` — 4 หน้า: Command Center, การแจ้งเตือน, คำสั่งซื้อ (list), สินค้า (list)

---

## 1. Goal / ทำไม redesign

redesign Seller Command Center (และหน้า list ที่เกี่ยวข้อง) ให้:
1. **Polish / premium** มากกว่าเดิม
2. **จัด layout/IA ใหม่** ให้ actionable + dense
3. **Mobile-first edge-to-edge** (ไม่มี padding ด้านข้าง — section เต็มกว้าง)
4. **flat + modern** คุม mood Paces (น้ำเงิน #236dc9, ไม่ใช่ม่วง Vuexy; ไม่ลอยแบบ Vuexy)
5. คง concept "command center" (ภาพรวม + ทางลัด + งานที่ต้องทำในจอเดียว)

อิง Shopee seller IA (Hard Rule 6: เอา layout/IA ตาม ref แต่ skin/สี/component = Paces theme ปัจจุบัน)

## 2. Scope

| In scope | Out of scope |
|---|---|
| Command Center `/dashboard` (mobile) rebuild | Desktop (`lg:`) variant — เฟสถัดไป |
| หน้า การแจ้งเตือน `/notifications` | SVG hero background **asset จริง** (mockup ใช้ลำแสง generated; ของจริงอาจปรับ) |
| หน้า คำสั่งซื้อ list `/orders` (re-skin ตาม style ใหม่) | charts/analytics ละเอียด (หน้า "รายงาน" แยก) |
| หน้า สินค้า list `/products` (re-skin) | wiring data ละเอียด (อยู่ใน implementation plan) |

## 3. หลักการออกแบบรวม (ใช้ทุกหน้า)

- **Edge-to-edge:** section เป็น band สีขาวเต็มกว้าง คั่นด้วยช่องว่าง `--body-bg` ไม่มี padding ด้านข้างนอก band (internal padding ในการ์ด 16px)
- **Flat + borderless:** เอา circle/box ครอบ icon ออก, เอา border ที่ไม่จำเป็นออก — icon เป็น glyph สีล้วน (`color` token), badge/CTA solid เท่านั้น
- **Icon set = Solar Duotone** ผ่าน `@iconify/react` → `<Icon icon="solar:<name>-bold-duotone" />` (Paces มี icon page `theme/paces/Admin/TS/src/app/(admin)/icons/solar-duotone/`); ใช้ `-linear` variant สำหรับ chevron/ค้นหา/utility เล็ก ๆ. **ห้าม Tabler webfont ใน mobile command center** (ของเดิม Tabler — เปลี่ยนเป็น Solar duotone)
- **สี:** Paces token เท่านั้น (`bg-primary` #236dc9, semantic warning/info/success/danger) — ห้าม hardcode hex / ม่วง #7367F0
- **Font:** Anuphan (ห้าม font-mono บนข้อความไทย)
- **Bottom nav:** คง `SellerBottomNav` (raised FAB) เดิม — highlight แท็บที่อยู่

## 4. หน้า Command Center `/dashboard`

ความสูง header ลด ~50% จาก v9 (~210px → ~110px) เหลือ 2 แถวบน hero + เลื่อนเจอเนื้อหาเร็ว

### 4.1 Hero (compact, full-bleed, พื้นหลัง SVG)
- **พื้นหลัง:** SVG ลำแสง xenon โทน Paces น้ำเงิน (on-brand auto-xenon) + overlay tint แบน `rgba(20,52,102,.30)` ให้ตัวอักษรขาวอ่านชัด. มุมล่างโค้ง `rounded-b` พอโมเดิร์น
- **Row 1 — profile:**
  - avatar รูปจริง + **วงแหวน trust progress รอบรูป** (SVG ring, fill = trustScore%, เห็นชัดว่ากำลังจะเต็มวง) + **chip เลขคะแนน** (เช่น 65) มุมล่าง avatar
  - ชื่อร้าน + **stats บรรทัดเดียว: `{orders} คำสั่งซื้อ · {reviews} รีวิว · ★{avgRating}`** (แทน tier badge เดิม)
  - กระดิ่ง = **icon ล้วน** (ไม่มีกล่อง) + badge จำนวน unread → กด → `/notifications`
- **Row 2 — wallet + shop link (โปร่งใส ไม่มีกรอบ):**
  - `[wallet icon] ฿{balance}` + ปุ่ม **เติมเงิน** (white pill) → `/wallet`
  - divider บาง + **ไอคอนคัดลอกลิงก์ร้าน** + **ไอคอนแชร์** (icon ขาวล้วน ไม่มีกล่อง) → คัดลอก/แชร์ `resolveBuyerBaseUrl()/{shop.slug}`

### 4.2 คำสั่งซื้อ (band) — icon + label + badge
- หัวข้อ "คำสั่งซื้อ" + "ดูทั้งหมด ›" → `/orders`
- 4 คอลัมน์: **icon เส้น (solar duotone) + label สั้น + badge เล็กมุมบน** (ไม่มี circle/border/เลขใหญ่) — แสดง badge เฉพาะที่ต้องทำ (รอดำเนินการ/กำลังจัดส่ง); สำเร็จ/ยกเลิก ไม่มี badge
- ข้อมูลจริง: `getOrderStatusCounts` → กด → `/orders?status=`

### 4.3 เมนูลัด (carousel)
- **carousel แบ่งหน้า: 4 คอลัมน์ × 2 บรรทัด = สูงสุด 8 ราย/หน้า** (`overflow-x-auto` + `scroll-snap` page-snap; **ไม่ใช้** Preline `hs-carousel` — absolute layout + พัง re-render)
- **เกิน 8 → ขึ้นหน้าใหม่ + dot บอกจำนวนหน้า** (dot ล่าง center; 1 หน้า → ไม่มี dot)
- รายการปัจจุบัน (7): **รายงาน · รีวิว · ความสำเร็จ · สินค้า · ลูกค้า · คูปอง · ตั้งค่า** (icon solar duotone, สี semantic หลากหลาย)

### 4.4 กิจกรรมล่าสุด (band)
- หัวข้อ + "ดูทั้งหมด ›" → `/notifications`
- timeline เส้น dashed: icon + ข้อความ + เวลา (`formatDateTime` พ.ศ.) — ข้อมูลจริงจาก recent orders/reviews

## 5. หน้า การแจ้งเตือน `/notifications`
- **Header sub-page flat** (บน body-bg): `← การแจ้งเตือน ... ✓ อ่านทั้งหมด`
- จัดกลุ่มตามเวลา: **วันนี้ / เมื่อวานนี้ / ก่อนหน้า**
- แต่ละรายการ: icon solar duotone (สีตามชนิด) + หัวข้อ + รายละเอียด + เวลา; **unread** = พื้นฟ้าจาง `rgba(primary,.055)` + dot น้ำเงิน
- ชนิด: ออเดอร์ใหม่ / ออเดอร์เปลี่ยนสถานะ / รีวิวใหม่ / เติมเงิน / ความสำเร็จ(badge) / ยืนยันตัวตน
- รายการคั่นด้วย hairline `1px default-100` (list style)

## 6. หน้า คำสั่งซื้อ list `/orders`
- **Header primary-tab:** title "คำสั่งซื้อ" + ปุ่ม filter/tuning
- **ค้นหา:** white pill input (เลขออเดอร์/ชื่อ/เบอร์)
- **filter chips เลื่อนแนวนอน:** ทั้งหมด(active)/รอดำเนินการ/กำลังจัดส่ง/สำเร็จ/ยกเลิก
- **order row (band):** `#id` + badge สถานะ · ชื่อลูกค้า+เบอร์(mask) · รูปสินค้า+สรุปรายการ (เส้น dashed) · ยอดรวม+วันที่ · ปุ่ม action ตามสถานะ (ลิงก์/ส่ง SMS/คัดลอก/อัปเดต/รีวิว)
- bottom nav: แท็บ "คำสั่งซื้อ" active

## 7. หน้า สินค้า list `/products`
- **Header primary-tab:** title "สินค้า" + ปุ่ม **เพิ่มสินค้า** (solid primary)
- ค้นหา + filter chips: ทั้งหมด/เปิดขาย/สินค้าหมด/ปิดการขาย
- **product row (list + hairline divider):** รูป thumb 62px + ชื่อ + ราคา (primary) + meta (คงเหลือ/ประเภท + badge สถานะ เปิดขาย/สินค้าหมด) + ปุ่มแก้ไข
- bottom nav: แท็บ "สินค้า" active

## 8. Theme Source Mapping (จาก safepay-ux)

| Element | Theme source ที่ copy โครง | Paces primitive |
|---|---|---|
| Hero card | `theme/paces/Admin/TS/.../dashboard/ecommerce/components/UserCard.tsx` | `.card` + `card-body` |
| Avatar chip/ring | `.../widgets/statistics/components/Stat.tsx` + SVG ring (custom) | `size-12 rounded-full` |
| ปุ่ม (เติมเงิน/bell/link/share) | `.../ui/buttons/page.tsx` + `_buttons.css` | `btn btn-sm` / icon button |
| คำสั่งซื้อ status | `src/app/(paces)/seller/(dashboard)/dashboard/components/OrderStatusRow.tsx` (adapt) | grid-cols-4 |
| เมนูลัด carousel | adapt `ShortcutGrid.tsx` → `overflow-x-auto flex/grid + snap` | Tailwind utility |
| กิจกรรม / noti list | `RecentActivityFeed.tsx` + `after:border-dashed` timeline | `.card` |
| order/product row | `.../ecommerce/orders` + `.../products` theme list | `.card` list |
| Icons | `theme/paces/Admin/TS/.../icons/solar-duotone/` | `@iconify/react` `solar:*` |
| Bottom nav | `src/app/(paces)/seller/(dashboard)/_shared/SellerBottomNav.tsx` (ไม่เปลี่ยน) | raised FAB |

## 9. Token / spacing

อิง `src/assets/css/config/_root.css`: `text-2xs`=11px, `text-xs`=13px, `text-sm`=14px. ใช้ token เท่านั้น

## 10. Arbitrary ที่ต้อง document (Hard Rule 7 — เขียน comment กำกับตอน build)

- **SVG hero background + overlay** — Paces ไม่มี image/gradient hero token; เป็น design ที่ user เลือก (premium). comment กำกับ + คุมให้เป็นโทน primary (ไม่ใช่ Vuexy mood ลอย)
- **Trust ring SVG + score chip** — ไม่มี Paces token สำหรับ progress ring รอบ avatar
- **Carousel** `overflow-x-auto` + `scroll-snap-*` + `[&::-webkit-scrollbar]:hidden` — Tailwind utility (ยอมรับได้); scrollbar-hide เป็น arbitrary selector → comment กำกับ
- **Edge-to-edge negative gutter** — ยกเลิก `main px-5` ของ Paces; comment กำกับ
- **Raised FAB / safe-area** — อนุมัติแล้ว (SellerBottomNav เดิม)

## 11. Data sources (ข้อมูลจริง — ห้าม fake)

| ข้อมูล | source |
|---|---|
| trust score / tier | `trust-score.service` (`getTrustLevel`) |
| order status counts | `order.service` `getOrderStatusCounts` |
| wallet balance | `wallet.service` (SellerWallet) |
| shop slug (ลิงก์ร้าน) | `Shop.slug` + `resolveBuyerBaseUrl` |
| stats (orders/reviews/rating) | order count + review count + `getAvgRating*` |
| notifications | recent orders/reviews/wallet tx (Phase: ยังไม่มี Notification model จริง — อาจ derive จาก activity หรือสร้าง model ใน plan) |

## 12. Edge states
- avatar = null → initials บน `bg-primary/15`
- wallet = 0 → แสดง ฿0 (ไม่ซ่อน)
- unread = 0 → ซ่อน badge กระดิ่ง
- count = 0 → ซ่อน badge คำสั่งซื้อ
- เมนูลัด >8 → หน้าใหม่ + dots; ≤8 → ไม่มี dots
- product สต็อก 0 → badge "สินค้าหมด"
- list ว่าง → empty state + CTA

## 13. Open questions (สำหรับ plan/build)
1. Shop link URL = `/{slug}` หรือ `/u/{username}` (ยืนยัน format)
2. ปุ่มคัดลอก/แชร์ = client component เล็ก (`ShopLinkButtons`) ฝังใน hero (CommandCenter ส่วนอื่นคง RSC)
3. Notification: derive จาก activity หรือสร้าง `Notification` model (กระทบ scope/DB)
4. SellerHeader/WalletCard เดิม → refactor in-place หรือสร้าง `CompactHero` ใหม่ (แนะนำสร้างใหม่)
5. carousel pagination dots — sync ด้วย IntersectionObserver/scroll listener (client)

## 14. Paces compliance checklist (build gate)
- [ ] น้ำเงิน #236dc9 ทุกที่ (grep ไม่มี #7367F0)
- [ ] Solar duotone ผ่าน `@iconify/react` (ไม่มี Tabler webfont ใน mobile cc)
- [ ] ไม่มี font-mono บนข้อความไทย
- [ ] toast = `pacesToast` (ไม่มี react-toastify ใน (paces))
- [ ] ไม่มี `component={Link}` ใน server component
- [ ] arbitrary ทุกจุด (§10) มี comment กำกับ
- [ ] `Base:` line ใน commit ชี้ theme source (§8)
