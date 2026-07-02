# Reaction + WatchList Achievement — Design Spec

- **วันที่:** 2026-07-02
- **สถานะ:** approved (design) — รอ implement
- **ที่มา:** ผลวิเคราะห์ `safepay-product` (Achievement system review) ข้อ 3 (P1)
- **Scope:** enhancement badge engine เดิม — เพิ่ม achievement ผูกกับ feat 00005 (Bid Reactions) + WatchList

---

## 1. ปัญหา / เป้าหมาย

feat 00005 (Bid Reactions) + WatchList เป็น engagement signal ที่ persist ใน DB (`BidReaction`, `WatchList`) แต่ badge engine **ไม่แตะเลย** — เสียโอกาสกระตุ้น engagement (feat 00005 ตั้ง KPI "Reaction Adoption Rate ≥30%" เอง). เป้าหมาย: เพิ่ม 2 achievement badge ผูกพฤติกรรม react/watch โดย reuse badge engine เดิม

## 2. ขอบเขต

2 badge ใหม่ audience **BUYER** (react/watch เป็นพฤติกรรมฝั่งผู้ซื้อ):

| badge (TH) | nameEN | criteria | threshold | icon |
|---|---|---|---|---|
| นักให้กำลังใจ | Bid Cheerer | `REACTION_COUNT` | count ≥ 20 | tabler-heart |
| นักเฝ้าประมูล | Auction Watcher | `WATCHLIST_COUNT` | count ≥ 10 | tabler-eye |

### Out of scope
- tier แรก (react≥1 / watch≥1) — เพิ่มภายหลังได้ถ้าต้องการ early gratification
- lifetime counter (ดู §4 count semantics)
- `getBadgePaceEstimate` case ใหม่ (non-blocking — คืน non_countable, modal render graceful)
- Profile-complete badge (ข้อเสนอ P1 แยกต่างหาก)

## 3. Count semantics — active count ปัจจุบัน (ไม่แตะ schema)

ใช้ `prisma.bidReaction.count({ where: { userId } })` / `prisma.watchList.count({ where: { userId } })` ตรง ๆ

**ทำไม active count พอ:** badge เป็น **sticky** (award แล้วไม่ revoke) + award เมื่อ count ถึง threshold "ณ เวลา eval" → ได้แล้วถาวรแม้ un-react/un-watch ทีหลัง. `BidReaction` เป็น toggle (un-react ลบ row) → ต้องมี 20 reaction **active พร้อมกัน** = engagement จริง (สะอาดกว่า lifetime churn)

**ทำไมไม่ทำ lifetime:** ต้องเพิ่ม counter column/log table = YAGNI สำหรับ engagement badge; lifetime นับ react-then-unreact churn ยิ่ง gameable

## 4. criteria types ใหม่ (`src/types/badge.ts`)

```ts
export type CriteriaReactionCount = { type: 'REACTION_COUNT'; count: number }
export type CriteriaWatchlistCount = { type: 'WATCHLIST_COUNT'; count: number }
```
เพิ่มใน union `BadgeCriteria`

## 5. Checker functions (`src/services/badge.service.ts`)

```ts
export async function checkReactionCount(userId, criteria: CriteriaReactionCount): Promise<{met, count}> {
  const count = await prisma.bidReaction.count({ where: { userId } })
  return { met: count >= criteria.count, count }
}
export async function checkWatchlistCount(userId, criteria: CriteriaWatchlistCount): Promise<{met, count}> {
  const count = await prisma.watchList.count({ where: { userId } })
  return { met: count >= criteria.count, count }
}
```
ไม่ผ่าน shop (userId ตรง — buyer). dispatch case ใน `evaluateBadges` + progress case ใน `getBadgeProgress` (partial ratio + Thai label "อีก N ครั้ง")

## 6. Trigger — best-effort, ทิศ "add" เท่านั้น

เพิ่ม `evaluateBadges(userId, 'BUYER')` หลัง:
- **react (create):** `auction.service.ts` `toggleBidReaction` — **เฉพาะ branch create** (ไม่ eval ตอน delete/un-react). best-effort post-op ไม่ throw กระทบ response
- **watch (upsert):** 2 route — `src/app/api/app/auctions/[id]/watch/route.ts` + `src/app/api/auctions/[id]/watch/route.ts` — หลัง upsert สำเร็จ. best-effort

pattern เดียวกับ `placeBid` (auction.service.ts:816): `evaluateBadges(userId,'BUYER').catch(e => console.error(...))`

## 7. Seed

`prisma/badge-seed-data.ts` +2 row (audience BUYER, icon tabler). apply prod ด้วย `npm run seed:badges` (non-destructive) — **ต้อง user ยืนยันก่อน apply** (touch shared Supabase)

## 8. Trust Score

นับรวม Badge 10% เดิมอัตโนมัติ (`recalculateTrustScore` นับ UserBadge ทั้งหมด) — **ไม่แตะสูตร**

## 9. Anti-gaming

active-count → gameable แบบ react 20 ครั้งแล้ว un-react ได้ แต่เป็น **engagement badge** (ไม่ใช่ trust/KYC, badge component cap 10) → รับได้ระดับ MVP. ถ้าอนาคตพบ abuse → พิจารณา lifetime counter + rate cap

## 10. Notification

reuse badge-earned notification (ข้อ 2, `awardBadge` → `notifyBadgeEarned`) — react/watch badge ได้ notification อัตโนมัติเมื่อ award (buyer อยู่ Deep-App มี PushToken → ได้ push)

## 11. ไฟล์ที่คาดว่าจะแตะ

- `src/types/badge.ts` — 2 criteria type + union
- `src/services/badge.service.ts` — 2 checker + dispatch (evaluateBadges + getBadgeProgress)
- `src/services/auction.service.ts` — trigger ใน toggleBidReaction (branch create)
- `src/app/api/app/auctions/[id]/watch/route.ts` + `src/app/api/auctions/[id]/watch/route.ts` — trigger หลัง watch
- `prisma/badge-seed-data.ts` — +2 seed row
- `src/services/badge.service.test.ts` — unit checker tests

## 12. Definition of Done

- react ครบ 20 (active) → ได้ badge "นักให้กำลังใจ" + notification
- watch ครบ 10 (active) → ได้ badge "นักเฝ้าประมูล" + notification
- un-react/un-watch หลังได้ badge → badge ไม่หาย (sticky)
- unit tests เขียว (checker met/not-met/boundary)
- seed apply prod สำเร็จ (verify readback)
- ไม่แตะ schema / Trust Score formula
