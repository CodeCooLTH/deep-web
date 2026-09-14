# ห้องแชทเปิดแล้วเห็นทันที ไม่โหลดซ้ำ ไม่เด้ง — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้การเปิดห้องแชทฝั่งผู้ขายแสดงข้อความทันทีโดยไม่มี loading ไม่กระพริบ ไม่เด้ง และเลิกดึงข้อความ 30 ใบทั้งก้อนซ้ำทุก 6 วินาที

**Architecture:** ย้ายความจริงฝั่งจอจาก "state ใน hook ที่ถูกแทนที่ทุกรอบ fetch" ไปเป็น **store กลางต่อห้อง** ที่ทุกแหล่ง (RSC seed / delta / realtime / optimistic) เขียนแบบ **เติม** เท่านั้น · API เปลี่ยนจาก "ดึงหน้าแรก 30 ใบ" เป็น **delta สองแกน** (`seq` = ใบใหม่, `updatedAt` = ใบเก่าที่ค่าเปลี่ยน) · backfill จาก Meta ไล่ cursor ย้อนถึง `Conversation.createdAt` ครั้งเดียวแล้วปักธง

**Tech Stack:** Next.js 16 (App Router) · TypeScript strict · Prisma + PostgreSQL 16 · Valibot (backend validation) · Vitest (`environment: node`, ไม่มี jsdom) · Supabase Realtime (broadcast) · Paces/Preline (UI)

**Spec:** `docs/superpowers/specs/2026-09-14-chat-instant-render-and-delta-design.md`

## Global Constraints

- **HR13/HR14** — ห้ามคำสั่งลบข้อมูลแบบไม่ scope ในไฟล์เทส · คำสั่งที่ล้าง/สร้าง schema ต้องปักหมุด URL localhost ในคำสั่งตรง ๆ ⇒ migrate ฐาน local ใช้ `npm run db:local:migrate` เท่านั้น (script นี้ปักหมุด `postgresql://safepay:safepay@localhost:5434/safepay` ไว้แล้ว)
- **HR15** — push ขึ้น `main` = `prisma migrate deploy` รันบน prod อัตโนมัติ (`vercel.json`) ห้ามสั่ง migrate ชี้ prod ด้วยมือ และต้องแจ้ง user ทุกครั้งที่จะ migrate
- **HR8** — งาน UI ทุกชิ้นต้องผ่าน `safepay-ux` ก่อนเขียนโค้ด และ Controller ต้องรัน `/impeccable critique` + `/impeccable clarify` เป็น gate ก่อน mark complete (มีผลกับ Task 7 เท่านั้น)
- **HR12** — ห้าม emoji ใน UI · จุดที่ควรมี icon แต่สเปกไม่ระบุตัว **ต้องถาม user ก่อน ห้ามเดา**
- **HR16** — ศัพท์/คำ/สูตรเดียวกันต้องมีนิยามเดียว วางติดกันในไฟล์เดียวกัน
- **HR17** — verify (tsc/test/build) ต้องอยู่ **หลัง** rebase เสมอ และเช็ค fast-forward ซ้ำก่อน push แยกคำสั่ง
- **เอกสาร/คอมเมนต์/commit body = ภาษาไทย** ยกเว้น path, ชื่อฟังก์ชัน, ชื่อไลบรารี, technical jargon
- **วันที่/เวลาบนจอ** ต้องผ่าน `src/lib/format-date.ts` เท่านั้น ห้ามเรียก `Intl`/`toLocaleDateString` เอง
- **เทสที่ติดป้าย `[blocker]` ต้องพิสูจน์ด้วย mutation** — คืนตรรกะผิดกลับไปแล้วต้องแดง ถ้าเขียว = ชุด input อ่อน ให้เติม input แล้วรันซ้ำจนแดง
- **ลำดับข้อความยึด `[createdAt asc, seq asc]` ที่เดียวทั้งระบบ** (ตรงกับ `orderBy` ใน `chat.service.ts:687`)
- คำสั่งรันเทสแบบครั้งเดียว: `npx vitest run <path>` (คำสั่ง `npm test` เป็น watch mode)

---

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `prisma/migrations/20260914150000_chat_message_updated_at/migration.sql` | เพิ่ม `ChatMessage.updatedAt` + index และ `Conversation.metaBackfilledAt` | 1 |
| `src/lib/__tests__/chat-message-no-raw-write.test.ts` | ด่านสแกนซอร์ส — ห้ามใครเขียน `ChatMessage` ด้วย raw SQL (ไม่งั้น `@updatedAt` หลุด) | 1 |
| `src/lib/chat-message-merge.ts` | **ฟังก์ชันบริสุทธิ์ล้วน** — merge/แทรกตามเวลา/รักษา object identity/cap | 2 |
| `src/lib/chat-message-store.ts` | store ระดับโมดูล (Map + LRU + TTL + ธง stale) — ใช้ merge จากไฟล์ข้างบน | 2 |
| `src/lib/validations.ts` | เพิ่ม `afterSeq` / `afterUpdatedAt` เข้า `ChatMessagesQuerySchema` | 3 |
| `src/services/chat.service.ts` | `getMessages()` รับโหมด delta | 3 |
| `src/services/chat-thread-messages.service.ts` | ส่งผ่านพารามิเตอร์ delta | 3 |
| `src/app/api/chat/conversations/[id]/messages/route.ts` | อ่านพารามิเตอร์ delta + ไม่ trigger backfill เมื่อเป็น delta | 3 |
| `src/lib/chat-thread-scroll.ts` | **ฟังก์ชันบริสุทธิ์** ของการตัดสินใจเรื่อง scroll (ตามเงื่อนไข "boolean ต้องมีที่ให้เทสจับ") | 4 |
| `src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts` | ต่อ store + delta + กฎ scroll + poll 12 วิ | 4 |
| `src/lib/inbox-row-patch.ts` | **ฟังก์ชันบริสุทธิ์** — patch แถวรายการโดยรักษา object identity | 5 |
| `src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx` | ใช้ `patchConversationRows` แทน `setItems(ก้อนใหม่)` | 5 |
| `src/lib/facebook/graph.ts` | `fetchThreadMessagesPage()` ที่อ่าน `paging` ได้จริง | 6 |
| `src/lib/meta-backfill-bound.ts` | **ฟังก์ชันบริสุทธิ์** — ตัดสินว่าหยุดไล่หน้าเมื่อไร และปักธงได้ไหม | 6 |
| `src/services/channel-chat.service.ts` | `syncMissingMessagesFromMeta` ไล่ cursor + ปักธง | 6 |
| `src/lib/meta-system-notice.ts` | `attributeMetaAi()` — ตัดสินว่าบับเบิลไหน Meta AI ตอบ | 7 |
| `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` | badge Meta AI + `title`/`aria-label` เวลาเต็มบนบับเบิล | 7 |
| `docs/20 - Features/00018 …/EXTENSIONS-2026-09-14.md` + `docs/SRS.md` | เอกสาร | 8 |

---

## Task 1: Migration — `ChatMessage.updatedAt` + `Conversation.metaBackfilledAt`

**Files:**
- Modify: `prisma/schema.prisma` (model `ChatMessage`, model `Conversation`)
- Create: `prisma/migrations/20260914150000_chat_message_updated_at/migration.sql`
- Create: `src/lib/__tests__/chat-message-no-raw-write.test.ts`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: คอลัมน์ `ChatMessage.updatedAt: DateTime` (ไม่เป็น null), index `ChatMessage_conversationId_updatedAt_idx`, คอลัมน์ `Conversation.metaBackfilledAt: DateTime?` — Task 3 และ Task 6 ใช้ต่อ

- [ ] **Step 1: เขียนด่านสแกนซอร์สก่อน (ด่านนี้คือเหตุผลที่ `@updatedAt` เชื่อถือได้)**

สร้าง `src/lib/__tests__/chat-message-no-raw-write.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'

/**
 * [blocker] `ChatMessage.updatedAt` เป็น `@updatedAt` ของ Prisma ⇒ Prisma เขียนให้เองทุก
 * `update`/`updateMany` **แต่ raw SQL ไม่ผ่าน Prisma** ถ้ามีใครเขียน `UPDATE "ChatMessage"`
 * ด้วย `$executeRaw` แถวนั้นจะมี `updatedAt` ค้างอยู่ค่าเดิม ⇒ delta แกน `updatedAt`
 * มองไม่เห็นการเปลี่ยนแปลงนั้นเลย และไม่มีอะไรฟ้อง (ชนิดถูก คิวรีสำเร็จ)
 *
 * ยืนยันแล้ว 2026-09-14: ตอนเขียนด่านนี้ทั้ง `src/` ไม่มี raw write บน ChatMessage เลยสักจุด
 */
describe('[blocker] ห้าม raw SQL เขียน ChatMessage', () => {
  it('ไม่มี UPDATE/INSERT/DELETE บน "ChatMessage" ผ่าน $executeRaw ใน src/', () => {
    // `|| true` — rg คืน exit 1 เมื่อไม่เจอ ซึ่งเป็นผลลัพธ์ที่เราต้องการ ไม่ใช่ความล้มเหลว
    const out = execSync(
      `rg -n --no-heading -U 'executeRaw[\\s\\S]{0,400}?(UPDATE|INSERT INTO|DELETE FROM)\\s+"ChatMessage"' src/ || true`,
      { encoding: 'utf8' },
    ).trim()
    expect(out).toBe('')
  })
})
```

- [ ] **Step 2: รันเทสให้ผ่านตั้งแต่ยังไม่แก้อะไร (baseline)**

Run: `npx vitest run src/lib/__tests__/chat-message-no-raw-write.test.ts`
Expected: PASS (1 test) — ถ้า FAIL แปลว่ามี raw write อยู่แล้ว ต้องหยุดแล้วรายงาน เพราะดีไซน์ทั้งก้อนตั้งอยู่บนข้อนี้

- [ ] **Step 3: พิสูจน์ด้วย mutation ว่าด่านนี้จับได้จริง**

สร้างไฟล์ชั่วคราว `src/lib/__mutation-probe.ts`:

```ts
// ไฟล์ทดสอบชั่วคราว — ลบทิ้งใน step ถัดไป
export async function probe(prisma: any) {
  await prisma.$executeRaw`UPDATE "ChatMessage" SET "isDeleted" = true WHERE id = '1'`
}
```

Run: `npx vitest run src/lib/__tests__/chat-message-no-raw-write.test.ts`
Expected: **FAIL** — ถ้ายังเขียวแปลว่า regex ของด่านผิด ต้องแก้ regex ก่อนไปต่อ

- [ ] **Step 4: ลบไฟล์ probe แล้วรันใหม่**

```bash
rm src/lib/__mutation-probe.ts
npx vitest run src/lib/__tests__/chat-message-no-raw-write.test.ts
```
Expected: PASS

- [ ] **Step 5: แก้ `prisma/schema.prisma`**

ใน `model ChatMessage` เพิ่มหลังบรรทัด `seq Int @unique @default(autoincrement())`:

```prisma
  /**
   * watermark "แถวนี้ถูกแก้ครั้งล่าสุดเมื่อไร" (2026-09-14) — แกนที่ 2 ของ delta
   *
   * ทำไมต้องมี: ฟิลด์ที่เปลี่ยนค่าหลังแถวถูกสร้างมีอย่างน้อย 6 ตัว (reactionEmoji, isDeleted,
   * body จาก message_edits, deliveryStatus, failureReason, cards) — เดิมจอเห็นการเปลี่ยนแปลง
   * พวกนี้ได้เพราะ client ดึงข้อความ 30 ใบล่าสุด "ทั้งก้อน" ใหม่ทุก 6 วินาที ซึ่งทำหน้าที่นี้
   * อยู่โดยบังเอิญ พอเปลี่ยนเป็น delta ด้วย seq อย่างเดียว (ซึ่งจับได้แค่ "ใบใหม่") การกดลบ
   * ข้อความจะค้างในจอร้านตลอดไปจนกว่าจะรีเฟรช
   *
   * `@updatedAt` ให้ Prisma เขียนเองทุก write path — ห้ามเขียนมือ และห้าม raw SQL เขียนตาราง
   * นี้ (มีด่าน src/lib/__tests__/chat-message-no-raw-write.test.ts กันไว้)
   */
  updatedAt DateTime @updatedAt @default(now())
```

และเพิ่มใน block `@@index` ของ model เดียวกัน:

```prisma
  @@index([conversationId, updatedAt]) // delta แกนที่ 2 — "ใบเก่าที่เพิ่งถูกแก้" (2026-09-14)
```

ใน `model Conversation` เพิ่มหลังบรรทัด `lastInboundAt DateTime?`:

```prisma
  /**
   * เวลาที่ไล่ดึงข้อความย้อนหลังจาก Meta "จนถึงวันที่สร้างเธรด" สำเร็จครบ (2026-09-14)
   * null = ยังไม่เคยครบ ⇒ เปิดห้องครั้งถัดไปจะไล่ต่อ · มีค่า = ไล่ครบแล้ว รอบถัดไปดึงหน้าเดียวพอ
   */
  metaBackfilledAt DateTime?
```

- [ ] **Step 6: สร้างไฟล์ migration ด้วยมือ (ห้ามใช้ `migrate dev` — HR14)**

```bash
mkdir -p prisma/migrations/20260914150000_chat_message_updated_at
cat > prisma/migrations/20260914150000_chat_message_updated_at/migration.sql <<'SQL'
-- ChatMessage.updatedAt — แกนที่ 2 ของ delta (ดูคอมเมนต์ใน schema.prisma)
-- additive ล้วน: แถวเดิมได้ค่าเริ่มต้นเท่ากับ createdAt เพื่อไม่ให้ delta รอบแรกคว้าทั้งตาราง
ALTER TABLE "ChatMessage" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "ChatMessage" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ChatMessage_conversationId_updatedAt_idx" ON "ChatMessage"("conversationId", "updatedAt");

-- Conversation.metaBackfilledAt — ธง "ไล่ย้อนจาก Meta ครบถึงวันสร้างเธรดแล้ว"
ALTER TABLE "Conversation" ADD COLUMN "metaBackfilledAt" TIMESTAMP(3);
SQL
```

🛑 **`UPDATE … SET updatedAt = createdAt` สำคัญ** — ถ้าปล่อยให้เป็น `now()` ทั้งตาราง delta รอบแรกของทุกเธรดจะคว้าข้อความทั้งหมดกลับมา

- [ ] **Step 7: แจ้ง user เรื่อง migrate (HR15) แล้ว apply ฐาน local**

พูดกับ user ให้ครบ 3 ข้อ: (1) prod ไม่ต้องสั่งเอง — push แล้ว `prisma migrate deploy` รันตอน build (2) ฐาน local ต้อง apply เอง (3) migrate ล้ม = build ล้ม = deploy ไม่ขึ้น ของเก่ายังเสิร์ฟอยู่

```bash
npm run db:local:migrate
npx prisma generate
```
Expected: `1 migration applied` และ `Generated Prisma Client`

- [ ] **Step 8: ยืนยันคอลัมน์เข้าฐานจริง**

```bash
DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" npx prisma db execute --stdin <<'SQL'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ChatMessage' AND column_name = 'updatedAt';
SQL
```
Expected: สำเร็จโดยไม่มี error

- [ ] **Step 9: `tsc` ผ่าน แล้ว commit**

```bash
npx tsc --noEmit
git add prisma/schema.prisma prisma/migrations/20260914150000_chat_message_updated_at src/lib/__tests__/chat-message-no-raw-write.test.ts
git commit -m "feat(00018): เพิ่ม ChatMessage.updatedAt + Conversation.metaBackfilledAt

updatedAt เป็นแกนที่ 2 ของ delta — จับ 'ใบเก่าที่ค่าเปลี่ยน' (reaction/unsend/
สถานะส่ง) ซึ่ง seq จับไม่ได้ เดิมจอเห็นการเปลี่ยนแปลงพวกนี้เพราะ client ดึง
30 ใบทั้งก้อนใหม่ทุก 6 วินาที = ทำหน้าที่นี้อยู่โดยบังเอิญ

แถวเดิมตั้งค่าเริ่มต้นเท่ากับ createdAt ไม่ใช่ now() ไม่งั้น delta รอบแรกของ
ทุกเธรดจะคว้าข้อความทั้งตารางกลับมา

เพิ่มด่านสแกนซอร์สห้าม raw SQL เขียน ChatMessage (พิสูจน์ด้วย mutation แล้ว)
เพราะ @updatedAt ทำงานเฉพาะ write path ที่ผ่าน Prisma"
```

---

## Task 2: `chat-message-merge.ts` + `chat-message-store.ts`

**Files:**
- Create: `src/lib/chat-message-merge.ts`
- Create: `src/lib/chat-message-store.ts`
- Create: `src/lib/__tests__/chat-message-merge.test.ts`
- Create: `src/lib/__tests__/chat-message-store.test.ts`

**Interfaces:**
- Consumes: `ChatMessageView` จาก `@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread`
- Produces:
  - `mergeMessages(prev: ChatMessageView[], incoming: ChatMessageView[]): ChatMessageView[]`
  - `capMessages(items: ChatMessageView[], max: number): ChatMessageView[]`
  - `type ThreadCache = { items, lastSeq, lastUpdatedAt, oldestCursor, stale, touchedAt }`
  - `readThread(id: string): ThreadCache | null`
  - `writeThread(id: string, patch: Partial<ThreadCache> & { items: ChatMessageView[] }): void`
  - `markThreadStale(id: string): void`
  - `MAX_MESSAGES_PER_THREAD = 100` · `MAX_THREADS = 20` · `THREAD_TTL_MS = 30 * 60_000`

- [ ] **Step 1: เขียนเทสของ merge ให้ล้มก่อน**

สร้าง `src/lib/__tests__/chat-message-merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { capMessages, mergeMessages } from '@/lib/chat-message-merge'
import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

function msg(over: Partial<ChatMessageView> & { id: string; createdAt: string }): ChatMessageView {
  return {
    id: over.id,
    conversationId: 'c1',
    senderUserId: null,
    senderRole: 'BUYER',
    type: 'TEXT',
    body: over.body ?? over.id,
    imageUrl: null,
    createdAt: over.createdAt,
    ...over,
  } as ChatMessageView
}

describe('[blocker] mergeMessages', () => {
  it('แทรกใบที่เวลาเก่ากว่าไว้ตรงตำแหน่งเวลา ไม่ใช่ต่อท้าย (D-8)', () => {
    // ใบ backfill: seq สูงสุด (เพิ่ง insert) แต่ createdAt เก่าสุด
    const prev = [
      msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 10 }),
      msg({ id: 'c', createdAt: '2026-09-14T11:00:00.000Z', seq: 11 }),
    ]
    const incoming = [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 99 })]
    expect(mergeMessages(prev, incoming).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('ใบที่ไม่มีอะไรเปลี่ยน ต้องเป็น object เดิมเป๊ะ (React จะได้ไม่ re-render ทั้งลิสต์)', () => {
    const keep = msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1 })
    const prev = [keep, msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 2 })]
    const out = mergeMessages(prev, [msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 2, reactionEmoji: '❤' })])
    expect(out[0]).toBe(keep) // toBe = identity ไม่ใช่ toEqual
    expect(out[1]).not.toBe(prev[1])
    expect(out[1]!.reactionEmoji).toBe('❤')
  })

  it('ใบที่ถูกลบต้องแทนที่ในตำแหน่งเดิม ไม่ใช่หายไปจาก array', () => {
    const prev = [
      msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1 }),
      msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 2 }),
    ]
    const out = mergeMessages(prev, [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1, isDeleted: true })])
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
    expect(out[0]!.isDeleted).toBe(true)
  })

  it('เวลาเท่ากันใช้ seq ตัดสิน และข้อความ optimistic ที่ยังไม่มี seq อยู่ท้ายสุดของกลุ่มนั้น', () => {
    const t = '2026-09-14T09:00:00.000Z'
    const prev = [msg({ id: 'local-1', createdAt: t })]
    const out = mergeMessages(prev, [msg({ id: 'a', createdAt: t, seq: 5 })])
    expect(out.map((m) => m.id)).toEqual(['a', 'local-1'])
  })
})

describe('[blocker] capMessages', () => {
  it('เกินเพดานให้ตัดใบเก่าสุดทิ้ง เก็บใบใหม่สุดไว้', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      msg({ id: `m${i}`, createdAt: `2026-09-14T0${i}:00:00.000Z`, seq: i }),
    )
    expect(capMessages(items, 3).map((m) => m.id)).toEqual(['m2', 'm3', 'm4'])
  })

  it('ไม่เกินเพดานต้องคืน array เดิมเป๊ะ', () => {
    const items = [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z' })]
    expect(capMessages(items, 3)).toBe(items)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/chat-message-merge.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/chat-message-merge"`

- [ ] **Step 3: เขียน `src/lib/chat-message-merge.ts`**

```ts
import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

/**
 * chat-message-merge — กฎการรวมข้อความเข้ากับของที่จออ่านอยู่ (ส่วนขยาย 00018, 2026-09-14)
 *
 * 🛑 กฎที่ห้ามผิด 2 ข้อ:
 *
 * 1) **แทรกตามเวลา ไม่ใช่ต่อท้าย** — ข้อความที่ไล่ดึงย้อนหลังมาจาก Meta ได้ `seq` ใหม่
 *    (autoincrement ตอน insert) แต่ `createdAt` เป็นเวลาจริงซึ่งเก่า ถ้า merge แบบต่อท้าย
 *    มันจะไปโผล่ล่างสุดทั้งที่ควรอยู่กลางเธรด
 *
 * 2) **ใบที่ไม่เปลี่ยนต้องเป็น object เดิม** — ถ้าสร้าง object ใหม่ให้ทุกใบ React จะ
 *    re-render ทั้งลิสต์ทุกครั้งที่ delta กลับมา ซึ่งคือต้นเหตุอาการ "เด้ง" ที่ฟีเจอร์นี้
 *    ตั้งใจแก้ (ผู้ใช้รายงาน 2026-09-14: "กล่องแชทมันรู้สึกเหมือนเด้งตลอดเวลา")
 *
 * ลำดับยึด [createdAt asc, seq asc] ให้ตรงกับ orderBy ฝั่ง server (chat.service.ts) เป๊ะ
 * ข้อความ optimistic ยังไม่มี seq → ถือว่าอยู่ท้ายสุดของกลุ่มเวลาเดียวกัน
 */

/** true = สองใบนี้เหมือนกันทุกฟิลด์ที่จอสนใจ ⇒ ไม่ต้องสร้าง object ใหม่ */
function sameMessage(a: ChatMessageView, b: ChatMessageView): boolean {
  return (
    a.body === b.body &&
    a.imageUrl === b.imageUrl &&
    a.reactionEmoji === b.reactionEmoji &&
    a.isDeleted === b.isDeleted &&
    a.edited === b.edited &&
    a.deliveryStatus === b.deliveryStatus &&
    a.failureReason === b.failureReason &&
    a.createdAt === b.createdAt &&
    a.seq === b.seq
  )
}

function compare(a: ChatMessageView, b: ChatMessageView): number {
  const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  if (dt !== 0) return dt
  return (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
}

export function mergeMessages(
  prev: ChatMessageView[],
  incoming: ChatMessageView[],
): ChatMessageView[] {
  if (incoming.length === 0) return prev

  const byId = new Map(prev.map((m) => [m.id, m]))
  let changed = false

  for (const next of incoming) {
    const current = byId.get(next.id)
    if (!current) {
      byId.set(next.id, next)
      changed = true
      continue
    }
    if (sameMessage(current, next)) continue // object เดิมอยู่ใน map แล้ว ไม่ต้องทำอะไร
    byId.set(next.id, next)
    changed = true
  }

  if (!changed) return prev
  return Array.from(byId.values()).sort(compare)
}

/** เก็บได้ไม่เกิน `max` ใบ — ตัดใบเก่าสุดทิ้ง เพราะจอเปิดที่ล่างสุดเสมอ */
export function capMessages(items: ChatMessageView[], max: number): ChatMessageView[] {
  if (items.length <= max) return items
  return items.slice(items.length - max)
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run src/lib/__tests__/chat-message-merge.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: พิสูจน์ด้วย mutation 2 แบบ**

แบบที่ 1 — เปลี่ยนบรรทัดสุดท้ายของ `mergeMessages` เป็น `return [...prev, ...incoming]`
Run: `npx vitest run src/lib/__tests__/chat-message-merge.test.ts` → Expected: **FAIL** ที่เคส "แทรกตามเวลา"

แบบที่ 2 — คืนกลับ แล้วเปลี่ยน `if (sameMessage(current, next)) continue` เป็น `byId.set(next.id, { ...next })`
Run: เทสเดิม → Expected: **FAIL** ที่เคส "object เดิมเป๊ะ"

คืนโค้ดกลับให้ถูกแล้วรันอีกครั้ง → PASS

- [ ] **Step 6: เขียนเทสของ store ให้ล้มก่อน**

สร้าง `src/lib/__tests__/chat-message-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_THREADS,
  markThreadStale,
  readThread,
  resetThreadStoreForTest,
  writeThread,
} from '@/lib/chat-message-store'
import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

const item = (id: string): ChatMessageView =>
  ({
    id,
    conversationId: 'c1',
    senderUserId: null,
    senderRole: 'BUYER',
    type: 'TEXT',
    body: id,
    imageUrl: null,
    createdAt: '2026-09-14T09:00:00.000Z',
    seq: 1,
  }) as ChatMessageView

describe('[blocker] chat-message-store', () => {
  beforeEach(() => resetThreadStoreForTest())

  it('อ่านห้องที่ไม่เคยเขียนได้ null', () => {
    expect(readThread('nope')).toBeNull()
  })

  it('เขียนแล้วอ่านกลับได้ พร้อม watermark', () => {
    writeThread('c1', { items: [item('a')], lastSeq: 5, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    const got = readThread('c1')
    expect(got?.items.map((m) => m.id)).toEqual(['a'])
    expect(got?.lastSeq).toBe(5)
  })

  it('markThreadStale ไม่ลบข้อมูล แค่ปักธง', () => {
    writeThread('c1', { items: [item('a')], lastSeq: 5, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    markThreadStale('c1')
    expect(readThread('c1')?.stale).toBe(true)
    expect(readThread('c1')?.items).toHaveLength(1)
  })

  it('markThreadStale กับห้องที่ไม่มี cache ต้องไม่สร้างแถวเปล่า', () => {
    markThreadStale('ghost')
    expect(readThread('ghost')).toBeNull()
  })

  it(`เก็บได้ไม่เกิน ${MAX_THREADS} ห้อง — ห้องที่ถูกแตะนานสุดหลุดก่อน`, () => {
    for (let i = 0; i < MAX_THREADS + 1; i++) {
      writeThread(`c${i}`, { items: [item('a')], lastSeq: 1, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    }
    expect(readThread('c0')).toBeNull()
    expect(readThread(`c${MAX_THREADS}`)).not.toBeNull()
  })

  it('การอ่านนับเป็นการแตะ — ห้องที่เพิ่งอ่านต้องไม่ใช่ตัวที่ถูกไล่ออก', () => {
    for (let i = 0; i < MAX_THREADS; i++) {
      writeThread(`c${i}`, { items: [item('a')], lastSeq: 1, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    }
    readThread('c0') // แตะห้องเก่าสุด
    writeThread('newcomer', { items: [item('a')], lastSeq: 1, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    expect(readThread('c0')).not.toBeNull()
    expect(readThread('c1')).toBeNull()
  })
})
```

- [ ] **Step 7: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/chat-message-store.test.ts`
Expected: FAIL — resolve import ไม่ได้

- [ ] **Step 8: เขียน `src/lib/chat-message-store.ts`**

```ts
'use client'

import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'
import { capMessages } from '@/lib/chat-message-merge'

/**
 * chat-message-store — cache ข้อความรายห้อง ฝั่ง browser (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องมี: การเปิดห้องที่เคยเปิดแล้วต้องเห็นข้อความ **ทันทีโดยไม่ยิงอะไรเลย** แล้วค่อย
 * reconcile ด้วย delta เบื้องหลัง — เดิมทุกการเปิดห้องต้องรอ RSC payload (ซึ่ง prefetch ไว้
 * แต่ค้างได้ถึง 30 วินาทีตาม staleTimes.dynamic ใน next.config.ts)
 *
 * 🛑 store นี้เป็น **ภาพนิ่ง ไม่ใช่แหล่งความจริง** (HR16) — ทุกครั้งที่เปิดห้องต้องยิง delta
 *    ไป reconcile เสมอ ห้ามเชื่อ cache อย่างเดียว
 *
 * 🛑 **ไม่ลง localStorage โดยตั้งใจ** — ข้อความลูกค้าเป็น PII ไม่ควรค้างบนดิสก์เครื่องร้าน
 *    อยู่ใน memory ของแท็บเท่านั้น ปิดแท็บแล้วหายไปพร้อมกัน
 */

export const MAX_MESSAGES_PER_THREAD = 100
export const MAX_THREADS = 20
export const THREAD_TTL_MS = 30 * 60_000

export type ThreadCache = {
  /** เรียงเก่า→ใหม่เสมอ (ทิศเดียวกับที่จอ render) */
  items: ChatMessageView[]
  /** watermark แกนที่ 1 — ใบใหม่คือใบที่ seq มากกว่านี้ */
  lastSeq: number
  /** watermark แกนที่ 2 (ISO) — ใบเก่าที่ค่าเปลี่ยนคือใบที่ updatedAt ใหม่กว่านี้ */
  lastUpdatedAt: string
  /** cursor ของ "ข้อความเก่ากว่านี้" ไว้ต่อ loadOlder — null = ไม่มีของเก่ากว่าแล้ว */
  oldestCursor: string | null
  /** realtime บอกว่ามีของใหม่ ตอนผู้ใช้ยังไม่ได้เปิดห้องนี้ */
  stale: boolean
  touchedAt: number
}

const store = new Map<string, ThreadCache>()

/** ใช้ในเทสเท่านั้น — ล้าง state ระดับโมดูลระหว่างเคส (ไม่แตะฐานข้อมูลใด ๆ) */
export function resetThreadStoreForTest(): void {
  store.clear()
}

function evictIfNeeded(): void {
  if (store.size <= MAX_THREADS) return
  let oldestId: string | null = null
  let oldestAt = Number.POSITIVE_INFINITY
  for (const [id, entry] of store) {
    if (entry.touchedAt < oldestAt) {
      oldestAt = entry.touchedAt
      oldestId = id
    }
  }
  if (oldestId) store.delete(oldestId)
}

export function readThread(conversationId: string): ThreadCache | null {
  const entry = store.get(conversationId)
  if (!entry) return null
  if (Date.now() - entry.touchedAt > THREAD_TTL_MS) {
    store.delete(conversationId)
    return null
  }
  entry.touchedAt = Date.now() // การอ่านนับเป็นการแตะ (LRU)
  return entry
}

export function writeThread(
  conversationId: string,
  patch: Partial<ThreadCache> & { items: ChatMessageView[] },
): void {
  const prev = store.get(conversationId)
  store.set(conversationId, {
    items: capMessages(patch.items, MAX_MESSAGES_PER_THREAD),
    lastSeq: patch.lastSeq ?? prev?.lastSeq ?? 0,
    lastUpdatedAt: patch.lastUpdatedAt ?? prev?.lastUpdatedAt ?? new Date(0).toISOString(),
    oldestCursor: patch.oldestCursor !== undefined ? patch.oldestCursor : (prev?.oldestCursor ?? null),
    stale: patch.stale ?? false,
    touchedAt: Date.now(),
  })
  evictIfNeeded()
}

/** realtime บอกว่ามีของใหม่ — ไม่ยิงอะไร แค่ปักธงไว้ให้ตอนเปิดห้องรู้ว่าต้อง reconcile */
export function markThreadStale(conversationId: string): void {
  const entry = store.get(conversationId)
  if (!entry) return // ห้ามสร้างแถวเปล่า — ไม่มี cache ก็ไม่มีอะไรให้ทำให้เก่า
  entry.stale = true
}

/** watermark ใหม่ที่คำนวณจากชุดข้อความ — ใช้หลัง merge ทุกครั้ง */
export function watermarksOf(items: ChatMessageView[]): { lastSeq: number; lastUpdatedAt: string } {
  let lastSeq = 0
  let lastUpdatedAt = new Date(0).toISOString()
  for (const m of items) {
    if (typeof m.seq === 'number' && m.seq > lastSeq) lastSeq = m.seq
    const u = m.updatedAt ?? m.createdAt
    if (u > lastUpdatedAt) lastUpdatedAt = u
  }
  return { lastSeq, lastUpdatedAt }
}
```

หมายเหตุ: `watermarksOf` อ้าง `m.updatedAt` ⇒ ต้องเพิ่มฟิลด์นี้เข้า `ChatMessageView` ใน Task 3 Step 5 (ก่อนหน้านั้น `tsc` จะฟ้อง — ยอมให้ฟ้องชั่วคราวได้ภายใน task นี้ แต่ต้องหายก่อน commit ของ Task 3)

- [ ] **Step 9: รันเทสให้ผ่าน**

Run: `npx vitest run src/lib/__tests__/chat-message-store.test.ts`
Expected: PASS (6 tests) — ถ้า `tsc` ฟ้องเรื่อง `m.updatedAt` ให้ใส่ `as { updatedAt?: string }` ชั่วคราวแล้วถอดออกใน Task 3

- [ ] **Step 10: mutation ของ store**

ลบบรรทัด `if (!entry) return` ใน `markThreadStale` แล้วเปลี่ยนเป็นสร้างแถวเปล่า
Run: `npx vitest run src/lib/__tests__/chat-message-store.test.ts` → Expected: **FAIL** ที่เคส "ห้ามสร้างแถวเปล่า"
คืนกลับ → PASS

- [ ] **Step 11: commit**

```bash
git add src/lib/chat-message-merge.ts src/lib/chat-message-store.ts src/lib/__tests__/chat-message-merge.test.ts src/lib/__tests__/chat-message-store.test.ts
git commit -m "feat(00018): chat-message-merge + chat-message-store (ฟังก์ชันบริสุทธิ์ + cache รายห้อง)

merge มีกฎที่ห้ามผิด 2 ข้อ พิสูจน์ด้วย mutation ทั้งคู่:
- แทรกตามเวลา ไม่ใช่ต่อท้าย (ใบที่ backfill มามี seq ใหม่แต่ createdAt เก่า)
- ใบที่ค่าไม่เปลี่ยนต้องเป็น object เดิมเป๊ะ ไม่งั้น React re-render ทั้งลิสต์
  ทุกรอบ delta = อาการ 'เด้ง' ที่ฟีเจอร์นี้ตั้งใจแก้

store ไม่ลง localStorage โดยตั้งใจ (ข้อความลูกค้าเป็น PII) และเป็นภาพนิ่ง
ไม่ใช่แหล่งความจริง — เปิดห้องต้อง reconcile ด้วย delta เสมอ"
```

---

## Task 3: delta API สองแกน

**Files:**
- Modify: `src/lib/validations.ts:940-943` (`ChatMessagesQuerySchema`)
- Modify: `src/services/chat.service.ts:644-690` (`getMessages`)
- Modify: `src/services/chat-thread-messages.service.ts:17-30` (`getThreadMessagesPage`)
- Modify: `src/app/api/chat/conversations/[id]/messages/route.ts:147-175`
- Modify: `src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts:145` (เพิ่ม `updatedAt` เข้า `ChatMessageView`)
- Create: `src/lib/__tests__/chat-delta-query.test.ts`

**Interfaces:**
- Consumes: คอลัมน์จาก Task 1
- Produces:
  - `buildDeltaWhere(input: { conversationId: string; afterSeq?: number; afterUpdatedAt?: string }): Prisma.ChatMessageWhereInput` (export จาก `src/lib/chat-delta-query.ts`)
  - `getMessages(conversationId, actorUserId, { cursor?, take?, afterSeq?, afterUpdatedAt? })`
  - API `GET /api/chat/conversations/[id]/messages?afterSeq=<number>&afterUpdatedAt=<iso>`
  - `ChatMessageView.updatedAt?: string`

- [ ] **Step 1: เขียนเทสของตัวสร้าง where ให้ล้มก่อน**

สร้าง `src/lib/__tests__/chat-delta-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDeltaWhere, isDeltaRequest } from '@/lib/chat-delta-query'

describe('[blocker] delta สองแกน', () => {
  it('ระบุทั้งสองแกน = OR กัน (ใบใหม่ หรือ ใบเก่าที่ค่าเปลี่ยน)', () => {
    const w = buildDeltaWhere({ conversationId: 'c1', afterSeq: 10, afterUpdatedAt: '2026-09-14T09:00:00.000Z' })
    expect(w).toEqual({
      conversationId: 'c1',
      OR: [{ seq: { gt: 10 } }, { updatedAt: { gt: new Date('2026-09-14T09:00:00.000Z') } }],
    })
  })

  it('ระบุแกนเดียวก็ยังทำงาน', () => {
    expect(buildDeltaWhere({ conversationId: 'c1', afterSeq: 10 })).toEqual({
      conversationId: 'c1',
      OR: [{ seq: { gt: 10 } }],
    })
  })

  it('ไม่ระบุแกนไหนเลย = ไม่ใช่ delta (ผู้เรียกต้องถอยไปใช้ cursor แบบเดิม)', () => {
    expect(isDeltaRequest({})).toBe(false)
    expect(isDeltaRequest({ afterSeq: 0 })).toBe(true) // seq 0 คือค่าที่ถูกต้อง ห้ามตกเพราะ falsy
    expect(isDeltaRequest({ afterUpdatedAt: '2026-09-14T09:00:00.000Z' })).toBe(true)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/chat-delta-query.test.ts`
Expected: FAIL — resolve import ไม่ได้

- [ ] **Step 3: เขียน `src/lib/chat-delta-query.ts`**

```ts
import type { Prisma } from '@prisma/client'

/**
 * chat-delta-query — เกณฑ์ "อะไรคือของที่จอยังไม่รู้" ของห้องแชท (ส่วนขยาย 00018, 2026-09-14)
 *
 * สองแกน เพราะข้อความเปลี่ยนได้ 2 แบบที่ไม่เหมือนกันเลย:
 *   · แกน seq        — มีใบใหม่เกิดขึ้น
 *   · แกน updatedAt  — ใบเดิมถูกแก้ค่า (reaction / unsend / แก้ข้อความ / สถานะส่ง)
 *
 * 🛑 `afterSeq: 0` เป็นค่าที่ถูกต้อง (ห้องที่ยังไม่มีข้อความเลย) ⇒ ห้ามเช็คด้วย truthiness
 *    ที่ไหนทั้งสิ้น ต้องเช็ค `!== undefined` เสมอ
 */

export type DeltaInput = { afterSeq?: number; afterUpdatedAt?: string }

export function isDeltaRequest(input: DeltaInput): boolean {
  return input.afterSeq !== undefined || input.afterUpdatedAt !== undefined
}

export function buildDeltaWhere(
  input: DeltaInput & { conversationId: string },
): Prisma.ChatMessageWhereInput {
  const or: Prisma.ChatMessageWhereInput[] = []
  if (input.afterSeq !== undefined) or.push({ seq: { gt: input.afterSeq } })
  if (input.afterUpdatedAt !== undefined) or.push({ updatedAt: { gt: new Date(input.afterUpdatedAt) } })
  return { conversationId: input.conversationId, OR: or }
}
```

- [ ] **Step 4: รันเทสให้ผ่าน แล้ว mutation**

Run: `npx vitest run src/lib/__tests__/chat-delta-query.test.ts` → Expected: PASS (3 tests)

mutation: เปลี่ยน `input.afterSeq !== undefined` เป็น `input.afterSeq` (truthiness) ทั้ง 2 จุด
Run: เทสเดิม → Expected: **FAIL** ที่เคส `afterSeq: 0`
คืนกลับ → PASS

- [ ] **Step 5: เพิ่ม `updatedAt` เข้า `ChatMessageView`**

ใน `src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts` ใต้บรรทัด `createdAt: string` เพิ่ม:

```ts
  /** watermark แกนที่ 2 ของ delta (2026-09-14) — optional เพราะข้อความ optimistic ยังไม่มี */
  updatedAt?: string
```

ถ้า Task 2 ใส่ `as { updatedAt?: string }` ชั่วคราวไว้ ให้ถอดออกตอนนี้

- [ ] **Step 6: เพิ่มพารามิเตอร์เข้า Valibot schema**

ใน `src/lib/validations.ts` แก้ `ChatMessagesQuerySchema` เป็น:

```ts
export const ChatMessagesQuerySchema = v.object({
  cursor: v.optional(v.string()), // ISO datetime ของ createdAt ข้อความเก่าสุดที่เห็น
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 30),
  // delta สองแกน (2026-09-14) — ดู src/lib/chat-delta-query.ts
  // 🛑 minValue(0) ไม่ใช่ minValue(1): ห้องที่ยังไม่มีข้อความส่ง afterSeq=0 มาเป็นปกติ
  afterSeq: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  afterUpdatedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
});
```

- [ ] **Step 7: ให้ `getMessages` รับโหมด delta**

ใน `src/services/chat.service.ts` แก้ signature และ block คิวรี:

```ts
export async function getMessages(
  conversationId: string,
  actorUserId: string,
  opts: { cursor?: string; take?: number; afterSeq?: number; afterUpdatedAt?: string } = {},
): Promise<{ items: ChatMessageView[]; nextCursor: string | null }> {
  const conversation = await assertParticipant(conversationId, actorUserId)
  // ... (ส่วน internalMessageFilter เดิม คงไว้ทั้งหมด)

  const take = opts.take ?? 30

  /**
   * โหมด delta (2026-09-14) — คนละคำถามกับ pagination:
   *   pagination ถามว่า "ของเก่ากว่านี้มีอะไร" (เรียงใหม่→เก่า แล้วมี nextCursor)
   *   delta ถามว่า "ตั้งแต่ watermark นี้มีอะไรเปลี่ยนบ้าง" (ไม่มีแนวคิดหน้าถัดไป)
   * ⇒ คืน nextCursor = null เสมอ ห้ามให้ผู้เรียกเอาไปใช้ต่อเป็น cursor ของ loadOlder
   */
  if (isDeltaRequest(opts)) {
    const deltaRows = await prisma.chatMessage.findMany({
      where: { ...buildDeltaWhere({ conversationId, ...opts }), ...internalMessageFilter },
      orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
      take: Math.min(take, 100),
    })
    return { items: await attachAutoReplyTrace(conversationId, deltaRows), nextCursor: null }
  }

  // ... (โค้ด cursor เดิม ไม่แตะ ยกเว้นบรรทัดสุดท้ายที่เปลี่ยนไปเรียก attachAutoReplyTrace)
```

สกัดบล็อก `traceByMessageId` เดิม (`chat.service.ts` ตั้งแต่ `const traceByMessageId = new Map` จนถึงก่อน `return`) ออกเป็นฟังก์ชันในไฟล์เดียวกัน แล้วให้ทั้งสองเส้นทางเรียกตัวเดียวกัน (HR16 — ห้ามก็อปโค้ดประกอบ view ไปไว้สองที่):

```ts
/** ติดเหตุผล "ทำไมบอทตอบข้อความนี้" ให้ทุกแถวที่มี autoReplyKind — ใช้ร่วมระหว่าง pagination กับ delta */
async function attachAutoReplyTrace(
  conversationId: string,
  page: Awaited<ReturnType<typeof prisma.chatMessage.findMany>>,
): Promise<ChatMessageView[]> {
  const traceByMessageId = new Map<string, AutoReplyTrace>()
  if (page.some((m) => m.autoReplyKind)) {
    // ... ย้ายโค้ดเดิมทั้งก้อนมาวางตรงนี้ ไม่แก้สักบรรทัด
  }
  return page.map((m) => ({ ...m, autoReply: traceByMessageId.get(m.id) ?? null })) as ChatMessageView[]
}
```

เส้นทาง pagination เดิมเปลี่ยน `return` เป็น:

```ts
  return {
    items: await attachAutoReplyTrace(conversationId, page),
    nextCursor: hasMore ? `${page[page.length - 1]!.createdAt.toISOString()}|${page[page.length - 1]!.seq}` : null,
  }
```

หมายเหตุ: `...m` spread ทั้งแถว ⇒ **`updatedAt` ไหลเข้า view เองโดยไม่ต้องแมป** ทันทีที่คอลัมน์จาก Task 1 มีอยู่ · การ enrich ต่อ (สินค้า/ออเดอร์/replyTo/ผู้ส่ง) อยู่ใน `getThreadMessagesPage` ซึ่งห่อ `getMessages` อยู่แล้ว ⇒ ผลลัพธ์ delta ผ่าน pipeline เดียวกันโดยอัตโนมัติ

เพิ่ม import ที่หัวไฟล์: `import { buildDeltaWhere, isDeltaRequest } from '@/lib/chat-delta-query'`

- [ ] **Step 8: ส่งผ่านพารามิเตอร์ที่ `chat-thread-messages.service.ts` และ route**

ใน `src/services/chat-thread-messages.service.ts` เพิ่ม `afterSeq`/`afterUpdatedAt` เข้า params ของ `getThreadMessagesPage` แล้วส่งต่อเข้า `getMessages`

ใน `src/app/api/chat/conversations/[id]/messages/route.ts` แก้ block `GET`:

```ts
  const input = {
    cursor: searchParams.get("cursor") ?? undefined,
    take: rawTake === null ? undefined : Number(rawTake),
    afterSeq: searchParams.get("afterSeq") === null ? undefined : Number(searchParams.get("afterSeq")),
    afterUpdatedAt: searchParams.get("afterUpdatedAt") ?? undefined,
  };
```

และแก้เงื่อนไข backfill:

```ts
    /**
     * ไล่เก็บข้อความที่ webhook ไม่เคยส่งมา — ผูกกับ "การเปิดห้อง" เท่านั้น
     * 🛑 คำขอแบบ delta คือ poll ที่ยิงทุก 12 วินาที ถ้าปล่อยให้ trigger ด้วย จะกลายเป็นการ
     *    ยิง Graph ตามรอบ poll (throttle 5 นาทีกันไว้ชั้นหนึ่ง แต่ไม่ควรพึ่ง throttle
     *    เป็นด่านเดียว — เจตนาของโค้ดต้องอ่านออกจากเงื่อนไขเอง)
     */
    if (!parsed.output.cursor && !isDeltaRequest(parsed.output)) {
      after(syncMissingMessagesFromMeta(id));
      timer.mark("sync", "deferred");
    } else {
      timer.mark("sync", "skipped");
    }
```

- [ ] **Step 9: ยืนยันว่า contract เดิมไม่พัง**

Run: `npx tsc --noEmit`
Expected: 0 errors

Run: `npx vitest run src/`
Expected: จำนวนเทสที่ผ่าน **ไม่น้อยกว่า** ก่อนเริ่ม task (บันทึกตัวเลข baseline ไว้ก่อนแก้ แล้วเทียบ — รีโปนี้มีเทสแดงค้างอยู่ก่อนแล้ว ห้ามตีความว่าเป็นของใหม่โดยไม่เทียบ)

- [ ] **Step 10: commit**

```bash
git add src/lib/chat-delta-query.ts src/lib/__tests__/chat-delta-query.test.ts src/lib/validations.ts src/services/chat.service.ts src/services/chat-thread-messages.service.ts "src/app/api/chat/conversations/[id]/messages/route.ts" "src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts"
git commit -m "feat(00018): delta API สองแกน (seq + updatedAt)

pagination กับ delta เป็นคนละคำถาม — pagination ถาม 'ของเก่ากว่านี้มีอะไร'
delta ถาม 'ตั้งแต่ watermark นี้เปลี่ยนอะไรบ้าง' ⇒ โหมด delta คืน nextCursor
เป็น null เสมอ ห้ามเอาไปใช้ต่อเป็น cursor ของ loadOlder

afterSeq=0 เป็นค่าที่ถูกต้อง (ห้องที่ยังไม่มีข้อความ) จึงเช็คด้วย !== undefined
ทุกจุด ห้ามใช้ truthiness — พิสูจน์ด้วย mutation แล้ว

คำขอแบบ delta ไม่ trigger syncMissingMessagesFromMeta เพราะตัวนั้นผูกกับ
'การเปิดห้อง' ไม่ใช่ 'การ poll'"
```

---

## Task 4: ต่อ store เข้า hook + กฎ scroll

**Files:**
- Create: `src/lib/chat-thread-scroll.ts`
- Create: `src/lib/__tests__/chat-thread-scroll.test.ts`
- Modify: `src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts` (initial load, `refetchNewer`, poll interval, observer ของ topSentinel)

**Interfaces:**
- Consumes: `readThread`/`writeThread`/`markThreadStale`/`watermarksOf` (Task 2) · `mergeMessages`/`capMessages` (Task 2) · delta API (Task 3)
- Produces:
  - `shouldFollowNewMessages(input: { atBottom: boolean; hasIncomingFromSelf: boolean }): boolean`
  - `canAutoLoadOlder(input: { userHasScrolled: boolean; hasCursor: boolean; loading: boolean }): boolean`

- [ ] **Step 1: เขียนเทสของการตัดสินใจเรื่อง scroll**

สร้าง `src/lib/__tests__/chat-thread-scroll.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canAutoLoadOlder, shouldFollowNewMessages } from '@/lib/chat-thread-scroll'

describe('[blocker] กฎการเลื่อนจอในห้องแชท', () => {
  it('อยู่ล่างสุด = เลื่อนตามข้อความใหม่', () => {
    expect(shouldFollowNewMessages({ atBottom: true, hasIncomingFromSelf: false })).toBe(true)
  })

  it('เลื่อนขึ้นไปอ่านของเก่าอยู่ = ห้ามเลื่อนจอ (ขึ้นปุ่มข้อความใหม่แทน)', () => {
    expect(shouldFollowNewMessages({ atBottom: false, hasIncomingFromSelf: false })).toBe(false)
  })

  it('ข้อความที่ร้านเพิ่งกดส่งเอง = เลื่อนตามเสมอ แม้กำลังอ่านของเก่า', () => {
    expect(shouldFollowNewMessages({ atBottom: false, hasIncomingFromSelf: true })).toBe(true)
  })

  it('ห้ามโหลดของเก่าเองก่อนที่ผู้ใช้จะเลื่อนสักครั้ง', () => {
    expect(canAutoLoadOlder({ userHasScrolled: false, hasCursor: true, loading: false })).toBe(false)
  })

  it('ผู้ใช้เลื่อนแล้วและยังมีของเก่า = โหลดได้', () => {
    expect(canAutoLoadOlder({ userHasScrolled: true, hasCursor: true, loading: false })).toBe(true)
  })

  it('กำลังโหลดอยู่ หรือไม่มี cursor แล้ว = ไม่โหลด', () => {
    expect(canAutoLoadOlder({ userHasScrolled: true, hasCursor: true, loading: true })).toBe(false)
    expect(canAutoLoadOlder({ userHasScrolled: true, hasCursor: false, loading: false })).toBe(false)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/chat-thread-scroll.test.ts`
Expected: FAIL — resolve import ไม่ได้

- [ ] **Step 3: เขียน `src/lib/chat-thread-scroll.ts`**

```ts
/**
 * chat-thread-scroll — การตัดสินใจเรื่องจอของห้องแชท (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องยกออกมาเป็นฟังก์ชัน: boolean ที่ตัดสินว่า UI จะทำหรือไม่ทำอะไร ต้องมีที่ให้เทสจับ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
 * แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งเคยพลาดมาแล้วกับปุ่มย่อกลับที่เขียน
 * กลับด้านแล้วผ่านทุก gate (2026-08-09)
 */

/** ข้อความใหม่เข้ามาแล้วควรเลื่อนจอตามไหม */
export function shouldFollowNewMessages(input: {
  /** จออยู่ล่างสุด (หรือใกล้ล่างสุดในระยะที่ถือว่ากำลังอ่านของล่าสุดอยู่) */
  atBottom: boolean
  /** ในชุดที่เพิ่งเข้ามา มีข้อความที่ร้านเป็นคนส่งเองหรือไม่ */
  hasIncomingFromSelf: boolean
}): boolean {
  // ร้านกดส่งเอง = เจตนาชัดว่าอยากเห็นผลลัพธ์ ต้องเลื่อนตามแม้กำลังอ่านของเก่าอยู่
  if (input.hasIncomingFromSelf) return true
  return input.atBottom
}

/** sentinel บนสุดถูกมองเห็นแล้ว — โหลดของเก่าต่อได้ไหม */
export function canAutoLoadOlder(input: {
  /**
   * ผู้ใช้เคยเลื่อนจอด้วยตัวเองแล้วอย่างน้อยหนึ่งครั้งในห้องนี้
   * 🛑 ถ้าไม่มีเงื่อนไขนี้ IntersectionObserver จะยิง loadOlder ทันทีที่ mount เมื่อเนื้อหา
   *    ไม่สูงพอจะดัน sentinel ให้พ้นจอ (เธรดสั้น / จอสูง) = โหลดของเก่าเองโดยผู้ใช้ไม่ได้ขอ
   */
  userHasScrolled: boolean
  hasCursor: boolean
  loading: boolean
}): boolean {
  return input.userHasScrolled && input.hasCursor && !input.loading
}
```

- [ ] **Step 4: รันเทสให้ผ่าน แล้ว mutation**

Run: `npx vitest run src/lib/__tests__/chat-thread-scroll.test.ts` → Expected: PASS (6 tests)

mutation: ลบ `if (input.hasIncomingFromSelf) return true` ทิ้ง
Run: เทสเดิม → Expected: **FAIL** ที่เคส "ข้อความที่ร้านเพิ่งกดส่งเอง"

mutation: คืนกลับ แล้วลบ `input.userHasScrolled &&` ออกจาก `canAutoLoadOlder`
Run: เทสเดิม → Expected: **FAIL** ที่เคส "ห้ามโหลดของเก่าเองก่อนผู้ใช้เลื่อน"

คืนกลับทั้งหมด → PASS

- [ ] **Step 5: ต่อ store เข้า initial load ของ hook**

ใน `useSellerChatThread.ts` แก้ `useState` เริ่มต้นของ `messages` และ effect `loadInitial`:

```ts
  // อ่าน store ครั้งเดียวต่อ mount — ห้ามเรียก readThread ตรง ๆ ในตัว render (ทุก render จะแตะ LRU ใหม่)
  // SSR ไม่มี store (โมดูลฝั่ง server ว่างเสมอ) ⇒ ได้ null แล้วถอยไปใช้ initialMessages ตามปกติ
  const cachedRef = useRef<ThreadCache | null | undefined>(undefined)
  if (cachedRef.current === undefined) {
    cachedRef.current = typeof window !== 'undefined' ? readThread(conversationId) : null
  }
  const cached = cachedRef.current
  const [messages, setMessages] = useState<ChatMessageView[]>(
    // ลำดับความสำคัญ: cache (เห็นทันที 0 network) → initialMessages จาก RSC → ว่าง
    cached ? cached.items : initial ? [...initial.items].reverse() : [],
  )
  const [oldestCursor, setOldestCursor] = useState<string | null>(
    cached ? cached.oldestCursor : (initial?.nextCursor ?? null),
  )
  const [loadingInitial, setLoadingInitial] = useState(!cached && !initial)
```

และใน effect `loadInitial` เพิ่มกิ่งใหม่ก่อนกิ่ง `seededForRef`:

```ts
    // มี cache = ไม่ต้องโหลดอะไรเลย จอมีเนื้อหาแล้วตั้งแต่เฟรมแรก — reconcile ด้วย delta
    // ใน effect ของ refetchNewer ที่ตามมา (ซึ่งยิงเสมอตอน mount อยู่แล้ว)
    if (cachedRef.current) {
      cachedRef.current = null
      fetch(`/api/chat/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {})
      return () => { cancelled = true }
    }
```

- [ ] **Step 6: เปลี่ยน `refetchNewer` เป็น delta + เขียนลง store**

```ts
  const refetchNewer = useCallback(async () => {
    try {
      const cache = readThread(conversationId)
      const params = new URLSearchParams({ take: '100' })
      if (cache) {
        params.set('afterSeq', String(cache.lastSeq))
        params.set('afterUpdatedAt', cache.lastUpdatedAt)
      } else {
        params.set('take', '30') // ยังไม่มี watermark → ถอยไปขอหน้าแรกเหมือนเดิม
      }
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages?${params}`)
      if (!res.ok) return
      const data: MessagesApiResponse = await res.json()
      if (data.externalReadAt !== undefined) setExternalReadAt(data.externalReadAt)
      if (data.externalDeliveredAt !== undefined) setExternalDeliveredAt(data.externalDeliveredAt)
      if (data.items.length === 0) return // ไม่มีอะไรเปลี่ยน = ไม่แตะ state เลย (ไม่ re-render)

      const hasNewFromBuyer = data.items.some((m) => m.senderRole === 'BUYER')
      const hasIncomingFromSelf = data.items.some((m) => m.senderRole === 'SHOP')
      setMessages((prev) => {
        const merged = capMessages(mergeMessages(prev, data.items), MAX_MESSAGES_PER_THREAD)
        // เขียน store ใน updater โดยตั้งใจ: ต้องใช้ `prev` ตัวจริง (มีข้อความ optimistic ที่เพิ่ง
        // setMessages ไปแต่ messagesRef ยังไม่ตามทัน) · StrictMode เรียก updater 2 ครั้งด้วย prev
        // เดียวกัน ⇒ merged เท่ากัน ⇒ writeThread ซ้ำได้ผลเดิม (idempotent) ไม่เป็นอันตราย
        writeThread(conversationId, { items: merged, ...watermarksOf(merged) })
        return merged
      })
      if (hasNewFromBuyer && beepEnabled) playChatBeep({ shopId, conversationId })
      if (shouldFollowNewMessages({ atBottom: atBottomRef.current, hasIncomingFromSelf })) scrollToBottom()
    } catch {
      // เงียบตามเดิม — poll ล้มไม่ควรรบกวนผู้ใช้
    }
  }, [conversationId, shopId, beepEnabled, scrollToBottom])
```

🛑 **ตรรกะ reconcile ของข้อความ optimistic (`reconcileIdsRef`) ที่มีอยู่เดิมต้องคงไว้** — ย้ายมาไว้หลัง `mergeMessages` ห้ามลบทิ้ง ไม่งั้นข้อความที่เพิ่งกดส่งจะค้างซ้ำสองใบ

- [ ] **Step 7: poll 6 วิ → 12 วิ**

```ts
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refetchNewer()
    }
    // 12 วิ (เดิม 6) — realtime เป็นตัวหลัก poll เหลือหน้าที่กันกรณี channel หลุดเงียบ
    // และตอนนี้แต่ละรอบเป็น delta ที่คืน 0 แถวเป็นส่วนใหญ่ ไม่ใช่การดึง 30 ใบทั้งก้อน
    const t = setInterval(tick, 12_000)
    return () => clearInterval(t)
  }, [refetchNewer])
```

- [ ] **Step 8: ติดธง `userHasScrolled` แล้วใช้ `canAutoLoadOlder`**

```ts
  const userHasScrolledRef = useRef(false)
  useEffect(() => {
    userHasScrolledRef.current = false // เปลี่ยนห้อง = เริ่มนับใหม่
  }, [conversationId])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const mark = () => { userHasScrolledRef.current = true }
    root.addEventListener('wheel', mark, { passive: true })
    root.addEventListener('touchmove', mark, { passive: true })
    return () => {
      root.removeEventListener('wheel', mark)
      root.removeEventListener('touchmove', mark)
    }
  }, [loadingInitial])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = topSentinelRef.current
    if (!root || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!canAutoLoadOlder({
          userHasScrolled: userHasScrolledRef.current,
          hasCursor: !!oldestCursor,
          loading: loadingOlder,
        })) return
        loadOlder()
      },
      { root, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [oldestCursor, messages.length, loadingOlder])
```

🛑 ใช้ `wheel`/`touchmove` ไม่ใช่ `scroll` — เพราะโค้ดของเราเองเรียก `scrollToBottom()` ซึ่งยิง event `scroll` ⇒ ถ้าฟัง `scroll` ธงจะถูกติดทันทีที่ mount แล้วด่านนี้ไม่มีผลอะไรเลย

- [ ] **Step 9: เขียน store ตอน loadOlder และตอน realtime**

- ใน `loadOlder` หลัง `setMessages` เพิ่ม `writeThread(conversationId, { items: merged, oldestCursor: data.nextCursor, ...watermarksOf(merged) })`
- ใน `InboxList.tsx` แก้ effect subscribe (บรรทัด ~1067) ให้อ่าน `conversationId` ที่ broadcast ส่งมาด้วย:

```ts
  useEffect(() => {
    const ids = shopIdsKey ? shopIdsKey.split(',') : []
    if (ids.length === 0) return
    const onSignal = ({ conversationId }: { conversationId?: string }) => {
      // ห้องที่เปิดอยู่มี realtime ของตัวเอง (chat:{id}) รับไปแล้ว — ปักธงเฉพาะห้องที่ไม่ได้เปิด
      if (conversationId && conversationId !== activeConversationIdRef.current) markThreadStale(conversationId)
      scheduleRefresh()
    }
    const offs = ids.map((id) => subscribeShopChat(id, onSignal))
    return () => offs.forEach((off) => off())
  }, [shopIdsKey, scheduleRefresh])
```

`activeConversationIdRef` = `useRef` ที่อัปเดตจาก `activeConversationId` (ประกาศอยู่แล้วที่ ~1100) — ใช้ ref เพื่อไม่ให้ต้อง resubscribe ทุกครั้งที่เปลี่ยนห้อง

- [ ] **Step 10: ตรวจว่า ChatWidget ไม่พัง**

Run: `npx tsc --noEmit` → Expected: 0 errors
อ่าน `src/app/(paces)/seller/(dashboard)/_shared/ChatWidgetThreadPanel.tsx` ยืนยันด้วยตาว่ายังเรียก hook ด้วย signature เดิมและไม่ได้พึ่ง `nextCursor` จากผลลัพธ์ delta

- [ ] **Step 11: commit**

```bash
git add src/lib/chat-thread-scroll.ts src/lib/__tests__/chat-thread-scroll.test.ts "src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts"
git commit -m "feat(00018): ต่อ store เข้าห้องแชท + delta + กฎ scroll

เปิดห้องที่เคยเปิดแล้ว = วาดจาก cache ทันที 0 network แล้ว reconcile ด้วย
delta เบื้องหลัง · poll 6 -> 12 วิ และแต่ละรอบคืน 0 แถวเป็นส่วนใหญ่
· delta ที่ไม่มีอะไรเปลี่ยนจะไม่แตะ state เลย = ไม่ re-render

ธง userHasScrolled ฟัง wheel/touchmove ไม่ใช่ scroll เพราะ scrollToBottom()
ของเราเองยิง event scroll ⇒ ถ้าฟัง scroll ธงจะติดตั้งแต่ mount แล้วด่านนี้
ไม่มีผลอะไรเลย

กฎ scroll ยกออกเป็นฟังก์ชันบริสุทธิ์ + เทส blocker เพราะ boolean ที่ตัดสินว่า
UI ทำอะไร ต้องมีที่ให้เทสจับ (เคยพลาดมาแล้วกับปุ่มย่อกลับที่เขียนกลับด้าน
แล้วผ่านทุก gate)"
```

---

## Task 5: รายการซ้าย patch รายแถว

**Files:**
- Create: `src/lib/inbox-row-patch.ts`
- Create: `src/lib/__tests__/inbox-row-patch.test.ts`
- Modify: `src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx:933-960` (`refreshFirstPage`)

**Interfaces:**
- Consumes: `ConversationListItem` จาก `InboxList`
- Produces: `patchConversationRows<T extends { id: string }>(prev: T[], fresh: T[]): T[]`

- [ ] **Step 1: เขียนเทสให้ล้มก่อน**

สร้าง `src/lib/__tests__/inbox-row-patch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { patchConversationRows } from '@/lib/inbox-row-patch'

type Row = { id: string; lastMessagePreview: string; unreadCount: number }

describe('[blocker] patchConversationRows', () => {
  it('แถวที่ค่าไม่เปลี่ยนต้องเป็น object เดิมเป๊ะ', () => {
    const a: Row = { id: 'a', lastMessagePreview: 'x', unreadCount: 0 }
    const b: Row = { id: 'b', lastMessagePreview: 'y', unreadCount: 1 }
    const out = patchConversationRows([a, b], [{ ...a }, { ...b }])
    expect(out[0]).toBe(a)
    expect(out[1]).toBe(b)
  })

  it('ทั้งลิสต์ไม่เปลี่ยนเลย ต้องคืน array เดิมเป๊ะ (React จะได้ข้ามทั้งบล็อก)', () => {
    const prev: Row[] = [{ id: 'a', lastMessagePreview: 'x', unreadCount: 0 }]
    expect(patchConversationRows(prev, [{ ...prev[0]! }])).toBe(prev)
  })

  it('แถวที่ค่าเปลี่ยนต้องเป็น object ใหม่ และค่าต้องเป็นของใหม่', () => {
    const a: Row = { id: 'a', lastMessagePreview: 'x', unreadCount: 0 }
    const out = patchConversationRows([a], [{ id: 'a', lastMessagePreview: 'x', unreadCount: 3 }])
    expect(out[0]).not.toBe(a)
    expect(out[0]!.unreadCount).toBe(3)
  })

  it('แถวใหม่ที่ยังไม่เคยมี ต้องถูกเพิ่มตามลำดับของชุดใหม่', () => {
    const a: Row = { id: 'a', lastMessagePreview: 'x', unreadCount: 0 }
    const out = patchConversationRows([a], [{ id: 'z', lastMessagePreview: 'new', unreadCount: 1 }, { ...a }])
    expect(out.map((r) => r.id)).toEqual(['z', 'a'])
    expect(out[1]).toBe(a)
  })

  it('แถวเดิมที่ไม่อยู่ในชุดใหม่ ต้องยังอยู่ต่อท้าย (ชุดใหม่คือหน้าแรก ไม่ใช่ทั้งหมด)', () => {
    const old: Row = { id: 'old', lastMessagePreview: 'o', unreadCount: 0 }
    const out = patchConversationRows([old], [{ id: 'n', lastMessagePreview: 'n', unreadCount: 0 }])
    expect(out.map((r) => r.id)).toEqual(['n', 'old'])
    expect(out[1]).toBe(old)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/inbox-row-patch.test.ts`
Expected: FAIL — resolve import ไม่ได้

- [ ] **Step 3: เขียน `src/lib/inbox-row-patch.ts`**

```ts
/**
 * inbox-row-patch — อัปเดตรายการแชทโดยไม่สร้าง object ใหม่ให้แถวที่ไม่ได้เปลี่ยน
 * (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องมี: `refreshFirstPage` เดิมทำ `setItems([...ก้อนใหม่, ...ของเดิมที่ไม่ซ้ำ])` ทุกรอบ
 * poll 20 วินาที ⇒ ทุกแถวเป็น object ใหม่หมด ⇒ React re-render ทั้งลิสต์ ⇒ ผู้ใช้รายงานว่า
 * "กล่องแชทมันรู้สึกเหมือนเด้งตลอดเวลา" (2026-09-14)
 *
 * 🛑 ชุดใหม่ที่รับเข้ามาคือ **หน้าแรก** ไม่ใช่รายการทั้งหมด ⇒ แถวเดิมที่ไม่อยู่ในชุดใหม่
 *    ต้องไม่หายไป (ผู้ใช้อาจเลื่อนโหลดมาแล้วหลายหน้า)
 */

/** เทียบค่าทีละคีย์ระดับบนสุด — ไม่ลงลึก เพราะแถวรายการเป็น object แบน */
function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[]
  if (keys.length !== Object.keys(b).length) return false
  for (const k of keys) {
    const av = a[k]
    const bv = b[k]
    if (av === bv) continue
    // ฟิลด์ที่เป็น array (เช่น contactTags, threadAgents) เทียบทีละตัว
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length || av.some((x, i) => x !== bv[i])) return false
      continue
    }
    return false
  }
  return true
}

export function patchConversationRows<T extends { id: string }>(prev: T[], fresh: T[]): T[] {
  const prevById = new Map(prev.map((r) => [r.id, r]))
  const freshIds = new Set(fresh.map((r) => r.id))
  const head = fresh.map((next) => {
    const current = prevById.get(next.id)
    return current && shallowEqual(current, next) ? current : next
  })
  const out = [...head, ...prev.filter((r) => !freshIds.has(r.id))]
  // ทุกตำแหน่งเป็น object เดิมเป๊ะ (ค่าเท่าเดิม + ลำดับเดิม) → คืน array เดิม React จะข้ามทั้งบล็อก
  return out.length === prev.length && out.every((r, i) => r === prev[i]) ? prev : out
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run src/lib/__tests__/inbox-row-patch.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: mutation**

เปลี่ยนบรรทัด `if (current && shallowEqual(current, next)) return current` เป็น `return next`
Run: เทสเดิม → Expected: **FAIL** ที่เคส "object เดิมเป๊ะ"
คืนกลับ → PASS

- [ ] **Step 6: ใช้ใน `InboxList.refreshFirstPage`**

แทน block `setItems((prev) => { ... })` เดิมด้วย:

```ts
      setItems((prev) => {
        const comparable = itemsSignatureRef.current === sig
        const beepFor = pickBeepTarget({ comparable, items: data.items, previous: prev })
        if (beepFor) playChatBeep({ shopId: beepFor.shopId, conversationId: beepFor.id })
        // ตัวกรองเปลี่ยนไปแล้ว = เทียบกับของเดิมไม่ได้ ต้องเริ่มจากศูนย์
        return patchConversationRows(comparable ? prev : [], data.items)
      })
```

- [ ] **Step 7: ยืนยันว่าไม่พัง**

Run: `npx tsc --noEmit` → Expected: 0 errors
Run: `npx vitest run "src/app/(paces)/seller/(chat)/inbox/components/__tests__/"` → Expected: PASS ทุกไฟล์ (เทสเดิมของ InboxList ต้องไม่แดง)

- [ ] **Step 8: commit**

```bash
git add src/lib/inbox-row-patch.ts src/lib/__tests__/inbox-row-patch.test.ts "src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx"
git commit -m "fix(00018): รายการแชท patch รายแถว เลิกสร้าง object ใหม่ทั้งลิสต์ทุก 20 วินาที

refreshFirstPage เดิม setItems ก้อนใหม่ทุกรอบ poll ⇒ ทุกแถวเป็น object ใหม่
⇒ React re-render ทั้งลิสต์ = อาการที่ user รายงานว่า 'เด้งตลอดเวลา'

ชุดที่ refresh กลับมาคือหน้าแรก ไม่ใช่ทั้งรายการ ⇒ แถวเดิมที่เลื่อนโหลดมาแล้ว
ต้องไม่หายไป (มีเทสคุมข้อนี้)"
```

---

## Task 6: backfill ที่มีขอบเขต

**Files:**
- Create: `src/lib/meta-backfill-bound.ts`
- Create: `src/lib/__tests__/meta-backfill-bound.test.ts`
- Modify: `src/lib/facebook/graph.ts:294-322` (เพิ่ม `fetchThreadMessagesPage`)
- Modify: `src/services/channel-chat.service.ts:281-380` (`syncMissingMessagesFromMeta`)

**Interfaces:**
- Consumes: `Conversation.metaBackfilledAt` (Task 1)
- Produces:
  - `fetchThreadMessagesPage(contactExternalId, pageToken, opts: { limit?: number; after?: string }): Promise<{ items: GraphThreadMessage[]; nextCursor: string | null }>`
  - `decideBackfillStep(input: { oldestInPage: Date | null; conversationCreatedAt: Date; pageNo: number; hasNextPage: boolean; maxPages: number }): { stop: boolean; markComplete: boolean }`

- [ ] **Step 1: เขียนเทสของตัวตัดสินขอบเขต**

สร้าง `src/lib/__tests__/meta-backfill-bound.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decideBackfillStep, MAX_BACKFILL_PAGES } from '@/lib/meta-backfill-bound'

const created = new Date('2026-09-01T00:00:00.000Z')

describe('[blocker] ขอบเขตการไล่ย้อนจาก Meta', () => {
  it('ไล่ถึงใบที่เก่ากว่าวันสร้างเธรดแล้ว = หยุดและปักธงว่าครบ', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-08-31T23:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: 3,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: true })
  })

  it('Meta ไม่มีหน้าถัดไปแล้ว = หยุดและปักธง (เธรดสั้นกว่าที่คิด)', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-09-05T00:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: 2,
        hasNextPage: false,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: true })
  })

  it('ชนเพดานหน้า = หยุดแต่ห้ามปักธง (ยังไม่ครบ ต้องไล่ต่อรอบหน้า)', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-09-05T00:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: MAX_BACKFILL_PAGES,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: false })
  })

  it('ยังไม่ถึงวันสร้างและยังมีหน้าถัดไป = ไปต่อ', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-09-05T00:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: 1,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: false, markComplete: false })
  })

  it('หน้าว่างเปล่า = หยุดและปักธง (ไม่มีอะไรให้ไล่ต่อ)', () => {
    expect(
      decideBackfillStep({
        oldestInPage: null,
        conversationCreatedAt: created,
        pageNo: 1,
        hasNextPage: false,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: true })
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/meta-backfill-bound.test.ts`
Expected: FAIL — resolve import ไม่ได้

- [ ] **Step 3: เขียน `src/lib/meta-backfill-bound.ts`**

```ts
/**
 * meta-backfill-bound — "ไล่ย้อนอีกหน้าไหม และถือว่าครบหรือยัง" (ส่วนขยาย 00018, 2026-09-14)
 *
 * 🛑 stop กับ markComplete ตอบคนละคำถาม ห้ามรวมเป็นตัวเดียว:
 *    · stop         = รอบนี้พอแค่นี้
 *    · markComplete = เธรดนี้ไล่ครบถึงวันที่สร้างแล้ว ไม่ต้องไล่อีกตลอดไป
 *    การชนเพดานหน้าคือเคสที่ stop=true แต่ markComplete=false — ถ้าปักธงตรงนั้นด้วย
 *    เธรดยาว ๆ จะถูกประกาศว่า "ครบแล้ว" ทั้งที่ยังขาดอีกครึ่ง โดยไม่มีอะไรฟ้อง
 */

export const MAX_BACKFILL_PAGES = 20

export function decideBackfillStep(input: {
  /** เวลาของข้อความเก่าสุดในหน้าที่เพิ่งดึงมา — null = หน้าว่าง */
  oldestInPage: Date | null
  conversationCreatedAt: Date
  /** หน้าที่เพิ่งดึงเสร็จ เริ่มที่ 1 */
  pageNo: number
  hasNextPage: boolean
  maxPages: number
}): { stop: boolean; markComplete: boolean } {
  if (input.oldestInPage === null) return { stop: true, markComplete: true }
  if (input.oldestInPage.getTime() <= input.conversationCreatedAt.getTime()) {
    return { stop: true, markComplete: true }
  }
  if (!input.hasNextPage) return { stop: true, markComplete: true }
  if (input.pageNo >= input.maxPages) return { stop: true, markComplete: false }
  return { stop: false, markComplete: false }
}
```

- [ ] **Step 4: รันเทสให้ผ่าน แล้ว mutation**

Run: `npx vitest run src/lib/__tests__/meta-backfill-bound.test.ts` → Expected: PASS (5 tests)

mutation: เปลี่ยนบรรทัดเพดานเป็น `return { stop: true, markComplete: true }`
Run: เทสเดิม → Expected: **FAIL** ที่เคส "ชนเพดานหน้า"
คืนกลับ → PASS

- [ ] **Step 5: เพิ่ม `fetchThreadMessagesPage` ใน `graph.ts`**

ตัวเดิมใช้ nested field `messages.limit(50)` บน `/me/conversations` ซึ่งไล่หน้าต่อไม่ได้ (โยน `paging` ทิ้ง และ `graphFetch` เติม `GRAPH_BASE` หน้า path เสมอ จึงเอา `paging.next` ที่เป็น URL เต็มมายิงตรงไม่ได้) ⇒ **รอบแรกขอ thread id มาด้วย แล้วหน้าถัดไปยิง edge `/{thread_id}/messages` ตรง** ซึ่งเป็น cursor pagination มาตรฐานของ Graph

สกัด mapper เดิม (บรรทัด 310-321 ใน `fetchThreadMessages`) ออกเป็น `toGraphThreadMessage(r)` ก่อน แล้วให้ทั้งตัวเดิมและตัวใหม่ใช้ร่วมกัน (HR16)

```ts
const THREAD_MESSAGE_FIELDS = 'id,created_time,from,message,attachments'

type GraphMessagesEdge = {
  data?: Array<Record<string, unknown>>
  paging?: { cursors?: { after?: string }; next?: string }
}

/** "ยังมีหน้าถัดไปไหม" ตัดสินจาก `paging.next` เท่านั้น — Graph ส่ง `cursors.after` มาแม้เป็นหน้า
 *  สุดท้าย ถ้าเชื่อ cursor อย่างเดียวจะวนขอหน้าว่างจนชนเพดานทุกเธรด */
function nextAfter(edge: GraphMessagesEdge | undefined): string | null {
  return edge?.paging?.next ? (edge.paging.cursors?.after ?? null) : null
}

/**
 * ไล่ข้อความในเธรดทีละหน้า (ส่วนขยาย 2026-09-14)
 * - ไม่ส่ง `cursor` = หน้าแรก: ยิง `/me/conversations` แล้วได้ทั้ง thread id + หน้าแรก ในคำขอเดียว
 * - ส่ง `cursor` = หน้าถัดไป: ยิง `/{threadId}/messages?after=` ตรง
 */
export async function fetchThreadMessagesPage(
  contactExternalId: string,
  pageToken: string,
  opts: { limit?: number; cursor?: { threadId: string; after: string } } = {},
): Promise<{ items: GraphThreadMessage[]; threadId: string | null; nextAfter: string | null }> {
  const limit = opts.limit ?? 100
  if (opts.cursor) {
    const edge = (await graphFetch(`/${opts.cursor.threadId}/messages`, pageToken, {
      query: { fields: THREAD_MESSAGE_FIELDS, limit: String(limit), after: opts.cursor.after },
    })) as GraphMessagesEdge
    return {
      items: (edge.data ?? []).map(toGraphThreadMessage),
      threadId: opts.cursor.threadId,
      nextAfter: nextAfter(edge),
    }
  }
  const json = await graphFetch('/me/conversations', pageToken, {
    query: { user_id: contactExternalId, fields: `id,messages.limit(${limit}){${THREAD_MESSAGE_FIELDS}}` },
  })
  const thread = ((json.data ?? []) as Array<{ id?: string; messages?: GraphMessagesEdge }>)[0]
  return {
    items: (thread?.messages?.data ?? []).map(toGraphThreadMessage),
    threadId: thread?.id ?? null,
    nextAfter: nextAfter(thread?.messages),
  }
}
```

🛑 **ก่อน commit ต้องยิงของจริง 1 ครั้งด้วยเพจทดสอบ** (สคริปต์ชั่วคราวอ่านอย่างเดียว ไม่ insert) ยืนยัน 2 ข้อ: (1) `/me/conversations?fields=id,messages…` คืน `id` ของเธรดจริง (2) `/{id}/messages?after=` คืนหน้าถัดไปที่เก่ากว่าหน้าแรก — ห้ามเชื่อรูปร่าง response จากความจำ (`external-payload-schema.md`)

- [ ] **Step 6: แก้ `syncMissingMessagesFromMeta` ให้ไล่หน้า**

🛑 **กับดักที่ต้องรู้ก่อนแก้:** โค้ดเดิมตัดสินว่าจะอัปเดต `lastMessageAt`/preview ด้วยการเทียบ `newest.createdTime > conv.lastMessageAt` โดย `conv` ถูกอ่าน **ครั้งเดียวตอนต้นฟังก์ชัน** ⇒ ถ้าย้ายบล็อกนั้นเข้าไปในลูป หน้า 2 (ข้อความเก่ากว่าหน้า 1) ยังชนะค่าเดิมได้ แล้ว **เขียนทับด้วยเวลาที่เก่ากว่า** = แถวในรายการถอยหลังและ preview ผิด โดยไม่มีอะไรฟ้อง ⇒ **ลูปทำแค่ insert แล้วสะสม "ใบใหม่สุด" ข้ามทุกหน้า อัปเดต `Conversation` ครั้งเดียวหลังลูป**

สกัดส่วน "หาใบที่ขาด → `resolveBackfillBatch` → `createMany`" ออกเป็นฟังก์ชันภายในไฟล์ ให้คืนของที่ใช้ตัดสิน bump มาด้วย:

```ts
type InsertedBatch = {
  added: number
  /** ใบที่เวลาใหม่สุดในชุดที่เพิ่ง insert พร้อม preview ของมัน — null = ไม่ได้ insert อะไร */
  newest: { createdTime: Date; preview: string; senderRole: 'SHOP' | 'BUYER' } | null
  newestInboundAt: Date | null
}

async function insertMissingPage(
  conversationId: string,
  shopId: string,
  pageId: string,
  remote: GraphThreadMessage[],
): Promise<InsertedBatch> {
  if (remote.length === 0) return { added: 0, newest: null, newestInboundAt: null }
  const known = new Set(
    (
      await prisma.chatMessage.findMany({
        where: { conversationId, externalMessageId: { in: remote.map((m) => m.id) } },
        select: { externalMessageId: true },
      })
    ).map((m) => m.externalMessageId),
  )
  const missing = remote.filter((m) => !known.has(m.id))
  if (missing.length === 0) return { added: 0, newest: null, newestInboundAt: null }

  const contents = await resolveBackfillBatch(missing, shopId)
  const result = await prisma.chatMessage.createMany({
    data: missing.map((m, i) => ({
      conversationId,
      senderRole: m.fromId === pageId ? 'SHOP' : 'BUYER',
      ...contents[i]!,
      ...(contents[i]!.cards ? { cards: contents[i]!.cards as Prisma.InputJsonValue } : { cards: undefined }),
      createdAt: m.createdTime,
      externalMessageId: m.id,
      rawMessage: toRawMessage('facebook', m, 'graph-backfill'),
    })),
    skipDuplicates: true,
  })

  const newestIdx = missing.reduce((best, m, i) => (m.createdTime > missing[best]!.createdTime ? i : best), 0)
  const newest = missing[newestIdx]!
  const inbound = missing.filter((m) => m.fromId !== pageId)
  return {
    added: result.count,
    newest: {
      createdTime: newest.createdTime,
      preview: backfillPreview(contents[newestIdx]!),
      senderRole: newest.fromId === pageId ? 'SHOP' : 'BUYER',
    },
    newestInboundAt: inbound.length
      ? inbound.reduce((a, m) => (m.createdTime > a ? m.createdTime : a), inbound[0]!.createdTime)
      : null,
  }
}
```

ตัวฟังก์ชันหลัก (คง throttle / ตรวจสิทธิ์ / `try…catch` เดิมไว้ทั้งหมด):

```ts
    const pageId = conv.shopChannel.externalId
    const alreadyComplete = conv.metaBackfilledAt !== null
    let cursor: { threadId: string; after: string } | undefined
    let pageNo = 0
    let added = 0
    let newest: InsertedBatch['newest'] = null
    let newestInboundAt: Date | null = null

    for (;;) {
      pageNo += 1
      const page = await fetchThreadMessagesPage(conv.externalContact.externalUserId, pageToken, {
        limit: 100,
        cursor,
      })
      const batch = await insertMissingPage(conversationId, conv.shopChannel.shopId, pageId, page.items)
      added += batch.added
      if (batch.newest && (!newest || batch.newest.createdTime > newest.createdTime)) newest = batch.newest
      if (batch.newestInboundAt && (!newestInboundAt || batch.newestInboundAt > newestInboundAt)) {
        newestInboundAt = batch.newestInboundAt
      }

      // เธรดที่ไล่ครบแล้ว: หน้าเดียวพอ (เก็บข้อความอัตโนมัติของ Meta รอบล่าสุดที่ webhook ไม่ส่ง)
      if (alreadyComplete) break

      const oldest = page.items.reduce<Date | null>(
        (min, m) => (min === null || m.createdTime < min ? m.createdTime : min),
        null,
      )
      const step = decideBackfillStep({
        oldestInPage: oldest,
        conversationCreatedAt: conv.createdAt,
        pageNo,
        hasNextPage: page.nextAfter !== null && page.threadId !== null,
        maxPages: MAX_BACKFILL_PAGES,
      })
      if (step.markComplete) {
        await prisma.conversation.update({ where: { id: conversationId }, data: { metaBackfilledAt: new Date() } })
      }
      if (step.stop) break
      cursor = { threadId: page.threadId!, after: page.nextAfter! }
    }

    // อัปเดตสรุปเธรด "ครั้งเดียว" ด้วยใบใหม่สุดข้ามทุกหน้า — กฎเดิม: ใบเก่าที่เพิ่งเติมย้อนหลัง
    // ต้องไม่ขยับ preview/เวลาในรายการ (เทียบกับค่าตอนต้นฟังก์ชันได้ เพราะเราไม่ได้เขียนมันระหว่างลูป)
    const bumpMessage = newest !== null && (!conv.lastMessageAt || newest.createdTime > conv.lastMessageAt)
    const bumpInbound = newestInboundAt !== null && (!conv.lastInboundAt || newestInboundAt > conv.lastInboundAt)
    if (bumpMessage || bumpInbound) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ...(bumpMessage
            ? { lastMessageAt: newest!.createdTime, lastMessagePreview: newest!.preview, lastSenderRole: newest!.senderRole }
            : {}),
          ...(bumpInbound ? { lastInboundAt: newestInboundAt! } : {}),
        },
      })
    }

    return { added, outcome: added > 0 ? 'added' : 'nothing-missing' }
```

- [ ] **Step 7: ยืนยัน**

Run: `npx tsc --noEmit` → Expected: 0 errors
Run: `npx vitest run src/lib/__tests__/meta-backfill-bound.test.ts` → Expected: PASS

- [ ] **Step 8: commit**

```bash
git add src/lib/meta-backfill-bound.ts src/lib/__tests__/meta-backfill-bound.test.ts src/lib/facebook/graph.ts src/services/channel-chat.service.ts
git commit -m "feat(00018): backfill จาก Meta ไล่ย้อนถึงวันที่สร้างเธรด ครั้งเดียวแล้วปักธง

fetchThreadMessages เดิมโยน paging ของ nested edge ทิ้งทั้งก้อน จึงไล่ย้อนได้
แค่ 50 ใบหน้าเดียวตลอดกาล เธรดที่ขาดเกินนั้นเติมไม่ครบและไม่มีอะไรฟ้อง

stop กับ markComplete ตอบคนละคำถาม — ชนเพดาน 20 หน้าคือ stop=true แต่
markComplete=false ถ้าปักธงตรงนั้นด้วย เธรดยาวจะถูกประกาศว่าครบทั้งที่ยังขาด
(พิสูจน์ด้วย mutation แล้ว)

hasNextPage ตัดสินจาก paging.next ไม่ใช่จากการมี cursor เพราะ Graph ส่ง after
มาให้แม้เป็นหน้าสุดท้าย ⇒ เชื่อ cursor อย่างเดียวจะวนขอหน้าว่างจนชนเพดานทุกเธรด"
```

---

## Task 7: badge Meta AI + เวลาบนบับเบิล

🛑 **Task นี้แตะ UI ⇒ ต้อง invoke `safepay-ux` ออก Design Spec ก่อนเขียนโค้ดบรรทัดแรก (HR8)** และหลัง build เสร็จ Controller ต้องรัน `/impeccable critique` + `/impeccable clarify` เป็น gate ก่อน mark complete

**Files:**
- Modify: `src/lib/meta-system-notice.ts` (เพิ่ม `attributeMetaAi`)
- Create: `src/lib/__tests__/meta-ai-attribution.test.ts`
- Modify: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` (badge + `title`/`aria-label`)

**Interfaces:**
- Consumes: `readMetaAiControlMarker` (มีอยู่แล้ว `meta-system-notice.ts:217`)
- Produces: `attributeMetaAi(messages: { id: string; body: string | null; senderRole: string; senderUserId: string | null; autoReplyKind?: string | null }[]): Set<string>` — คืน set ของ message id ที่ Meta AI เป็นคนตอบ

- [ ] **Step 1: เขียนเทสให้ล้มก่อน**

สร้าง `src/lib/__tests__/meta-ai-attribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { attributeMetaAi } from '@/lib/meta-system-notice'

type M = Parameters<typeof attributeMetaAi>[0][number]
const m = (over: Partial<M> & { id: string }): M => ({
  body: null,
  senderRole: 'SHOP',
  senderUserId: null,
  autoReplyKind: null,
  ...over,
})

describe('[blocker] attributeMetaAi', () => {
  it('ไม่มี marker เลย = ไม่ติดป้ายสักใบ (ห้ามเดา)', () => {
    expect(attributeMetaAi([m({ id: 'a' }), m({ id: 'b' })]).size).toBe(0)
  })

  it('ใบฝั่งร้านที่อยู่ใต้ marker AI = ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'notice', body: 'Your AI agent will respond.' }),
      m({ id: 'a' }),
    ])
    expect(set.has('a')).toBe(true)
  })

  it('ใบที่อยู่หลัง marker HUMAN = ไม่ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'n1', body: 'Your AI agent will respond.' }),
      m({ id: 'a' }),
      m({ id: 'n2', body: 'You took over this chat from your AI agent.' }),
      m({ id: 'b' }),
    ])
    expect(set.has('a')).toBe(true)
    expect(set.has('b')).toBe(false)
  })

  it('ใบที่ส่งจากแอปเรา (มี senderUserId) ไม่ติดป้ายแม้อยู่ใต้ marker AI', () => {
    const set = attributeMetaAi([
      m({ id: 'n', body: 'Your AI agent will respond.' }),
      m({ id: 'a', senderUserId: 'u1' }),
    ])
    expect(set.has('a')).toBe(false)
  })

  it('ใบที่บอทของเราตอบ (มี autoReplyKind) ไม่ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'n', body: 'Your AI agent will respond.' }),
      m({ id: 'a', autoReplyKind: 'KEYWORD' }),
    ])
    expect(set.has('a')).toBe(false)
  })

  it('ข้อความของลูกค้าไม่ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'n', body: 'Your AI agent will respond.' }),
      m({ id: 'a', senderRole: 'BUYER' }),
    ])
    expect(set.has('a')).toBe(false)
  })
})
```

🛑 **สตริง marker ในเทสคัดจาก `AI_HANDOFF_NOTICES` จริงแล้ว (ยืนยัน 2026-09-14)** — `'Your AI agent will respond.'` = AI · `'You took over this chat from your AI agent.'` = HUMAN · ร่างแรกของแผนนี้พิมพ์ตัวหลังจากความจำเป็น `…from the AI agent.` ซึ่งไม่ match ⇒ เทสเคส HUMAN จะแดงด้วยเหตุผลผิด (บทเรียนเดียวกับ 2026-08-08 ที่เดาสตริงที่ 4 ผิด)

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/lib/__tests__/meta-ai-attribution.test.ts`
Expected: FAIL — `attributeMetaAi is not a function`

- [ ] **Step 3: เขียน `attributeMetaAi` ใน `src/lib/meta-system-notice.ts`**

วางไว้ **ติดกับ `readMetaAiControlMarker`** (HR16 — ของเรื่องเดียวกันอยู่ด้วยกัน):

```ts
/**
 * attributeMetaAi — บับเบิลไหนที่ "เอเจนต์ AI ของ Meta" เป็นคนตอบ (2026-09-14)
 *
 * ไล่จากบนลงล่าง จำ control ล่าสุดที่ marker ประกาศไว้ แล้วติดป้ายให้ข้อความฝั่งร้านที่อยู่
 * ในช่วงที่ AI ถือสิทธิ์
 *
 * 🛑 **ไม่มี marker = ไม่ติดป้าย ห้ามเดา** — เคยพลาดมาแล้วกับ `viaStandby` ที่ถูกตีความว่า
 *    "AI ถือห้อง" แล้วบล็อกช่องพิมพ์ผิด 18 เธรดพร้อมกัน (2026-08-09) ป้ายที่ผิดแย่กว่าไม่มีป้าย
 *
 * เงื่อนไขอีก 2 ข้อกันการติดป้ายให้ข้อความที่ไม่ใช่ของ Meta AI:
 *   · senderUserId != null  = คนในทีมร้านกดส่งจากแอปเรา
 *   · autoReplyKind != null = บอทของเราเอง (DeepBot/DeepAI)
 */
export function attributeMetaAi(
  messages: {
    id: string
    body: string | null
    senderRole: string
    senderUserId: string | null
    autoReplyKind?: string | null
  }[],
): Set<string> {
  const out = new Set<string>()
  let control: MetaAiThreadControl | null = null
  for (const m of messages) {
    const marker = readMetaAiControlMarker(m.body)
    if (marker) {
      control = marker
      continue
    }
    if (control !== 'AI') continue
    if (m.senderRole !== 'SHOP') continue
    if (m.senderUserId !== null) continue
    if (m.autoReplyKind) continue
    out.add(m.id)
  }
  return out
}
```

- [ ] **Step 4: รันเทสให้ผ่าน แล้ว mutation**

Run: `npx vitest run src/lib/__tests__/meta-ai-attribution.test.ts` → Expected: PASS (6 tests)

mutation: ลบบรรทัด `if (m.senderUserId !== null) continue`
Run: เทสเดิม → Expected: **FAIL** ที่เคส "ส่งจากแอปเรา"

mutation: คืนกลับ แล้วเปลี่ยนค่าเริ่มต้น `let control = null` เป็น `let control = 'AI'`
Run: เทสเดิม → Expected: **FAIL** ที่เคส "ไม่มี marker เลย"

คืนกลับทั้งหมด → PASS

- [ ] **Step 5: invoke `safepay-ux` ขอ Design Spec ของ 2 จุด**

ส่ง prompt ที่ระบุ **3 จุด**: (0) ปุ่ม "ข้อความใหม่" ลอยเหนือช่องพิมพ์ — โผล่เมื่อ `shouldFollowNewMessages()` คืน false แต่มีข้อความใหม่เข้ามา กดแล้ว `scrollToBottom()` + หายไป · ต้องยก pattern จากที่มีอยู่ในรีโปก่อน (grep `scrollToBottom` ใน `(paces)/**`) ห้ามประกอบเอง (spec §5.4) (1) badge "Meta AI" บนบับเบิลฝั่งร้าน — ต้องต่างจาก `AutoReplyTag` ของ DeepBot/DeepAI อย่างชัดเจน **ห้ามใช้ไอคอน `robot` และ `sparkles`** และ **ux ต้องเสนอชื่อไอคอนแล้วให้ Controller ถาม user ก่อน** (HR12) (2) `title` + `aria-label` เวลาเต็มบนทุกบับเบิล — ต้องระบุว่าวาง attribute ที่ element ไหน เพราะ `aria-label` มีผลเฉพาะ element ที่ role รองรับชื่อจากผู้เขียน (`aria-name-requires-supporting-role.md`)

- [ ] **Step 6: ถาม user เรื่องไอคอน แล้ว implement ตาม Design Spec**

ใช้ `formatDateTimeTH` จาก `@/lib/format-date` สำหรับเวลาเต็ม — ห้ามเรียก `Intl` เอง

- [ ] **Step 7: gate**

```bash
npx tsc --noEmit
npx eslint "src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx"
bash scripts/theme-guard.sh   # ถ้ามีในรีโป
grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' "src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx" | grep -v '^\s*//' | grep -v '^\s*\*'
```
Expected: tsc 0 · eslint 0 error · grep emoji คืน 0 บรรทัด (นอกคอมเมนต์)

แล้วรัน `/impeccable critique` และ `/impeccable clarify` ตาม HR8

- [ ] **Step 8: commit**

```bash
git add src/lib/meta-system-notice.ts src/lib/__tests__/meta-ai-attribution.test.ts "src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx"
git commit -m "feat(00018): badge Meta AI บนบับเบิล + เวลาเต็มบนทุกข้อความ

derive จาก marker ที่ Meta ส่งมาเป็นข้อความจริงในเธรด ไม่เพิ่มคอลัมน์ —
ไม่มี marker = ไม่ติดป้าย ห้ามเดา (บทเรียน viaStandby ที่บล็อกช่องพิมพ์ผิด
18 เธรดเพราะตีความธงที่ทำนายไม่ได้ว่าเป็น 'AI ถือห้อง')

เวลาเต็มใส่ทั้ง title และ aria-label เพราะมือถือไม่มี hover และ aria-label
มีผลเฉพาะ element ที่ role รองรับชื่อจากผู้เขียน

Base: theme/paces/... (ตาม Design Spec ของ safepay-ux)"
```

---

## Task 8: เอกสาร

**Files:**
- Create: `docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-09-14.md` (ชื่อโฟลเดอร์จริงให้ `ls "docs/20 - Features/"` ยืนยันก่อน)
- Modify: `docs/SRS.md`
- Modify: `CLAUDE.md` (Current State Snapshots)

- [ ] **Step 1: เขียน EXTENSIONS doc**

ต้องมี: ปัญหาที่แก้พร้อมหลักฐานจากโค้ด · มติ D-1..D-8 · data model ที่เปลี่ยน · API contract ใหม่ · เคสขอบ · หนี้ที่เหลือ · Mermaid diagram ของ flow ใหม่ (ห้าม ASCII)

- [ ] **Step 2: sync `docs/SRS.md`**

งานนี้แตะ data model และ API ⇒ **บังคับตาม HR11**:
- §data model: `ChatMessage.updatedAt`, `Conversation.metaBackfilledAt`
- §API reference: `GET /api/chat/conversations/[id]/messages` รับ `afterSeq` / `afterUpdatedAt` และโหมด delta คืน `nextCursor: null` เสมอ

- [ ] **Step 3: อัปเดต CLAUDE.md Current State Snapshots**

บันทึกวันที่ · commit · สิ่งที่เปลี่ยน · **หนี้ที่เหลือ** (browser QA ทั้งหมด · การเรียงรายการ/unread-first ที่ user เคาะให้แยกรอบ · IG/LINE ยัง backfill ไม่ได้)

- [ ] **Step 4: ตรวจความครบของเอกสารด้วยชื่อไฟล์ ไม่ใช่จำนวน**

```bash
diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/00018 - Facebook Chat Integration/")
```
(รอบนี้เป็น EXTENSIONS ของฟีเจอร์เดิม ไม่ต้องครบ 7 ไฟล์ใหม่ แต่ให้ดูว่าไม่มีไฟล์ไหนของ template หายไป)

- [ ] **Step 5: verify ก่อน push — ต้องอยู่หลัง rebase (HR17)**

```bash
git fetch origin
git rebase origin/main
comm -12 <(git diff --name-only origin/main...HEAD | sort) <(git diff --name-only HEAD...origin/main | sort)
```
ถ้าผลลัพธ์ไม่ว่าง → `git log -p HEAD...origin/main -- <ไฟล์>` อ่าน diff ของอีกฝั่งในไฟล์นั้นก่อน

```bash
npx prisma generate
npx tsc --noEmit
npx vitest run src/
npm run build
git fetch origin && git rev-list --count HEAD..origin/main   # ต้องเป็น 0 ก่อน push
```

- [ ] **Step 6: แจ้ง user ว่าจะ push (migration จะรันบน prod ตอน build — HR15) แล้ว commit**

```bash
git add "docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-09-14.md" docs/SRS.md CLAUDE.md
git commit -m "docs(00018): เอกสารส่วนขยาย 2026-09-14 + sync SRS

SRS ต้อง sync เพราะงานนี้แตะ data model (2 คอลัมน์ใหม่) และ API
(messages endpoint รับ afterSeq/afterUpdatedAt และโหมด delta คืน
nextCursor เป็น null เสมอ) — SRS ที่ค้างคือกับดักที่วางไว้รอคนถัดไป"
```

---

## หนี้ที่รู้ตัวและยอมรับแล้ว

- **browser QA ทั้งหมด** — user ตรวจเอง (ตามแนวทางที่ตกลงกันไว้) จุดเสี่ยงที่ static ตรวจไม่ได้: เปิดห้องซ้ำ 3 รอบดูการกระพริบ · เลื่อนอ่านของเก่าแล้วให้ข้อความใหม่เข้า · กดลบข้อความจากเครื่องลูกค้าแล้วดูว่าจอร้านอัปเดตภายใน 12 วินาที · เปิดเธรดที่ไม่เคยเปิดแล้วดูว่า `replied to an ad.` โผล่แบบไม่กระตุก
- **การเรียงรายการ / unread ลอยขึ้นบน** — user เคาะให้แยกรอบ
- **ข้อความระบบยังนับรวมในโควตา 30 ใบ** (D-5) — เป็นพฤติกรรมที่ตั้งใจ ไม่ใช่ของค้าง
- **IG / LINE ยัง backfill ไม่ได้** — ข้อจำกัดฝั่งแพลตฟอร์ม
- **2 แท็บเปิดห้องเดียวกันไม่ sync store กัน** — ยอมรับได้ ทั้งคู่ reconcile จาก DB ชุดเดียวกัน
