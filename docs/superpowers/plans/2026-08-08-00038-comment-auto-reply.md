# 00038 ตอบกลับคอมเมนต์ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ร้านตั้งค่าต่อเพจ Facebook ได้ว่าเมื่อลูกค้าคอมเมนต์ ระบบจะตอบใต้คอมเมนต์และ/หรือเปิดห้องแชทส่วนตัวให้อัตโนมัติ และทำให้ปุ่ม "ทักแชท" ในแท็บความคิดเห็นกดได้จริงแม้ไม่เปิดออโต้

**Architecture:** เส้นทางขนานกับระบบตอบกลับอัตโนมัติ 00023 ไม่ใช่การขยายมัน — แกนกลางคือ `comment-private-reply.service.ts` (ตัวส่ง private reply ตัวเดียวที่ทั้งปุ่มแมนนวลและตัวยิงอัตโนมัติเรียก) กับ `comment-auto-reply.service.ts` (ด่านคัดกรอง 9 ข้อ) กันซ้ำด้วย partial unique index ที่ระดับ DB ไม่ใช่ตรรกะในโค้ด งานยิงทำใน `after()` หลัง webhook ตอบ 200 แล้ว

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Prisma + PostgreSQL · Valibot (backend validation) · Vitest · Paces (Preline 4 + Tailwind 4) · Meta Graph API v21.0

**เอกสารอ้างอิง (อ่านก่อนเริ่ม):**
- Design spec: `docs/superpowers/specs/2026-08-08-00038-comment-auto-reply-design.md`
- Mockup 3 จอ: `docs/superpowers/specs/2026-08-08-00038-comment-auto-reply-mockup.html`
- PRD/BRD: `docs/20 - Features/00038 - Comment Auto-Reply/` (ผ่าน user review 2026-08-08)

---

## Global Constraints

ทุก task อยู่ใต้ข้อเหล่านี้โดยปริยาย — reviewer ตรวจทุกข้อทุก task

- **HR11 doc-first** — Task 1 ต้องเสร็จก่อน task ที่แตะโค้ดทุกตัว และต้อง sync `docs/SRS.md` ด้วยเพราะงานนี้แตะ data model + API
- **HR8 ux gate** — Task 7 (`safepay-ux` Design Spec) ต้องเสร็จก่อน Task 8/9/10 ซึ่งแตะไฟล์ frontend เกณฑ์คือ **"แตะไฟล์ไหน" ไม่ใช่ "diff มีอะไร"**
- **HR1 theme-copy** — ห้ามประกอบ UI เอง ต้อง copy จากไฟล์ธีมที่ระบุแล้วปรับเนื้อหา
- **HR3** — commit ที่แตะ UI ต้องมีบรรทัด `Base: theme/...` หรือชี้ไฟล์ในโปรเจกต์ที่ยกโครงมา
- **HR7** — ใน `src/app/(paces)/**` ห้าม arbitrary Tailwind value (`text-[NNpx]`, `bg-[rgba()]`, hex) ใช้ primitive ของ Paces เท่านั้น
- **HR9** — toast ใน `(paces)` ใช้ `pacesToast` จาก `@/lib/paces-toast` เท่านั้น · confirm/blocking ใช้ `pacesConfirm`/Swal
- **HR12** — ห้าม emoji ใน UI ทุกจุด ใช้ `@iconify/react` ชื่อ tabler · **ไอคอนเมนู = `tabler-message-reply`** (user เคาะแล้ว 2026-08-08)
- **HR15** — push `main` = รัน `prisma migrate deploy` บน prod อัตโนมัติ ต้องแจ้ง user ก่อนเสมอ · ฐาน local ต้อง apply เองด้วยคำสั่งที่ **ปักหมุด URL localhost ตรง ๆ** (HR14)
- **ภาษา** — UI copy ภาษาไทย · commit body ภาษาไทย · code comment อธิบาย "ทำไม" ภาษาไทย · diagram = Mermaid เท่านั้น
- **วันที่/เวลา** — ใช้ `formatDate`/`formatDateTime`/`formatDateTimeTH` จาก `src/lib/format-date.ts` เท่านั้น ห้าม `toLocaleDateString`
- **Validation** — backend ใช้ Valibot schema จาก `src/lib/validations.ts` · frontend ใช้ Yup + react-hook-form
- **ห้าม subagent แตะ git** — ห้าม `checkout`/`pull`/`merge`/`push` (push main = migrate prod)
- **คำสั่งมาตรฐาน:**
  - type-check: `node node_modules/typescript/lib/tsc.js --noEmit`
  - test ทั้งชุด: `npx vitest run`
  - test ไฟล์เดียว: `npx vitest run <path>`
  - 🛑 **ห้ามใช้ `npm test`** — script นั้นคือ `dotenv -e .env -- npx vitest` แต่เวิร์กทรีนี้
    **ไม่มีไฟล์ `.env`** (มีแต่ `.env.example`) จะล้มทันทีก่อนถึง vitest ด้วยซ้ำ
    เทสของงานนี้ mock `@/lib/prisma` ทั้งหมด จึงไม่ต้องพึ่ง env เลย
  - build: ตัดสินด้วย **exit code** เท่านั้น ห้ามอ่านข้อความ `✓ Compiled` แล้วสรุปว่าผ่าน

---

## File Structure

| ไฟล์ | ความรับผิดชอบ | สถานะ |
|---|---|---|
| `prisma/schema.prisma` | 4 คอลัมน์บน `ShopChannel` · 1 คอลัมน์บน `PageComment` · model `CommentReplyLog` | แก้ |
| `prisma/migrations/20260808120000_comment_auto_reply/migration.sql` | DDL + partial unique index 2 ตัว (Prisma ประกาศเองไม่ได้) | สร้าง |
| `src/services/comment-private-reply.service.ts` | **แกนกลาง** — ส่ง private reply ผ่าน Graph แล้วผูก contact/conversation/message | สร้าง |
| `src/services/comment-auto-reply.service.ts` | ด่านคัดกรอง 9 ข้อ + orchestrate public reply → private reply → log | สร้าง |
| `src/lib/facebook/graph.ts` | เพิ่ม `sendPrivateReplyToComment()` (Graph call ล้วน ไม่แตะ DB) | แก้ |
| `src/services/page-comment.service.ts` | `replyToComment` รับ system actor · `ingestFeedComment` ห้ามทับ `isAutoReply` · query สถานะ 3 ชั้น | แก้ |
| `src/app/api/channels/facebook/webhook/route.ts` | ต่อสาย feed loop → `after()` | แก้ |
| `src/app/api/chat/comments/[commentId]/private-reply/route.ts` | ปุ่มแมนนวล | สร้าง |
| `src/app/api/shops/comment-reply/config/route.ts` | อ่าน/บันทึกตั้งค่าต่อเพจ | สร้าง |
| `src/app/api/shops/comment-reply/logs/route.ts` | ประวัติต่อเพจ | สร้าง |
| `src/app/(paces)/seller/(dashboard)/settings/comment-reply/page.tsx` | หน้าตั้งค่า (server) | สร้าง |
| `src/app/(paces)/seller/(dashboard)/settings/comment-reply/CommentReplyClient.tsx` | การ์ดต่อเพจ + 2 สวิตช์ + ประวัติ | สร้าง |
| `src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx` | ปุ่ม "ทักแชท" จริง + ชิปกรอง 3 สถานะ | แก้ |
| `src/lib/seller-menu.ts` | เมนูใหม่ในกลุ่ม CHAT | แก้ |
| `src/lib/validations.ts` | Valibot schema ของ 2 API ใหม่ | แก้ |

**ข้อค้นพบสำคัญที่กำหนดโครง** — `sendOutboundMessage()` ของ `channel-chat.service.ts` **ใช้กับ private reply ไม่ได้** เพราะมันเช็ค `getWindowState(conversation.lastInboundAt)` แล้ว throw `WINDOW_CLOSED` เมื่อเส้นทางไม่ใช่คนกด (`channel-chat.service.ts:1780`) — ห้องที่เพิ่งเกิดจาก private reply มี `lastInboundAt = null` เสมอ จึงต้องยิง Graph เองใน `graph.ts` แล้วเขียน `ChatMessage` เอง **ห้ามพยายาม reuse `sendOutboundMessage`** เพราะจะเจอ `WINDOW_CLOSED` ทุกครั้งและอาจไปแก้ guard ที่กำลังทำงานถูกอยู่

---

## Task 1: เอกสารที่เหลือ 5 ไฟล์ (HR11 gate)

**Files:**
- Create: `docs/20 - Features/00038 - Comment Auto-Reply/SRS.md`
- Create: `docs/20 - Features/00038 - Comment Auto-Reply/SDS.md`
- Create: `docs/20 - Features/00038 - Comment Auto-Reply/DATABASE.md`
- Create: `docs/20 - Features/00038 - Comment Auto-Reply/API.md`
- Create: `docs/20 - Features/00038 - Comment Auto-Reply/TestCase.md`
- Modify: `docs/SRS.md` (data model + API reference + enums)

**Interfaces:**
- Consumes: PRD `BR-CR-01..23` · BRD `FR-CR-01..14` / `AC-CR-01..30` (มีอยู่แล้ว)
- Produces: รหัส `TFR-xxx` (SRS) · `TD-xxx` (SDS) · `TC-CR-xxx` (TestCase) ที่ task อื่นอ้างถึงในคอมเมนต์โค้ด

- [ ] **Step 1: อ่าน template ทั้ง 5 ไฟล์**

```bash
ls "docs/99 - Rules/Feature-Templates/"
```

อ่านหัวข้อของแต่ละไฟล์ด้วย `grep -n "^## \|^### " "docs/99 - Rules/Feature-Templates/SRS.md"` แล้วคงลำดับ section ตาม template ห้ามสลับ

- [ ] **Step 2: เขียน DATABASE.md**

ต้องมี: schema ของ `CommentReplyLog` เต็ม · 4 คอลัมน์ใหม่บน `ShopChannel` · `PageComment.isAutoReply` · **partial unique index 2 ตัวพร้อมเหตุผลว่าทำไมต้องแยก AUTO/MANUAL** · ER diagram เป็น Mermaid

- [ ] **Step 3: เขียน API.md**

3 endpoint: `GET/PATCH /api/shops/comment-reply/config` · `GET /api/shops/comment-reply/logs` · `POST /api/chat/comments/[commentId]/private-reply` — ระบุ request/response/error code ครบ

- [ ] **Step 4: เขียน SRS.md + SDS.md**

SRS = FR ฉบับเต็มพร้อม acceptance/edge (ใช้รหัส `TFR-xxx`) · SDS = technical decision **ใช้รหัส `TD-xxx` ตาม precedent ของ 00030/00033/00035 ไม่ใช่ `TFR-`** โดยอย่างน้อยต้องมี:
- `TD-001` ทำไมไม่ reuse `sendOutboundMessage` (window guard — ดู File Structure)
- `TD-002` system actor path ของ `replyToComment`
- `TD-003` `isAutoReply` มีผู้เขียน 2 ราย ห้าม webhook เขียนทับ
- `TD-004` partial unique index แทน composite unique ธรรมดา

- [ ] **Step 5: เขียน TestCase.md**

แปลง `AC-CR-01..30` เป็นเคสที่กดตามได้จริง รหัส `TC-CR-xxx` แยกหมวด: ตั้งค่า / อัตโนมัติ / แมนนวล / สถานะ / สิทธิ์

- [ ] **Step 6: sync `docs/SRS.md`**

เพิ่ม model `CommentReplyLog`, คอลัมน์ใหม่, และ 3 endpoint เข้า data model + API reference ของเอกสารระบบ — **ข้อนี้ลืมบ่อยที่สุด** (บทเรียน 00033)

- [ ] **Step 7: ตรวจความครบด้วยชื่อไฟล์ ไม่ใช่จำนวน**

```bash
diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/00038 - Comment Auto-Reply/")
```

Expected: ไม่มี output (ครบทั้ง 7 ไฟล์)

```bash
grep -n "{{" "docs/20 - Features/00038 - Comment Auto-Reply/"*.md
```

Expected: ไม่มี output

- [ ] **Step 8: Commit**

```bash
git add "docs/20 - Features/00038 - Comment Auto-Reply/" docs/SRS.md
git commit -m "docs(00038): SRS/SDS/DATABASE/API/TestCase ครบ 7 ไฟล์ + sync docs/SRS.md"
```

---

## Task 2: Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma` (model `ShopChannel`, `PageComment`, เพิ่ม model `CommentReplyLog`)
- Create: `prisma/migrations/20260808120000_comment_auto_reply/migration.sql`

**Interfaces:**
- Produces: `prisma.commentReplyLog` · `ShopChannel.commentPublicReplyEnabled|commentPublicReplyText|commentPrivateReplyEnabled|commentPrivateReplyText` · `PageComment.isAutoReply`

- [ ] **Step 1: เพิ่ม 4 คอลัมน์ใน model `ShopChannel`**

วางต่อจาก `status` ใน `prisma/schema.prisma`:

```prisma
  // --- feature 00038 ตอบกลับคอมเมนต์ (additive) — ตั้งค่าต่อเพจ ---
  // 🛑 คอลัมน์กลุ่มนี้อยู่แถวเดียวกับ accessTokenEnc — ทุก query ที่ส่งค่าออกไปหา client
  // ต้อง select ระบุคอลัมน์เสมอ ห้ามคืนทั้งแถว
  commentPublicReplyEnabled   Boolean @default(false)
  commentPublicReplyText      String? @db.Text
  commentPrivateReplyEnabled  Boolean @default(false)
  commentPrivateReplyText     String? @db.Text
```

- [ ] **Step 2: เพิ่มคอลัมน์ใน model `PageComment`**

วางต่อจาก `repliedByUserId`:

```prisma
  /// คอมเมนต์นี้เขียนโดยระบบตอบอัตโนมัติ ไม่ใช่คนในทีมร้าน (feature 00038)
  ///
  /// 🛑 คอลัมน์นี้มีผู้เขียน 2 ราย: เราเขียนตอน replyToComment() คืน comment id กลับมา
  /// และ webhook เขียนอีกครั้งเมื่อ Meta ส่ง echo ของคอมเมนต์เดียวกันกลับเข้ามา
  /// ingestFeedComment ต้อง **ไม่** ใส่ field นี้ใน update block ของ upsert ไม่งั้นธงถูกรีเซ็ต
  /// แล้วป้าย "ตอบอัตโนมัติ" จะกะพริบหายไปเอง (คลาสเดียวกับบั๊กรีแอ็กชัน 2026-08-04)
  isAutoReply Boolean @default(false)
```

- [ ] **Step 3: เพิ่ม model `CommentReplyLog`**

วางต่อจาก model `PageComment`:

```prisma
// CommentReplyLog — บันทึกทุกครั้งที่ระบบ/คนตัดสินใจกับคอมเมนต์ ทั้งที่ตอบและที่ข้าม (feature 00038)
// มิเรอร์ AutoReplyLog ของ 00023 และทำหน้าที่กันซ้ำไปในตัวผ่าน partial unique index 2 ตัว
model CommentReplyLog {
  id             String  @id @default(uuid())
  shopChannelId  String
  postId         String
  commentId      String  // PageComment.id ที่เป็นต้นเหตุ
  fromExternalId String? // ผู้คอมเมนต์ (null = Meta ไม่ส่ง from มา → ด่านที่ 4 ข้ามไปแล้ว)

  trigger     String  // "AUTO" | "MANUAL"
  actorUserId String? // MANUAL = คนที่กด · AUTO = null

  publicReplyStatus  String? // "SENT" | "SKIPPED" | "FAILED"
  privateReplyStatus String? // "SENT" | "SKIPPED" | "FAILED"
  skipReason         String? // ดู COMMENT_SKIP_REASONS ใน comment-auto-reply.service.ts
  errorMessage       String? @db.Text
  conversationId     String? // ห้องที่เกิดจาก private reply

  createdAt DateTime @default(now())

  channel ShopChannel  @relation(fields: [shopChannelId], references: [id], onDelete: Cascade)
  post    FacebookPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  comment PageComment  @relation(fields: [commentId], references: [id], onDelete: Cascade)

  // unique 2 ตัวเป็น partial index เขียนมือใน migration.sql — Prisma ประกาศเองไม่ได้
  @@index([shopChannelId, createdAt])
  @@index([commentId])
}
```

- [ ] **Step 4: เพิ่ม back-relation 3 จุด**

ใน `ShopChannel` เพิ่ม `commentReplyLogs CommentReplyLog[]` · ใน `FacebookPost` เพิ่ม `commentReplyLogs CommentReplyLog[]` · ใน `PageComment` เพิ่ม `commentReplyLogs CommentReplyLog[]` — Prisma บังคับให้ประกาศทั้งสองฝั่งของ relation

- [ ] **Step 5: เขียน migration.sql**

สร้าง `prisma/migrations/20260808120000_comment_auto_reply/migration.sql`:

```sql
-- feature 00038 ตอบกลับคอมเมนต์
ALTER TABLE "ShopChannel"
  ADD COLUMN "commentPublicReplyEnabled"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commentPublicReplyText"     TEXT,
  ADD COLUMN "commentPrivateReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commentPrivateReplyText"    TEXT;

ALTER TABLE "PageComment"
  ADD COLUMN "isAutoReply" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CommentReplyLog" (
  "id"                 TEXT NOT NULL,
  "shopChannelId"      TEXT NOT NULL,
  "postId"             TEXT NOT NULL,
  "commentId"          TEXT NOT NULL,
  "fromExternalId"     TEXT,
  "trigger"            TEXT NOT NULL,
  "actorUserId"        TEXT,
  "publicReplyStatus"  TEXT,
  "privateReplyStatus" TEXT,
  "skipReason"         TEXT,
  "errorMessage"       TEXT,
  "conversationId"     TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentReplyLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommentReplyLog"
  ADD CONSTRAINT "CommentReplyLog_shopChannelId_fkey" FOREIGN KEY ("shopChannelId")
    REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommentReplyLog_postId_fkey" FOREIGN KEY ("postId")
    REFERENCES "FacebookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommentReplyLog_commentId_fkey" FOREIGN KEY ("commentId")
    REFERENCES "PageComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CommentReplyLog_shopChannelId_createdAt_idx"
  ON "CommentReplyLog"("shopChannelId", "createdAt");
CREATE INDEX "CommentReplyLog_commentId_idx" ON "CommentReplyLog"("commentId");

-- 🛑 กันซ้ำ 2 ระดับที่เป็นคนละกฎกัน — ดู SDS TD-004
--
-- AUTO = "1 ครั้ง/คน/โพสต์" เป็นกฎของ Deep ไว้กันไม่ให้เพจร้านดูเป็นสแปม
-- MANUAL = "1 ครั้ง/คอมเมนต์" เป็นเพดานของ Meta (private reply ส่งได้ครั้งเดียวต่อคอมเมนต์)
--
-- เอากฎ AUTO ไปครอบ MANUAL ด้วยไม่ได้: คนที่คอมเมนต์ 2 ครั้งบนโพสต์เดียว ร้านต้องทัก
-- ด้วยมือได้ทั้ง 2 อัน เพราะ Meta อนุญาต — การมัดไว้ที่ 1 ครั้งคือเอากฎกันสแปมของบอท
-- ไปมัดมือคน
--
-- ใช้ partial unique index เพราะ Prisma schema ประกาศ WHERE ไม่ได้ (แบบเดียวกับ
-- 20260722000200_shopchannel_active_partial_unique)
CREATE UNIQUE INDEX "CommentReplyLog_auto_once_per_person_post"
  ON "CommentReplyLog"("shopChannelId", "postId", "fromExternalId")
  WHERE "trigger" = 'AUTO';

CREATE UNIQUE INDEX "CommentReplyLog_manual_once_per_comment"
  ON "CommentReplyLog"("commentId")
  WHERE "trigger" = 'MANUAL';
```

- [ ] **Step 6: apply กับฐาน local (ปักหมุด localhost ตาม HR14)**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
npx prisma migrate deploy
```

> ตรวจ user/password/db name จริงจาก `.env.local` ก่อนรัน แต่ **ห้าม** ใช้ `$(...)` ดึงค่ามาใส่ — ต้องพิมพ์ localhost ลงในคำสั่งตรง ๆ ไม่งั้นชน `prod-db-guard` hook
>
> 🛑 **แจ้ง user ก่อนเสมอ (HR15):** prod ไม่ต้องสั่ง migrate เอง — `vercel.json` รัน `prisma migrate deploy` ตอน build อยู่แล้ว push `main` = migrate ขึ้น prod ในตัว · migrate ล้ม = build ล้ม = deploy ไม่ขึ้น ของเก่ายังเสิร์ฟอยู่

- [ ] **Step 7: generate + type-check**

```bash
npx prisma generate && node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: exit code 0

- [ ] **Step 8: ยืนยันว่า partial index เข้าจริง**

```bash
psql "postgresql://postgres:postgres@localhost:5434/safepay" -c "\d \"CommentReplyLog\"" | grep -i "unique.*WHERE"
```

Expected: เห็น 2 บรรทัดที่มี `WHERE (trigger = 'AUTO')` และ `WHERE (trigger = 'MANUAL')`

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260808120000_comment_auto_reply/
git commit -m "feat(00038): schema + migration ตอบกลับคอมเมนต์ — partial unique 2 ตัวแยก AUTO/MANUAL"
```

---

## Task 3: แกนกลาง — ส่ง private reply

**Files:**
- Modify: `src/lib/facebook/graph.ts` (เพิ่มฟังก์ชัน Graph call)
- Create: `src/services/comment-private-reply.service.ts`
- Test: `src/services/__tests__/comment-private-reply.service.test.ts`

**Interfaces:**
- Consumes: `graphFetch()` (มีอยู่แล้วใน `graph.ts`) · `prisma.commentReplyLog` (Task 2)
- Produces:

```ts
// graph.ts
// ใช้ /me/messages ภายใน (pageToken resolve เป็นเพจเอง) จึงไม่รับ pageId — ดู Step 3
export async function sendPrivateReplyToComment(
  pageToken: string,
  commentExternalId: string,
  text: string,
): Promise<{ recipientId: string; messageId: string }>

// comment-private-reply.service.ts
export const PRIVATE_REPLY_WINDOW_MS: number // 7 * 24 * 60 * 60 * 1000
export function isWithinPrivateReplyWindow(commentCreatedTime: Date, now?: Date): boolean
export type PrivateReplyResult =
  | { sent: true; conversationId: string; messageId: string }
  | { sent: false; reason: PrivateReplySkipReason; error?: string }
export type PrivateReplySkipReason =
  | 'COMMENT_NOT_FOUND' | 'FORBIDDEN' | 'CHANNEL_INACTIVE'
  | 'WINDOW_EXPIRED' | 'ALREADY_SENT' | 'EMPTY_TEXT' | 'SEND_FAILED'
export async function sendPrivateReplyToCommentById(params: {
  commentId: string
  text: string
  trigger: 'AUTO' | 'MANUAL'
  actorUserId?: string | null
}): Promise<PrivateReplyResult>
```

- [ ] **Step 1: เขียนเทสหน้าต่าง 7 วัน (pure function ก่อน)**

สร้าง `src/services/__tests__/comment-private-reply.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isWithinPrivateReplyWindow } from '@/services/comment-private-reply.service'

const NOW = new Date('2026-08-08T12:00:00Z')

describe('isWithinPrivateReplyWindow', () => {
  it('คอมเมนต์เมื่อกี้ -> ทักได้', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-08T11:59:00Z'), NOW)).toBe(true)
  })

  it('คอมเมนต์เมื่อ 6 วัน 23 ชม. -> ยังทักได้', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-01T13:00:00Z'), NOW)).toBe(true)
  })

  it('คอมเมนต์เมื่อ 7 วัน 1 นาที -> หมดเวลา', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-01T11:59:00Z'), NOW)).toBe(false)
  })

  it('เวลาคอมเมนต์อยู่ในอนาคต (นาฬิกาเพี้ยน) -> ยังถือว่าทักได้ ไม่ throw', () => {
    expect(isWithinPrivateReplyWindow(new Date('2026-08-09T00:00:00Z'), NOW)).toBe(true)
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
npx vitest run src/services/__tests__/comment-private-reply.service.test.ts
```

Expected: FAIL — `Failed to resolve import "@/services/comment-private-reply.service"`

- [ ] **Step 3: เขียน Graph call ใน `graph.ts`**

วางต่อจาก `createCommentReply` (ประมาณบรรทัด 761):

```ts
/**
 * ทักแชทส่วนตัวจากคอมเมนต์ (Private Replies) — feature 00038
 *
 * contract ล็อกจากเอกสาร Meta "Private Replies" ก่อนเขียนโค้ด ไม่ได้เดา:
 *   POST /{PAGE_ID}/messages
 *   { recipient: { comment_id: "<COMMENT_ID>" }, message: { text: "..." } }
 *   → { recipient_id: "<PSID>", message_id: "<MID>" }
 *
 * 🛑 ข้อจำกัดที่แก้ไม่ได้: ส่งได้ **ครั้งเดียวต่อคอมเมนต์** และภายใน **7 วัน** นับจากเวลาคอมเมนต์
 * ยิงพลาด = เสียสิทธิ์ของคอมเมนต์นั้นถาวร จึงห้ามเรียกฟังก์ชันนี้ซ้ำแบบ retry อัตโนมัติ
 *
 * ใช้ /me/messages ไม่ใช่ /{page-id}/messages ตามที่เอกสาร Meta เขียน — ด้วยเหตุผลเดียวกับ
 * sendTextMessage (graph.ts:524): pageToken resolve /me เป็นเพจให้อยู่แล้ว และ
 * ShopChannel.externalId ของช่องทาง IG เก็บ **IG account id ไม่ใช่ Page id** การยิง externalId
 * เข้า path ตรง ๆ จะได้ "(#3) Application does not have the capability" ทันทีที่เฟส 2 เปิด IG
 * รอบนี้เป็น FB อย่างเดียวจึงยังไม่พัง แต่นี่คือกับดักที่วางไว้รอ ไม่ใช่เรื่องที่ค่อยแก้ทีหลัง
 *
 * หมายเหตุ: ใช้ pages_messaging ที่มีใน CONNECT_SCOPES อยู่แล้ว — ไม่ต้องให้ร้านเชื่อมเพจใหม่
 */
export async function sendPrivateReplyToComment(
  pageToken: string,
  commentExternalId: string,
  text: string,
): Promise<{ recipientId: string; messageId: string }> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { comment_id: commentExternalId },
      message: { text },
    },
  })
  return {
    recipientId: typeof json.recipient_id === 'string' ? json.recipient_id : '',
    messageId: typeof json.message_id === 'string' ? json.message_id : '',
  }
}
```

- [ ] **Step 4: เขียน service — เริ่มจาก pure function ให้เทสเขียว**

สร้าง `src/services/comment-private-reply.service.ts` ส่วนบน:

```ts
/**
 * comment-private-reply.service — จุดเดียวที่ระบบส่ง private reply ออก (feature 00038)
 *
 * ทั้งปุ่ม "ทักแชท" ที่คนกด และตัวยิงอัตโนมัติ เรียกฟังก์ชันเดียวกันที่นี่
 *
 * 🛑 ห้าม reuse sendOutboundMessage() ของ channel-chat.service — มันเช็ค
 * getWindowState(conversation.lastInboundAt) แล้ว throw WINDOW_CLOSED เมื่อเส้นทางไม่ใช่คนกด
 * (channel-chat.service.ts:1780) ซึ่งห้องที่เพิ่งเกิดจาก private reply มี lastInboundAt = null
 * เสมอ จึงตกทุกครั้ง — และ guard ตัวนั้นทำงานถูกอยู่แล้วสำหรับกรณีของมัน ห้ามไปแก้
 */
import { prisma } from '@/lib/prisma'

/** หน้าต่างทักส่วนตัวของ Meta นับจากเวลาที่ลูกค้าคอมเมนต์ */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * ยังทักได้ไหม — แยกเป็น pure function เพื่อให้ UI กับ service ตัดสินด้วยเกณฑ์เดียวกัน
 * เวลาคอมเมนต์ที่อยู่ในอนาคต (นาฬิกาเครื่องเพี้ยน / timezone) ถือว่ายังทักได้ ไม่ใช่ error
 */
export function isWithinPrivateReplyWindow(commentCreatedTime: Date, now: Date = new Date()): boolean {
  return now.getTime() - commentCreatedTime.getTime() < PRIVATE_REPLY_WINDOW_MS
}
```

- [ ] **Step 5: รันเทสให้เขียว**

```bash
npx vitest run src/services/__tests__/comment-private-reply.service.test.ts
```

Expected: PASS ทั้ง 4 เคส

- [ ] **Step 6: เขียนเทสของ `sendPrivateReplyToCommentById`**

เพิ่มในไฟล์เทสเดิม (mock ทั้ง prisma และ graph):

```ts
import { vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pageComment: { findUnique: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    shopChannel: { findUnique: vi.fn() },
    externalContact: { upsert: vi.fn() },
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    chatMessage: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}))
vi.mock('@/lib/facebook/graph', () => ({ sendPrivateReplyToComment: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { sendPrivateReplyToComment } from '@/lib/facebook/graph'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'

const findComment = vi.mocked(prisma.pageComment.findUnique)
const graphSend = vi.mocked(sendPrivateReplyToComment)

function okComment(over: Record<string, unknown> = {}) {
  return {
    id: 'cmt-1',
    externalCommentId: '123_456',
    createdTime: new Date(Date.now() - 60_000),
    isDeleted: false,
    shopChannelId: 'ch-1',
    postId: 'post-1',
    fromExternalId: 'psid-1',
    post: { id: 'post-1', channel: { id: 'ch-1', shopId: 'shop-1', externalId: 'page-1', status: 'ACTIVE' } },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never)
})

describe('sendPrivateReplyToCommentById — เงื่อนไขที่ต้องไม่ส่ง', () => {
  it('ไม่พบคอมเมนต์ -> COMMENT_NOT_FOUND และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(null as never)
    const r = await sendPrivateReplyToCommentById({ commentId: 'x', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'COMMENT_NOT_FOUND' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('คอมเมนต์เกิน 7 วัน -> WINDOW_EXPIRED และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(
      okComment({ createdTime: new Date(Date.now() - 8 * 24 * 3600_000) }) as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'WINDOW_EXPIRED' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('ข้อความว่าง -> EMPTY_TEXT และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(okComment() as never)
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: '   ', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'EMPTY_TEXT' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('เพจไม่ ACTIVE -> CHANNEL_INACTIVE และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(
      okComment({
        post: { id: 'post-1', channel: { id: 'ch-1', shopId: 'shop-1', externalId: 'page-1', status: 'TOKEN_INVALID' } },
      }) as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'AUTO' })
    expect(r).toMatchObject({ sent: false, reason: 'CHANNEL_INACTIVE' })
    expect(graphSend).not.toHaveBeenCalled()
  })

  it('เคยทักคอมเมนต์นี้แล้ว -> ALREADY_SENT และไม่ยิง Graph', async () => {
    findComment.mockResolvedValue(okComment() as never)
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(
      { id: 'log-1', privateReplyStatus: 'SENT', conversationId: 'conv-1' } as never,
    )
    const r = await sendPrivateReplyToCommentById({ commentId: 'cmt-1', text: 'hi', trigger: 'MANUAL', actorUserId: 'u1' })
    expect(r).toMatchObject({ sent: false, reason: 'ALREADY_SENT' })
    expect(graphSend).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: รันเทสให้เห็นว่าแดง**

```bash
npx vitest run src/services/__tests__/comment-private-reply.service.test.ts
```

Expected: 4 เคสแรกเขียว (pure function) · 5 เคสใหม่ FAIL เพราะ `sendPrivateReplyToCommentById is not a function`

- [ ] **Step 8: เขียน `sendPrivateReplyToCommentById`**

ลำดับในฟังก์ชัน (เขียนตามนี้เป๊ะ — ลำดับคือส่วนหนึ่งของความถูกต้อง):

1. `prisma.pageComment.findUnique` พร้อม `include: { post: { include: { channel: { select: { id, shopId, externalId, status } } } } }` → ไม่พบ = `COMMENT_NOT_FOUND`
2. `text.trim()` ว่าง = `EMPTY_TEXT`
3. `trigger === 'MANUAL'` → `canAccessShop(channel.shopId, actorUserId)` ไม่ผ่าน = `FORBIDDEN` · `trigger === 'AUTO'` ข้าม (system actor) แต่ **shopId ต้องมาจากแถวในฐานเท่านั้น ห้ามรับจากพารามิเตอร์**
4. `channel.status !== 'ACTIVE'` = `CHANNEL_INACTIVE`
5. `!isWithinPrivateReplyWindow(comment.createdTime)` = `WINDOW_EXPIRED`
6. `prisma.commentReplyLog.findFirst({ where: { commentId, privateReplyStatus: 'SENT' } })` เจอ = `ALREADY_SENT`
7. `resolveChannelToken(channel.id)` → ถอดโทเคน (ยก helper จาก `page-comment.service.ts:23` มาเป็น export ร่วม หรือ import ตรง)
8. เรียก `sendPrivateReplyToComment(token, comment.externalCommentId, text)` — จับ error → `SEND_FAILED` พร้อม `errorMessage` (ไม่ต้องส่ง pageId — ฟังก์ชันใช้ `/me/messages`)
9. สำเร็จ: `upsert ExternalContact` (`shopChannelId_externalUserId`) → `conversation` (findUnique ตาม `shopChannelId_externalContactId` ไม่พบก็ create ด้วย `channel: 'MESSENGER'`) → `chatMessage.create` (`senderRole: 'SHOP'`, `externalMessageId: messageId`, `body: text`, `type: 'TEXT'`) → `conversation.update` (`lastMessageAt`, `lastMessagePreview`, `lastSenderRole: 'SHOP'`) ทั้งหมดในทรานแซกชันเดียว
10. เขียน/อัปเดต `CommentReplyLog` (`privateReplyStatus`, `conversationId`)

> **ห้ามตั้ง `lastInboundAt`** — ฝั่งเราเป็นคนเริ่ม ห้องนี้ต้องไม่นับเป็นยังไม่อ่าน (`AC-CR-30`) และ `lastInboundAt` เป็นตัวที่เปิดหน้าต่าง 24 ชม. ตั้งเองเท่ากับโกหกว่าลูกค้าตอบแล้ว

- [ ] **Step 9: รันเทสให้เขียวทั้งไฟล์**

```bash
npx vitest run src/services/__tests__/comment-private-reply.service.test.ts
```

Expected: PASS ทั้ง 9 เคส

- [ ] **Step 10: type-check + commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
git add src/lib/facebook/graph.ts src/services/comment-private-reply.service.ts src/services/__tests__/comment-private-reply.service.test.ts
git commit -m "feat(00038): แกนกลางส่ง private reply — ใช้ร่วมกันทั้งปุ่มแมนนวลและตัวยิงอัตโนมัติ"
```

---

## Task 4: ด่านคัดกรอง + ตัวยิงอัตโนมัติ

**Files:**
- Create: `src/services/comment-auto-reply.service.ts`
- Modify: `src/services/page-comment.service.ts` (system actor ใน `replyToComment`)
- Test: `src/services/__tests__/comment-auto-reply.service.test.ts`

**Interfaces:**
- Consumes: `sendPrivateReplyToCommentById()` (Task 3) · `replyToComment()` (แก้ใน task นี้)
- Produces:

```ts
export const COMMENT_SKIP_REASONS = [
  'FROM_PAGE', 'NOT_TOP_LEVEL', 'COMMENT_DELETED', 'NO_SENDER_ID',
  'CHANNEL_INACTIVE', 'DISABLED', 'ALREADY_HANDLED', 'HUMAN_ANSWERED',
] as const
export type CommentSkipReason = (typeof COMMENT_SKIP_REASONS)[number]

/** ด่านคัดกรองล้วน ๆ ไม่แตะ DB ไม่ยิงเน็ต — แยกออกมาเพื่อให้เทสครอบได้ทุกกิ่ง */
export function evaluateCommentGate(input: {
  isFromPage: boolean
  parentExternalId: string | null
  isDeleted: boolean
  fromExternalId: string | null
  channelStatus: string
  publicEnabled: boolean
  publicText: string | null
  privateEnabled: boolean
  privateText: string | null
  hasAutoLogForPerson: boolean
  hasHumanReply: boolean
}): { pass: true } | { pass: false; reason: CommentSkipReason }

export async function processCommentAutoReply(commentId: string): Promise<void>
```

- [ ] **Step 1: เขียนเทสของด่านคัดกรองทั้ง 8 กิ่ง**

สร้าง `src/services/__tests__/comment-auto-reply.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateCommentGate } from '@/services/comment-auto-reply.service'

/** อินพุตที่ผ่านทุกด่าน — แต่ละเทส override เฉพาะช่องที่ทดสอบ */
function ok(over: Partial<Parameters<typeof evaluateCommentGate>[0]> = {}) {
  return {
    isFromPage: false,
    parentExternalId: null,
    isDeleted: false,
    fromExternalId: 'psid-1',
    channelStatus: 'ACTIVE',
    publicEnabled: true,
    publicText: 'ขอบคุณที่สนใจครับ',
    privateEnabled: true,
    privateText: 'สวัสดีครับ',
    hasAutoLogForPerson: false,
    hasHumanReply: false,
    ...over,
  }
}

describe('evaluateCommentGate', () => {
  it('ผ่านทุกด่าน', () => {
    expect(evaluateCommentGate(ok())).toEqual({ pass: true })
  })

  it('คอมเมนต์ของเพจเอง -> FROM_PAGE', () => {
    expect(evaluateCommentGate(ok({ isFromPage: true }))).toEqual({ pass: false, reason: 'FROM_PAGE' })
  })

  it('reply ซ้อน -> NOT_TOP_LEVEL', () => {
    expect(evaluateCommentGate(ok({ parentExternalId: '123_456' }))).toEqual({
      pass: false, reason: 'NOT_TOP_LEVEL',
    })
  })

  it('คอมเมนต์ถูกลบ -> COMMENT_DELETED', () => {
    expect(evaluateCommentGate(ok({ isDeleted: true }))).toEqual({ pass: false, reason: 'COMMENT_DELETED' })
  })

  it('ไม่มี fromExternalId -> NO_SENDER_ID (กันซ้ำไม่ได้ ต้องข้าม)', () => {
    expect(evaluateCommentGate(ok({ fromExternalId: null }))).toEqual({
      pass: false, reason: 'NO_SENDER_ID',
    })
  })

  it('เพจโทเคนหมดอายุ -> CHANNEL_INACTIVE', () => {
    expect(evaluateCommentGate(ok({ channelStatus: 'TOKEN_INVALID' }))).toEqual({
      pass: false, reason: 'CHANNEL_INACTIVE',
    })
  })

  it('ปิดทั้ง 2 สวิตช์ -> DISABLED', () => {
    expect(evaluateCommentGate(ok({ publicEnabled: false, privateEnabled: false }))).toEqual({
      pass: false, reason: 'DISABLED',
    })
  })

  it('เปิดสวิตช์แต่ข้อความว่างทั้งคู่ -> DISABLED', () => {
    expect(evaluateCommentGate(ok({ publicText: '  ', privateText: null }))).toEqual({
      pass: false, reason: 'DISABLED',
    })
  })

  it('เปิดแค่สวิตช์เดียวและมีข้อความ -> ผ่าน', () => {
    expect(evaluateCommentGate(ok({ privateEnabled: false, privateText: null }))).toEqual({ pass: true })
  })

  it('ตอบคนนี้บนโพสต์นี้ไปแล้ว -> ALREADY_HANDLED', () => {
    expect(evaluateCommentGate(ok({ hasAutoLogForPerson: true }))).toEqual({
      pass: false, reason: 'ALREADY_HANDLED',
    })
  })

  it('คนในทีมตอบไปแล้ว -> HUMAN_ANSWERED (บอทต้องหลีกทางให้คน)', () => {
    expect(evaluateCommentGate(ok({ hasHumanReply: true }))).toEqual({
      pass: false, reason: 'HUMAN_ANSWERED',
    })
  })

  it('ลำดับด่าน: เป็นคอมเมนต์ของเพจ + ถูกลบ -> รายงาน FROM_PAGE (ด่านแรกชนะ)', () => {
    expect(evaluateCommentGate(ok({ isFromPage: true, isDeleted: true }))).toEqual({
      pass: false, reason: 'FROM_PAGE',
    })
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
npx vitest run src/services/__tests__/comment-auto-reply.service.test.ts
```

Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: เขียน `evaluateCommentGate`**

```ts
export function evaluateCommentGate(input: {
  /* ...ตาม Interfaces ข้างบน... */
}): { pass: true } | { pass: false; reason: CommentSkipReason } {
  // ลำดับสำคัญ: ด่านที่ "ถูกที่สุด" (ไม่ต้อง query อะไรเพิ่ม) อยู่บน เพื่อให้ caller
  // ตัดจบได้เร็ว และเพื่อให้ skipReason ที่บันทึกเป็นเหตุผล "ต้นทาง" ไม่ใช่เหตุผลปลายทาง
  if (input.isFromPage) return { pass: false, reason: 'FROM_PAGE' }
  if (input.parentExternalId !== null) return { pass: false, reason: 'NOT_TOP_LEVEL' }
  if (input.isDeleted) return { pass: false, reason: 'COMMENT_DELETED' }
  // ไม่มีตัวตนผู้เขียน = partial unique index (shopChannelId, postId, fromExternalId) กันซ้ำไม่ได้
  // เพราะ Postgres ถือว่า NULL <> NULL แถวกลุ่มนี้จะลอดทุกครั้ง ต้องตัดตั้งแต่ตรงนี้
  if (!input.fromExternalId) return { pass: false, reason: 'NO_SENDER_ID' }
  if (input.channelStatus !== 'ACTIVE') return { pass: false, reason: 'CHANNEL_INACTIVE' }

  const publicOn = input.publicEnabled && !!input.publicText?.trim()
  const privateOn = input.privateEnabled && !!input.privateText?.trim()
  if (!publicOn && !privateOn) return { pass: false, reason: 'DISABLED' }

  if (input.hasAutoLogForPerson) return { pass: false, reason: 'ALREADY_HANDLED' }
  if (input.hasHumanReply) return { pass: false, reason: 'HUMAN_ANSWERED' }
  return { pass: true }
}
```

- [ ] **Step 4: รันเทสให้เขียว**

```bash
npx vitest run src/services/__tests__/comment-auto-reply.service.test.ts
```

Expected: PASS ทั้ง 12 เคส

- [ ] **Step 5: เพิ่ม system actor ให้ `replyToComment`**

ใน `src/services/page-comment.service.ts` เปลี่ยนพารามิเตอร์ `actorUserId: string` เป็น:

```ts
export async function replyToComment(params: {
  commentId: string
  message: string
  /**
   * null = เส้นทางระบบ (feature 00038 ตอบอัตโนมัติ) — ไม่มี user จริงให้เช็ค canAccessShop
   *
   * WARNING: นี่ไม่ใช่ flag ข้าม authz แต่เป็นการ **ย้ายคำถาม** แบบเดียวกับ systemShopId ของ
   * sendOutboundMessage (00023 TD-005): shopId ที่ใช้ตัดสินมาจากแถวในฐาน
   * (PageComment → FacebookPost → ShopChannel) เท่านั้น ไม่เคยมาจาก caller
   * caller ที่ถือ commentId จากที่อื่นมาเดา ๆ จึงยิงข้ามร้านไม่ได้
   */
  actorUserId: string | null
  fileId?: string | null
}): Promise<{ id: string }>
```

แก้ 2 จุดในตัวฟังก์ชัน:

```ts
// เดิม: if (!(await canAccessShop(target.post.channel.shopId, params.actorUserId))) throw ...
if (params.actorUserId !== null) {
  if (!(await canAccessShop(target.post.channel.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
}
```

และใน `upsert`:

```ts
create: {
  // ...เดิม...
  repliedByUserId: params.actorUserId,
  // ระบบเป็นผู้เขียน = ติดธงไว้ให้หน้าจอแยกสถานะที่ 3 ได้ (feature 00038)
  isAutoReply: params.actorUserId === null,
},
update: {
  message: params.message || null,
  repliedByUserId: params.actorUserId,
  // 🛑 ห้ามใส่ isAutoReply ใน update ของ ingestFeedComment — แต่ที่นี่ใส่ได้และต้องใส่
  // เพราะนี่คือ "เราเป็นคนเขียน" ไม่ใช่ echo ที่ Meta ส่งกลับมา
  isAutoReply: params.actorUserId === null,
},
```

- [ ] **Step 6: กัน `ingestFeedComment` เขียนทับธง**

เปิด `src/services/page-comment.service.ts` หา `prisma.pageComment.upsert` ใน `ingestFeedComment` — **ยืนยันด้วยตาว่า `update` block ไม่มีคีย์ `isAutoReply`** ถ้ามีให้ลบออก แล้วเขียนคอมเมนต์กำกับ:

```ts
    // 🛑 update block นี้ห้ามมี isAutoReply — Meta ส่ง echo ของคำตอบที่บอทเขียนกลับเข้ามา
    // ผ่านทางนี้ ถ้าเขียนทับด้วยค่า default ธงจะถูกรีเซ็ตแล้วป้าย "ตอบอัตโนมัติ" หายไปเอง
    // (คอลัมน์ที่มีผู้เขียน 2 ราย — docs/conventions/external-payload-schema.md)
```

- [ ] **Step 7: เขียน `processCommentAutoReply`**

ลำดับในฟังก์ชัน:

1. โหลด comment + post + channel (รวม 4 คอลัมน์ตั้งค่า) — ไม่พบ = return เงียบ
2. query `hasAutoLogForPerson` = `commentReplyLog.findFirst({ where: { shopChannelId, postId, fromExternalId, trigger: 'AUTO' } })`
3. query `hasHumanReply` = `pageComment.findFirst({ where: { parentExternalId: comment.externalCommentId, isFromPage: true, isAutoReply: false } })`
4. `evaluateCommentGate(...)` — ไม่ผ่าน → `commentReplyLog.create({ trigger: 'AUTO', skipReason })` แล้ว return
   - ห่อ create ด้วย try/catch: P2002 = อีกเธรดชนะไปแล้ว ไม่ใช่ error
5. `commentReplyLog.create({ trigger: 'AUTO' })` **ก่อนยิง** — จอง slot ด้วย partial unique index
   - P2002 = มีคนทำไปแล้ว → return ทันที (นี่คือชั้นตัดสินของการกันซ้ำ ไม่ใช่ข้อ 2)
6. สวิตช์ public เปิด → `replyToComment({ commentId, message: publicText, actorUserId: null })` — จับ error แยก อัปเดต `publicReplyStatus`
7. สวิตช์ private เปิด → `sendPrivateReplyToCommentById({ commentId, text: privateText, trigger: 'AUTO' })` — อัปเดต `privateReplyStatus` + `conversationId`
   - **ข้อ 6 ล้มเหลวไม่หยุดข้อ 7** (BR-CR-A5)
8. **ห้าม throw ออกจากฟังก์ชันนี้ทุกกรณี** — caller คือ `after()` ของ webhook

- [ ] **Step 8: เขียนเทสของ orchestration**

เพิ่มไฟล์เทสที่สอง `src/services/__tests__/comment-auto-reply-orchestration.test.ts` (แยกไฟล์เพราะไฟล์แรกเป็น pure function ไม่มี mock — ยัดรวมจะต้อง mock ทั้งไฟล์แล้วเทส pure function จะไม่ซื่อสัตย์อีกต่อไป):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pageComment: { findUnique: vi.fn(), findFirst: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/services/page-comment.service', () => ({ replyToComment: vi.fn() }))
vi.mock('@/services/comment-private-reply.service', () => ({
  sendPrivateReplyToCommentById: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { replyToComment } from '@/services/page-comment.service'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'
import { processCommentAutoReply } from '@/services/comment-auto-reply.service'

const publicReply = vi.mocked(replyToComment)
const privateReply = vi.mocked(sendPrivateReplyToCommentById)
const logCreate = vi.mocked(prisma.commentReplyLog.create)

/** คอมเมนต์ที่ผ่านทุกด่าน เพจเปิดทั้ง 2 สวิตช์ */
function okRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cmt-1',
    externalCommentId: '123_456',
    postId: 'post-1',
    shopChannelId: 'ch-1',
    fromExternalId: 'psid-1',
    isFromPage: false,
    parentExternalId: null,
    isDeleted: false,
    createdTime: new Date(),
    post: {
      id: 'post-1',
      channel: {
        id: 'ch-1',
        shopId: 'shop-1',
        externalId: 'page-1',
        status: 'ACTIVE',
        commentPublicReplyEnabled: true,
        commentPublicReplyText: 'ขอบคุณที่สนใจครับ',
        commentPrivateReplyEnabled: true,
        commentPrivateReplyText: 'สวัสดีครับ',
      },
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(okRow() as never)
  vi.mocked(prisma.pageComment.findFirst).mockResolvedValue(null as never) // ไม่มีคนตอบ
  vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never) // ยังไม่เคยตอบ
  logCreate.mockResolvedValue({ id: 'log-1' } as never)
  publicReply.mockResolvedValue({ id: 'reply-1' } as never)
  privateReply.mockResolvedValue({ sent: true, conversationId: 'conv-1', messageId: 'mid-1' } as never)
})

describe('processCommentAutoReply', () => {
  it('เปิดทั้ง 2 สวิตช์ -> ตอบใต้คอมเมนต์ด้วย system actor แล้วทักแชท', async () => {
    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 'cmt-1',
        message: 'ขอบคุณที่สนใจครับ',
        actorUserId: null, // system actor — ไม่ใช่ user จริง
      }),
    )
    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 'cmt-1', text: 'สวัสดีครับ', trigger: 'AUTO' }),
    )
  })

  it('ตอบใต้คอมเมนต์ล้มเหลว -> ยังทักแชทต่อ (BR-CR-A5 ไม่ผูกกันแบบ all-or-nothing)', async () => {
    publicReply.mockRejectedValue(new Error('(#200) Permissions error'))

    await processCommentAutoReply('cmt-1')

    expect(privateReply).toHaveBeenCalledTimes(1)
    expect(vi.mocked(prisma.commentReplyLog.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicReplyStatus: 'FAILED' }),
      }),
    )
  })

  it('คนในทีมตอบไปแล้ว -> ไม่เรียกตัวส่งเลยสักตัว และบันทึก skipReason', async () => {
    vi.mocked(prisma.pageComment.findFirst).mockResolvedValue({ id: 'human-reply' } as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger: 'AUTO', skipReason: 'HUMAN_ANSWERED' }),
      }),
    )
  })

  it('ตอบคนนี้บนโพสต์นี้ไปแล้ว -> ข้าม ALREADY_HANDLED', async () => {
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue({ id: 'log-old' } as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
  })

  it('จองแถว log แล้วชน P2002 (อีกเธรดชนะ) -> หยุดเงียบ ไม่ยิงซ้ำ', async () => {
    logCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
  })

  it('ตัวส่งโยน error -> ฟังก์ชันนี้ต้องไม่ throw ออกไป (caller คือ webhook after())', async () => {
    privateReply.mockRejectedValue(new Error('boom'))

    await expect(processCommentAutoReply('cmt-1')).resolves.toBeUndefined()
  })

  it('ไม่พบคอมเมนต์ -> ไม่ throw และไม่เรียกอะไร', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(null as never)

    await expect(processCommentAutoReply('missing')).resolves.toBeUndefined()
    expect(logCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 9: รันเทสทั้งชุด + type-check**

```bash
npx vitest run src/services/__tests__/comment-auto-reply.service.test.ts
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: PASS ทั้งหมด · tsc exit 0

- [ ] **Step 10: หา call-site เดิมของ `replyToComment` ที่ต้องแก้ตาม**

```bash
grep -rn "replyToComment(" src/ --include="*.ts" --include="*.tsx"
```

Expected: เจอ `src/app/api/chat/comments/[commentId]/reply/route.ts:44` — ตรวจว่ายังส่ง `actorUserId: userId` (string) อยู่ ซึ่งเข้ากับ type ใหม่ `string | null` ได้โดยไม่ต้องแก้

- [ ] **Step 11: Commit**

```bash
git add src/services/comment-auto-reply.service.ts src/services/page-comment.service.ts src/services/__tests__/comment-auto-reply.service.test.ts
git commit -m "feat(00038): ด่านคัดกรอง 8 ข้อ + ตัวยิงอัตโนมัติ + system actor ของ replyToComment"
```

---

## Task 5: ต่อสาย webhook

**Files:**
- Modify: `src/app/api/channels/facebook/webhook/route.ts:127-159` (feed loop) และบล็อก `after()` ท้ายไฟล์

**Interfaces:**
- Consumes: `processCommentAutoReply(commentId)` (Task 4) · `ingestFeedComment()` (มีอยู่แล้ว)
- Produces: ไม่มี export ใหม่

> 📖 **อ่านก่อนเริ่ม: `docs/conventions/webhook-subscription-two-layers.md`** (convention ใหม่
> 2026-08-08 จาก commit `00496e2e`) — การ subscribe webhook ของ Meta มี **2 ชั้น** (ระดับแอปใน
> App Dashboard + ระดับเพจผ่าน `subscribed_apps`) ขาดชั้นไหนก็เงียบเหมือนกัน และ "ไม่มี event
> เข้ามา" หน้าตาเหมือน "ไม่มีอะไรเกิดขึ้น" ทุกประการ
>
> งานนี้ **ไม่ได้เพิ่ม field ใหม่** (ใช้ `feed` ที่ subscribe อยู่แล้วตั้งแต่ 00029) จึงไม่ต้องแตะ
> ทั้งสองชั้น — แต่ถ้าระหว่างทดสอบพบว่าคอมเมนต์ไม่เข้า **ห้ามสรุปว่าโค้ดเราผิด** ให้ไปตรวจ 2 ชั้นนั้น
> ก่อนตามที่ convention บอก

- [ ] **Step 1: ให้ `ingestFeedComment` คืน id ของคอมเมนต์ที่เพิ่งบันทึก**

ใน `src/services/page-comment.service.ts` เปลี่ยน return type จาก `Promise<void>` เป็น:

```ts
/**
 * คืน id ของคอมเมนต์ที่บันทึก (feature 00038 — caller เอาไปสั่งตอบอัตโนมัติใน after())
 * null = ไม่ได้บันทึก (ไม่ใช่คอมเมนต์ / ไม่พบเพจ / เป็น verb=remove)
 *
 * 🛑 คืนเฉพาะกรณี **webhook สด** เท่านั้น — backfillPostComments() ต้องไม่เดินผ่านทางนี้
 * ไม่งั้นคอมเมนต์เก่าเป็นร้อยจะถูกยิงย้อนหลังพร้อมกัน (BR-CR-12 / AC-CR-14)
 */
Promise<string | null>
```

แก้ `return` ทุกจุดในฟังก์ชันให้คืน `null` และจุดสุดท้ายคืน `saved.id`

- [ ] **Step 2: ยืนยันว่า backfill ไม่เดินผ่าน `ingestFeedComment`**

```bash
grep -n "ingestFeedComment" src/services/page-comment.service.ts src/app/api/channels/facebook/webhook/route.ts
```

Expected: เรียกจาก webhook route ที่เดียว — ถ้า `backfillPostComments` เรียกด้วย **หยุดแล้วรายงาน** เพราะจะละเมิด BR-CR-12

- [ ] **Step 3: เก็บ commentId ใน feed loop**

แก้ `src/app/api/channels/facebook/webhook/route.ts` — เพิ่มตัวแปรเหนือ loop (ข้าง ๆ `pendingConversationIds` บรรทัด 125 (ตัวแปร pendingConversationIds)):

```ts
  // คอมเมนต์ที่เพิ่งเข้ามาสด — สั่งตอบอัตโนมัติใน after() หลังตอบ 200 ให้ Meta แล้ว (feature 00038)
  const pendingCommentIds: string[] = []
```

แล้วในบล็อก `if (val.item === 'comment')`:

```ts
    if (val.item === 'comment') {
      const savedId = await ingestFeedComment({
        pageExternalId: pageId,
        change,
        rawChange: change,
      }).catch((e) => {
        console.error('[fb-feed] เก็บคอมเมนต์ไม่สำเร็จ', e instanceof Error ? e.message : e)
        return null
      })
      if (savedId) pendingCommentIds.push(savedId)
    }
```

- [ ] **Step 4: เรียกใน `after()`**

หาบล็อก `after()` ที่มีอยู่แล้ว (ที่เรียก `processPendingForConversation`) แล้วเพิ่มต่อท้าย:

```ts
    // feature 00038 — ตอบกลับคอมเมนต์ ต้องอยู่หลังตอบ 200 ให้ Meta แล้วเช่นกัน
    // ทำทีละอันเรียงกัน ไม่ใช่ Promise.all: คอมเมนต์ใน batch เดียวมักเป็นของคนเดียวกัน
    // การยิงขนานทำให้ทั้งคู่อ่าน log ไม่เจอพร้อมกันแล้วไปชน unique index ทีหลัง
    // ซึ่งเปลืองสิทธิ์เรียก Graph โดยเปล่าประโยชน์
    for (const commentId of pendingCommentIds) {
      await processCommentAutoReply(commentId).catch((e) =>
        console.error('[fb-feed] ตอบคอมเมนต์อัตโนมัติล้มเหลว', commentId, e instanceof Error ? e.message : e),
      )
    }
```

เพิ่ม import ที่หัวไฟล์:

```ts
import { processCommentAutoReply } from '@/services/comment-auto-reply.service'
```

- [ ] **Step 5: ถอด probe log ที่ค้างจาก 00029**

```bash
grep -n "fb-raw-evt\|fb-raw-chg" src/app/api/channels/facebook/webhook/route.ts
```

ลบบล็อก log ดิบเหล่านี้ออก (เป็นหนี้ที่ค้างมาตั้งแต่ 00029 และตอนนี้เรากำลังแก้ไฟล์นี้อยู่พอดี) — **คง `[fb-feed]` ไว้** เพราะยังใช้สืบเวลาคอมเมนต์ไม่เข้า

- [ ] **Step 6: type-check + build**

```bash
node node_modules/typescript/lib/tsc.js --noEmit && npm run build
echo "exit=$?"
```

Expected: `exit=0` — **ตัดสินจาก exit code เท่านั้น** ห้ามอ่านข้อความ `✓ Compiled` แล้วสรุปเอง

> ⚠️ `npm run build` ทับ `.next` ของ dev server ที่ user รันอยู่ → dev server จะล่ม ต้องแจ้ง user

- [ ] **Step 7: Commit**

```bash
git add src/app/api/channels/facebook/webhook/route.ts src/services/page-comment.service.ts
git commit -m "feat(00038): ต่อสาย webhook feed -> ตอบคอมเมนต์อัตโนมัติใน after()"
```

---

## Task 6: API routes

**Files:**
- Create: `src/app/api/chat/comments/[commentId]/private-reply/route.ts`
- Create: `src/app/api/shops/comment-reply/config/route.ts`
- Create: `src/app/api/shops/comment-reply/logs/route.ts`
- Modify: `src/lib/validations.ts`

**Interfaces:**
- Consumes: `sendPrivateReplyToCommentById()` (Task 3)
- Produces:
  - `POST /api/chat/comments/{commentId}/private-reply` — 🛑 **ยึด `API.md` เป็น contract ห้ามยึดบรรทัดนี้** (แผนฉบับแรกเขียน status ผิด แก้ 2026-08-08): state conflict ทั้งหมดเป็น **409** ไม่ใช่ 400
  - `GET /api/shops/comment-reply/config` → `{ channels: Array<{ id, name, avatarUrl, provider, status, publicEnabled, publicText, privateEnabled, privateText }> }`
  - `PATCH /api/shops/comment-reply/config` body `{ shopChannelId, publicEnabled, publicText, privateEnabled, privateText }` → `200 { ok: true }`
  - `GET /api/shops/comment-reply/logs?shopChannelId=&take=` → `{ logs: Array<{ id, createdAt, fromName, postMessage, publicReplyStatus, privateReplyStatus, skipReason, conversationId }> }`

- [ ] **Step 1: เพิ่ม Valibot schema**

ใน `src/lib/validations.ts` ตามรูปแบบของ schema ที่มีอยู่:

```ts
/** feature 00038 — ตั้งค่าตอบกลับคอมเมนต์ต่อเพจ */
export const CommentReplyConfigSchema = v.pipe(
  v.object({
    shopChannelId: v.pipe(v.string(), v.uuid()),
    publicEnabled: v.boolean(),
    publicText: v.nullable(v.pipe(v.string(), v.maxLength(1000))),
    privateEnabled: v.boolean(),
    privateText: v.nullable(v.pipe(v.string(), v.maxLength(1000))),
  }),
  // เปิดสวิตช์แล้วข้อความว่างไม่ได้ (BR-CR-05) — ตรวจที่นี่ด้วย ไม่ใช่แค่ฝั่งหน้าจอ
  v.forward(
    v.check((i) => !i.publicEnabled || !!i.publicText?.trim(), 'ต้องกรอกข้อความก่อนเปิดใช้งาน'),
    ['publicText'],
  ),
  v.forward(
    v.check((i) => !i.privateEnabled || !!i.privateText?.trim(), 'ต้องกรอกข้อความก่อนเปิดใช้งาน'),
    ['privateText'],
  ),
)

/** feature 00038 — ทักแชทส่วนตัวจากคอมเมนต์ (ปุ่มแมนนวล) */
export const PrivateReplySchema = v.object({
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1000)),
})
```

- [ ] **Step 2: เขียน route ปุ่มแมนนวล**

ยกโครงจาก `src/app/api/chat/comments/[commentId]/reply/route.ts` (ไฟล์พี่น้องที่ทำเรื่องเดียวกัน) — auth เหมือนกัน, error mapping เหมือนกัน แล้วเปลี่ยนตัวที่เรียกเป็น `sendPrivateReplyToCommentById`

map ผลลัพธ์เป็น HTTP:

| `reason` | status |
|---|---|
| `COMMENT_NOT_FOUND` | 404 |
| `FORBIDDEN` | 403 |
| `ALREADY_SENT` · `WINDOW_EXPIRED` · `CHANNEL_NOT_ACTIVE` | **409** (state conflict — ไม่ใช่ 400 ที่แปลว่า "คำขอผิดรูป") |
| `EMPTY_TEXT` → `VALIDATION_ERROR` | 400 |
| `SEND_FAILED` → `UPSTREAM_ERROR` | 502 |

> 🛑 **`API.md` คือ contract ที่ freeze แล้ว** — ถ้าตารางนี้ขัดกับ `API.md` ให้ยึด `API.md` เสมอ
> และ `UX-Design-Spec.md` §2.2 (ตาราง error → toast) อิง 409 อยู่แล้ว Task 8 ต้องตรงกับสองไฟล์นั้น

ทุก route ต้องมี `export const dynamic = 'force-dynamic'` + header `Cache-Control: private, no-store` ตามกติกา API ที่ผูกกับ session

- [ ] **Step 3: เขียน config route**

`GET` — คืนเฉพาะเพจ `provider = 'MESSENGER'` ที่ `status <> 'DISCONNECTED'` ของร้านที่ active

> 🛑 **ต้อง `select` ระบุคอลัมน์** ห้าม `findMany` เปล่า ๆ — `ShopChannel.accessTokenEnc` อยู่แถวเดียวกัน การคืนทั้งแถวคือส่งโทเคนเพจออกไปหา client

`PATCH` — `canAccessShop` → ตรวจว่า `shopChannelId` เป็นของร้านที่ active จริง (ไม่ใช่เชื่อค่าจาก client) → `update`

- [ ] **Step 4: เขียน logs route**

`GET` พร้อม `take` ค่าตั้งต้น 50 เพดาน 200 · เรียง `createdAt desc` · join ชื่อผู้คอมเมนต์กับข้อความโพสต์มาให้ · scope ด้วย `shopChannelId` ที่ยืนยันแล้วว่าเป็นของร้าน

- [ ] **Step 5: ทดสอบด้วย curl**

```bash
# ต้องได้ 401/403 เมื่อไม่มี session — ยืนยันว่า authz ไม่หลุด
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/shops/comment-reply/config
```

Expected: `401` หรือ `403` (ไม่ใช่ 200 และไม่ใช่ 500)

- [ ] **Step 6: type-check + commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
git add src/lib/validations.ts "src/app/api/chat/comments/[commentId]/private-reply/" src/app/api/shops/comment-reply/
git commit -m "feat(00038): API ตั้งค่าต่อเพจ + ประวัติ + ปุ่มทักแชทแมนนวล"
```

---

## Task 7: ux gate — Design Spec (HR8)

**Files:**
- Create: `docs/20 - Features/00038 - Comment Auto-Reply/UX-Design-Spec.md`

**Interfaces:**
- Consumes: mockup HTML + PRD/BRD
- Produces: Design Spec ที่ Task 8/9/10 ใช้เป็นแบบ

- [ ] **Step 1: invoke `safepay-ux`**

ส่งให้ ux ครบชุด: mockup path · PRD/BRD path · design spec path · ไฟล์ที่จะแตะ 4 ไฟล์ (Task 8/9/10) · มติ D-1..D-6 · ไอคอนที่ user เคาะ (`tabler-message-reply`)

ux ต้องอ่านเป็นขั้นแรกทุกครั้ง: `DESIGN.md` + `PRODUCT.md` + `.impeccable/design.json` แล้วอ่าน Paces docs `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md` และ Impeccable playbook (`shape.md` ทุกครั้ง · `operate.md` เพราะเป็น `(paces)/**` · `craft-floor.md` ก่อนสรุป)

- [ ] **Step 2: ยืนยันว่า Design Spec มีหัวข้อบังคับ**

```bash
grep -n "### Impeccable compliance\|^Mode:" "docs/20 - Features/00038 - Comment Auto-Reply/UX-Design-Spec.md"
```

Expected: เจอทั้ง 2 บรรทัด — ถ้าไม่มี ส่งกลับให้ ux ทำใหม่ ห้ามข้ามไป Task 8

- [ ] **Step 3: ยืนยันว่า spec ระบุ Theme Source Mapping ครบทุกหน้าจอ**

ต้องมีตารางที่บอกว่าแต่ละ component ยกมาจากไฟล์ไหน — อย่างน้อยต้องครอบ: การ์ดตั้งค่าต่อเพจ · สวิตช์ · textarea · ตารางประวัติ · ปุ่มในแถวคอมเมนต์ · โมดัลยืนยัน · ชิปกรอง

- [ ] **Step 4: Commit**

```bash
git add "docs/20 - Features/00038 - Comment Auto-Reply/UX-Design-Spec.md"
git commit -m "docs(00038): UX Design Spec ผ่าน ux gate (HR8)"
```

---

## Task 8: ปุ่ม "ทักแชท" ในแท็บความคิดเห็น

**Files:**
- Modify: `src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx:1587-1609`
- Create: `src/app/(paces)/seller/(chat)/inbox/comments/PrivateReplyModal.tsx`

**Interfaces:**
- Consumes: `POST /api/chat/comments/{commentId}/private-reply` (Task 6) · Design Spec (Task 7)
- Produces: ไม่มี export ที่ task อื่นใช้

- [ ] **Step 1: อ่านโค้ดเดิมก่อนแก้**

```bash
sed -n '1580,1620p' "src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx"
```

ตรงนี้คือป้ายนับถอยหลังปัจจุบัน พร้อมคอมเมนต์ที่เขียนยอมรับไว้เองว่า "ทักแชท" ยังไม่ใช่ปุ่มกดได้ — **ลบคอมเมนต์นั้นออกเมื่อทำเสร็จ** ไม่งั้นจะกลายเป็นคอมเมนต์ที่โกหก

- [ ] **Step 2: อ่านหน้าพี่น้องหาโมดัลที่ copy ได้**

```bash
grep -rln "useLockBodyScroll" "src/app/(paces)/seller/(chat)/"
```

ยกโครงโมดัลจากไฟล์ที่เจอ — **ต้องเรียก `useLockBodyScroll` และทุก `overflow-y-auto` ต้องมี `overscroll-contain`** (`docs/conventions/overlay-scroll-lock.md`) โมดัลที่ประกอบเองด้วย React state ไม่ได้ล็อก scroll ให้ฟรีเหมือน Preline

- [ ] **Step 3: เขียน `PrivateReplyModal.tsx`**

props: `{ open, comment: { id, fromName, message, createdTime }, defaultText, onClose, onSent }`

เนื้อหาตาม Design Spec — ต้องมี:
- ชื่อผู้คอมเมนต์ + ข้อความที่เขาเขียน (ให้เห็นว่ากำลังทักใคร)
- textarea เติม `defaultText` ให้แล้ว
- คำเตือนว่า **นี่คือข้อความส่วนตัว ส่งได้ครั้งเดียว** — **ห้ามยกคำเตือน "คอมเมนต์นี้เป็นสาธารณะ" ของช่องตอบคอมเมนต์มาใช้ซ้ำ** (FR-CR-10) เพราะจะสื่อผิดทันที
- ปุ่มส่ง disabled เมื่อข้อความว่างหรือกำลังส่ง

- [ ] **Step 4: เปลี่ยนป้ายเป็นปุ่ม 4 สถานะ**

| สถานะ | เงื่อนไข |
|---|---|
| ทักได้ | `isWithinPrivateReplyWindow(c.createdTime)` และไม่มี log `SENT` ของคอมเมนต์นี้ |
| กำลังส่ง | state ระหว่างรอ API |
| ทักแล้ว | มี log `SENT` → แสดงเวลา + ลิงก์ `/inbox/{conversationId}` |
| หมดเวลา | หน้าต่าง 7 วันปิด |

> เกณฑ์หน้าต่างต้องใช้ `isWithinPrivateReplyWindow` จาก service **ตัวเดียวกัน** ไม่ใช่คำนวณซ้ำในไฟล์นี้ — ไม่งั้นสองที่จะเพี้ยนคนละทาง

- [ ] **Step 5: ส่งสถานะ "ทักแล้ว" มาจาก server**

แก้ `getPostComments()` ใน `page-comment.service.ts` ให้แนบ `privateReply: { sentAt, conversationId } | null` ต่อคอมเมนต์ (join `CommentReplyLog` ที่ `privateReplyStatus = 'SENT'`) — client จะได้ไม่ต้องยิง API เพิ่มต่อแถว

- [ ] **Step 6: อัปเดตหน้าจอทันทีหลังส่งสำเร็จ (optimistic)**

หลัง API คืน 200 ต้องอัปเดต state ของแถวนั้นเองทันที ไม่รอ refetch (`AC-CR-19`)

> 🛑 บทเรียนจากหน้าสินค้า 2026-08-06: **response ที่ไม่มี field นั้น ≠ field นั้นไม่เปลี่ยน** — API คืน `conversationId` มาให้แล้ว ต้องเอาไปใส่ใน state ด้วย ไม่ใช่แค่เปลี่ยนป้ายเป็น "ทักแล้ว" แล้วปล่อยลิงก์ว่าง

- [ ] **Step 7: toast + error**

ใช้ `pacesToast` เท่านั้น (HR9) — สำเร็จ = `pacesToast.success` · ล้มเหลว = `pacesToast.error` พร้อมข้อความไทยที่แปลจาก `reason` ไม่ใช่โชว์รหัสดิบ

- [ ] **Step 8: grep gate**

```bash
rg "from ['\"]react-toastify" "src/app/(paces)/seller/(chat)/inbox/comments/"
grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' "src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx" "src/app/(paces)/seller/(chat)/inbox/comments/PrivateReplyModal.tsx" | grep -v "^\s*//"
rg "text-\[|bg-\[rgba|shadow-\[|rounded-\[" "src/app/(paces)/seller/(chat)/inbox/comments/PrivateReplyModal.tsx"
```

Expected: ทั้ง 3 คำสั่งไม่มี output

- [ ] **Step 9: type-check + commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
git add "src/app/(paces)/seller/(chat)/inbox/comments/" src/services/page-comment.service.ts
git commit -m "feat(00038): ปุ่มทักแชทกดได้จริง — ปิดหนี้ที่ค้างจาก 00029

Base: src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx (โครงแถวเดิม)
      + โมดัลยกจากไฟล์พี่น้องในโฟลเดอร์เดียวกัน"
```

---

## Task 9: สถานะ 3 ชั้น + ชิปกรอง

**Files:**
- Modify: `src/services/page-comment.service.ts` (`countUnansweredForShops`, `listCommentPosts`, `getPostComments`)
- Modify: `src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx`
- Test: `src/services/__tests__/comment-reply-status.test.ts`

**Interfaces:**
- Produces:

```ts
export type CommentAnswerState = 'UNANSWERED' | 'BOT_ANSWERED' | 'HUMAN_ANSWERED'

/** ตัวเดียวที่ตัดสินสถานะ — ทั้ง badge, ชิป, และตัวกรอง ต้องผ่านฟังก์ชันนี้ */
export function deriveCommentState(replies: Array<{ isFromPage: boolean; isAutoReply: boolean }>): CommentAnswerState

/** สถานะระดับโพสต์ — ตัวที่แย่ที่สุดชนะ */
export function derivePostState(commentStates: CommentAnswerState[]): CommentAnswerState
```

- [ ] **Step 1: เขียนเทสของทั้ง 2 ฟังก์ชัน**

สร้าง `src/services/__tests__/comment-reply-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveCommentState, derivePostState } from '@/services/page-comment.service'

describe('deriveCommentState', () => {
  it('ไม่มีคำตอบของเพจเลย -> UNANSWERED', () => {
    expect(deriveCommentState([])).toBe('UNANSWERED')
  })

  it('มีแต่คอมเมนต์ของลูกค้าคนอื่น -> UNANSWERED', () => {
    expect(deriveCommentState([{ isFromPage: false, isAutoReply: false }])).toBe('UNANSWERED')
  })

  it('คำตอบของเพจทั้งหมดเป็นของบอท -> BOT_ANSWERED', () => {
    expect(deriveCommentState([{ isFromPage: true, isAutoReply: true }])).toBe('BOT_ANSWERED')
  })

  it('มีคำตอบของคนปนอยู่ -> HUMAN_ANSWERED', () => {
    expect(
      deriveCommentState([
        { isFromPage: true, isAutoReply: true },
        { isFromPage: true, isAutoReply: false },
      ]),
    ).toBe('HUMAN_ANSWERED')
  })
})

describe('derivePostState — ตัวที่แย่ที่สุดชนะ', () => {
  it('มีอันที่ยังไม่ตอบแม้อันเดียว -> UNANSWERED', () => {
    expect(derivePostState(['HUMAN_ANSWERED', 'BOT_ANSWERED', 'UNANSWERED'])).toBe('UNANSWERED')
  })

  it('ไม่มีอันที่ยังไม่ตอบ แต่มีบอทตอบ -> BOT_ANSWERED', () => {
    expect(derivePostState(['HUMAN_ANSWERED', 'BOT_ANSWERED'])).toBe('BOT_ANSWERED')
  })

  it('คนตอบหมดทุกอัน -> HUMAN_ANSWERED', () => {
    expect(derivePostState(['HUMAN_ANSWERED', 'HUMAN_ANSWERED'])).toBe('HUMAN_ANSWERED')
  })

  it('โพสต์ไม่มีคอมเมนต์เลย -> HUMAN_ANSWERED (ไม่มีอะไรค้าง จึงต้องไม่ขึ้นตัวนับ)', () => {
    expect(derivePostState([])).toBe('HUMAN_ANSWERED')
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

```bash
npx vitest run src/services/__tests__/comment-reply-status.test.ts
```

Expected: FAIL — `deriveCommentState is not a function`

- [ ] **Step 3: เขียน 2 ฟังก์ชัน**

```ts
export type CommentAnswerState = 'UNANSWERED' | 'BOT_ANSWERED' | 'HUMAN_ANSWERED'

/**
 * สถานะของคอมเมนต์ 1 อัน ตัดสินจากคำตอบของเพจที่อยู่ใต้มัน (feature 00038 BR-CR-S1)
 *
 * 🛑 ฟังก์ชันนี้ต้องเป็นทางเดียวที่ตัดสินสถานะ — ทั้งตัวนับบน badge, ตัวเลขบนชิป และตัวกรอง
 * ที่ใช้จริง ต้องผ่านตัวนี้ จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" พร้อมกันมาแล้วเพราะคำนวณคนละที่
 * (docs/conventions/sibling-surface-parity.md)
 */
export function deriveCommentState(
  replies: Array<{ isFromPage: boolean; isAutoReply: boolean }>,
): CommentAnswerState {
  const pageReplies = replies.filter((r) => r.isFromPage)
  if (pageReplies.length === 0) return 'UNANSWERED'
  return pageReplies.some((r) => !r.isAutoReply) ? 'HUMAN_ANSWERED' : 'BOT_ANSWERED'
}

/**
 * สถานะของโพสต์ = ตัวที่แย่ที่สุดในบรรดาคอมเมนต์ของมัน (BR-CR-S2)
 *
 * ต้องเป็นแบบนี้เพื่อให้ 3 กลุ่มไม่ทับกันและรวมกันได้เท่ายอดทั้งหมด (AC-CR-27)
 * โพสต์ที่ไม่มีคอมเมนต์ของลูกค้าเลยถือว่าไม่มีอะไรค้าง จึงต้องไม่ไปโผล่ใน "ยังไม่ตอบ"
 */
export function derivePostState(commentStates: CommentAnswerState[]): CommentAnswerState {
  if (commentStates.includes('UNANSWERED')) return 'UNANSWERED'
  if (commentStates.includes('BOT_ANSWERED')) return 'BOT_ANSWERED'
  return 'HUMAN_ANSWERED'
}
```

- [ ] **Step 4: รันให้เขียว**

```bash
npx vitest run src/services/__tests__/comment-reply-status.test.ts
```

Expected: PASS ทั้ง 8 เคส

- [ ] **Step 5: แก้ `countUnansweredForShops` ให้ไม่นับคำตอบของบอท**

> ⚠️ ฟังก์ชันนี้เปลี่ยนชื่อและ signature ไปแล้วจาก feature 00037 (กล่องแชทรวมหลายร้าน) —
> เดิม `countUnansweredForShop({ shopId })` ตอนนี้เป็น **`countUnansweredForShops({ shopIds: string[], actorUserId })`**
> และใช้ `assertShopsAccessible()` แทน `canAccessShop()` · ผู้เรียกจริงคือ
> `src/app/api/chat/inbox-tab-counts/route.ts:37` ซึ่งส่ง `scope.shopIds` จาก `resolveChatScope()`
> **ห้ามย้อนกลับไปเป็นเอกพจน์** และห้ามอ่าน `activeShopId` ในเส้นทางนี้ (docs/SRS.md §7.14)

ใน raw query ที่มีอยู่ (`page-comment.service.ts:739`) เปลี่ยน `NOT EXISTS` ให้เช็ค `r."isAutoReply" = false` ด้วย:

```sql
      AND NOT EXISTS (
        SELECT 1 FROM "PageComment" r
        WHERE r."parentExternalId" = c."externalCommentId"
          AND r."isFromPage" = true
          AND r."isAutoReply" = false   -- feature 00038: คำตอบของบอทไม่ทำให้หายจากคิว
      )
```

**คงคอมเมนต์เดิมที่อธิบายว่าทำไมหน่วยเป็น "จำนวนโพสต์" ไว้** — เหตุผลนั้นยังใช้ได้และมีที่มาจาก user

- [ ] **Step 6: เพิ่มตัวนับ 3 กลุ่ม + `?state=` ให้ `listCommentPosts`**

คืน `{ posts, counts: { all, unanswered, botAnswered, humanAnswered } }` — คำนวณจาก `derivePostState` ทั้งหมด **ห้ามนับด้วย SQL แยกแล้วกรองด้วย TS** (บทเรียน Command Center 2026-08-04: กดเลข 5 เข้าไปเจอ 4)

- [ ] **Step 7: เพิ่มชิปกรองใน `CommentsClient.tsx`**

ยกโครงชิปจากที่มีอยู่แล้วในไฟล์ ("ทั้งหมด / ยังไม่ตอบ") เพิ่มอีก 2 อัน · ผูก `?state=` · ตัวเลขบนชิปมาจาก `counts` ที่ server คำนวณ

- [ ] **Step 8: ป้าย "ตอบอัตโนมัติ" บนคำตอบของบอท**

ในบล็อกที่ render คำตอบของเพจ เพิ่ม badge เมื่อ `isAutoReply` — ใช้ `badge` + `bg-warning/15` ตาม HR7 ห้าม hardcode สี

- [ ] **Step 9: ยืนยันว่าตัวเลขตรงกัน**

```bash
npx vitest run src/services/__tests__/comment-reply-status.test.ts
node node_modules/typescript/lib/tsc.js --noEmit
```

แล้วตรวจด้วยตาในโค้ด: ตัวเลขบนชิปทั้ง 3 ต้องมาจาก `counts` ตัวเดียวกับที่ badge ใช้ — ถ้ามีที่ไหนคำนวณซ้ำ **หยุดแล้วรวมให้เหลือที่เดียว**

- [ ] **Step 10: Commit**

```bash
git add src/services/page-comment.service.ts src/services/__tests__/comment-reply-status.test.ts "src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx"
git commit -m "feat(00038): สถานะ 3 ชั้น + ชิปกรอง — คำตอบของบอทไม่กลบคิวที่ต้องใช้คน

Base: ชิปกรองยกจากแถบ ทั้งหมด/ยังไม่ตอบ เดิมในไฟล์เดียวกัน"
```

---

## Task 10: หน้าตั้งค่า + เมนู

**Files:**
- Create: `src/app/(paces)/seller/(dashboard)/settings/comment-reply/page.tsx`
- Create: `src/app/(paces)/seller/(dashboard)/settings/comment-reply/CommentReplyClient.tsx`
- Modify: `src/lib/seller-menu.ts`

**Interfaces:**
- Consumes: `GET/PATCH /api/shops/comment-reply/config` · `GET /api/shops/comment-reply/logs` (Task 6) · Design Spec (Task 7)

- [ ] **Step 1: copy โครงหน้าจากพี่น้อง (HR1)**

```bash
cat "src/app/(paces)/seller/(dashboard)/settings/auto-reply/page.tsx"
cat "src/app/(paces)/seller/(dashboard)/settings/auto-reply/AutoReplyListing.tsx"
```

ยก layout/หัวข้อ/breadcrumb/empty state มาใช้ แล้วปรับเนื้อหา — **ห้ามประกอบเอง**

- [ ] **Step 2: เขียน `page.tsx` (server component)**

โหลดรายการเพจฝั่ง server แล้วส่งเข้า client component

> 🛑 หน้านี้อยู่ใต้ client layout ของ Paces → prop ทุกตัวถูก serialize เข้า flight payload
> **ห้ามส่ง `accessTokenEnc` หรือ object เพจทั้งก้อน** ส่งเฉพาะ field ที่หน้าจอใช้จริง
> (`feedback_rsc_pii_neutralize_at_source`) และ prop ต้อง serializable ห้ามมีฟังก์ชันใน object

- [ ] **Step 3: เขียน `CommentReplyClient.tsx`**

การ์ดต่อเพจตาม Design Spec + mockup — สวิตช์ / textarea / ปุ่มบันทึก / ตารางประวัติ / แถบเตือนเมื่อ `TOKEN_INVALID`

- [ ] **Step 4: ตรวจ `.card` ที่ต้องสูงเท่ากัน**

ถ้ามีแถวที่วางการ์ดหลายใบข้างกัน ต้องใส่ `h-full` ที่การ์ดทุกใบ — `.card` ของ Paces เป็น `height: fit-content` ซึ่งชนะ `items-stretch` (`feedback_paces_card_hfit_vs_hfull`)

- [ ] **Step 5: เพิ่มเมนู**

ใน `src/lib/seller-menu.ts` เพิ่มต่อจากบรรทัด 114:

```ts
      { url: '/settings/comment-reply', slug: 'seller:settings-comment-reply', label: 'ตอบกลับคอมเมนต์', icon: 'message-reply' },
```

- [ ] **Step 6: 🛑 ห้ามเพิ่ม slug เข้า array ใด ๆ ของ vertical gating**

```bash
grep -n "_ONLY_SLUGS\|SHARED_PRODUCT_SLUGS\|VERTICAL_VISIBLE_SLUGS\|ALL_VERTICAL_SCOPED_SLUGS" -A 6 src/lib/seller-menu.ts
```

อ่านให้เข้าใจก่อนทำอะไร — **กลไกจริงตรงข้ามกับที่เข้าใจกันบ่อย** (ผู้เขียนแผนเองก็เข้าใจผิดในรอบแรก):

`applyVerticalMenu` ซ่อนเมนูจาก `ALL_VERTICAL_SCOPED_SLUGS` เท่านั้น (`seller-menu.ts:339`) ซึ่งประกอบจาก `LODGING_ONLY_SLUGS` + `ONLINE_SALES_ONLY_SLUGS` + `SERVICE_QUEUE_ONLY_SLUGS` + `SHARED_PRODUCT_SLUGS` — **slug ที่ไม่อยู่ในลิสต์เหล่านี้เลยจะเห็นได้ทุก vertical โดยอัตโนมัติ** ยืนยันได้จาก `seller:inbox` ที่ไม่ปรากฏใน array ไหนเลย (`grep -n "seller:inbox" src/lib/seller-menu.ts` เจอเฉพาะจุดนิยามเมนู กับจุดแปะ badge)

เมนู "ตอบกลับคอมเมนต์" ต้องเห็นได้ทุก vertical → **ไม่ต้องแตะ array พวกนี้เลยสักตัว** การใส่เข้าไปใน `*_ONLY_SLUGS` จะทำให้เมนูถูกซ่อนจาก vertical อื่นทันที ซึ่งเป็นบั๊กที่ตรงข้ามกับเจตนา

- [ ] **Step 7: ยืนยันว่าเมนูไม่ถูก vertical gating แตะ**

```bash
grep -n "seller:settings-comment-reply" src/lib/seller-menu.ts
```

Expected: **1 บรรทัดเท่านั้น** — จุดนิยามเมนูในกลุ่ม CHAT ถ้าเจอมากกว่า 1 แปลว่ามีคนไปใส่ใน array gating แล้ว ต้องเอาออก

ยืนยันเพิ่มด้วยว่าเมนูรอดจริงทั้ง 3 vertical โดยไล่ตรรกะ: slug ไม่อยู่ใน `ALL_VERTICAL_SCOPED_SLUGS` → ไม่เข้า `hidden` → ไม่ถูกกรองออก

- [ ] **Step 8: grep gate**

```bash
rg "from ['\"]react-toastify" "src/app/(paces)/seller/(dashboard)/settings/comment-reply/"
rg "text-\[|bg-\[rgba|shadow-\[|rounded-\[|#[0-9a-fA-F]{6}" "src/app/(paces)/seller/(dashboard)/settings/comment-reply/"
grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' "src/app/(paces)/seller/(dashboard)/settings/comment-reply/" | grep -v "^\s*//"
```

Expected: ทั้ง 3 คำสั่งไม่มี output

- [ ] **Step 9: type-check + build**

```bash
node node_modules/typescript/lib/tsc.js --noEmit && npm run build
echo "exit=$?"
```

Expected: `exit=0` (ตัดสินจาก exit code) · แจ้ง user ว่า build ทับ `.next` ของ dev server

- [ ] **Step 10: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/settings/comment-reply/" src/lib/seller-menu.ts
git commit -m "feat(00038): หน้าตั้งค่าตอบกลับคอมเมนต์ + เมนูใหม่ในกลุ่มแชท

Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/{page,AutoReplyListing}.tsx"
```

---

## Task 11: Impeccable gate + ปิดงาน

**Files:**
- Create: `.impeccable/critique/<timestamp>__00038-comment-reply.md` (สร้างโดย CLI)
- Modify: `CLAUDE.md` (Current State Snapshot)
- Create: `docs/retro/2026-08-08-feature-00038-comment-auto-reply-retrospective.md`

- [ ] **Step 1: รัน critique**

```
/impeccable critique
```

แก้ทุกข้อ P1 ในรอบเดียวกัน — P2/P3 บันทึกเป็น carry ได้

- [ ] **Step 2: รัน clarify**

```
/impeccable clarify
```

ตรวจ copy/error message/label — โดยเฉพาะข้อความที่แปลจาก `skipReason` เป็นภาษาไทย ต้องเป็นภาษาที่ร้านเข้าใจ ไม่ใช่รหัสดิบ (`BR-CR-R` §4.3 ของ PRD มีตารางคำแปลอยู่แล้ว ใช้ตัวนั้น)

- [ ] **Step 3: รันเทสทั้งชุด**

```bash
npx vitest run
```

Expected: เทสของ 00038 เขียวทั้งหมด

> หมายเหตุ: มีเทสแดงค้างอยู่ก่อนหน้านี้ 18 ข้อ (`activity.service` / `chat-*` / `auto-reply` — prisma mock ไม่ครบ) เป็นหนี้ที่มีอยู่ก่อนงานนี้ **ห้ามนับรวมเป็นความล้มเหลวของ 00038 และห้ามพยายามแก้ในรอบนี้** แต่ต้องยืนยันว่าจำนวนเทสแดง **ไม่เพิ่มขึ้น**

- [ ] **Step 4: ตรวจว่าเอกสารครบ**

```bash
diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/00038 - Comment Auto-Reply/" | grep -v "UX-Design-Spec")
```

Expected: ไม่มี output

- [ ] **Step 5: แจ้ง user ก่อน deploy (HR15)**

บอกให้ครบ 3 ข้อ: prod ไม่ต้องสั่ง migrate เอง (push แล้วจบ) · ฐาน local ต้อง apply เอง · migrate ล้ม = build ล้ม = deploy ไม่ขึ้น ของเก่ายังเสิร์ฟอยู่

- [ ] **Step 6: เขียน retro + อัปเดต CLAUDE.md**

retro ต้องมีอย่างน้อย: สิ่งที่ static check มองไม่เห็น · บทเรียนเรื่อง partial unique index แยก AUTO/MANUAL · เรื่อง `sendOutboundMessage` ที่ reuse ไม่ได้

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/retro/ .impeccable/
git commit -m "docs(00038): retro + snapshot หลังปิดงานตอบกลับคอมเมนต์"
```

---

## Self-Review

**1. Spec coverage** — ไล่ทีละหัวข้อของ design spec:

| หัวข้อ spec | Task |
|---|---|
| §4.1 ชิ้นส่วนใหม่ | 3, 4, 6, 10 |
| §4.2 ชิ้นที่แก้ | 4, 5, 8, 9, 10 |
| §5.1 คอลัมน์ `ShopChannel` | 2 |
| §5.2 `PageComment.isAutoReply` + ผู้เขียน 2 ราย | 2 (schema), 4 Step 6 (กันทับ) |
| §5.3 `CommentReplyLog` + partial unique 2 ตัว | 2 |
| §6.2 ด่านคัดกรอง 8 ข้อ | 4 |
| §6.3 `after()` | 5 |
| §6.4 system actor | 4 Step 5 |
| §7 แกนกลาง 8 ขั้น | 3 |
| §8 ปุ่มแมนนวล 4 สถานะ | 8 |
| §9.1 เมนู + allow-list | 10 Step 5-7 |
| §9.2 หน้าตั้งค่า | 10 |
| §10 สถานะ 3 ชั้น | 9 |
| §11 A-1..A-4 | A-1 (ไม่หน่วง) = ไม่มี task = ถูกต้อง · A-2 (คอมเมนต์ไม่มีข้อความก็ยิง) = ด่านใน Task 4 ไม่มีการเช็คข้อความ = ถูกต้อง · A-3 (ไม่นับยังไม่อ่าน) = Task 3 Step 8 ข้อ 9 · A-4 (ไม่ retry) = Task 4 Step 7 |
| §13 Hard Rules | Global Constraints + grep gate ใน Task 8/10 |

**ช่องว่างที่เจอแล้วปิดในแผนนี้:** §12 "คอมเมนต์ backfill ต้องไม่ถูกยิง" ตอนแรกไม่มี task รองรับ → เพิ่มเป็น Task 5 Step 1-2 (return value ของ `ingestFeedComment` + grep ยืนยันว่า backfill ไม่เดินผ่านทางนั้น)

**2. Placeholder scan** — ไม่มี "TBD" / "handle edge cases" / "similar to Task N" · ทุก step ที่เป็นโค้ดมี code block จริง · step ที่เป็น UI อ้าง Design Spec (Task 7) ซึ่งเป็น artifact ที่มีจริงในแผน ไม่ใช่ placeholder

**3. Type consistency** — ตรวจชื่อข้ามงาน:

- `sendPrivateReplyToComment` (graph.ts, Graph call ล้วน) vs `sendPrivateReplyToCommentById` (service, มี DB) — **ชื่อต่างกันโดยตั้งใจ** ระบุไว้ใน Interfaces ของ Task 3 ทั้งคู่
- `PrivateReplySkipReason` (Task 3) ใช้ใน Task 6 error mapping — ค่าตรงกันทั้ง 7 ตัว
- `CommentSkipReason` (Task 4) ใช้ใน Task 6 logs response + Task 11 clarify — ค่าตรงกันทั้ง 8 ตัว
- `isWithinPrivateReplyWindow` (Task 3) ถูกอ้างใน Task 8 Step 4 — ชื่อและ signature ตรงกัน
- `deriveCommentState` / `derivePostState` (Task 9) — ไม่มี task อื่นเรียก
- `processCommentAutoReply` (Task 4) ถูก import ใน Task 5 Step 4 — ชื่อตรงกัน

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-08-00038-comment-auto-reply.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - dispatch subagent สดต่อ 1 task, review ระหว่าง task, วนไว

**2. Inline Execution** - รันในเซสชันนี้ด้วย executing-plans, ทำเป็นชุดแล้วหยุดให้ตรวจเป็นจุด ๆ

**เลือกแบบไหนครับ?**
