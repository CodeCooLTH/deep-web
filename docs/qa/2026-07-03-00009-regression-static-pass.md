# A1 Regression — Static/Source-level PASS (feat 00009, หมวด L)

วันที่: 2026-07-03 · ผู้ตรวจ: Controller · วิธี: source-level verify (Read/grep) + tsc=0 + prod deploy READY (migration applied)
ขอบเขต: ปิด **residual risk ส่วนที่ verify ได้โดยไม่ต้องรัน server** ของ `order.service.ts` (S-5, live prod). ส่วน runtime E2E ยังค้าง (ต้อง dev server).

## ผลตรวจ (หมวด L — backward-compat blocking cases)

| TC | Invariant | หลักฐาน source | ผล |
|----|-----------|----------------|-----|
| **TC-DSP-98** | `deductStockForOrderItems` return `Map` ไม่ใช่ `Set`; call-site sync | `inventory-stock.service.ts:35` return `Promise<Map<string,{qty,resultingQty,name}>>`; single call-site `order.service.ts:144` ใช้ `.has()` (L149) + `for...of [productId,d]` (L159) | ✅ |
| **TC-DSP-99** | `restockFromCancelledOrder(tx, shopId, orderId)` param order ถูก | single call-site `order.service.ts:287` = `(tx, order.shopId, order.id)` ตรงลำดับ def `inventory-stock.service.ts:86-90` | ✅ |
| **TC-DSP-93** | non-ACTIVE createOrder → ไม่ deduct/ไม่ movement | `order.service.ts:142-145` `entitlement?.status === "ACTIVE" ? deduct : new Map()`; empty Map → `stockDeducted:null` ทุก item (L149) + `for...of` วน 0 รอบ (L159) → ไม่ insert. เหลือ 1 indexed lookup (มีตั้งแต่ 00003) | ✅ |
| **TC-DSP-94** | non-subscriber cancelOrder → no-op | `inventory-stock.service.ts:91-95` query `stockDeducted:{not:null}`; order ของ non-subscriber มี `stockDeducted=null` ทุก item → `items.length===0` short-circuit return ไม่มี movement | ✅ |
| **TC-DSP-97** | DIGITAL ไม่ถูกแตะแม้ shop=PRO | `inventory-stock.service.ts:53` `trackable = filter(type==='PHYSICAL' && stockQty!==null)` → DIGITAL ไม่เข้า deduct → ไม่มี entry ใน Map → ไม่มี movement | ✅ |
| **TC-DSP-92** | non-subscriber product form เหมือนเดิม (ไม่มี field 00009) | `ProductStockCardV2.tsx:86` `lowStockThreshold` render เฉพาะ `tracked && isProActive`; ทั้ง card gate ด้วย `entitlementActive` (ProductFormV2) → NOT_SUBSCRIBED ไม่เห็น field | ✅ |
| **TC-DSP-08/tsc** | breaking signature ทั้ง project compile | `tsc --noEmit` = 0 error บน merged tree; build compile+TS pass | ✅ |

**หลักประกันเชิงโครงสร้าง:** shop ที่ไม่มี `entitlement.status==='ACTIVE'` (majority ตอน launch) → path createOrder/cancelOrder **byte-identical กับ 00003** (deductions=empty Map, restock short-circuit) — zero-regression by construction ไม่ใช่แค่ผล test.

## ยังค้าง — Runtime E2E (ต้อง dev server รัน + session)
ปิดไม่ได้จาก source อย่างเดียว ต้องรันจริง:
- **TC-DSP-95 (blocking):** 00003 suite เต็ม TC-INV-01..73 (โดยเฉพาะ TC-INV-55..60 backward-compat)
- **TC-DSP-96:** `npm run e2e` เต็ม project
- **TC-DSP-92/93/94/97 (runtime confirm):** สร้าง/ยกเลิก order จริง + query DB `stockMovement` ยืนยัน 0 rows สำหรับ non-subscriber
- **TC-DSP-100:** rate-limit endpoint ใหม่ 429

**ทางปิด:** (A) user start dev server (`npm run dev -- -p 4000`) → Controller drive `safepay-qa` Chrome DevTools MCP + Prisma DB-query ที่ `seller.deepth.local:4000` (test acct `0000000001/123456`); หรือ (B) user manual happy-path บน prod (real seller account: create order tracked-product → เช็ค stock ลด + movement; non-subscribe shop create order ปกติ).
