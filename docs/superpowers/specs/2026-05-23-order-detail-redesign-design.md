# Order Detail `/o/[token]` — Redesign Design Spec (V1 Profile-consistent)

> **วันที่:** 2026-05-23 · **สถานะ:** design approved (visual) → รอ port ลงโค้ดจริง
> **ขอบเขต:** redesign หน้า buyer-facing public order detail `/o/[token]` (component `OrderDetailMobile.tsx`)
> **Theme:** buyer = Vuexy (MUI) · mobile-first · Anuphan font

---

## 1. Design direction ที่ user เลือก

หลัง explore 5 variations (V1-V5) user เลือก **V1 · Profile-consistent** — ดีไซน์ที่ "ไปทิศทางเดียวกับ" หน้า shop profile `/u/[username]`:

- **Tier cover banner** ด้านบน (รูปตาม trust tier — ใช้ `getTierCover`) สูง ~120-140px + ปุ่ม back มุมซ้ายบน (frosted circle)
- **Avatar กลาง** ซ้อนทับ banner (overlap, `margin-top` ลบ) + **verify badge** มุมขวาล่าง (วงกลมฟ้า ✓)
- **Shop name + @handle + trust chips** (ยืนยันแล้ว / Deep tier name / Trust score) — กึ่งกลาง
- **Status pill** (สีตาม state) + meta (#order · วันที่)
- **Horizontal timeline** — current จุดกลาง (สถานะปัจจุบันใหญ่+มีสี, 3 จุด windowed prev/current/next), flat ไม่มี card รอบ
- **Flat cards** (`box-shadow: 0 1px 2px`, ไม่มี border หนา) — items, payment ฯลฯ
- **รูปสินค้า** ในแต่ละ item (จาก `Product.images[0]`)
- **CTA ink** (`#0F172A`) เต็มกว้าง + footer "ปกป้องการซื้อขายโดย Deep"
- font Anuphan ทุก surface

### Reference files (source of truth ของ visual — ห้าม redesign ใหม่ตอน port)
- **`docs/mockups/order-detail-scenarios.html`** ← **ตัวหลัก** (8 scenarios ครบ lifecycle)
- `docs/mockups/order-detail-v1-full.html` (V1 + slip 2 สถานะ เต็ม ๆ)
- `docs/mockups/order-detail-variations.html` (5 แบบที่ explore — เก็บไว้ดู record)
- หน้าอ้างอิง consistency: `src/views/pages/user-profile/UserProfileHeader.tsx` (`/u/[username]`)

---

## 2. Scenarios ครบ (8 states) — map กับ schema จริง

| # | State (`OrderStatus`) | เงื่อนไข | timeline (done → **current** → up) | ส่วนพิเศษ | CTA |
|---|---|---|---|---|---|
| 1 | PENDING | โอนเงิน, ยังไม่แนบสลิป | สั่งซื้อ✓ → **รอชำระเงิน** → จัดส่ง | โน้ตเตือน + zone อัปโหลดสลิป | ยืนยันการชำระเงิน + ยกเลิก |
| 2 | PENDING | โอนเงิน, แนบสลิปแล้ว | (เหมือน 1) | สลิปแนบแล้ว ✓ + เปลี่ยน | ยืนยันการชำระเงิน + ยกเลิก |
| 3 | PENDING | เก็บเงินปลายทาง (COD) | สั่งซื้อ✓ → **รอยืนยัน** → จัดส่ง | — (ไม่มีสลิป) | ยืนยันคำสั่งซื้อ + ยกเลิก |
| 4 | SHIPPED | PHYSICAL | ยืนยัน✓ → **กำลังจัดส่ง** → ได้รับ | กล่องเลขพัสดุ + คัดลอก | ยืนยันรับสินค้า + "ยังไม่ได้รับ?" |
| 5 | CONFIRMED | ยังไม่รีวิว | ✓✓✓ (เขียว, จุดสุดท้าย `.fin`) | การ์ดชวนรีวิว ★ | ให้คะแนนร้านค้า (เขียว) + ดูใบเสร็จ |
| 6 | CONFIRMED | รีวิวแล้ว | ✓✓✓ | รีวิวที่ให้ (ดาว + ข้อความ + badge) | ดูใบเสร็จ (ghost) |
| 7 | CANCELLED | — | สั่งซื้อ✓ → **✕ ยกเลิก** (แดง) → เทา (mute) | กล่องเหตุผล + รูปสินค้า grayscale | ติดต่อร้านค้า (ghost) + ข้อความปิดท้าย |
| 8 | DIGITAL/SERVICE/SUBSCRIPTION | ไม่มีจัดส่ง | สั่งซื้อ✓ → **ส่งมอบแล้ว** → ยืนยันรับ | กล่องลิงก์เข้าถึง | ยืนยันว่าได้รับ + แจ้งปัญหา |

### Status pill palette
- `pend` (PENDING): bg `#FEF3E2` text `#92400E` dot `#D97706`
- `ship` (SHIPPED/ส่งมอบ): bg `#E7F1FE` text `#1E40AF` dot `#2563EB`
- `succ` (CONFIRMED): bg `#E7F6F0` text `#065F46` dot `#059669`
- `canc` (CANCELLED): bg `#F1F5F9` text `#475569` dot `#94A3B8`

### Timeline tokens (ดู CSS เต็มใน mockup `.hstep*`)
- `--tl-cur:#2563EB` (current) · `--tl-done:#0E9F6E` · `--tl-up:#D5DCE6` (upcoming) · `--tl-bg:#fff`
- modifiers: `.done` (เขียวเต็ม+✓), `.cur` (วงใหญ่ ring), `.fin` (เขียวใหญ่+✓ = state จบ), `.cx` (แดง ✕), `.mute` (เทา)

---

## 3. Scope การ port — แยกชัด (verify กับ schema แล้ว)

### ✅ ทำได้เลย (schema ปัจจุบันรองรับ)
- โครง V1 ทั้งหมด (banner/avatar/trust/timeline/items/payment/CTA/footer)
- status → timeline + pill mapping (PENDING/SHIPPED/CONFIRMED/CANCELLED)
- COD vs โอนเงิน (จาก `paymentMethod`)
- DIGITAL/SERVICE timeline variant (จาก `type`/`fulfillmentMode`)
- รูปสินค้า (`OrderItem.productId` → `Product.images[0]`)
- รีวิว state 5/6 (review.service มีอยู่ + `ReviewForm.tsx`)
- ยืนยัน/ยกเลิก (มี handler + DB persist พิสูจน์แล้ว phase ก่อน)
- tier จาก `src/lib/trust-tier.ts` (`getTierLabel`/`getTierColor`) + cover จาก `getTierCover`

### ⚠️ ต้อง backend Phase 2 ก่อน (ฟิลด์ยังไม่มีใน schema)
- **สลิปโอนเงิน** (scenario 1-2) → ต้อง: `Order.requiresSlip` + `slipUrl`, storage upload, API, security review — **DEFERRED** (เดิม Convention #38)
- **เลขพัสดุ/tracking** (scenario 4) → ต้อง: `Order.carrier` + `trackingNo`
- **ลิงก์เข้าถึง digital** (scenario 8) → ต้อง: field เก็บ delivery link/อีเมล
- **เหตุผลยกเลิก** (scenario 7) → เช็คว่ามี `cancelReason` ใน schema หรือยัง; ถ้าไม่มี = แสดง generic copy

→ ตอน port: ทำส่วน ✅ ก่อน, ส่วน ⚠️ ให้ render เฉพาะเมื่อ field มีจริง (graceful) หรือ comment `// TODO Phase 2` — **ห้าม fake field ใน type**

---

## 4. Component / data mapping note (สำหรับ developer)

- เป้าหมาย: rewrite `src/app/(marketing)/o/[token]/OrderDetailMobile.tsx` (ตอนนี้เป็น Shopee-style — จะถูกแทน)
- `PublicOrderData` type มีอยู่แล้ว: `paymentMethod`, `fulfillmentMode`, `maxVerifyLevel`, `type` (incl SUBSCRIPTION), `onCancel` prop
- timeline state = pure function ของ `status` + `type`/`fulfillmentMode` — แยกเป็น helper (เช่น `getOrderTimeline(status, type)` คืน `[{label, state}]`)
- **Theme rule (Hard Rule 1/3):** buyer = Vuexy/MUI — ตอน port ใช้ MUI primitives + อ้าง `Base:` ใน commit; mockup HTML นี้คือ approved visual reference (Convention #33: full-page mockup = layout เป็นส่วนของ reference) → ยึด layout/สัดส่วน/สีตาม mockup, ประกอบด้วย component ของ theme
- responsive: mobile-first; mockup กว้าง 380-392px = baseline
- รูป product ใช้ `next/image` → ต้อง host allowlist (ดูข้อ 5)

---

## 5. สถานะไฟล์ที่ยังไม่ commit (WIP — ตัดสินใจก่อน reset)

- `prisma/qa-seed.ts` — seed data สำหรับทดสอบ (test data, ไม่ใช่ production)
- `next.config.ts` — เพิ่ม `picsum.photos` ใน `images.remotePatterns` (**DEV/TEST เท่านั้น** — ต้อง restart dev server; อย่า ship ขึ้น prod)
- `docs/mockups/*.html` — mockup ทั้งหมด (order-detail-scenarios/v1-full/variations/timeline/mockup)
- `docs/.obsidian/`, `docs/prompts/` — untracked

> picsum + qa-seed = **test data ชั่วคราว** ไม่เกี่ยวกับ production schema

---

## 6. งานที่ทำเสร็จแล้ว (committed, ก่อนหน้า design นี้)
- order-confirm flow `/o/[token]` (page/PublicOrderClient/PhoneUnlock/ReviewForm) — confirm→DB persist พิสูจน์แล้ว
- `src/lib/trust-tier.ts` (tier helper) + `docs/10 - Business Rules/Tier Lists.md` (Tier SSOT)
- `/u/[username]` shop profile redesign

---

## 7. Next session — เริ่มจาก
1. อ่าน spec นี้ + เปิด `docs/mockups/order-detail-scenarios.html`
2. ตัดสินใจ commit WIP (ข้อ 5) หรือทิ้ง
3. (ถ้าเป็น phase ≥3 tasks) ใช้ agent-team workflow + planner ก่อน
4. Port V1 → `OrderDetailMobile.tsx` เริ่มจาก scope ✅ (ข้อ 3); ส่วน ⚠️ เป็น Phase 2 backend
