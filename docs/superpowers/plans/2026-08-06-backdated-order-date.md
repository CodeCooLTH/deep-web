# Backdated Order Date (00033) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ขายระบุวันที่-เวลาของคำสั่งซื้อเองได้ (ย้อน 90 วัน / ล่วงหน้า 7 วัน) ทุกหน้าที่สร้างหรือแก้ออเดอร์ และปุ่มสร้างออเดอร์จากข้อความในแชทเติมเวลาของข้อความนั้นให้อัตโนมัติ

**Architecture:** ทับ `Order.createdAt` โดยตรง (ไม่เพิ่มคอลัมน์ใหม่) — เลขออเดอร์ ลำดับรายการ และยอดขายจึงเคลื่อนตามพร้อมกันทั้งชุด. เพดานเวลาอยู่ในโมดูล pure ตัวเดียว (`src/lib/order-date-window.ts`) ที่ทั้ง client และ server เรียก. ประวัติกิจกรรม (`OrderEvent`) แยกขาด — `occurredAt` = เวลาจริงที่กดเสมอ ส่วนวันที่สั่งซื้ออยู่ใน `meta.orderedAt`

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Prisma + PostgreSQL 16 · Valibot (backend) + Yup/react-hook-form (frontend) · Paces (Preline 4 + Tailwind 4) · Vitest

**Spec:** `docs/superpowers/specs/2026-08-06-backdated-order-date-design.md`
**Mockup:** `docs/superpowers/specs/2026-08-06-backdated-order-date-mockup.html`

## Global Constraints

ทุก task อยู่ใต้ข้อกำหนดเหล่านี้โดยปริยาย:

- **เพดานเวลา:** ย้อน `90` วัน / ล่วงหน้า `7` วัน — ค่าคงที่อยู่ที่ `src/lib/order-date-window.ts` **ที่เดียว** ห้าม hardcode ซ้ำที่อื่น
- **`occurredAt` ของทุก `OrderEvent` = เวลาจริงที่กด (`now`) เสมอ** ห้ามย้อนตามวันที่ที่ผู้ใช้กรอก (มติ user 2026-08-06)
- **Hard Rule 1/3:** UI ทุกชิ้น copy จาก theme file — commit ที่แตะ UI ต้องมีบรรทัด `Base:` ชี้ไฟล์ต้นทาง
- **Hard Rule 7:** หน้า `(paces)/**` ห้าม arbitrary Tailwind value (`text-[NNpx]`, `bg-[rgba()]`, hex) — ใช้ `.form-input` `.form-label` `btn` `badge` `text-default-*`
- **Hard Rule 8:** งาน frontend ทุกชิ้นต้องผ่าน `safepay-ux` Design Spec **ก่อน** เขียนโค้ด
- **Hard Rule 9:** toast ใน `(paces)` ใช้ `pacesToast` เท่านั้น
- **Hard Rule 11:** เอกสาร feature ต้องเสร็จก่อนโค้ด (Task 1)
- **Hard Rule 12:** ห้าม emoji ใน UI — ไอคอนใช้ `@iconify/react` ชื่อ tabler
- **Hard Rule 13:** ไฟล์เทสห้ามมีคำสั่งลบข้อมูลแบบไม่ scope — ใช้ `deleteTestData({ userIds, shopIds })` จาก `tests/setup.ts` เท่านั้น
- **Hard Rule 14:** คำสั่ง Prisma ที่ล้าง/สร้าง schema ได้ ต้องปักหมุด URL localhost ในคำสั่งตรง ๆ
- **Hard Rule 15:** `vercel.json` รัน `prisma migrate deploy` ตอน build — push `main` = migrate ขึ้น prod **ต้องแจ้ง user ก่อนเสมอ**; ฐาน local ต้อง apply เอง
- **สี:** primary ของ `(paces)` = น้ำเงิน `#236dc9` (ม่วง `#7367F0` = buyer/Vuexy เท่านั้น)
- **วันที่:** แสดงผลด้วยฟังก์ชันจาก `src/lib/format-date.ts` เท่านั้น ห้าม `toLocaleDateString`/`Intl.DateTimeFormat` เอง
- **ภาษา:** commit body / code comment / เอกสาร เป็นภาษาไทย
- **รันเทส:** `npm test -- <path>` (= `dotenv -e .env -- npx vitest`)
- **type-check:** `node node_modules/typescript/lib/tsc.js --noEmit`

---

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| **สร้าง** `src/lib/order-date-window.ts` | SSOT ของเพดาน 90/7 วัน — pure ไม่มี import | 2 |
| **สร้าง** `src/lib/__tests__/order-date-window.test.ts` | เทสเพดาน | 2 |
| **แก้** `src/lib/format-date.ts` | เพิ่ม `thaiDayKey()` + `formatOrderDateLabel()` | 3 |
| **สร้าง** `src/lib/__tests__/thai-day-key.test.ts` | เทสการตัดวันตามเวลาไทย | 3 |
| **แก้** `src/lib/validations.ts` | ย้าย `IsoDateTimeWithOffset` ขึ้นบน + เพิ่มคีย์ `createdAt` | 4 |
| **แก้** `src/lib/order-event.ts` | เพิ่ม `ORDER_DATE_CHANGED` + `meta.orderedAt` + บรรทัดรอง | 5 |
| **สร้าง** `prisma/migrations/20260806120000_order_event_date_changed/migration.sql` | ขยาย CHECK constraint | 5 |
| **แก้** `src/services/order.service.ts` | `createOrder` + `updateOrderContent` รับ `createdAt`; `keyedInAt` | 6, 7 |
| **แก้** `src/app/api/orders/route.ts` | catch error ใหม่ → 400 | 8 |
| **แก้** `src/app/api/orders/[token]/route.ts` | catch error ใหม่ → 400 | 8 |
| **สร้าง** `src/app/(paces)/seller/(dashboard)/orders/new/components/OrderDateRow.tsx` | แถววันที่สั่งซื้อ (ยุบ/ขยาย) | 9 |
| **แก้** `.../orders/new/components/OrderCreateForm.tsx` | field ใหม่ + submit + toast | 9 |
| **แก้** `.../orders/new/components/QuickSummaryPanel.tsx` | วางแถวใน layout มือถือ | 9 |
| **แก้** `src/app/(paces)/seller/(chat)/_components/DraftOrderProvider.tsx` | ส่งเวลาข้อความผ่าน draft | 10 |
| **แก้** `.../(chat)/inbox/[conversationId]/components/ChatThread.tsx` | ส่ง `m.createdAt` ทั้ง 2 ทางเข้า | 10 |
| **แก้** `src/lib/date-range.ts` | export `thaiMidnightUtc` | 11 |
| **แก้** `src/app/(paces)/seller/(dashboard)/sales/page.tsx` | เลิกตัดวันด้วย UTC | 11 |
| **แก้** `src/app/(paces)/seller/(dashboard)/orders/page.tsx` | เลิกตัดวันด้วย UTC | 11 |

---

### Task 1: เอกสาร feature 00033 (Hard Rule 11 — ต้องเสร็จก่อนโค้ด)

**Files:**
- Create: `docs/20 - Features/00033 - Backdated Order Date/` — ทุกไฟล์ตาม template

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-06-backdated-order-date-design.md` (เนื้อหาทั้งหมดมาจากที่นี่)
- Produces: PRD + BRD ที่ user อนุมัติแล้ว — เป็นเงื่อนไขเปิด Task 2

- [ ] **Step 1: ดูรายชื่อไฟล์ที่ template บังคับ**

```bash
ls "docs/99 - Rules/Feature-Templates/"
```

- [ ] **Step 2: เขียนเอกสารครบทุกไฟล์**

เจ้าของแต่ละไฟล์ตาม `docs/99 - Rules/Feature-Docs-Ownership.md` — PRD/BRD = `safepay-product`, SRS/SDS/API = `safepay-planner`, DATABASE = `safepay-database`, Tests = `safepay-qa`; Controller เป็นคน Write + commit

diagram ทุกชนิดเป็น **Mermaid เท่านั้น** ห้าม ASCII/รูปภาพ

- [ ] **Step 3: ตรวจความครบด้วยชื่อไฟล์ ไม่ใช่จำนวนไฟล์**

```bash
diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/00033 - Backdated Order Date/")
```

Expected: ไม่มีบรรทัดขึ้นต้นด้วย `<` (ไม่มีไฟล์ของ template ที่ขาด)
บทเรียน 00028: การเพิ่มไฟล์นอก template กลบการหายไปของไฟล์ใน template ได้พอดีตัว จน "7/7" ถูกอ่านว่าครบทั้งที่เป็นคนละ 7 ไฟล์

- [ ] **Step 4: Commit**

```bash
git add "docs/20 - Features/00033 - Backdated Order Date/"
git commit -m "docs(00033): PRD/BRD/SRS/SDS/DATABASE/API/TestCase — วันที่คำสั่งซื้อย้อนหลัง"
```

- [ ] **Step 5: 🛑 หยุดรอ user review PRD + BRD**

ห้ามเริ่ม Task 2 จนกว่า user จะอนุมัติ — doc-first ไม่ใช่ gate ที่ downgrade ได้ด้วยความเร่งรีบ

---

### Task 2: `order-date-window.ts` — SSOT ของเพดานเวลา

**Files:**
- Create: `src/lib/order-date-window.ts`
- Test: `src/lib/__tests__/order-date-window.test.ts`

**Interfaces:**
- Consumes: ไม่มี (pure module ไม่มี import)
- Produces:
  - `ORDER_BACKDATE_DAYS: 90` · `ORDER_FUTUREDATE_DAYS: 7`
  - `orderDateWindow(nowMs: number): { minMs: number; maxMs: number }`
  - `isOrderDateInWindow(valueMs: number, nowMs: number): boolean`
  - `orderDateRejectReason(valueMs: number, nowMs: number): string | null`
  - `ORDER_DATE_OUT_OF_WINDOW_MESSAGE: string`

- [ ] **Step 1: เขียนเทสที่ยังแดง**

```ts
// src/lib/__tests__/order-date-window.test.ts
import { describe, it, expect } from 'vitest'
import {
  ORDER_BACKDATE_DAYS,
  ORDER_FUTUREDATE_DAYS,
  orderDateWindow,
  isOrderDateInWindow,
  orderDateRejectReason,
} from '../order-date-window'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 6, 2, 12, 0) // 6 ส.ค. 2026 09:12 น. เวลาไทย

describe('orderDateWindow', () => {
  it('ขอบล่าง = now − 90 วัน, ขอบบน = now + 7 วัน', () => {
    const w = orderDateWindow(NOW)
    expect(w.minMs).toBe(NOW - ORDER_BACKDATE_DAYS * DAY)
    expect(w.maxMs).toBe(NOW + ORDER_FUTUREDATE_DAYS * DAY)
  })
})

describe('isOrderDateInWindow', () => {
  it('ตอนนี้ = ผ่าน', () => {
    expect(isOrderDateInWindow(NOW, NOW)).toBe(true)
  })

  it('เมื่อคืน 21:14 = ผ่าน (เคสหลักของฟีเจอร์นี้)', () => {
    expect(isOrderDateInWindow(NOW - 12 * 60 * 60 * 1000, NOW)).toBe(true)
  })

  it('ขอบพอดีทั้งสองด้าน = ผ่าน (inclusive)', () => {
    expect(isOrderDateInWindow(NOW - 90 * DAY, NOW)).toBe(true)
    expect(isOrderDateInWindow(NOW + 7 * DAY, NOW)).toBe(true)
  })

  it('เกินขอบ 1 วินาที = ตก', () => {
    expect(isOrderDateInWindow(NOW - 90 * DAY - 1000, NOW)).toBe(false)
    expect(isOrderDateInWindow(NOW + 7 * DAY + 1000, NOW)).toBe(false)
  })

  it('NaN = ตก (fail-closed)', () => {
    expect(isOrderDateInWindow(NaN, NOW)).toBe(false)
  })

  it('Infinity = ตก', () => {
    expect(isOrderDateInWindow(Infinity, NOW)).toBe(false)
    expect(isOrderDateInWindow(-Infinity, NOW)).toBe(false)
  })
})

describe('orderDateRejectReason', () => {
  it('ค่าที่ใช้ได้ → null', () => {
    expect(orderDateRejectReason(NOW, NOW)).toBeNull()
  })

  it('ค่าที่ใช้ไม่ได้ → ข้อความไทยที่บอกทั้งสองขอบ', () => {
    const reason = orderDateRejectReason(NOW - 100 * DAY, NOW)
    expect(reason).toContain('90')
    expect(reason).toContain('7')
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
npm test -- src/lib/__tests__/order-date-window.test.ts --run
```

Expected: FAIL — `Failed to resolve import "../order-date-window"`

- [ ] **Step 3: เขียน implementation ให้น้อยที่สุดที่ทำให้ผ่าน**

```ts
// src/lib/order-date-window.ts
/**
 * order-date-window — SSOT ของ "วันที่คำสั่งซื้อย้อนหลัง/ล่วงหน้าได้แค่ไหน" (feature 00033)
 *
 * pure module (ไม่มี import) → เรียกได้ทั้ง client component, RSC และ service layer
 *
 * ทำไมต้องเป็นไฟล์เดียว: กฎเดียวกันมีผู้ใช้ 3 ฝั่ง (bound ของ input, ข้อความ error ใต้ช่อง,
 * และด่าน fail-closed ที่ service) — บทเรียนตรงจาก shipping-address-status.ts ที่กฎ
 * "ที่อยู่ครบพอบันทึกไหม" เคยเขียนซ้ำ 3 ที่แล้วนิยามไม่ตรงกัน จนปุ่มขึ้น "เลือกแล้ว"
 * ทั้งที่ยังบันทึกไม่ผ่าน
 *
 * รับ nowMs เป็นพารามิเตอร์เสมอ ไม่เรียก Date.now() ข้างใน — เทสได้โดยไม่ต้อง mock เวลา
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** ย้อนหลังได้ไกลสุดกี่วัน (user 2026-08-06) */
export const ORDER_BACKDATE_DAYS = 90
/** ล่วงหน้าได้ไกลสุดกี่วัน */
export const ORDER_FUTUREDATE_DAYS = 7

export const ORDER_DATE_OUT_OF_WINDOW_MESSAGE =
  `วันที่คำสั่งซื้อต้องอยู่ระหว่าง ${ORDER_BACKDATE_DAYS} วันย้อนหลังถึง ${ORDER_FUTUREDATE_DAYS} วันล่วงหน้า`

export type OrderDateWindow = { minMs: number; maxMs: number }

/** ช่วงที่ยอมรับ ณ เวลา nowMs — ขอบทั้งสองด้านนับรวม (inclusive) */
export function orderDateWindow(nowMs: number): OrderDateWindow {
  return {
    minMs: nowMs - ORDER_BACKDATE_DAYS * DAY_MS,
    maxMs: nowMs + ORDER_FUTUREDATE_DAYS * DAY_MS,
  }
}

/**
 * ค่านี้ใช้ได้ไหม — fail-closed: NaN/Infinity/ค่าที่ไม่ใช่ตัวเลขจำกัด ตกทั้งหมด
 * (Number.isFinite ตัดทั้ง NaN และ ±Infinity ในเช็คเดียว)
 */
export function isOrderDateInWindow(valueMs: number, nowMs: number): boolean {
  if (!Number.isFinite(valueMs)) return false
  const { minMs, maxMs } = orderDateWindow(nowMs)
  return valueMs >= minMs && valueMs <= maxMs
}

/** ข้อความไทยบอกว่าทำไมค่านี้ใช้ไม่ได้ — null = ใช้ได้ */
export function orderDateRejectReason(valueMs: number, nowMs: number): string | null {
  return isOrderDateInWindow(valueMs, nowMs) ? null : ORDER_DATE_OUT_OF_WINDOW_MESSAGE
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
npm test -- src/lib/__tests__/order-date-window.test.ts --run
```

Expected: PASS ทั้ง 9 เคส

- [ ] **Step 5: Commit**

```bash
git add src/lib/order-date-window.ts src/lib/__tests__/order-date-window.test.ts
git commit -m "feat(00033): order-date-window — SSOT ของเพดานวันที่คำสั่งซื้อ 90/7 วัน"
```

---

### Task 3: `thaiDayKey` + `formatOrderDateLabel` ใน format-date.ts

**Files:**
- Modify: `src/lib/format-date.ts` (เพิ่มท้ายไฟล์ — ใช้ helper `toValidDate`/`partsInBangkok` ที่มีอยู่แล้วในไฟล์)
- Test: `src/lib/__tests__/thai-day-key.test.ts`

**Interfaces:**
- Consumes: `partsInBangkok`, `toValidDate` (private ในไฟล์เดียวกัน — ไม่ต้อง export)
- Produces:
  - `thaiDayKey(input): string` → `"2026-08-06"` (ค.ศ. — เป็น **key ไม่ใช่ค่าแสดงผล**)
  - `formatOrderDateLabel(input, nowInput): string` → `"วันนี้ 09:12 น."` / `"เมื่อวาน 21:14 น."` / `"5 ส.ค. 2569 21:14 น."`

- [ ] **Step 1: เขียนเทสที่ยังแดง**

```ts
// src/lib/__tests__/thai-day-key.test.ts
import { describe, it, expect } from 'vitest'
import { thaiDayKey, formatOrderDateLabel } from '../format-date'

describe('thaiDayKey', () => {
  it('เที่ยงวันไทย → วันนั้น', () => {
    // 2026-08-06 12:00 ICT = 2026-08-06T05:00:00Z
    expect(thaiDayKey('2026-08-06T05:00:00Z')).toBe('2026-08-06')
  })

  it('00:30 น. เวลาไทย ยังเป็นวันเดียวกัน ไม่ถอยไปวันก่อน', () => {
    // 2026-08-06 00:30 ICT = 2026-08-05T17:30:00Z — เคสที่ toISOString().slice(0,10) เคยพัง
    expect(thaiDayKey('2026-08-05T17:30:00Z')).toBe('2026-08-06')
  })

  it('23:30 น. เวลาไทย ยังไม่ข้ามไปวันถัดไป', () => {
    // 2026-08-06 23:30 ICT = 2026-08-06T16:30:00Z
    expect(thaiDayKey('2026-08-06T16:30:00Z')).toBe('2026-08-06')
  })

  it('ค่าไม่ valid → สตริงว่าง', () => {
    expect(thaiDayKey('ไม่ใช่วันที่')).toBe('')
    expect(thaiDayKey(null)).toBe('')
  })
})

describe('formatOrderDateLabel', () => {
  const now = '2026-08-06T05:00:00Z' // 6 ส.ค. 2026 12:00 ICT

  it('วันเดียวกัน → "วันนี้ HH:mm น."', () => {
    expect(formatOrderDateLabel('2026-08-06T02:12:00Z', now)).toBe('วันนี้ 09:12 น.')
  })

  it('วันก่อนหน้า → "เมื่อวาน HH:mm น."', () => {
    // 2026-08-05 21:14 ICT = 2026-08-05T14:14:00Z
    expect(formatOrderDateLabel('2026-08-05T14:14:00Z', now)).toBe('เมื่อวาน 21:14 น.')
  })

  it('เก่ากว่านั้น → วันที่เต็มเป็น พ.ศ.', () => {
    // 2026-07-28 21:14 ICT = 2026-07-28T14:14:00Z
    expect(formatOrderDateLabel('2026-07-28T14:14:00Z', now)).toBe('28 ก.ค. 2569 21:14 น.')
  })

  it('วันในอนาคต → วันที่เต็ม ไม่ใช่ "วันนี้"', () => {
    // 2026-08-10 10:00 ICT
    expect(formatOrderDateLabel('2026-08-10T03:00:00Z', now)).toBe('10 ส.ค. 2569 10:00 น.')
  })
})
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

```bash
npm test -- src/lib/__tests__/thai-day-key.test.ts --run
```

Expected: FAIL — `thaiDayKey is not a function`

- [ ] **Step 3: เพิ่มฟังก์ชันท้าย `src/lib/format-date.ts`**

```ts
/**
 * "2026-08-06" — คีย์ของ "วัน" ตามปฏิทินไทย (ค.ศ. ไม่ใช่ พ.ศ.)
 *
 * [สำคัญ] นี่คือ **คีย์สำหรับจัดกลุ่ม/เทียบ ไม่ใช่ค่าแสดงผล** — ห้ามเอาไปโชว์ผู้ใช้
 * (ผู้ใช้เห็นปีต้องเป็น พ.ศ. เสมอ ใช้ formatDateTH/formatDateTimeTH แทน)
 *
 * ทำไมต้องมี: โค้ดหลายที่เคยตัดวันด้วย `toISOString().slice(0,10)` ซึ่งเป็นวัน **UTC**
 * ออเดอร์เวลา 00:00–07:00 น. ไทย จึงตกไปนับเป็นของวันก่อนหน้า — เพี้ยนเงียบ ๆ และเพี้ยน
 * ไม่ตรงกับ dashboard/P&L ที่คิดเวลาไทยถูกอยู่แล้ว (feature 00033 §5.3)
 */
export function thaiDayKey(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return ''
  const p = partsInBangkok(d)
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * ป้ายวันที่สั่งซื้อสำหรับแถวสรุปในฟอร์ม (feature 00033)
 *
 * ใช้คำสัมพัทธ์เฉพาะ "วันนี้/เมื่อวาน" — คนอ่านผ่านแล้วรู้ทันทีว่าปกติหรือย้อนหลัง
 * โดยไม่ต้องเทียบวันที่ในหัว. เก่ากว่านั้นหรืออยู่ในอนาคต = วันที่เต็มเป็น พ.ศ.
 * (อนาคตห้ามเป็น "วันนี้" เด็ดขาด — ผู้ขายต้องเห็นว่าตัวเองลงวันล่วงหน้าอยู่)
 */
export function formatOrderDateLabel(
  input: Date | string | number | null | undefined,
  nowInput: Date | string | number = new Date(),
): string {
  const d = toValidDate(input)
  if (!d) return '—'
  const now = toValidDate(nowInput) ?? new Date()

  const key = thaiDayKey(d)
  const todayKey = thaiDayKey(now)
  const yesterdayKey = thaiDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const time = `${formatTimeHM(d)} น.`

  if (key === todayKey) return `วันนี้ ${time}`
  if (key === yesterdayKey) return `เมื่อวาน ${time}`
  return `${formatDateTH(d)} ${time}`
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

```bash
npm test -- src/lib/__tests__/thai-day-key.test.ts --run
```

Expected: PASS ทั้ง 8 เคส
ถ้า `formatDateTH` คืนรูปแบบต่างจาก `"28 ก.ค. 2569"` ให้แก้ **เทส** ให้ตรงของจริง ไม่ใช่แก้ `formatDateTH` (มีผู้ใช้อื่นทั่ว buyer app)

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-date.ts src/lib/__tests__/thai-day-key.test.ts
git commit -m "feat(00033): thaiDayKey + formatOrderDateLabel — ตัดวันตามเวลาไทย ไม่ใช่ UTC"
```

---

### Task 4: Valibot — รับคีย์ `createdAt` เข้า `CreateOrderSchema`

**Files:**
- Modify: `src/lib/validations.ts` (ย้าย `IsoDateTimeWithOffset` จากบรรทัด 1475 ขึ้นไปเหนือ `CreateOrderSchema` บรรทัด 292 · เพิ่มคีย์ใน schema)

**Interfaces:**
- Consumes: `orderDateRejectReason` จาก Task 2
- Produces: `CreateOrderSchema` มีคีย์ `createdAt?: string` (ISO 8601 พร้อม offset) — route ทั้ง POST และ PATCH ใช้ schema เดียวกันนี้อยู่แล้ว

> 🛑 **กับดักที่ต้องแก้ก่อน มิฉะนั้นแอปพังตอน import**
> `IsoDateTimeWithOffset` ประกาศด้วย `const` ที่ **บรรทัด 1475** ซึ่งอยู่ **หลัง** `CreateOrderSchema` (บรรทัด 292)
> `v.object({...})` ประเมินค่าตอนโหลดโมดูล → อ้างถึงตัวแปรที่ยังอยู่ใน temporal dead zone
> จะได้ `ReferenceError: Cannot access 'IsoDateTimeWithOffset' before initialization` **ทันทีที่ import ไฟล์นี้**
> ไม่ใช่ตอนเรียกใช้ — ทั้งแอปล่ม ไม่ใช่แค่ route เดียว
> **ต้องย้ายบล็อก `const IsoDateTimeWithOffset = …` ขึ้นไปไว้เหนือ `CreateOrderSchema` ก่อนเสมอ**
> (schema นัดหมายที่บรรทัด 1546/1566 ยังใช้ได้ปกติเพราะประกาศไว้ก่อนแล้ว)

- [ ] **Step 1: ย้าย `IsoDateTimeWithOffset` ขึ้นไปเหนือ `CreateOrderSchema`**

ตัดบล็อกนี้ออกจากบรรทัด ~1473-1481 แล้ววางไว้เหนือ `export const CreateOrderSchema` (บรรทัด 292) พร้อมคอมเมนต์อธิบายว่าทำไมต้องอยู่ตรงนี้:

```ts
// เวลาส่งเป็น ISO-8601 ที่มี offset เสมอ — การไม่มี offset ทำให้ตีความเวลาเพี้ยนข้ามเขตเวลา
// [สำคัญ] ต้องประกาศ *เหนือ* schema ทุกตัวที่ใช้มัน: const ไม่ hoist และ v.object() ประเมิน
// ตอนโหลดโมดูล — วางไว้ท้ายไฟล์เมื่อไหร่ ทั้งแอปจะล่มด้วย TDZ ReferenceError ตอน import
// ผู้ใช้: CreateOrderSchema.createdAt (00033), OrderAppointmentSchema.start/end (00024)
const IsoDateTimeWithOffset = v.pipe(
  v.string(),
  v.regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "ต้องเป็นเวลารูปแบบ ISO-8601 พร้อมเขตเวลา",
  ),
)
```

- [ ] **Step 2: เพิ่ม import + คีย์ `createdAt` ใน `CreateOrderSchema`**

เพิ่ม import ที่หัวไฟล์:

```ts
import { orderDateRejectReason, ORDER_DATE_OUT_OF_WINDOW_MESSAGE } from "./order-date-window"
```

เพิ่มคีย์นี้ต่อจาก `conversationId` ใน `CreateOrderSchema`:

```ts
  /**
   * feature 00033 — วันที่/เวลาที่ลูกค้าสั่ง (ไม่ใช่เวลาที่คีย์เข้าระบบ)
   *
   * ไม่ส่งมา = เส้นทางเดิมทุกประการ Order.createdAt ได้ @default(now()) เหมือนเดิม
   * ด่านนี้เป็นด่านแรก — service ตรวจซ้ำอีกชั้นเสมอ (client ปลอม body ข้ามด่านนี้ไม่ได้
   * แต่ caller ฝั่ง server ที่เรียก createOrder ตรง ๆ ไม่ผ่าน schema นี้)
   */
  createdAt: v.optional(
    v.pipe(
      IsoDateTimeWithOffset,
      v.check(
        (iso) => orderDateRejectReason(new Date(iso).getTime(), Date.now()) === null,
        ORDER_DATE_OUT_OF_WINDOW_MESSAGE,
      ),
    ),
  ),
```

- [ ] **Step 3: type-check**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: exit code 0 (ตัดสินด้วย exit code เท่านั้น — ห้ามเชื่อข้อความบนจอ)

- [ ] **Step 4: พิสูจน์ว่าไม่มี TDZ ตอน import จริง**

```bash
npx tsx -e "import('./src/lib/validations.ts').then(m => console.log('OK', typeof m.CreateOrderSchema))"
```

Expected: `OK object` — ถ้าได้ `ReferenceError: Cannot access 'IsoDateTimeWithOffset' before initialization` แปลว่า Step 1 ยังย้ายไม่สำเร็จ

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts
git commit -m "feat(00033): CreateOrderSchema รับ createdAt (ISO พร้อม offset) + ย้าย IsoDateTimeWithOffset ขึ้นบนกัน TDZ"
```

---

### Task 5: `ORDER_DATE_CHANGED` — ชนิดเหตุการณ์ใหม่ + migration

**Files:**
- Modify: `src/lib/order-event.ts` (เพิ่มค่าใน `ORDER_EVENT_TYPES`, `ORDER_EVENT_META`, `OrderEventMeta`, `describeOrderEvent`)
- Create: `prisma/migrations/20260806120000_order_event_date_changed/migration.sql`

**Interfaces:**
- Consumes: `formatDateTimeTH` จาก Task 3 ไฟล์เดียวกัน (`format-date.ts`)
- Produces: `OrderEventType` มีค่า `'ORDER_DATE_CHANGED'` · `OrderEventMeta` มีคีย์ `orderedAt?: string`, `orderedAtFrom?: string`, `orderedAtTo?: string`

> 🛑 `OrderEvent.type` มี CHECK constraint ที่ระดับ DB (`OrderEvent_type_check`) ซึ่งเป็น **unmanaged SQL** —
> เพิ่มค่าในโค้ดอย่างเดียวแล้ว insert จะโดน DB ปฏิเสธ · ห้าม `prisma db pull` / `migrate dev` เด็ดขาด (Hard Rule 14)

- [ ] **Step 1: เพิ่มค่าใน `src/lib/order-event.ts`**

ใน `ORDER_EVENT_TYPES` เพิ่มบรรทัดท้ายอาร์เรย์ (แก้คอมเมนต์ "9 ประเภท" เป็น "10 ประเภท" ด้วย):

```ts
  'ORDER_DATE_CHANGED',
```

ใน `ORDER_EVENT_META` เพิ่ม:

```ts
  // feature 00033 — เลื่อนวันที่คำสั่งซื้อ = ย้ายยอดข้ามงวด ผู้ตรวจสอบต้องเห็นแยกจาก ORDER_EDITED
  ORDER_DATE_CHANGED: { label: 'เปลี่ยนวันที่คำสั่งซื้อ', icon: 'calendar-event', tone: 'neutral' },
```

ใน `OrderEventMeta` เพิ่ม 3 คีย์ (ทั้งหมดเป็นเวลา ไม่ใช่ PII จึงเก็บค่าจริงได้):

```ts
  /** feature 00033 — วันที่สั่งซื้อที่ผู้ขายระบุ ใส่เฉพาะตอนที่ต่างจากเวลาจริงที่กด (ORDER_CREATED) */
  orderedAt?: string
  /** feature 00033 — วันที่สั่งซื้อเดิมก่อนแก้ (ORDER_DATE_CHANGED) */
  orderedAtFrom?: string
  /** feature 00033 — วันที่สั่งซื้อใหม่หลังแก้ (ORDER_DATE_CHANGED) */
  orderedAtTo?: string
```

ใน `describeOrderEvent` เพิ่ม 2 case ก่อน `default`:

```ts
    case 'ORDER_CREATED':
      // บรรทัดรองโผล่เฉพาะออเดอร์ที่ลงวันที่ย้อนหลัง/ล่วงหน้า — ออเดอร์ปกติไม่มี meta.orderedAt
      return e.meta.orderedAt ? `ลงวันที่สั่งซื้อ ${formatDateTimeTH(e.meta.orderedAt)}` : null
    case 'ORDER_DATE_CHANGED':
      return e.meta.orderedAtFrom && e.meta.orderedAtTo
        ? `${formatDateTimeTH(e.meta.orderedAtFrom)} → ${formatDateTimeTH(e.meta.orderedAtTo)}`
        : null
```

เพิ่ม import ที่หัวไฟล์ (โมดูลนี้เป็น pure — `format-date.ts` ก็ pure เช่นกัน ไม่ทำลายข้อกำหนด):

```ts
import { formatDateTimeTH } from './format-date'
```

- [ ] **Step 2: type-check เพื่อให้ TypeScript บังคับว่า `ORDER_EVENT_META` มีครบทุกค่า**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: exit 0 — `Record<OrderEventType, …>` จะฟ้องเองถ้าลืมเพิ่ม key
(นี่คือด่านที่ `rg` จับไม่ได้ — บทเรียน 00028 เรื่อง object key)

- [ ] **Step 3: เขียน migration**

```sql
-- prisma/migrations/20260806120000_order_event_date_changed/migration.sql
-- feature 00033 — เพิ่มชนิดเหตุการณ์ ORDER_DATE_CHANGED (เลื่อนวันที่คำสั่งซื้อ)
--
-- CHECK นี้เป็น unmanaged SQL: Prisma DSL ประกาศไม่ได้ จึงต้องเขียนมือทุกครั้งที่รายชื่อเปลี่ยน
-- และห้าม `prisma db pull` เด็ดขาด (introspect ไม่เห็น แล้วจะสร้าง migration ที่ DROP ทิ้ง)
--
-- ตารางนี้มีข้อมูลแล้ว จึงใช้ NOT VALID + VALIDATE ตามแบบเดียวกับ Shop_vertical_check:
-- ADD ... NOT VALID จับล็อกสั้น ๆ, VALIDATE สแกนแถวเดิมโดยไม่บล็อกการเขียน
-- (แถวเดิมทุกแถวผ่านอยู่แล้วเพราะรายชื่อใหม่เป็น superset ของเดิม)

ALTER TABLE "OrderEvent" DROP CONSTRAINT IF EXISTS "OrderEvent_type_check";

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
    'ORDER_CREATED',
    'ORDER_EDITED',
    'ORDER_CANCELLED',
    'TRACKING_ADDED',
    'SHIPMENT_CREATED',
    'SHIPMENT_CANCELLED',
    'SHIPMENT_LINKED',
    'SMS_LINK_SENT',
    'BUYER_CONFIRMED',
    'ORDER_DATE_CHANGED'
)) NOT VALID;

ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
```

- [ ] **Step 4: apply กับฐาน local เท่านั้น (Hard Rule 14 — ปักหมุด URL localhost ในคำสั่งตรง ๆ)**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
npx prisma migrate deploy
```

Expected: `1 migration applied`
ตรวจ URL/รหัสผ่านจริงของฐาน local ก่อนรัน (`grep DATABASE_URL .env`) — **ห้ามใช้ `$(...)` หรือดึงค่าจาก `.env.local`** ซึ่งชี้ prod

- [ ] **Step 5: แจ้ง user เรื่อง migrate-on-deploy (Hard Rule 15) แล้ว commit**

บอก user ให้ครบ 3 ข้อ: (1) prod ไม่ต้องสั่งเอง push แล้ว `prisma migrate deploy` รันตอน build (2) ฐาน local ต้อง apply เอง — ทำไปแล้วใน Step 4 (3) migrate ล้ม = build ล้ม = deploy ไม่ขึ้น ของเก่ายังเสิร์ฟอยู่

```bash
git add src/lib/order-event.ts prisma/migrations/20260806120000_order_event_date_changed/
git commit -m "feat(00033): ORDER_DATE_CHANGED — ชนิดเหตุการณ์ใหม่ + ขยาย CHECK constraint"
```

---

### Task 6: `createOrder` รับวันที่ + `occurredAt` เป็นเวลาจริง

**Files:**
- Modify: `src/services/order.service.ts` — signature (บรรทัด 74-110), `orderDataBase` (บรรทัด ~207), บล็อกหลัง insert (บรรทัด ~317-330), เพิ่ม error class

**Interfaces:**
- Consumes: `orderDateRejectReason` (Task 2), `OrderEventMeta.orderedAt` (Task 5)
- Produces:
  - `createOrder(shopId, { …, createdAt?: Date })`
  - `export class OrderDateOutOfWindowError extends Error` — route ใน Task 8 catch ตัวนี้

> 🛑 **จุดที่พังเงียบถ้าลืม:** บรรทัด ~329 ปัจจุบันส่ง `occurredAt: order.createdAt` ซึ่ง "บังเอิญถูก"
> เพราะ `createdAt` เท่ากับ `now` มาตลอด — พอย้อนหลังได้ ค่านี้จะผิดทันที **โดยไม่มี type error
> และไม่มีเทสเดิมจับ** ต้องเปลี่ยนเป็นเวลาจริงที่จับไว้ก่อนเข้าทรานแซกชัน

- [ ] **Step 1: เพิ่ม error class ใกล้ error class อื่นของไฟล์**

```ts
/**
 * feature 00033 — วันที่คำสั่งซื้อที่ส่งมาอยู่นอกช่วง 90 วันย้อนหลัง / 7 วันล่วงหน้า
 * ตรวจที่ service ด้วย ไม่ใช่เชื่อ Valibot อย่างเดียว: caller ฝั่ง server (เช่น iShip import)
 * เรียก createOrder ตรง ๆ ไม่ผ่าน schema ของ route
 */
export class OrderDateOutOfWindowError extends Error {
  constructor() {
    super("ORDER_DATE_OUT_OF_WINDOW")
    this.name = "OrderDateOutOfWindowError"
  }
}
```

- [ ] **Step 2: เพิ่มพารามิเตอร์ใน signature ของ `createOrder`**

ต่อจาก `createdByUserId` ในบล็อก type ของพารามิเตอร์ `data`:

```ts
  /**
   * feature 00033 — วันที่/เวลาที่ลูกค้าสั่ง (ไม่ใช่เวลาที่คีย์เข้าระบบ)
   *
   * ไม่ส่งมา = เส้นทางเดิมทุกประการ (คอลัมน์ได้ @default(now()) ของ Postgres)
   * ส่งมา = ทับ createdAt ซึ่งพา "เลขออเดอร์" (formatOrderNo คิดจากปี/เดือนของค่านี้)
   * และ "ลำดับในรายการ" (keyset createdAt DESC) ไปด้วยทั้งชุด — ตั้งใจตามมติ D-1
   */
  createdAt?: Date;
```

- [ ] **Step 3: ตรวจช่วงเวลา + จับเวลาจริง ก่อนเข้าทรานแซกชัน**

วางไว้ต้นฟังก์ชัน (ก่อน `const round2 = …`):

```ts
  // feature 00033 — เวลาจริงที่ "มีคนกดสร้าง" จับไว้ครั้งเดียวตั้งแต่ต้น
  // ใช้กับ OrderEvent.occurredAt เสมอ ห้ามใช้ order.createdAt ซึ่งย้อนหลังได้แล้ว
  const keyedInAt = new Date();

  if (data.createdAt) {
    const ms = data.createdAt.getTime();
    if (orderDateRejectReason(ms, keyedInAt.getTime()) !== null) {
      throw new OrderDateOutOfWindowError();
    }
  }
```

เพิ่ม import ที่หัวไฟล์:

```ts
import { orderDateRejectReason } from "@/lib/order-date-window";
```

- [ ] **Step 4: ใส่ค่าลง `orderDataBase`**

ต่อจาก `createdByUserId` ใน object `orderDataBase`:

```ts
    // ไม่ส่งมา = undefined → Prisma ไม่ใส่คอลัมน์นี้ใน INSERT → @default(now()) ทำงานตามเดิม
    createdAt: data.createdAt ?? undefined,
```

- [ ] **Step 5: แก้ `recordOrderEvent` ให้ใช้เวลาจริง + แนบวันที่สั่งซื้อ**

แทนที่บล็อก `recordOrderEvent` เดิม (บรรทัด ~326-331):

```ts
        // feature 00031 — ประวัติคำสั่งซื้อ: เขียนใน tx เดียวกับการสร้างเสมอ
        // actor = คนที่กดสร้าง (null = ระบบออกเอง — ห้าม fallback เป็นเจ้าของร้าน)
        //
        // feature 00033 — occurredAt = "เวลาที่มีคนกดสร้าง" ไม่ใช่ "วันที่ลูกค้าสั่ง"
        // เดิมส่ง order.createdAt ซึ่งบังเอิญถูกเพราะสองค่านี้เคยเท่ากันเสมอ. ประวัติคือหลักฐาน
        // ว่าใครทำอะไรเมื่อไหร่ — ย้อนตามค่าที่ผู้ใช้กรอกได้เมื่อไหร่ ก็เลิกเป็นหลักฐานเมื่อนั้น
        // ลงวันที่เอง = ค่าที่ส่งมาต่างจากเวลาที่กด (ไม่ส่งมาเลย = ไม่ใช่การลงย้อนหลัง)
        const isBackdated =
          !!data.createdAt && data.createdAt.getTime() !== keyedInAt.getTime();

        await recordOrderEvent(tx, {
          orderId: order.id,
          type: "ORDER_CREATED",
          actorUserId: data.createdByUserId ?? null,
          occurredAt: keyedInAt,
          // ใส่ orderedAt เฉพาะออเดอร์ที่ลงวันที่เอง — ออเดอร์ปกติ meta ว่างเหมือนเดิมทุกประการ
          ...(isBackdated ? { meta: { orderedAt: order.createdAt.toISOString() } } : {}),
        });
```

- [ ] **Step 6: type-check**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add src/services/order.service.ts
git commit -m "feat(00033): createOrder รับ createdAt + occurredAt ใช้เวลาจริงที่กด ไม่ใช่วันที่ที่กรอก"
```

---

### Task 7: `updateOrderContent` — แก้วันที่ + ซิงก์ `orderNo`

**Files:**
- Modify: `src/services/order.service.ts` — `updateOrderContent` (บรรทัด 419 เป็นต้นไป)

**Interfaces:**
- Consumes: `createOrder` type (บรรทัด `data: Parameters<typeof createOrder>[1]` ทำให้ `createdAt` ไหลเข้ามาเองแล้วจาก Task 6), `formatOrderNo`, `OrderDateOutOfWindowError`
- Produces: PATCH ที่เปลี่ยน `createdAt` แล้วอัปเดต `orderNo` + บันทึก `ORDER_DATE_CHANGED`

> 🛑 หน้าจอทุกที่คำนวณเลขออเดอร์สดจาก `createdAt` (`OrderCard.tsx:124`, `OrdersTable.tsx:184`,
> `OrderQrSheet.tsx:40`) **ไม่ได้อ่านคอลัมน์ `orderNo`** — ถ้าไม่ recompute คอลัมน์ด้วย
> เลขที่ผู้ใช้เห็นบนจอจะค้นด้วย `@@index([orderNo])` ไม่เจอ

- [ ] **Step 1: ตรวจช่วงเวลา + จับเวลาจริง ต้นฟังก์ชัน**

วางก่อน `const round2 = …` ใน `updateOrderContent`:

```ts
  // feature 00033 — เวลาจริงที่กดแก้ (ใช้กับ occurredAt ของ event ทุกตัวในรอบนี้)
  const editedAt = new Date();

  if (data.createdAt) {
    const ms = data.createdAt.getTime();
    if (orderDateRejectReason(ms, editedAt.getTime()) !== null) {
      throw new OrderDateOutOfWindowError();
    }
  }
```

- [ ] **Step 2: ดึง `createdAt` + `publicToken` เดิมมาเทียบ**

ใน `tx.order.findFirst` บล็อก `select` (บรรทัด ~455-462) เพิ่ม 2 ฟิลด์:

```ts
        createdAt: true, publicToken: true,
```

- [ ] **Step 3: อัปเดตวันที่ + orderNo + บันทึก event ในทรานแซกชันเดียวกัน**

วางไว้ **ในทรานแซกชันเดียวกับการอัปเดตเนื้อหาออเดอร์** หลังจากอัปเดตฟิลด์อื่นเสร็จ:

```ts
    // feature 00033 — เปลี่ยนวันที่คำสั่งซื้อ
    if (data.createdAt && data.createdAt.getTime() !== existing.createdAt.getTime()) {
      // เลขออเดอร์คิดจากปี/เดือนของ createdAt — ต้อง recompute พร้อมกันในทรานแซกชันเดียว
      // ไม่งั้นคอลัมน์ orderNo ค้างเดือนเก่า ขณะที่หน้าจอคำนวณสดแล้วโชว์เดือนใหม่
      // → ผู้ใช้ค้นด้วยเลขที่เห็นบนจอแล้วไม่เจอ (@@index([orderNo]))
      await tx.order.update({
        where: { id: existing.id },
        data: {
          createdAt: data.createdAt,
          orderNo: formatOrderNo(existing.publicToken, data.createdAt),
        },
      });

      // occurredAt = เวลาจริงที่กดแก้ ไม่ใช่วันที่ใหม่ที่กรอก (Global Constraint)
      await recordOrderEvent(tx, {
        orderId: existing.id,
        type: "ORDER_DATE_CHANGED",
        actorUserId: actorUserId ?? null,
        occurredAt: editedAt,
        meta: {
          orderedAtFrom: existing.createdAt.toISOString(),
          orderedAtTo: data.createdAt.toISOString(),
        },
      });
    }
```

- [ ] **Step 4: ตรวจว่า `ORDER_EDITED` ที่มีอยู่เดิมไม่นับวันที่เป็น "field ที่เปลี่ยน"**

อ่านโค้ดที่คำนวณ `changedCount` แล้วยืนยันว่า `createdAt` **ไม่ถูกนับ** — การเลื่อนวันที่มี event ของตัวเองแล้ว นับซ้ำจะทำให้ประวัติเล่าเรื่องเดียวกันสองรอบ

- [ ] **Step 5: type-check**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/services/order.service.ts
git commit -m "feat(00033): แก้วันที่คำสั่งซื้อได้ + recompute orderNo + บันทึก ORDER_DATE_CHANGED"
```

---

### Task 8: Route — map error ใหม่เป็น 400 ทั้ง POST และ PATCH

**Files:**
- Modify: `src/app/api/orders/route.ts` (บล็อก catch บรรทัด ~78-108)
- Modify: `src/app/api/orders/[token]/route.ts` (บล็อก catch บรรทัด ~92-106)

**Interfaces:**
- Consumes: `OrderDateOutOfWindowError` (Task 6), `ORDER_DATE_OUT_OF_WINDOW_MESSAGE` (Task 2)
- Produces: HTTP 400 พร้อมข้อความไทย แทนที่จะตก 500

> บทเรียน `feedback_service_error_route_mapping`: error ใหม่ที่ไม่มี route-catch = 500 ตัวเปล่าให้ผู้ใช้
> **ต้องครอบทั้งสอง route** — ขาดตัวใดตัวหนึ่งคือครึ่งเดียว

- [ ] **Step 1: แปลง ISO เป็น Date ก่อนส่งเข้า service — ทั้ง 2 route**

`parsed.output.createdAt` เป็น **string** แต่ service รับ `Date` — ใน `POST /api/orders` แก้บรรทัดที่เรียก `createOrder`:

```ts
    const createdByUserId = (session.user as { id?: string }).id ?? null;
    // feature 00033 — schema รับเป็น ISO string, service รับ Date
    const { createdAt: createdAtIso, ...rest } = parsed.output;
    const order = await createOrder(shop.id, {
      ...rest,
      ...(createdAtIso ? { createdAt: new Date(createdAtIso) } : {}),
      appointment,
      createdByUserId,
    });
```

ใน `PATCH /api/orders/[token]` แก้บรรทัดที่เรียก `updateOrder`:

```ts
    const actorUserId = (session as { user?: { id?: string } }).user?.id ?? null;
    const { createdAt: createdAtIso, ...rest } = parsed.output;
    const order = await updateOrder(
      ctx.shopId,
      token,
      { ...rest, ...(createdAtIso ? { createdAt: new Date(createdAtIso) } : {}) },
      actorUserId,
    );
```

- [ ] **Step 2: เพิ่ม catch ใน `POST /api/orders`**

วางก่อน `console.error("[POST /api/orders] …")`:

```ts
    // feature 00033 — วันที่นอกช่วงที่ยอมรับ (ด่านที่สองต่อจาก Valibot; caller ฝั่ง server
    // ที่เรียก createOrder ตรง ๆ ไม่ผ่าน schema จึงมาโผล่ที่นี่ได้)
    if (e instanceof OrderDateOutOfWindowError) {
      return NextResponse.json({ error: ORDER_DATE_OUT_OF_WINDOW_MESSAGE }, { status: 400 });
    }
```

- [ ] **Step 3: เพิ่ม catch เดียวกันใน `PATCH /api/orders/[token]`**

วางก่อน `console.error("[PATCH /api/orders/[token]]", …)`:

```ts
    if (e instanceof OrderDateOutOfWindowError) {
      return NextResponse.json({ error: ORDER_DATE_OUT_OF_WINDOW_MESSAGE }, { status: 400 });
    }
```

- [ ] **Step 4: เพิ่ม import ให้ครบทั้งสองไฟล์**

```ts
import { OrderDateOutOfWindowError } from "@/services/order.service";
import { ORDER_DATE_OUT_OF_WINDOW_MESSAGE } from "@/lib/order-date-window";
```

- [ ] **Step 5: ตรวจว่าไม่มี route ไหนตกหล่น**

```bash
rg -n "OrderDateOutOfWindowError" src/app/api/
```

Expected: เห็นทั้ง `orders/route.ts` และ `orders/[token]/route.ts` อย่างละ 2 บรรทัด (import + catch)

- [ ] **Step 6: type-check + commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
git add src/app/api/orders/route.ts "src/app/api/orders/[token]/route.ts"
git commit -m "feat(00033): map OrderDateOutOfWindowError เป็น 400 ทั้ง POST และ PATCH"
```

---

### Task 9: UI — แถว "วันที่สั่งซื้อ" (ผ่าน ux gate ก่อน)

**Files:**
- Create: `src/app/(paces)/seller/(dashboard)/orders/new/components/OrderDateRow.tsx`
- Modify: `.../orders/new/components/OrderCreateForm.tsx` (`FormValues` บรรทัด 117, `defaultValues` บรรทัด 267, บล็อกโหลดออเดอร์เดิมบรรทัด 293-334, body บรรทัด 630, toast บรรทัด 685)
- Modify: `.../orders/new/components/QuickSummaryPanel.tsx`

**Interfaces:**
- Consumes: `orderDateWindow` (Task 2), `formatOrderDateLabel` (Task 3)
- Produces:
  - `FormValues.orderedAt?: string` — เก็บเป็น `datetime-local` value (`"YYYY-MM-DDTHH:mm"` เวลาเครื่อง) · `undefined` = ใช้เวลาปัจจุบัน
  - `<OrderDateRow control={control} setValue={setValue} fromMessage={boolean} />`

- [ ] **Step 1: 🛑 invoke `safepay-ux` ออก Design Spec ก่อนแตะโค้ด (Hard Rule 8)**

ให้ ux อ่าน `DESIGN.md` + `PRODUCT.md` + `.impeccable/design.json` + playbook `shape.md`/`operate.md`/`craft-floor.md`
และอิง **Paces docs** `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`
ส่ง spec §9 + mockup HTML ไปเป็น input · ผลลัพธ์ต้องมีหัวข้อ `### Impeccable compliance` + `Mode:`

- [ ] **Step 2: สร้าง `OrderDateRow.tsx`**

```tsx
'use client'
/**
 * OrderDateRow — แถว "วันที่สั่งซื้อ" ในฟอร์มสร้าง/แก้คำสั่งซื้อ (feature 00033)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/forms/basic/ (form-label + form-input)
 *       ผ่าน src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:78-90
 *       ซึ่ง copy pattern input type="datetime-local" มาแล้ว
 *
 * ยุบไว้เป็นค่าตั้งต้น (มติ D-7): ~95% ของการคีย์คือ "ตอนนี้" — ช่องกรอกที่โผล่ตลอดเวลา
 * เพิ่มภาระสายตาให้ทุกคนเพื่อคนส่วนน้อย
 */
import { useState } from 'react'
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form'
import { Icon } from '@iconify/react'
import { orderDateWindow } from '@/lib/order-date-window'
import { formatOrderDateLabel, formatDateTH } from '@/lib/format-date'
import type { FormValues } from './OrderCreateForm'

/** Date → ค่าของ input type="datetime-local" ("YYYY-MM-DDTHH:mm" เวลาเครื่อง) */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Props = {
  control: Control<FormValues>
  setValue: UseFormSetValue<FormValues>
  /** ค่านี้มาจากเวลาของข้อความในแชท (feature 00033 §9.4) — โชว์ชิปบอกที่มา */
  fromMessage?: boolean
  /** เวลาข้อความเก่ากว่าเพดาน จึงไม่ได้เติมให้ — โชว์ชิปเตือนแทน */
  messageTooOld?: boolean
}

export default function OrderDateRow({ control, setValue, fromMessage, messageTooOld }: Props) {
  // เปิดช่องค้างไว้เลยเมื่อค่ามาจากข้อความ — ผู้ขายต้องเห็นว่ากำลังลงวันย้อนหลังอยู่
  const [editing, setEditing] = useState(!!fromMessage)
  const now = new Date()
  const { minMs, maxMs } = orderDateWindow(now.getTime())

  return (
    <div>
      <span className="form-label">วันที่สั่งซื้อ</span>
      <Controller
        control={control}
        name="orderedAt"
        render={({ field }) => {
          const current = field.value ? new Date(field.value) : now

          if (!editing) {
            return (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-default-800">
                  <Icon icon="tabler:calendar" className="size-4 shrink-0" />
                  {formatOrderDateLabel(current, now)}
                </span>
                <button type="button" className="btn btn-ghost text-primary" onClick={() => setEditing(true)}>
                  เปลี่ยน
                </button>
              </div>
            )
          }

          return (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="form-input flex-1"
                  value={field.value ?? toDatetimeLocalValue(now)}
                  min={toDatetimeLocalValue(new Date(minMs))}
                  max={toDatetimeLocalValue(new Date(maxMs))}
                  onChange={(e) => field.onChange(e.target.value || undefined)}
                />
                <button
                  type="button"
                  className="btn bg-primary/15 text-primary"
                  onClick={() => {
                    setValue('orderedAt', undefined)
                    setEditing(false)
                  }}
                >
                  ตอนนี้
                </button>
              </div>
              <p className="mt-1.5 text-sm text-default-600">
                ย้อนหลังได้ถึง {formatDateTH(new Date(minMs))}
              </p>
            </>
          )
        }}
      />

      {fromMessage && (
        <span className="badge mt-2 bg-primary/15 text-primary">
          <Icon icon="tabler:message" className="size-3.5" />
          ใช้เวลาจากข้อความ
        </span>
      )}
      {messageTooOld && (
        <span className="badge mt-2 bg-warning/15 text-warning">
          <Icon icon="tabler:alert-circle" className="size-3.5" />
          ข้อความเก่าเกินกำหนด — ใช้เวลาปัจจุบัน
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: เพิ่มฟิลด์ใน `FormValues` + `defaultValues` ของ `OrderCreateForm.tsx`**

ใน `export interface FormValues` (บรรทัด 117):

```ts
  /** feature 00033 — วันที่สั่งซื้อเป็นค่า datetime-local ("YYYY-MM-DDTHH:mm" เวลาเครื่อง)
   *  undefined = ใช้เวลาปัจจุบัน (ไม่ส่งฟิลด์ไป API เลย → เส้นทางเดิมทุกประการ) */
  orderedAt?: string
```

ใน `defaultValues` (บรรทัด 267) เพิ่ม:

```ts
      orderedAt: prefillCreatedAt ? toDatetimeLocalValue(new Date(prefillCreatedAt)) : undefined,
```

เพิ่ม prop ใหม่ใน `Props`:

```ts
  /** feature 00033 — เวลาของข้อความในแชทที่กดสร้างออเดอร์ (ISO string) ใช้เป็นวันที่สั่งซื้อ */
  prefillCreatedAt?: string
```

- [ ] **Step 4: โหลดค่าเดิมเข้าฟอร์มในโหมดแก้ไข**

ในบล็อก `reset(...)` ของ effect โหลดออเดอร์เดิม (บรรทัด ~293-334) เพิ่มคีย์:

```ts
        orderedAt: toDatetimeLocalValue(new Date(data.createdAt)),
```

- [ ] **Step 5: ส่งค่าไป API ตอน submit**

ใน object `body` (บรรทัด ~630) เพิ่มบรรทัดสุดท้าย:

```ts
      // feature 00033 — datetime-local เป็นเวลาเครื่อง แปลงเป็น ISO พร้อม offset (Z) ก่อนส่ง
      // pattern เดียวกับ AuctionForm.tsx:56-63 · ไม่มีค่า = ไม่ส่งคีย์เลย
      ...(values.orderedAt ? { createdAt: new Date(values.orderedAt).toISOString() } : {}),
```

- [ ] **Step 6: toast บอกว่าออเดอร์ไปอยู่ไหน (§5.2)**

แทนบล็อก `pacesToast.success` เดิม (บรรทัด ~685):

```ts
      if (isDesktop) {
        // feature 00033 — ออเดอร์ที่ลงวันที่ย้อนหลังไม่โผล่หัวรายการ (keyset createdAt DESC)
        // ถ้าไม่บอก คนคีย์จะหาไม่เจอแล้วคีย์ซ้ำ
        const orderedDate = values.orderedAt ? new Date(values.orderedAt) : null
        const isBackdated = orderedDate ? thaiDayKey(orderedDate) !== thaiDayKey(new Date()) : false
        pacesToast.success(
          editOrderToken
            ? 'บันทึกการแก้ไขแล้ว'
            : isBackdated
              ? `บันทึกแล้ว ลงวันที่ ${formatDateTimeTH(orderedDate!)} — อยู่ในรายการย้อนหลัง`
              : `${vocab.createLabel}แล้ว แชร์ลิงก์ให้ลูกค้า`,
        )
      }
```

- [ ] **Step 7: วางแถวในทั้ง 2 layout**

- POS เดสก์ท็อป: วาง `<OrderDateRow …/>` ในการ์ดสรุป ต่อจาก `<ChannelPaymentSelect …/>`
- มือถือ/แชท: วางใน `QuickSummaryPanel.tsx` ในบล็อกสรุปเดียวกัน

ทั้งสองจุดใช้ component ตัวเดียวกัน ห้าม copy markup ซ้ำ

- [ ] **Step 8: type-check + build**

```bash
node node_modules/typescript/lib/tsc.js --noEmit && npm run build
echo "exit=$?"
```

Expected: `exit=0` — ตัดสินด้วย exit code เท่านั้น ("✓ Compiled" โผล่ได้ทั้งที่ล้ม)
⚠️ `npm run build` ทับ `.next` ของ dev server → ต้องปลุก dev server คืนและแจ้ง user

- [ ] **Step 9: reviewer grep gates**

```bash
rg "from ['\"]react-toastify" "src/app/(paces)/" | grep -v "^Binary"
grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' \
  "src/app/(paces)/seller/(dashboard)/orders/new/components/OrderDateRow.tsx" \
  "src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx"
rg "text-\[|bg-\[rgba|shadow-\[|rounded-\[|#[0-9a-fA-F]{6}" \
  "src/app/(paces)/seller/(dashboard)/orders/new/components/OrderDateRow.tsx"
```

Expected: ทั้ง 3 คำสั่งคืน 0 บรรทัด

- [ ] **Step 10: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/orders/new/components/"
git commit -m "feat(00033): แถววันที่สั่งซื้อในฟอร์ม — ยุบไว้ + ปุ่มเปลี่ยน

Base: theme/paces/Admin/TS/src/app/(admin)/forms/basic/ (form-label + form-input)
      ผ่าน seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:78-90"
```

---

### Task 10: แชท — เติมเวลาของข้อความให้อัตโนมัติ

**Files:**
- Modify: `src/app/(paces)/seller/(chat)/_components/DraftOrderProvider.tsx` (`OpenDraftInput` บรรทัด 41-62 + จุดที่ render `OrderCreateForm`)
- Modify: `.../(chat)/inbox/[conversationId]/components/ChatThread.tsx` (บรรทัด ~982 มือถือ, ~1788 เดสก์ท็อป)

**Interfaces:**
- Consumes: `OrderCreateForm` prop `prefillCreatedAt` (Task 9), `isOrderDateInWindow` (Task 2)
- Produces: `OpenDraftInput.messageCreatedAt?: string`

> `m.createdAt` มีอยู่ในมือแล้วทั้งสองทางเข้า (`ChatMessageView.createdAt`, `chat.service.ts:113`) — ปัจจุบันถูกทิ้งตอนเรียก `openDraft`

- [ ] **Step 1: เพิ่มฟิลด์ใน `OpenDraftInput`**

```ts
  /**
   * feature 00033 — เวลาของข้อความที่กดสร้างออเดอร์ (ISO string)
   *
   * ใช้เป็น "วันที่สั่งซื้อ" ให้เลย: ลูกค้าพิมพ์สรุปออเดอร์ไว้เมื่อคืน แอดมินมาคีย์เช้าวันรุ่งขึ้น
   * ยอดต้องตกคืนที่สั่ง ไม่ใช่เช้าที่คีย์
   *
   * มีผลเฉพาะตอนสร้างร่างใหม่ เหมือน prefillText — ร่างที่เปิดค้างอยู่แล้วไม่ถูกทับ
   */
  messageCreatedAt?: string
```

- [ ] **Step 2: เก็บลง draft state แล้วส่งต่อเป็น prop**

เพิ่มฟิลด์เดียวกันใน type `ChatDraft` แล้วตอน render `OrderCreateForm` ส่ง:

```tsx
  prefillCreatedAt={draft.messageCreatedAt}
```

- [ ] **Step 3: ส่ง `m.createdAt` จากทั้ง 2 ทางเข้าใน `ChatThread.tsx`**

เมนูกดค้างมือถือ (บรรทัด ~982) และปุ่ม hover เดสก์ท็อป (บรรทัด ~1788) — เพิ่มบรรทัดเดียวกันในทั้งคู่:

```ts
            prefillText: m.body!,
            messageCreatedAt: new Date(m.createdAt).toISOString(),
```

- [ ] **Step 4: ตัดค่าที่เก่าเกินเพดาน (fail-closed ไม่ใช่ error)**

ใน `OrderCreateForm` ตอนคำนวณ `defaultValues.orderedAt` เปลี่ยนเป็น:

```ts
      // feature 00033 — ข้อความเก่ากว่าเพดานย้อนหลัง: ไม่เติม ใช้เวลาปัจจุบัน + โชว์ชิปบอกเหตุผล
      // (ไม่ใช่ error — ผู้ขายไม่ได้ทำอะไรผิด แค่ข้อความเก่าเกินไป)
      orderedAt:
        prefillCreatedAt && isOrderDateInWindow(new Date(prefillCreatedAt).getTime(), Date.now())
          ? toDatetimeLocalValue(new Date(prefillCreatedAt))
          : undefined,
```

แล้วส่ง `fromMessage` / `messageTooOld` ให้ `OrderDateRow` ตามผลของเงื่อนไขเดียวกัน (คำนวณเป็นตัวแปรเดียวแล้วใช้ซ้ำ — ห้ามคำนวณสองรอบให้หลุดจากกัน)

- [ ] **Step 5: ตรวจว่าไม่มีทางเข้าไหนตกหล่น**

```bash
rg -n "openDraft\(\{" "src/app/(paces)/seller/(chat)/"
```

Expected: ทุกจุดที่มี `prefillText` ต้องมี `messageCreatedAt` ด้วย
(ทางเข้าที่ไม่มีข้อความต้นทาง เช่น ปุ่มสร้างออเดอร์เปล่าและ `CustomerPanel.startCreateOrder` **ไม่ต้องมี** — ไม่มีข้อความให้อ้างเวลา)

- [ ] **Step 6: type-check + commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
git add "src/app/(paces)/seller/(chat)/" "src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx"
git commit -m "feat(00033): สร้างออเดอร์จากข้อความ — ใช้เวลาของข้อความเป็นวันที่สั่งซื้อ

Base: ไม่มี UI ใหม่ (ต่อท่อ prop เข้า OrderDateRow ที่ทำใน task ก่อน)"
```

---

### Task 11: เลิกตัดวันด้วย UTC ใน `/sales` และ `/orders` (§5.3)

**Files:**
- Modify: `src/lib/date-range.ts` (export `thaiMidnightUtc`)
- Modify: `src/app/(paces)/seller/(dashboard)/sales/page.tsx` (บรรทัด 73-76, 111-118, 147)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/page.tsx` (บรรทัด 176, 184-196, 212-218)

**Interfaces:**
- Consumes: `thaiDayKey` (Task 3)
- Produces: หน้า `/sales` และ `/orders` นับวันตรงกับ dashboard/P&L ที่ทำถูกอยู่แล้ว

> บั๊กนี้มีอยู่ก่อนฟีเจอร์นี้ แต่ผู้ขายที่ลงวันที่ถูกแล้วจะยังเห็นยอดผิดถ้าไม่แก้ (user สั่งให้แก้รอบนี้ — D-6)

- [ ] **Step 1: export `thaiMidnightUtc` จาก `date-range.ts`**

เปลี่ยน `function thaiMidnightUtc(...)` เป็น `export function thaiMidnightUtc(...)` พร้อมคอมเมนต์:

```ts
/**
 * เที่ยงคืนของวันตามปฏิทินไทย แสดงเป็น UTC instant
 * export ให้หน้าอื่นใช้ได้ (feature 00033 §5.3) — ห้ามให้แต่ละหน้าคำนวณ offset เอง
 */
```

- [ ] **Step 2: แก้ขอบช่วงใน `sales/page.tsx`**

แทนบรรทัด 73-76:

```ts
  const { from: defFrom, to: defTo } = monthRange()
  const fromLocal = parseDate(fromStr, defFrom)
  const toLocal = parseDate(toStr, defTo)
  // feature 00033 §5.3 — ขอบวันต้องเป็นเที่ยงคืน "เวลาไทย" ไม่ใช่ของ server (ซึ่งเป็น UTC บน Vercel)
  // เดิม to.setHours(23,59,59,999) = 23:59 UTC = 06:59 น. ของวันถัดไปตามเวลาไทย
  // → ออเดอร์เช้ามืดของวันถัดไปถูกนับเข้าช่วงนี้ ส่วนออเดอร์เที่ยงคืนถึงเช้าของวันแรกหลุดออก
  const from = thaiMidnightUtc(fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate())
  const toExcl = thaiMidnightUtc(toLocal.getFullYear(), toLocal.getMonth(), toLocal.getDate() + 1)
```

แล้วแก้ตัวกรอง (บรรทัด ~111-118) ให้เป็นช่วงเปิดปลาย (`< toExcl` ไม่ใช่ `<= to`):

```ts
  const inRange = allOrders.filter((o: OrderItem) => {
    const t = new Date(o.createdAt).getTime()
    return t >= from.getTime() && t < toExcl.getTime()
  })
  const spanMs = toExcl.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - spanMs)
  const inPrevRange = allOrders.filter((o: OrderItem) => {
    const t = new Date(o.createdAt).getTime()
    return t >= prevFrom.getTime() && t < from.getTime()
  })
```

ย้ายการประกาศ `spanMs`/`prevFrom` เดิม (บรรทัด ~90-91) มาไว้ที่นี่ และไล่แก้ทุกจุดที่อ้าง `to` ให้ใช้ `toExcl`

- [ ] **Step 3: แก้การตัดวันใน `sales/page.tsx` บรรทัด 147**

```ts
    const day = thaiDayKey(o.createdAt)
```

พร้อม import `thaiDayKey` และไล่ดูว่าแกน x ของกราฟ (ที่สร้างรายการวันจากช่วง) ใช้คีย์รูปแบบเดียวกัน — ถ้าสร้างด้วย `toISOString().slice(0,10)` ต้องเปลี่ยนเป็น `thaiDayKey` ด้วย ไม่งั้นคีย์ไม่ตรงกันแล้วกราฟกลายเป็น 0 ทั้งแถบ

- [ ] **Step 4: แก้ `orders/page.tsx`**

แทน `toDateStr` (บรรทัด 176) — ลบคอมเมนต์ที่บอกว่า "server timezone = UTC" ออกด้วยเพราะเป็นสมมติฐานที่ผิด:

```ts
  // feature 00033 §5.3 — ตัดวันตามปฏิทินไทย ไม่ใช่ UTC (ออเดอร์ 00:00–07:00 น. เคยตกไปวันก่อนหน้า)
  const toDateStr = (iso: string) => thaiDayKey(iso)
```

แทนการสร้าง `lastDays` (บรรทัด ~184-189) และ `prevStartStr`/`prevEndStr` (บรรทัด ~191-196) ให้เดินถอยหลังทีละ 24 ชม. แล้วตัดวันแบบไทย แทนการใช้ `setUTCDate`:

```ts
  const DAY_MS = 24 * 60 * 60 * 1000
  const lastDays = Array.from({ length: WINDOW }, (_, i) =>
    thaiDayKey(new Date(now.getTime() - (WINDOW - 1 - i) * DAY_MS)),
  )
  const prevStartStr = thaiDayKey(new Date(now.getTime() - (WINDOW * 2 - 1) * DAY_MS))
  const prevEndStr = thaiDayKey(new Date(now.getTime() - WINDOW * DAY_MS))
```

- [ ] **Step 5: ตรวจว่าไม่เหลือการตัดวันแบบ UTC ในหน้า seller**

```bash
rg -n "toISOString\(\)\.slice\(0, ?10\)" "src/app/(paces)/seller/"
```

Expected: 0 บรรทัด — ถ้ายังเหลือ ให้ดูว่าจุดนั้นเป็น "คีย์วันตามปฏิทิน" (ต้องแก้) หรือเป็นค่าที่ตั้งใจให้เป็น UTC จริง ๆ (เช่น `Expense.expenseDate` ที่นอร์มัลไลซ์ตอนเขียนอยู่แล้ว — ปล่อยไว้ พร้อมเขียนคอมเมนต์กำกับ)

- [ ] **Step 6: type-check + build + commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit && npm run build
echo "exit=$?"
git add src/lib/date-range.ts "src/app/(paces)/seller/(dashboard)/sales/page.tsx" "src/app/(paces)/seller/(dashboard)/orders/page.tsx"
git commit -m "fix(00033): /sales และ /orders ตัดวันตามเวลาไทย ไม่ใช่ UTC

ออเดอร์เวลา 00:00–07:00 น. ถูกนับเป็นของวันก่อนหน้าเฉพาะ 2 หน้านี้ ขณะที่
dashboard/P&L คิดเวลาไทยถูกอยู่แล้ว — ตัวเลขเดียวกันเล่าคนละเรื่องมาตลอด
บั๊กมีอยู่ก่อนฟีเจอร์วันที่ย้อนหลัง แต่ทำให้ฟีเจอร์นั้นไร้ความหมายถ้าไม่แก้"
```

---

### Task 12: Integration test + ปิด gate

**Files:**
- Test: `tests/orders/backdated-order-date.test.ts`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: หลักฐานว่าทั้งเส้นทำงานถูกจริง

> 🛑 Hard Rule 13 — ห้าม `deleteMany()` ไม่มี `where`, `TRUNCATE`, `cleanDatabase()` เด็ดขาด
> ล้างข้อมูลด้วย `deleteTestData({ userIds, shopIds })` ที่ผูกกับ id ที่เทสสร้างเองเท่านั้น

- [ ] **Step 1: เขียนเทสที่ยังแดง**

```ts
// tests/orders/backdated-order-date.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createOrder, updateOrderContent, OrderDateOutOfWindowError } from '@/services/order.service'
import { deleteTestData } from '../setup'

const createdUserIds: string[] = []
const createdShopIds: string[] = []

afterAll(async () => {
  await deleteTestData({ userIds: createdUserIds, shopIds: createdShopIds })
})

describe('วันที่คำสั่งซื้อย้อนหลัง (00033)', () => {
  it('createOrder ที่ลงวันที่ย้อนหลัง — createdAt/orderNo/occurredAt/meta ตรงกันครบ 4 ค่า', async () => {
    // ตั้ง shopId จาก fixture ที่เทสสร้างเอง แล้ว push id เข้า createdShopIds/createdUserIds
    const shopId = /* fixture */ ''
    const backdated = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const before = Date.now()

    const order = await createOrder(shopId, {
      items: [{ name: 'เสื้อยืด', qty: 1, price: 390 }],
      type: 'PHYSICAL',
      buyerContact: '0812345678',
      salesChannel: 'STOREFRONT',
      createdAt: backdated,
    })

    // 1) createdAt = ค่าที่ส่งไป
    expect(order.createdAt.getTime()).toBe(backdated.getTime())

    // 2) orderNo ใช้ปี/เดือนของวันที่ที่เลือก
    const row = await prisma.order.findUnique({ where: { id: order.id }, select: { orderNo: true } })
    expect(row?.orderNo).toContain(String(backdated.getFullYear() + 543))

    const event = await prisma.orderEvent.findFirst({
      where: { orderId: order.id, type: 'ORDER_CREATED' },
      select: { occurredAt: true, meta: true },
    })

    // 3) 🛑 occurredAt = เวลาจริงที่กด ไม่ใช่ค่าที่ส่งไป — เทสนี้คือด่านเดียวที่จับข้อผิดนี้ได้
    expect(event!.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(event!.occurredAt.getTime()).not.toBe(backdated.getTime())

    // 4) วันที่สั่งซื้ออยู่ใน meta
    expect((event!.meta as { orderedAt?: string }).orderedAt).toBe(backdated.toISOString())
  })

  it('ออเดอร์ปกติ (ไม่ส่ง createdAt) — meta ไม่มี orderedAt', async () => {
    const shopId = /* fixture */ ''
    const order = await createOrder(shopId, {
      items: [{ name: 'ถุงเท้า', qty: 1, price: 150 }],
      type: 'PHYSICAL',
      buyerContact: '0812345678',
    })
    const event = await prisma.orderEvent.findFirst({
      where: { orderId: order.id, type: 'ORDER_CREATED' },
      select: { meta: true },
    })
    expect((event!.meta as { orderedAt?: string }).orderedAt).toBeUndefined()
  })

  it('วันที่นอกช่วง → OrderDateOutOfWindowError ไม่ใช่บันทึกผ่าน', async () => {
    const shopId = /* fixture */ ''
    await expect(
      createOrder(shopId, {
        items: [{ name: 'x', qty: 1, price: 1 }],
        type: 'PHYSICAL',
        buyerContact: '0812345678',
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      }),
    ).rejects.toBeInstanceOf(OrderDateOutOfWindowError)
  })

  it('PATCH เปลี่ยนวันที่ข้ามเดือน → orderNo update ตาม + มี ORDER_DATE_CHANGED', async () => {
    // สร้างออเดอร์ลงวันที่เดือนนี้ แล้ว updateOrderContent ให้ย้ายไปเดือนก่อน
    // ยืนยัน: orderNo เปลี่ยนเดือน · มี event ORDER_DATE_CHANGED · meta มี from/to
    // · occurredAt ของ event นั้น ≈ now
  })
})
```

- [ ] **Step 2: เติม fixture จริงแทนคอมเมนต์ `/* fixture */` และเขียนเคสที่ 4 ให้ครบ**

ดูรูปแบบ fixture จากไฟล์เทสอื่นใน `tests/` แล้วเก็บ id ทุกตัวที่สร้างลง `createdUserIds`/`createdShopIds`
**ห้ามปล่อยคอมเมนต์ placeholder ค้างไว้** — เทสที่ shopId ว่างจะผ่านแบบไม่ได้ทดสอบอะไร

- [ ] **Step 3: รันเทส**

```bash
npm test -- tests/orders/backdated-order-date.test.ts --run
```

Expected: PASS ทั้ง 4 เคส

- [ ] **Step 4: ตรวจว่าไฟล์เทสไม่มีคำสั่งลบข้อมูลอันตราย (Hard Rule 13)**

```bash
rg -n "deleteMany\(\)|TRUNCATE|cleanDatabase|migrate reset|--force-reset" tests/orders/backdated-order-date.test.ts
```

Expected: 0 บรรทัด

- [ ] **Step 5: Impeccable gate (Hard Rule 8)**

```
/impeccable critique
/impeccable clarify
```

`clarify` ต้องตรวจข้อความทั้ง 4 จุด: ป้าย "วันที่สั่งซื้อ", ชิป "ใช้เวลาจากข้อความ", error นอกช่วง, toast หลังบันทึก

- [ ] **Step 6: Browser QA**

รันที่ `https://seller.deepth.local:4000` (user รัน dev server เอง — ห้ามใช้ localhost)

| เคส | ต้องได้ |
|---|---|
| คีย์ออเดอร์ปกติ ไม่แตะช่องวันที่ | พฤติกรรมเดิมทุกอย่าง ไม่มีอะไรเปลี่ยน |
| กด "เปลี่ยน" → ลงวันที่เมื่อวาน 21:30 | ยอดตกเมื่อวานใน dashboard "วันนี้/เดือนนี้", `/sales`, P&L, การ์ดสถิติ `/orders` |
| ลงวันที่ **00:30 น.** | ตกวันนั้น ไม่ใช่วันก่อนหน้า (เคสที่ §5.3 เคยพัง) — ตรวจทั้ง `/sales` และ `/orders` |
| ลงวันที่เกิน 90 วัน | ขึ้น error ใต้ช่อง ไม่ใช่ 500 |
| กดค้างข้อความในแชท → สร้างออเดอร์ | เวลาข้อความถูกเติม + ชิป "ใช้เวลาจากข้อความ" |
| กด "ใช้เวลาตอนนี้แทน" | กลับเป็น "วันนี้ HH:mm น." ยุบลง |
| แก้วันที่ในหน้าแก้ไข (PENDING) | เลขออเดอร์บนจอเปลี่ยนเดือน + ประวัติขึ้น "เปลี่ยนวันที่คำสั่งซื้อ" |
| แก้ออเดอร์ที่ CONFIRMED | ปฏิเสธตามเดิม |
| dark mode | แถววันที่และชิปอ่านออกทั้งสองธีม (มี toggle ใน topbar จริง) |

- [ ] **Step 7: rebase แล้วค่อย build แล้วค่อย push (แยกคำสั่ง)**

```bash
git fetch origin && git rebase origin/main
npm run build; echo "exit=$?"
```

ต้องได้ `exit=0` **ก่อน** จึงค่อยสั่ง push เป็นคำสั่งแยก — repo นี้ push แข่งกัน การ build ก่อน rebase คือบิลด์ผิดตัว และการรวมคำสั่งด้วย `&&` เคยทำให้ push ทั้งที่ build ล้ม

- [ ] **Step 8: 🛑 แจ้ง user ก่อน push (Hard Rule 15)**

push ขึ้น `main` = `prisma migrate deploy` รันบน prod ตอน build = CHECK constraint ของ `OrderEvent` เปลี่ยนบนฐานจริง
ต้องบอก user แล้วรอยืนยัน ห้าม push เงียบ

---

## Self-Review

**1. Spec coverage**

| spec § | task |
|---|---|
| §3 D-1 ทับ createdAt | 6 |
| §3 D-2 ช่วง 90/7 | 2, 4, 6, 7 |
| §3 D-3 แก้ทีหลัง | 7 |
| §3 D-4 แชท auto-fill | 10 |
| §3 D-5 ทุกหน้า | 9 (component เดียวใช้ 4 จุด) |
| §3 D-6 timezone fixes | 11 |
| §3 D-7 ยุบไว้ | 9 |
| §4 SSOT เพดาน | 2 |
| §5.1 orderNo | 6 (สร้าง — มาฟรี), 7 (แก้ — ต้อง recompute) |
| §5.2 toast | 9 step 6 |
| §5.3 timezone | 11 |
| §6 service | 6, 7 |
| §7 Activity Log | 5, 6, 7 |
| §8 API | 4, 8 |
| §9 UI | 9, 10 |
| §10 เทส | 2, 3, 12 |
| §12 ลำดับงาน | 1 (docs), 9 step 1 (ux), 12 step 5 (impeccable) |

ครบทุกหัวข้อ

**2. Placeholder scan**

จุดที่จงใจปล่อยให้ผู้ทำเติม พร้อมคำสั่งชัดเจนว่าต้องเติมอะไร ไม่ใช่ "TBD":
- Task 12 Step 2 — fixture ของเทส (ต้องอ่านรูปแบบจากไฟล์เทสอื่นก่อน เขียนล่วงหน้าแล้วจะผิด) + เคสที่ 4
- Task 1 — เนื้อหาเอกสารมาจาก spec ทั้งหมด ไม่ใช่ของใหม่
- Task 11 Step 3 — ต้องไล่ดูแกน x ของกราฟว่าใช้คีย์รูปแบบเดียวกันไหม (ขึ้นกับโค้ดจริงที่ยังไม่ได้อ่านทั้งบล็อก)

**3. Type consistency**

- `orderDateRejectReason(valueMs, nowMs)` — ลำดับพารามิเตอร์เหมือนกันทุกที่ (Task 2 นิยาม, Task 4/6/7 เรียก) ✓
- `FormValues.orderedAt` เป็น `string` (datetime-local) ตลอด แปลงเป็น ISO ตอน submit ที่เดียว ✓
- wire field ชื่อ `createdAt` (Task 4 schema → Task 8 route → Task 6/7 service param `createdAt: Date`) ✓ — ชื่อฝั่งฟอร์มเป็น `orderedAt` โดยตั้งใจ (ฟอร์มพูดภาษาผู้ใช้ API พูดภาษา DB) แปลงที่ Task 9 Step 5 จุดเดียว
- `meta.orderedAt` / `orderedAtFrom` / `orderedAtTo` — นิยามที่ Task 5 ใช้ที่ Task 6/7 ✓
- `thaiDayKey` คืน ค.ศ. ใช้เป็นคีย์เท่านั้น — Task 3, 9, 11 ใช้ตรงกัน ✓
