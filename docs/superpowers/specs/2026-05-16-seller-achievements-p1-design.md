# Seller Achievements P1 — Design Spec

วันที่: 2026-05-16
สถานะ: รออนุมัติจาก user
ขอบเขต: เพิ่ม achievement badge ฝั่ง **seller อย่างเดียว** 7 อัน — **ไม่มี reward ผูก**
แบ่งเป็น **P1a (data, ทำก่อน)** + **P1b (visual, phase ถัดไป)**

อ้างอิง asset ออกแบบ: `/Users/craftman/Documents/Claude/Projects/Deep Achivements/`
(`DESIGN_SYSTEM.md`, `ach_p1_*.svg` ×7, `mockup_dashboard.html`)

---

## 1. เป้าหมาย

อุดช่องโหว่ขั้นบันได achievement ฝั่ง seller — badge เป็น **status symbol เฉย ๆ
ไม่มี reward** (เหมือนของเดิมทุกอัน)

### ปัญหาที่แก้

ระบบมี 10 seller badge แต่ขั้นบันไดโหว่:
- **Volume:** กระโดดจากออเดอร์แรก (1) → Trusted Seller 50 ทันที + ไม่มี prestige tier
  ไร้ปัญหาเหนือ 50
- **Rating:** tier ต่ำสุด 4.8 ยากเกินร้านกลาง ไม่มี 4.5
- **Unique reviewers:** มีแต่ 50 ไม่มี tier เริ่มต้น
- **Tenure:** มีแต่ 365 วัน ไม่มี milestone สั้น
- **Shipping:** มีแต่ ≤ 24 ชม. ไม่มี elite tier

## 2. Non-Goals

- ❌ ไม่มี reward mechanic (แต้ม/ส่วนลด/สิทธิ/unlock) — badge = status เท่านั้น
- ❌ ไม่แตะ buyer — `audience: "SELLER"` ทุกอัน
- ❌ ไม่เพิ่ม criteria type / handler / Prisma schema (เป็น P2/P3 — out of scope)
- ❌ ไม่แตะ trust score formula — นับเข้า `min(10, badgeCount)` เดิมอัตโนมัติ
- ❌ ไม่ใช้ tier system (`tier_1..5`) — นั่นคือ seller rank track แยก ไม่เกี่ยว P1

## 3. รายการ Badge ที่จะเพิ่ม (7)

`type: "ACHIEVEMENT"`, `audience: "SELLER"`, criteria type **เป็น type ที่ engine
รองรับแล้ว** (ไม่มี logic ใหม่). `nameEN` ตั้งให้ map กับชื่อไฟล์ asset (snake_case):

| # | name (TH) | nameEN | asset file | criteria | reuse handler |
|---|---|---|---|---|---|
| 1 | เริ่มมีลูกค้า | `Getting Started` | `ach_p1_getting_started.svg` | `{ type:"ORDER_COUNT", count:10 }` | `checkOrderCount` |
| 2 | ร้านกำลังโต | `Rising Seller` | `ach_p1_rising_seller.svg` | `{ type:"ORDER_COUNT", count:25 }` | `checkOrderCount` |
| 3 | คะแนนดีน่าซื้อ | `Well Rated` | `ach_p1_well_rated.svg` | `{ type:"HIGH_RATING", minRating:4.5, minReviews:10 }` | `checkHighRating` |
| 4 | เริ่มเป็นที่รู้จัก | `Getting Noticed` | `ach_p1_getting_noticed.svg` | `{ type:"UNIQUE_REVIEWERS", count:10 }` | `checkUniqueReviewers` |
| 5 | ขายดีไร้ปัญหา | `Spotless 100` | `ach_p1_spotless_100.svg` | `{ type:"ZERO_COMPLAINT", minOrders:100 }` | `checkZeroComplaint` |
| 6 | เปิดร้านครบไตรมาส | `3 Months Strong` | `ach_p1_3_months.svg` | `{ type:"VETERAN", minDays:90 }` | `checkVeteran` |
| 7 | ส่งไวระดับเทพ | `Same-Day Hero` | `ach_p1_same_day_hero.svg` | `{ type:"FAST_SHIPPING", maxHours:12, minOrders:20 }` | `checkFastShipping` |

`icon` field (Prisma, ใช้ฝั่ง buyer/emoji): 🌱 📈 👍 👀 ✨ 📅 🚀
(เลือกไม่ชนกับ 10 badge เดิม: 🏪 ⭐ 💯 💎 🌟 🛡️ 🏆 ⚡ ✅ ❤️)

## 4. การแบ่งงาน: P1a + P1b

### P1a — Data (ทำก่อน, ได้ของเร็ว, risk ต่ำ)

**สิ่งที่ทำ:** seed 7 badge ใหม่ให้ระบบประเมิน/มอบ/นับ trust ได้จริง โดยใช้
icon เดิม (buyer = emoji จาก `icon` field; seller = `LUCIDE_FOR_BADGE` map +
`FALLBACK_LUCIDE` ที่มีอยู่ — ยังไม่เปลี่ยนเป็น asset)

ไฟล์ที่แก้ (อาจ 1–2):
1. `prisma/seed.ts` — เพิ่ม 7 entry ใน array `badges` (ก่อน comment "badge ใหม่
   (Phase 3)") `upsert` keyed `nameEN` idempotent
2. `src/app/(paces)/seller/(dashboard)/_constants/badge-icons.ts` — เพิ่ม 7
   mapping `nameEN → lucide:*` (ชั่วคราว จนกว่า P1b จะเปลี่ยนเป็น asset path):
   Getting Started→`lucide:sprout`, Rising Seller→`lucide:trending-up`,
   Well Rated→`lucide:thumbs-up`, Getting Noticed→`lucide:eye`,
   Spotless 100→`lucide:sparkles`, 3 Months Strong→`lucide:calendar-check`,
   Same-Day Hero→`lucide:rocket` (ถ้าไม่เพิ่ม `FALLBACK_LUCIDE` รองรับ ไม่พัง)

**ไม่แตะ:** `badge.service.ts` (engine), Prisma schema, trust-score, buyer, admin

**ทำเป็น 1 commit** — ไม่มี `Base:` line (เป็น data + map เดิม ไม่ใช่ UI ใหม่จาก
theme) commit body ภาษาไทย อ้าง spec นี้

### P1b — Visual (phase ถัดไป, แยก risk)

**สิ่งที่ทำ:** แทน icon ของ 7 badge นี้ (+ พิจารณา badge เดิมด้วย) เป็นรูป
ออกแบบจริง + state locked/desaturate + progress bar ตาม `mockup_dashboard.html`

**ขอบเขต/การตัดสินใจที่ตกลงแล้ว:**
- **ใช้ pixel-art `ach_p1_*.svg` (~40KB/ไฟล์) ไปก่อน** — เวอร์ชัน `smooth_`
  vector ยังไม่ถูก generate; ยอมรับ pixel ชั่วคราว **แสดงที่ขนาดใหญ่ ≥ 96px
  เท่านั้น** (ย่อเล็กจะแตก) แล้ว swap เป็น smooth ทีหลัง (out of P1b scope)
- คัดลอก asset → `public/badges/seller/` (snake_case ตามตาราง §3)
- เปลี่ยน `badge-icons.ts` จาก lucide name → path SVG asset (`/badges/seller/*.svg`)
  ผ่าน `<img>` (seller = Paces/Tailwind ไม่มี MUI)
- State locked/in-progress ทำที่ **CSS/Tailwind layer ไม่แก้ SVG** ตาม
  DESIGN_SYSTEM §4 + mockup: `.ach-card--locked` (grayscale/desaturate) +
  lock overlay (lucide path) + progress bar (`.prog-fill` width %, `.near`
  เปลี่ยนเป็นทองเมื่อใกล้สำเร็จ) + label `7 / 10` / `Avg 18hr`
- จุดที่กระทบ UI: หน้า `/seller/badges`
  (`src/app/(paces)/seller/(dashboard)/badges/page.tsx`) + widget
  `AchievementLevel.tsx` บน dashboard

**P1b = UI work + ≥3 tasks** → ต้องผ่าน `ui-theme-sourcing` (Paces) +
`agent-team-phase` (Planner→Developer→Reviewer→QA→Controller) — spec/plan
ของ P1b แยกเอกสารตอนเริ่ม phase นั้น เอกสารนี้ล็อกแค่ scope + การตัดสินใจ

## 5. Data Flow (ไม่เปลี่ยนจากเดิม — P1a)

```
order/review/verification เปลี่ยน → evaluateBadges(userId,'SELLER')
  → loop badge จาก DB (รวม 7 ใหม่) → dispatch criteria.type → handler เดิม
  → ผ่าน → awardBadge (UserBadge upsert, sticky) → recalculateTrustScore
/badges + AchievementLevel → getBadgeProgress() → progressLabel/Ratio
  ของ type เดิม → progress bar ทำงานอัตโนมัติ
```

## 6. Error Handling / ความเสี่ยง

- **Seed idempotent:** `upsert` keyed `nameEN` — รันซ้ำปลอดภัย badge เดิมไม่กระทบ
- **Sticky award:** `@@unique(userId, badgeId)` — seller ที่เข้าเกณฑ์อยู่แล้ว
  ได้ badge ใหม่รอบ evaluate ถัดไป (ไม่ retroactive จน trigger) — ยอมรับได้
- **Icon fallback (P1a):** ลืม map → `FALLBACK_LUCIDE` (`lucide:award`) ไม่พัง
- **`VETERAN` 90 วัน:** `checkVeteran` ต้อง active (ออเดอร์ใน 30 วันล่าสุด) ด้วย
  — พฤติกรรมเดิม ยอมรับ (รางวัล "ยังขายอยู่" ไม่ใช่แค่ "บัญชีเก่า")
- **P1b pixel ~40KB ×7:** ยอมรับชั่วคราว, บังคับ render ≥ 96px, ใส่ TODO swap smooth
- **Font ใน asset:** `ach_p1_*` เป็น pure pixel rect ไม่มี `<text>`/ฟอนต์ฝัง →
  ไม่ขัด Hard Rule 5 (Anuphan). ถ้าอนาคตใช้ smooth ที่มีตัวเลข Impact ต้อง
  convert text→path ก่อน (นอก scope P1)

## 7. Testing / QA

**P1a:**
- Type-check `npx tsc --noEmit` ผ่าน
- รัน seed → DB มี 18 badge (11 เดิม + 7 ใหม่) badge เดิมครบ/ไม่ซ้ำ
- Browser QA (Chrome DevTools MCP ผ่าน `seller.deepth.local`, probe port):
  - `/seller/badges` แสดง 7 badge ใหม่ใน in-progress/earned + progress bar
    มีค่า (ไม่ NaN/ว่าง) + icon ไม่พัง (lucide หรือ fallback)
  - widget AchievementLevel บน dashboard ไม่พัง
  - public profile `/u/{username}` ของ seller ที่ได้ badge ใหม่ — แสดง badge
  - admin badges list แสดง 7 อันใหม่ + criteria JSON อ่านออก

**P1b:** กำหนดตอนเขียน spec/plan ของ phase นั้น (รวม visual regression ของ
locked/progress state ตาม mockup)

## 8. Definition of Done — P1a

- [ ] 7 badge ใน `prisma/seed.ts`, seed สำเร็จ, count = 18, badge เดิมครบ
- [ ] 7 icon mapping ชั่วคราวใน `badge-icons.ts`
- [ ] type-check ผ่าน
- [ ] Browser QA 4 จุด (seller /badges, dashboard widget, public profile,
      admin list) เขียว
- [ ] 1 commit (seed + icon map), body ไทย อ้าง spec นี้, ไม่มี `Base:` line
- [ ] เปิด follow-up note สำหรับ P1b (asset integration + locked/progress)
