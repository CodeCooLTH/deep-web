# Buyer Badge Rarity Pill — Design Spec

- **วันที่:** 2026-07-02
- **สถานะ:** approved (design + safepay-ux) — รอ implement
- **ที่มา:** Achievement review ข้อ 4 (buyer parity แบบเบา)
- **Scope:** enhancement หน้า buyer `/badges` — เพิ่ม rarity pill inline (ไม่มี modal/estimate)
- **UX Design Spec:** safepay-ux (2026-07-02) — pill placement/color/theme mapping

---

## 1. เป้าหมาย

หน้า buyer `/badges` แสดง badge list แต่ยังไม่มีตัวชี้ "ความหายาก" (seller มีใน BadgeDetailModal แต่ buyer ไม่มี). เพิ่ม **rarity pill** inline แบบเบา — ไม่ทำ modal, ไม่ทำ pace-estimate (ต่างจาก seller ที่มีครบ)

## 2. Rarity — ฐาน user count (decision: Option 1)

`getBadgeRarity` เดิมใช้ตัวหาร = `shopCount` → ผิดสำหรับ buyer badge (ไม่ใช่ของร้าน). สำหรับหน้า buyer:
- **ตัวหาร = จำนวน user ทั้งหมด** (`prisma.user.count()`)
- **gate:** userCount < 20 → ไม่แสดง pill เลย (นัยสำคัญสถิติ กัน mislabel — เหมือน seller gate shopCount<20)
- **tier threshold reuse ของเดิม:** pct≥50 COMMON / ≥20 UNCOMMON / ≥5 RARE / <5 LEGENDARY
- **label ไทย reuse:** ทั่วไป / ไม่ทั่วไป / หายาก / หายากมาก

**Caveat (ยอมรับ):** ฐาน user รวม → auction/engagement badge ที่ niche จะ pct ต่ำ → เอนไป LEGENDARY; badge ใหม่ (earner น้อย) ก็ดูหายาก — semantic เดียวกับ seller side ที่ prod ใช้อยู่แล้ว

## 3. Service — `getUserBadgeRarityMap` (badge.service.ts)

```ts
export async function getUserBadgeRarityMap(
  badgeIds: string[],
): Promise<Map<string, RarityTier>>  // badgeId → tier; key ที่ไม่มี = ไม่แสดง pill
```
- ถ้า `badgeIds` ว่าง → คืน Map ว่าง
- `userCount = await prisma.user.count()`; ถ้า `< 20` → คืน Map ว่าง (gate)
- `groupBy` UserBadge by badgeId (where badgeId in badgeIds) → earnedCount ต่อ badge (badge ที่ไม่มี earner = 0)
- ต่อ badgeId: `pct = earnedCount / userCount * 100` → tier (reuse threshold), set ลง Map
- **ไม่แตะ `getBadgeRarity` เดิม** (shop-based, seller คงเดิม)

ทำไม bulk (ไม่เรียก getBadgeRarity ต่อ badge): 1 query user.count + 1 groupBy แทน N×2 query

## 4. UI — `src/app/(marketing)/(buyer-app)/badges/page.tsx` (Vuexy server component)

ตาม safepay-ux Design Spec:
- page (server) เพิ่ม: `const rarityMap = await getUserBadgeRarityMap(items.map(i => i.badge.id))`
- helper (ในไฟล์): `rarityLabel(tier)` + `rarityColor: Record<RarityTier, ThemeColor>`:
  - COMMON→`secondary`, UNCOMMON→`info`, RARE→`warning`, LEGENDARY→`primary`
- แต่ละ row (earned + in-progress): wrap `<Typography>{badge.name}</Typography>` ด้วย `<div className='flex items-center gap-2 flex-wrap'>` แล้วต่อ pill:
  ```tsx
  {rarityMap.get(item.badge.id) && (
    <Chip label={rarityLabel(tier)} variant='tonal' size='small' color={rarityColor[tier]} />
  )}
  ```
- **ฝั่งขวาไม่แตะ** ("ได้รับแล้ว" chip / progress bar คงเดิม)
- **ไม่มี pill = layout เดิมเป๊ะ** (conditional render, flex-wrap ธรรมชาติ)
- **Base:** chip color-by-key pattern จาก `theme/vuexy/.../views/apps/academy/my-courses/Courses.tsx` (chipColor object + `<Chip variant='tonal' size='small'>`); ThemeColor type จาก `@core/types`
- **ไม่มี icon** ใน pill (default — no-emoji rule)

## 5. Out of scope

- modal / pace-estimate ฝั่ง buyer (seller-only)
- แก้ seller `getBadgeRarity` / estimate audience / getBadgePaceEstimate buyer cases
- schema change (rarity คำนวณ live ไม่เก็บ)
- Trust Score

## 6. Test

unit `getUserBadgeRarityMap` (mock prisma): userCount<20 → Map ว่าง; earnedCount/userCount → tier ถูก (boundary 50/20/5); badgeIds ว่าง → Map ว่าง

## 7. ไฟล์ที่แตะ

- `src/services/badge.service.ts` — `getUserBadgeRarityMap` (+ export RarityTier มีอยู่แล้ว)
- `src/app/(marketing)/(buyer-app)/badges/page.tsx` — rarityMap + pill render
- `src/services/badge.service.test.ts` — unit

## 8. Definition of Done

- buyer /badges แสดง pill ตาม tier (ถ้า userCount≥20) — earned + in-progress
- badge ที่ไม่มีข้อมูล/gate ไม่ล้ม layout
- ไม่แตะ seller rarity/schema/Trust Score
- unit tests เขียว; visual QA (Chrome DevTools) ที่ deepth.local:4000
