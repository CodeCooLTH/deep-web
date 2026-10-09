# แผน phase 00019-ext Typhoon auto-suggest

> **มติ Controller 2026-10-09:** C-1 = ทาง A (prompt ของ Typhoon อยู่ `reply-suggest-prompt.ts` + เทสกันลอก, ไม่แตะ `gemini.ts`) · C-2 = รับ `firedAt` + reserve-then-verify · C-3 = รับ (provider/attempt/feedback/trigger) · C-4 = รับ (route เดิมสาขา Typhoon ส่งต่อ `requestAutoSuggest`) · A-3 ยืนยันแล้ว: `~/Projects/safepay-mobile/App.tsx` ห่อ `https://seller.deepthailand.app` ด้วย `react-native-webview`
> **ทับแผน FE:** T8 ทำเป็นไฟล์ใหม่ `AiSuggestInline.tsx` ตาม UX-Design-Spec-2026-10-09-auto-suggest.md (`AiSuggestPanel.tsx` diff = 0) · S-18 = N/A · `aiSuggestMode` ส่งจาก `page.tsx` (RSC)

# แผน phase 00019-ext Typhoon auto-suggest

Worktree: `/Users/craftman/Projects/safepay-typhoon-suggest` (ต่อไปเรียก `W`)

อ่านครบ 4 อย่างที่สั่ง (Baseline, spec รวมภาคผนวก ก, agent-team-workflow, retro CLAUDE.md) และไล่โค้ดจริงตามข้อ 2. ผม **ไม่ได้เปิด** `UX-Design-Spec-2026-10-09-auto-suggest.md` ที่โผล่ในโฟลเดอร์ 00019 แล้ว เพราะ ux ยังทำคู่ขนานอยู่ งาน FE จึงเว้นช่องรอไว้. ไม่มี Bash ใน session นี้ จึงรัน `ls ~/Projects` ไม่ได้ (ดู A-3 ข้อ 1.5).

---

## 0. เรื่องที่ Controller ต้องตัดสินก่อน dispatch (4 ข้อ)

| # | ประเด็น | หลักฐาน | ข้อเสนอของ planner |
|---|---|---|---|
| **C-1** | S-5 สั่ง "แยกตัวประกอบ prompt ใช้ร่วม ไม่คัดลอกสองชุด" แต่ OOS-6 / S-13 ห้ามแก้ `gemini.ts`. สองข้อนี้ทำพร้อมกันไม่ได้. `buildSystemPrompt` และ `buildTranscript` ใน `gemini.ts:90-170` เป็นฟังก์ชัน private และสั่ง "3 ทางเลือก" ตายตัว (`:115`, `:168`) | `gemini.ts:90-170` | **ทางเลือก A (แนะนำ):** สร้าง `src/lib/reply-suggest-prompt.ts` เป็นเจ้าของ prompt ของ Typhoon (กฎความปลอดภัย + 1-3 ประโยค + "ห้ามเดาชื่อ/เบอร์") โดย `gemini.ts` ไม่ถูกแตะ. ใส่เทสกันลอก drift: อ่านซอร์ส `gemini.ts` แล้วยืนยันว่าบรรทัดกฎปิดท้าย 3 บรรทัด (`:153-155`) ยังอยู่ในค่าคงที่ของเรา. **ทางเลือก B:** อนุมัติแก้ `gemini.ts` ครั้งเดียว (export ค่าคงที่กฎ) พร้อมจด Change Log. ถ้าไม่ตอบ ผมวางแผนตามทาง A |
| **C-2** | TC-AIT-04 / AC-AIT-06 ต้องการ "ยิงจริง ≤3/วินาที ภายใต้ 20 คำขอพร้อมกัน" แต่ pacing แบบ count แล้วค่อยเขียน (R-5) จะปล่อยทั้ง 20 ผ่านพร้อมกัน. และแถวที่ถูกข้าม/รอคิว/ทิ้งก็มี `createdAt` เหมือนแถวที่ยิงจริง จึงใช้ `createdAt` นับ "ยิงจริง" ไม่ได้ | spec §9 มี index `createdAt` อย่างเดียว | เพิ่มคอลัมน์ **`firedAt DateTime?`** (additive) + index `[firedAt]`, `[shopId, firedAt]` ใน S-4. ใช้วิธี **reserve-then-verify**: เขียน `firedAt=now` ก่อน แล้วนับอันดับของตัวเองใน window ถ้าอันดับเกินเพดานให้ล้าง `firedAt` แล้วรอ. วิธีนี้ปลอดภัยพอสำหรับเทส concurrency ที่ DB เดียว และ ceiling เดิมของ R-5 (clock skew ข้าม instance) ยังอยู่. **ต้องจด Change Log** เพราะ spec §9 ไม่มีคอลัมน์นี้ |
| **C-3** | contract ใน spec ไม่พอสำหรับ client. client ต้องรู้ว่าร้านนี้ใช้ Typhoon หรือไม่ (เพื่อเลือกโหมดแผง), ต้องรู้ `attempt` (สำหรับ PATCH), และ POST ต้องแยก trigger `AUTO_NEW_MESSAGE` กับ `AUTO_OPEN` | spec §10 | เพิ่ม `provider` ใน GET response · เพิ่ม `attempt` และ `feedback` ใน response · เพิ่ม `trigger?` (optional) ใน POST body. เป็น superset ของ spec จึงไม่ขัด แต่ docs S-1/S-2 ต้องเขียนตามนี้ |
| **C-4** | ทางเดิม `ai-suggest/route.ts` ต้องใช้ได้สำหรับร้าน Typhoon (กันแอปเก่า) แต่ถ้า route เดิมเรียก Typhoon เองจะข้าม pacing, claim และ logging | | route เดิมสำหรับร้าน Typhoon **ไม่เรียก provider เอง** ให้เรียก `requestAutoSuggest()` ตัวเดียวกับ `/auto` (ใช้ anchor = ข้อความล่าสุดของห้อง, manual=true) แล้วห่อเป็น `{suggestions:[text]}`. ข้อจำกัด: ถ้าข้อความล่าสุดไม่ใช่ลูกค้า ได้ 400 (แอปเก่าเท่านั้น). พฤติกรรมของร้านนอก allow-list ไม่เปลี่ยน |

---

## 1. ผลยืนยันจากโค้ด (ข้อที่ spec ยังเปิด)

**1.1 OQ-11 งานบอทตอบอัตโนมัติ**
- ตารางคือ **`AutoReplyJob`** (`prisma/schema.prisma:3427`)
- `chatMessageId @unique` (หนึ่งข้อความลูกค้าได้หนึ่งงาน)
- `status` เป็น String ค่า `"PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED"` (`:3439-3440`)
- สร้างงานเฉพาะที่ **Facebook webhook** (`facebook/webhook/route.ts:430`) และเฉพาะข้อความที่ `hasCustomerText=true` (`auto-reply.service.ts:74`). ห้องจาก LINE หรือข้อความสื่อล้วนจึงไม่มี job
- **กฎ SKIPPED_BOT ที่ผมกำหนด:** มีแถว `AutoReplyJob { chatMessageId = anchorMessageId, status IN (PENDING, PROCESSING), updatedAt > now-5min }`. เกณฑ์ 5 นาทีเท่ากับ `STUCK_AFTER_MS` ของ sweeper (`auto-reply.service.ts:34`) กัน job ค้างทำให้ห้องไม่ได้คำแนะนำตลอดกาล. ค่านี้ไม่ได้ export จึงต้อง **ประกาศ const ใหม่ในไฟล์เรา** ห้ามแก้ `auto-reply.service.ts` (OOS-6)
- ส่วน `DONE`, `SKIPPED`, `FAILED` และ "ไม่มี job" ไม่ถือว่าบอทดูแลอยู่. สอดคล้อง E-4: บอทไม่ match หรือ `handoffAt` มีค่า หรือ `autoReplyEnabled===false` ก็สร้างได้
- **ช่องว่างที่รู้ตัว:** `enqueue` ทำใน `after()` ส่วน broadcast ออกที่ DB trigger ตอน insert. job อาจยังไม่มีตอนที่ client ขอ (debounce 1.5 วิช่วยได้ส่วนใหญ่). กรณีหลุด: เราร่างไปแล้วบอทตอบก่อน → anchor ไม่ใช่ข้อความล่าสุด → ถูกทิ้งตาม BR-AIT-05 เสียแค่ 1 slot. บันทึกเป็น Risk ไม่ใช่ blocker

**1.2 ที่มาของชื่อที่ระบบรู้ (ใช้ใน S-7)**

| ชื่อ | แหล่ง | หลักฐาน |
|---|---|---|
| alias | `Conversation.alias` | `schema.prisma:1953`, `chat-crm.service.ts:56` |
| realName | `ExternalContact.name ?? buyer.displayName` | `chat-crm.service.ts:57` |
| `Customer` | **ไม่มีฟิลด์ชื่อเลย** มีแค่ `phone`, `email` (`schema.prisma:1123-1134`) จึงไม่เป็นแหล่งชื่อ | |
| ข้อมูล CRM ตัวอักษร | `ExternalContact.phones[]`, `.address`, `.note` (`:1889-1893`) | |
| ชื่อแอดมิน | `User.displayName` (`schema.prisma:13`) ของ `ChatMessage.senderUserId` ที่เป็น SHOP ใน 15 ข้อความล่าสุด **บวก** user ของ session | |

- ข้อควรระวัง: `senderUserId` เป็น nullable และ dev DB ทุกแถว SHOP เป็น null (memory `project_dev_db_no_attributed_shop_replies`) เทสต้อง seed `senderUserId` เอง
- ผมเสนอให้ S-7 รับ `knownLiterals: string[]` (phones, address จาก CRM) มา replace แบบตัวอักษรด้วย เพื่อจับที่อยู่ที่ไม่มีรหัสไปรษณีย์. Controller ตัดทิ้งได้ถ้าเห็นว่าเกิน FR-AIT-10
- แยกชื่อเต็มเป็นท่อนทีละ ≥2 ตัวอักษรก่อน replace (ภาษาไทยไม่มีขอบคำ จึงเป็นสตริงย่อยตรง ๆ): replace ชื่อลูกค้าเป็น "ลูกค้า", ชื่อแอดมินเป็น "แอดมิน". ชื่อสั้นที่เป็นคำทั่วไป (เช่น alias "ฟ้า") จะทำให้ประโยคเพี้ยน ยอมรับเพราะเป็นทิศปลอดภัย
- `shopName` ส่งได้ (ข้อมูลธุรกิจ) แต่ผ่าน `redactPii` ด้วย

**1.3 วิธี claim แบบ conditional ที่โปรเจกต์ใช้**
- `updateMany` มี WHERE เงื่อนไข แล้วตัดสินจาก `count`: `claimJob` (`auto-reply.service.ts:111-117`), `claimFreeUsageOrFail` (`ai-suggest-quota.service.ts:103-134`)
- แบบ insert แล้วดัก P2002 ก็มี (`:120-131`) แต่ convention `insert-then-catch-logs-every-error` เตือนว่า Postgres เขียน ERROR ลง log ทุกครั้งที่ชน
- **สำหรับ `AiSuggestRun` ใช้ `createMany({ data, skipDuplicates: true })`** (ON CONFLICT DO NOTHING ไม่เกิด ERROR ใน log, มี precedent 24 จุดใน repo). `count===1` คือชนะ. ถ้า `count===0` อ่านแถวเดิม:
  - READY → คืน
  - THINKING อายุ ≤30 วิ → คืน THINKING
  - THINKING อายุ >30 วิ → ยึดต่อด้วย `updateMany({ where:{id, status:'THINKING', createdAt:{lt: now-30s}}, data:{ createdAt: now } })` ถ้า `count===1` ถือว่ายึดสำเร็จ (ใช้ `createdAt` เป็น lease)
  - NONE → คืน NONE (ถือว่า attempt นี้จบแล้ว ต้องกด ↻ เพื่อได้ attempt+1)

**1.4 รูปแบบเทส**
- Vitest, `globals:true`, `environment:node`, `fileParallelism:false`
- เทส service/route ส่วนใหญ่ mock prisma ด้วย `vi.hoisted` + `vi.mock('@/lib/prisma')` (แบบ `src/services/__tests__/auto-reply.service.test.ts`). ที่ตั้ง: `src/lib/__tests__/`, `src/services/__tests__/`, route test อยู่ข้าง route
- เทสที่ต้องใช้ DB จริง (TC-AIT-03/04) ตั้งชื่อ `*.db.test.ts` ใช้แบบ `line-report-bind.db.test.ts:31-33`: `new PrismaClient({datasources:{db:{url}}})` เฉพาะเมื่อ `/@(localhost|127\.0\.0\.1):5434\//.test(url)` นอกนั้น `describe.skipIf`. ข้อมูลสร้างด้วย prefix `run` แล้วลบ scope ด้วย id ที่เทสสร้างเท่านั้น. `AiSuggestRun` ไม่มี FK จึงทดสอบ claim/pacing ได้โดยไม่ต้องสร้าง User/Shop
- 🛑 **คำสั่งรันเทส DB ต้องปักหมุดตรงในคำสั่ง** เพราะ `npm test` = `dotenv -e .env` ชี้ Supabase prod (state-snapshots 00067):
  `DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" npx vitest run <paths>`
- ไม่มี `@testing-library`/`jsdom` ใน repo (`package.json`) เทส FE จึงต้องทำที่ **pure module** (state machine) แล้วให้ Playwright (S-20) ตรวจส่วนที่เหลือ. ห้ามเดินเทส DOM

**1.5 A-3 (แอปเป็น WebView)**
- หา repo `deep-seller-app` บนเครื่องนี้ **ไม่พบ** ที่ `~/Projects/deep-seller-app` และ `~/Desktop/deep-seller-app`. `Glob ~/Projects/*app*` timeout. เทสใน repo อ้าง path `/Users/pongsakorn/Desktop/deep-seller-app/` ซึ่งเป็นเครื่องอื่น
- หลักฐานในโค้ดเรา สนับสนุนว่าเป็น WebView ที่เปิดหน้าเว็บเดียวกัน: `app-shell.ts:96` (`APP_UA_MARKER='DeepSellerApp'` "ต่อท้าย UA ของ WebView"), `account-deletion.ts:6` ("deep-seller-app เป็น WebView-first"), `app-shell.ts:51` (`SellerWebView`)
- **ยังไม่ถือว่ายืนยันครบ.** Controller ต้องรัน `ls ~/Projects | grep -i app` หรือถาม user path ของ repo แล้วตรวจว่าหน้าแชทเป็นการโหลดเว็บ `seller.*` ไม่ใช่ native screen. ผลต้องลง Change Log ก่อน Batch 3 (FE) เริ่ม

---

## 2. Contract freeze (Controller เขียนและ commit ก่อน dispatch โค้ด)

กฎ workflow #28: ล็อก contract ก่อนขนาน. Freeze commit ประกอบด้วย 1 ไฟล์ type บริสุทธิ์ + 1 ไฟล์ service stub (map S-9/S-10). Stub มีแค่ signature + `throw new Error('NOT_IMPLEMENTED')` ให้ tsc ผ่านระหว่างที่ T4/T5/T6 ทำขนาน. **S-19 grep-gate ต้องตรวจ `NOT_IMPLEMENTED` = 0** ก่อน merge.

### 2.1 `W/src/lib/ai-suggest-auto-types.ts` (pure, ไม่มี `server-only`, client import ได้)

```ts
export const AUTO_SUGGEST_OUTCOMES = [
  'OK','RATE_LIMITED','TIMEOUT','ERROR','UNRESOLVED_TOKEN',
  'SKIPPED_NOT_BUYER','SKIPPED_BOT','SKIPPED_SPAM','SKIPPED_NOT_ALLOWED','SKIPPED_EMPTY',
] as const
export type AutoSuggestOutcome = (typeof AUTO_SUGGEST_OUTCOMES)[number]
export const AUTO_SUGGEST_TRIGGERS = ['AUTO_NEW_MESSAGE','AUTO_OPEN','MANUAL'] as const
export type AutoSuggestTrigger = (typeof AUTO_SUGGEST_TRIGGERS)[number]
export const AUTO_SUGGEST_STATUSES = ['THINKING','READY','NONE'] as const
export type AutoSuggestStatus = (typeof AUTO_SUGGEST_STATUSES)[number]
export const AUTO_SUGGEST_FEEDBACKS = ['UP','DOWN'] as const
export type AutoSuggestFeedback = (typeof AUTO_SUGGEST_FEEDBACKS)[number]
export const AUTO_SUGGEST_FEEDBACK_REASONS = ['WRONG_INFO','OFF_TOPIC','BAD_TONE','LENGTH'] as const
export type AutoSuggestFeedbackReason = (typeof AUTO_SUGGEST_FEEDBACK_REASONS)[number]
export const AUTO_SUGGEST_NOTE_MAX = 120

/** reason ฝั่ง client = outcome ที่ไม่ใช่ OK + เหตุที่ไม่มีแถวผลลัพธ์ */
export type AutoSuggestReason =
  | Exclude<AutoSuggestOutcome, 'OK'>
  | 'NO_RUN'          // ยังไม่เคยมีแถวของ anchor นี้ → client ควร POST (กฎ ข)
  | 'STALE_ANCHOR'    // anchor ไม่ใช่ข้อความล่าสุดของห้อง
  | 'NOT_CONFIGURED'  // ร้านอยู่ใน allow-list แต่ไม่มีกุญแจ (E-13)
  | 'NOT_ENABLED'     // ร้านใช้ gemini (ไม่ใช่ typhoon)
export type AutoSuggestProvider = 'typhoon' | 'gemini' | 'none'

export type AutoSuggestState =
  | { status: 'READY'; anchorMessageId: string; attempt: number; suggestion: string; feedback: AutoSuggestFeedback | null }
  | { status: 'THINKING'; anchorMessageId: string; attempt: number }
  | { status: 'NONE'; anchorMessageId: string | null; attempt: number | null; reason: AutoSuggestReason }

export type AutoSuggestPostBody = { anchorMessageId: string; manual: boolean; trigger?: 'AUTO_NEW_MESSAGE' | 'AUTO_OPEN' }
export type AutoSuggestPostResponse = AutoSuggestState
export type AutoSuggestGetResponse = AutoSuggestState & { provider: AutoSuggestProvider }
export type AutoSuggestPatchBody = {
  anchorMessageId: string; attempt: number; feedback: AutoSuggestFeedback
  reason?: AutoSuggestFeedbackReason; note?: string // ≤120
}
export type AutoSuggestPatchResponse = { ok: true }
```

### 2.2 Prisma model (S-4) = spec §9 + ภาคผนวก ก + `firedAt` (C-2)

เพิ่มจากที่ spec ให้: `firedAt DateTime?` กับ `@@index([firedAt])`, `@@index([shopId, firedAt])`. ฟิลด์อื่นตาม spec ทุกตัว ไม่มี FK, ไม่มีคอลัมน์ transcript.

### 2.3 Signatures ของโมดูลใหม่ (ล็อกแล้ว ห้าม dev เปลี่ยนเอง)

**`W/src/lib/pii-redact.ts` (เพิ่มแบบ additive ห้ามแตะ `redactPii`)**
```ts
export interface PiiVault { readonly table: ReadonlyMap<string, string> /* token -> ค่าจริง */ }
export function createPiiVault(): PiiVault
/** ป้ายมีลำดับต่อชนิดตลอด request เช่น [เบอร์โทร#1] · ค่าเดียวกัน = ป้ายเดียวกัน · defang ป้ายเลียนแบบที่ลูกค้าพิมพ์ก่อน (E-16) */
export function redactPiiReversible(input: string, vault: PiiVault): RedactResult
export function restorePii(text: string, vault: PiiVault): { text: string; unresolved: string[] }
// unresolved รวมทั้ง [เบอร์โทร#9] ที่ไม่มีในตาราง และ [เบอร์โทร] ที่ไม่มีเลขลำดับ
```
เทสกัน drift: `redactPiiReversible(x).text` เมื่อตัด `#\d+` ออก ต้องเท่ากับ `redactPii(x).text` ทุกข้อความใน corpus.

**`W/src/lib/ai-suggest-turns.ts`** (pure) ตัวประกอบ turns ที่ย้ายมาจาก `ai-suggest/route.ts:268-289`
```ts
export function buildSuggestTurns(
  rows: { senderRole: string; type: string; body: string | null; productRefId: string | null }[],
  opts: { productCards: Map<string, {name:string;price:string;isActive:boolean}>; includeProductContext: boolean; externalSafe: boolean },
): SuggestTurn[]
// externalSafe=true: IMAGE→"[รูป]" · AUDIO→"[ข้อความเสียง]" · VIDEO/FILE→"[ไฟล์]" (caption ยังตามเข้ามาแต่ต้องผ่าน sanitize ทีหลัง)
```

**`W/src/lib/ai-suggest-sanitize.ts`** (`server-only`)
```ts
export class SanitizeError extends Error {}
export interface SanitizeInput {
  turns: SuggestTurn[]; shopName: string; instruction?: string; contextBlock?: string
  customerNote?: string | null
  knownCustomerNames: string[]; adminNames: string[]; knownLiterals?: string[]
}
export interface SanitizeOutput {
  turns: SuggestTurn[]; shopName: string; instruction: string; contextBlock: string
  customerName: null            // ไม่ส่งชื่อดิบเสมอ
  customerNote: string | null   // mode 'typhoon' => null เสมอ · 'gemini' => redact แล้ว
  vault: PiiVault; foundKinds: PiiKind[]
}
export function sanitizeForExternalAi(input: SanitizeInput, mode: 'typhoon' | 'gemini'): SanitizeOutput // throw SanitizeError = ห้ามเรียก provider
```

**`W/src/lib/typhoon.ts`** (`server-only`)
```ts
export const TYPHOON_ENDPOINT = 'https://api.opentyphoon.ai/v1/chat/completions'
export const TYPHOON_DEFAULT_MODEL = 'typhoon-v2.5-30b-a3b-instruct'
export const TYPHOON_TIMEOUT_MS = 8_000
export type TyphoonErrorKind = 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'EMPTY'
export class TyphoonNotConfiguredError extends Error {}
export class TyphoonRateLimitedError extends Error {}                 // HTTP 429
export class TyphoonApiError extends Error { readonly kind: TyphoonErrorKind; readonly status?: number }
export function isTyphoonConfigured(): boolean
export async function generateTyphoonReply(turns: SuggestTurn[], ctx: SuggestContext): Promise<{ text: string; usage: TokenUsage | null; model: string; latencyMs: number }>
// ไม่ retry · message ของ error ห้ามมี key และห้ามมี response body · ไม่มี console.* ที่รับ body/text
```

**`W/src/lib/reply-suggest-prompt.ts`**
```ts
export function buildTyphoonSystemPrompt(ctx: SuggestContext): string   // ทางเลือก A ของ C-1
export function buildTyphoonTranscript(turns: SuggestTurn[]): string
```

**`W/src/lib/reply-suggest-provider.ts`**
```ts
export type SuggestProvider = 'typhoon' | 'gemini' | 'none'
export function resolveSuggestProvider(shopId: string): SuggestProvider
// TYPHOON_SUGGEST_SHOP_IDS: ว่าง→gemini · "a,b"→typhoon ถ้า id อยู่ในรายการ · "*"→typhoon ทุกร้าน
// typhoon แต่ !isTyphoonConfigured() → 'none' (ห้ามถอยไป Gemini)
export type DraftResult = { suggestions: string[]; usage: TokenUsage | null; model: string; latencyMs: number }
export async function draftReplySuggestions(provider: 'typhoon' | 'gemini', turns: SuggestTurn[], ctx: SuggestContext, media?: SuggestMedia[]): Promise<DraftResult>
// provider 'typhoon' ไม่อ่าน media เด็ดขาด (OOS-7) · 'gemini' เรียก generateReplySuggestions เดิม
```

**`W/src/services/ai-suggest-auto.service.ts`**
```ts
export interface RequestAutoSuggestParams {
  shopId: string; conversationId: string; userId: string; userDisplayName: string | null
  anchorMessageId: string; manual: boolean; trigger: AutoSuggestTrigger
}
export type RequestAutoSuggestResult = AutoSuggestState | { status: 'INVALID_ANCHOR' } // INVALID_ANCHOR -> route 400
export async function requestAutoSuggest(p: RequestAutoSuggestParams): Promise<RequestAutoSuggestResult>
export async function getLatestAutoSuggest(shopId: string, conversationId: string): Promise<AutoSuggestGetResponse>
export async function submitAutoSuggestFeedback(p: { shopId: string; conversationId: string } & AutoSuggestPatchBody): Promise<{ ok: boolean }> // ok=false -> 404
// export เพิ่มสำหรับเทส: clampSuggestion, computePacingVerdict, reserveSlot, claimRun
export function clampSuggestion(text: string, opts?: { maxSentences?: number; maxChars?: number }): string
```
ค่าที่ SDS กำหนด: `maxSentences=3`, `maxChars=400`. ตัดประโยคด้วย `/(?<=[.!?…])\s+|\n+|\s{2,}/`; ถ้าเกิน `maxChars` ตัดที่ช่องว่างสุดท้ายก่อนถึงเพดาน ถ้าไม่มีให้ตัดที่เพดาน. ceiling: ข้อความไทยที่ไม่มีช่องว่างเลยจะถูกตัดกลางคำ ยอมรับเพราะ prompt คุมความยาวเป็นด่านแรก

**Pacing (ใน service)**
```ts
// env: AI_SUGGEST_RPS (default 3), AI_SUGGEST_RPM (default 100), ต่อร้าน = floor(RPM/2)
// reserveSlot(runId, shopId): เขียน firedAt=now → findMany({provider:'typhoon', firedAt>=now-60s}, orderBy [firedAt asc, id asc])
// → อันดับของตัวเองใน (1s ล่าสุด รวม ≤RPS) (60s ล่าสุด รวม ≤RPM) (60s ล่าสุดของร้าน ≤RPM/2); ไม่ผ่าน → firedAt=null, sleep 250ms, ลองใหม่
// deadline 5s นับจากเริ่ม request → ทิ้ง: status NONE, outcome RATE_LIMITED
```

---

## 3. ตาราง task (1 แถว = 1 task)

ย่อ `W=/Users/craftman/Projects/safepay-typhoon-suggest`, `D=W/docs/20 - Features/00019 - AI Reply Assistant`. path ในตารางเขียนเต็ม.

| # | target path | theme source path | scope | atomic-commit unit |
|---|---|---|---|---|
| **G0** (Controller) | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/ai-suggest-auto-types.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/services/ai-suggest-auto.service.ts` (create, stub NOT_IMPLEMENTED) | N/A (no UI) | วาง contract ตามหัวข้อ 2 เท่านั้น. serves S-9, S-10 | U0 |
| **D1** (safepay-docs) S-1 | `D/PRD.md`, `D/BRD.md`, `D/SRS.md`, `D/API.md`, `D/SDS.md`, `D/DATABASE.md`, `D/EXTENSIONS-2026-07-25.md`, `D/EXTENSIONS-2026-07-29-usage-limit.md` (ทั้งหมดเต็ม path ใต้ `/Users/craftman/Projects/safepay-typhoon-suggest/docs/20 - Features/00019 - AI Reply Assistant/`) | N/A (docs) | sync ตาม spec §6.1 + §17 + ข้อความพร้อมวางในหัวข้อ 7. gate: `rg "BR-AIT-0[1-9]\|BR-AIT-1[0-2]"` ครบ 12 | U1 |
| **D2** (safepay-docs) S-2 | `/Users/craftman/Projects/safepay-typhoon-suggest/docs/SRS.md` | N/A (docs) | เพิ่ม data model `AiSuggestRun`, API ref 3 method, enums (รวม `firedAt`, `provider`, ฟิลด์ที่ C-3 เพิ่ม). ตรวจ `rg "AiSuggestRun\|ai-suggest/auto"` | U2 |
| **D3** (safepay-docs) S-3 | `/Users/craftman/Projects/safepay-typhoon-suggest/.env.example`<br>`/Users/craftman/Projects/safepay-typhoon-suggest/docs/qa/ai-suggestion-usage-limit-qa-checklist.md` | N/A (docs) | เพิ่ม 5 env + แก้คอมเมนต์ `GEMINI_MODEL` บรรทัด 84 ให้ตรง default จริง `gemini-2.5-flash-lite` (`gemini.ts:25-27`). เพิ่มเส้นทาง Typhoon ใน QA checklist | U3 |
| **T1** (safepay-database) S-4 | `/Users/craftman/Projects/safepay-typhoon-suggest/prisma/schema.prisma` (modify)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/prisma/migrations/<ts>_ai_suggest_run/migration.sql` (create, ts > migration ล่าสุด) | N/A (no UI) | model `AiSuggestRun` + feedback 4 ฟิลด์ + `firedAt`. migration CREATE TABLE/INDEX ล้วน. apply ด้วย `npm run db:local:migrate` (ปักหมุด 5434). `prisma generate` + `tsc` เต็ม. ห้าม `migrate dev`/`db pull` | U4 |
| **T2a** (developer) S-8 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/pii-redact.ts` (modify additive)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/__tests__/pii-redact-reversible.test.ts` (create) | N/A (no UI) | `createPiiVault`, `redactPiiReversible`, `restorePii`. `pii-redact.test.ts` เดิมผ่านโดยไม่แก้. เทส round-trip, parity กับ `redactPii`, ป้ายเลียนแบบ, ป้ายไม่รู้จัก | U5 |
| **T2b** (developer) S-7 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/ai-suggest-sanitize.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/ai-suggest-turns.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/__tests__/ai-suggest-sanitize.test.ts` (create) | N/A (no UI) | `sanitizeForExternalAi` + `buildSuggestTurns`. corpus ตาม S-7 (เบอร์ 10 รูปแบบ, บัตร 13, อีเมล, บัญชี 10-15, ที่อยู่เต็ม, ชื่อ). **mutation:** เทสต้องแดงเมื่อถอด `redactPii` ทีละชนิด (เขียนเป็น test ที่ mock `redactPiiReversible` ให้ไม่ปิดบังชนิดหนึ่ง แล้ว expect fail). รอ T2a เสร็จ (import) | U6 |
| **T3a** (developer) S-5 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/typhoon.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/reply-suggest-prompt.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/__tests__/typhoon.test.ts` (create) | N/A (no UI) | ตัวเรียก Typhoon + prompt ตาม C-1 ทาง A (+ เทสกันลอก `gemini.ts:153-155`). 429 → fetch 1 ครั้ง; ตอบว่าง → ApiError EMPTY; key หาย → ไม่มี fetch; timeout → kind TIMEOUT. **`git diff` ต้องไม่แตะ `gemini.ts`** | U7 |
| **T3b** (developer) S-6 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/reply-suggest-provider.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/__tests__/reply-suggest-provider.test.ts` (create) | N/A (no UI) | `resolveSuggestProvider` + `draftReplySuggestions`. TC-AIT-06 (ว่าง/ระบุ/`*`/ไม่มีกุญแจ→none/ช่องว่างและจุลภาคซ้ำ). รอ T3a | U8 |
| **T4** (developer) S-9 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/services/ai-suggest-auto.service.ts` (replace stub)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/services/__tests__/ai-suggest-auto.service.test.ts` (create, mock prisma)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/services/__tests__/ai-suggest-auto.service.db.test.ts` (create) | N/A (no UI) | orchestration ครบ (ก)-(ฉ) ตาม S-9 + `clampSuggestion`. TC-AIT-03/04/05/07 ตามตาราง S-9. จุดที่ต้องเขียนเทสคุมจริง: เงื่อนไขข้าม 5 ข้อต่างได้ outcome และ "ไม่มี fetch"; claim ซ้อน 2 ตัว → 1 แถว; 20 คำขอ concurrent → ยิงจริง ≤3 ในหน้าต่าง 1 วิ ผ่าน DB จริง. ไม่มี `console.*` ที่รับ body/text | U9 |
| **T5** (developer) S-10 + S-11 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/validations.ts` (modify)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/chat/conversations/[id]/ai-suggest/auto/route.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/chat/conversations/[id]/ai-suggest/auto/route.test.ts` (create) | N/A (no UI) | `POST`/`GET`/`PATCH` ตามหัวข้อ 5.3. เทส route ตาม S-10/S-11: 200 READY/THINKING/NONE · 400 · 401/404 · ↻ สองครั้งได้ attempt ต่างกัน · ครั้งที่ 16 → 429 · header Cache-Control · GET ไม่มี fetch · reason นอกรายการ 400 · note 121 ตัว 400 · note มีเบอร์ถูกปิดบัง (**mutation**: ถอด redactPii แล้วเทสแดง) · แถวร้านอื่น 404. mock service ได้ตาม contract | U10 |
| **T6** (developer) S-13 → S-12 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/chat/conversations/[id]/ai-suggest/route.ts` (modify)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/chat/conversations/[id]/ai-suggest/route.test.ts` (create) | N/A (no UI) | ไฟล์เดียว 2 commit ต่อกัน: **U11a (S-13)** ใช้ `buildSuggestTurns` + `sanitizeForExternalAi(...,'gemini')` + `restorePii` บนเส้นทาง Gemini (ไม่มีเบอร์/อีเมล/ที่อยู่/`customerNote` ดิบ ใน payload ไป Gemini); **U11b (S-12)** แยกสาขา `resolveSuggestProvider` → typhoon ส่งต่อ `requestAutoSuggest` ไม่ผ่านโควตา. ร้านนอก allow-list ต้องเหมือนเดิม 100% (402 `QUOTA_EXCEEDED` ครั้งที่ 11). AC-AIT-11 | U11a, U11b |
| **T7** (developer, ux gate) S-14 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/auto-suggest-machine.ts` (create, pure reducer)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/useAutoSuggest.ts` (create)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/__tests__/auto-suggest-machine.test.ts` (create) | รอ Design Spec (ux) | hook + state machine. ตัดสินใจทั้งหมดอยู่ใน pure module: visible+mounted เท่านั้นที่ยิง, debounce 1.5 วิ trailing, กฎ ข (GET ก่อน แล้ว POST เฉพาะ reason `NO_RUN`), poll GET ทุก 1.5 วิ ไม่เกิน 10 วิ เฉพาะ THINKING, ทิ้งผลที่ anchor ไม่ใช่ BUYER ล่าสุด. ยังไม่ต่อเข้า ChatThread | U12 |
| **T8** (developer, ux gate) S-15 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AiSuggestPanel.tsx` (modify)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/i18n/dictionaries/th.ts` (modify)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/i18n/dictionaries/en.ts` (modify) | รอ Design Spec (ux) | โหมดใหม่ของแผง (props ใหม่ต้อง **optional** เพื่อให้ `ChatThread.tsx` เดิม tsc ผ่านก่อน wire): คำตอบเดียว · ปุ่ม 4 อย่าง · เมนูเหตุผล · สถานะกำลังคิด · `role="status"` · ตัดบรรทัดท้ายแผง (`:335-338`) · ไม่มีชิป token/USD และไม่เรียก `ai-quota` เมื่อ Typhoon. ต้องรักษา `hidePayments` และ `no-payment-entry-in-app.test.ts` (ชี้ไฟล์นี้) ให้ผ่าน. ข้อความใหม่ผ่าน `useT` + `dictionaries.test.ts` | U13 |
| **T9** (developer) S-17 | `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(dashboard)/settings/ai/AiSettingForm.tsx` (modify)<br>`/Users/craftman/Projects/safepay-typhoon-suggest/src/i18n/dictionaries/th.ts` + `en.ts` (modify) | รอ Design Spec (ux) | คำอธิบายสวิตช์สื่อ (ข้อความจริงโดย ux). **ชนไฟล์ dictionary กับ T8** จึงห้ามขนานกับ T8 (ดูหัวข้อ 4) | U14 |
| **T10** (developer, ux gate) S-16 (+ S-18 ถ้า ux ว่าไม่มี) | `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` (modify) | รอ Design Spec (ux) | ต่อ `useAutoSuggest` + แผงใหม่ใน `ChatThread` (`:1422-1425`, `:3222-3232`). `setText` เรียกเฉพาะจาก `onPick`. แอดมินพิมพ์ → แผงซ่อน มีปุ่มเรียกกลับเฉพาะตอนซ่อน. "ปิด" ปิดเฉพาะ anchor. ไม่แย่งโฟกัส. ถ้า T8 ออกแบบ props เป็น required แล้ว tsc ไม่ผ่าน ให้รวม T8+T10 เป็น unit เดียว (U13=U15). S-18: ถ้า ux ตรวจแล้วมีอยู่แล้ว (`ChatThread.tsx:2432-2433`) → ปิดเป็น N/A ลง Change Log ไม่ต้อง commit | U15 |
| **R1** (safepay-reviewer + product Gate 1) S-19 | (ไม่แก้ไฟล์) ตรวจ: `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/channels/facebook/webhook/route.ts`, `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/channels/line/webhook/route.ts` และไฟล์ใหม่ทั้งหมด | N/A | grep-gate: `rg "reply-suggest-provider\|typhoon" src/app/api/**/webhook*`=0 · `git diff main --stat` ไม่มี webhook · `rg "NOT_IMPLEMENTED"`=0 · `rg "console\." <ไฟล์ใหม่>` ไม่รับ body/text · `rg "generateReplySuggestions" src/app`=0 · `rg "resolveActiveShopContext\|requireActiveShop" "src/app/api/chat/"`=0 · HR9 react-toastify=0 · HR12 ไม่มี emoji · `git diff main -- src/lib/gemini.ts ...ai-enhance.service.ts ...auto-reply.service.ts ...parse-address/route.ts` ว่าง | (ไม่มี commit) |
| **Q1** (safepay-qa + security + ux) S-20 | (ไม่แก้ไฟล์) Playwright E2E ชี้ `*.deepth.local:4000`; screenshots ใต้ `.screenshots/` | N/A | ตาม S-20 + วัด latency p95 ≤4 วิ. security ตรวจ payload ที่ออกไป Typhoon จริง 1 ครั้งด้วยกุญแจจริงใน local (workflow #13) | (ไม่มี commit) |
| **C1** (Controller) S-21 | `/Users/craftman/Projects/safepay-typhoon-suggest/CLAUDE.md`<br>`/Users/craftman/Projects/safepay-typhoon-suggest/docs/claude/state-snapshots.md` | N/A | บรรทัด snapshot + ผล A-3 + แจ้ง user เรื่อง `TYPHOON_API_KEY` บน Vercel Production (OOS-21) และ HR15 ทั้ง 3 ข้อก่อน push | U16 |

### 3.1 ตาราง theme-source mapping เฉพาะ FE (เว้นช่องรอ Design Spec)

| Task | ไฟล์ปลายทาง | Base ที่ใช้อยู่ตอนนี้ (ของเดิม) | Theme source ใหม่ที่ ux ระบุ | สถานะ |
|---|---|---|---|---|
| T7 | `useAutoSuggest.ts`, `auto-suggest-machine.ts` | ไม่มี UI | N/A | พร้อม |
| T8 | `AiSuggestPanel.tsx` | "theme/paces card + list rows" (หัวไฟล์ `:11-12`) · layout in-flow แถบเหนือ composer user อนุมัติแล้ว 2026-07-23 | **รอ Design Spec** (ช่อง: path ไฟล์ธีม Paces ของ list-row/dropdown-menu/badge ที่ ux เลือก) | ต้องรอ |
| T9 | `AiSettingForm.tsx` | หน้าเดิม | **รอ Design Spec** (เฉพาะข้อความคำอธิบาย) | ต้องรอ |
| T10 | `ChatThread.tsx` | ไฟล์เดิม | **รอ Design Spec** (และผลตรวจ OQ-13/S-18) | ต้องรอ |

เงื่อนไขที่ใส่ใน prompt ของ dev ทุกตัว: HR1 ห้ามออกแบบเอง, HR7 ห้าม arbitrary Tailwind, HR9 `pacesToast` เท่านั้น, HR12 ห้าม emoji, tap target `size-11 lg:size-7`, commit ต้องมีบรรทัด `Base: theme/...` (HR3).

---

## 4. Dependency และ batch

```
D1,D2,D3 (docs) ──┐                                       G0 (Controller, contract freeze)
A-3 ยืนยัน ───────┤                                          │
                  ▼                                          ▼
              [B0 ผ่าน HR11 + user รับทราบ]  ───►  B1: T1 ∥ T2a→T2b ∥ T3a→T3b
                                                          │ (review+commit ทุกชิ้น, regenerate prisma)
                                                          ▼
                                                  B2: T4 ∥ T5 ∥ T6
                                                          │ (review + security PII + Gate 1 audit)
                                                          ▼
                                                  B3: T7 ∥ T8     (ต้องมี Design Spec)
                                                          ▼
                                                  B4: T9 ──► T10   (ชนไฟล์ dictionary กับ T8, ChatThread ชนกับ T7/T8)
                                                          ▼
                                                  R1 → Q1 → C1
```

| Batch | งานขนาน (≤3, ไฟล์ไม่ซ้ำ) | ตรวจไฟล์ซ้ำ | เงื่อนไขเริ่ม | หลังจบ batch |
|---|---|---|---|---|
| **B0** | D1 ∥ D2 ∥ D3 (safepay-docs 3 ตัว) | คนละชุดไฟล์ | user อนุมัติ PRD/BRD แล้ว (2026-10-09). C-1..C-4 ตัดสินแล้วเพื่อให้ docs เขียนถูก | review docs, commit 3 อัน. **S-1..3 ต้อง DONE ก่อนเขียนโค้ด (HR11)** |
| **G0** | Controller เอง | | หลัง B0 | commit `U0` |
| **B1** | **T1** ∥ **T2** (T2a แล้ว T2b ใน dev เดียวกัน) ∥ **T3** (T3a แล้ว T3b ใน dev เดียวกัน) | T1=`prisma/**`, T2=`src/lib/pii-redact.ts`+sanitize+turns, T3=`typhoon`/`prompt`/`provider`. ไม่มีไฟล์ร่วม. `validations.ts` ไม่แตะใน batch นี้ | G0 | batch-QA: tsc เต็ม + vitest ไฟล์ใหม่ (ปักหมุด 5434). Gate 1 scope-audit. T1 ต้อง `prisma generate` ก่อน B2 |
| **B2** | **T4** ∥ **T5** ∥ **T6** | T4=service, T5=`validations.ts`+`auto/route*`, T6=`ai-suggest/route*`. ไม่ซ้ำ. ทั้งสามพึ่ง contract จาก G0 (stub) จึงขนานได้ | B1 commit ครบ | **security review PII mandatory** (workflow #9/#16) · reviewer ตรวจ cross-file error mapping (หัวข้อ 5.6) · batch-QA ด้วย curl: 401/400/404/429, GET ไม่ยิงโมเดล, ร้านนอก allow-list ครบ 402. ถ้า dev ไม่ยอมขนานเพราะ stub: ลำดับสำรอง T4 → (T5 ∥ T6) |
| **B3** | **T7** ∥ **T8** | T7=`useAutoSuggest.ts`+machine, T8=`AiSuggestPanel.tsx`+dictionaries. ไม่ซ้ำ | Design Spec ของ ux final + A-3 ยืนยัน + B2 commit (เพื่อ E2E ได้) | per-task smoke ผ่าน Chrome DevTools MCP |
| **B4** | **T9** แล้ว **T10** (ลำดับ ไม่ขนาน) หรือ T9 ∥ T10 ถ้า T9 ไม่แตะ dictionary ที่ T8 แตะค้าง (T8 commit แล้ว) | T9 กับ T10 คนละไฟล์ แต่ T9 แตะ `th.ts`/`en.ts` ซึ่ง T8 แตะ → ต้องรอ T8 commit ก่อน. ผ่านเงื่อนไขนี้แล้ว T9 ∥ T10 ได้ | B3 commit | batch-QA: เปิดห้อง→กำลังคิด→คำแนะนำ→พิมพ์→ซ่อน→เรียกกลับ |
| **Final** | R1 → Q1 (end-of-phase) → Gate 2 sign-off → retro → C1 | | | HR15: แจ้ง user 3 ข้อก่อน push `main` |

กฎวิ่งประกอบ: reviewer วิ่งหลัง dev ทุกตัว (ไม่ขนานกับงานที่รีวิว) · commit ด้วย `git add <explicit paths>` เท่านั้น (workflow #22; git status ตอนนี้ยังมีไฟล์ untracked ของ session อื่นอยู่ใน main repo) · ทุก commit cite S-id · developer ขนานห้าม commit เอง (memory `feedback_parallel_dev_agents_no_commit`).

---

## 5. Technical Design

### 5.1 Affected files

**Create** (ใต้ `/Users/craftman/Projects/safepay-typhoon-suggest/`)
- `src/lib/ai-suggest-auto-types.ts`
- `src/lib/typhoon.ts`
- `src/lib/reply-suggest-prompt.ts`
- `src/lib/reply-suggest-provider.ts`
- `src/lib/ai-suggest-sanitize.ts`
- `src/lib/ai-suggest-turns.ts`
- `src/lib/auto-suggest-machine.ts`
- `src/services/ai-suggest-auto.service.ts`
- `src/app/api/chat/conversations/[id]/ai-suggest/auto/route.ts`
- `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/useAutoSuggest.ts`
- `prisma/migrations/<ts>_ai_suggest_run/migration.sql`
- ไฟล์เทสตามตาราง (typhoon, provider, sanitize, pii-redact-reversible, ai-suggest-auto.service, `.db.test`, auto/route, ai-suggest/route, auto-suggest-machine)

**Modify**
- `src/lib/pii-redact.ts` (additive)
- `src/lib/validations.ts` (ต่อจาก `AiSuggestRequestSchema` บรรทัด 1288)
- `src/app/api/chat/conversations/[id]/ai-suggest/route.ts`
- `prisma/schema.prisma`
- `AiSuggestPanel.tsx`
- `ChatThread.tsx`
- `AiSettingForm.tsx`
- `src/i18n/dictionaries/th.ts` และ `en.ts`
- `.env.example`
- docs ตาม D1-D3, `CLAUDE.md`, `docs/claude/state-snapshots.md`

**ห้ามแตะ:** `src/lib/gemini.ts`, `ai-enhance.service.ts`, `auto-reply.service.ts`, `parse-address/route.ts`, `facebook/webhook`, `line/webhook`.

### 5.2 Data flow

1. ลูกค้าส่งข้อความ → DB trigger broadcast `chat:{conversationId}` (signal-only) → client `refetchNewer()` เห็นข้อความ BUYER ล่าสุด
2. `useAutoSuggest` (mount + visible เท่านั้น) debounce 1.5 วิ → `POST /auto {anchorMessageId, manual:false, trigger}`
3. เปิดห้อง: `GET /auto` ก่อน → ถ้า `reason==='NO_RUN'` ค่อย POST (`trigger:'AUTO_OPEN'`)
4. service: validate anchor ∈ ห้อง → เงื่อนไขข้าม → claim แถว THINKING → โหลดบริบท (`getConversationCrm`, 15 ข้อความล่าสุด `type != AUTO_ORDER_RESULT_TYPE`, `getEffectiveAiSetting(stored, isOwnerPaidPlan)` เพื่อคงสิทธิ์บริบท non-paid ตาม OQ-7/FR-AIQ-10 โดย error ของ `isOwnerPaidPlan` ให้ถือเป็น non-paid ไม่ fail ทั้งคำขอ) → `buildSuggestTurns(externalSafe)` → `sanitizeForExternalAi(..., 'typhoon')` → `reserveSlot` → `draftReplySuggestions('typhoon')` → `restorePii` → `clampSuggestion` → อัปเดตแถว READY (หรือ NONE + outcome)
5. ก่อนคืนผล ตรวจซ้ำว่า anchor ยังเป็นข้อความล่าสุด ถ้าไม่ใช่ → บันทึก OK แต่ตอบ NONE `STALE_ANCHOR` (กัน FR-AIT-08 ฝั่ง server)
6. ผู้ดูคนที่สอง: claim ชน → ได้ THINKING → poll GET

### 5.3 API flow

- `POST /api/chat/conversations/{id}/ai-suggest/auto`
  - ลำดับ: `getServerSession` → `sessionUserId()` (null → 401) → `v.safeParse(IdParamSchema)` (400) → body ผ่าน Valibot (400) → ถ้า `manual:true` เรียก `checkApiRateLimit('ai-suggest:'+userId, 15, 60_000)` (ใช้ key เดียวกับเส้นเดิมเพื่อแบ่งงบกัน; false → 429 + `Retry-After: 60`) → `resolveConversationShopId` (null → 404) → `conversation.findFirst({id, shopId})` → `requestAutoSuggest`
  - `maxDuration = 30` (รอคิว ≤5 วิ + timeout Typhoon 8 วิ + DB เกินกว่า default บางแผน)
  - ผลลัพธ์ 200 body = `AutoSuggestState` (`INVALID_ANCHOR` → 400)
- `GET` — session → shopId จากเธรด → `getLatestAutoSuggest` (อ่าน DB เท่านั้น). ค่า: ข้อความล่าสุดของห้องไม่ใช่ BUYER → `NONE reason:'STALE_ANCHOR'` (`anchorMessageId:null`); ยังไม่มีแถวของ anchor ล่าสุด → `NONE reason:'NO_RUN', anchorMessageId:<id>`; มีหลาย attempt → เอา attempt สูงสุด. คืน `provider` ทุกครั้ง (`provider!=='typhoon'` → `NONE reason:'NOT_ENABLED'`)
- `PATCH` — body Valibot (`feedback ∈ UP|DOWN`, `reason ∈ 4 ค่า optional`, `note ≤120` optional, `attempt` int ≥1) → `redactPii(note)` ก่อนบันทึก (BR-AIT-11) → `submitAutoSuggestFeedback` ที่ `updateMany({ where:{conversationId, shopId, anchorMessageId, attempt, status:'READY'}, data })` → `count===0` → 404
- ทุก response: `export const dynamic='force-dynamic'` + `Cache-Control: private, no-store, max-age=0, must-revalidate`

### 5.4 Auth/permission rules

- `shopId` มาจากเธรดผ่าน `resolveConversationShopId` เท่านั้น (`chat-scope.ts:126`). ห้ามรับจาก client. `rg "resolveActiveShopContext|requireActiveShop" src/app/api/chat/` ต้อง 0 (กฎในหัว `chat-scope.ts`)
- `sessionUserId()` ไม่ cast. ownership อยู่ใน WHERE `{id, shopId}`. เธรดของร้านอื่น → 404 (ไม่ใช่ 403)
- `allow-list` ตัดสินตามร้านของเธรด (E-15)
- NextAuth session + service guard เท่านั้น ไม่มี RLS
- Env: `TYPHOON_API_KEY` อ่านฝั่ง server (`server-only`) ห้ามมี `NEXT_PUBLIC_`; ไม่อยู่ใน error/log

### 5.5 Database impact

**แตะ schema → dispatch `safepay-database` (T1) ก่อน.** ตารางใหม่ 1 ตาราง additive ล้วน ไม่แตะตารางเดิม ไม่ backfill. ข้อควรระวัง:
- migration เป็น CREATE TABLE + CREATE INDEX + UNIQUE ล้วน (grep ห้ามเจอ ALTER/DROP)
- apply บน local ด้วย `npm run db:local:migrate` (ปักหมุด `localhost:5434`). ห้าม `migrate dev`, `db pull`, `migrate reset` (HR13/HR14, memory `project_shared_db_drift_no_migrate_dev`)
- HR15: push `main` = `prisma migrate deploy` บน prod ในตัว → ก่อน push ต้องบอก user 3 ข้อ (prod ไม่ต้องสั่ง / local ต้อง apply เอง / migrate ล้ม = deploy ไม่ขึ้น) · ผมสั่ง migrate ชี้ prod เองไม่ได้
- ตารางไม่มี FK → ลบเธรดแล้วแถวค้าง (ตั้งใจตาม spec). retention เป็นงานแยก (OOS-13)
- query ที่ใช้ index: pacing → `[firedAt]`, `[shopId, firedAt]`; GET ห้อง → `[conversationId, createdAt]` (ถ้าต้องหา attempt สูงสุดของ anchor ใช้ unique `[conversationId, anchorMessageId, attempt]` order by attempt desc ได้เลย)

### 5.6 Error handling และ Cross-file error-mapping (บังคับ enumerate)

service ใช้ **discriminated result** แทน throw เป็นหลัก (INVALID_ANCHOR, claim ชน, pacing ทิ้ง, unresolved token ไม่ throw) ลดจุดที่ route ต้อง catch. custom Error ที่ throw ข้ามไฟล์มี 4 ตัว:

| Error ใหม่ | throw ที่ | catch ที่ (ไฟล์:จุด) | ผลต่อ client |
|---|---|---|---|
| `TyphoonNotConfiguredError` | `src/lib/typhoon.ts` | `ai-suggest-auto.service.ts` รอบ `draftReplySuggestions` → outcome `SKIPPED_NOT_ALLOWED`, status NONE, reason `NOT_CONFIGURED` | `/auto` POST: **200 NONE**. route เดิม (T6 สาขา typhoon) แปลง NONE+`NOT_CONFIGURED` → **503** `{error:"ระบบ AI ยังไม่พร้อมใช้งาน (ยังไม่ตั้งค่า)"}` (ข้อความเดียวกับ Gemini `route.ts:379`) |
| `TyphoonRateLimitedError` | `typhoon.ts` (HTTP 429) | service → outcome `RATE_LIMITED`, NONE (ไม่ retry) | `/auto`: **200 NONE** · route เดิม: **429** + `Retry-After: 5` + `{error:"ใช้ AI ถี่เกินไป กรุณารอสักครู่"}` |
| `TyphoonApiError` (`kind` TIMEOUT / NETWORK / HTTP / EMPTY) | `typhoon.ts` | service → kind `TIMEOUT` ⇒ outcome `TIMEOUT`; นอกนั้น `ERROR` · ทั้งคู่ NONE | `/auto`: **200 NONE** · route เดิม: **502** `{error:"AI ไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง"}` (ห้ามใส่ `detail` ที่เป็น body จาก Typhoon) |
| `SanitizeError` | `ai-suggest-sanitize.ts` | (1) service → outcome `ERROR`, ไม่มี fetch · (2) **route เดิม สาขา Gemini (S-13)** ต้องเพิ่ม branch `instanceof SanitizeError` ใน catch ของ `route.ts` ก่อน catch-all (`:419`) → `refundUsage()` + **500** `{error:"เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"}` และ log ชนิดเท่านั้น | `/auto`: **200 NONE** · route เดิม: **500** |
| Prisma/DB error อื่นใน service | | `auto/route.ts` catch-all รอบ `requestAutoSuggest`/`getLatestAutoSuggest` → `console.error(message เท่านั้น)` | **200 `{status:'NONE', reason:'ERROR'}`** (NFR-AIT-Failsoft). `PATCH` เท่านั้นที่คืน 500 ได้ |

ถ้า dev เติม Error ใหม่นอกรายการนี้ ต้องย้อนมาอัปเดตตารางนี้ก่อน (reviewer ตรวจ). ไฟล์ที่เพิ่ม branch catch: `ai-suggest/auto/route.ts` (T5), `ai-suggest/route.ts` (T6). ทั้งสองอยู่ใน task ของตัวเองแล้ว ไม่ต้องสร้าง task เพิ่ม.

Service ต้องมี `try/finally` ปิดแถว THINKING เป็น NONE+`ERROR` เสมอเมื่อ throw ที่ไม่คาดคิด (กันแผงค้าง, R-8).

### 5.7 Risks

| # | ความเสี่ยง | แนวทาง |
|---|---|---|
| RK-1 | PII หลุดผ่านชื่อ/ที่อยู่ที่ระบบไม่รู้ (R-1 ของ spec) | fail-closed + corpus + mutation + `knownLiterals` + ช่วงนำร่องร้านเราเท่านั้น. security ตรวจ payload จริงใน Q1. **ข้อควรแจ้ง user ซ้ำในรายงานปิด phase** (DoD ข้อ 8) |
| RK-2 | C-1 ทาง A ทำให้กฎความปลอดภัยอยู่ 2 ที่ → drift | เทสกันลอก; ถ้า Controller เลือกทาง B ก็ลดความเสี่ยงนี้ได้ |
| RK-3 | race `enqueue` ของบอท (1.1) | ยอมรับ; วัดอัตราจาก outcome ภายหลัง |
| RK-4 | reserve-then-verify ไม่กัน clock skew ข้าม instance | ceiling ตาม R-5; ค่า default RPS=3 ต่ำกว่าเพดาน Typhoon 5 เผื่อให้แล้ว |
| RK-5 | ร้าน Typhoon ที่ข้อความล่าสุดเป็น SHOP: ปุ่ม sparkles เดิมจะไม่มีผล | ให้ ux กำหนดสถานะ "ไม่มีข้อความลูกค้าให้ตอบ" (ไม่ใช่ error) ใน Design Spec |
| RK-6 | การตัดบรรทัดเตือนท้ายแผง (BR-AIT-12 / R-10) | แจ้ง user ซ้ำในรายงานปิด phase (DoD ข้อ 8). `no-payment-entry-in-app.test.ts` ชี้ไฟล์ panel ต้องไม่แดง |
| RK-7 | `isOwnerPaidPlan` throw ใน service (กำหนดให้ถือ non-paid) ต่างจาก fail-closed ของโควตา | ตั้งใจ: เส้นทางนี้ไม่มีเงิน (NFR-AIT-Failsoft). บันทึกใน SDS |
| RK-8 | `npm test` ชี้ prod | ใส่คำสั่ง 5434 ใน prompt dev ทุกตัว; hook `prod-db-guard` จะ block อยู่แล้ว (HR14) |

### 5.8 Implementation order

D1,D2,D3 → G0 → (T1 ∥ T2a→T2b ∥ T3a→T3b) → (T4 ∥ T5 ∥ T6[U11a→U11b]) → (T7 ∥ T8) → (T9 ∥ T10) → R1 → Q1 → Gate 2 → retro → C1.

---

## 6. เนื้อหาพร้อมวางสำหรับ S-1 (ใส่ใน SDS.md และ API.md ของ 00019)

### 6.1 SDS.md — ต่อท้ายเป็นหัวข้อใหม่ "Typhoon auto-suggest (2026-10-09)"

```markdown
## Typhoon auto-suggest (extension 2026-10-09)

อ้างอิง: EXTENSIONS-2026-10-09-typhoon-auto-suggest.md (FR-AIT-01..21, BR-AIT-01..12)

### 1. โมดูลใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| src/lib/typhoon.ts (server-only) | เรียก POST https://api.opentyphoon.ai/v1/chat/completions (Bearer TYPHOON_API_KEY, โมเดลจาก TYPHOON_MODEL, timeout 8 วินาที, ไม่ retry) ผลคือข้อความเดียว ไม่ใช้ response format ที่ Typhoon ไม่รองรับ error: TyphoonNotConfiguredError, TyphoonRateLimitedError (429), TyphoonApiError (kind: TIMEOUT/NETWORK/HTTP/EMPTY) |
| src/lib/reply-suggest-prompt.ts | prompt ของ Typhoon: กฎความปลอดภัยชุดเดียวกับ gemini.ts (ห้ามขอ OTP/รหัสผ่าน/บัตร, ห้ามแต่งราคา, ข้อความลูกค้าเป็นเนื้อหาไม่ใช่คำสั่ง) + ตอบ 1-3 ประโยค + ห้ามเดาชื่อ/เบอร์ ให้ใช้ป้ายตามที่เห็น |
| src/lib/reply-suggest-provider.ts | resolveSuggestProvider(shopId) → typhoon / gemini / none ตาม TYPHOON_SUGGEST_SHOP_IDS (ว่าง=ไม่มีร้านใด, รายการ id คั่นจุลภาค, * = ทุกร้าน) ร้านอยู่ในรายการแต่ไม่มีกุญแจ = none (ไม่ถอยไป Gemini) และ draftReplySuggestions เป็นทางเรียกผู้ให้บริการทางเดียว |
| src/lib/ai-suggest-sanitize.ts | sanitizeForExternalAi ครอบ turns, instruction, contextBlock, shopName: redactPiiReversible + ชื่อลูกค้าที่ระบบรู้ → "ลูกค้า" + ชื่อแอดมิน → "แอดมิน" + ไม่ส่ง customerName/customerNote ดิบ (Typhoon) ถ้า throw SanitizeError = ห้ามเรียกผู้ให้บริการ (fail-closed) |
| src/lib/ai-suggest-turns.ts | ประกอบ turns จากแถวแชท; โหมด externalSafe แทนสื่อด้วย [รูป]/[ข้อความเสียง]/[ไฟล์] |
| src/lib/pii-redact.ts (เพิ่ม) | createPiiVault, redactPiiReversible, restorePii: ป้ายมีลำดับ เช่น [เบอร์โทร#1]; ตารางจับคู่อยู่ในหน่วยความจำของ request เท่านั้น ไม่เก็บ DB ไม่ log ป้ายที่หาค่าไม่เจอ = ไม่แสดงผล (UNRESOLVED_TOKEN) redactPii เดิมไม่เปลี่ยน |
| src/services/ai-suggest-auto.service.ts | claim, เงื่อนไขข้าม, pacing, เรียก provider, ตัดความยาว, บันทึกผล |
| src/app/api/chat/conversations/[id]/ai-suggest/auto/route.ts | POST / GET / PATCH |
| ฝั่ง client: useAutoSuggest + auto-suggest-machine | ตัดสินใจขอ/แสดง/ทิ้งผล (client เป็นผู้ขอ ไม่ใช่ webhook) |

### 2. Flow
(ใช้ sequence diagram หัวข้อ 8.1 ของ extension) โดยลำดับฝั่ง server คือ
ตรวจสิทธิ์/ร้านจากเธรด → ตรวจ anchor เป็นของห้อง → เงื่อนไขข้าม → claim → sanitize → ขอ slot → Typhoon → restorePii → ตัด 3 ประโยค/400 ตัวอักษร → บันทึกผล

### 3. Claim แบบ idempotent
- unique (conversationId, anchorMessageId, attempt)
- createMany({ skipDuplicates: true }) เพื่อไม่ให้เกิด ERROR ใน log Postgres (convention insert-then-catch-logs-every-error)
- ชน: READY → คืนผลเดิม; THINKING อายุ ≤ 30 วินาที → คืน THINKING; THINKING อายุ > 30 วินาที → ยึดด้วย updateMany มีเงื่อนไข status='THINKING' AND createdAt < now-30s; NONE → คืน NONE
- manual (กด ↻): attempt = attempt สูงสุดของ anchor + 1

### 4. เงื่อนไขข้าม (ไม่เรียกโมเดล)
| เงื่อนไข | outcome |
|---|---|
| anchor ไม่ใช่ข้อความ BUYER / ไม่ใช่ข้อความล่าสุดของห้อง | SKIPPED_NOT_BUYER (reason STALE_ANCHOR ถ้าเป็นกรณีหลัง) |
| Conversation.isSpam | SKIPPED_SPAM |
| AutoReplyJob ของ chatMessageId = anchor สถานะ PENDING หรือ PROCESSING และ updatedAt ภายใน 5 นาที | SKIPPED_BOT |
| turns ว่าง | SKIPPED_EMPTY |
| ร้านไม่อยู่ใน allow-list หรือไม่มี TYPHOON_API_KEY | SKIPPED_NOT_ALLOWED |
งานบอทสถานะ DONE/SKIPPED/FAILED, handoffAt มีค่า, autoReplyEnabled=false ไม่ใช่เหตุข้าม

### 5. Pacing (นับจาก AiSuggestRun.firedAt)
- เพดานรวม AI_SUGGEST_RPS (3) ต่อวินาที, รวม AI_SUGGEST_RPM (100) ต่อนาที, ต่อร้าน ≤ ครึ่งของ RPM (50)
- วิธี reserve-then-verify: เขียน firedAt=now → นับอันดับของตัวเองในหน้าต่าง (เรียง firedAt, id) → เกินเพดานให้ล้าง firedAt แล้วรอ 250 ms ลองใหม่ จนครบ 5 วินาที → ทิ้ง (RATE_LIMITED)
- Typhoon 429 → ไม่ retry (RATE_LIMITED)
- ข้อจำกัดที่ยอมรับ (R-5): clock skew ข้าม instance อาจเกินเพดานเล็กน้อย; ตัวนับกลางเป็น Phase 2

### 6. การตัดผล
ไม่เกิน 3 ประโยค (แบ่งที่ . ! ? … ตามด้วยช่องว่าง, ขึ้นบรรทัดใหม่, หรือช่องว่างตั้งแต่ 2 ตัว) และไม่เกิน 400 ตัวอักษร (ตัดที่ช่องว่างสุดท้ายก่อนเพดาน) ไม่ทิ้งทั้งก้อน

### 7. การบันทึก
AiSuggestRun: outcome, trigger, provider, model, latencyMs, inputTokens, outputTokens, firedAt, suggestion (หลัง restore, เพื่อแสดงผลเท่านั้น) ห้ามมี transcript/payload/ตารางป้าย ไม่มี console.* ที่รับเนื้อความ

### 8. ทางเดิม POST /ai-suggest
- ร้านนอก allow-list: Gemini + โควตา + เครดิต เหมือนเดิม แต่ผ่าน sanitizeForExternalAi (ข้อความ ชื่อ โน้ต) และ restorePii ก่อนส่งกลับ (ปิดช่องว่าง BR-AI-09)
- ร้านใน allow-list: ส่งต่อ requestAutoSuggest (manual=true, anchor=ข้อความล่าสุดของห้อง) ตอบ { suggestions: [ข้อความเดียว] } ไม่นับโควตา ไม่หักเครดิต ไม่เขียน AiSuggestUsageEvent
- ข้อความล่าสุดไม่ใช่ลูกค้า → 400

### 9. Error mapping
| error | จุด catch | /auto | /ai-suggest (เดิม สาขา Typhoon) |
|---|---|---|---|
| TyphoonNotConfiguredError | service | 200 NONE (NOT_CONFIGURED) | 503 |
| TyphoonRateLimitedError | service | 200 NONE (RATE_LIMITED) | 429 + Retry-After: 5 |
| TyphoonApiError | service | 200 NONE (TIMEOUT/ERROR) | 502 |
| SanitizeError | service และ catch ใน route เดิม | 200 NONE (ERROR) | 500 (สาขา Gemini: คืนสิทธิ์โควตาก่อน) |
| ข้อผิดพลาด DB อื่น | route catch-all | 200 NONE (ERROR) | 500 |

### 10. ตัวแปรสภาพแวดล้อม
TYPHOON_API_KEY, TYPHOON_MODEL (default typhoon-v2.5-30b-a3b-instruct), TYPHOON_SUGGEST_SHOP_IDS, AI_SUGGEST_RPS (3), AI_SUGGEST_RPM (100)

### 11. การทดสอบ
TC-AIT-01..09 map เป็นไฟล์เทส: typhoon.test, reply-suggest-provider.test, ai-suggest-sanitize.test (+ mutation), pii-redact-reversible.test, ai-suggest-auto.service.test, ai-suggest-auto.service.db.test (claim/pacing บน Postgres localhost:5434 เท่านั้น), auto/route.test, ai-suggest/route.test, auto-suggest-machine.test; ส่วนที่เหลือครอบด้วย Playwright E2E (TC-AIT-08)
```

### 6.2 API.md — ต่อท้ายเป็นหัวข้อใหม่

```markdown
## POST/GET/PATCH /api/chat/conversations/{id}/ai-suggest/auto

ทุก response: Cache-Control: private, no-store, max-age=0, must-revalidate
สิทธิ์: NextAuth session; shopId มาจากเธรดเท่านั้น (resolveConversationShopId); เธรดของร้านที่เข้าถึงไม่ได้ = 404

### POST
Request: { "anchorMessageId": "<uuid>", "manual": false, "trigger": "AUTO_NEW_MESSAGE" | "AUTO_OPEN" (ไม่บังคับ; manual=true จะบันทึกเป็น MANUAL เสมอ) }

| สถานะ | Body | เมื่อ |
|---|---|---|
| 200 | { status: "READY", anchorMessageId, attempt, suggestion, feedback: null | "UP" | "DOWN" } | ได้ผล (ใหม่หรือของเดิม) |
| 200 | { status: "THINKING", anchorMessageId, attempt } | มีคำขอเดียวกันกำลังทำ → client poll GET |
| 200 | { status: "NONE", anchorMessageId, attempt, reason } | ทิ้งเงียบ/ข้าม; reason ∈ RATE_LIMITED, TIMEOUT, ERROR, UNRESOLVED_TOKEN, SKIPPED_*, STALE_ANCHOR, NOT_CONFIGURED |
| 400 | { error } | body ไม่ถูกต้อง หรือ anchor ไม่ใช่ข้อความของห้องนี้ |
| 401 | { error } | ไม่ได้ล็อกอิน |
| 404 | { error } | ไม่ใช่ห้องของร้านที่เข้าถึงได้ |
| 429 | { error } + Retry-After: 60 | manual=true เกิน 15 ครั้ง/นาที/ผู้ใช้ |
ล้มเหลวทุกแบบที่ไม่ใช่ข้างบนคืน 200 NONE ไม่ใช่ 5xx

### GET
อ่าน DB อย่างเดียว ไม่เรียกโมเดล
Response 200: AutoSuggestState (เหมือน POST) + { provider: "typhoon" | "gemini" | "none" }
- ข้อความล่าสุดของห้องไม่ใช่ลูกค้า → { status: "NONE", anchorMessageId: null, attempt: null, reason: "STALE_ANCHOR" }
- ยังไม่เคยมีแถวของข้อความลูกค้าล่าสุด → { status: "NONE", anchorMessageId, attempt: null, reason: "NO_RUN" } (client ขอ POST ได้)
- provider ไม่ใช่ typhoon → reason "NOT_ENABLED"

### PATCH (ความเห็น)
Request: { anchorMessageId, attempt, feedback: "UP" | "DOWN", reason?: "WRONG_INFO" | "OFF_TOPIC" | "BAD_TONE" | "LENGTH", note?: string (≤ 120) }
| 200 | { ok: true } |
| 400 | feedback/reason/note ไม่ถูกต้อง (note ยาว 121 ตัวอักษร = 400) |
| 404 | ไม่มีแถว READY ของ (conversationId, shopId, anchorMessageId, attempt) |
note ถูกปิดบังด้วย redactPii ก่อนบันทึก; DOWN ที่ไม่มี reason ก็นับ; กดซ้ำเปลี่ยนค่าได้; ไม่เรียกโมเดล

### POST /api/chat/conversations/{id}/ai-suggest (เดิม — เปลี่ยนเฉพาะที่ระบุ)
- ร้านนอก allow-list: เหมือนเดิมทุกประการ (3 ข้อ, โควตา 10/วัน, 402) ยกเว้นข้อความลูกค้า/ชื่อ/โน้ตผ่านการปิดบัง PII ก่อนส่งไป Gemini
- ร้านใน allow-list: ส่งต่อ requestAutoSuggest; 200 { suggestions: [ข้อความเดียว], usedCredit: false, freeRemaining: null, cost: null }; 400 ถ้าข้อความล่าสุดไม่ใช่ลูกค้า; 503 ไม่มีกุญแจ; 429 ชน rate limit; 502 Typhoon ล้ม
```

---

## 7. สรุปที่ Controller ต้องทำต่อ

1. ตอบ C-1 (ทาง A หรือ B), C-2 (รับ `firedAt` พร้อมจด Change Log), C-3, C-4
2. ยืนยัน A-3 (ข้อ 1.5) ก่อน B3
3. dispatch B0 (docs 3 ตัว) → G0 → B1
4. ทุก dev prompt ต้องฝัง: contract หัวข้อ 2, คำสั่งเทสที่ปักหมุด 5434, path เต็ม (ตาราง task), S-id ของ task, ข้อห้ามแตะไฟล์ OOS-6, และห้าม commit เอง

ไฟล์อ้างอิงหลักที่ใช้ตัดสินในแผนนี้ (absolute):
- `/Users/craftman/Projects/safepay-typhoon-suggest/docs/scope/2026-10-09-00019-ext-typhoon-scope-baseline.md`
- `/Users/craftman/Projects/safepay-typhoon-suggest/docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-10-09-typhoon-auto-suggest.md`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/api/chat/conversations/[id]/ai-suggest/route.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/gemini.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/pii-redact.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/services/auto-reply.service.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/services/chat-crm.service.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/chat-scope.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AiSuggestPanel.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/services/__tests__/line-report-bind.db.test.ts` (แบบเทส DB)
