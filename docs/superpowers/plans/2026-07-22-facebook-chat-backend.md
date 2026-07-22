# Facebook / Instagram Chat Integration — Backend Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ข้อความจาก Facebook Page และ Instagram DM ไหลเข้า `Conversation`/`ChatMessage`
ของ Deep ได้จริง และตอบกลับออกไปได้ — ครบทั้ง pipeline ฝั่ง server โดยยังไม่แตะ UI

**Architecture:** ขยาย `Conversation`/`ChatMessage` เดิมให้ channel-aware (`buyerUserId` /
`senderUserId` เป็น nullable + `channel`) แล้วเพิ่ม `ShopChannel` (Page + token เข้ารหัส) กับ
`ExternalContact` (PSID) — webhook route เดียวทำหน้าที่ verify signature แล้ว dispatch ตาม
`entry.object` เข้าสู่ service ที่เขียนลง DB ด้วย transaction เดียวกับ chat เดิม

**Tech Stack:** Next.js 16 App Router, Prisma + PostgreSQL (Supabase), Valibot, Vitest,
Node `crypto` (AES-256-GCM + HMAC-SHA256), Meta Graph API v21.0

**Spec:** `docs/superpowers/specs/2026-07-22-facebook-chat-integration-design.md`

---

## Global Constraints

- **ภาษาเอกสาร/คอมเมนต์:** ไทยเป็นหลัก — ยกเว้น file path, ชื่อ function/class, ชื่อ library, jargon (RSC/JWT/OAuth/PSID)
- **Prisma:** 🛑 ห้าม `prisma migrate dev` / `prisma db pull` — DB dev = prod ตัวเดียวกันและมี drift
  ใช้ migration SQL เขียนมือ + `prisma migrate deploy -e .env.local` **หลังขอ user ยืนยันทุกครั้ง**
  (`docs/conventions/prisma-shared-db-drift.md`)
- **Validation:** backend ใช้ **Valibot** จาก `src/lib/validations.ts` เท่านั้น (ห้าม Yup ฝั่ง server)
- **Test runner:** `npx vitest run <path>` — config `vitest.config.ts` (`environment: node`, alias `@` → `src`)
- **Type-check:** `node node_modules/typescript/lib/tsc.js --noEmit` (ห้ามใช้ `npx tsc` — resolve ผิดตัว)
- **Commit:** 1 task = 1 commit; commit message body ภาษาไทย; ห้าม `git checkout` / `pull` / `merge` / `push` เอง
- **Secret:** ห้าม `console.log` token/secret ทุกกรณี ห้ามส่ง page token กลับ client
- **Graph API version:** ตรึงที่ `v21.0` ผ่านค่าคงที่เดียว ห้าม hardcode กระจาย
- **Notification:** `Notification.userId` เป็น required — ทุกจุดที่สร้าง Notification ต้องกัน `null` ก่อน
- **ห้ามแตะ UI ในแผนนี้** — งาน UI อยู่ในแผนแยก (ดู §Out of scope)

## Out of scope (แผนนี้ไม่ทำ)

งานเหล่านี้อยู่ในแผนถัดไป เพราะต้องผ่าน `safepay-ux` ออก Design Spec ก่อนตาม Hard Rule 8:

- หน้า `/seller/settings/channels`
- badge ช่องทาง + filter + แบนเนอร์ 24h ใน `/inbox`
- ปุ่มสร้างออเดอร์จากเธรด FB
- Facebook Live (นอก scope ทั้ง feature — ดู spec §9)

---

## File Structure

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `prisma/migrations/<ts>_facebook_chat/migration.sql` | สร้าง table ใหม่ + ALTER คอลัมน์เดิม |
| `src/lib/facebook/constants.ts` | `GRAPH_VERSION`, `GRAPH_BASE`, subscribed fields |
| `src/lib/facebook/signature.ts` | verify `X-Hub-Signature-256` (timing-safe) |
| `src/lib/facebook/graph.ts` | เรียก Graph API: exchange token, list pages, subscribe, send, get profile |
| `src/lib/facebook/webhook-types.ts` | Valibot schema ของ payload ที่รับจาก Meta |
| `src/lib/token-crypto.ts` | AES-256-GCM encrypt/decrypt page token |
| `src/services/shop-channel.service.ts` | connect / list / disconnect channel + คืน token ที่ถอดรหัสแล้ว |
| `src/services/channel-chat.service.ts` | `ingestInboundMessage`, `sendOutboundMessage`, `getWindowState` |
| `src/app/api/channels/facebook/webhook/route.ts` | GET verify + POST รับ event |
| `src/app/api/channels/facebook/connect/route.ts` | เริ่ม OAuth (redirect ไป Facebook) |
| `src/app/api/channels/facebook/callback/route.ts` | รับ code → เก็บ channel |
| `src/proxy.ts` (แก้) | ยกเว้น webhook จาก CSRF Origin-check |
| `src/services/chat.service.ts` (แก้) | กัน Notification พังเมื่อ `buyerUserId` เป็น null |
| `scripts/fake-fb-webhook.ts` | ยิง webhook ปลอมที่เซ็น signature จริง (dev/QA) |

---

## Task 0: Feature docs 00018 (PRD + BRD) — GATE

🛑 **Hard Rule 11: ห้าม implement ก่อนมี PRD + BRD ผ่าน user review** งานเขียนโค้ดทุก task
ด้านล่างถูกบล็อกจนกว่า task นี้จะได้ sign-off จาก user

**Files:**
- Create: `docs/20 - Features/00018 - Facebook Chat Integration/PRD.md`
- Create: `docs/20 - Features/00018 - Facebook Chat Integration/BRD.md`
- Template: `docs/99 - Rules/Feature-Templates/`

- [ ] **Step 1: ตรวจว่าเลข 00018 ไม่ชนกับ branch อื่น**

```bash
git log --all --name-only | grep -o "00018 - [A-Za-z &]*" | sort -u
```

Expected: ไม่มีผลลัพธ์ (ถ้ามี = เลขถูกจองแล้ว ต้องขยับเป็น 00018 แล้วแก้ทุกที่ที่อ้างถึง)

- [ ] **Step 2: invoke `safepay-product` ให้เขียน PRD + BRD**

ป้อน spec `docs/superpowers/specs/2026-07-22-facebook-chat-integration-design.md` เป็น input
diagram ทุกชนิดต้องเป็น Mermaid เท่านั้น

- [ ] **Step 3: Controller commit**

```bash
git add "docs/20 - Features/00018 - Facebook Chat Integration/"
git commit -m "docs(00018): PRD + BRD สำหรับ Facebook/Instagram chat integration"
```

- [ ] **Step 4: ขอ user review และรอ sign-off — ห้ามข้ามไป Task 1 ก่อนได้รับอนุมัติ**

---

## Task 1: Migration — schema channel-aware

**Files:**
- Create: `prisma/migrations/<timestamp>_facebook_chat/migration.sql`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `ShopChannel`, `ExternalContact`; ฟิลด์ใหม่บน `Conversation`
  (`channel`, `shopChannelId`, `externalContactId`, `lastInboundAt`) และ `ChatMessage`
  (`externalMessageId`, `deliveryStatus`, `failureReason`); `buyerUserId` / `senderUserId` เป็น nullable

- [ ] **Step 1: แก้ `prisma/schema.prisma` — เพิ่ม 2 model ใหม่**

```prisma
// ShopChannel — Page/IG ที่ร้านผูกไว้ (1 Shop : N channel) — feature 00018
model ShopChannel {
  id                String   @id @default(uuid())
  shopId            String
  provider          String // "MESSENGER" | "INSTAGRAM"
  externalId        String // Page ID หรือ IG Business Account ID
  name              String // ชื่อ Page ณ เวลาเชื่อม — cache ไว้แสดงใน UI ไม่ re-fetch ทุกครั้ง
  avatarUrl         String?
  // accessTokenEnc: page access token ที่ผ่าน AES-256-GCM แล้ว (src/lib/token-crypto.ts)
  // ห้ามเก็บ plaintext ห้าม log ห้ามส่งกลับ client ทุกกรณี
  accessTokenEnc    String
  connectedByUserId String
  status            String   @default("ACTIVE") // "ACTIVE" | "TOKEN_INVALID" | "DISCONNECTED"
  createdAt         DateTime @default(now())

  shop     Shop              @relation(fields: [shopId], references: [id], onDelete: Cascade)
  contacts ExternalContact[]

  @@unique([provider, externalId]) // 1 Page ผูกได้ร้านเดียวทั้งระบบ — กันสองร้านแย่ง inbox เดียวกัน
  @@index([shopId, status])
}

// ExternalContact — ลูกค้าจากช่องทางนอก (PSID/IGSID) — ไม่ใช่ User ของ Deep — feature 00018
model ExternalContact {
  id             String   @id @default(uuid())
  shopChannelId  String
  externalUserId String // PSID / IGSID
  name           String?
  avatarUrl      String?
  customerId     String? // link → Customer (feature 00014) เมื่อได้เบอร์
  createdAt      DateTime @default(now())

  channel       ShopChannel    @relation(fields: [shopChannelId], references: [id], onDelete: Cascade)
  customer      Customer?      @relation(fields: [customerId], references: [id], onDelete: SetNull)
  conversations Conversation[]

  @@unique([shopChannelId, externalUserId]) // PSID เป็น page-scoped — ห้าม dedup ข้าม Page
}
```

- [ ] **Step 2: แก้ `Conversation` ใน `prisma/schema.prisma`**

เปลี่ยน `buyerUserId String` → `buyerUserId String?`, relation `buyer User` → `buyer User?`
แล้วเพิ่มฟิลด์ + index (วางต่อจาก `createdAt`):

```prisma
  // --- feature 00018 Facebook/IG chat (additive) ---
  // channel: "DEEP" = แชทในแอป (ของเดิมทั้งหมด, default ทำให้ backfill ปลอดภัยเอง)
  //          "MESSENGER" | "INSTAGRAM" = เธรดจากช่องทางนอก (buyerUserId เป็น null)
  channel           String    @default("DEEP")
  shopChannelId     String?
  externalContactId String?
  // lastInboundAt: เวลาที่ "ลูกค้า" ส่งข้อความล่าสุด — ฐานคำนวณ 24h messaging window ของ Meta
  // ต่างจาก lastMessageAt ที่ขยับเมื่อฝั่งไหนส่งก็ได้
  lastInboundAt     DateTime?

  shopChannel     ShopChannel?     @relation(fields: [shopChannelId], references: [id], onDelete: Cascade)
  externalContact ExternalContact? @relation(fields: [externalContactId], references: [id], onDelete: Cascade)

  @@unique([shopChannelId, externalContactId]) // 1 เธรดต่อ (Page, PSID) — กัน race แบบเดียวกับ BR-CHAT-02
```

- [ ] **Step 3: แก้ `ChatMessage` ใน `prisma/schema.prisma`**

เปลี่ยน `senderUserId String` → `senderUserId String?`, relation `sender User` → `sender User?`
แล้วเพิ่ม:

```prisma
  // --- feature 00018 (additive) ---
  // externalMessageId: mid จาก Meta — unique เพื่อ idempotency
  // Meta redeliver webhook ซ้ำได้ตลอด และ echo ของข้อความที่เราส่งเองก็กลับมาด้วย mid เดิม
  // unique constraint จึงทำหน้าที่ dedupe ให้ทั้งสองกรณีโดยไม่ต้องเขียน logic แยก
  externalMessageId String? @unique
  deliveryStatus    String? // null = แชทในแอป (ไม่เกี่ยว) | "SENT" | "FAILED"
  failureReason     String?
```

- [ ] **Step 4: เพิ่ม back-relation ที่ `Shop` และ `Customer`**

ใน `model Shop` เพิ่ม `channels ShopChannel[]`
ใน `model Customer` เพิ่ม `externalContacts ExternalContact[]`

- [ ] **Step 5: generate Prisma client แล้ว type-check**

```bash
npx prisma generate
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: `prisma generate` สำเร็จ; `tsc` จะ **ยังไม่ผ่าน** — จะมี error ที่
`src/services/chat.service.ts` เพราะ `buyerUserId` เป็น `string | null` แล้ว
(Task 2 แก้) จดชื่อไฟล์/บรรทัดที่ error ไว้แล้วไปต่อ

- [ ] **Step 6: เขียน migration SQL ด้วยมือ**

สร้าง `prisma/migrations/20260722000000_facebook_chat/migration.sql`:

```sql
-- feature 00018: Facebook/Instagram chat integration
-- additive ล้วน: ไม่ลบคอลัมน์ ไม่เปลี่ยนชนิดข้อมูลเดิม row เดิมได้ channel='DEEP' จาก DEFAULT

CREATE TABLE "ShopChannel" (
  "id"                TEXT NOT NULL,
  "shopId"            TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "externalId"        TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "avatarUrl"         TEXT,
  "accessTokenEnc"    TEXT NOT NULL,
  "connectedByUserId" TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopChannel_provider_externalId_key" ON "ShopChannel"("provider", "externalId");
CREATE INDEX "ShopChannel_shopId_status_idx" ON "ShopChannel"("shopId", "status");

ALTER TABLE "ShopChannel" ADD CONSTRAINT "ShopChannel_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExternalContact" (
  "id"             TEXT NOT NULL,
  "shopChannelId"  TEXT NOT NULL,
  "externalUserId" TEXT NOT NULL,
  "name"           TEXT,
  "avatarUrl"      TEXT,
  "customerId"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalContact_shopChannelId_externalUserId_key"
  ON "ExternalContact"("shopChannelId", "externalUserId");

ALTER TABLE "ExternalContact" ADD CONSTRAINT "ExternalContact_shopChannelId_fkey"
  FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalContact" ADD CONSTRAINT "ExternalContact_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversation: nullable buyerUserId + ฟิลด์ channel
ALTER TABLE "Conversation" ALTER COLUMN "buyerUserId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN "channel"           TEXT NOT NULL DEFAULT 'DEEP';
ALTER TABLE "Conversation" ADD COLUMN "shopChannelId"     TEXT;
ALTER TABLE "Conversation" ADD COLUMN "externalContactId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "lastInboundAt"     TIMESTAMP(3);

CREATE UNIQUE INDEX "Conversation_shopChannelId_externalContactId_key"
  ON "Conversation"("shopChannelId", "externalContactId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shopChannelId_fkey"
  FOREIGN KEY ("shopChannelId") REFERENCES "ShopChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_externalContactId_fkey"
  FOREIGN KEY ("externalContactId") REFERENCES "ExternalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ChatMessage: nullable senderUserId + ฟิลด์ delivery
ALTER TABLE "ChatMessage" ALTER COLUMN "senderUserId" DROP NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN "externalMessageId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "deliveryStatus"    TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "failureReason"     TEXT;

CREATE UNIQUE INDEX "ChatMessage_externalMessageId_key" ON "ChatMessage"("externalMessageId");
```

- [ ] **Step 7: 🛑 ขอ user ยืนยันก่อน apply — migration นี้แตะ prod DB**

พิมพ์ให้ user อ่าน: "migration นี้จะรันบน Supabase ที่ dev/prod แชร์กัน (additive ล้วน
ไม่ลบข้อมูล) ขออนุญาต apply ไหมครับ" **รอคำตอบ ห้ามรันเอง**

- [ ] **Step 8: apply migration (หลังได้ไฟเขียวเท่านั้น)**

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
```

(รันจาก `/Users/craftman/Projects/safepay` ที่มี `.env.local`; ถ้า env ไม่ถูกอ่านอัตโนมัติ
ใช้ `npx dotenv -e .env.local -- npx prisma migrate deploy`)

Expected: `All migrations have been successfully applied.`

- [ ] **Step 9: ยืนยันว่าคอลัมน์ลงจริง**

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.\$queryRawUnsafe(\"select column_name,is_nullable from information_schema.columns where table_name='Conversation' and column_name in ('buyerUserId','channel','lastInboundAt') order by column_name\")
 .then(r=>console.table(r)).finally(()=>p.\$disconnect());
"
```

Expected: `buyerUserId` → `is_nullable = YES`, มีแถว `channel` และ `lastInboundAt`

- [ ] **Step 10: ⚠️ restart dev server**

หลัง migrate ต้อง restart dev server เสมอ ไม่งั้น Prisma client ค้างของเก่า → session 500
(บทเรียนจาก feature Seller Auth) — แจ้ง user ให้ restart

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(00018): schema channel-aware — ShopChannel + ExternalContact + nullable buyer/sender

Conversation.buyerUserId และ ChatMessage.senderUserId เป็น nullable เพื่อรองรับ
เธรดจากช่องทางนอกที่ไม่มี User ใน Deep; channel default 'DEEP' ทำให้ row เดิม
ได้ค่าถูกต้องโดยไม่ต้อง backfill

ChatMessage.externalMessageId unique = กลไก idempotency ตัวเดียวที่ครอบทั้ง
webhook redelivery และ echo ของข้อความที่เราส่งเอง"
```

---

## Task 2: กัน `sendMessage` พังเมื่อเธรดไม่มี buyer

**Files:**
- Modify: `src/services/chat.service.ts:127-218` (`sendMessage`), `:8-31` (types)
- Test: `src/services/__tests__/chat-service-external.test.ts`

**Interfaces:**
- Consumes: Prisma models จาก Task 1
- Produces: `ConversationSummary.buyerUserId` เป็น `string | null`,
  `ChatMessageView.senderUserId` เป็น `string | null`, `sendMessage` ไม่สร้าง Notification
  เมื่อผู้รับเป็น external contact

**บริบท:** `sendMessage` บรรทัด 202 คำนวณ `recipientUserId = isBuyerClaim ? shop.userId :
conversation.buyerUserId` — สำหรับเธรด FB ค่าหลังเป็น `null` แล้ว `Notification.userId`
เป็น required → **Prisma throw ทุกครั้งที่ร้านตอบลูกค้า FB** ต้องแก้ก่อนทำ Task อื่น

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/services/__tests__/chat-service-external.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  shop: { findUnique: vi.fn() },
  chatMessage: { create: vi.fn(), findFirst: vi.fn() },
  notification: { create: vi.fn() },
  user: { findUnique: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}))
vi.mock('@/services/product.service', () => ({ getProductById: vi.fn() }))

import { sendMessage } from '@/services/chat.service'

describe('sendMessage — เธรดช่องทางนอก (buyerUserId = null)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.conversation.findUnique.mockResolvedValue({
      id: 'c1', shopId: 's1', buyerUserId: null, channel: 'MESSENGER',
    })
    tx.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้านทดสอบ' })
    tx.chatMessage.create.mockResolvedValue({
      id: 'm1', conversationId: 'c1', senderUserId: 'owner1', senderRole: 'SHOP',
      type: 'TEXT', body: 'สวัสดีครับ', imageUrl: null, productRefId: null,
      flaggedScam: false, createdAt: new Date(),
    })
    tx.conversation.update.mockResolvedValue({})
  })

  it('ร้านตอบลูกค้า FB ได้โดยไม่สร้าง Notification (ไม่มี User ปลายทาง)', async () => {
    const msg = await sendMessage({
      conversationId: 'c1', senderUserId: 'owner1', senderRole: 'SHOP',
      type: 'TEXT', body: 'สวัสดีครับ',
    })

    expect(msg.id).toBe('m1')
    expect(tx.notification.create).not.toHaveBeenCalled()
  })

  it('ยังกันการปลอม senderRole=BUYER บนเธรดที่ไม่มี buyer', async () => {
    await expect(
      sendMessage({
        conversationId: 'c1', senderUserId: 'attacker', senderRole: 'BUYER',
        type: 'TEXT', body: 'x',
      }),
    ).rejects.toThrow('FORBIDDEN')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/services/__tests__/chat-service-external.test.ts
```

Expected: FAIL — เคสแรกพังเพราะ `notification.create` ถูกเรียกด้วย `userId: null`

- [ ] **Step 3: แก้ type ที่หัวไฟล์ `src/services/chat.service.ts`**

บรรทัด 10 เปลี่ยน `buyerUserId: string` → `buyerUserId: string | null`
บรรทัด 23 เปลี่ยน `senderUserId: string` → `senderUserId: string | null`

แล้วเพิ่มฟิลด์ใหม่เข้า `ConversationSummary` (หลัง `createdAt`):

```ts
  channel: string // "DEEP" | "MESSENGER" | "INSTAGRAM" — feature 00018
  shopChannelId: string | null
  externalContactId: string | null
  lastInboundAt: Date | null
```

- [ ] **Step 4: แก้ block ownership check (บรรทัด 144-148)**

```ts
    // verify role vs. truth — กัน client ปลอม senderRole (FR-CHAT-04-AC-03)
    // เธรดช่องทางนอก (feature 00018) ไม่มี buyerUserId → ไม่มีใครอ้าง BUYER ได้เลย
    const isBuyerClaim = params.senderRole === 'BUYER'
    const ownerMatch = isBuyerClaim
      ? conversation.buyerUserId !== null && conversation.buyerUserId === params.senderUserId
      : shop.userId === params.senderUserId
    if (!ownerMatch) throw new Error('FORBIDDEN')
```

- [ ] **Step 5: แก้ block Notification (บรรทัด 201-214)**

```ts
    // Notification เสมอ (ไม่เช็ค presence — ดู SRS TFR-CHAT-11 rationale) ผู้รับ = อีกฝ่าย
    // feature 00018: เธรดช่องทางนอก ผู้รับคือ ExternalContact ที่ไม่มี User ใน Deep →
    // ข้าม Notification (ลูกค้าได้รับผ่าน Messenger/IG เองอยู่แล้ว) ไม่ใช่ error
    const recipientUserId = isBuyerClaim ? shop.userId : conversation.buyerUserId
    if (recipientUserId) {
      const senderLabel = isBuyerClaim
        ? (await tx.user.findUnique({ where: { id: params.senderUserId }, select: { displayName: true } }))?.displayName ?? 'ผู้ซื้อ'
        : shop.shopName
      await tx.notification.create({
        data: {
          userId: recipientUserId,
          kind: 'chat_message',
          title: `ข้อความใหม่จาก ${senderLabel}`,
          body: preview,
          refId: params.conversationId,
        },
      })
    }
```

- [ ] **Step 6: รัน test ให้ผ่าน + type-check**

```bash
npx vitest run src/services/__tests__/chat-service-external.test.ts
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: test PASS ทั้ง 2 เคส; `tsc` ไม่มี error (error จาก Task 1 Step 5 หายไปหมด)
ถ้ายังมี error ที่ไฟล์อื่นที่อ่าน `buyerUserId`/`senderUserId` ให้แก้ให้รับ `null` ด้วย

- [ ] **Step 7: รัน test เดิมทั้งชุดกัน regression**

```bash
npx vitest run
```

Expected: PASS ทั้งหมด (ถ้ามี test เดิมของ chat พังแปลว่าแก้ผิด ให้ย้อนดู Step 4-5)

- [ ] **Step 8: Commit**

```bash
git add src/services/chat.service.ts src/services/__tests__/chat-service-external.test.ts
git commit -m "fix(00018): sendMessage รองรับเธรดที่ไม่มี buyer

Notification.userId เป็น required — เดิมร้านตอบลูกค้าช่องทางนอกแล้ว Prisma throw
เพราะ recipientUserId เป็น null ตอนนี้ข้าม Notification เมื่อผู้รับไม่ใช่ User ใน
ระบบ (ลูกค้าได้รับผ่าน Messenger/IG เองอยู่แล้ว)

ownership check เพิ่ม null-guard ให้ปลอดภัยเชิงบวก — เธรดที่ buyerUserId เป็น null
จะไม่มีใครอ้าง senderRole=BUYER ผ่านได้"
```

---

## Task 3: เข้ารหัส page token (AES-256-GCM)

**Files:**
- Create: `src/lib/token-crypto.ts`
- Test: `src/lib/__tests__/token-crypto.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `encryptToken(plain: string): string`, `decryptToken(payload: string): string`
  รูปแบบ ciphertext = `"<ivBase64>.<tagBase64>.<cipherBase64>"`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/lib/__tests__/token-crypto.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  // key 32 byte เป็น hex 64 ตัว
  process.env.CHANNEL_TOKEN_KEY = 'a'.repeat(64)
})

describe('token-crypto', () => {
  it('encrypt แล้ว decrypt กลับได้ค่าเดิม', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/token-crypto')
    const plain = 'EAAG_fake_page_access_token_1234567890'
    expect(decryptToken(encryptToken(plain))).toBe(plain)
  })

  it('ciphertext ต่างกันทุกครั้งแม้ plaintext เดิม (IV สุ่ม)', async () => {
    const { encryptToken } = await import('@/lib/token-crypto')
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('ciphertext ที่ถูกแก้ไข → throw (auth tag ไม่ผ่าน)', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/token-crypto')
    const enc = encryptToken('secret')
    const [iv, tag, data] = enc.split('.')
    const tampered = `${iv}.${tag}.${Buffer.from('evil').toString('base64')}`
    expect(() => decryptToken(tampered)).toThrow()
    expect(decryptToken(enc)).toBe('secret') // ของเดิมยังถอดได้
    void data
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/lib/__tests__/token-crypto.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/token-crypto'`

- [ ] **Step 3: เขียน `src/lib/token-crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// เข้ารหัส page access token ก่อนเก็บลง ShopChannel.accessTokenEnc (feature 00018)
// AES-256-GCM: ได้ทั้งความลับและ integrity (auth tag) — ciphertext ที่ถูกแก้จะถอดไม่ผ่าน
// รูปแบบที่เก็บ: "<ivBase64>.<tagBase64>.<cipherBase64>"

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12 // ความยาวมาตรฐานของ GCM

function key(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_KEY
  if (!raw) throw new Error('CHANNEL_TOKEN_KEY_MISSING')
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('CHANNEL_TOKEN_KEY_INVALID') // ต้องเป็น hex 64 ตัว = 32 byte
  return buf
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('CHANNEL_TOKEN_MALFORMED')
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx vitest run src/lib/__tests__/token-crypto.test.ts
```

Expected: PASS ทั้ง 3 เคส

- [ ] **Step 5: เพิ่ม env ใหม่ใน `.env.example`**

```
# feature 00018 Facebook/IG chat
FB_CHAT_APP_ID=
FB_CHAT_APP_SECRET=
FB_WEBHOOK_VERIFY_TOKEN=
# key 32 byte เป็น hex 64 ตัว — สร้างด้วย: openssl rand -hex 32
CHANNEL_TOKEN_KEY=
```

- [ ] **Step 6: แจ้ง user ให้เติม `CHANNEL_TOKEN_KEY` และ `FB_WEBHOOK_VERIFY_TOKEN` ใน `.env.local`**

```bash
openssl rand -hex 32   # → CHANNEL_TOKEN_KEY
openssl rand -hex 16   # → FB_WEBHOOK_VERIFY_TOKEN
```

(`FB_CHAT_APP_ID` / `FB_CHAT_APP_SECRET` user ใส่ไว้แล้วตอนตรวจแอป)

- [ ] **Step 7: Commit**

```bash
git add src/lib/token-crypto.ts src/lib/__tests__/token-crypto.test.ts .env.example
git commit -m "feat(00018): เข้ารหัส page access token ด้วย AES-256-GCM

เลือก GCM เพราะได้ integrity มาด้วย — ciphertext ที่ถูกแก้จะถอดไม่ผ่านแทนที่จะคืน
ค่าขยะเงียบ ๆ IV สุ่มทุกครั้งทำให้ token เดียวกันได้ ciphertext ต่างกัน"
```

---

## Task 4: verify webhook signature

**Files:**
- Create: `src/lib/facebook/constants.ts`, `src/lib/facebook/signature.ts`
- Test: `src/lib/facebook/__tests__/signature.test.ts`

**Interfaces:**
- Produces: `GRAPH_VERSION`, `GRAPH_BASE`, `MESSENGER_SUBSCRIBED_FIELDS`,
  `verifyWebhookSignature(rawBody: string, header: string | null): boolean`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/lib/facebook/__tests__/signature.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'crypto'

const SECRET = 'test_app_secret'
const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')

beforeAll(() => {
  process.env.FB_CHAT_APP_SECRET = SECRET
})

describe('verifyWebhookSignature', () => {
  it('ลายเซ็นถูกต้อง → true', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    const body = JSON.stringify({ object: 'page', entry: [] })
    expect(verifyWebhookSignature(body, sign(body))).toBe(true)
  })

  it('body ถูกแก้หลังเซ็น → false', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    const sig = sign('{"object":"page"}')
    expect(verifyWebhookSignature('{"object":"evil"}', sig)).toBe(false)
  })

  it('ไม่มี header → false', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    expect(verifyWebhookSignature('{}', null)).toBe(false)
  })

  it('header ผิดรูปแบบ (ไม่มี prefix sha256=) → false', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    expect(verifyWebhookSignature('{}', 'deadbeef')).toBe(false)
  })

  it('ลายเซ็นยาวไม่เท่ากัน → false ไม่ throw', async () => {
    const { verifyWebhookSignature } = await import('@/lib/facebook/signature')
    expect(verifyWebhookSignature('{}', 'sha256=abc')).toBe(false)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/lib/facebook/__tests__/signature.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/facebook/signature'`

- [ ] **Step 3: เขียน `src/lib/facebook/constants.ts`**

```ts
// ค่าคงที่กลางของ Facebook/Instagram integration (feature 00018)
// ตรึงเวอร์ชัน Graph API ไว้ที่เดียว — ห้าม hardcode เวอร์ชันกระจายตามไฟล์

export const GRAPH_VERSION = 'v21.0'
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// webhook field ที่ subscribe ให้ Page — messages คือแกนหลัก
// messaging_postbacks เผื่อปุ่ม/quick reply, message_reactions เผื่อไลก์ข้อความ
export const MESSENGER_SUBSCRIBED_FIELDS = ['messages', 'messaging_postbacks', 'message_reactions'] as const

// scope ที่ขอตอนเชื่อม Page — business_management เป็น dependency บังคับของ
// pages_messaging / pages_show_list / instagram_manage_messages (Meta docs)
export const CONNECT_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'business_management',
  'instagram_basic',
  'instagram_manage_messages',
].join(',')
```

- [ ] **Step 4: เขียน `src/lib/facebook/signature.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto'

// ตรวจลายเซ็น webhook ของ Meta (feature 00018)
// route webhook ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts — ลายเซ็นนี้คือ
// authentication เพียงอย่างเดียวของ route นั้น ห้ามผ่อนปรน
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.FB_CHAT_APP_SECRET
  if (!secret || !header || !header.startsWith('sha256=')) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest()
  let received: Buffer
  try {
    received = Buffer.from(header.slice('sha256='.length), 'hex')
  } catch {
    return false
  }
  // timingSafeEqual throw ถ้าความยาวไม่เท่ากัน — เช็คก่อนเพื่อคืน false แทนที่จะพัง
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
npx vitest run src/lib/facebook/__tests__/signature.test.ts
```

Expected: PASS ทั้ง 5 เคส

- [ ] **Step 6: Commit**

```bash
git add src/lib/facebook/
git commit -m "feat(00018): verify ลายเซ็น webhook ของ Meta (HMAC-SHA256 timing-safe)

route webhook ไม่มี Origin header จึงถูกยกเว้นจาก CSRF guard — ลายเซ็นนี้คือ
authentication เพียงอย่างเดียวของ route นั้น เทียบด้วย timingSafeEqual และเช็ค
ความยาวก่อนเพื่อไม่ให้ throw เมื่อ header ผิดรูป"
```

---

## Task 5: Valibot schema ของ webhook payload

**Files:**
- Create: `src/lib/facebook/webhook-types.ts`
- Test: `src/lib/facebook/__tests__/webhook-types.test.ts`

**Interfaces:**
- Produces: `WebhookBodySchema` และ type `WebhookBody`, `MessagingEvent`
  พร้อม helper `extractMessagingEvents(body: WebhookBody): Array<{ object: string; pageId: string; event: MessagingEvent }>`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/lib/facebook/__tests__/webhook-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import { WebhookBodySchema, extractMessagingEvents } from '@/lib/facebook/webhook-types'

const TEXT_EVENT = {
  object: 'page',
  entry: [
    {
      id: '111222333',
      time: 1750000000000,
      messaging: [
        {
          sender: { id: 'PSID_1' },
          recipient: { id: '111222333' },
          timestamp: 1750000000000,
          message: { mid: 'mid.abc', text: 'สนใจสินค้าตัวนี้ครับ' },
        },
      ],
    },
  ],
}

describe('WebhookBodySchema', () => {
  it('รับ payload ข้อความปกติได้', () => {
    const parsed = v.safeParse(WebhookBodySchema, TEXT_EVENT)
    expect(parsed.success).toBe(true)
  })

  it('ปฏิเสธ payload ที่ไม่มี entry', () => {
    expect(v.safeParse(WebhookBodySchema, { object: 'page' }).success).toBe(false)
  })

  it('รับ payload ที่มีรูปแนบได้', () => {
    const withImage = {
      object: 'page',
      entry: [
        {
          id: '111', time: 1,
          messaging: [
            {
              sender: { id: 'PSID_1' }, recipient: { id: '111' }, timestamp: 1,
              message: {
                mid: 'mid.img',
                attachments: [{ type: 'image', payload: { url: 'https://cdn.fb/x.jpg' } }],
              },
            },
          ],
        },
      ],
    }
    expect(v.safeParse(WebhookBodySchema, withImage).success).toBe(true)
  })
})

describe('extractMessagingEvents', () => {
  it('แบน entry[].messaging[] ให้เป็นลิสต์เดียวพร้อม pageId', () => {
    const body = v.parse(WebhookBodySchema, TEXT_EVENT)
    const events = extractMessagingEvents(body)
    expect(events).toHaveLength(1)
    expect(events[0]!.pageId).toBe('111222333')
    expect(events[0]!.object).toBe('page')
    expect(events[0]!.event.message?.text).toBe('สนใจสินค้าตัวนี้ครับ')
  })

  it('entry ที่ไม่มี messaging เลย → ข้ามไม่พัง', () => {
    const body = v.parse(WebhookBodySchema, { object: 'page', entry: [{ id: '1', time: 1 }] })
    expect(extractMessagingEvents(body)).toEqual([])
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/lib/facebook/__tests__/webhook-types.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/facebook/webhook-types'`

- [ ] **Step 3: เขียน `src/lib/facebook/webhook-types.ts`**

```ts
import * as v from 'valibot'

// Schema ของ payload ที่ Meta ยิงเข้า webhook (feature 00018)
// ห้ามเชื่อ shape จาก Meta ตรง ๆ — parse ก่อนใช้เสมอ ฟิลด์ที่เราไม่ใช้ปล่อยผ่านได้
// (Valibot object ตัดฟิลด์เกินทิ้งอยู่แล้ว) แต่ฟิลด์ที่ใช้ต้องมีจริง

const AttachmentSchema = v.object({
  type: v.string(), // "image" | "video" | "audio" | "file" | "fallback" | ...
  payload: v.optional(v.object({ url: v.optional(v.string()) })),
})

const MessageSchema = v.object({
  mid: v.string(),
  text: v.optional(v.string()),
  // is_echo = ข้อความที่ "ฝั่งเพจ" ส่ง — เกิดเมื่อ seller ตอบจากแอป Messenger โดยตรง
  // หรือเป็น echo ของข้อความที่ระบบเราส่งออกไปเอง
  is_echo: v.optional(v.boolean()),
  attachments: v.optional(v.array(AttachmentSchema)),
})

const MessagingEventSchema = v.object({
  sender: v.object({ id: v.string() }),
  recipient: v.object({ id: v.string() }),
  timestamp: v.optional(v.number()),
  message: v.optional(MessageSchema),
})

const EntrySchema = v.object({
  id: v.string(), // Page ID (object=page) หรือ IG Business Account ID (object=instagram)
  time: v.optional(v.number()),
  messaging: v.optional(v.array(MessagingEventSchema)),
})

export const WebhookBodySchema = v.object({
  object: v.string(), // "page" | "instagram"
  entry: v.array(EntrySchema),
})

export type WebhookBody = v.InferOutput<typeof WebhookBodySchema>
export type MessagingEvent = v.InferOutput<typeof MessagingEventSchema>

// แบน entry[].messaging[] ให้เป็นลิสต์เดียว พร้อมพก pageId ของ entry ติดไปด้วย
// เพื่อให้ handler ไม่ต้องวน 2 ชั้นเอง
export function extractMessagingEvents(
  body: WebhookBody,
): Array<{ object: string; pageId: string; event: MessagingEvent }> {
  const out: Array<{ object: string; pageId: string; event: MessagingEvent }> = []
  for (const entry of body.entry) {
    for (const event of entry.messaging ?? []) {
      out.push({ object: body.object, pageId: entry.id, event })
    }
  }
  return out
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx vitest run src/lib/facebook/__tests__/webhook-types.test.ts
```

Expected: PASS ทั้ง 5 เคส

- [ ] **Step 5: Commit**

```bash
git add src/lib/facebook/webhook-types.ts src/lib/facebook/__tests__/webhook-types.test.ts
git commit -m "feat(00018): Valibot schema ของ webhook payload + helper แบน messaging events

ไม่เชื่อ shape ที่ Meta ส่งมา parse ก่อนใช้เสมอ; extractMessagingEvents ยุบการวน
2 ชั้น (entry → messaging) ให้เหลือลิสต์เดียวที่พก pageId ติดไปด้วย"
```

---

## Task 6: Graph API client

**Files:**
- Create: `src/lib/facebook/graph.ts`
- Test: `src/lib/facebook/__tests__/graph.test.ts`

**Interfaces:**
- Consumes: `GRAPH_BASE`, `MESSENGER_SUBSCRIBED_FIELDS` (Task 4)
- Produces:
  - `exchangeCodeForToken(code, redirectUri): Promise<string>`
  - `listManageablePages(userToken): Promise<PageInfo[]>` โดย `PageInfo = { id, name, accessToken, tasks, instagramBusinessAccountId }`
  - `subscribePageToApp(pageId, pageToken): Promise<void>`
  - `getContactProfile(externalUserId, pageToken): Promise<{ name: string | null; avatarUrl: string | null }>`
  - `sendTextMessage(pageId, pageToken, recipientId, text): Promise<string>` (คืน `mid`)
  - `GraphApiError` (class, มี `code`, `subcode`)

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/lib/facebook/__tests__/graph.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listManageablePages, sendTextMessage, GraphApiError } from '@/lib/facebook/graph'

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)

describe('graph client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listManageablePages กรองเฉพาะ Page ที่มี task MESSAGING และ MODERATE', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({
        data: [
          { id: '1', name: 'ร้านผ่าน', access_token: 'tok1', tasks: ['MESSAGING', 'MODERATE', 'ANALYZE'] },
          { id: '2', name: 'ร้านไม่ผ่าน', access_token: 'tok2', tasks: ['ANALYZE'] },
          {
            id: '3', name: 'ร้านมี IG', access_token: 'tok3',
            tasks: ['MESSAGING', 'MODERATE'],
            instagram_business_account: { id: 'IG9' },
          },
        ],
      }),
    )

    const pages = await listManageablePages('user_token')
    expect(pages.map((p) => p.id)).toEqual(['1', '3'])
    expect(pages[1]!.instagramBusinessAccountId).toBe('IG9')
    expect(pages[0]!.instagramBusinessAccountId).toBeNull()
  })

  it('sendTextMessage คืน mid เมื่อสำเร็จ', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({ recipient_id: 'PSID_1', message_id: 'mid.out.1' }),
    )
    await expect(sendTextMessage('PAGE1', 'tok', 'PSID_1', 'สวัสดี')).resolves.toBe('mid.out.1')
  })

  it('error จาก Graph → โยน GraphApiError พร้อม code', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2018278 },
          }),
      } as Response),
    )

    const err = await sendTextMessage('PAGE1', 'tok', 'PSID_1', 'สาย').catch((e) => e)
    expect(err).toBeInstanceOf(GraphApiError)
    expect(err.code).toBe(10)
    expect(err.subcode).toBe(2018278)
  })

  it('ไม่ใส่ access token ลง query string ของ URL (กัน token หลุดเข้า log)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ message_id: 'm' }))
    await sendTextMessage('PAGE1', 'super_secret_token', 'PSID_1', 'hi')
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('super_secret_token')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/lib/facebook/__tests__/graph.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/facebook/graph'`

- [ ] **Step 3: เขียน `src/lib/facebook/graph.ts`**

```ts
import { GRAPH_BASE, MESSENGER_SUBSCRIBED_FIELDS } from './constants'

// Client บาง ๆ ของ Meta Graph API (feature 00018)
// หลักการ: ส่ง access token ผ่าน header Authorization เสมอ ไม่ใส่ใน query string
// เพราะ URL มักถูก log ทั้งเส้น (Vercel log, error tracker) → token หลุดง่าย

export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'GraphApiError'
  }
}

async function graphFetch(
  path: string,
  token: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(init.query ?? {}).toString()
  const url = `${GRAPH_BASE}${path}${qs ? `?${qs}` : ''}`

  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string; code?: number; error_subcode?: number }
    throw new GraphApiError(
      err.message ?? `Graph API error (HTTP ${res.status})`,
      err.code ?? null,
      err.error_subcode ?? null,
      res.status,
    )
  }
  return json
}

export interface PageInfo {
  id: string
  name: string
  accessToken: string
  tasks: string[]
  instagramBusinessAccountId: string | null
}

// แลก authorization code → long-lived user access token
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const appId = process.env.FB_CHAT_APP_ID
  const appSecret = process.env.FB_CHAT_APP_SECRET
  if (!appId || !appSecret) throw new Error('FB_CHAT_APP_CREDENTIALS_MISSING')

  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
  )
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } }
  if (!res.ok || !json.access_token) {
    throw new GraphApiError(json.error?.message ?? 'exchange code failed', null, null, res.status)
  }
  return json.access_token
}

// Page ที่ user ดูแล — เอาเฉพาะที่มีสิทธิ์ MESSAGING + MODERATE ตามที่ Meta กำหนด
// สำหรับการรับ-ส่งข้อความแทนเพจ (Page ที่สิทธิ์ไม่ครบเชื่อมไปก็ส่งข้อความไม่ได้)
export async function listManageablePages(userToken: string): Promise<PageInfo[]> {
  const json = await graphFetch('/me/accounts', userToken, {
    query: { fields: 'id,name,access_token,tasks,instagram_business_account' },
  })
  const rows = (json.data ?? []) as Array<{
    id: string
    name: string
    access_token: string
    tasks?: string[]
    instagram_business_account?: { id: string }
  }>

  return rows
    .filter((r) => (r.tasks ?? []).includes('MESSAGING') && (r.tasks ?? []).includes('MODERATE'))
    .map((r) => ({
      id: r.id,
      name: r.name,
      accessToken: r.access_token,
      tasks: r.tasks ?? [],
      instagramBusinessAccountId: r.instagram_business_account?.id ?? null,
    }))
}

// บอก Meta ให้ยิง webhook ของเพจนี้มาที่แอปเรา — ถ้าไม่เรียก จะไม่มีข้อความเข้าเลย
export async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
  await graphFetch(`/${pageId}/subscribed_apps`, pageToken, {
    method: 'POST',
    query: { subscribed_fields: MESSENGER_SUBSCRIBED_FIELDS.join(',') },
  })
}

// โปรไฟล์ลูกค้า — ใช้แสดงชื่อ/รูปใน inbox
// ห้ามใช้ /{psid}/picture แบบ FB login เพราะ PSID เป็น page-scoped คนละ ID space
export async function getContactProfile(
  externalUserId: string,
  pageToken: string,
): Promise<{ name: string | null; avatarUrl: string | null }> {
  try {
    const json = await graphFetch(`/${externalUserId}`, pageToken, {
      query: { fields: 'name,profile_pic' },
    })
    return {
      name: (json.name as string | undefined) ?? null,
      avatarUrl: (json.profile_pic as string | undefined) ?? null,
    }
  } catch {
    // โปรไฟล์ดึงไม่ได้ไม่ใช่เหตุให้ทิ้งข้อความ — เก็บข้อความไว้ก่อน ชื่อค่อยเติมทีหลัง
    return { name: null, avatarUrl: null }
  }
}

// ส่งข้อความ text — คืน mid สำหรับเก็บเป็น externalMessageId (กลไก dedupe echo)
export async function sendTextMessage(
  pageId: string,
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<string> {
  const json = await graphFetch(`/${pageId}/messages`, pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    },
  })
  return (json.message_id as string | undefined) ?? ''
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx vitest run src/lib/facebook/__tests__/graph.test.ts
```

Expected: PASS ทั้ง 4 เคส

- [ ] **Step 5: Commit**

```bash
git add src/lib/facebook/graph.ts src/lib/facebook/__tests__/graph.test.ts
git commit -m "feat(00018): Graph API client (exchange token, list pages, subscribe, send, profile)

ส่ง access token ผ่าน header Authorization ไม่ใส่ query string เพราะ URL ถูก log
ทั้งเส้นบน Vercel/error tracker → token หลุดง่าย (มี test กันไว้)

listManageablePages กรองเฉพาะ Page ที่มี task MESSAGING+MODERATE ตามที่ Meta
กำหนด — Page ที่สิทธิ์ไม่ครบเชื่อมไปก็ส่งข้อความไม่ได้จริง"
```

---

## Task 7: ShopChannel service (connect / list / disconnect)

**Files:**
- Create: `src/services/shop-channel.service.ts`
- Test: `src/services/__tests__/shop-channel.service.test.ts`

**Interfaces:**
- Consumes: `encryptToken` / `decryptToken` (Task 3), `PageInfo` / `subscribePageToApp` (Task 6)
- Produces:
  - `connectPages(shopId, userId, pages: PageInfo[]): Promise<{ connected: number; skipped: string[] }>`
  - `listChannels(shopId): Promise<ChannelView[]>` โดย `ChannelView = { id, provider, externalId, name, avatarUrl, status }` (**ไม่มี token**)
  - `getChannelByExternalId(provider, externalId): Promise<{ id, shopId, provider, accessToken } | null>` (token ถอดรหัสแล้ว — server-only)
  - `markChannelTokenInvalid(channelId): Promise<void>`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/services/__tests__/shop-channel.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = {
  shopChannel: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', () => ({ subscribePageToApp: vi.fn().mockResolvedValue(undefined) }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'b'.repeat(64)
})

import { connectPages, listChannels, getChannelByExternalId } from '@/services/shop-channel.service'
import { encryptToken } from '@/lib/token-crypto'

const page = {
  id: 'PAGE1', name: 'ร้านทดสอบ', accessToken: 'page_token_plain',
  tasks: ['MESSAGING', 'MODERATE'], instagramBusinessAccountId: null,
}

describe('shop-channel.service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('connectPages เก็บ token แบบเข้ารหัส ไม่เก็บ plaintext', async () => {
    db.shopChannel.create.mockResolvedValue({ id: 'ch1' })
    await connectPages('shop1', 'user1', [page])

    const created = db.shopChannel.create.mock.calls[0]![0].data
    expect(created.accessTokenEnc).not.toBe('page_token_plain')
    expect(created.accessTokenEnc).not.toContain('page_token_plain')
    expect(created.provider).toBe('MESSENGER')
  })

  it('Page ที่มี IG ผูกอยู่ → สร้าง channel เพิ่มอีกแถวเป็น INSTAGRAM', async () => {
    db.shopChannel.create.mockResolvedValue({ id: 'ch' })
    await connectPages('shop1', 'user1', [{ ...page, instagramBusinessAccountId: 'IG9' }])

    const providers = db.shopChannel.create.mock.calls.map((c) => c[0].data.provider)
    expect(providers).toEqual(['MESSENGER', 'INSTAGRAM'])
    const ig = db.shopChannel.create.mock.calls[1]![0].data
    expect(ig.externalId).toBe('IG9')
  })

  it('Page ที่ร้านอื่นเชื่อมไปแล้ว (P2002) → นับเป็น skipped ไม่ throw', async () => {
    db.shopChannel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const result = await connectPages('shop1', 'user1', [page])
    expect(result.connected).toBe(0)
    expect(result.skipped).toEqual(['ร้านทดสอบ'])
  })

  it('listChannels ไม่คืน accessTokenEnc ออกไปเด็ดขาด', async () => {
    db.shopChannel.findMany.mockResolvedValue([
      { id: 'ch1', provider: 'MESSENGER', externalId: 'PAGE1', name: 'ร้าน', avatarUrl: null, status: 'ACTIVE' },
    ])
    const rows = await listChannels('shop1')
    expect(Object.keys(rows[0]!)).not.toContain('accessTokenEnc')
    // ยืนยันว่า query เลือก field แบบ allow-list ไม่ใช่ดึงทั้งแถวแล้วค่อยตัด
    expect(db.shopChannel.findMany.mock.calls[0]![0].select.accessTokenEnc).toBeUndefined()
  })

  it('getChannelByExternalId คืน token ที่ถอดรหัสแล้ว', async () => {
    db.shopChannel.findUnique.mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER',
      accessTokenEnc: encryptToken('page_token_plain'), status: 'ACTIVE',
    })
    const ch = await getChannelByExternalId('MESSENGER', 'PAGE1')
    expect(ch!.accessToken).toBe('page_token_plain')
  })

  it('channel ที่ DISCONNECTED → getChannelByExternalId คืน null', async () => {
    db.shopChannel.findUnique.mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER',
      accessTokenEnc: encryptToken('x'), status: 'DISCONNECTED',
    })
    expect(await getChannelByExternalId('MESSENGER', 'PAGE1')).toBeNull()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/services/__tests__/shop-channel.service.test.ts
```

Expected: FAIL — `Cannot find module '@/services/shop-channel.service'`

- [ ] **Step 3: เขียน `src/services/shop-channel.service.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/token-crypto'
import { subscribePageToApp, type PageInfo } from '@/lib/facebook/graph'

// จัดการช่องทางที่ร้านผูกไว้ (feature 00018)
// กติกาสำคัญ: accessTokenEnc ห้ามออกจากไฟล์นี้ในรูป plaintext ยกเว้นผ่าน
// getChannelByExternalId ที่ถูกเรียกจาก server เท่านั้น

export interface ChannelView {
  id: string
  provider: string
  externalId: string
  name: string
  avatarUrl: string | null
  status: string
}

export async function connectPages(
  shopId: string,
  userId: string,
  pages: PageInfo[],
): Promise<{ connected: number; skipped: string[] }> {
  let connected = 0
  const skipped: string[] = []

  for (const page of pages) {
    try {
      await prisma.shopChannel.create({
        data: {
          shopId,
          provider: 'MESSENGER',
          externalId: page.id,
          name: page.name,
          accessTokenEnc: encryptToken(page.accessToken),
          connectedByUserId: userId,
        },
      })
      connected++

      // IG ที่ผูกกับเพจนี้ใช้ page token เดียวกัน — แยกเป็นคนละแถวเพราะ
      // externalId คนละ ID space และ inbox ต้อง filter แยกช่องทางได้
      if (page.instagramBusinessAccountId) {
        await prisma.shopChannel.create({
          data: {
            shopId,
            provider: 'INSTAGRAM',
            externalId: page.instagramBusinessAccountId,
            name: page.name,
            accessTokenEnc: encryptToken(page.accessToken),
            connectedByUserId: userId,
          },
        })
      }

      // ต้อง subscribe หลังเก็บสำเร็จ — ถ้า subscribe ก่อนแล้ว DB พัง จะมี webhook
      // ยิงเข้ามาหา channel ที่ไม่มีในระบบ
      await subscribePageToApp(page.id, page.accessToken)
    } catch (e) {
      // P2002 = Page นี้ถูกร้านอื่นเชื่อมไปแล้ว (unique [provider, externalId])
      // ไม่ใช่ error ของระบบ — รายงานกลับเป็นรายการที่ข้าม
      if ((e as { code?: string })?.code === 'P2002') {
        skipped.push(page.name)
        continue
      }
      throw e
    }
  }

  return { connected, skipped }
}

export async function listChannels(shopId: string): Promise<ChannelView[]> {
  return prisma.shopChannel.findMany({
    where: { shopId, status: { not: 'DISCONNECTED' } },
    // allow-list ชัด ๆ — กัน accessTokenEnc หลุดออกไปโดยไม่ตั้งใจเมื่อมีคนเพิ่มฟิลด์ใหม่
    select: { id: true, provider: true, externalId: true, name: true, avatarUrl: true, status: true },
    orderBy: { createdAt: 'asc' },
  })
}

// server-only — คืน token ที่ถอดรหัสแล้ว ห้ามเรียกจาก client component
export async function getChannelByExternalId(
  provider: string,
  externalId: string,
): Promise<{ id: string; shopId: string; provider: string; accessToken: string } | null> {
  const row = await prisma.shopChannel.findUnique({
    where: { provider_externalId: { provider, externalId } },
  })
  if (!row || row.status === 'DISCONNECTED') return null
  return {
    id: row.id,
    shopId: row.shopId,
    provider: row.provider,
    accessToken: decryptToken(row.accessTokenEnc),
  }
}

export async function markChannelTokenInvalid(channelId: string): Promise<void> {
  await prisma.shopChannel.update({ where: { id: channelId }, data: { status: 'TOKEN_INVALID' } })
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx vitest run src/services/__tests__/shop-channel.service.test.ts
```

Expected: PASS ทั้ง 6 เคส

- [ ] **Step 5: Commit**

```bash
git add src/services/shop-channel.service.ts src/services/__tests__/shop-channel.service.test.ts
git commit -m "feat(00018): shop-channel service — connect/list/disconnect + token ถอดรหัส server-only

listChannels ใช้ select allow-list ไม่ใช่ดึงทั้งแถวแล้วตัด — กัน accessTokenEnc
หลุดเมื่อมีคนเพิ่มฟิลด์ใหม่ในอนาคต (มี test กันไว้)

subscribe หลังเก็บ DB สำเร็จเสมอ ไม่งั้นจะมี webhook ยิงเข้ามาหา channel ที่ยัง
ไม่มีในระบบ; Page ที่ร้านอื่นเชื่อมไปแล้ว (P2002) รายงานเป็น skipped ไม่ throw"
```

---

## Task 8: ingest ข้อความขาเข้า

**Files:**
- Create: `src/services/channel-chat.service.ts`
- Test: `src/services/__tests__/channel-chat-ingest.test.ts`

**Interfaces:**
- Consumes: `getChannelByExternalId` (Task 7), `getContactProfile` (Task 6)
- Produces:
  - `ingestInboundMessage(params: { provider: string; pageExternalId: string; event: MessagingEvent }): Promise<{ status: 'STORED' | 'DUPLICATE' | 'NO_CHANNEL' | 'IGNORED'; conversationId?: string }>`
  - `getWindowState(lastInboundAt: Date | null, now?: Date): { open: boolean; expiresAt: Date | null; msRemaining: number }`
  - `MESSAGING_WINDOW_MS`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/services/__tests__/channel-chat-ingest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = {
  externalContact: { upsert: vi.fn() },
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn() },
  notification: { create: vi.fn() },
  shop: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))
vi.mock('@/lib/facebook/graph', () => ({
  getContactProfile: vi.fn().mockResolvedValue({ name: 'ลูกค้า ทดสอบ', avatarUrl: 'https://x/p.jpg' }),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { ingestInboundMessage, getWindowState, MESSAGING_WINDOW_MS } from '@/services/channel-chat.service'
import { getChannelByExternalId } from '@/services/shop-channel.service'

const textEvent = {
  sender: { id: 'PSID_1' },
  recipient: { id: 'PAGE1' },
  timestamp: 1750000000000,
  message: { mid: 'mid.in.1', text: 'สนใจครับ' },
}

describe('ingestInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER', accessToken: 'tok',
    })
    db.externalContact.upsert.mockResolvedValue({ id: 'ec1' })
    db.conversation.findUnique.mockResolvedValue(null)
    db.conversation.create.mockResolvedValue({ id: 'conv1', shopId: 'shop1' })
    db.conversation.update.mockResolvedValue({})
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
  })

  it('ข้อความใหม่ → STORED และบันทึก senderRole=BUYER', async () => {
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(r.status).toBe('STORED')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderRole).toBe('BUYER')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderUserId).toBeNull()
    expect(db.chatMessage.create.mock.calls[0]![0].data.externalMessageId).toBe('mid.in.1')
  })

  it('ข้อความขาเข้าอัปเดต lastInboundAt (ฐานของ 24h window)', async () => {
    await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(db.conversation.update.mock.calls[0]![0].data.lastInboundAt).toBeInstanceOf(Date)
  })

  it('is_echo → บันทึกเป็น senderRole=SHOP และไม่ขยับ lastInboundAt', async () => {
    const echo = { ...textEvent, message: { mid: 'mid.echo.1', text: 'ตอบจากมือถือ', is_echo: true } }
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: echo })
    expect(r.status).toBe('STORED')
    expect(db.chatMessage.create.mock.calls[0]![0].data.senderRole).toBe('SHOP')
    expect(db.conversation.update.mock.calls[0]![0].data.lastInboundAt).toBeUndefined()
  })

  it('mid ซ้ำ (P2002) → DUPLICATE ไม่ throw', async () => {
    db.chatMessage.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: textEvent })
    expect(r.status).toBe('DUPLICATE')
  })

  it('Page ที่ไม่มีร้านไหนเชื่อม → NO_CHANNEL ไม่ throw', async () => {
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'GHOST', event: textEvent })
    expect(r.status).toBe('NO_CHANNEL')
  })

  it('event ที่ไม่มี message (เช่น delivery receipt) → IGNORED', async () => {
    const r = await ingestInboundMessage({
      provider: 'MESSENGER', pageExternalId: 'PAGE1',
      event: { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' } },
    })
    expect(r.status).toBe('IGNORED')
  })
})

describe('getWindowState', () => {
  const base = new Date('2026-07-22T10:00:00Z')

  it('ไม่เคยมีข้อความขาเข้า → ปิด', () => {
    expect(getWindowState(null, base).open).toBe(false)
  })

  it('ลูกค้าเพิ่งทักมา → เปิด และเหลือเวลาราว 24 ชม.', () => {
    const s = getWindowState(base, base)
    expect(s.open).toBe(true)
    expect(s.msRemaining).toBe(MESSAGING_WINDOW_MS)
  })

  it('เกิน 24 ชม. → ปิด', () => {
    const past = new Date(base.getTime() - MESSAGING_WINDOW_MS - 1000)
    expect(getWindowState(past, base).open).toBe(false)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/services/__tests__/channel-chat-ingest.test.ts
```

Expected: FAIL — `Cannot find module '@/services/channel-chat.service'`

- [ ] **Step 3: เขียน `src/services/channel-chat.service.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { getChannelByExternalId } from '@/services/shop-channel.service'
import { getContactProfile } from '@/lib/facebook/graph'
import type { MessagingEvent } from '@/lib/facebook/webhook-types'

// รับ-ส่งข้อความของช่องทางนอก (feature 00018)
// แยกจาก chat.service.ts เพราะ chat เดิมมีสมมติฐานว่าทั้งสองฝั่งเป็น User ในระบบ

// หน้าต่างตอบกลับมาตรฐานของ Meta — นับจากข้อความล่าสุด "ของลูกค้า"
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

export function getWindowState(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): { open: boolean; expiresAt: Date | null; msRemaining: number } {
  if (!lastInboundAt) return { open: false, expiresAt: null, msRemaining: 0 }
  const expiresAt = new Date(lastInboundAt.getTime() + MESSAGING_WINDOW_MS)
  const msRemaining = expiresAt.getTime() - now.getTime()
  return { open: msRemaining > 0, expiresAt, msRemaining: Math.max(0, msRemaining) }
}

export type IngestStatus = 'STORED' | 'DUPLICATE' | 'NO_CHANNEL' | 'IGNORED'

export async function ingestInboundMessage(params: {
  provider: string
  pageExternalId: string
  event: MessagingEvent
}): Promise<{ status: IngestStatus; conversationId?: string }> {
  const { provider, pageExternalId, event } = params

  // event ที่ไม่ใช่ข้อความ (delivery/read receipt ฯลฯ) — ไม่ใช่ error แค่ไม่สนใจ
  if (!event.message?.mid) return { status: 'IGNORED' }

  const channel = await getChannelByExternalId(provider, pageExternalId)
  // Page ที่ไม่มีร้านไหนเชื่อม — ตอบ 200 ให้ Meta เสมอ ไม่งั้นจะ retry ไม่จบ
  if (!channel) return { status: 'NO_CHANNEL' }

  // is_echo = ข้อความจากฝั่งเพจ (seller ตอบจากแอป Messenger เอง หรือ echo ของที่เราส่ง)
  // ผู้ติดต่อคือ "อีกฝั่ง" เสมอ → echo ใช้ recipient, ไม่ใช่ sender
  const isEcho = event.message.is_echo === true
  const contactExternalId = isEcho ? event.recipient.id : event.sender.id
  const senderRole = isEcho ? 'SHOP' : 'BUYER'

  const profile = await getContactProfile(contactExternalId, channel.accessToken)

  const contact = await prisma.externalContact.upsert({
    where: { shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: contactExternalId } },
    create: {
      shopChannelId: channel.id,
      externalUserId: contactExternalId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
    // อัปเดตชื่อ/รูปทุกครั้ง — ลูกค้าเปลี่ยนรูปโปรไฟล์แล้ว inbox ควรตามทัน
    update: { name: profile.name, avatarUrl: profile.avatarUrl },
  })

  const text = event.message.text ?? null
  const firstAttachment = event.message.attachments?.[0]
  const isImage = firstAttachment?.type === 'image'
  const type = isImage ? 'IMAGE' : 'TEXT'
  const preview = isImage ? '[รูปภาพ]' : (text ?? '').slice(0, 100)
  const occurredAt = event.timestamp ? new Date(event.timestamp) : new Date()

  try {
    return await prisma.$transaction(async (tx) => {
      let conversation = await tx.conversation.findUnique({
        where: {
          shopChannelId_externalContactId: { shopChannelId: channel.id, externalContactId: contact.id },
        },
      })
      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            shopId: channel.shopId,
            channel: provider,
            shopChannelId: channel.id,
            externalContactId: contact.id,
          },
        })
      }

      await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: null,
          senderRole,
          type,
          body: text,
          // imageUrl ของ chat เดิมเก็บเป็น fileId ของ storage ไม่ใช่ URL —
          // รูปจาก Meta มี URL หมดอายุ ต้อง mirror เข้า storage ก่อน (Task 12)
          imageUrl: null,
          externalMessageId: event.message!.mid,
          deliveryStatus: 'SENT',
        },
      })

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: occurredAt,
          lastMessagePreview: preview,
          lastSenderRole: senderRole,
          // lastInboundAt ขยับเฉพาะข้อความ "ของลูกค้า" — echo คือฝั่งร้านตอบ
          // ถ้าขยับด้วยจะทำให้ 24h window ยืดออกเองอย่างผิด ๆ
          ...(isEcho ? {} : { lastInboundAt: occurredAt }),
        },
      })

      // แจ้งเตือนเจ้าของร้านเฉพาะข้อความจากลูกค้า (echo คือร้านตอบเอง ไม่ต้องเตือน)
      if (!isEcho) {
        const shop = await tx.shop.findUnique({
          where: { id: channel.shopId },
          select: { userId: true },
        })
        if (shop) {
          await tx.notification.create({
            data: {
              userId: shop.userId,
              kind: 'chat_message',
              title: `ข้อความใหม่จาก ${contact.name ?? 'ลูกค้า'}`,
              body: preview,
              refId: conversation.id,
            },
          })
        }
      }

      return { status: 'STORED' as const, conversationId: conversation.id }
    })
  } catch (e) {
    // P2002 บน externalMessageId = Meta ยิงซ้ำ หรือเป็น echo ของข้อความที่เรา
    // เพิ่งส่งออกไปเอง (เก็บ mid ไว้แล้วตอนส่ง) — ทั้งสองกรณีคือ "มีอยู่แล้ว" ไม่ใช่ error
    if ((e as { code?: string })?.code === 'P2002') return { status: 'DUPLICATE' }
    throw e
  }
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx vitest run src/services/__tests__/channel-chat-ingest.test.ts
```

Expected: PASS ทั้ง 9 เคส

- [ ] **Step 5: type-check**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/services/channel-chat.service.ts src/services/__tests__/channel-chat-ingest.test.ts
git commit -m "feat(00018): ingest ข้อความขาเข้าจาก Messenger/IG + คำนวณ 24h window

is_echo คือข้อความฝั่งเพจ (seller ตอบจากแอป Messenger เอง) ผู้ติดต่อจึงอยู่ที่
recipient ไม่ใช่ sender — ถ้าอ่านผิดฝั่งจะสร้าง contact ปลอมเป็น Page ID

lastInboundAt ขยับเฉพาะข้อความของลูกค้า ไม่ขยับตอน echo ไม่งั้น 24h window จะ
ยืดออกเองทุกครั้งที่ร้านตอบ ซึ่งผิดกติกา Meta

P2002 บน externalMessageId ครอบทั้ง webhook redelivery และ echo ของข้อความที่เรา
ส่งเอง → คืน DUPLICATE ไม่ throw"
```

---

## Task 9: webhook route + ยกเว้น CSRF

**Files:**
- Create: `src/app/api/channels/facebook/webhook/route.ts`
- Modify: `src/proxy.ts:22-30`
- Test: `src/app/api/channels/facebook/webhook/route.test.ts`

**Interfaces:**
- Consumes: `verifyWebhookSignature` (Task 4), `WebhookBodySchema` / `extractMessagingEvents` (Task 5), `ingestInboundMessage` (Task 8)
- Produces: `GET` (hub challenge) และ `POST` (รับ event) ที่ `/api/channels/facebook/webhook`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/app/api/channels/facebook/webhook/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/services/channel-chat.service', () => ({
  ingestInboundMessage: vi.fn().mockResolvedValue({ status: 'STORED', conversationId: 'conv1' }),
}))

const SECRET = 'wh_secret'
beforeAll(() => {
  process.env.FB_CHAT_APP_SECRET = SECRET
  process.env.FB_WEBHOOK_VERIFY_TOKEN = 'verify_me'
})

import { GET, POST } from '@/app/api/channels/facebook/webhook/route'
import { ingestInboundMessage } from '@/services/channel-chat.service'

const URL_BASE = 'https://seller.deepthailand.app/api/channels/facebook/webhook'
const sign = (b: string) => 'sha256=' + createHmac('sha256', SECRET).update(b).digest('hex')

function postReq(bodyObj: unknown, signature?: string) {
  const body = JSON.stringify(bodyObj)
  return new NextRequest(URL_BASE, {
    method: 'POST',
    body,
    headers: { 'x-hub-signature-256': signature ?? sign(body), 'content-type': 'application/json' },
  })
}

describe('GET (handshake)', () => {
  it('verify token ถูก → คืน challenge เป็น text', async () => {
    const req = new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=12345`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('12345')
  })

  it('verify token ผิด → 403', async () => {
    const req = new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)
    expect((await GET(req)).status).toBe(403)
  })
})

describe('POST (รับ event)', () => {
  beforeEach(() => vi.clearAllMocks())

  const body = {
    object: 'page',
    entry: [
      {
        id: 'PAGE1', time: 1,
        messaging: [{ sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, message: { mid: 'mid.1', text: 'hi' } }],
      },
    ],
  }

  it('ลายเซ็นถูก → 200 และเรียก ingest', async () => {
    const res = await POST(postReq(body))
    expect(res.status).toBe(200)
    expect(ingestInboundMessage).toHaveBeenCalledTimes(1)
    expect((ingestInboundMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0].pageExternalId).toBe('PAGE1')
  })

  it('ลายเซ็นผิด → 401 และไม่แตะ ingest เลย', async () => {
    const res = await POST(postReq(body, 'sha256=deadbeef'))
    expect(res.status).toBe(401)
    expect(ingestInboundMessage).not.toHaveBeenCalled()
  })

  it('object=instagram → ส่ง provider INSTAGRAM ให้ ingest', async () => {
    await POST(postReq({ ...body, object: 'instagram' }))
    expect((ingestInboundMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0].provider).toBe('INSTAGRAM')
  })

  it('ingest พังกลางทาง → ยังตอบ 200 (กัน Meta retry ไม่จบ)', async () => {
    ;(ingestInboundMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'))
    expect((await POST(postReq(body))).status).toBe(200)
  })

  it('payload ที่ parse ไม่ผ่าน → 200 (ไม่ retry) แต่ไม่เรียก ingest', async () => {
    const res = await POST(postReq({ object: 'page' }))
    expect(res.status).toBe(200)
    expect(ingestInboundMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/app/api/channels/facebook/webhook/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: เขียน `src/app/api/channels/facebook/webhook/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { verifyWebhookSignature } from '@/lib/facebook/signature'
import { WebhookBodySchema, extractMessagingEvents } from '@/lib/facebook/webhook-types'
import { ingestInboundMessage } from '@/services/channel-chat.service'

// Webhook ของ Messenger + Instagram (feature 00018)
//
// route นี้ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts เพราะ Meta ไม่ส่ง header Origin
// → ลายเซ็น X-Hub-Signature-256 คือ authentication เพียงอย่างเดียวของ route นี้
//
// กติกาการตอบ: ตอบ 200 ให้เร็วและเกือบทุกกรณี ยกเว้นลายเซ็นไม่ผ่าน
// Meta จะ retry ซ้ำเรื่อย ๆ ถ้าได้ non-200 ซึ่งทำให้ปัญหาบานปลายแทนที่จะหาย

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    // ต้องคืน challenge เป็น text เปล่า ๆ ไม่ใช่ JSON
    return new NextResponse(challenge ?? '', { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  // ต้องอ่าน raw text ไม่ใช่ .json() — ลายเซ็นคำนวณจาก byte ดิบ
  // ถ้า parse เป็น object แล้ว stringify ใหม่ ลายเซ็นจะไม่ตรง
  const rawBody = await request.text()

  if (!verifyWebhookSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    console.warn('[fb-webhook] signature ไม่ผ่าน')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const parsed = v.safeParse(WebhookBodySchema, JSON.parse(rawBody || '{}'))
  if (!parsed.success) {
    // shape ที่เราไม่รู้จัก — ตอบ 200 เพื่อไม่ให้ retry แต่ log ไว้ดู
    console.warn('[fb-webhook] payload parse ไม่ผ่าน', parsed.issues[0]?.message)
    return NextResponse.json({ ok: true })
  }

  const provider = parsed.output.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER'

  for (const { pageId, event } of extractMessagingEvents(parsed.output)) {
    try {
      await ingestInboundMessage({ provider, pageExternalId: pageId, event })
    } catch (e) {
      // ข้อความเดียวพังต้องไม่ทำให้ทั้ง batch ตกและถูก retry ทั้งก้อน
      console.error('[fb-webhook] ingest ล้มเหลว', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: แก้ `src/proxy.ts` — ยกเว้น webhook จาก Origin-check**

แก้เงื่อนไขบรรทัด 22-26 ให้เป็น:

```ts
  // ยกเว้น /api/channels/facebook/webhook — Meta ยิง server-to-server ไม่มี Origin
  // header เหมือน browser; authentication ของ route นี้คือลายเซ็น X-Hub-Signature-256
  // ที่ตัว route ตรวจเอง จึงไม่มี CSRF surface (CSRF อาศัย cookie ที่ browser แนบให้)
  if (
    MUTATION_METHODS.has(request.method) &&
    !pathname.startsWith('/api/app/') &&
    !pathname.startsWith('/api/cron/') &&
    pathname !== '/api/channels/facebook/webhook'
  ) {
```

**หมายเหตุ:** rate-limit ด้านล่างยังทำงานกับ route นี้ตามปกติ — ตั้งใจให้เป็นแบบนั้น

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
npx vitest run src/app/api/channels/facebook/webhook/route.test.ts
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: PASS ทั้ง 7 เคส, tsc ไม่มี error

- [ ] **Step 6: รัน test ทั้งชุด**

```bash
npx vitest run
```

Expected: PASS ทั้งหมด (รวม test เดิมของ csrf-origin / api-rate-limit)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/channels/facebook/webhook/ src/proxy.ts
git commit -m "feat(00018): webhook route ของ Messenger/IG + ยกเว้น CSRF Origin-check

อ่าน raw text ไม่ใช่ .json() เพราะลายเซ็นคำนวณจาก byte ดิบ — parse แล้ว stringify
ใหม่จะได้ลายเซ็นไม่ตรง

ตอบ 200 เกือบทุกกรณียกเว้นลายเซ็นไม่ผ่าน เพราะ Meta retry ซ้ำเรื่อย ๆ เมื่อได้
non-200 ทำให้ปัญหาบานปลาย; ข้อความเดียวพังไม่ทำให้ทั้ง batch ถูก retry

ยกเว้นเฉพาะ Origin-check เท่านั้น rate-limit ยัง apply ตามปกติ"
```

---

## Task 10: ส่งข้อความออก + บังคับ 24h window

**Files:**
- Modify: `src/services/channel-chat.service.ts` (เพิ่ม `sendOutboundMessage`)
- Modify: `src/app/api/chat/conversations/[id]/messages/route.ts:160-173`
- Test: `src/services/__tests__/channel-chat-outbound.test.ts`

**Interfaces:**
- Consumes: `sendTextMessage` / `GraphApiError` (Task 6), `getWindowState` (Task 8)
- Produces: `sendOutboundMessage(params: { conversationId: string; actorUserId: string; text: string }): Promise<ChatMessageRow>`
  และ error string `'WINDOW_CLOSED'`, `'NOT_EXTERNAL_CHANNEL'`

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/services/__tests__/channel-chat-outbound.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = {
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopChannel: { findUnique: vi.fn(), update: vi.fn() },
}
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/facebook/graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/facebook/graph')>('@/lib/facebook/graph')
  return { ...actual, sendTextMessage: vi.fn(), getContactProfile: vi.fn() }
})
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import { sendOutboundMessage, MESSAGING_WINDOW_MS } from '@/services/channel-chat.service'
import { sendTextMessage, GraphApiError } from '@/lib/facebook/graph'

const now = Date.now()

describe('sendOutboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - 1000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    db.conversation.update.mockResolvedValue({})
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockResolvedValue('mid.out.1')
  })

  it('window เปิด → ส่งออกก่อน แล้วเก็บ mid เป็น externalMessageId', async () => {
    await sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สวัสดีครับ' })

    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.externalMessageId).toBe('mid.out.1')
    expect(data.senderRole).toBe('SHOP')
    expect(data.deliveryStatus).toBe('SENT')
  })

  it('window ปิด → โยน WINDOW_CLOSED และไม่ยิง Graph API เลย', async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'MESSENGER', buyerUserId: null,
      lastInboundAt: new Date(now - MESSAGING_WINDOW_MS - 5000),
      shopChannel: { id: 'ch1', externalId: 'PAGE1', accessTokenEnc: 'enc', status: 'ACTIVE' },
      externalContact: { id: 'ec1', externalUserId: 'PSID_1', name: 'ลูกค้า' },
    })

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'สาย' }),
    ).rejects.toThrow('WINDOW_CLOSED')
    expect(sendTextMessage).not.toHaveBeenCalled()
  })

  it('คนที่ไม่ใช่เจ้าของร้าน → FORBIDDEN', async () => {
    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'stranger', text: 'hi' }),
    ).rejects.toThrow('FORBIDDEN')
  })

  it('เธรด DEEP → NOT_EXTERNAL_CHANNEL (ต้องไปทาง sendMessage เดิม)', async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: 'conv1', shopId: 'shop1', channel: 'DEEP', buyerUserId: 'buyer1',
      lastInboundAt: null, shopChannel: null, externalContact: null,
    })
    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow('NOT_EXTERNAL_CHANNEL')
  })

  it('Graph ตอบ error → บันทึกข้อความเป็น FAILED พร้อมเหตุผล แล้วโยนต่อ', async () => {
    ;(sendTextMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GraphApiError('outside allowed window', 10, 2018278, 400),
    )

    await expect(
      sendOutboundMessage({ conversationId: 'conv1', actorUserId: 'owner1', text: 'hi' }),
    ).rejects.toThrow()

    const data = db.chatMessage.create.mock.calls[0]![0].data
    expect(data.deliveryStatus).toBe('FAILED')
    expect(data.failureReason).toContain('outside allowed window')
    expect(data.externalMessageId).toBeNull()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/services/__tests__/channel-chat-outbound.test.ts
```

Expected: FAIL — `sendOutboundMessage is not a function`

- [ ] **Step 3: เพิ่ม `sendOutboundMessage` ท้าย `src/services/channel-chat.service.ts`**

```ts
import { sendTextMessage, GraphApiError } from '@/lib/facebook/graph'
import { decryptToken } from '@/lib/token-crypto'
import { markChannelTokenInvalid } from '@/services/shop-channel.service'

// ส่งข้อความจาก Deep ออกไปยัง Messenger/IG (feature 00018)
//
// ลำดับสำคัญ: ส่งออกก่อน → ได้ mid → ค่อยเขียน DB
// เพราะ echo webhook จะยิง mid เดียวกันกลับมา แล้ว unique constraint บน
// externalMessageId จะ dedupe ให้เอง ถ้าเขียน DB ก่อนส่งจะได้ข้อความซ้ำ 2 แถว
export async function sendOutboundMessage(params: {
  conversationId: string
  actorUserId: string
  text: string
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (conversation.channel === 'DEEP' || !conversation.shopChannel || !conversation.externalContact) {
    throw new Error('NOT_EXTERNAL_CHANNEL')
  }

  const shop = await prisma.shop.findUnique({
    where: { id: conversation.shopId },
    select: { userId: true },
  })
  if (!shop) throw new Error('SHOP_NOT_FOUND')
  if (shop.userId !== params.actorUserId) throw new Error('FORBIDDEN')

  // เช็คหน้าต่าง 24 ชม. ก่อนยิง — กันเปลือง quota และกัน error ที่คาดเดาได้อยู่แล้ว
  if (!getWindowState(conversation.lastInboundAt).open) throw new Error('WINDOW_CLOSED')

  const pageToken = decryptToken(conversation.shopChannel.accessTokenEnc)

  let mid: string | null = null
  let failureReason: string | null = null
  try {
    mid = await sendTextMessage(
      conversation.shopChannel.externalId,
      pageToken,
      conversation.externalContact.externalUserId,
      params.text,
    )
  } catch (e) {
    failureReason = e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ'
    // code 190 = token ใช้ไม่ได้แล้ว (เจ้าของถอนสิทธิ์/เปลี่ยนรหัส) — ต้องให้ร้านเชื่อมใหม่
    if (e instanceof GraphApiError && e.code === 190) {
      await markChannelTokenInvalid(conversation.shopChannel.id)
    }
  }

  const preview = params.text.slice(0, 100)
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: params.actorUserId,
      senderRole: 'SHOP',
      type: 'TEXT',
      body: params.text,
      externalMessageId: mid || null,
      deliveryStatus: failureReason ? 'FAILED' : 'SENT',
      failureReason,
    },
  })

  // อัปเดต snapshot แม้ส่งไม่สำเร็จ — seller ต้องเห็นในเธรดว่าพยายามส่งแล้วพลาด
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt, lastMessagePreview: preview, lastSenderRole: 'SHOP' },
  })

  if (failureReason) throw new Error(`SEND_FAILED: ${failureReason}`)
  return message
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
npx vitest run src/services/__tests__/channel-chat-outbound.test.ts
```

Expected: PASS ทั้ง 5 เคส

- [ ] **Step 5: ต่อ route เดิมให้แตกไป adapter**

ใน `src/app/api/chat/conversations/[id]/messages/route.ts` เพิ่ม import:

```ts
import { prisma } from "@/lib/prisma";
import { sendOutboundMessage } from "@/services/channel-chat.service";
```

แล้วแทนที่ `try { const message = await sendMessage({...}) ... }` (บรรทัด 160-173) ด้วย:

```ts
  try {
    // feature 00018: เธรดช่องทางนอกต้องส่งออกผ่าน Graph API ไม่ใช่เขียน DB ตรง ๆ
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { channel: true },
    });
    if (conv && conv.channel !== "DEEP") {
      if (type !== "TEXT") {
        return NextResponse.json(
          { error: "ช่องทางนี้รองรับเฉพาะข้อความตัวอักษรในตอนนี้" },
          { status: 400 },
        );
      }
      const sent = await sendOutboundMessage({
        conversationId: id,
        actorUserId: userId,
        text: text!,
      });
      return NextResponse.json(sent);
    }

    const message = await sendMessage({
      conversationId: id,
      senderUserId: userId,
      senderRole,
      type,
      body: type === "PRODUCT" ? null : text ?? null, // TEXT = ข้อความหลัก, IMAGE = caption (optional), PRODUCT = null
      imageUrl: type === "IMAGE" ? imageUrl ?? null : null,
      productRefId: type === "PRODUCT" ? productRefId ?? null : null,
    });
    return NextResponse.json(message);
  } catch (e: unknown) {
    return mapChatServiceError(e, "POST /api/chat/conversations/[id]/messages");
  }
```

- [ ] **Step 6: เพิ่ม error mapping ใน `mapChatServiceError` (บรรทัด 17-34)**

แทรกก่อน `console.error` บรรทัดสุดท้าย:

```ts
  if (e instanceof Error && e.message === "WINDOW_CLOSED") {
    // feature 00018: เกิน 24 ชม. นับจากข้อความล่าสุดของลูกค้า — Meta ไม่ให้ส่ง
    return NextResponse.json(
      { error: "เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้า — ส่งข้อความไม่ได้จนกว่าลูกค้าจะทักมาใหม่" },
      { status: 409 },
    );
  }
  if (e instanceof Error && e.message === "NOT_EXTERNAL_CHANNEL") {
    return NextResponse.json({ error: "ช่องทางของบทสนทนานี้ไม่ถูกต้อง" }, { status: 400 });
  }
  if (e instanceof Error && e.message.startsWith("SEND_FAILED")) {
    return NextResponse.json(
      { error: "ส่งข้อความไปยังช่องทางภายนอกไม่สำเร็จ กรุณาลองใหม่" },
      { status: 502 },
    );
  }
```

- [ ] **Step 7: type-check + รัน test ทั้งชุด**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
npx vitest run
```

Expected: ไม่มี error, test PASS ทั้งหมด

- [ ] **Step 8: Commit**

```bash
git add src/services/channel-chat.service.ts src/services/__tests__/channel-chat-outbound.test.ts "src/app/api/chat/conversations/[id]/messages/route.ts"
git commit -m "feat(00018): ส่งข้อความออกไป Messenger/IG + บังคับ 24h window

ส่งออกก่อนแล้วค่อยเขียน DB เพราะ echo webhook จะยิง mid เดิมกลับมา แล้ว unique
constraint บน externalMessageId dedupe ให้เอง — ถ้าเขียน DB ก่อนส่งจะได้ข้อความ
ซ้ำ 2 แถวทุกครั้ง

เช็ค window ก่อนยิง Graph API กันเปลือง quota; ส่งไม่สำเร็จยังบันทึกข้อความเป็น
FAILED พร้อมเหตุผลเพื่อให้ seller เห็นในเธรด ไม่ fail เงียบ

Graph code 190 = token ตาย → ตั้ง channel เป็น TOKEN_INVALID ให้ร้านเชื่อมใหม่"
```

---

## Task 11: OAuth connect + callback

**Files:**
- Create: `src/app/api/channels/facebook/connect/route.ts`
- Create: `src/app/api/channels/facebook/callback/route.ts`
- Test: `src/app/api/channels/facebook/connect/route.test.ts`

**Interfaces:**
- Consumes: `CONNECT_SCOPES` (Task 4), `exchangeCodeForToken` / `listManageablePages` (Task 6), `connectPages` (Task 7)
- Produces: `GET /api/channels/facebook/connect` (302 ไป Facebook), `GET /api/channels/facebook/callback` (302 กลับหน้า settings)

**บริบทความปลอดภัย:** OAuth callback ต้องมี `state` กัน CSRF — เก็บ state ใน cookie
`httpOnly` แล้วเทียบตอน callback

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/app/api/channels/facebook/connect/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

beforeAll(() => {
  process.env.FB_CHAT_APP_ID = '1570859340799126'
})

import { GET } from '@/app/api/channels/facebook/connect/route'
import { getServerSession } from 'next-auth'

const req = () => new NextRequest('https://seller.deepthailand.app/api/channels/facebook/connect')

describe('GET /api/channels/facebook/connect', () => {
  it('ไม่ได้ login → 401', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('login แล้ว → 302 ไป facebook.com พร้อม scope และ state', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } })
    const res = await GET(req())

    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.hostname).toBe('www.facebook.com')
    expect(loc.searchParams.get('client_id')).toBe('1570859340799126')
    expect(loc.searchParams.get('scope')).toContain('pages_messaging')
    expect(loc.searchParams.get('state')).toBeTruthy()
    // state ต้องถูกผูกไว้ใน cookie httpOnly เพื่อเทียบตอน callback
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/app/api/channels/facebook/connect/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: เขียน `src/app/api/channels/facebook/connect/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GRAPH_VERSION, CONNECT_SCOPES } from '@/lib/facebook/constants'

// เริ่ม OAuth เชื่อม Facebook Page (feature 00018)
//
// แยกจาก FacebookProvider ของ NextAuth โดยตั้งใจ — นั่นคือ login ของผู้ใช้ทั่วไป
// ถ้าเอา scope จัดการเพจไปใส่ที่นั่น ผู้ใช้ทุกคนจะโดนขอสิทธิ์เกินจำเป็นตั้งแต่สมัคร
// และถ้า App Review ตก login ทั้งระบบจะพังตามไปด้วย

export const dynamic = 'force-dynamic'

export const OAUTH_STATE_COOKIE = 'fb_channel_oauth_state'

export function callbackUrl(request: NextRequest): string {
  return `${request.nextUrl.origin}/api/channels/facebook/callback`
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const appId = process.env.FB_CHAT_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า FB_CHAT_APP_ID' }, { status: 500 })
  }

  // state กัน CSRF ของ OAuth — ผูกไว้ใน cookie httpOnly แล้วเทียบตอน callback
  const state = randomBytes(16).toString('hex')

  const authorizeUrl = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`)
  authorizeUrl.searchParams.set('client_id', appId)
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl(request))
  authorizeUrl.searchParams.set('scope', CONNECT_SCOPES)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authorizeUrl.toString())
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // ต้อง lax ไม่ใช่ strict — cookie ต้องรอดตอน Facebook redirect กลับมา
    path: '/api/channels/facebook',
    maxAge: 600,
  })
  return res
}
```

- [ ] **Step 4: เขียน `src/app/api/channels/facebook/callback/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForToken, listManageablePages } from '@/lib/facebook/graph'
import { connectPages } from '@/services/shop-channel.service'
import { OAUTH_STATE_COOKIE, callbackUrl } from '../connect/route'

// รับ code จาก Facebook แล้วเชื่อมทุก Page ที่ user มีสิทธิ์ MESSAGING+MODERATE (feature 00018)
// MVP เชื่อมให้ทั้งหมดเลย — หน้าจอให้เลือกทีละเพจอยู่ในแผน UI

export const dynamic = 'force-dynamic'

function backToSettings(request: NextRequest, query: Record<string, string>) {
  const url = new URL('/settings/channels', request.nextUrl.origin)
  for (const [k, val] of Object.entries(query)) url.searchParams.set(k, val)
  return NextResponse.redirect(url.toString())
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = (session.user as { id: string }).id

  const { searchParams } = request.nextUrl
  // user กด "ยกเลิก" ในหน้า Facebook
  if (searchParams.get('error')) {
    return backToSettings(request, { status: 'cancelled' })
  }

  const state = searchParams.get('state')
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!state || !expected || state !== expected) {
    return backToSettings(request, { status: 'state_mismatch' })
  }

  const code = searchParams.get('code')
  if (!code) return backToSettings(request, { status: 'no_code' })

  const shop = await prisma.shop.findFirst({ where: { userId }, select: { id: true } })
  if (!shop) return backToSettings(request, { status: 'no_shop' })

  try {
    const userToken = await exchangeCodeForToken(code, callbackUrl(request))
    const pages = await listManageablePages(userToken)
    if (pages.length === 0) {
      return backToSettings(request, { status: 'no_eligible_page' })
    }

    const result = await connectPages(shop.id, userId, pages)
    const res = backToSettings(request, {
      status: 'connected',
      connected: String(result.connected),
      ...(result.skipped.length ? { skipped: result.skipped.join(',') } : {}),
    })
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
  } catch (e) {
    // ห้าม log token — log แค่ message
    console.error('[fb-connect] ล้มเหลว', e instanceof Error ? e.message : e)
    return backToSettings(request, { status: 'error' })
  }
}
```

- [ ] **Step 5: รัน test + type-check**

```bash
npx vitest run src/app/api/channels/facebook/connect/route.test.ts
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: PASS ทั้ง 2 เคส, tsc ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/app/api/channels/facebook/
git commit -m "feat(00018): OAuth เชื่อม Facebook Page (connect + callback)

แยกจาก FacebookProvider ของ NextAuth โดยตั้งใจ — ถ้าเอา scope จัดการเพจไปใส่ใน
login ผู้ใช้ทุกคนจะโดนขอสิทธิ์เกินจำเป็นตั้งแต่สมัคร และ App Review จะตกเพราะ
ขอเกินความจำเป็น

state cookie ใช้ sameSite=lax ไม่ใช่ strict เพราะ cookie ต้องรอดตอน Facebook
redirect ข้ามเว็บกลับมา"
```

---

## Task 12: mirror รูปภาพจาก Meta เข้า storage

**Files:**
- Modify: `src/services/channel-chat.service.ts` (`ingestInboundMessage`)
- Test: `src/services/__tests__/channel-chat-image.test.ts`

**Interfaces:**
- Consumes: `saveFile` จาก `@/lib/storage`
- Produces: `mirrorRemoteImage(url: string): Promise<string | null>` (คืน fileId)

**บริบท:** `ChatMessage.imageUrl` ของโปรเจกต์นี้เก็บ **fileId ของ storage** ไม่ใช่ URL
(ดู `fileIdExt(imageUrl)` ที่ route เดิมบรรทัด 145) และ URL ที่ Meta ส่งมาหมดอายุ
→ ต้องดาวน์โหลดแล้วอัปโหลดเข้า storage เอง

- [ ] **Step 1: เขียน test ที่ fail**

สร้าง `src/services/__tests__/channel-chat-image.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))
vi.mock('@/lib/facebook/graph', () => ({
  getContactProfile: vi.fn(),
  sendTextMessage: vi.fn(),
  GraphApiError: class extends Error {},
}))
const saveFile = vi.fn()
vi.mock('@/lib/storage', () => ({ saveFile }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'e'.repeat(64)
})

import { mirrorRemoteImage } from '@/services/channel-chat.service'

describe('mirrorRemoteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('ดาวน์โหลดสำเร็จ → คืน fileId จาก storage', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    })
    saveFile.mockResolvedValue('chat/abc.jpg')

    expect(await mirrorRemoteImage('https://cdn.fb/x.jpg')).toBe('chat/abc.jpg')
  })

  it('ดาวน์โหลดไม่สำเร็จ → คืน null ไม่ throw (ข้อความยังต้องถูกเก็บ)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 })
    expect(await mirrorRemoteImage('https://cdn.fb/gone.jpg')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('ไฟล์ใหญ่เกิน 5MB → คืน null ไม่อัปโหลด', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024) }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    expect(await mirrorRemoteImage('https://cdn.fb/big.jpg')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('content-type ไม่ใช่รูป → คืน null', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    expect(await mirrorRemoteImage('https://evil/x')).toBeNull()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
npx vitest run src/services/__tests__/channel-chat-image.test.ts
```

Expected: FAIL — `mirrorRemoteImage is not a function`

- [ ] **Step 3: เพิ่ม `mirrorRemoteImage` ใน `src/services/channel-chat.service.ts`**

เพิ่ม import `import { saveFile } from '@/lib/storage'` แล้วเพิ่มฟังก์ชัน:

```ts
const MIRROR_MAX_BYTES = 5 * 1024 * 1024 // ตรงกับ MAX_SIZE ของ lib/storage
const MIRROR_ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// ดาวน์โหลดรูปจาก CDN ของ Meta แล้วเก็บเข้า storage ของเรา (feature 00018)
// จำเป็นเพราะ 2 เหตุผล: URL ของ Meta หมดอายุ และ ChatMessage.imageUrl ของโปรเจกต์นี้
// เก็บ "fileId ของ storage" ไม่ใช่ URL (ดู fileIdExt ที่ route messages ใช้ตรวจนามสกุล)
//
// คืน null เมื่อดึงไม่ได้ — ข้อความยังต้องถูกบันทึกอยู่ดี ห้ามทิ้งทั้งข้อความเพราะรูปพัง
export async function mirrorRemoteImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    const ext = MIRROR_ALLOWED_TYPES[contentType]
    if (!ext) return null

    const declaredSize = Number(res.headers.get('content-length') ?? '0')
    if (declaredSize > MIRROR_MAX_BYTES) return null

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MIRROR_MAX_BYTES) return null

    const file = new File([buffer], `fb-${Date.now()}.${ext}`, { type: contentType })
    return await saveFile(file)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: ต่อเข้า `ingestInboundMessage`**

ใน `ingestInboundMessage` แทนที่บรรทัดที่คำนวณ `isImage` และ `imageUrl: null` ด้วย:

```ts
  const firstAttachment = event.message.attachments?.[0]
  const isImage = firstAttachment?.type === 'image'
  // ต้อง mirror ก่อนเข้า transaction — network call ในทรานแซกชันจะถือ lock นานเกินไป
  const mirroredFileId =
    isImage && firstAttachment?.payload?.url ? await mirrorRemoteImage(firstAttachment.payload.url) : null
  const type = isImage ? 'IMAGE' : 'TEXT'
```

แล้วใน `tx.chatMessage.create` เปลี่ยน `imageUrl: null` เป็น `imageUrl: mirroredFileId`

- [ ] **Step 5: รัน test ทั้งชุด + type-check**

```bash
npx vitest run
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: PASS ทั้งหมด (รวม test ingest เดิมของ Task 8), tsc ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/services/channel-chat.service.ts src/services/__tests__/channel-chat-image.test.ts
git commit -m "feat(00018): mirror รูปจาก CDN ของ Meta เข้า storage ของเรา

ChatMessage.imageUrl ของโปรเจกต์นี้เก็บ fileId ของ storage ไม่ใช่ URL (route
messages ใช้ fileIdExt ตรวจนามสกุล) และ URL ที่ Meta ส่งมาหมดอายุ → ต้องดาวน์โหลด
แล้วอัปเข้า storage เอง

ดึงรูปไม่สำเร็จคืน null ไม่ throw — ข้อความยังต้องถูกบันทึก ห้ามทิ้งทั้งข้อความ
เพราะรูปพัง; mirror นอก transaction เพราะ network call ในทรานแซกชันถือ lock นานเกินไป"
```

---

## Task 13: สคริปต์ยิง webhook ปลอม (dev/QA)

**Files:**
- Create: `scripts/fake-fb-webhook.ts`

**Interfaces:**
- Consumes: `FB_CHAT_APP_SECRET` จาก env

- [ ] **Step 1: เขียนสคริปต์**

สร้าง `scripts/fake-fb-webhook.ts`:

```ts
/**
 * ยิง webhook ปลอมที่เซ็นลายเซ็นจริง — ใช้ทดสอบ handler โดยไม่ต้องพึ่ง Meta (feature 00018)
 *
 * วิธีใช้:
 *   npx tsx scripts/fake-fb-webhook.ts --page PAGE_ID --psid PSID --text "สนใจครับ"
 *   npx tsx scripts/fake-fb-webhook.ts --page PAGE_ID --psid PSID --text "ตอบแล้ว" --echo
 *   npx tsx scripts/fake-fb-webhook.ts --page IG_ID --psid IGSID --text "hi" --object instagram
 *
 * ต้องมี FB_CHAT_APP_SECRET ใน .env.local และ dev server รันอยู่ที่ port 4000
 */
import { createHmac } from 'crypto'
import { config } from 'dotenv'

config({ path: '.env.local' })

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  if (value === undefined) {
    if (fallback !== undefined) return fallback
    throw new Error(`ต้องระบุ --${name}`)
  }
  return value
}

const secret = process.env.FB_CHAT_APP_SECRET
if (!secret) throw new Error('ไม่พบ FB_CHAT_APP_SECRET ใน .env.local')

const pageId = arg('page')
const psid = arg('psid')
const text = arg('text', 'ข้อความทดสอบ')
const object = arg('object', 'page')
const isEcho = process.argv.includes('--echo')
const url = arg('url', 'http://seller.deepth.local:4000/api/channels/facebook/webhook')

const body = JSON.stringify({
  object,
  entry: [
    {
      id: pageId,
      time: Date.now(),
      messaging: [
        {
          // echo = ข้อความฝั่งเพจ → ผู้ติดต่ออยู่ที่ recipient ไม่ใช่ sender
          sender: { id: isEcho ? pageId : psid },
          recipient: { id: isEcho ? psid : pageId },
          timestamp: Date.now(),
          message: {
            mid: `mid.fake.${Date.now()}`,
            text,
            ...(isEcho ? { is_echo: true } : {}),
          },
        },
      ],
    },
  ],
})

const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
  body,
})

console.log(`HTTP ${res.status}`, await res.text())
```

- [ ] **Step 2: ทดสอบว่ารันได้จริง (ต้องมี dev server รันอยู่)**

แจ้ง user ให้รัน dev server ก่อน (`npm run dev -- -p 4000`) — **ห้าม start เอง** แล้วรัน:

```bash
npx tsx scripts/fake-fb-webhook.ts --page PAGE_ที่เชื่อมไว้ --psid TEST_PSID_1 --text "สนใจสินค้าครับ"
```

Expected: `HTTP 200 {"ok":true}`

- [ ] **Step 3: ยืนยันว่าข้อความลง DB จริง**

```bash
cd /Users/craftman/Projects/safepay && node -e "
require('dotenv').config({path:'.env.local'});
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.chatMessage.findMany({where:{externalMessageId:{not:null}},orderBy:{createdAt:'desc'},take:5,
  select:{id:true,senderRole:true,type:true,body:true,externalMessageId:true}})
 .then(r=>console.table(r)).finally(()=>p.\$disconnect());
"
```

Expected: เห็นแถวข้อความที่เพิ่งยิง `senderRole = BUYER`

- [ ] **Step 4: ทดสอบ idempotency — ยิง payload เดิมซ้ำ**

แก้สคริปต์ชั่วคราวให้ `mid` คงที่ (เช่น `mid.fixed.1`) แล้วยิง 2 ครั้ง จากนั้นนับแถว:

```bash
cd /Users/craftman/Projects/safepay && node -e "
require('dotenv').config({path:'.env.local'});
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.chatMessage.count({where:{externalMessageId:'mid.fixed.1'}})
 .then(c=>console.log('rows =',c)).finally(()=>p.\$disconnect());
"
```

Expected: `rows = 1` (ไม่ใช่ 2) — ยืนยันว่า unique constraint ทำงาน

- [ ] **Step 5: ทดสอบ echo**

```bash
npx tsx scripts/fake-fb-webhook.ts --page PAGE_ที่เชื่อมไว้ --psid TEST_PSID_1 --text "ตอบจากมือถือ" --echo
```

Expected: `HTTP 200`; query DB แล้วเห็นแถวใหม่ `senderRole = SHOP`

- [ ] **Step 6: Commit**

```bash
git add scripts/fake-fb-webhook.ts
git commit -m "test(00018): สคริปต์ยิง webhook ปลอมที่เซ็นลายเซ็นจริง

ทดสอบ handler ได้โดยไม่ต้องพึ่ง Meta และไม่ต้องเปิด ngrok — ครอบข้อความปกติ,
is_echo, IG (--object instagram) และการยิงซ้ำเพื่อพิสูจน์ idempotency"
```

---

## Task 14: ปิดงาน — reviewer + security + เอกสาร

**Files:**
- Modify: `docs/20 - Features/00018 - Facebook Chat Integration/` (SRS / SDS / API / DATABASE)

- [ ] **Step 1: รัน test ทั้งชุด + type-check ครั้งสุดท้าย**

```bash
npx vitest run
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: PASS ทั้งหมด, ไม่มี type error

- [ ] **Step 2: grep gate — ยืนยันว่าไม่มี secret หลุดเข้า log**

```bash
grep -rn "accessToken\|accessTokenEnc\|APP_SECRET" src/ --include=*.ts | grep -i "console\." || echo "PASS: ไม่มี log token"
```

Expected: `PASS: ไม่มี log token`

- [ ] **Step 3: grep gate — ยืนยันว่า Graph API version ไม่ถูก hardcode กระจาย**

```bash
grep -rn "graph.facebook.com/v" src/ --include=*.ts | grep -v "lib/facebook/constants.ts" || echo "PASS: version อยู่ที่เดียว"
```

Expected: `PASS: version อยู่ที่เดียว`

- [ ] **Step 4: dispatch `safepay-reviewer`**

ให้ตรวจ 8 gate ตามปกติ + จุดเฉพาะของงานนี้:
- ไม่มี plaintext token ลง DB หรือ log
- webhook ยกเว้นเฉพาะ Origin-check ไม่ได้ยกเว้น rate-limit
- ทุก query ที่แตะ conversation ยัง filter `shopId`

- [ ] **Step 5: dispatch `safepay-security`**

งานนี้แตะ auth/token/webhook → security review บังคับ

- [ ] **Step 6: dispatch `safepay-docs` ให้เขียน SRS / SDS / API / DATABASE ของ 00018**

ตาม Hard Rule 11 เอกสารต้องครบ 7 ไฟล์ (PRD/BRD ทำไปแล้วที่ Task 0)

- [ ] **Step 7: Commit เอกสาร**

```bash
git add "docs/20 - Features/00018 - Facebook Chat Integration/"
git commit -m "docs(00018): SRS + SDS + API + DATABASE ของ Facebook chat integration"
```

- [ ] **Step 8: รายงาน user — สิ่งที่ยังทำไม่ได้จนกว่าจะเคลียร์ฝั่ง Meta**

สรุปให้ชัดว่า pipeline พร้อมแล้วแต่ยังใช้กับร้านค้าจริงไม่ได้จนกว่าจะ:
เปลี่ยน callback URL, ตั้ง privacy policy / ToS ให้ผ่านเกณฑ์, เปลี่ยนชื่อแอป,
Business Verification, App Review — ตาม spec §13

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §2.1 S-1 รับ text + รูป | Task 8 (text), Task 12 (รูป) |
| §2.1 S-2 ตอบกลับออกไป | Task 10 |
| §2.1 S-3 24h window guard | Task 8 (`getWindowState`), Task 10 (บังคับใช้) |
| §2.1 S-4 สร้างออเดอร์จากเธรด | ❌ **แผน UI** (นอก scope แผนนี้ — ประกาศไว้ที่ §Out of scope) |
| §2.1 S-5 หน้าเชื่อม/ถอด Page | backend = Task 7 + 11; หน้าจอ = แผน UI |
| §2.1 S-6 `is_echo` | Task 8 |
| §6 Data model | Task 1 |
| §7.1 OAuth เชื่อม Page | Task 11 |
| §7.2 Webhook ขาเข้า | Task 9 |
| §7.3 ขาออก + window | Task 10 |
| §10 Security (token/signature/CSRF/authz) | Task 3, 4, 9, 10 + gate ที่ Task 14 |
| §11 Testing | Task 13 + unit test ทุก task |
| §12 Env vars | Task 3 Step 5 |
| §13 งานฝั่ง Meta | Task 14 Step 8 (รายงาน — เป็นงานของ user ไม่ใช่โค้ด) |

**ช่องว่างที่รู้ตัวและยอมรับ:**
- **ส่งรูปออก** (Deep → Messenger) ยังไม่ทำ — Task 10 รับเฉพาะ TEXT และ route คืน 400
  พร้อมข้อความไทยที่ชัดเจน จะเติมในแผน UI พร้อมกับปุ่มแนบรูป
- **`markRead` / unread ของเธรด FB** ใช้กลไกเดิมได้เลยเพราะคง `senderRole` เป็น `BUYER`/`SHOP`
  จึงไม่มี task แยก
- **staff (feature 00012)** — Task 10 เช็คแค่ `shop.userId` ตรงกับ `sendMessage` เดิมที่ก็เช็ค
  แบบเดียวกัน ถ้าจะเปิดให้พนักงานตอบต้องแก้ทั้งสองที่พร้อมกัน (นอก scope)

**Type consistency:** ตรวจแล้ว — `PageInfo` (Task 6) ใช้ชื่อเดียวกันใน Task 7;
`MessagingEvent` (Task 5) ใช้ใน Task 8; `getWindowState` / `MESSAGING_WINDOW_MS` (Task 8)
ใช้ใน Task 10; `OAUTH_STATE_COOKIE` / `callbackUrl` (Task 11 connect) import จาก callback
