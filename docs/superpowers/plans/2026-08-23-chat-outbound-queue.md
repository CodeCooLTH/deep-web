# Chat Outbound Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ข้อความที่ผู้ขายกดส่งจากช่องพิมพ์ **ถูกบันทึกลง DB ก่อนตอบ client** แล้วยิงออกช่องทางเบื้องหลังครั้งเดียว เพื่อให้การปิดแอปกลางคันไม่ทำให้ข้อความหาย และไม่ทำให้จอโกหกว่าส่งสำเร็จ

**Architecture:** `POST /messages` ผ่านด่านที่ตอบได้ทันที → `INSERT ChatMessage(deliveryStatus='QUEUED')` → ตอบ `202` → ยิงช่องทางใน `after()` ครั้งเดียว → `UPDATE` เป็น `SENT`/`FAILED`. มีตัวกวาด 2 ชั้น (webhook opportunistic + cron ทุก 1 นาที) เก็บแถวที่ `after()` ไม่ได้รัน **ไม่มี auto-retry** — ล้มแล้วให้ผู้ขายกด "ลองใหม่" เอง

**Tech Stack:** Next.js 16 (App Router, `after()` จาก `next/server`) · Prisma + PostgreSQL · Vitest · Supabase Realtime (Broadcast from Database) · Vercel Cron

**Spec:** `docs/superpowers/specs/2026-08-23-chat-outbound-queue-design.md` — **ต้องอ่านก่อนเริ่ม Task ใด ๆ** โดยเฉพาะ §1.1 (สาเหตุยังไม่ยืนยัน) §8 (edge case 20 ข้อ) §9 (ตัววัด)

## Global Constraints

ทุก Task อยู่ใต้ข้อบังคับเหล่านี้โดยปริยาย:

- **ขอบเขต:** แตะเฉพาะเส้นทาง **ช่องพิมพ์ผู้ขาย** (`POST /api/chat/conversations/[id]/messages` ที่มาจากคนกด) — ผู้เรียก `sendOutboundMessage` อีก 8 ที่ต้อง **พฤติกรรมไม่เปลี่ยนแม้แต่นิดเดียว**
- **ไม่มี auto-retry** (D-2) — โค้ดที่ยิงซ้ำเองโดยอัตโนมัติถือว่าผิดสเปก
- 🛑 **`sendLockedAt IS NULL` คือเกณฑ์ความปลอดภัยเดียวของทั้งงาน** (D-6) — แถวที่เคยถูก claim ห้ามยิงซ้ำอัตโนมัติ ไม่ว่าในสถานการณ์ใด
- **ภาษา:** UI copy + คอมเมนต์อธิบาย "ทำไม" + commit body = ภาษาไทย
- **Hard Rule 8:** Task ที่แตะ frontend ต้อง invoke `safepay-ux` ก่อนเขียนโค้ด และรัน `/impeccable critique` + `/impeccable clarify` ก่อนปิดงาน
- **Hard Rule 11:** เอกสารต้องเสร็จก่อนโค้ด (Task 1) และต้อง sync `docs/SRS.md` เพราะงานนี้แตะ data model + API
- **Hard Rule 13/14:** ห้ามคำสั่งลบข้อมูลแบบไม่ scope ในไฟล์เทส · คำสั่ง prisma ที่ล้าง/สร้าง schema ต้องปักหมุด `postgresql://safepay:safepay@localhost:5434/safepay` ในคำสั่งตรง ๆ
- **Hard Rule 15:** `vercel.json` รัน `prisma migrate deploy` ตอน build ⇒ **push ขึ้น main = migrate ขึ้น prod ในตัว** ต้องแจ้ง user ทุกครั้งที่มี migration ใหม่
- **Hard Rule 17:** verify (`tsc`/test/build) ต้องอยู่ **หลัง** rebase เสมอ + เช็ค fast-forward ซ้ำก่อน push
- **คำสั่งที่ใช้ verify:** `npx tsc --noEmit` · `npx vitest run src/` · `npm run build`
- **branch:** `feat/chat-outbound-queue` (สร้างแล้ว, spec commit `951e9471`)

---

## File Structure

| ไฟล์ | ความรับผิดชอบเดียว |
|---|---|
| `src/lib/chat-send-queue.ts` **ใหม่** | **กฎของคิว ล้วน ๆ ไม่แตะ DB ไม่แตะเครือข่าย** — ใครถูก claim ได้ · claim ค้างเมื่อไหร่ · ถ้อยคำของ "ไม่แน่ใจว่าส่งไปหรือยัง" · ตัวไหนคือหัวคิวของห้อง |
| `src/services/chat-outbox.service.ts` **ใหม่** | วงจรชีวิตของแถวคิว: `enqueue` · `claimAndDeliver` · `sweep` — เป็นที่เดียวที่เขียน `deliveryStatus` ของเส้นทางนี้ |
| `src/services/channel-chat.service.ts` แก้ | แตกส่วน **"ยิงออกช่องทาง"** ออกมาเป็นฟังก์ชันที่ไม่แตะ DB เพื่อให้เส้นทางเดิมกับเส้นทางคิวใช้ตัวเดียวกัน (HR16) |
| `src/app/api/chat/conversations/[id]/messages/route.ts` แก้ | เปลี่ยนจาก "ส่งแล้วตอบ" เป็น "เข้าคิวแล้วตอบ + `after()`" |
| `src/app/api/cron/chat-outbox/route.ts` **ใหม่** | ชั้น 3 (ตัวการันตี) |
| `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` แก้ | เรนเดอร์สถานะ `QUEUED` |
| `src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts` แก้ | เลิกโกหกว่า `_status='sent'` + `keepalive` |
| `src/services/seller-push.service.ts` แก้ | push ตอนล้มถาวร (throttle key แยก) |
| `prisma/migrations/2026…_chat_outbound_queue/migration.sql` **ใหม่** | คอลัมน์ + partial index |
| `prisma/migrations/2026…_chat_broadcast_on_status_update/migration.sql` **ใหม่** | trigger realtime |

---

### Task 1: เอกสาร (HR11 — ก่อนโค้ดบรรทัดแรก)

**Files:**
- Create: `docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-23-outbound-queue.md`
- Modify: `docs/SRS.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-23-chat-outbound-queue-design.md`
- Produces: เอกสารที่ Task 2-11 อ้างอิงเป็น SSOT ของกฎธุรกิจ

- [ ] **Step 1: เขียน EXTENSIONS doc**

โครงตามไฟล์พี่น้อง (`EXTENSIONS-2026-08-11-thread-context-bar.md`) หัวข้อบังคับ:
`ที่มา` · `ขอบเขต/นอกขอบเขต` · `มติ D-1..D-8` (ยกจาก spec §3 ตรง ๆ) · `FR ใหม่` · `Edge cases 20 ข้อ` · `หนี้ที่รู้ตัว KG-1..KG-4` · `ตัววัด`

FR ที่ต้องเขียนให้ทดสอบได้:
- **FR-OQ-01** ข้อความจากช่องพิมพ์ผู้ขายต้องมีแถว `ChatMessage` ใน DB **ก่อน** API ตอบกลับเสมอ
- **FR-OQ-02** ยิงออกช่องทางครั้งเดียวต่อแถว — ไม่มีการยิงซ้ำอัตโนมัติ
- **FR-OQ-03** แถวที่ `sendLockedAt` ไม่เป็น null ห้ามถูก claim ซ้ำ
- **FR-OQ-04** แถวที่ claim ค้างเกิน 3 นาที → `FAILED` + `failureReason` = ข้อความ "ไม่แน่ใจว่าส่งออกไปหรือยัง"
- **FR-OQ-05** ข้อความในห้องเดียวกันออกเรียงตาม `createdAt` — ใบหลังห้ามออกก่อนใบหน้าถึงปลายทาง
- **FR-OQ-06** `QUEUED → FAILED` ส่ง push หนึ่งครั้ง (throttle key แยกจาก noti ข้อความใหม่)

- [ ] **Step 2: sync `docs/SRS.md`**

งานนี้แตะ data model + API ⇒ SRS ต้องตามให้ทัน (HR11 บทเรียน 00033):
- **data model:** `ChatMessage` เพิ่ม 4 คอลัมน์ (`sendLockedAt` `sendLockedBy` `sendPayload`) และ `deliveryStatus` เพิ่มค่า `'QUEUED'` — ระบุว่าปลายทางยังมีแค่ `SENT`/`FAILED`
- **API:** `POST /api/chat/conversations/{id}/messages` เปลี่ยนจาก `200` + แถวที่ส่งแล้ว → `202` + แถวที่เข้าคิว และ `partialError` หายไปจาก response ของ `IMAGE_GRID`
- **enum/validation:** `deliveryStatus` เป็น 4 ค่า (`null | 'QUEUED' | 'SENT' | 'FAILED'`)

- [ ] **Step 3: Commit**

```bash
git add "docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-23-outbound-queue.md" docs/SRS.md
git commit -m "docs(chat): CR คิวส่งข้อความผู้ขาย — FR-OQ-01..06 + sync SRS (data model/API/enum)"
```

---

### Task 2: `chat-send-queue.ts` — กฎของคิว (ฟังก์ชันบริสุทธิ์)

ทำก่อนทุกอย่างที่แตะ DB เพราะมันคือที่ที่ตรรกะอันตรายที่สุดอยู่ และเป็นที่เดียวที่เทสจับได้ตรง ๆ (`docs/conventions/ui-boolean-needs-a-testable-home.md`)

**Files:**
- Create: `src/lib/chat-send-queue.ts`
- Test: `src/lib/__tests__/chat-send-queue.test.ts`

**Interfaces:**
- Consumes: — (ไม่ import อะไรจาก task อื่น)
- Produces:
  - `type QueueRow = { id: string; conversationId: string; createdAt: Date; deliveryStatus: string | null; sendLockedAt: Date | null }`
  - `type ClaimOwner = 'after' | 'sweep' | 'cron'`
  - `const STALE_CLAIM_MS: number`
  - `const UNCERTAIN_SEND_REASON: string`
  - `function isClaimable(row: QueueRow): boolean`
  - `function isStaleClaim(row: QueueRow, now: Date): boolean`
  - `function headOfRoom(rows: QueueRow[]): QueueRow | null`

- [ ] **Step 1: เขียนเทสที่ต้องแดง**

Create `src/lib/__tests__/chat-send-queue.test.ts`:

```ts
// chat-send-queue.test.ts — [blocker] กฎของคิวส่งข้อความขาออก
//
// 🛑 เทส `isClaimable` คือเทสที่สำคัญที่สุดของฟีเจอร์นี้: การผ่อนเงื่อนไข `sendLockedAt === null`
// แม้บรรทัดเดียวแปลว่า **ลูกค้าได้ข้อความซ้ำ** ซึ่งผู้ขายแก้ไม่ได้และเห็นได้จากฝั่งลูกค้า
// (ดู spec §8 E-1) — ไม่มี tsc/build/grep ตัวไหนจับได้ เพราะโค้ดที่ผิดยังถูกชนิดทุกตัวอักษร

import { describe, expect, it } from 'vitest'
import {
  STALE_CLAIM_MS,
  UNCERTAIN_SEND_REASON,
  headOfRoom,
  isClaimable,
  isStaleClaim,
  type QueueRow,
} from '../chat-send-queue'

const row = (o: Partial<QueueRow> = {}): QueueRow => ({
  id: 'm1',
  conversationId: 'c1',
  createdAt: new Date('2026-08-23T10:00:00Z'),
  deliveryStatus: 'QUEUED',
  sendLockedAt: null,
  ...o,
})

describe('isClaimable', () => {
  it('[blocker] QUEUED + ยังไม่เคย claim → หยิบได้', () => {
    expect(isClaimable(row())).toBe(true)
  })

  it('[blocker] QUEUED แต่เคย claim แล้ว → หยิบไม่ได้ แม้ผ่านมานานแค่ไหน', () => {
    // นี่คือแถวที่ "เริ่มยิงไปแล้วแต่ไม่รู้ผล" — ยิงซ้ำ = ลูกค้าได้ 2 ข้อความ
    expect(isClaimable(row({ sendLockedAt: new Date('2020-01-01T00:00:00Z') }))).toBe(false)
  })

  it('[blocker] SENT แล้ว → หยิบไม่ได้', () => {
    expect(isClaimable(row({ deliveryStatus: 'SENT' }))).toBe(false)
  })

  it('[blocker] FAILED แล้ว → หยิบไม่ได้ (ผู้ขายต้องกดลองใหม่เอง = POST ใบใหม่)', () => {
    expect(isClaimable(row({ deliveryStatus: 'FAILED' }))).toBe(false)
  })

  it('[blocker] แถวแชท DEEP (deliveryStatus=null) → ไม่ใช่ของคิวนี้ หยิบไม่ได้', () => {
    expect(isClaimable(row({ deliveryStatus: null }))).toBe(false)
  })
})

describe('isStaleClaim', () => {
  const lockedAt = new Date('2026-08-23T10:00:00Z')

  it('claim เมื่อครู่ → ยังไม่ค้าง (worker อาจกำลังทำอยู่จริง)', () => {
    expect(isStaleClaim(row({ sendLockedAt: lockedAt }), new Date(lockedAt.getTime() + 1_000))).toBe(false)
  })

  it('[blocker] claim เกินเพดาน → ค้าง ต้องปิดเป็น FAILED', () => {
    expect(isStaleClaim(row({ sendLockedAt: lockedAt }), new Date(lockedAt.getTime() + STALE_CLAIM_MS + 1))).toBe(true)
  })

  it('ยังไม่เคย claim → ไม่ใช่ claim ค้าง (มันแค่รอคิว)', () => {
    expect(isStaleClaim(row(), new Date(lockedAt.getTime() + STALE_CLAIM_MS + 1))).toBe(false)
  })

  it('SENT แล้วแม้ lock ยังอยู่ → ไม่ใช่ claim ค้าง', () => {
    expect(
      isStaleClaim(row({ deliveryStatus: 'SENT', sendLockedAt: lockedAt }), new Date(lockedAt.getTime() + STALE_CLAIM_MS + 1)),
    ).toBe(false)
  })
})

describe('headOfRoom', () => {
  it('[blocker] คืนใบเก่าสุดเสมอ — ลำดับในห้องคือสิ่งที่ลูกค้าอ่าน', () => {
    const older = row({ id: 'old', createdAt: new Date('2026-08-23T10:00:00Z') })
    const newer = row({ id: 'new', createdAt: new Date('2026-08-23T10:00:05Z') })
    expect(headOfRoom([newer, older])?.id).toBe('old')
  })

  it('[blocker] ใบเก่าสุดยังไม่ถึงปลายทางและถูก claim ไปแล้ว → คืน null ห้ามข้ามไปทำใบหลัง', () => {
    // ถ้าข้ามไปส่งใบที่ 2 ลูกค้าจะได้ "300 บาทครับ" ก่อน "ตัวนี้มีสีดำครับ"
    const head = row({ id: 'old', createdAt: new Date('2026-08-23T10:00:00Z'), sendLockedAt: new Date() })
    const next = row({ id: 'new', createdAt: new Date('2026-08-23T10:00:05Z') })
    expect(headOfRoom([head, next])).toBeNull()
  })

  it('ไม่มีแถวที่รออยู่ → null', () => {
    expect(headOfRoom([])).toBeNull()
  })
})

describe('UNCERTAIN_SEND_REASON', () => {
  it('[blocker] ต้องบอกว่า "ไม่แน่ใจ" และสั่งให้ไปตรวจก่อน — ห้ามเป็นข้อความกลาง ๆ', () => {
    // ข้อความกลาง ๆ อย่าง "ส่งไม่สำเร็จ" ชวนให้กดซ้ำทันทีโดยไม่ตรวจ ซึ่งเป็นทางเดียวที่เหลืออยู่
    // ที่จะทำให้ลูกค้าได้ข้อความซ้ำในดีไซน์นี้ (spec §8 E-1)
    expect(UNCERTAIN_SEND_REASON).toMatch(/ไม่แน่ใจ/)
    expect(UNCERTAIN_SEND_REASON).toMatch(/ตรวจ|เปิดดู/)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run src/lib/__tests__/chat-send-queue.test.ts`
Expected: FAIL — `Failed to resolve import "../chat-send-queue"`

- [ ] **Step 3: เขียน implementation ให้น้อยที่สุดที่ทำให้ผ่าน**

Create `src/lib/chat-send-queue.ts`:

```ts
/**
 * chat-send-queue — กฎของคิวส่งข้อความขาออกฝั่งผู้ขาย (ฟังก์ชันบริสุทธิ์ ไม่แตะ DB/เครือข่าย)
 *
 * ที่มา 2026-08-23 (CR ของ 00018): ผู้ขายกดส่งแล้วปิดแอปก่อนเสร็จ ข้อความไม่ถึงลูกค้าแต่จอ
 * บอกว่าส่งสำเร็จ — ดู `docs/superpowers/specs/2026-08-23-chat-outbound-queue-design.md`
 *
 * 🛑 ทำไมกฎพวกนี้ต้องอยู่ในไฟล์ที่ไม่แตะ DB: ตรรกะที่อันตรายที่สุดของฟีเจอร์นี้เป็น boolean
 * สั้น ๆ ทั้งนั้น ถ้าฝังอยู่ใน service ที่ต้องมี Prisma ถึงจะรันได้ จะไม่มีใครเขียนเทสให้มัน
 * แล้วการเขียนกลับด้านจะผ่านทุกด่านของโปรเจกต์ (ui-boolean-needs-a-testable-home.md)
 */

/** เพดานเวลาที่ยอมให้แถวหนึ่ง "ถูก claim อยู่" ก่อนถือว่า worker ตายไปแล้ว (spec D-8) */
export const STALE_CLAIM_MS = 3 * 60 * 1000

/**
 * ถ้อยคำของแถวที่ปิดเพราะ claim ค้าง — **ต้องพูดความจริงว่าเราไม่รู้ผล**
 *
 * 🛑 ห้ามเปลี่ยนเป็นข้อความกลาง ๆ อย่าง "ส่งไม่สำเร็จ": แถวกลุ่มนี้คือแถวที่ *อาจ* ถึงลูกค้าไปแล้ว
 * การเชิญให้กดส่งใหม่ทันทีโดยไม่ตรวจ คือทางเดียวที่เหลืออยู่ที่จะทำให้ลูกค้าได้ข้อความซ้ำ
 */
export const UNCERTAIN_SEND_REASON =
  'ไม่แน่ใจว่าส่งออกไปหรือยัง — เปิดดูในแชทของลูกค้าก่อนกดส่งใหม่'

export type ClaimOwner = 'after' | 'sweep' | 'cron'

/** รูปร่างขั้นต่ำที่กฎในไฟล์นี้ต้องใช้ — ไม่ผูกกับ type ของ Prisma เพื่อให้เทสสร้างเองได้ */
export type QueueRow = {
  id: string
  conversationId: string
  createdAt: Date
  deliveryStatus: string | null
  sendLockedAt: Date | null
}

/**
 * แถวนี้หยิบไปยิงได้ไหม
 *
 * 🛑 `sendLockedAt === null` คือเกณฑ์ความปลอดภัยเดียวของทั้งฟีเจอร์ (spec D-6): มันแปลว่า
 * "ยังไม่เคยมีใครเริ่มยิงแถวนี้ออกไปเลย" ⇒ ยิงได้โดยไม่มีทางซ้ำ. แถวที่เคยถูก claim แล้ว
 * เราไม่มีทางรู้ว่า Meta ได้รับหรือยัง (ไม่มี idempotency key ฝั่ง Meta) จึงห้ามยิงซ้ำ
 */
export function isClaimable(row: QueueRow): boolean {
  return row.deliveryStatus === 'QUEUED' && row.sendLockedAt === null
}

/** แถวที่ถูก claim แล้วค้างเกินเพดาน = worker ตายกลางทาง ต้องปิดเป็น FAILED (ไม่ใช่ยิงซ้ำ) */
export function isStaleClaim(row: QueueRow, now: Date): boolean {
  if (row.deliveryStatus !== 'QUEUED') return false
  if (row.sendLockedAt === null) return false
  return now.getTime() - row.sendLockedAt.getTime() > STALE_CLAIM_MS
}

/**
 * หัวคิวของห้อง — ใบเก่าสุดที่ยัง QUEUED และยังหยิบได้
 *
 * คืน `null` เมื่อใบเก่าสุด **ถูก claim ไปแล้ว** โดยตั้งใจ: ห้ามข้ามไปทำใบถัดไป ไม่งั้นลูกค้า
 * จะอ่านข้อความสลับลำดับกับที่ร้านพิมพ์ (spec D-3)
 */
export function headOfRoom(rows: QueueRow[]): QueueRow | null {
  const pending = rows
    .filter((r) => r.deliveryStatus === 'QUEUED')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const head = pending[0]
  if (!head) return null
  return isClaimable(head) ? head : null
}
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run src/lib/__tests__/chat-send-queue.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: พิสูจน์ด้วย mutation — 4 แบบ ต้องแดงทุกแบบ**

ทำทีละแบบ: แก้ → รันเทส → **ยืนยันว่าแดง** → คืนค่าเดิม → รันเทส → เขียว

| # | แก้ที่ | เปลี่ยนเป็น | เทสที่ต้องแดง |
|---|---|---|---|
| M1 | `isClaimable` | ตัด `&& row.sendLockedAt === null` ออก | "เคย claim แล้ว → หยิบไม่ได้" |
| M2 | `isStaleClaim` | `>` → `>=` แล้วเปลี่ยนเทียบเป็น `now - lockedAt >= 0` | "claim เมื่อครู่ → ยังไม่ค้าง" |
| M3 | `headOfRoom` | `return isClaimable(head) ? head : null` → `return head` | "ใบเก่าสุดถูก claim แล้ว → คืน null" |
| M4 | `headOfRoom` | `a.createdAt.getTime() - b.createdAt.getTime()` → สลับ `b - a` | "คืนใบเก่าสุดเสมอ" |

🛑 **ถ้า mutation ไหนแล้วเทสยังเขียว = ชุด input อ่อน ไม่ใช่ "mutation ไม่เกี่ยว"** — ต้องเติมเคสแล้วรัน mutation เดิมซ้ำจนแดง (`docs/conventions/mutation-silence-means-weak-corpus.md`) และเขียนคอมเมนต์กำกับ input ที่เติม ไม่งั้นคนถัดไปเห็นว่า "ซ้ำกับเคสอื่น" แล้วลบทิ้ง

- [ ] **Step 6: Commit**

```bash
git add src/lib/chat-send-queue.ts src/lib/__tests__/chat-send-queue.test.ts
git commit -m "feat(chat): กฎของคิวส่งข้อความขาออก — sendLockedAt คือเส้นแบ่งเดียวที่กันข้อความซ้ำ"
```

---

### Task 3: Migration — คอลัมน์คิว + partial index

**Files:**
- Modify: `prisma/schema.prisma` (model `ChatMessage`)
- Create: `prisma/migrations/20260823100000_chat_outbound_queue/migration.sql`

**Interfaces:**
- Consumes: —
- Produces: คอลัมน์ `sendLockedAt` `sendLockedBy` `sendPayload` บน `ChatMessage` + index `ChatMessage_send_queue_idx`

- [ ] **Step 1: แก้ `prisma/schema.prisma`**

เพิ่มใน `model ChatMessage` ต่อจากบล็อก `deliveryStatus`/`failureReason`:

```prisma
  // --- CR 2026-08-23 คิวส่งข้อความขาออก (ดู EXTENSIONS-2026-08-23-outbound-queue.md) ---
  //
  // 🛑 sendLockedAt = เกณฑ์ความปลอดภัยเดียวของทั้งฟีเจอร์
  //   NULL     = ยังไม่เคยมีใครเริ่มยิงแถวนี้ออกไป ⇒ หยิบไปยิงได้โดยไม่มีทางซ้ำ
  //   มีค่า    = เคยเริ่มยิงแล้ว ผลไม่แน่ชัด ⇒ **ห้ามยิงซ้ำอัตโนมัติ** (Meta ไม่มี idempotency key)
  // ค้างเกิน STALE_CLAIM_MS → ปิดเป็น FAILED พร้อมเหตุผลว่า "ไม่แน่ใจว่าส่งไปหรือยัง"
  sendLockedAt DateTime?
  /// ใครหยิบงานนี้ไปทำเป็นคนสุดท้าย: 'after' | 'sweep' | 'cron'
  /// 🛑 **ไม่เคลียร์เมื่อสำเร็จโดยตั้งใจ** — บนแถวที่ SENT แล้ว มันตอบว่า "ใครส่งสำเร็จ"
  /// ซึ่งเป็นตัววัดที่บอกว่าบั๊กต้นเรื่อง (คำขอตายกลางทาง) เกิดจริงกี่ครั้ง
  sendLockedBy String?
  /// เจตนาการส่งที่ไม่มีที่อยู่ในคอลัมน์อื่น: sticker / template / flex / messageTag
  /// (imageUrl=fileId, replyToMid, productRefIds มีคอลัมน์ของตัวเองอยู่แล้ว)
  /// มีความหมายเฉพาะตอน QUEUED — เคลียร์เมื่อถึงปลายทาง
  sendPayload  Json?
```

และแก้คอมเมนต์ของ `deliveryStatus` เดิมเป็น:

```prisma
  deliveryStatus    String? // null = แชทในแอป | "QUEUED" (ยังไม่ยิง) | "SENT" | "FAILED"
```

- [ ] **Step 2: เขียน migration SQL ด้วยมือ**

🛑 **ห้ามใช้ `prisma migrate dev`** (Hard Rule 14 — มันสร้าง shadow DB) เขียนไฟล์เอง:

Create `prisma/migrations/20260823100000_chat_outbound_queue/migration.sql`:

```sql
-- CR 2026-08-23 (00018): คิวส่งข้อความขาออกฝั่งผู้ขาย
-- SSOT: docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-23-outbound-queue.md
--
-- additive ล้วน: ไม่ลบคอลัมน์ ไม่แตะ constraint ไม่ backfill
-- `deliveryStatus` เป็น text เปล่าไม่มี CHECK อยู่แล้ว การเพิ่มค่า 'QUEUED' จึงไม่ต้องแก้ constraint

ALTER TABLE "ChatMessage" ADD COLUMN "sendLockedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "sendLockedBy" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "sendPayload" JSONB;

-- 🛑 partial index บังคับ: ตารางนี้โต ~24,000 แถว/เดือน แต่แถวที่ค้างคิวจริงมีหลักสิบ
-- index เต็มคือการจ่ายค่าเขียนทุกแถวเพื่อ query ที่แตะหลักสิบ
-- คีย์เป็น (conversationId, createdAt) เพราะ worker หยิบงาน "เป็นห้อง แล้วเรียงเก่าสุดก่อน"
CREATE INDEX "ChatMessage_send_queue_idx"
  ON "ChatMessage" ("conversationId", "createdAt")
  WHERE "deliveryStatus" = 'QUEUED';

-- ROLLBACK NOTE:
-- DROP INDEX IF EXISTS "ChatMessage_send_queue_idx";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendPayload";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendLockedBy";
-- ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "sendLockedAt";
-- ปลอดภัยเมื่อไม่มีแถว deliveryStatus='QUEUED' ค้างอยู่ — ถ้ามี ให้ปิดเป็น FAILED ก่อน
```

- [ ] **Step 3: apply ลงฐาน local + ตรวจว่าตรงกับ schema**

🛑 ปักหมุด URL localhost ในคำสั่งตรง ๆ ห้ามใช้ `$(...)` หรือตัวแปรจาก `.env.local` (Hard Rule 14):

```bash
DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" npx prisma migrate deploy
npx prisma generate
npx prisma validate
```
Expected: `1 migration applied` · `generated` · `The schema at prisma/schema.prisma is valid`

- [ ] **Step 4: ยืนยันว่า index เป็น partial จริง**

```bash
DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
  npx prisma db execute --stdin <<'SQL'
SELECT indexdef FROM pg_indexes WHERE indexname = 'ChatMessage_send_queue_idx';
SQL
```
Expected: output มี `WHERE ("deliveryStatus" = 'QUEUED'::text)` — **ถ้าไม่มี `WHERE` แปลว่าเขียน migration ผิด ต้องแก้ก่อนไปต่อ**

- [ ] **Step 5: Commit + แจ้ง user เรื่อง migrate-on-deploy**

🛑 Hard Rule 15 — ต้องบอก user ให้ครบ 3 ข้อในข้อความ commit/รายงาน:
(1) prod ไม่ต้องสั่ง migrate เอง push แล้ว `vercel.json` รัน `prisma migrate deploy` ให้
(2) ฐาน local ต้อง apply เอง (ทำใน Step 3 แล้ว)
(3) migrate ล้ม = build ล้ม = deploy ไม่ขึ้น ของเก่ายังเสิร์ฟอยู่ ต้องแก้ไฟล์ migration แล้ว push ใหม่ ไม่ใช่กด retry

```bash
git add prisma/schema.prisma prisma/migrations/20260823100000_chat_outbound_queue/
git commit -m "feat(db): คอลัมน์คิวส่งข้อความ + partial index — sendLockedAt/sendLockedBy/sendPayload"
```

---

### Task 4: Migration — trigger realtime ยิงตอน `deliveryStatus` เปลี่ยน

ถ้าข้าม Task นี้ ฟีเจอร์จะ "ทำงานถูกทุกอย่างแต่จอไม่ขยับ" — บั๊กที่หาสาเหตุยากที่สุดชนิดหนึ่ง

**Files:**
- Create: `prisma/migrations/20260823110000_chat_broadcast_on_status_update/migration.sql`

**Interfaces:**
- Consumes: Task 3 (คอลัมน์ต้องมีก่อน — จริง ๆ ไม่ผูกกัน แต่เรียงให้ migration ตามลำดับเวลา)
- Produces: broadcast บน channel `chat:{conversationId}` เมื่อ `QUEUED → SENT/FAILED`

- [ ] **Step 1: เขียน migration**

Create `prisma/migrations/20260823110000_chat_broadcast_on_status_update/migration.sql`:

```sql
-- CR 2026-08-23 (00018): broadcast เมื่อสถานะการส่งเปลี่ยน ไม่ใช่แค่ตอน INSERT
--
-- ที่มา: ตั้งแต่ 20260703000400 trigger เป็น AFTER INSERT เท่านั้น พอคิวส่งข้อความมาถึง
-- (CR นี้) การเปลี่ยน QUEUED → SENT/FAILED เป็น **UPDATE** จึงไม่มี broadcast เลย
-- ผลคือจอเครื่องอื่น/แท็บอื่นค้างที่ "กำลังส่ง" ตลอดกาลโดยไม่มี error อะไรให้เห็น
--
-- 🛑 ทำไม `UPDATE OF "deliveryStatus"` ไม่ใช่ `AFTER UPDATE` เปล่า ๆ: ทุกรีแอ็กชัน/ทุกการแก้
-- ข้อความ/ทุก unsend ก็เป็น UPDATE ของตารางนี้ ถ้าไม่จำกัดคอลัมน์ client จะถูกสั่ง refetch รัว
--
-- 🛑 channel 2 (chat:shop:{id}) ยังต้องยิงเฉพาะ INSERT + senderRole='BUYER' เหมือนเดิม —
-- มันคือสัญญาณ "ลูกค้าทักมา" ไม่ใช่ "สถานะเปลี่ยน"

CREATE OR REPLACE FUNCTION public.chat_message_realtime_broadcast() RETURNS trigger AS $$
DECLARE
  v_shop_id TEXT;
BEGIN
  -- UPDATE ที่ deliveryStatus ไม่ได้เปลี่ยนจริง → ไม่ต้องรบกวน client
  IF TG_OP = 'UPDATE' AND NEW."deliveryStatus" IS NOT DISTINCT FROM OLD."deliveryStatus" THEN
    RETURN NEW;
  END IF;

  -- channel 1: per-conversation — signal เฉพาะ id ไม่ฝัง body/imageUrl (PII)
  PERFORM realtime.send(
    jsonb_build_object(
      'conversationId', NEW."conversationId",
      'messageId', NEW.id
    ),
    'update', 'chat:' || NEW."conversationId", false
  );

  -- channel 2: shop-wide — เฉพาะข้อความ "ใหม่" จาก BUYER เท่านั้น (ห้ามยิงตอน UPDATE)
  IF TG_OP = 'INSERT' AND NEW."senderRole" = 'BUYER' THEN
    SELECT "shopId" INTO v_shop_id FROM "Conversation" WHERE id = NEW."conversationId";

    IF v_shop_id IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('conversationId', NEW."conversationId"),
        'new_message', 'chat:shop:' || v_shop_id, false
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- fail-safe: Realtime ล่มต้องไม่ rollback การเขียนหลัก
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_message_realtime_broadcast_trigger ON "ChatMessage";

CREATE TRIGGER chat_message_realtime_broadcast_trigger
  AFTER INSERT OR UPDATE OF "deliveryStatus" ON "ChatMessage"
  FOR EACH ROW EXECUTE FUNCTION public.chat_message_realtime_broadcast();

-- ROLLBACK NOTE: re-apply เนื้อไฟล์ 20260703000400_chat_realtime_broadcast/migration.sql
-- (function + trigger เวอร์ชัน AFTER INSERT) — ไม่มี data loss
```

- [ ] **Step 2: apply + ยืนยันว่า trigger ผูกกับ UPDATE จริง**

```bash
DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" npx prisma migrate deploy
DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
  npx prisma db execute --stdin <<'SQL'
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'chat_message_realtime_broadcast_trigger';
SQL
```
Expected: output มีทั้ง `INSERT` และ `UPDATE OF "deliveryStatus"`

- [ ] **Step 3: Commit**

```bash
git add prisma/migrations/20260823110000_chat_broadcast_on_status_update/
git commit -m "fix(chat): broadcast ตอนสถานะการส่งเปลี่ยนด้วย ไม่ใช่แค่ตอน INSERT"
```

---

### Task 5: แตก "การยิงออกช่องทาง" ออกจาก "การเขียน DB" (refactor ไม่เปลี่ยนพฤติกรรม)

Task นี้ต้อง **ไม่เปลี่ยนพฤติกรรมอะไรเลยแม้แต่นิดเดียว** — มีไว้เพื่อให้เส้นทางคิวกับผู้เรียกเดิม 8 ที่ใช้โค้ดยิงตัวเดียวกัน (HR16) ไม่ใช่โค้ดสองชุดที่ค่อย ๆ ห่างกัน

**Files:**
- Modify: `src/services/channel-chat.service.ts`

**Interfaces:**
- Consumes: —
- Produces (export จาก `channel-chat.service.ts`):
```ts
export type TransmitResult = {
  /** mid ที่ปลายทางคืนมา — null = ยิงไม่ผ่าน */
  externalMessageId: string | null
  /** สิ่งที่ปลายทางตอบกลับ (ลง rawMessage source='outbound-response') */
  outboundResponse: unknown
  /** null = สำเร็จ | ข้อความดิบของปลายทาง = ล้มเหลว */
  failureReason: string | null
  /** LINE เท่านั้น */
  sendMethod: 'REPLY' | 'PUSH' | null
  sendBatchId: string | null
}

/** ยิงออกช่องทางอย่างเดียว — **ไม่แตะ DB ของ ChatMessage เลย** */
export async function transmitOutbound(
  conversation: OutboundConversation,
  params: SendOutboundParams,
): Promise<TransmitResult>

/** ด่านก่อนส่ง (ownership/ช่องทาง) — โยน error ชุดเดิมทุกตัว */
export async function resolveOutboundContext(
  params: Pick<SendOutboundParams, 'conversationId' | 'actorUserId' | 'systemShopId'>,
): Promise<OutboundConversation>
```

- [ ] **Step 1: ยกพารามิเตอร์ของ `sendOutboundMessage` เป็น type ที่ตั้งชื่อได้**

`sendOutboundMessage` ประกาศพารามิเตอร์เป็น object literal inline (ยาว ~90 บรรทัด) — ยกทั้งก้อนออกมาเป็น `export type SendOutboundParams = { ... }` **โดยไม่แก้เนื้อในสักตัวอักษร** แล้วให้ `sendOutboundMessage(params: SendOutboundParams)`

Run: `npx tsc --noEmit`
Expected: 0 errors (ถ้ามี error แปลว่าคัดลอกตกไปหนึ่งฟิลด์ ให้แก้ก่อนไปต่อ)

- [ ] **Step 2: ยกด่านหัวฟังก์ชันออกมาเป็น `resolveOutboundContext`**

ยกตั้งแต่ `prisma.conversation.findUnique` จนถึงจบบล็อก `canAccessShop` (`channel-chat.service.ts:3556-3583`) ออกมา คืน `conversation` ที่ narrow แล้ว — **error ทุกตัวต้องคงชื่อเดิมเป๊ะ**: `CONVERSATION_NOT_FOUND` `NOT_EXTERNAL_CHANNEL` `FORBIDDEN` `INVALID_ACTOR`

จากนั้น `sendOutboundMessage` เรียกตัวนี้แทนโค้ดเดิม

- [ ] **Step 3: ยกบล็อกยิงของ Meta ออกมาเป็น `transmitMetaMessage`**

ยก `try { ... } catch { ... }` ที่ครอบ `adapter.sendMessages` (`channel-chat.service.ts:3648-3730` โดยประมาณ รวม retry-แบบ-ไม่-quote ที่มีอยู่เดิม) ออกมาเป็นฟังก์ชันที่คืน `TransmitResult`

🛑 **การ retry ตัดเฉพาะ reply_to ที่มีอยู่เดิมไม่ใช่ auto-retry ที่สเปกห้าม** — มันคือการยิงครั้งเดียวที่ถอย option ลง ไม่ใช่การยิงข้อความเดิมซ้ำหลังล้มเหลว **ห้ามถอดออก**

- [ ] **Step 4: ทำแบบเดียวกันกับ LINE**

ยกบล็อกยิงใน `sendOutboundLineMessage` ออกมาเป็น `transmitLineMessage` คืน `TransmitResult` (ตัวนี้เป็นตัวที่เติม `sendMethod`/`sendBatchId`)

แล้วเขียน `transmitOutbound` เป็นตัวเลือกทาง: `conversation.channel === 'LINE' ? transmitLineMessage(...) : transmitMetaMessage(...)`

- [ ] **Step 5: พิสูจน์ว่าไม่มีอะไรเปลี่ยน**

```bash
npx tsc --noEmit
npx vitest run src/
```
Expected: tsc 0 errors · เทสที่เคยเขียวยังเขียวครบจำนวนเดิม

🛑 **ต้องจดจำนวนเทสที่ผ่าน "ก่อน" เริ่ม Task นี้ไว้เทียบ** — รีโปนี้เคยมีเทสแดงค้างเป็นร้อยข้อจากเหตุอื่น การดูแค่ "แดงกี่ข้อ" หลังแก้จึงไม่บอกอะไร ต้องเทียบกับเลขก่อนหน้า

- [ ] **Step 6: Commit**

```bash
git add src/services/channel-chat.service.ts
git commit -m "refactor(chat): แยก 'ยิงออกช่องทาง' ออกจาก 'เขียน DB' — เตรียมให้คิวใช้ตัวยิงตัวเดียวกัน"
```

---

### Task 6: `chat-outbox.service.ts` — วงจรชีวิตของแถวคิว

**Files:**
- Create: `src/services/chat-outbox.service.ts`
- Test: `src/services/__tests__/chat-outbox.service.test.ts`

**Interfaces:**
- Consumes: `chat-send-queue.ts` (Task 2) · `transmitOutbound` / `resolveOutboundContext` / `SendOutboundParams` (Task 5)
- Produces:
```ts
/** เขียนแถว QUEUED + อัปเดต snapshot ของห้อง ในทรานแซกชันเดียว — คืนแถวที่เพิ่งสร้าง */
export async function enqueueOutbound(params: SendOutboundParams): Promise<ChatMessage>

/** หยิบหัวคิวของห้องหนึ่ง แล้วยิงครั้งเดียว — คืนจำนวนแถวที่เปลี่ยนสถานะ (0 หรือ 1) */
export async function deliverRoom(conversationId: string, owner: ClaimOwner): Promise<number>

/** กวาดทุกห้องที่มีแถวค้าง — คืนสรุปไว้ให้ cron/log อ่าน */
export async function sweepOutbox(opts: { owner: ClaimOwner; limit?: number }): Promise<{
  rooms: number; sent: number; failed: number; stale: number
}>
```

- [ ] **Step 1: เขียนเทสที่ต้องแดง**

Create `src/services/__tests__/chat-outbox.service.test.ts`:

```ts
// chat-outbox.service.test.ts — [blocker] วงจรชีวิตของแถวคิวส่งข้อความ
//
// 🛑 มีเทสหนึ่งข้อที่ **ห้าม mock ตัวยิงทิ้ง** (ข้อสุดท้าย) — บทเรียน 00038: เทสที่ mock
// เพื่อนบ้านทิ้งทั้งตัวจะเขียวตลอดไม่ว่าเพื่อนบ้านทำอะไร รวมถึงกรณีที่ไม่เคยถูกเรียกเลย

import { describe, expect, it, vi, beforeEach } from 'vitest'

const transmitOutbound = vi.fn()
const resolveOutboundContext = vi.fn()
vi.mock('@/services/channel-chat.service', () => ({
  transmitOutbound: (...a: unknown[]) => transmitOutbound(...a),
  resolveOutboundContext: (...a: unknown[]) => resolveOutboundContext(...a),
}))

const updateMany = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMessage: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}))

const { deliverRoom } = await import('../chat-outbox.service')

beforeEach(() => {
  transmitOutbound.mockReset()
  resolveOutboundContext.mockReset()
  updateMany.mockReset()
  findMany.mockReset()
  update.mockReset()
  resolveOutboundContext.mockResolvedValue({ id: 'c1', channel: 'MESSENGER', shopId: 's1' })
})

const queued = (o: Record<string, unknown> = {}) => ({
  id: 'm1',
  conversationId: 'c1',
  createdAt: new Date('2026-08-23T10:00:00Z'),
  deliveryStatus: 'QUEUED',
  sendLockedAt: null,
  sendPayload: {},
  body: 'สวัสดีครับ',
  ...o,
})

describe('deliverRoom', () => {
  it('[blocker] claim ด้วยเงื่อนไข sendLockedAt: null เสมอ — นี่คือสิ่งเดียวที่กันข้อความซ้ำ', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      externalMessageId: 'mid_1', outboundResponse: {}, failureReason: null, sendMethod: null, sendBatchId: null,
    })

    await deliverRoom('c1', 'after')

    const claimArgs = updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(claimArgs.where).toMatchObject({ id: 'm1', sendLockedAt: null })
  })

  it('[blocker] claim ไม่ติด (คนอื่นชิงไปแล้ว) → ต้องไม่ยิงเลย', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 0 })

    await deliverRoom('c1', 'cron')

    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ยิงสำเร็จ → เขียน SENT + mid และ **ไม่เคลียร์ sendLockedBy** (ตัววัด)', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      externalMessageId: 'mid_1', outboundResponse: { ok: true }, failureReason: null, sendMethod: null, sendBatchId: null,
    })

    await deliverRoom('c1', 'cron')

    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'SENT', externalMessageId: 'mid_1' })
    expect(data).not.toHaveProperty('sendLockedBy', null)
  })

  it('[blocker] ปลายทางปฏิเสธ → FAILED + failureReason ดิบ และห้ามยิงซ้ำในรอบเดียวกัน', async () => {
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      externalMessageId: null, outboundResponse: {}, failureReason: '(#10) outside of allowed window',
      sendMethod: null, sendBatchId: null,
    })

    await deliverRoom('c1', 'after')

    expect(transmitOutbound).toHaveBeenCalledTimes(1)
    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ deliveryStatus: 'FAILED', failureReason: '(#10) outside of allowed window' })
  })

  it('[blocker] หัวคิวถูก claim ค้างอยู่ → ห้ามข้ามไปยิงใบถัดไป', async () => {
    findMany.mockResolvedValue([
      queued({ id: 'head', sendLockedAt: new Date('2026-08-23T10:00:01Z') }),
      queued({ id: 'next', createdAt: new Date('2026-08-23T10:00:05Z') }),
    ])

    await deliverRoom('c1', 'cron')

    expect(transmitOutbound).not.toHaveBeenCalled()
  })

  it('[blocker] ตัวยิงถูกเรียกจริง ด้วย conversation ที่ resolve มา — ไม่ใช่แค่ไม่พัง', async () => {
    // ข้อนี้จงใจตรวจ "ถูกเรียกจริงไหม" ไม่ใช่ "ผลลัพธ์ถูกไหม" — เทสที่ mock ตัวยิงทิ้งแล้วดูแต่
    // ผลลัพธ์จะเขียวเท่ากันทั้งกรณีที่เรียกและกรณีที่ลืมเรียก (บทเรียน 00038)
    findMany.mockResolvedValue([queued()])
    updateMany.mockResolvedValue({ count: 1 })
    transmitOutbound.mockResolvedValue({
      externalMessageId: 'mid_1', outboundResponse: {}, failureReason: null, sendMethod: null, sendBatchId: null,
    })

    await deliverRoom('c1', 'after')

    expect(transmitOutbound).toHaveBeenCalledTimes(1)
    expect(transmitOutbound.mock.calls[0][0]).toMatchObject({ id: 'c1' })
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run src/services/__tests__/chat-outbox.service.test.ts`
Expected: FAIL — `Failed to resolve import "../chat-outbox.service"`

- [ ] **Step 3: เขียน implementation**

Create `src/services/chat-outbox.service.ts` โดยยึดกติกาเหล่านี้:

1. `enqueueOutbound(params)` — เรียก `resolveOutboundContext` (ด่านเดิมทุกตัว) แล้วเขียนแถวใน `prisma.$transaction` เดียวกับการอัปเดต `Conversation` snapshot **ยกตรรกะการประกอบ `type`/`body`/`preview` มาจาก `sendOutboundMessage` ตัวเดิมทั้งหมด อย่าเขียนใหม่** ต่างกันแค่ 3 ฟิลด์:
   - `deliveryStatus: 'QUEUED'` · `externalMessageId: null` · `sendPayload: { sticker, template, flex, messageTag }`
2. `deliverRoom(conversationId, owner)`:
   - `findMany` แถว `deliveryStatus='QUEUED'` ของห้องนั้น เรียง `createdAt asc`
   - หา `headOfRoom(rows)` — ได้ `null` ก็จบ (คืน 0)
   - claim: `updateMany({ where: { id: head.id, sendLockedAt: null }, data: { sendLockedAt: new Date(), sendLockedBy: owner } })` → `count === 0` แปลว่าแพ้ race **จบทันที ห้ามยิง**
   - `transmitOutbound(conversation, paramsFromRow)` **ครั้งเดียว**
   - `update` แถวเป็น `SENT` (+`externalMessageId`, `rawMessage`, `sendPayload: null`) หรือ `FAILED` (+`failureReason`)
3. `sweepOutbox({ owner, limit })`:
   - หา `conversationId` ที่มีแถว QUEUED (`groupBy` หรือ `findMany` + `distinct`) จำกัด `limit ?? 50`
   - ปิดแถวที่ `isStaleClaim` เป็น `FAILED` + `UNCERTAIN_SEND_REASON` **ก่อน** แล้วค่อย `deliverRoom` ทีละห้อง
   - 🛑 จำกัด concurrency **ต่อ `shopChannelId`** ไม่ใช่ต่อรอบ (spec E-8) — ห้องหลายห้องของเพจเดียวกันยิงพร้อมกันจะโดน rate limit ของ Meta

🛑 `sendPayload` ที่อ่านไม่ออก (deploy เก่า/ใหม่คนละ shape) ต้องปิดแถวเป็น `FAILED` **ห้าม throw ทั้ง worker** (spec E-7)

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run src/services/__tests__/chat-outbox.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: mutation — 3 แบบ**

| # | แก้ที่ | เปลี่ยนเป็น | เทสที่ต้องแดง |
|---|---|---|---|
| M1 | เงื่อนไข claim | ถอด `sendLockedAt: null` ออกจาก `where` | "claim ด้วยเงื่อนไข sendLockedAt: null เสมอ" |
| M2 | หลัง claim | ไม่เช็ค `count === 0` (ยิงต่อเลย) | "claim ไม่ติด → ต้องไม่ยิงเลย" |
| M3 | `deliverRoom` | ใช้ `rows[0]` แทน `headOfRoom(rows)` | "หัวคิวถูก claim ค้างอยู่ → ห้ามข้ามไปยิงใบถัดไป" |

- [ ] **Step 6: Commit**

```bash
git add src/services/chat-outbox.service.ts src/services/__tests__/chat-outbox.service.test.ts
git commit -m "feat(chat): วงจรชีวิตแถวคิว — enqueue/deliverRoom/sweepOutbox ยิงครั้งเดียวต่อแถว"
```

---

### Task 7: route POST — เข้าคิวแล้วตอบทันที

**Files:**
- Modify: `src/app/api/chat/conversations/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `enqueueOutbound` / `deliverRoom` (Task 6)
- Produces: `202` + แถว `QUEUED` ให้ client (Task 8 ใช้)

- [ ] **Step 1: เปลี่ยนจุดเรียกช่องทางนอกทั้ง 5 จุด**

ในบล็อกช่องทางนอก (`route.ts:876-1095`) เปลี่ยน `await sendOutboundMessage({...})` เป็น `await enqueueOutbound({...})` **โดยไม่แตะพารามิเตอร์** แล้วปิดท้ายด้วย:

```ts
// ยิงจริงเบื้องหลัง — ชั้น 1 ของ 3 ชั้น (ดู EXTENSIONS-2026-08-23-outbound-queue.md)
// ตัวการันตีคือ cron ไม่ใช่บรรทัดนี้: แถวถูกเขียนลง DB ไปแล้วก่อน response ออกจากฟังก์ชัน
// ต่อให้ after() ไม่ได้รัน (ผู้ขายปิดแอปจน connection ขาด) cron จะเก็บให้ภายใน 1 นาที
after(deliverRoom(id, 'after'))
return NextResponse.json(await withSender(queued, userId), { status: 202 })
```

- [ ] **Step 2: จัดการ `IMAGE_GRID` และการ์ดหลายชุด**

เส้นทางที่เดิมวนยิงหลายก้อนแล้วรวมเป็น `{ ok, items, partialError }`: เปลี่ยนเป็นสร้างหลายแถว QUEUED เรียงกัน แล้วคืน `{ ok: true, items }` — **`partialError` หายไป** เพราะยังไม่มีอะไรล้มให้รายงาน สถานะย้ายไปอยู่รายแถวแทน (spec E-12)

- [ ] **Step 3: caption ที่ตามหลังไฟล์แนบต้องเป็นแถวคิวของตัวเอง**

เดิมเป็น `await adapter.sendMessages(...).catch(() => {})` = หายเงียบ (spec E-13) — ในเส้นทางคิวให้ `enqueueOutbound` แถว TEXT ต่อท้ายแทน ผู้ขายจะได้เห็นถ้ามันล้ม

- [ ] **Step 4: `isDuplicateProductSend` ต้องนับ QUEUED เป็น "กำลังส่ง"**

`src/lib/chat-product-resend.ts` — `QUEUED` = **บล็อก** (กันดับเบิลคลิก) · `SENT` = บล็อก · `FAILED` = **ไม่บล็อก** (คงเจตนาเดิมของไฟล์: ด่านกันซ้ำที่บล็อกการกู้คืน แย่กว่าไม่มีด่าน) เพิ่มเทสในไฟล์เทสเดิมของมัน 2 เคส

- [ ] **Step 5: ยืนยันว่า client เช็ค `res.ok` ไม่ใช่ `=== 200`**

```bash
rg "status === 200|status !== 200" src/app/\(paces\)/seller/ src/app/api/chat/
```
Expected: ไม่มีผลลัพธ์ที่ผูกกับ endpoint นี้ — **ถ้ามี ต้องแก้ที่นั่นก่อน ห้ามเปลี่ยนเป็น 202 แล้วปล่อย**

- [ ] **Step 6: verify + commit**

```bash
npx tsc --noEmit && npx vitest run src/
git add "src/app/api/chat/conversations/[id]/messages/route.ts" src/lib/chat-product-resend.ts src/lib/__tests__/chat-product-resend.test.ts
git commit -m "feat(chat): POST เขียนคิวแล้วตอบ 202 ทันที — ยิงจริงใน after()"
```

---

### Task 8: จอผู้ขาย — เลิกโกหกว่า "ส่งแล้ว"

🛑 **Hard Rule 8: invoke `safepay-ux` ให้ออก Design Spec ก่อนแก้โค้ดบรรทัดแรกของ Task นี้**

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts`
- Modify: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx`
- Modify: type ของ `deliveryStatus` (`ChatMessageWithDelivery`)

**Interfaces:**
- Consumes: `202` + แถว QUEUED (Task 7)
- Produces: —

- [ ] **Step 1: ขยาย type union ให้ `tsc` เป็นคนบังคับ**

```ts
export type ChatDeliveryStatus = 'QUEUED' | 'SENT' | 'FAILED' | null
```
ใช้แทน `string | null` ทุกที่ที่อ่านค่านี้ — **นี่คือด่านหลัก** เพราะ grep จับ object key ไม่ได้ (`docs/conventions/enum-value-removal.md`)

- [ ] **Step 2: grep ทั้ง repo ไม่ใช่แค่ `src/`**

```bash
rg -n "deliveryStatus" src/ e2e/ scripts/ prisma/ docs/
```
ไล่ทุก hit แล้วตอบให้ได้ว่า "ค่า `QUEUED` มาถึงบรรทัดนี้แล้วเกิดอะไร" — จุดที่เขียน `=== 'FAILED'` หรือ `!== 'FAILED'` คือจุดเสี่ยงทั้งหมด

- [ ] **Step 3: `postMessage` ต้องไม่ตั้ง `_status: 'sent'` อีก**

```ts
// (CR 2026-08-23) เดิมเขียน `_status: 'sent'` ทับบับเบิล optimistic ทันทีที่ POST ตอบกลับ
// พอ POST เปลี่ยนความหมายเป็น "เข้าคิวแล้ว" บรรทัดนั้นจะกลายเป็นเช็คถูกบนข้อความที่ยังไม่ออก
// = บั๊กที่ CR นี้ตั้งใจแก้ เป๊ะ ๆ. สถานะที่แท้จริงอยู่ที่ `deliveryStatus` ของแถว ให้ ChatThread
// อ่านจากที่นั่นที่เดียว (SSOT)
return deduped.map((m) => (m.id === localId ? { ...real, _status: undefined } : m))
```

และเพิ่ม `keepalive: true` ใน `fetch` ของ `postMessage` — แพตเทิร์นเดียวกับ `src/app/(marketing)/o/[token]/AuthPingLink.tsx:39` ("ต้องส่งให้จบแม้หน้ากำลังจะถูกเปลี่ยน")

- [ ] **Step 4: `ChatThread` เรนเดอร์ QUEUED**

```ts
// QUEUED = ยังไม่ออกจากระบบเรา — ต้องอ่านว่า "กำลังส่ง" เหมือนบับเบิล optimistic ทุกประการ
// ใช้คำ/ไอคอนชุดเดิม ไม่ตั้งคำใหม่ (ผู้ขายไม่ต้องรู้ว่าข้างในมีคิว)
const queuedPersisted = mExt.deliveryStatus === 'QUEUED'
const sending = mine && (m._status === 'sending' || queuedPersisted)
```
แล้วใช้ `sending` แทน `m._status === 'sending'` ทุกจุด (`showTime`, meta row, ตัวบ่งชี้สถานะ) · `lastShopMsgId` ต้องไม่ตกเป็นแถว QUEUED · ปุ่ม "ตอบกลับ"/รีแอ็กชัน/unsend ต้องปิดสำหรับแถว QUEUED (spec E-10 — ยังไม่มี mid ให้อ้าง)

- [ ] **Step 5: verify + impeccable gate**

```bash
npx tsc --noEmit && npx vitest run src/
bash scripts/theme-guard.sh   # ถ้ามีในรีโป
```
แล้วรัน `/impeccable critique` และ `/impeccable clarify` — **เป็น gate ก่อน mark complete ไม่ใช่ทางเลือก** (HR8)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts" "src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx"
git commit -m "fix(chat): แถวที่ยังอยู่ในคิวต้องขึ้น 'กำลังส่ง' ไม่ใช่เช็คถูก

Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/"
```

---

### Task 9: Push ตอนล้มถาวร

**Files:**
- Modify: `src/services/seller-push.service.ts`
- Modify: `src/services/chat-outbox.service.ts` (เรียกตอนเขียน FAILED)
- Test: `src/services/__tests__/seller-push.service.test.ts`

**Interfaces:**
- Consumes: `describeSendFailure` (`src/lib/chat-send-failure.ts`) · `shopAudience` (ในไฟล์เดียวกัน)
- Produces: `export async function pushChatSendFailed(params: { shopId: string; conversationId: string; failureReason: string | null }): Promise<void>`

- [ ] **Step 1: เขียนเทสที่ต้องแดง**

```ts
it('[blocker] throttle key ต้องไม่ชนกับ noti ข้อความใหม่', async () => {
  // ถ้าใช้ key เดียวกัน (`chat:${conversationId}`) noti "ส่งไม่สำเร็จ" จะถูกกลืนทุกครั้งที่
  // ห้องเดียวกันเพิ่งมีข้อความลูกค้าเข้ามา — ซึ่งเป็นสถานการณ์ปกติที่สุดของการคุยแชท
  // (คลาสเดียวกับ log-row-collides-with-the-guard-it-explains.md)
  await pushNewChatMessage({ shopId: 's1', conversationId: 'c1' })
  await pushChatSendFailed({ shopId: 's1', conversationId: 'c1', failureReason: '(#551) blocked' })
  expect(pushToUsers).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: รันให้แดง · Step 3: implement**

`pushChatSendFailed` ใช้ throttle key `chat-send-failed:${conversationId}` (คนละ namespace) · ข้อความจาก `describeSendFailure(failureReason).text` **ไม่พิมพ์คำใหม่** (HR16) · ผ่าน `shopAudience()` เพื่อเคารพสวิตช์ปิดแจ้งเตือนรายร้าน · `title` = ชื่อเพจ ตามลำดับ 3 บรรทัดเดิมของโปรเจกต์

- [ ] **Step 4: รันให้เขียว · Step 5: mutation**

M1: เปลี่ยน throttle key กลับเป็น `chat:${conversationId}` → เทส Step 1 ต้องแดง

- [ ] **Step 6: Commit**

```bash
git add src/services/seller-push.service.ts src/services/chat-outbox.service.ts src/services/__tests__/seller-push.service.test.ts
git commit -m "feat(chat): แจ้งเตือนเข้าแอปเมื่อข้อความส่งไม่ออก — throttle key แยกจาก noti ข้อความใหม่"
```

---

### Task 10: ตัวกวาด — cron (ชั้น 3) + opportunistic (ชั้น 2)

**Files:**
- Create: `src/app/api/cron/chat-outbox/route.ts`
- Modify: `vercel.json`
- Modify: webhook route ของ Meta/LINE (จุดที่จบการ ingest)

**Interfaces:**
- Consumes: `sweepOutbox` (Task 6)
- Produces: —

- [ ] **Step 1: cron route**

ยึดแพตเทิร์น auth จาก `src/app/api/cron/auto-reply-sweeper/route.ts` เป๊ะ ๆ:

```ts
export const maxDuration = 60

export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามปล่อยให้เทียบกับ "Bearer undefined" แล้วผ่าน
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await sweepOutbox({ owner: 'cron', limit: 50 })
  // 🛑 log ตัวเลขเสมอ: `stale` ที่สูงผิดปกติแปลว่ามีคนตายกลางทางบ่อย ซึ่งเป็นสัญญาณของบั๊กชั้นบน
  console.log('[chat-outbox]', JSON.stringify(result))
  return NextResponse.json(result)
}
```

- [ ] **Step 2: `vercel.json`**

```json
{ "path": "/api/cron/chat-outbox", "schedule": "* * * * *" }
```
ถ้าแพลนไม่ให้ทุกนาที ให้ถอยเป็น `*/2 * * * *` **แล้วขยับ `STALE_CLAIM_MS` เป็น 5 นาที** ให้สอดคล้องกัน (spec D-8)

- [ ] **Step 3: opportunistic sweep**

ที่ท้ายการ ingest webhook ของร้านนั้น เพิ่ม `after(sweepOutbox({ owner: 'sweep', limit: 10 }))` — best-effort กลืน error เสมอ **ห้าม throw** ไม่งั้น Meta จะ retry ทั้ง batch แล้วข้อความขาเข้าค้าง (แพตเทิร์นเดิมของ `pushNewChatMessage`)

- [ ] **Step 4: verify + commit**

```bash
npx tsc --noEmit && npx vitest run src/ && npm run build
git add src/app/api/cron/chat-outbox/route.ts vercel.json
git commit -m "feat(chat): ตัวกวาดคิว — cron ทุก 1 นาที + กวาดฉวยโอกาสตอน webhook เข้า"
```

---

### Task 11: ปิดงาน — verify เต็ม + rebase + ตัววัด

**Files:** —

- [ ] **Step 1: rebase ก่อน verify (HR17)**

```bash
git fetch origin
git rebase origin/main
comm -12 <(git diff --name-only origin/main...HEAD | sort) <(git diff --name-only HEAD...origin/main | sort)
```
🛑 **ถ้าผลลัพธ์ไม่ว่าง** = มีไฟล์ที่ทั้งสองฝั่งแตะ ⇒ `git log -p HEAD...origin/main -- <ไฟล์>` อ่าน diff ของอีกฝั่งก่อน **rebase ที่ผ่านสะอาดไม่ใช่หลักฐานว่าปลอดภัย**

- [ ] **Step 2: verify หลัง rebase เท่านั้น**

```bash
npx prisma generate   # Prisma client ค้างเวอร์ชันเก่าหลัง rebase = build ล้มโดยไม่มีเหตุผลที่เกี่ยว
npx tsc --noEmit
npx vitest run src/
npm run build
```
Expected: tsc 0 · เทสเขียวเท่ากับหรือมากกว่าเลขที่จดไว้ตอน Task 5 · build exit code 0

- [ ] **Step 3: เช็ค fast-forward ซ้ำแล้วค่อย push (แยกคำสั่ง)**

```bash
git fetch origin && git status -sb | head -1
```
ถ้ามีคน push แทรกระหว่าง build → กลับไป Step 1

- [ ] **Step 4: แจ้ง user 3 ข้อของ HR15 ก่อน push**

(1) prod ไม่ต้องสั่ง migrate เอง — push แล้ว `vercel.json` รัน `prisma migrate deploy` ให้
(2) ฐาน local apply แล้วตั้งแต่ Task 3/4
(3) migrate ล้ม = build ล้ม = deploy ไม่ขึ้น ของเก่ายังเสิร์ฟอยู่ — ต้องแก้ไฟล์ migration แล้ว push ใหม่ ไม่ใช่กด retry deploy

- [ ] **Step 5: หลัง deploy — รัน query ตัววัด (นี่คือ feedback loop ตัวจริงของบั๊กต้นเรื่อง)**

```sql
select "sendLockedBy", count(*)
from "ChatMessage"
where "deliveryStatus" = 'SENT' and "createdAt" > now() - interval '2 days'
group by 1;
```

| ผลลัพธ์ | แปลว่า | ทำอะไรต่อ |
|---|---|---|
| `sweep`/`cron` > 0 | บั๊กเดิมคือกลไก B/C จริง งานนี้แก้ตรงจุด | รายงานตัวเลขให้ user |
| `sweep`/`cron` ≈ 0 แต่ยังมีคนบ่น | เป็นกลไก A (Meta รับแล้วดรอป) | **ห้ามปิดเคส** ต้องกลับไปที่ diagnosing-bugs ด้วยข้อมูลใหม่ |

🛑 **ห้ามเขียนที่ไหนว่า "แก้บั๊กแล้ว" จนกว่าตัวเลขนี้จะออก** — `tsc`/build/เทสเขียว ไม่ใช่หลักฐานว่าอาการที่ผู้ขายเจอหายไป

---

## Self-Review

**1. Spec coverage**

| spec | task |
|---|---|
| §3 D-1 (ChatMessage เป็นคิว) · D-8 (ตัวเลข) | Task 2, 3 |
| §5 data model + partial index | Task 3 |
| §5.1 ค่าที่ 3 ของ deliveryStatus | Task 8 Step 1-2 |
| §6 สัญญา API 202 | Task 7 |
| §7.1 จอ | Task 8 |
| §7.2 realtime trigger | Task 4 |
| §7.3 push | Task 9 |
| §8 E-1 (claim ค้าง) | Task 2 (`UNCERTAIN_SEND_REASON`), Task 6 (`sweepOutbox`) |
| §8 E-7 (sendPayload shape เก่า) | Task 6 Step 3 |
| §8 E-8 (rate limit ต่อเพจ) | Task 6 Step 3 |
| §8 E-10 (unsend/react บน QUEUED) | Task 8 Step 4 |
| §8 E-11 (ดับเบิลคลิกการ์ด) | Task 7 Step 4 |
| §8 E-12 (IMAGE_GRID) | Task 7 Step 2 |
| §8 E-13 (caption เงียบ) | Task 7 Step 3 |
| §9 ตัววัด | Task 11 Step 5 |
| HR11 เอกสาร + SRS | Task 1 |

**2. Placeholder scan** — ไม่มี TBD/TODO; ทุก step ที่ต้องมีโค้ดมีโค้ดจริง; ขั้นตอน refactor (Task 5) ระบุเลขบรรทัดต้นทางและชื่อ error ที่ต้องคงไว้แทนการวางโค้ดทั้งก้อน เพราะเป็นการ **ย้าย** โค้ดที่มีอยู่ ไม่ใช่การเขียนใหม่

**3. Type consistency** — `QueueRow`/`ClaimOwner` (Task 2) ถูกใช้ชื่อเดียวกันใน Task 6 · `TransmitResult` (Task 5) ตรงกับที่ Task 6 mock · `ChatDeliveryStatus` (Task 8) ครอบค่าเดียวกับที่ Task 3 เขียนใน schema comment · `sendLockedBy` ใช้ค่า `'after' | 'sweep' | 'cron'` เหมือนกันทั้ง Task 2/6/10/11
