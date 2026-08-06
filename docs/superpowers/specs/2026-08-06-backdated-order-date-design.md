# Design Spec — เลือกวันที่/เวลาของคำสั่งซื้อได้ (feature 00033)

- **วันที่:** 2026-08-06
- **สถานะ:** design approved (user 2026-08-06) — รอ implementation plan
- **Feature no.:** `00033` (ตรวจ `git log --all --name-only -- "docs/20 - Features/*"` แล้วว่าง ไม่ชนสาขาไหน)
- **Surface:** seller `(paces)` — เดสก์ท็อป POS, QuickForm มือถือ, draft ในแชท, หน้าแก้ไขออเดอร์

---

## 1. ปัญหา

ผู้ขายรับออเดอร์ทางแชทตอน 2–3 ทุ่ม แต่แอดมินมาคีย์เข้าระบบเช้าวันรุ่งขึ้น ระบบนับยอดเป็นของ "วันที่คีย์"
เพราะ `Order.createdAt` เป็น `@default(now())` และ **ไม่มีทางเข้าไหนในระบบ set ค่านี้ได้เลย**
(ฟอร์มเคยมี Flatpickr date แต่ถูกถอดออก — คอมเมนต์ยังอยู่ที่ `seller/(fullscreen)/orders/new/page.tsx:6`)

ผลคือรายงานยอดขายรายวัน/รายเดือนเพี้ยนอย่างเป็นระบบสำหรับร้านที่ปิดการขายตอนกลางคืน

## 2. ผลลัพธ์ที่ต้องได้

1. ผู้ขายระบุวันที่-เวลาของคำสั่งซื้อเองได้ทุกหน้าที่สร้าง/แก้ออเดอร์
2. ปุ่มสร้างออเดอร์จากข้อความในแชท **เติมเวลาของข้อความนั้นให้อัตโนมัติ** เห็นได้และแก้ได้
3. ยอดขายทุกหน้าตกวันที่ที่ผู้ขายระบุ ไม่ใช่วันที่คีย์

## 3. การตัดสินใจที่ล็อกแล้ว (user 2026-08-06)

| # | ประเด็น | มติ |
|---|---|---|
| D-1 | เก็บที่ไหน | **ทับ `Order.createdAt` ไปเลย** ไม่เพิ่มฟิลด์ `orderedAt` แยก — `createdAt` เปลี่ยนความหมายเป็น "วันที่ลูกค้าสั่ง" |
| D-2 | ช่วงที่เลือกได้ | ย้อน **90 วัน** ถึงล่วงหน้า **7 วัน** นับจากเวลาที่กดบันทึก |
| D-3 | แก้ทีหลัง | ได้ในหน้าแก้ไขออเดอร์ (โดยปริยาย = เฉพาะ `PENDING` ตามกฎที่มีอยู่แล้ว) |
| D-4 | จากแชท | auto-fill จาก `ChatMessage.createdAt` + ป้ายบอก + แก้ได้ |
| D-5 | หน้าที่มีช่องนี้ | ทุกหน้าที่สร้าง/แก้ออเดอร์ได้ (เดสก์ท็อป + QuickForm มือถือ + แชท + หน้าแก้ไข) |
| D-6 | บั๊ก timezone ที่มีอยู่ก่อน | **แก้ในรอบนี้** ไม่แยกออก |
| D-7 | หน้าตา control | ยุบไว้เป็นแถวสรุป + ปุ่ม "เปลี่ยน" ไม่โชว์ช่องตลอดเวลา |

### เหตุผลของ D-1

`createdAt` ผูกกับ 3 อย่างพร้อมกัน — เลขออเดอร์ · ลำดับในรายการ · ยอดขาย
การเพิ่มฟิลด์ `orderedAt` แยกแปลว่าต้องไล่แก้ผู้อ่านทุกจุด (~15 ไฟล์) และเหลือ "2 เวลา" ให้สับสนตลอดไป
มติคือให้ทั้ง 3 อย่างเคลื่อนพร้อมกัน — ตรงไปตรงมาที่สุด และตรงกับที่ผู้ขายเข้าใจคำว่า "วันที่ออเดอร์"

## 4. กติกาธุรกิจ

| กฎ | ค่า |
|---|---|
| ค่าตั้งต้น | เวลาปัจจุบัน — ไม่แตะอะไร = พฤติกรรมเดิมเป๊ะ (ไม่ส่งฟิลด์มา → `@default(now())` ทำงานตามเดิม) |
| ช่วงที่ยอมรับ | `now − 90d` ≤ ค่า ≤ `now + 7d` (ตรวจทั้ง client และ server) |
| นอกช่วง | ปฏิเสธที่ server ด้วย error เฉพาะ ไม่ clamp เงียบ |
| แก้ทีหลัง | เฉพาะออเดอร์ `PENDING` (`updateOrderContent` โยน `OrderNotEditableError` อยู่แล้วที่ `order.service.ts:466`) |
| เวลาจากแชทเก่ากว่า 90 วัน | **ไม่เติม** ใช้เวลาปัจจุบันแทน + ป้ายบอกเหตุผล (fail-closed ไม่ใช่ error) |
| สต็อก / พัสดุ iShip / ค่าใช้จ่าย | **ไม่ย้อนตาม** ยังตัดสต็อกและเปิดพัสดุด้วยเวลาปัจจุบันเสมอ |
| ทางสร้างออเดอร์ที่ไม่ผ่านฟอร์ม | booking / auction / iShip import ใช้เวลาจริงของเหตุการณ์เหมือนเดิม — นอกขอบเขต |

### SSOT ของเพดานเวลา

ไฟล์ใหม่ **`src/lib/order-date-window.ts`** เป็นที่เดียวที่นิยามช่วง 90/7 วัน

```ts
export const ORDER_BACKDATE_DAYS = 90
export const ORDER_FUTUREDATE_DAYS = 7

export type OrderDateWindow = { minMs: number; maxMs: number }
export function orderDateWindow(nowMs: number): OrderDateWindow
export function isOrderDateInWindow(valueMs: number, nowMs: number): boolean
/** ข้อความไทยบอกว่าทำไมค่านี้ใช้ไม่ได้ — null = ใช้ได้ */
export function orderDateRejectReason(valueMs: number, nowMs: number): string | null
```

ทั้ง client (bound `min`/`max` ของ input + ข้อความใต้ช่อง) และ server (Valibot + service) เรียกฟังก์ชันเดียวกัน
— บทเรียนตรงจาก `src/lib/shipping-address-status.ts`: กฎเดียวเขียนซ้ำ 3 ที่แล้วนิยามไม่ตรงกัน ทำให้ปุ่มขึ้น "เลือกแล้ว" ทั้งที่ยังบันทึกไม่ผ่าน

## 5. ผลข้างเคียงที่ต้องจัดการ

### 5.1 เลขออเดอร์ขยับตามวันที่ (ตั้งใจ — แต่ต้องซิงก์คอลัมน์)

`formatOrderNo(publicToken, createdAt)` = `DP` + ปี พ.ศ. + เดือน + `publicToken` 8 หลัก (`src/lib/order-no.ts`)

**หน้าจอทุกที่คำนวณสดจาก `createdAt` ไม่ได้อ่านคอลัมน์ `orderNo` ที่เก็บไว้:**
`OrderCard.tsx:124` · `OrdersTable.tsx:129,184` · `OrderQrSheet.tsx:40` · `(marketing)/o/[token]/OrderDetailMobile.tsx:49`

ผลที่ตามมา:

- **ตอนสร้าง** — `formatOrderNo` อ่านค่ากลับจากแถวที่เพิ่ง insert (`order.service.ts:319`) จึงได้เดือนถูกอัตโนมัติ ไม่ต้องแก้อะไร
- **ตอนแก้วันที่** — คอลัมน์ `orderNo` ที่เก็บไว้จะค้างเป็นเดือนเก่า ขณะที่หน้าจอโชว์เดือนใหม่
  → **ต้อง recompute + `UPDATE orderNo` ในทรานแซกชันเดียวกับการแก้วันที่** ไม่งั้นค้นด้วยเลขที่เห็นบนจอแล้วไม่เจอ (`@@index([orderNo])` ที่ `schema.prisma:764`)

โค้ด 8 หลักท้าย (= identity จริงที่ผู้ซื้อเห็นเป็น `#โค้ด`) ไม่เปลี่ยน เปลี่ยนแค่ส่วนปี/เดือน

### 5.2 ออเดอร์ย้อนหลังไม่อยู่หัวรายการ

รายการออเดอร์ keyset ด้วย `createdAt DESC` (`order.service.ts:989-1024`)
ลงวันที่ย้อน 30 วัน = จมอยู่หน้าท้าย ๆ คนคีย์หาไม่เจอแล้วอาจคีย์ซ้ำ

**ทางแก้:** หลังบันทึกสำเร็จ ถ้าวันที่ที่เลือก ≠ วันนี้ (ตามเวลาไทย) แสดง `pacesToast.success` ที่บอกตรง ๆ:
> บันทึกแล้ว · ลงวันที่ 28 ก.ค. 2569 — อยู่ในรายการย้อนหลัง

ไม่เปลี่ยนการเรียงรายการ (เรียงตามวันที่ออเดอร์คือความหมายที่ถูกแล้ว)

### 5.3 หน้าที่นับวันด้วย UTC (บั๊กที่มีอยู่ก่อน — D-6 ให้แก้รอบนี้)

| ไฟล์ | อาการ |
|---|---|
| `seller/(dashboard)/sales/page.tsx:147` | `new Date(o.createdAt).toISOString().slice(0,10)` = **วัน UTC** → ออเดอร์เวลา 00:00–07:00 น. ไทย ตกไปวันก่อนหน้า |
| `sales/page.tsx:114-118` | ช่วง from/to สร้างจาก local Date ไม่ผ่าน `thaiMidnightUtc` |
| `seller/(dashboard)/orders/page.tsx:139,176,212-218` | การ์ดสถิติใช้ `createdAtISO.slice(0,10)`; คอมเมนต์ `:175` เขียนไว้ตรง ๆ ว่าสมมติ "server timezone = UTC" |

ขณะที่ `dashboard.service.ts:20` (`TZ_OFFSET_MS`), `src/lib/date-range.ts` (`thaiMidnightUtc`) และ `pnl.service.ts` ทำถูกอยู่แล้ว

**ทางแก้:** ให้ทั้ง 3 จุดข้างบนใช้ helper เวลาไทยตัวเดียวกับที่ `date-range.ts` ใช้อยู่ ไม่คำนวณเอง
เหตุผลที่ต้องมาในรอบนี้: ฟีเจอร์นี้ทั้งฟีเจอร์คือเรื่อง "ยอดต้องตกวันที่ถูก" — ปล่อยไว้แปลว่าผู้ขายลงวันที่ถูกแล้วยังเห็นยอดผิดอยู่ดี

## 6. Data & Service

**ไม่มีการเปลี่ยน schema ของ `Order`** — ใช้ `createdAt` เดิม `@default(now())` คงไว้

### 6.1 `createOrder` (`src/services/order.service.ts:74`)

- รับพารามิเตอร์ใหม่ `createdAt?: Date`
- ใส่ลง `orderDataBase` (`:209-226`) เมื่อมีค่า
- `formatOrderNo` (`:319`) และ `recordOrderEvent({ occurredAt: order.createdAt })` (`:329`) อ่านค่ากลับจากแถวที่ insert แล้ว จึงได้ค่าที่ถูกต้องโดยไม่ต้องแก้

### 6.2 `updateOrderContent` (`src/services/order.service.ts:419`)

- รับ `createdAt?: Date`
- เมื่อค่าต่างจากเดิม ในทรานแซกชันเดียวกัน:
  1. `update({ createdAt })`
  2. recompute + `update({ orderNo: formatOrderNo(publicToken, newCreatedAt) })` (§5.1)
  3. `recordOrderEvent({ type: 'ORDER_DATE_CHANGED', meta: { from, to } })` (§7)

### 6.3 ตรวจช่วงเวลา

`OrderDateOutOfWindowError` ใหม่ใน service (ไม่พึ่ง Valibot อย่างเดียว — fail-closed)
**ต้องมี catch ครบทั้ง `POST /api/orders` และ `PATCH /api/orders/[token]`** → 400 พร้อมข้อความไทย
(บทเรียน `feedback_service_error_route_mapping`: error ใหม่ที่ไม่มี route-catch = 500 ให้ผู้ใช้)

## 7. Activity Log (ต่อยอด feature 00031)

🛑 **`occurredAt` ของทุก event = เวลาจริงที่การกระทำเกิดขึ้น (`now`) เสมอ — ไม่ย้อนตามวันที่ที่ผู้ขายกรอก**
(มติ user 2026-08-06) ตรงกับที่ `schema.prisma:2733` นิยามไว้เอง: `occurredAt` คือเวลาที่ *เหตุการณ์* เกิดจริง
— เหตุการณ์คือ "มีคนกดสร้างออเดอร์" ซึ่งเกิดตอนนี้ ส่วน "วันที่ลูกค้าสั่ง" เป็นคุณสมบัติของ **ออเดอร์** ไม่ใช่ของเหตุการณ์
ประวัติคือหลักฐานว่าใครทำอะไรเมื่อไหร่ ถ้าย้อนตามค่าที่ผู้ใช้กรอกได้ มันก็ไม่ใช่หลักฐานอีกต่อไป

| เหตุการณ์ | `occurredAt` | `meta` |
|---|---|---|
| `ORDER_CREATED` | **เวลาจริงที่กดสร้าง (`now`)** | เมื่อวันที่ที่เลือก ≠ `now` เพิ่ม `orderedAt` = วันที่ที่เลือก (ISO) |
| `ORDER_DATE_CHANGED` *(ชนิดใหม่)* | เวลาจริงที่กดแก้ | `{ from, to }` (ISO ทั้งคู่) |

แสดงผลใน Activity Log — เวลาหลักคือเวลาจริง วันที่สั่งซื้อเป็นบรรทัดรอง:

> **สร้างคำสั่งซื้อ** — โดย ปรียา (แอดมิน)  ·  6 ส.ค. 2569 09:12 น.
> *ลงวันที่สั่งซื้อ 5 ส.ค. 2569 21:14 น.*

**ผลต่อโค้ด:** ปัจจุบัน `order.service.ts:329` ส่ง `occurredAt: order.createdAt` ซึ่ง "บังเอิญถูก" เพราะ `createdAt` เท่ากับ `now` อยู่แล้ว
เมื่อ `createdAt` ย้อนหลังได้ ค่านี้จะกลายเป็นผิดทันที → ต้องจับเวลาจริงไว้ต่างหาก (`const keyedInAt = new Date()` ก่อนเข้าทรานแซกชัน) แล้วส่ง `keyedInAt` แทน
เป็นจุดที่พังเงียบ ๆ ถ้าลืม — ไม่มี type error ไม่มีเทสเดิมจับ

**ไม่ยุบ `ORDER_DATE_CHANGED` เข้า `ORDER_EDITED`** เพราะการเลื่อนวันที่ย้ายยอดข้ามงวด — เป็นสิ่งที่ผู้ตรวจสอบต้องเห็นแยกจากการแก้ชื่อ/ที่อยู่

**งานที่ต้องทำเพิ่ม:** เพิ่มค่าใน `src/lib/order-event.ts` **และ** migration เขียนมือแก้ DB CHECK `OrderEvent_type_check`
(`schema.prisma:2711` เตือนไว้ว่าเป็น unmanaged SQL — ห้าม `prisma db pull` / `migrate dev`)

## 8. API

### `POST /api/orders` · `PATCH /api/orders/[token]`

เพิ่ม 1 key ใน `CreateOrderSchema` (`src/lib/validations.ts:292`) — body shape เดียวกันทั้งสอง route

```
createdAt?: IsoDateTimeWithOffset   // ISO 8601 พร้อม offset เช่น "2026-07-28T21:14:00+07:00"
```

- ใช้ validator `IsoDateTimeWithOffset` ตัวเดิม (นิยามที่ `validations.ts:1475` — schema นัดหมายใช้อยู่ที่ `:1546`, `:1566`) — **ต้องมี offset** ไม่รับ ISO ลอย ๆ ที่ตีความได้สองแบบ
- `route.ts:78` spread `{...parsed.output}` เข้า `createOrder` อยู่แล้ว → key นี้ไหลถึง service เอง
- ตรวจช่วง 90/7 ผ่าน `orderDateRejectReason()` ทั้งใน Valibot (`v.check`) และใน service

**Error ใหม่:** `400 ORDER_DATE_OUT_OF_WINDOW` — *"วันที่คำสั่งซื้อต้องอยู่ระหว่าง 90 วันย้อนหลังถึง 7 วันล่วงหน้า"*

## 9. UI

> 🛑 ต้องผ่าน `safepay-ux` Design Spec ก่อนเขียนโค้ด frontend (Hard Rule 8) — หัวข้อนี้คือ intent ไม่ใช่ spec สุดท้าย

### 9.1 Control (D-7 — ยุบไว้)

ค่าตั้งต้นแสดงเป็นแถวสรุปอ่านอย่างเดียว กด "เปลี่ยน" ถึงเปิดช่องกรอก
เหตุผล: ~95% ของการคีย์คือ "ตอนนี้" — ช่องที่โผล่ตลอดเวลาเพิ่มภาระสายตาให้ทุกคนเพื่อคนส่วนน้อย

```
┌──────────────────────────────────────────┐
│ วันที่สั่งซื้อ                             │
│ วันนี้ 6 ส.ค. 2569 09:12       [เปลี่ยน] │
└──────────────────────────────────────────┘
        ↓ กด "เปลี่ยน"
┌──────────────────────────────────────────┐
│ วันที่สั่งซื้อ                             │
│ ┌──────────────────────────┐             │
│ │ 05/08/2569  21:14      📅│  [ตอนนี้]   │
│ └──────────────────────────┘             │
│ ย้อนหลังได้ถึง 8 พ.ค. 2569               │
└──────────────────────────────────────────┘
```

### 9.2 Theme source

`input type="datetime-local"` + `.form-label` / `.form-input` ตามที่ `seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:78-90` ทำอยู่แล้ว
(**ไม่ใช้ Flatpickr** — ของเดิมในฟอร์มนี้ถูกถอดไปแล้ว และ `datetime-local` คือ pattern ที่ repo ใช้กับ "เวลาที่ผู้ใช้ระบุ")

Base: `theme/paces/Admin/TS/src/app/(admin)/forms/basic/` (form-label + form-input) — ผ่าน `AuctionTimeCard` ที่ copy มาแล้ว

การแปลงค่า: `datetime-local` ให้ค่าเป็นเวลาเครื่องผู้ใช้ → แปลงเป็น ISO **พร้อม offset** ก่อนส่ง (pattern เดียวกับ `AuctionForm.tsx:56-63`)

### 9.3 จุดที่ต้องมี (D-5)

| จุด | ไฟล์ | หมายเหตุ |
|---|---|---|
| เดสก์ท็อป POS | `orders/new/components/OrderCreateForm.tsx` | วางในบล็อกสรุปฝั่งขวา ใกล้ช่องทางขาย/การชำระ |
| มือถือ | `orders/new/components/QuickForm.tsx` | แถวเดียวกันในบล็อกสรุป |
| แชท (draft) | ผ่าน `OrderCreateForm` ตัวเดิม | + ชิป "ใช้เวลาจากข้อความ" |
| แก้ไขออเดอร์ | `(fullscreen)/orders/[token]/edit/page.tsx` | ใช้ `OrderCreateForm` ตัวเดิม โหลดค่าเดิมมาแสดง |

ทั้ง 4 จุดใช้ `OrderCreateForm` ตัวเดียวกัน — งานจริงคือเพิ่ม field เดียวใน form state แล้วเรนเดอร์ 2 layout

### 9.4 ท่อของแชท (D-4)

```
ChatThread.tsx:982  (กดค้างมือถือ)  ─┐
ChatThread.tsx:1788 (hover เดสก์ท็อป)─┴─→ openDraft({ …, messageCreatedAt: m.createdAt })
                                            ↓
                       DraftOrderProvider.tsx:41  OpenDraftInput  + messageCreatedAt?: Date
                                            ↓
                       OrderCreateForm  prop  prefillCreatedAt
```

`m.createdAt` **มีอยู่ในมือแล้วที่ทั้งสองจุด** (`ChatMessageView.createdAt`, `chat.service.ts:113`) แค่ถูกทิ้งตอนเรียก `openDraft`

- เติมค่าแล้วขึ้นชิป **"ใช้เวลาจากข้อความ"** พร้อมปุ่ม "ใช้เวลาตอนนี้แทน"
- ถ้าข้อความเก่ากว่า 90 วัน → ไม่เติม + ชิปเปลี่ยนเป็น *"ข้อความเก่าเกิน 90 วัน — ใช้เวลาปัจจุบัน"*
- ออเดอร์ยังไม่มี back-reference ไปยัง message id (`ChatThread.tsx:952-954`) — สเปกนี้ไม่เปลี่ยนเรื่องนั้น

### 9.5 ข้อกำหนดด้านภาพ

- สี primary ของ `(paces)` = **น้ำเงิน `#236dc9`** ไม่ใช่ม่วง `#7367F0` (ม่วง = buyer/Vuexy เท่านั้น — Hard Rule 7)
- ห้าม arbitrary Tailwind value — ใช้ `.form-input` / `.form-label` / `btn` / `badge` / `text-default-*` (Hard Rule 7)
- ห้าม emoji — ไอคอนปฏิทินใช้ `@iconify/react` tabler เท่านั้น (Hard Rule 12)
- วันที่ที่แสดงผลใช้ `formatDateTimeTH` จาก `src/lib/format-date.ts` เท่านั้น (convention `date-format.md`)
- toast ใช้ `pacesToast` เท่านั้น (Hard Rule 9)

## 10. เทส

### Unit (Vitest)

| ไฟล์ | เคส |
|---|---|
| `order-date-window.ts` | ขอบเขตพอดี −90d / +7d, เกินไป 1 วินาที, `NaN`, สตริงเพี้ยน, ข้ามเที่ยงคืนเวลาไทย |
| `order-no.ts` | 31 ธ.ค. 23:30 ICT → ต้องได้ปี พ.ศ. ถัดไป ไม่ใช่ปีเดิม (เดือน/ปีคิดใน tz ไทย) |

### Integration

- `POST /api/orders` พร้อม `createdAt` ย้อนหลัง → ตรวจ **4 ค่าพร้อมกัน**:
  `Order.createdAt` = ค่าที่ส่งไป · `Order.orderNo` = เดือนของค่าที่ส่งไป ·
  **`OrderEvent(ORDER_CREATED).occurredAt` ≈ `now` ไม่ใช่ค่าที่ส่งไป** (เทสนี้คือด่านเดียวที่จับข้อผิดนี้ได้ — §7) ·
  `meta.orderedAt` = ค่าที่ส่งไป
- `PATCH` เปลี่ยนวันที่ข้ามเดือน → `orderNo` ต้อง update ตาม + มี event `ORDER_DATE_CHANGED`
- `PATCH` บนออเดอร์ที่ไม่ใช่ `PENDING` → ปฏิเสธ
- ค่านอกช่วง → 400 ไม่ใช่ 500 (ทั้ง POST และ PATCH)

🛑 เทสห้ามมีคำสั่งลบข้อมูลแบบไม่ scope — ใช้ `deleteTestData({ userIds, shopIds })` เท่านั้น (Hard Rule 13)

### Browser QA

คีย์ออเดอร์ลงวันที่เมื่อวาน 21:30 แล้วตรวจว่ายอดตกวันที่ถูกครบทุกหน้า:
dashboard "วันนี้/เดือนนี้" · `/sales` · P&L `/expenses` · การ์ดสถิติ `/orders` · Command Center
และตรวจเคสข้ามเที่ยงคืน (ลงเวลา 00:30 น. — เคสที่ §5.3 เคยพัง)

## 11. นอกขอบเขต

- ไม่เพิ่มฟิลด์ `orderedAt` แยก (D-1)
- ไม่ย้อนวันที่ให้สต็อก / พัสดุ iShip / ค่าใช้จ่าย
- ไม่แตะทางสร้างออเดอร์ที่ไม่ผ่านฟอร์ม (booking / auction / iShip import)
- ไม่ผูก order กลับไปยัง message id ต้นทาง
- ไม่ทำสิทธิ์แยกว่าใครลงย้อนหลังได้ — ใครสร้างออเดอร์ได้ก็ลงย้อนหลังได้ (Activity Log บันทึกไว้ว่าใครทำ)

## 12. ลำดับงาน

1. เอกสาร feature `docs/20 - Features/00033 - Backdated Order Date/` ครบ 7 ไฟล์ตาม template (Hard Rule 11)
   — เทียบความครบด้วย `diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/00033 - Backdated Order Date/")` **ไม่ใช่นับจำนวนไฟล์**
2. PRD + BRD ให้ user รีวิวก่อน
3. `safepay-ux` Design Spec (Hard Rule 8)
4. Implementation: `order-date-window.ts` → migration เขียนมือแก้ CHECK `OrderEvent_type_check` (§7) → service → API → UI → §5.3 timezone fixes
   — 🛑 migration ทำงานเองตอน deploy (`vercel.json` รัน `prisma migrate deploy`) push `main` = ขึ้น prod; ฐาน local ยังต้อง apply เอง (Hard Rule 15)
5. Impeccable gate: `/impeccable critique` + `/impeccable clarify`
6. Reviewer grep gates + Browser QA

## 13. ไฟล์ประกอบ

- Mockup 3 จอ: `docs/superpowers/specs/2026-08-06-backdated-order-date-mockup.html`
