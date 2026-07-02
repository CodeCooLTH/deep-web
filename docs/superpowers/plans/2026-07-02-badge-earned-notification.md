# Badge-earned Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยิง in-app Notification + Expo push เมื่อ user ได้รับ badge ใหม่ (award ครั้งแรกเท่านั้น) โดย reuse `Notification`/`PushToken` เดิม

**Architecture:** เพิ่ม notify hook ที่ `awardBadge()` (choke point เดียวของทุก award path). เปลี่ยน `awardBadge` จาก `upsert` → `createMany({skipDuplicates})` เพื่อ detect "award ครั้งแรก" (count===1) แล้ว notify เฉพาะตอนนั้น. `notifyBadgeEarned()` สร้าง Notification row + เรียก `pushToUser` (best-effort). thread `notify` param ผ่าน `evaluateBadges`/`evaluateSignupYearBadge` เพื่อปิดได้ตอน backfill

**Tech Stack:** TypeScript, Prisma, Vitest (mock prisma + app-push.service)

**Spec:** `docs/superpowers/specs/2026-07-02-badge-earned-notification-design.md`

## Global Constraints

- **No migration** — `Notification.kind` เป็น `String` อยู่แล้ว; แก้แค่ comment. เพิ่มค่า convention `kind = "badge_earned"`
- **Copy ไม่มี emoji** (Hard Rule / `docs/conventions/no-emoji-use-icons.md`): title = `ได้รับ Badge ใหม่`, body = `คุณได้รับ "<badge.name>" แล้ว`
- **best-effort non-throwing** — notify ล้มเหลวห้ามกระทบ award / flow หลัก (try/catch ภายใน `notifyBadgeEarned`)
- **refId = badgeId** บน Notification
- **comment/doc ภาษาไทย** (convention `feedback_doc_language`)
- **Test env ไม่มี DB** — mock `@/lib/prisma` ทั้ง module ตาม pattern `src/services/__tests__/activity.service.test.ts`
- **⚠️ worktree `main-5` ไม่มี node_modules** — รัน vitest/tsc ที่นี่ไม่ได้. verification (`npm test`, tsc) ต้องรันใน checkout ที่ install deps แล้ว (เช่น `main-2`) หรือ install deps ใน main-5 ก่อน execute. Controller จัดการ run environment ตอน execute

---

### Task 1: `awardBadge` created-detection + `notifyBadgeEarned` + schema comment

**Files:**
- Modify: `src/services/badge.service.ts` (awardBadge ~line 381-387; เพิ่ม import + notifyBadgeEarned)
- Modify: `prisma/schema.prisma` (comment `Notification.kind` ~line 507)
- Test: `src/services/badge.service.test.ts` (สร้างใหม่)

**Interfaces:**
- Produces:
  - `awardBadge(userId: string, badgeId: string, opts?: { notify?: boolean }): Promise<boolean>` — return `true` ถ้า award ครั้งแรก (created), `false` ถ้ามีอยู่แล้ว; notify เฉพาะ created && opts.notify !== false
  - `notifyBadgeEarned(userId: string, badgeId: string): Promise<void>` — best-effort สร้าง Notification row + push
- Consumes: `pushToUser(userId, title, body, data?)` จาก `@/services/app-push.service` (มีอยู่แล้ว)

- [ ] **Step 1: เขียน failing test** — `src/services/badge.service.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma ทั้ง module (test env ไม่มี DB) — pattern เดียวกับ activity.service.test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userBadge: { createMany: vi.fn(), findMany: vi.fn() },
    badge: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUser: vi.fn() }))
vi.mock('@/services/trust-score.service', () => ({ recalculateTrustScore: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { pushToUser } from '@/services/app-push.service'
import { awardBadge, notifyBadgeEarned } from '@/services/badge.service'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.badge.findUnique).mockResolvedValue({ name: 'ชนะ 5 ดีล' } as never)
  vi.mocked(prisma.notification.create).mockResolvedValue({} as never)
})

describe('awardBadge — created detection + notify', () => {
  it('award ครั้งแรก (count=1) → return true + สร้าง notification + push', async () => {
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 1 } as never)
    const created = await awardBadge('u1', 'b1')
    expect(created).toBe(true)
    expect(prisma.notification.create).toHaveBeenCalledOnce()
    expect(pushToUser).toHaveBeenCalledOnce()
  })

  it('award ซ้ำ (count=0) → return false + ไม่ notify', async () => {
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 0 } as never)
    const created = await awardBadge('u1', 'b1')
    expect(created).toBe(false)
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(pushToUser).not.toHaveBeenCalled()
  })

  it('notify:false → created แต่ไม่ notify', async () => {
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 1 } as never)
    const created = await awardBadge('u1', 'b1', { notify: false })
    expect(created).toBe(true)
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(pushToUser).not.toHaveBeenCalled()
  })
})

describe('notifyBadgeEarned — content + guards', () => {
  it('สร้าง Notification kind=badge_earned + copy ไม่มี emoji + refId=badgeId', async () => {
    await notifyBadgeEarned('u1', 'b1')
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        kind: 'badge_earned',
        title: 'ได้รับ Badge ใหม่',
        body: 'คุณได้รับ "ชนะ 5 ดีล" แล้ว',
        refId: 'b1',
      },
    })
    expect(pushToUser).toHaveBeenCalledWith(
      'u1', 'ได้รับ Badge ใหม่', 'คุณได้รับ "ชนะ 5 ดีล" แล้ว', { type: 'badge_earned', badgeId: 'b1' },
    )
  })

  it('badge ไม่มีใน DB → return เงียบ ไม่สร้าง notification', async () => {
    vi.mocked(prisma.badge.findUnique).mockResolvedValue(null as never)
    await notifyBadgeEarned('u1', 'missing')
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(pushToUser).not.toHaveBeenCalled()
  })

  it('notification.create throw → ไม่ rethrow (best-effort)', async () => {
    vi.mocked(prisma.notification.create).mockRejectedValue(new Error('db down') as never)
    await expect(notifyBadgeEarned('u1', 'b1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm test -- src/services/badge.service.test.ts` (ใน checkout ที่มี deps)
Expected: FAIL — `notifyBadgeEarned` ยังไม่ถูก export / awardBadge signature เดิม return void

- [ ] **Step 3: แก้ `awardBadge` + เพิ่ม `notifyBadgeEarned`** — `src/services/badge.service.ts`

เพิ่ม import ใต้ import เดิม (หลัง `import { recalculateTrustScore } ...`):
```ts
import { pushToUser } from "@/services/app-push.service"
```

แทนที่ block `awardBadge` เดิม (ทั้ง JSDoc + function) ด้วย:
```ts
/**
 * notifyBadgeEarned — แจ้งเตือน "ได้รับ badge ใหม่" (in-app + Expo push)
 * best-effort: error ห้าม rethrow (ถูกเรียกจาก awardBadge ใน flow หลัก)
 * seller ไม่มี PushToken → pushToUser no-op เอง; copy ไม่มี emoji (Hard Rule)
 */
export async function notifyBadgeEarned(userId: string, badgeId: string): Promise<void> {
  try {
    const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { name: true } })
    if (!badge) return
    const title = "ได้รับ Badge ใหม่"
    const body = `คุณได้รับ "${badge.name}" แล้ว`
    await prisma.notification.create({
      data: { userId, kind: "badge_earned", title, body, refId: badgeId },
    })
    await pushToUser(userId, title, body, { type: "badge_earned", badgeId })
  } catch (err) {
    console.error("[badge] notifyBadgeEarned failed", userId, badgeId, err)
  }
}

/**
 * Award UserBadge — idempotent ด้วย @@unique([userId, badgeId])
 * ใช้ createMany({skipDuplicates}) เพื่อ detect award ครั้งแรก (count===1) →
 * notify เฉพาะตอนนั้น (กัน notify ซ้ำเมื่อ re-eval). return created:boolean
 * opts.notify=false → ปิด notify (backfill/seed) กัน burst
 */
export async function awardBadge(
  userId: string,
  badgeId: string,
  opts?: { notify?: boolean },
): Promise<boolean> {
  const result = await prisma.userBadge.createMany({
    data: [{ userId, badgeId }],
    skipDuplicates: true,
  })
  const created = result.count === 1
  if (created && opts?.notify !== false) {
    await notifyBadgeEarned(userId, badgeId)
  }
  return created
}
```

- [ ] **Step 4: อัปเดต comment schema** — `prisma/schema.prisma` (บรรทัด comment เหนือ `kind` ใน model Notification)

เปลี่ยน:
```
  // kind: "outbid" | "won" | "system" — ตรงกับ app type Notification.kind
```
เป็น:
```
  // kind: "outbid" | "won" | "system" | "badge_earned" — ตรงกับ app type Notification.kind
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `npm test -- src/services/badge.service.test.ts`
Expected: PASS ทั้ง 6 test

- [ ] **Step 6: Commit**

```bash
git add src/services/badge.service.ts src/services/badge.service.test.ts prisma/schema.prisma
git commit -m "feat(badge): notify เมื่อได้ badge ใหม่ (awardBadge created-detection + notifyBadgeEarned)"
```

---

### Task 2: thread `notify` param ผ่าน evaluateBadges + evaluateSignupYearBadge

**Files:**
- Modify: `src/services/badge.service.ts` (`evaluateBadges` ~line 409-542, `evaluateSignupYearBadge` ~line 553-580)
- Test: `src/services/badge.service.test.ts` (เพิ่ม describe block)

**Interfaces:**
- Consumes: `awardBadge(userId, badgeId, opts?)` จาก Task 1
- Produces:
  - `evaluateBadges(userId, audience?, opts?: { notify?: boolean }): Promise<void>` — ส่ง opts ต่อไป awardBadge
  - `evaluateSignupYearBadge(userId, opts?: { notify?: boolean }): Promise<void>`

- [ ] **Step 1: เขียน failing test** — เพิ่มท้าย `src/services/badge.service.test.ts`

```ts
import { evaluateBadges } from '@/services/badge.service'

describe('evaluateBadges — thread notify param', () => {
  it('notify:false ส่งต่อ awardBadge → ไม่ notify แม้ award ใหม่', async () => {
    // badge 1 ใบ criteria FULL_VERIFICATION, user ยังไม่ได้
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      { id: 'b1', nameEN: 'X', audience: 'ANY', criteria: { type: 'FULL_VERIFICATION' } },
    ] as never)
    vi.mocked(prisma.userBadge.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 1 } as never)
    // checkFullVerification → ต้อง met=true: mock verificationRecord
    ;(prisma as unknown as { verificationRecord: { findMany: ReturnType<typeof vi.fn> } }).verificationRecord = {
      findMany: vi.fn().mockResolvedValue([{ level: 1 }, { level: 2 }, { level: 3 }]),
    }
    await evaluateBadges('u1', 'ANY', { notify: false })
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })
})
```

> หมายเหตุ: ต้องเพิ่ม `verificationRecord: { findMany: vi.fn() }` ใน mock prisma ที่ top ของไฟล์ (Step ปรับ mock object) เพื่อให้ `checkFullVerification` ทำงานใน test นี้

- [ ] **Step 2: ปรับ mock prisma ให้ครอบ verificationRecord** — แก้ block `vi.mock('@/lib/prisma', ...)` ที่ top เพิ่ม:
```ts
    verificationRecord: { findMany: vi.fn() },
```
(ใต้ `notification: { create: vi.fn() },`)

- [ ] **Step 3: รัน test ให้ fail**

Run: `npm test -- src/services/badge.service.test.ts`
Expected: FAIL — `evaluateBadges` ยังไม่รับ opts → award ใช้ notify default true → notification.create ถูกเรียก

- [ ] **Step 4: แก้ `evaluateBadges` + `evaluateSignupYearBadge`** — `src/services/badge.service.ts`

`evaluateBadges` signature เปลี่ยนเป็น:
```ts
export async function evaluateBadges(
  userId: string,
  audience: AudienceArg = 'seller',
  opts?: { notify?: boolean },
): Promise<void> {
```
และบรรทัด award ใน loop เปลี่ยนจาก `await awardBadge(userId, badge.id)` เป็น:
```ts
      await awardBadge(userId, badge.id, opts)
```

`evaluateSignupYearBadge` signature เปลี่ยนเป็น:
```ts
export async function evaluateSignupYearBadge(userId: string, opts?: { notify?: boolean }): Promise<void> {
```
และบรรทัด `await awardBadge(userId, badge.id)` (ใน loop) เปลี่ยนเป็น:
```ts
      await awardBadge(userId, badge.id, opts)
```

- [ ] **Step 5: รัน test ให้ผ่าน (ทั้งไฟล์)**

Run: `npm test -- src/services/badge.service.test.ts`
Expected: PASS ทุก test (Task 1 + Task 2)

- [ ] **Step 6: Commit**

```bash
git add src/services/badge.service.ts src/services/badge.service.test.ts
git commit -m "feat(badge): thread notify param ผ่าน evaluateBadges/evaluateSignupYearBadge (backfill กัน burst)"
```

---

## Self-Review

**Spec coverage:**
- §3 kind="badge_earned" + refId + schema comment → Task 1 Step 3/4 ✅
- §4 awardBadge created-detection + notify opts → Task 1 ✅
- §5 notifyBadgeEarned content (no-emoji copy, in-app + push) → Task 1 ✅
- §6 callers: evaluateBadges loop (new เสมอ), evaluateSignupYearBadge ใช้ awardBadge → Task 2 ✅ (evaluateSignupYearBadge ใช้ awardBadge อยู่แล้ว → ได้ notify อัตโนมัติ + thread opts)
- §7 backfill guard notify:false → Task 2 ✅
- §8 tests (created/duplicate/notify:false/content/missing-badge/best-effort) → Task 1+2 ✅

**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มี code จริง ✅

**Type consistency:** `awardBadge(userId,badgeId,opts?)→Promise<boolean>` ใช้ตรงกันทั้ง Task 1 (define) + Task 2 (consume); `{notify?:boolean}` opts shape เดียวกันทุกจุด ✅

**หมายเหตุ cross-repo (ไม่ใช่ task):** Deep-App (Expo, คนละ repo) ควรเพิ่ม `"badge_earned"` ใน union `Notification.kind` ฝั่งแอป + handle deep-link refId→badge detail — แจ้งทีมแอป
