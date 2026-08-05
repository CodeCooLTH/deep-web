# Order Progress ในห้องแชท — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แชทที่มีออเดอร์ผูกอยู่แสดง progress พัสดุ — timeline ในการ์ดออเดอร์ (ทุกจอ) + แถบปักยุบ/กางใต้หัวเธรด (<1280px)

**Architecture:** reuse SSOT เดิมทั้งหมด (`SHIPMENT_STAGES`/`describeProgress`/`deriveShippingStage`/`ORDER_STAGE_META`/`courierLogoUrl`) — เพิ่ม shared `ShipmentStepper` 1 ตัวใช้ทั้งการ์ดและแถบปัก, ขยาย select ของ 3 จุดข้อมูลเดิม (getOrdersByCustomer / messages orderMap / thread page orderRows) ไม่มี query ใหม่

**Tech Stack:** Next.js 16 (paces route group), Preline/Tailwind 4, Vitest

## Global Constraints

- HR7: Paces primitive เท่านั้น — ห้าม arbitrary value (`text-[13.5px]` ฯลฯ); ค่า px ของ mockup ปัดเข้า scale แล้วตามตาราง ux spec
- HR9: toast = `pacesToast.success/warning` (top-right — เป็น action ปุ่ม ไม่ใช่ `pacesToast.chat.*`)
- HR12: ห้าม emoji — tabler icon ผ่าน `@/components/wrappers/Icon`
- Breakpoint ซ่อนแถบปัก = **`xl:hidden` (1280px)** ตรงกับ `CustomerPanel` ที่ใช้ `xl:block` (ตรวจแล้ว 2026-08-05 — ไม่ใช่ 1024)
- เงื่อนไข "ไม่มี stepper" = **`fulfillmentMode === 'NO_SHIPPING'`** ห้ามเช็ค `Order.type` (guard ใน `src/lib/iship/eligibility.ts:68-77`)
- ชิปสถานะในการ์ด **ไม่หมดอายุ** — เรียก `deriveOrderStage(order, Date.parse(statusAt))` ปิด age-decay (ต่างจากแถวลิสต์แชทโดยเจตนา)
- ใบ AWAITING_COD: stepper เขียวเต็ม (delivered จริง) + notice info "รอยืนยันรับเงินปลายทาง" กันงงว่าทำไมยังค้างในแถบ
- แถบกางเกิน ~4 ใบ → scroll ภายใน (`max-h-80 overflow-y-auto`)
- tsc = `node node_modules/typescript/lib/tsc.js --noEmit`
- Commit UI ต้องมี `Base:` (ShipmentStepper←`ShipmentStatusView.tsx`, OrderProgressBar←`ThreadStatusBar.tsx`)

---

### Task 1: `ShipmentStepper` — shared stepper component

**Files:**
- Create: `src/app/(paces)/seller/(chat)/_components/ShipmentStepper.tsx`

**Interfaces:**
- Produces: `ShipmentStepper({ shipmentStatus, carrierStatus, size })` — `size?: 'md' | 'sm'` (md=size-8 การ์ด, sm=size-5 แถบปัก); render `<ol>` 4 ขั้น + notice box; ไม่มี fetch/handler ใด ๆ (pure presentational)

- [ ] Step 1: copy โครง `<ol className="grid list-none grid-cols-4 ps-0">` + `STAGE_DOT`/`STAGE_LINE` + notice box จาก `ShipmentStatusView.tsx:58-70,287-337` มาเป็น component ใหม่ — param `size` คุม dot (`size-8`/`size-5`) และ icon (`text-base`/`text-xs`); label ใช้ `text-2xs` ทั้งคู่; current step = `font-semibold text-default-900`
- [ ] Step 2: tsc ผ่าน
- [ ] Step 3: commit `feat(chat): ShipmentStepper — stepper 4 ขั้นใช้ร่วมการ์ด/แถบปัก` + `Base: src/components/safepay/iship/ShipmentStatusView.tsx`

### Task 2: helper กรองใบค้าง + ชิป stage (pure, มีเทส)

**Files:**
- Create: `src/lib/chat-order-progress.ts`
- Test: `src/lib/__tests__/chat-order-progress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProgressOrderInput {
    status: string; paymentMethod?: string | null; codReceivedAt?: string | null
    shipment: { status: string; carrierStatus: string | null } | null
  }
  export function orderShippingStage(o: ProgressOrderInput): ShippingStageKey  // adapter → deriveShippingStage
  export function filterActiveOrders<T extends ProgressOrderInput>(orders: T[]): T[]  // stage !== 'DONE'
  export const STAGE_CHIP_CLS: Record<Exclude<ShippingStageKey,'DONE'>, string>  // bg-{tone}/15 text-{tone}-ink ตาม ORDER_STAGE_META convention
  ```

- [ ] Step 1: เขียนเทสก่อน (แดง): CANCELLED→DONE ถูกกรอง, PENDING ไม่มีพัสดุ→AWAITING_PARCEL, delivered+COD ยังไม่กดรับเงิน→AWAITING_COD (ยังอยู่), delivered โอนแล้ว→DONE ถูกกรอง, shipment PENDING (ยังสร้างไม่เสร็จ)→นับ hasShipment
- [ ] Step 2: implement (adapter แปลง shipment → `deriveShippingStage` input: `hasShipment: !!shipment && shipment.status !== 'FAILED'`)
- [ ] Step 3: `npx vitest run src/lib/__tests__/chat-order-progress.test.ts` เขียว + tsc
- [ ] Step 4: commit `feat(chat): helper กรองออเดอร์ค้างสำหรับแถบ progress ในแชท`

### Task 3: ขยาย data 3 จุด + types

**Files:**
- Modify: `src/services/order.service.ts` (`getOrdersByCustomer` select+map — เพิ่ม `orderNo, paymentMethod, codReceivedAt` + shipments select `courierCode, status, carrierStatus`)
- Modify: `src/app/api/chat/conversations/[id]/messages/route.ts:144-176` (orderMap — เพิ่ม `fulfillmentMode, paymentMethod, codReceivedAt` + shipments block เดียวกัน)
- Modify: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx:250-292` (orderRows select + panelOrders map)
- Modify: types — `CustomerPanel.tsx` (`CustomerPanelOrder`), `useSellerChatThread.ts` (`ChatOrderCard`), `OrderCardView.tsx` (`OrderCardViewData`)

**Interfaces:**
- Produces (shape เดียวทั้ง 3 ทาง — ล็อกก่อนขนาน):
  ```ts
  shipment?: { trackingNo: string | null; courierName: string | null
    courierCode: string | null; status: string; carrierStatus: string | null } | null
  fulfillmentMode: string            // ChatOrderCard/OrderCardViewData เพิ่มใหม่; CustomerPanelOrder มีแล้ว
  paymentMethod?: string | null      // ให้ AWAITING_COD ตัดสินได้
  codReceivedAt?: string | null
  statusAt: string                   // Order.updatedAt ISO — ให้ deriveOrderStage เรียกแบบปิด age-decay ได้
  ```

- [ ] Step 1: แก้ select/map ทั้ง 3 จุด (shape ตรงกันเป๊ะ — ดู one-value-many-entry-points)
- [ ] Step 2: ขยาย 3 type + จุด spread ที่ประกอบ data (`CustomerPanel.tsx:256-264` ส่ง `fulfillmentMode`/`paymentMethod`/`codReceivedAt` เข้า OrderCardView ด้วย)
- [ ] Step 3: tsc ผ่าน (type ใหม่บังคับ caller ครบเอง)
- [ ] Step 4: commit `feat(chat): ส่ง shipment progress fields เข้าการ์ดออเดอร์ครบ 3 ทางเข้า`

### Task 4: `OrderCardView` — section พัสดุ + timeline

**Files:**
- Modify: `src/app/(paces)/seller/(chat)/_components/OrderCardView.tsx` (แทนแถว "พัสดุ" เดิมบรรทัด 80-89)

**Interfaces:**
- Consumes: `ShipmentStepper` (T1), `courierLogoUrl` (`@/lib/iship/courier`), `deriveOrderStage`/`ORDER_STAGE_META` (`@/lib/order-stage`), `pacesToast`

ลำดับเงื่อนไขใน section (ตาม ux spec):
1. `status === 'CANCELLED'` → ชิป `bg-danger/15 text-danger-ink` icon `circle-x` "ยกเลิกแล้ว"
2. `fulfillmentMode === 'NO_SHIPPING'` → ชิปจาก `deriveOrderStage(order, now=statusAt)` (ไม่มี stepper)
3. `shipment != null` → ship-head (โลโก้ `size-8.5 rounded-lg object-contain` | fallback icon `truck-delivery` ใน `bg-default-100` + ชื่อขนส่ง `text-2xs text-default-700 truncate` + เลขพัสดุ `text-xs font-bold tabular-nums` + ปุ่มคัดลอก `btn btn-sm btn-icon` icon `copy` aria-label "คัดลอกเลขพัสดุ") + `<ShipmentStepper size="md" />` + ถ้า AWAITING_COD → notice `bg-info/15 text-info-ink` "รอยืนยันรับเงินปลายทาง"
4. ไม่มี shipment → ชิปจาก `deriveOrderStage` ("สั่งซื้อแล้ว" primary)

- [ ] Step 1: implement ตามลำดับข้างบน — copy handler จาก `ShipmentStatusView.tsx:181-190` (clipboard + pacesToast + fallback warning), `stopPropagation` บนปุ่มคัดลอก (การ์ด PENDING แตะแล้วเปิดโมดัลแก้ไข)
- [ ] Step 2: tsc ผ่าน
- [ ] Step 3: commit `feat(chat): timeline พัสดุ 4 ขั้นในการ์ดออเดอร์ (bubble + right panel)` + `Base:` ทั้ง ShipmentStatusView + paces badges

### Task 5: `OrderProgressBar` — แถบปักใต้หัวเธรด (<1280px)

**Files:**
- Create: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx`
- Modify: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` (render ใต้ `<ThreadStatusBar>` ~บรรทัด 1438; ข้อมูลจาก `customerPanelData.orders`)

**Interfaces:**
- Consumes: `filterActiveOrders`/`orderShippingStage`/`STAGE_CHIP_CLS` (T2), `SHIPPING_STAGE_LABEL` (`@/lib/order-stage`), `ShipmentStepper` (T1), `useDraftOrders`
- Produces: `OrderProgressBar({ orders, conversationId, customerName, channel, customerAvatar })` — คืน `null` เมื่อไม่มีใบค้าง

พฤติกรรม:
- ยุบ (ค่าตั้งต้นเสมอ, `useState(false)` ไม่ persist): `bg-primary/12 text-primary-ink rounded-lg px-3 py-2 text-sm` — icon `truck-delivery` + `{orderNo ?? token8} · {SHIPPING_STAGE_LABEL[stage]}` truncate + badge `+N` (`bg-card/60 text-2xs font-semibold`) + ปุ่ม chevron-down (aria-label "ดูสถานะออเดอร์ทั้ง N รายการ")
- กาง: `max-h-80 overflow-y-auto space-y-2` — การ์ดต่อใบ (`bg-card border-default-200 rounded-lg border px-3 py-2.5`): แถวบน `orderNo font-bold tabular-nums text-xs` + ชิป stage (`STAGE_CHIP_CLS` + `SHIPPING_STAGE_LABEL`) + ยอด `text-primary font-bold ms-auto`; ใบมีพัสดุ → `<ShipmentStepper size="sm" />` + บรรทัด `{courierName} · {trackingNo}` `text-2xs text-default-700`; ใบไม่มี → "ยังไม่ได้เปิดพัสดุ — สั่งซื้อเมื่อ {formatDateTime}" (`@/lib/format-date`); แตะการ์ด → `openDraft({ conversationId, customerName, channel, customerAvatar, kind: 'SHIPMENT', shipmentOrderToken: token })` (กลไกเดียวกับ `CustomerPanel.tsx:206-217`); ปิดท้ายปุ่ม "ย่อสถานะออเดอร์" (chevron-up)
- ทั้ง component ห่อ `xl:hidden` + วางใต้ ThreadStatusBar (alert ชนะ progress)

- [ ] Step 1: implement component + wire ใน ChatThread
- [ ] Step 2: tsc ผ่าน
- [ ] Step 3: commit `feat(chat): แถบสถานะออเดอร์ยุบ/กางใต้หัวเธรด (มือถือ/แท็บเล็ต)` + `Base: ThreadStatusBar.tsx`

### Task 6: Gates

- [ ] `node node_modules/typescript/lib/tsc.js --noEmit` = 0 error
- [ ] `npx vitest run` (เทสใหม่ + เดิมไม่แดง)
- [ ] grep gates: `rg "from ['\"]react-toastify" "src/app/(paces)/"` = 0 · emoji grep บนไฟล์ที่แตะ = 0 · `rg "text-\[|bg-\[rgba|rounded-\[|shadow-\[" <ไฟล์ที่แตะ>` = 0
- [ ] `safepay-reviewer` subagent ตรวจ (8-gate) → แก้ finding
- [ ] Impeccable CLI: `/impeccable critique` + `/impeccable clarify` บนงานนี้
- [ ] `npm run build` exit 0 (ระวัง: build ทับ .next ของ dev — แจ้ง user ตาม memory)
- [ ] Browser QA: ต้องมี dev server ที่ seller.deepth.local:4000 — ถ้าเวิร์กทรีนี้ไม่มี `.env.local` บันทึกเป็นหนี้ให้ user กดบน prod/dev เอง
