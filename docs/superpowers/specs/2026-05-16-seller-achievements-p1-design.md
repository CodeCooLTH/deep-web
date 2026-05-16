# Seller Achievements P1 — Design Spec

วันที่: 2026-05-16
สถานะ: รออนุมัติจาก user
ขอบเขต: **P1 เท่านั้น** (seed-only, reuse engine เดิม, 0 บรรทัด logic ใหม่)

---

## 1. เป้าหมาย

เพิ่ม achievement badge ฝั่ง **seller อย่างเดียว** จำนวน **7 อัน** เพื่ออุดช่องโหว่ของขั้นบันได
achievement ปัจจุบัน — badge เป็น **status symbol เฉย ๆ ไม่มี reward ผูก** (เหมือนของเดิมทุกอัน)

### ปัญหาที่แก้

ระบบปัจจุบันมี 10 seller achievement badge แต่ขั้นบันไดโหว่:

- **Volume:** กระโดดจาก "ออเดอร์แรก" (1) → "Trusted Seller 50" (50) ทันที — seller ใหม่ช่วง
  2–49 ออเดอร์ไม่มีอะไรลุ้น และไม่มี prestige tier ไร้ปัญหาเหนือ 50
- **Rating:** tier ต่ำสุดคือ "Highly Rated" 4.8 — ยากเกินไปสำหรับร้านกลาง ๆ ไม่มี tier 4.5
  ที่เอื้อมถึง
- **Unique reviewers:** มีแต่ "Community Favorite" 50 — ไม่มี tier เริ่มต้น (10)
- **Tenure:** มีแต่ "Veteran" 365 วัน — ไม่มี milestone ระยะสั้น (90 วัน)
- **Shipping:** มีแต่ "Speed Demon" ≤ 24 ชม. — ไม่มี elite tier ที่ไวกว่า

## 2. Non-Goals (ตัดออกชัดเจน)

- ❌ ไม่มี reward mechanic ใด ๆ (แต้ม / ส่วนลด / สิทธิพิเศษ / unlock) — badge เป็น status เท่านั้น
- ❌ ไม่แตะฝั่ง buyer — `audience: "SELLER"` ทุกอัน
- ❌ ไม่เพิ่ม criteria type ใหม่ / handler ใหม่ / Prisma schema (นั่นคือ P2/P3 — out of scope)
- ❌ ไม่แตะ trust score formula — badge ใหม่นับเข้า `min(10, badgeCount)` ตามสูตรเดิมโดยอัตโนมัติ

## 3. รายการ Badge ที่จะเพิ่ม (7)

ทุกอัน `type: "ACHIEVEMENT"`, `audience: "SELLER"`, criteria type **เป็น type ที่ engine
รองรับอยู่แล้ว** (ไม่มี logic ใหม่):

| # | name (TH) | nameEN | icon (emoji) | criteria | reuse handler |
|---|---|---|---|---|---|
| 1 | เริ่มมีลูกค้า | `Getting Started` | 🌱 | `{ type: "ORDER_COUNT", count: 10 }` | `checkOrderCount` |
| 2 | ร้านกำลังโต | `Rising Seller` | 📈 | `{ type: "ORDER_COUNT", count: 25 }` | `checkOrderCount` |
| 3 | คะแนนดีน่าซื้อ | `Well Rated` | 👍 | `{ type: "HIGH_RATING", minRating: 4.5, minReviews: 10 }` | `checkHighRating` |
| 4 | เริ่มเป็นที่รู้จัก | `Getting Noticed` | 👀 | `{ type: "UNIQUE_REVIEWERS", count: 10 }` | `checkUniqueReviewers` |
| 5 | ขายดีไร้ปัญหา | `Spotless 100` | ✨ | `{ type: "ZERO_COMPLAINT", minOrders: 100 }` | `checkZeroComplaint` |
| 6 | เปิดร้านครบไตรมาส | `3 Months Strong` | 📅 | `{ type: "VETERAN", minDays: 90 }` | `checkVeteran` |
| 7 | ส่งไวระดับเทพ | `Same-Day Hero` | 🚀 | `{ type: "FAST_SHIPPING", maxHours: 12, minOrders: 20 }` | `checkFastShipping` |

หมายเหตุ emoji: เลือกไม่ชนกับ 10 badge เดิม (🏪 ⭐ 💯 💎 🌟 🛡️ 🏆 ⚡ ✅ ❤️)

## 4. สถาปัตยกรรม / จุดที่ต้องแก้

ระบบ badge เป็น **data-driven** — `evaluateBadges()` และ `getBadgeProgress()` dispatch ตาม
`criteria.type` อยู่แล้ว ดังนั้น 7 badge นี้ทำงาน + แสดง progress bar ได้อัตโนมัติเมื่อ seed เข้า DB

ไฟล์ที่แก้ (2 ไฟล์):

1. **`prisma/seed.ts`** — เพิ่ม 7 entry ใน array `badges` (ก่อน comment "badge ใหม่ (Phase 3)")
   `upsert` keyed by `nameEN` → idempotent, รัน seed ซ้ำได้
2. **`src/app/(paces)/seller/(dashboard)/_constants/badge-icons.ts`** — เพิ่ม 7 mapping
   `nameEN → lucide:*` ใน `LUCIDE_FOR_BADGE` (ใช้ทั้ง AchievementLevel widget + /badges page)
   มี `FALLBACK_LUCIDE` รองรับอยู่แล้ว — ไม่เพิ่มก็ไม่พัง แต่เพิ่มเพื่อ icon ตรงความหมาย

   icon map ที่เสนอ: Getting Started→`lucide:sprout`, Rising Seller→`lucide:trending-up`,
   Well Rated→`lucide:thumbs-up`, Getting Noticed→`lucide:eye`, Spotless 100→`lucide:sparkles`
   (ซ้ำ Highly Rated ได้ — คนละ badge), 3 Months Strong→`lucide:calendar-check`,
   Same-Day Hero→`lucide:rocket`

**ไม่แตะ:** `badge.service.ts` (engine), Prisma schema, trust-score, ฝั่ง buyer, admin

## 5. Data Flow (ไม่เปลี่ยนจากเดิม)

```
order/review/verification เปลี่ยน → evaluateBadges(userId,'SELLER')
  → loop badge จาก DB (รวม 7 อันใหม่) → dispatch criteria.type → handler เดิม
  → ถ้าผ่าน → awardBadge (UserBadge upsert, sticky) → recalculateTrustScore
หน้า /badges + AchievementLevel → getBadgeProgress() → progressLabel/progressRatio
  ของ type เดิม → progress bar ทำงานอัตโนมัติ
```

## 6. Error Handling / ความเสี่ยง

- **Seed idempotent:** `upsert` keyed `nameEN` — รันซ้ำปลอดภัย, badge เดิมไม่กระทบ
- **Sticky award:** `@@unique(userId, badgeId)` — seller ที่เข้าเกณฑ์อยู่แล้วจะได้ badge ใหม่
  ทันทีรอบ evaluate ถัดไป (ไม่ retroactive จนกว่าจะ trigger) — ยอมรับได้
- **Icon fallback:** ถ้าลืม map → `FALLBACK_LUCIDE` (`lucide:award`) ไม่ทำให้ UI พัง
- **`VETERAN` 90 วัน:** handler `checkVeteran` ต้อง active (มีออเดอร์ใน 30 วันล่าสุด) ด้วย —
  เป็นพฤติกรรมเดิมของ handler ยอมรับตามนั้น (รางวัล "ยังขายอยู่" ไม่ใช่แค่ "บัญชีเก่า")

## 7. Testing / QA

- **Type-check:** `npx tsc --noEmit` ผ่าน (seed.ts + badge-icons.ts)
- **Seed run:** รัน seed → ยืนยัน DB มี 18 badge (11 เดิม + 7 ใหม่), badge เดิมไม่ซ้ำ/ไม่หาย
- **Browser QA (Chrome DevTools MCP, ผ่าน `seller.deepth.local`):**
  - หน้า `/seller/badges` แสดง 7 badge ใหม่ใน in-progress (หรือ earned ถ้า seed seller เข้าเกณฑ์)
    พร้อม icon ตรง + progress bar มีค่า (ไม่ใช่ NaN/ว่าง)
  - widget AchievementLevel บน dashboard ไม่พัง
  - public profile `/u/{username}` ของ seller ที่ได้ badge ใหม่ — แสดง badge นั้น
- **Admin:** หน้า admin badges list แสดง 7 อันใหม่ + criteria JSON อ่านออก

## 8. Definition of Done

- [ ] 7 badge ใน `prisma/seed.ts`, seed รันสำเร็จ, count = 18, badge เดิมครบ
- [ ] 7 icon mapping ใน `badge-icons.ts`
- [ ] type-check ผ่าน
- [ ] Browser QA 3 จุด (seller /badges, dashboard widget, public profile) เขียว
- [ ] 1 commit เดียว (seed + icon map) — ไม่มี `Base:` line (ไม่ใช่ UI ใหม่จาก theme;
      เป็น data + map เดิม) แต่ commit body ภาษาไทย อ้าง spec นี้
