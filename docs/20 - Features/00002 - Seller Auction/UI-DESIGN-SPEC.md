# UI Design Spec — Seller Auction (00002)

> **Mockup:** `docs/mockups/auction/seller-auction-v1.html` (4 frame: list / สร้าง / detail-live / detail-ended)
> **Design language:** สืบทอด v10 (`docs/superpowers/specs/2026-06-21-seller-command-center-v10-mockup.html`) — Paces น้ำเงิน #236dc9, **Solar Duotone** (@iconify/react), edge-to-edge mobile <1024px, flat/borderless, chip filter solid-active, bottom nav raised-FAB
> **ออกโดย:** safepay-ux (mandatory gate Hard Rule 8) · scope: seller (Paces). buyer bidding = Deep-App mobile (Phase 2 buyer web)
> **อ้าง:** BRD `./BRD.md` (FR-AUC + lifecycle + §11 achievements)

---

## หน้าที่ออกแบบ (seller, Paces)

| # | Route | ไฟล์ | RSC/Client |
|---|---|---|---|
| 0 | (entry) command center carousel + sidenav | แก้ CommandCenter + sidenav | — |
| 1 | `/seller/auctions` | list page | RSC + client (chip filter, countdown, action menu) |
| 2 | `/seller/auctions/new` (+ `[id]/edit` reuse) | create form | client (react-hook-form + Yup) |
| 3 | `/seller/auctions/[id]` | detail/manage (5 state) | RSC + client (bid feed Supabase Realtime, countdown, cancel) |
| 5 | achievement grid | (ไม่สร้างใหม่ — auction badge ผสมใน grid เดิม) | — |

## 1. List `/seller/auctions`
- header: title "การประมูล" + search icon + ปุ่ม "+ สร้าง" (primary solid)
- **chip filter scroll-x:** ทั้งหมด/ฉบับร่าง/รอเปิด/กำลังประมูล/จบแล้ว/ขายไม่ออก/ยกเลิก (active = solid primary)
- **auction row** (flat, `.prd`-style, border-top คั่น): thumb 64px + ชื่อ + ราคาปัจจุบัน+bidCount + countdown/วันที่/meta + status badge + action `⋮`
- **status badge สี:** draft=default · scheduled=info · live=success(+pulse dot) · ended=primary · unsold=warning · cancelled=danger
- **countdown** = client `<AuctionCountdown>` (setInterval 1s, tabular-nums, **ห้าม font-mono**)
- **action menu** = FilterDropdown (re-render safe): draft/scheduled→แก้ไข/เผยแพร่/ยกเลิก · live+0bid→ยกเลิก · live+bid→ดูรายละเอียด · ended→ดูรายละเอียด
- cancel → **SweetAlerts** confirm; success → pacesToast (top-right)
- desktop: DataTable TanStack (columns) + toolbar chip
- empty: icon gavel + "ยังไม่มีรายการประมูล" + ปุ่มสร้างแรก

## 2. Create `/seller/auctions/new`
- card: ข้อมูลพื้นฐาน (ชื่อ* + หมวดหมู่ native `form-select`* + สินค้าในร้าน optional + คำอธิบาย)
- card: รูปภาพ (FileUploader ≥1 ใบ)
- card: ราคา — `input-group ฿`: startPrice* / bidIncrement* / **reservePrice** (info: buyer เห็นว่ามีแต่ไม่เห็นตัวเลข) / **buyNowPrice** (info: กดซื้อทันที)
- card: เวลา — radio เปิดทันที|กำหนดเวลา (datetime-local) + endTime* (≥ now+30นาที)
- footer sticky: [บันทึกร่าง] [เผยแพร่]
- **L2 guard:** ไม่ผ่าน L2 → banner warning + form disabled + ปุ่มไป /seller/verification
- validation: reserve≥start, buyNow>reserve(หรือ start) — inline error

## 3. Detail/Manage `/seller/auctions/[id]` — 5 states
- **hero card:** รูป + ชื่อ + status badge; live→ราคาปัจจุบันใหญ่ + bidCount
- **LIVE (immersive "live สด"):** hero รูปเต็มจอ + HUD overlay (LIVE badge pulse + 👁 คนดู + ชื่อ + **ราคาปัจจุบัน=ราคาสูงสุด ใหญ่ โชว์เสมอ** + countdown แดง) + แถบ anti-snipe full-width
  - **ลำดับ: รายละเอียดประมูล (kv card) อยู่ใต้ราคา** → seller note → **bid stream อยู่ล่างสุด**
  - **bid stream = Facebook-comment style** (`.cmt`): avatar กลม + **FB badge มุม** (จำลอง bid ผ่าน Facebook) + ชื่อ + **User Level badge ประกบทุกคน** (`.lvl` gold/dia/sil + crown/diamond/shield icon) + bubble "เสนอราคา ฿X" + meta "X ที่แล้ว · ผ่าน Facebook"
  - **collapsed:** โชว์แค่ **ผู้นำ (ราคาสูงสุด) pin บนสุด** + ปุ่ม "ดูการเสนอราคาก่อนหน้า (N) ▾"; กด expand → list เต็ม (เรียงราคาสูง→ต่ำ) + "ย่อ ▴"
  - `<AuctionBidFeed>` client — subscribe **Supabase Realtime** `channel(auction:{id}).on(postgres_changes UPDATE Auction)` → update currentPrice/bidCount/endTime → refetch bid list top20; pulse "รับข้อมูลสด"; countdown + **anti-snipe indicator** ("ต่อเวลาแล้ว X/5"); anti-snipe trigger → pacesToast.info "+60 วินาที"; cancel zone เฉพาะ bidCount=0
- **DRAFT/SCHEDULED:** ปุ่ม แก้ไข/เผยแพร่/ยกเลิก
- **ENDED:** result card (success accent border-s-3) — ผู้ชนะ displayName + ราคาสุดท้าย + ปุ่ม "ดูคำสั่งซื้อ" → /seller/orders/[id] + bid history (static)
- **UNSOLD:** result card (warning) — ราคาสูงสุดที่ได้ (แสดง) + reserve (ไม่แสดงมูลค่า) + "ไม่มีผู้ชนะ"
- **CANCELLED:** muted card
- info card: ราคาเริ่ม/ขั้นบิด/reserve(แค่"มี")/buyNow/เวลา (`formatDateTime`)
- PII: แสดงแค่ displayName (ไม่ phone/email)

## 0. Entry point
- เพิ่ม tile "ประมูล" ใน command center carousel (icon `tabler:gavel`, สี warning) + badge จำนวน live + sidenav item

## 5. Achievement (ไม่สร้าง UI ใหม่)
- auction badge (gavel/trophy/podium/medal — `tabler:*`) ผสมใน badge grid เดิม (`getBadgeProgress`) ที่ profile/dashboard อัตโนมัติ (BRD §11.7)

## Theme Source Mapping (สรุป)
| Element | Theme source |
|---|---|
| header/chip/row/bottom-nav | v10 mockup |
| create form 3-col + cards | `theme/.../product-add/page.tsx` + ProductInformation/Pricing/ProductImage |
| form-select category (native) | `theme/.../form/elements/InputTextfieldType.tsx` (HR6) |
| desktop list DataTable | `theme/.../ecommerce/orders/OrdersList.tsx` |
| bid feed (timeline) | `theme/.../order-details/ShippingActivity.tsx` |
| info key-value card | `theme/.../order-details/OrderSummary.tsx` |
| result card accent | paces-component-reference §7 `card border-s-3 border-{color}` |
| cancel dialog | `theme/.../plugins/sweet-alerts/SweetAlerts.tsx` |
| action menu | `src/components/safepay/FilterDropdown.tsx` |
| badge สถานะ | `theme/.../ui/badges/page.tsx` |

## Arbitrary (HR7 — comment ตอน build)
- countdown = JS setInterval (ไม่มี CSS arbitrary); pulse = `animate-pulse` (Tailwind utility); Supabase client import ใน client component

## Realtime approach
subscribe **Auction row UPDATE** (ไม่ใช่ Bid table — Bid insert ไม่ broadcast by default). seller เห็น update <1s → refetch bid list. ต้อง `ALTER PUBLICATION supabase_realtime ADD TABLE "Auction"` (infra task) + RLS/anon policy

## Open Questions (ต้องเคาะ/ทำก่อน implement)
1. **Schema fields ยังไม่มี:** `reservePrice`, `buyNowPrice`, `antiSnipeCount`, status variants (draft/scheduled/unsold/cancelled) — **DATABASE migration ต้องทำก่อน** (DATABASE.md)
2. **Supabase Realtime publication** = แตะ prod DB (ต้อง user approve)
3. icon "ประมูล" = `tabler:gavel` (Solar ไม่มี gavel; tabler รองรับ + BRD §11.2 อ้างถึง)
4. displayName ใน bid feed = public (ไม่ถือ PII mask)
5. countdown=0 → `router.refresh()` + poll 5s จนกว่า status เปลี่ยน (settle cron lag)
