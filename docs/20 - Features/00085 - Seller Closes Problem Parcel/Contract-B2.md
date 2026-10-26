# 00085 — สัญญา (contract) ที่ล็อกก่อน batch B2 (T3 ∥ T4 ∥ T5)

ทุก agent ใช้ลายเซ็นนี้ตรงตัว ห้ามเปลี่ยนเอง — ถ้าจำเป็นต้องเปลี่ยน ให้หยุดและรายงาน Controller

## src/lib/iship/status.ts (T3)
- `holdsParcelProblem(code, problemAt, parcelClosed: boolean): boolean` — arg 3 **บังคับ**; `if (parcelClosed) return false` บรรทัดแรก
- `describeProgress(shipmentStatus, carrierStatus, audience, parcelClose: ParcelCloseOutcome | null)` — arg 4 **บังคับ** (ต่อท้ายพารามิเตอร์เดิมทั้งหมด). ปิดแล้ว ⇒ `notice` เปลี่ยนเป็น: seller tone 'neutral' ข้อความ `ปิดพัสดุแล้ว · {PARCEL_CLOSE_META[o].label}` · buyer tone 'warning' ข้อความ `PARCEL_CLOSE_META[o].buyerMessage` (ใช้ tone ที่ type notice รองรับจริง)

## src/lib/order-stage.ts (T3)
- `ShippingStageKey` += `'DELIVERY_FAILED'`; `ShippingStageInput.parcelClose: ParcelCloseOutcome | null` **บังคับ**
- `OrderStageKey` += `'DELIVERY_FAILED'`; `OrderStageInput.parcelClose: ParcelCloseOutcome | null` และ `problemClosedAt: Date | string | null` **บังคับ**
- `export function isActionableShippingStage(stage: ShippingStageKey): boolean` — false สำหรับ DONE, DELIVERY_FAILED, NOT_SHIPPING
- ผล A → `DELIVERY_FAILED` · ผล B → `DONE` (stage) / `DELIVERED` (order stage chip)

## src/lib/order-stage-sql.ts (T3)
- `buildProblemHoldSql(carrierStatus: string, problemAt: string, problemClosedAt: string): string`
- `StageSqlColumns.problemCloseOutcome: string` (นิพจน์ SQL ของคอลัมน์ เช่น `s."problemCloseOutcome"`)

## src/lib/iship/context.ts (T3)
```ts
export interface ParcelCloseViewJson {
  closedAt: string            // ISO
  closedByName: string | null // null = ไม่ทราบ/ถูกลบ → UI แสดง "ผู้ดูแลร้าน"
  reason: ParcelCloseReason
  note: string | null
  outcome: ParcelCloseOutcome
  basis: ParcelCloseBasis
  refunded: boolean | null
  excludesRevenue: boolean
}
ShipmentViewJson.problemClose: ParcelCloseViewJson | null   // ฝั่งร้านเท่านั้น
```
`toShipmentViewJson` / `ShipmentViewDates` รับคอลัมน์ problemClose* ดิบ แล้วประกอบ (closedByName ให้ T4 resolve จาก user ถ้าทำได้ราคาถูก ไม่งั้น null)

## Prisma select ที่ต้องเพิ่ม (T4)
ทุกที่ที่ select `problemAt` เพื่อคำนวณกอง ให้เพิ่ม `problemClosedAt: true, problemCloseOutcome: true` · ที่ประกอบ `ShipmentViewJson` เพิ่มทุกคอลัมน์ problemClose*
🛑 payload ผู้ซื้อ (`guest-order-data.ts`, `order-shipment-view.ts`) ได้แค่ `problemCloseOutcome` (ห้าม note/by/refunded/excludesRevenue)

## การแบ่งไฟล์ (ห้ามแตะไฟล์ของคนอื่น)
- **T3:** `src/lib/**` ตาม SDS §3.1 (+ เทส `order-stage.test.ts`, `__tests__/order-stage-sql.test.ts`, `src/services/__tests__/chat-problem-filter.test.ts`)
- **T4:** `src/services/**` + `src/app/**/page.tsx` + `guest-order-data.ts` ตาม SDS §3.2 (ยกเว้น parcel-close.service ใหม่ = T7)
- **T5:** `src/components/**` + `src/app/**/components/*.tsx` + `src/app/(marketing)/o/[token]/*.tsx` ยกเว้น guest-order-data.ts ตาม SDS §3.3 (เฉพาะร้อย prop / arg ใหม่ — ยังไม่มีปุ่ม)
