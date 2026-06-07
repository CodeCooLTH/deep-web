# แผน Implementation — Command Center V4 Polish

> Branch: `feat/seller-mobile-responsive` | 2026-06-07
> Spec: `docs/superpowers/specs/2026-06-07-command-center-v4-polish-design.md`
> Visual SoT: `docs/mockups/home/command-center-v4.html` (approved)
> ขอบเขต: polish โครงเดิม — แก้ className/Tailwind ใน component เดิม + tier chip (data ใหม่ตัวเดียว)

## Tier chip (SSOT — Tier Lists.md)
chip ใน top bar โชว์ **Deep tier name** (ไม่ใช่ letter grade). mapping จาก `docs/10 - Business Rules/Tier Lists.md`:
| letter (getTrustLevel) | tier name | โทนสี |
|---|---|---|
| A+ | Deep Star | ม่วง |
| A | Deep Diamond | ฟ้า |
| B+ | Deep Gold | ทอง |
| B | Deep Silver | เทาเงิน |
| C, D | Deep Classic | ส้ม/อำพัน |
**ห้าม hardcode mapping ใหม่** — reuse helper ที่ order page `/o/[token]` ใช้ (chip tier ชื่อ+สี) ถ้ามี; ถ้าไม่มี helper ชื่อ ให้เพิ่ม `getTierName(level)` ใน `trust-score.service.ts` (canonical place ข้าง getTrustLevel) ตามตาราง SSOT

## Card treatment (consistent ทุก section — ใช้ Tailwind arbitrary ไม่สร้าง CSS class ใหม่)
- radius: `rounded-[20px]`
- shadow ลอย: `shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-8px_rgba(16,24,40,0.10)]`
- (แต่ละ component ใส่เองในไฟล์ตัวเอง — กัน shared-file conflict ตอน parallel)

## Tasks (P1 ก่อน → P2-P5 parallel)

### P1 — contract + data + tier helper (foundation)
- ไฟล์: `src/services/trust-score.service.ts` (+ `getTierName` ถ้ายังไม่มี helper), `_constants/command-center.ts` (เพิ่ม field), `dashboard/page.tsx` (ส่ง data)
- เพิ่ม `tierName: string` + `tierTone` (หรือ `trustLevel: string` ให้ CommandTopBar map เอง) ใน `CommandCenterData`
- **ก่อนเพิ่ม helper: grep หา tier-chip ที่ order page ใช้ก่อน** (`/o/[token]` หรือ services) — reuse ถ้ามี
- page.tsx: ส่ง `level` (มีอยู่แล้วจาก getTrustLevel) → resolve tier name → CommandCenterData
- Base: N/A (data/service)

### P2 — CommandTopBar polish (S-8) — รอ P1 (ใช้ tier)
- avatar กลม ring-2 ring-white + ชื่อร้าน + **tier chip** (Deep tier name + สีตาม tone) ซ้าย; hamburger ghost (`hover:bg-gray-50` ไม่ทึบ); bell **dot แดง** แทนเลข ขวา; sticky + gradient fade ด้านล่าง (`bg-gradient` 78%→transparent)
- card: rounded-[20px] + layered shadow
- คง: showBackdrop, touch ≥44px (ปุ่ม w-10 h-10=40 → **ใช้ w-11 h-11=44** กัน a11y fail), Anuphan
- Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx

### P3 — ShortcutPanel polish (S-9) — independent
- **8 tile เก็บเข้า card เดียว** (`<div class="card p-3">` รอบ grid), grid-cols-4 gap-y-4
- COLOR_CHIP เปลี่ยนเป็น **4 กลุ่มความหมาย** (เลิก per-tile รุ้ง): blue=คำสั่งซื้อ/สินค้า/ลูกค้า, emerald=เติมเงิน, amber=รีวิว/ความสำเร็จ, slate=ตั้งค่า/Blacklist. **อัปเดต SHORTCUT_TILES.color ใน _constants ให้ตรง 4 กลุ่ม** (P3 แตะ _constants ส่วน color เท่านั้น — ระวัง P1 ก็แตะ _constants → ทำ P3 หลัง P1 merge หรือ Controller รวม)
- chip 52px (`w-[52px] h-[52px]`), badge ring-2 ring-white; tile#5 disabled opacity-45
- card: rounded-[20px] + layered shadow
- Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx

### P4 — OrderStatusTimeline polish (S-11) — independent
- **highlight bar "รอคุณดำเนินการ N รายการ"** บนสุด: blue-tint bg, icon clock ใน chip ขาว, ตัวเลขใหญ่ blue, chevron, เป็น `<Link href="/orders">` (actionable)
- 3 สถานะที่เหลือ (จัดส่ง/สำเร็จ/ยกเลิก) = `grid-cols-3` แถวเล็ก (chip 36px, เลข 17px)
- section header เพิ่ม link "จัดการ ›" → /orders
- count "99+" clamp คงไว้; card rounded-[20px]+shadow
- Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx

### P5 — RecentActivityFeed polish (S-12) — independent
- section header ย้าย "ดูทั้งหมด ›" ขึ้นไปบน (จาก footer) → /orders; (footer link เดิมเอาออกหรือคงไว้—ตาม mockup ย้ายขึ้นบน)
- refine: line color เบา (`bg-[#eef0f4]`/gray-100), node ring-4 ring-white, spacing
- card rounded-[20px]+shadow
- Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx

### Controller (หลัง P2-P5)
- wire ตรวจ CommandCenter spacing (section gap), tier prop ส่งถึง CommandTopBar
- CreateFab: ลด 58px (optional, minor)

## Sequencing
P1 → (P2 + P3 + P4 + P5 parallel; P3 แตะ color ใน _constants → ระวัง conflict กับ P1 ที่แตะ _constants: **ทำ P1 ให้ commit/นิ่งก่อน แล้ว P3 ค่อยแตะ**) → Controller wire → reviewer → QA @360/768/1024

## QA (เทียบ mockup v4)
Chrome DevTools MCP @ seller.deepth.local:4000 (ถ้า down → curl+structural + visual debt). ตรวจ: tile 4 กลุ่มสี+card เดียว, highlight bar เด่น, tier chip = Deep tier name ถูก (Deep Silver สำหรับ B), card radius/shadow, top bar, touch ≥44px, no h-scroll @360, desktop ไม่ regress, PII คงปลอด

## Convention
Paces no-MUI, Base: line ทุก UI commit, Anuphan, short path, RSC PII, ห้าม hardcode tier mapping (SSOT)
