# Badge-earned Notification — Design Spec

- **วันที่:** 2026-07-02
- **สถานะ:** approved (design) — รอ implement
- **ที่มา:** ผลวิเคราะห์ `safepay-product` (Achievement system review) ข้อ 2
- **Scope:** enhancement ของระบบ badge + notification เดิม (ไม่ใช่ feature ใหม่ numbered)

---

## 1. ปัญหา / เป้าหมาย

ปัจจุบัน user ได้ badge แล้ว **ไม่รู้ตัว** — `awardBadge()` เขียน `UserBadge` + `recalculateTrustScore()` เท่านั้น ไม่แจ้งเตือนเลย ต้องเข้าหน้า `/badges` เองถึงจะเห็น. เป้าหมาย: เมื่อ user ได้ badge **ใหม่** ให้ยิงแจ้งเตือน โดย reuse infra ที่มีอยู่ (`Notification` model + `PushToken`/Expo push) ไม่สร้างระบบใหม่

## 2. ขอบเขต (Q1 = Option 3)

สร้าง `Notification` row **ทุก audience** (buyer + seller) + Expo push **เฉพาะ user ที่มี `PushToken`** (Deep-App buyer). **ไม่สร้าง UI ใหม่** ในงานนี้:
- **Buyer (Deep-App):** ได้ครบทันที — แอป render `Notification` list + รับ push อยู่แล้ว
- **Seller (web):** ได้ `Notification` row เก็บไว้ (surfaced เมื่อ seller notification UI มาอ่านทีหลัง); ไม่มี PushToken → push เป็น no-op เอง

### Out of scope
- Seller web notification center UI (แยกงาน)
- Badge notification preference/settings (ปิด-เปิดรายประเภท)
- Digest / batching หลาย badge เป็น 1 แจ้งเตือน

## 3. Data model

ไม่ต้อง migration — `Notification.kind` เป็น `String` อยู่แล้ว. เพิ่มค่า enum เชิง convention:
- `kind = "badge_earned"` (เดิมมี `"outbid" | "won" | "system"`)
- `refId = badge.id` (deep-link ไปหน้า badge detail ฝั่งแอปได้)
- อัปเดต comment ของ `kind` ใน `schema.prisma` + app type ให้รวม `"badge_earned"`

## 4. จุด trigger — `awardBadge()` (choke point เดียว)

`awardBadge(userId, badgeId)` เป็น choke point ที่ทุก path เรียก (`evaluateBadges`, `evaluateSignupYearBadge`). ปัจจุบันเป็น `upsert` idempotent → **ต้อง detect "award ครั้งแรก"** เพื่อกัน notify ซ้ำ

**เปลี่ยน signature:**
```
awardBadge(userId, badgeId, opts?: { notify?: boolean }): Promise<boolean>  // return created
```
- detect created ด้วย `createMany({ data:[{userId,badgeId}], skipDuplicates:true })` → `result.count === 1` = award ใหม่ (idempotent เดิมคงอยู่ — ถ้ามีแล้ว count=0 ไม่ error)
- ถ้า `created === true && notify !== false` → เรียก `notifyBadgeEarned(userId, badgeId)` แบบ best-effort (try/catch ภายใน ไม่ throw)
- `notify` default `true`; caller ที่ backfill/seed ส่ง `notify:false` เพื่อกัน burst

**ทำไมปลอดภัยใส่ push ที่นี่:** `awardBadge` ถูกเรียก **นอก transaction ทุกจุด** (evaluateBadges/evaluateSignupYearBadge เรียกหลัง tx commit / ไม่มี tx) → I/O push ไม่ล็อก tx

## 5. Notify logic — `notifyBadgeEarned(userId, badgeId)` (badge.service.ts)

best-effort, non-throwing:
1. `const badge = await prisma.badge.findUnique({ where:{id:badgeId}, select:{name:true} })` — ถ้าไม่เจอ → return
2. in-app: `prisma.notification.create({ data:{ userId, kind:"badge_earned", title:"ได้รับ Badge ใหม่", body:`คุณได้รับ "${badge.name}" แล้ว`, refId: badgeId } })`
3. push: `pushToUser(userId, "ได้รับ Badge ใหม่", `คุณได้รับ "${badge.name}" แล้ว`, { type:"badge_earned", badgeId })`
4. ครอบ try/catch → `console.error('[badge] notifyBadgeEarned failed', ...)` ไม่ rethrow

**Copy:** ไม่มี emoji (Hard Rule / `no-emoji-use-icons`). title = "ได้รับ Badge ใหม่", body = `คุณได้รับ "<ชื่อ badge ไทย>" แล้ว`

## 6. Callers ที่ต้องปรับ

- `evaluateBadges` (badge.service.ts): `awardBadge` ใน loop ถูกเรียกหลัง filter `earnedIds` แล้ว → award ที่นี่เป็น new เสมอ → notify default (`true`) ถูกต้อง ไม่ต้องแก้ call
- `evaluateSignupYearBadge`: idempotent upsert ไม่ filter → เปลี่ยนไปใช้ awardBadge (created detection) → notify เฉพาะ new (signup badge แจ้งครั้งเดียวตอนสมัคร — ตรงตามต้องการ)
- **seed / backfill scripts** (ถ้ามีการรัน mass evaluateBadges): ต้องรองรับ `notify:false` — แต่ evaluateBadges ปัจจุบันไม่รับ param นี้ → **เพิ่ม param `notify` ทะลุจาก evaluateBadges → awardBadge** (optional, default true)

## 7. Anti-spam / edge

- **Backfill burst:** รัน evaluateBadges ครั้งแรกกับ user ที่มี badge ค้างเยอะ → หลาย notification พร้อมกัน. mitigate: mass/backfill caller ส่ง `notify:false`
- **Race (2 request award พร้อมกัน):** `createMany skipDuplicates` → มีแค่ 1 ได้ count=1 → notify ครั้งเดียว (DB unique เป็น arbiter)
- **badge ถูกลบภายหลัง:** notification row ยังอยู่ (refId ชี้ badge ที่หาย) — acceptable, app จัดการ null-safe

## 8. Testing

- unit `awardBadge`: award ใหม่ → return `true` + notify ถูกเรียก; award ซ้ำ → return `false` + notify ไม่ถูกเรียก; `notify:false` → ไม่ notify แม้ created
- unit `notifyBadgeEarned`: สร้าง Notification row ถูก field + เรียก pushToUser ด้วย args ถูก; badge ไม่มี → return เงียบ
- mock `pushToUser` + `prisma`

## 9. ไฟล์ที่คาดว่าจะแตะ

- `src/services/badge.service.ts` — `awardBadge` (created detection + notify hook), `notifyBadgeEarned` (ใหม่), thread `notify` param ผ่าน evaluateBadges/evaluateSignupYearBadge
- `prisma/schema.prisma` — comment `Notification.kind` เพิ่ม `"badge_earned"` (ไม่ใช่ migration)
- app type ฝั่ง Deep-App (`kind` union) — เพิ่ม `"badge_earned"` (ถ้ามี type shared)
- test file badge.service (Vitest)

## 10. Definition of Done

- award badge ใหม่ (buyer) → มี Notification row + ได้รับ Expo push จริง (verify ด้วย test account มี PushToken)
- award badge ใหม่ (seller) → มี Notification row, push no-op ไม่ error
- award ซ้ำ / re-eval → ไม่มี notification ซ้ำ
- unit tests เขียว
- ไม่มี emoji ใน copy
