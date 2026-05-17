# Seller Achievements P1 — Design Spec (full scope)

วันที่: 2026-05-16 (revised — scope ขยายตามคำสั่ง user)
สถานะ: อนุมัติแล้ว → ดู plan `docs/superpowers/plans/2026-05-16-seller-achievements-p1.md`
ขอบเขต: 7 seller achievement badge ใหม่ (**ไม่มี reward**) + **รูป badge เป็น asset
จริง** (bundled default + admin upload override) แสดง **ทุก surface**

อ้างอิง asset: `/Users/craftman/Documents/Claude/Projects/Deep Achivements/`
(`ach_p1_*.svg` ×7 — pixel-art ~40KB, `DESIGN_SYSTEM.md`, `mockup_dashboard.html`)

---

## 1. เป้าหมาย

อุดช่องโหว่ขั้นบันได achievement ฝั่ง seller + ยกระดับ visual จาก emoji/lucide
เป็นรูปออกแบบจริง โดย admin จัดการรูปเองได้ — badge ยังเป็น **status symbol
ไม่มี reward**

## 2. Non-Goals

- ❌ ไม่มี reward mechanic (แต้ม/ส่วนลด/สิทธิ/unlock)
- ❌ ไม่เพิ่ม criteria type / badge handler ใหม่ (reuse engine เดิมล้วน)
- ❌ ไม่แตะ trust score formula
- ❌ ไม่ทำ locked/desaturate + progress styling ตาม `mockup_dashboard.html`
  (เป็น polish รอบหน้า — out of scope; รอบนี้แค่เปลี่ยน icon→รูป + upload)
- ❌ ไม่ใช้ `smooth_` vector / tier system — ใช้ pixel `ach_p1_*` ไปก่อน
- ❌ ไม่ bundle รูปให้ 10 badge เดิม — เดิมคง emoji/lucide (imageUrl ว่าง→fallback)

## 3. รายการ Badge ที่จะเพิ่ม (7) + asset

`type:"ACHIEVEMENT"`, `audience:"SELLER"`, reuse handler ที่ engine มีอยู่:

| # | name (TH) | nameEN | asset → `public/images/badges/seller/` | criteria | handler |
|---|---|---|---|---|---|
| 1 | เริ่มมีลูกค้า | `Getting Started` | `getting-started.svg` | `{type:"ORDER_COUNT",count:10}` | `checkOrderCount` |
| 2 | ร้านกำลังโต | `Rising Seller` | `rising-seller.svg` | `{type:"ORDER_COUNT",count:25}` | `checkOrderCount` |
| 3 | คะแนนดีน่าซื้อ | `Well Rated` | `well-rated.svg` | `{type:"HIGH_RATING",minRating:4.5,minReviews:10}` | `checkHighRating` |
| 4 | เริ่มเป็นที่รู้จัก | `Getting Noticed` | `getting-noticed.svg` | `{type:"UNIQUE_REVIEWERS",count:10}` | `checkUniqueReviewers` |
| 5 | ขายดีไร้ปัญหา | `Spotless 100` | `spotless-100.svg` | `{type:"ZERO_COMPLAINT",minOrders:100}` | `checkZeroComplaint` |
| 6 | เปิดร้านครบไตรมาส | `3 Months Strong` | `3-months-strong.svg` | `{type:"VETERAN",minDays:90}` | `checkVeteran` |
| 7 | ส่งไวระดับเทพ | `Same-Day Hero` | `same-day-hero.svg` | `{type:"FAST_SHIPPING",maxHours:12,minOrders:20}` | `checkFastShipping` |

`icon` (emoji fallback): 🌱 📈 👍 👀 ✨ 📅 🚀 (ไม่ชนของเดิม)

ที่มาไฟล์ → ปลายทาง (clone + rename เป็น kebab-case):
`ach_p1_getting_started.svg`→`getting-started.svg`, `ach_p1_rising_seller.svg`→
`rising-seller.svg`, `ach_p1_well_rated.svg`→`well-rated.svg`,
`ach_p1_getting_noticed.svg`→`getting-noticed.svg`, `ach_p1_spotless_100.svg`→
`spotless-100.svg`, `ach_p1_3_months.svg`→`3-months-strong.svg`,
`ach_p1_same_day_hero.svg`→`same-day-hero.svg`

## 4. สถาปัตยกรรม

### 4.1 Schema (Prisma — additive, ปลอดภัย ไม่มี data loss)

เพิ่ม field เดียวใน model `Badge`:

```prisma
imageUrl  String?   // null = ใช้ icon(emoji)/lucide fallback; ถ้าตั้ง = render รูปนี้
```

migration additive (nullable, ไม่มี default destructive) — badge เดิม 11 ตัว
`imageUrl=null` อัตโนมัติ ไม่กระทบ. ผ่าน `safepay-database` review.

### 4.2 ค่า imageUrl 2 รูปแบบ (เก็บเป็น URL string เดียวกัน)

- **Bundled default:** seed ตั้ง `imageUrl = "/images/badges/seller/<file>.svg"` (static
  ใต้ `public/` — เสิร์ฟตรงโดย Next)
- **Admin upload override:** admin อัปโหลด → `saveFile()` (storage lib เดิม,
  driver `local`/`s3`) คืน `fileId` → set `imageUrl = "/api/files/<fileId>"`
  (route serve ที่มีอยู่แล้ว) — ทับ bundled เฉพาะ badge นั้น

`<img src={badge.imageUrl}>` ใช้ได้ทั้ง 2 รูปแบบเหมือนกัน

### 4.3 Render precedence (ทุก surface)

helper กลาง 1 ตัว: `imageUrl` มีค่า → `<img>`; ไม่มี → fallback เดิม
(buyer/public = emoji `icon`; seller/admin Paces = `LUCIDE_FOR_BADGE` +
`FALLBACK_LUCIDE`). Surface ที่ต้อง wire:
- buyer Vuexy: `src/app/(marketing)/(buyer-app)/badges/page.tsx`
- seller Paces: `.../seller/(dashboard)/badges/page.tsx` + `dashboard/components/AchievementLevel.tsx`
- public profile: `src/app/(marketing)/u/[username]/...` (ส่วนแสดง badge)
- admin: `.../admin/(dashboard)/badges/components/BadgeFormDialog.tsx` + table

> ⚠️ buyer/public เป็น Vuexy (MUI), seller/admin เป็น Paces (Tailwind) — helper
> render ต้องไม่ผูก MUI/Preline เฉพาะทาง (ใช้ `<img>` + className กลาง)

### 4.4 Admin upload (security-sensitive)

- ปุ่ม/field อัปโหลดใน `BadgeFormDialog.tsx` (admin Paces — ผ่าน
  `ui-theme-sourcing`, copy จาก theme/paces ที่ระบุ)
- API: **admin-only** — `/api/upload` เดิมเปิดให้ user login ทุกคน (security
  gap) → ห้าม reuse ตรง ๆ. ทำ route ใหม่ admin-gated (ตรวจ session +
  admin role/subdomain ตามแบบ admin route อื่น) → `saveFile` → PATCH
  `badge.imageUrl` ผ่าน service layer (validate ด้วย Valibot)
- **ข้อจำกัดไฟล์ (default — `safepay-security` ยืนยัน/ปรับเข้ม):** อนุญาต
  **PNG/WebP/JPEG เท่านั้น ≤ 256KB**; **ไม่รับ SVG upload** (SVG = XSS vector,
  มี script ได้) — SVG ใช้ได้เฉพาะ bundled asset ใน repo ที่ trusted แล้ว
- ผ่าน `safepay-security` gate ก่อน commit (auth, file-type allowlist, size,
  path traversal, env leak)

## 5. Data Flow

ประเมิน/มอบ badge: ไม่เปลี่ยน — `evaluateBadges` dispatch criteria.type เดิม.
แสดงผล: ทุก surface อ่าน `badge.imageUrl` → helper precedence (§4.3).
Admin upload: form → admin API → `saveFile` → service set `imageUrl` →
ทุก surface เห็นรูปใหม่รอบ render ถัดไป.

## 6. ความเสี่ยง

- Migration additive nullable → ปลอดภัย; ยืนยัน badge เดิมครบหลัง migrate
- Sticky award เดิม (`@@unique`) — ไม่เปลี่ยน
- pixel ~40KB ×7: bundle ใน repo ยอมรับ, render ≥ 96px (ย่อเล็กแตก)
- **SVG upload XSS** → mitigate: ไม่รับ SVG upload (raster only) — §4.4
- Admin API auth bypass → `safepay-security` mandatory ก่อน commit
- helper render ข้าม theme (Vuexy↔Paces) → ใช้ `<img>` ล้วน ไม่ผูก lib

## 7. Testing / QA

- Vitest: criteria 7 ตัวเป๊ะ + icon/imageUrl map + `evaluateBadges` dispatch
  (boundary) + render-precedence helper (imageUrl set → img, null → fallback)
- type-check ผ่าน
- Browser QA (Chrome DevTools MCP, `*.deepth.local`, probe port — user รัน
  server เอง):
  1. buyer `/badges` — รูป asset 7 badge
  2. seller `/seller/badges` + dashboard widget
  3. public `/u/<seller>` — รูป badge
  4. admin badges — list + **upload happy path** (อัปรูป PNG → reload เห็นรูป
     ใหม่ทุก surface) + reject SVG/ไฟล์ใหญ่
- Security: smoke ว่า non-admin ยิง API upload → 401/403

## 8. Definition of Done

- [ ] Prisma `Badge.imageUrl String?` migrate สำเร็จ, badge เดิม 11 ครบ
- [ ] 7 SVG อยู่ `public/images/badges/seller/` (kebab-case ตาม §3)
- [ ] seed 7 badge (criteria + icon emoji + imageUrl bundled), `Seeded 18 badges`
- [ ] render helper + wire 4 surface (precedence imageUrl→fallback) ผ่าน
      `ui-theme-sourcing` (admin/seller Paces) + `Base:` line ที่ commit แตะ UI
- [ ] admin upload (admin-gated API + form) ผ่าน `safepay-security`
- [ ] Vitest + type-check เขียว
- [ ] Browser QA 4 surface + upload happy path + security smoke เขียว
- [ ] retro ปลาย phase (`phase-retro`)
