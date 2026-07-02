# Reaction + WatchList Achievement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** เพิ่ม 2 achievement badge (Bid Cheerer react≥20, Auction Watcher watch≥10) ผูก BidReaction/WatchList

**Architecture:** reuse badge engine — 2 criteria type ใหม่ + 2 checker (count active row) + dispatch; trigger `evaluateBadges(userId,'BUYER')` หลัง react-create + watch-upsert; seed 2 row

**Tech Stack:** TypeScript, Prisma, Vitest

**Spec:** `docs/superpowers/specs/2026-07-02-reaction-watchlist-achievement-design.md`

## Global Constraints

- audience **BUYER**; count = **active row ปัจจุบัน** (`bidReaction.count`/`watchList.count` by userId) — ไม่แตะ schema
- Trigger **ทิศ add เท่านั้น** (react create / watch upsert) — ไม่ eval ตอน un-react/un-watch; best-effort `.catch()` ไม่ throw กระทบ response
- icon tabler: react=`tabler-heart`, watch=`tabler-eye`; ชื่อ TH "นักให้กำลังใจ"/"นักเฝ้าประมูล", nameEN "Bid Cheerer"/"Auction Watcher"
- ไม่แตะ Trust Score formula; reuse badge-earned notification (ข้อ 2)
- comment ภาษาไทย; test mock prisma (pattern activity.service.test)

---

### Task 1: criteria types + checkers + dispatch

**Files:**
- Modify: `src/types/badge.ts` (union + 2 type)
- Modify: `src/services/badge.service.ts` (2 checker + dispatch ใน evaluateBadges + getBadgeProgress)
- Test: `src/services/badge.service.test.ts` (เพิ่ม describe)

**Interfaces:**
- Produces: `checkReactionCount(userId, criteria)`, `checkWatchlistCount(userId, criteria)` → `{ met: boolean; count: number }`
- Criteria: `CriteriaReactionCount = { type:'REACTION_COUNT'; count:number }`, `CriteriaWatchlistCount = { type:'WATCHLIST_COUNT'; count:number }`

- [ ] **Step 1: failing test** — เพิ่มท้าย `src/services/badge.service.test.ts` (mock prisma เพิ่ม `bidReaction/watchList`)

เพิ่มใน `vi.mock('@/lib/prisma')` object: `bidReaction: { count: vi.fn() }, watchList: { count: vi.fn() },`
เพิ่ม import: `import { checkReactionCount, checkWatchlistCount } from '@/services/badge.service'`
```ts
describe('checkReactionCount', () => {
  it('met=true เมื่อ count ถึง threshold', async () => {
    vi.mocked(prisma.bidReaction.count).mockResolvedValue(20 as never)
    expect(await checkReactionCount('u1', { type: 'REACTION_COUNT', count: 20 })).toEqual({ met: true, count: 20 })
  })
  it('met=false เมื่อยังไม่ถึง', async () => {
    vi.mocked(prisma.bidReaction.count).mockResolvedValue(19 as never)
    expect(await checkReactionCount('u1', { type: 'REACTION_COUNT', count: 20 })).toEqual({ met: false, count: 19 })
  })
})
describe('checkWatchlistCount', () => {
  it('met=true เมื่อ count ถึง threshold', async () => {
    vi.mocked(prisma.watchList.count).mockResolvedValue(10 as never)
    expect(await checkWatchlistCount('u1', { type: 'WATCHLIST_COUNT', count: 10 })).toEqual({ met: true, count: 10 })
  })
  it('met=false เมื่อยังไม่ถึง', async () => {
    vi.mocked(prisma.watchList.count).mockResolvedValue(5 as never)
    expect(await checkWatchlistCount('u1', { type: 'WATCHLIST_COUNT', count: 10 })).toEqual({ met: false, count: 5 })
  })
})
```

- [ ] **Step 2: run red** — `npm test -- --run src/services/badge.service.test.ts` → FAIL (checker ยังไม่ export)

- [ ] **Step 3: types** — `src/types/badge.ts` เพิ่มก่อน `export type BadgeCriteria =`:
```ts
export type CriteriaReactionCount = { type: 'REACTION_COUNT'; count: number }
export type CriteriaWatchlistCount = { type: 'WATCHLIST_COUNT'; count: number }
```
เพิ่มใน union `BadgeCriteria`:
```ts
  | CriteriaReactionCount
  | CriteriaWatchlistCount
```

- [ ] **Step 4: checkers** — `src/services/badge.service.ts` เพิ่ม import type `CriteriaReactionCount, CriteriaWatchlistCount` + หลัง checkAuctionWonCompleted:
```ts
/** buyer: จำนวน reaction (BidReaction) ที่ active อยู่ตอนนี้ (toggle — un-react ลบ row) */
export async function checkReactionCount(
  userId: string,
  criteria: CriteriaReactionCount,
): Promise<{ met: boolean; count: number }> {
  const count = await prisma.bidReaction.count({ where: { userId } })
  return { met: count >= criteria.count, count }
}

/** buyer: จำนวน auction ที่ watch อยู่ตอนนี้ (WatchList — unwatch ลบ row) */
export async function checkWatchlistCount(
  userId: string,
  criteria: CriteriaWatchlistCount,
): Promise<{ met: boolean; count: number }> {
  const count = await prisma.watchList.count({ where: { userId } })
  return { met: count >= criteria.count, count }
}
```

- [ ] **Step 5: dispatch ใน evaluateBadges** — เพิ่ม case ก่อน `default:` ใน switch ของ evaluateBadges:
```ts
        case 'REACTION_COUNT': {
          const r = await checkReactionCount(userId, criteria)
          met = r.met
          break
        }
        case 'WATCHLIST_COUNT': {
          const r = await checkWatchlistCount(userId, criteria)
          met = r.met
          break
        }
```

- [ ] **Step 6: dispatch ใน getBadgeProgress** — เพิ่ม case ก่อน `default:` ใน switch ของ getBadgeProgress:
```ts
          case 'REACTION_COUNT': {
            if (!earned) {
              const { count } = await checkReactionCount(userId, criteria)
              const threshold = criteria.count
              progressRatio = threshold > 0 ? Math.min(count / threshold, 1) : 0
              const remaining = criteria.count - count
              progressLabel = remaining > 0 ? `อีก ${remaining} ครั้ง` : `ครบ ${criteria.count} ครั้งแล้ว`
            }
            break
          }
          case 'WATCHLIST_COUNT': {
            if (!earned) {
              const { count } = await checkWatchlistCount(userId, criteria)
              const threshold = criteria.count
              progressRatio = threshold > 0 ? Math.min(count / threshold, 1) : 0
              const remaining = criteria.count - count
              progressLabel = remaining > 0 ? `อีก ${remaining} รายการ` : `ครบ ${criteria.count} รายการแล้ว`
            }
            break
          }
```

- [ ] **Step 7: run green** — `npm test -- --run src/services/badge.service.test.ts` → PASS ทั้งหมด

- [ ] **Step 8: commit**
```bash
git add src/types/badge.ts src/services/badge.service.ts src/services/badge.service.test.ts
git commit -m "feat(badge): criteria REACTION_COUNT + WATCHLIST_COUNT (checker + dispatch)"
```

---

### Task 2: triggers (react-create + watch-upsert)

**Files:**
- Modify: `src/services/auction.service.ts` (toggleBidReaction — branch create)
- Modify: `src/app/api/app/auctions/[id]/watch/route.ts` (POST — หลัง upsert)
- Modify: `src/app/api/auctions/[id]/watch/route.ts` (POST — หลัง upsert)

**Interfaces:**
- Consumes: `evaluateBadges(userId, 'BUYER')` (มีอยู่แล้ว)

- [ ] **Step 1: trigger ใน toggleBidReaction** — `src/services/auction.service.ts`
`evaluateBadges` import มีอยู่แล้ว (ใช้ใน settle/placeBid). ใน `toggleBidReaction` เปลี่ยน branch create:
```ts
    try {
      await prisma.bidReaction.create({ data: { bidId, userId } })
      reacted = true
    } catch (e) {
```
เพิ่มหลัง `reacted = true` (ในบรรทัดถัดจาก create สำเร็จ ก่อน catch) — ไม่ได้ ต้องวางหลัง block if/else. วางก่อน `const reactionCount = ...`:
```ts
  // trigger badge eval เฉพาะทิศ react (add) — best-effort ไม่ block response (Bid Cheerer)
  if (reacted) {
    void evaluateBadges(userId, 'BUYER').catch((e) => console.error('[toggleBidReaction] evaluateBadges(BUYER) failed', e))
  }
```
(วางหลัง if/else ที่ set `reacted`, ก่อน `const reactionCount = await prisma.bidReaction.count`)

- [ ] **Step 2: trigger ใน app watch route** — `src/app/api/app/auctions/[id]/watch/route.ts`
เพิ่ม import: `import { evaluateBadges } from '@/services/badge.service'`
หลัง `await prisma.watchList.upsert({...})` ก่อน `return`:
```ts
  // trigger badge eval — best-effort ไม่ block response (Auction Watcher)
  void evaluateBadges(user.id, 'BUYER').catch((e) => console.error('[watch] evaluateBadges(BUYER) failed', e))
```

- [ ] **Step 3: trigger ใน web watch route** — `src/app/api/auctions/[id]/watch/route.ts`
เพิ่ม import: `import { evaluateBadges } from '@/services/badge.service'`
หลัง `await prisma.watchList.upsert({...})` ก่อน `return`:
```ts
  // trigger badge eval — best-effort ไม่ block response (Auction Watcher)
  void evaluateBadges(userId, 'BUYER').catch((e) => console.error('[watch] evaluateBadges(BUYER) failed', e))
```

- [ ] **Step 4: tsc** — `./node_modules/.bin/tsc --noEmit` → 0 error ในไฟล์ที่แตะ (ignore pre-existing image-module errors)

- [ ] **Step 5: commit**
```bash
git add src/services/auction.service.ts "src/app/api/app/auctions/[id]/watch/route.ts" "src/app/api/auctions/[id]/watch/route.ts"
git commit -m "feat(badge): trigger evaluateBadges หลัง react-create + watch-upsert (Bid Cheerer/Auction Watcher)"
```

---

### Task 3: seed 2 badges

**Files:**
- Modify: `prisma/badge-seed-data.ts`

- [ ] **Step 1: เพิ่ม seed row** — `src/services/../prisma/badge-seed-data.ts` ท้าย array (หลัง Auction Completer):
```ts
  // ── Engagement Achievements (feat 00005 Reactions + WatchList — spec 2026-07-02) ──
  { name: "นักให้กำลังใจ",     nameEN: "Bid Cheerer",      icon: "tabler-heart", type: "ACHIEVEMENT", audience: "BUYER", criteria: { type: "REACTION_COUNT", count: 20 } },
  { name: "นักเฝ้าประมูล",     nameEN: "Auction Watcher",  icon: "tabler-eye",   type: "ACHIEVEMENT", audience: "BUYER", criteria: { type: "WATCHLIST_COUNT", count: 10 } },
```

- [ ] **Step 2: commit**
```bash
git add prisma/badge-seed-data.ts
git commit -m "feat(badge): seed Bid Cheerer + Auction Watcher engagement badge"
```

- [ ] **Step 3: apply prod** (ขอ user ยืนยันก่อน — touch shared Supabase): `npm run seed:badges` หรือ cross-worktree run เหมือน item 1; verify readback 2 row

---

## Self-Review

- **Spec coverage:** §4 types→T1S3, §5 checkers+dispatch→T1S4-6, §6 triggers→T2, §7 seed→T3, §10 notification=reuse (auto ผ่าน awardBadge) ✅
- **Placeholder:** ไม่มี ✅
- **Type consistency:** `checkReactionCount/checkWatchlistCount(userId, criteria)→{met,count}` ตรงกัน T1; criteria type ชื่อ field `count` ตรง union ✅
- **หมายเหตุ:** `getBadgePaceEstimate` ไม่เพิ่ม case (out of scope §2) → REACTION_COUNT/WATCHLIST_COUNT ตก default `non_countable` (graceful)
