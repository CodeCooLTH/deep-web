---
title: "TestCase — 00085 ปิดพัสดุมีปัญหาโดยร้าน"
owner: shinobu22
status: draft
created: 2026-10-26
tags: [feature, testcase]
related: ["[[SRS]]", "[[SDS]]", "[[API]]"]
---

> **โมดูล:** 00085 · **เวอร์ชัน:** 1.0 · **วันที่:** 2026-10-26
> ข้อห้าม: เทสที่ใช้ DB ต้องปักหมุด `localhost` (HR13/14) และ scope ด้วย id ที่เทสสร้างเอง ห้าม `deleteMany()` เปล่า; `npm test` ในเครื่องต้อง override `DATABASE_URL` เป็นฐาน local

# TestCase

## 1. Pure (ไม่ใช้ DB)
ไฟล์ `src/lib/__tests__/parcel-close.test.ts`

| ID | กรณี | คาดหวัง | แดงเมื่อ (mutation) |
|---|---|---|---|
| T-DEC-1 | `decideLossPhase` ไม่มีหลักฐานเลย | A / `NONE` | เปลี่ยนค่าเริ่มต้นเป็น B |
| T-DEC-2 | `deliveredAt` มี | B / `DELIVERED_AT` | ถอดข้อ 1 |
| T-DEC-3 | มี event `delivered` แต่ `deliveredAt` ว่าง | B / `EVENT` (FR-PC-03) | ถอดข้อ 2 |
| T-DEC-4 | event `payment_success` | B / `EVENT` | ลบ payment_success ออกจากชุด |
| T-DEC-5 | `orderStatus='CONFIRMED'` ไม่มีอย่างอื่น | B / `ORDER_CONFIRMED` | ถอดข้อ 3 |
| T-DEC-6 | ลำดับ: มีทั้ง 3 | basis = `DELIVERED_AT` | สลับลำดับ |
| T-EXC-1 | ผล A × {COD, โอน} × refunded {null,true,false} | excludes = true ทุกแถว | A ตามค่า refunded |
| T-EXC-2 | B + COD | true | ใช้ `refunded` ตัดสินแทน COD |
| T-EXC-3 | B + โอน + `refunded=true` | true | กลับด้าน |
| T-EXC-4 | B + โอน + `refunded=false` | **false** | ตั้ง true ตลอด |
| T-EXC-5 | COD ทุกรูปแบบข้อความ (`cod`,`เก็บเงินปลายทาง`,`ชำระปลายทาง`) | ใช้ `isCODPayment` เดียวกับ stage | เขียน regex ซ้ำ |
| T-CAN-1 | ตารางครบ: dry-run · RETURN · ไม่ CREATED · ปิดแล้ว · order CANCELLED/RETURNED/DRAFTED · PICKUP/NO_SHIPPING · SERVICE_QUEUE · ไม่อยู่ PROBLEM | `code` ตรงทุกแถว | ลบ/สลับเงื่อนไขใดก็ได้ |
| T-CAN-2 | `carrierStatus='progress'` + `problemAt` (ค้างเหนียว) | `ok:true` | ลดเหลือ `=== 'issue'` (BRD FR-PC-01) |
| T-NEED-1 | `needsRefundAnswer` | ต่อเมื่อ B ∧ ไม่ COD เท่านั้น | ตัดเงื่อนไขใดทิ้ง |
| T-CON-1 | `hasParcelCloseConflict` A+delivered ใหม่ · A+issue เดิม · B+issue · B+return_success · `carrierStatusAt<=closedAt` | true/false/false/true/false | ถอดข้อเปรียบเวลา |
| T-VAL-1 | Valibot: OTHER ไม่มีโน้ต · 4 ตัว · 5 ตัว · 200 · 201 · reason แปลก | 400/400/pass/pass/400/400 | เปลี่ยนช่วง |
| T-FIN-1 | `resolveOutboundShippingCost` COD 360: ค่าส่ง 30 codFee 7.70 | `dropCodFee:true`→30 · `false`→37.70 | ไม่เคารพ `dropCodFee` |
| T-FIN-2 | ตัวอย่าง user ปลายทางครบ: ยอด 0 · cogs 0 · ค่าส่ง 30 ⇒ กำไร −30 | −30 (ไม่ใช่ −37.70) | ใช้ codFee |
| T-REV-1 | `countsAsRevenue`: A+CONFIRMED · A+SHIPPED(progress) · B-COD+CONFIRMED · B-refund+CONFIRMED | false ทั้งหมด | ลบเช็คปิด |
| T-REV-2 | B-โอน-ไม่คืน + SHIPPED + `issue` | **true** (FR-PC-08) | ลบสาขา OR ใหม่ |
| T-REV-3 | `revenueOrderWhere` มี `NOT` และสาขา OR ตามที่ประกาศ; `revenueWindowWhere`/`soldItemsWindowWhere` ร่วมกัน | โครงสร้างตรง | ถอด `NOT` |
| T-SOLD-1 | `countsAsSoldFor`: ปิดไม่นับ ⇒ false; ไม่ปิด ⇒ CONFIRMED เดิม | | ลืมเช็ค |
| T-SOLD-2 | source-grep: 3 หน้า (products ×2, categories) include `shipments` ใน query (F6) | | ลบ include |

อัปเดตเทสเดิม: `src/lib/order-stage.test.ts` (`holdsParcelProblem` ใส่ arg 3 ทุกเคส + ตารางปิดแล้ว) · `src/lib/order-revenue.test.ts:58-62` (OR ยาว 3) · `src/lib/__tests__/service-revenue.test.ts:58-60` (ยังผ่านเพราะ derive) · `src/lib/order-event.test.ts` (35 ค่า)

## 2. Parity TS↔SQL (ต้องใช้ DB local)
ไฟล์เดิม `src/lib/__tests__/order-stage-sql.test.ts` (`CAN_RUN` เมื่อ `DATABASE_URL` เป็น localhost เท่านั้น; ยิงแค่ `SELECT … VALUES`)
- เพิ่มแกน `problemCloseOutcome ∈ [null,'DELIVERY_FAILED','LOST_ON_RETURN']` ใน `Row`/`buildCorpus` (บรรทัด 79-110)
- **อย่าคูณเข้าคอร์ปัสเต็ม** (ใหญ่อยู่แล้ว) ทำคอร์ปัสแยกขนาดเล็ก: status × hasShipment × carrierStatus(ทุกค่า) × fulfillmentMode × payment{COD,TRANSFER} × problemAt{null,มี} × outcome
- 3 เคสที่ BRD บังคับ (ต้องชื่อชัดใน `it()`): **ปิด A** · **ปิด B** · **ปิดแล้วแต่สถานะขนส่งขยับต่อ** (A × `delivered`/`return`/`progress`; B × `issue`/`return_success`) ⇒ กองต้องไม่เปลี่ยน
- ยืนยันค่าที่คาด: A→`DELIVERY_FAILED` · B→`DONE` (ไม่ใช่ `AWAITING_COD` แม้ COD + `codReceivedAt` null) · `holdsParcelProblem`↔`buildProblemHoldSql` ตรงกันทุกแถว
- **แดงเมื่อ:** ย้ายสาขา "ปิดแล้ว" ไปไว้ใต้ RETURNED/PROBLEM · ลืมแก้ SQL ฝั่งเดียว · `NULL IN (...)` ในสาขาปิด
- `src/services/__tests__/chat-problem-filter.test.ts:93-94,132`: regex `buildProblemHoldSql\([^)]*carrierStatus[^)]*problemAt[^)]*\)` ต้องยังจับได้หลังเพิ่ม arg 3 และเพิ่มเคส `problemClosedAt`
- ตัวนับ=รายการ: `getShippingStageCounts` เทียบ `countShopOrdersByStage`/รายการตัวกรอง สำหรับใบปิดแล้ว = 0 ในชิป PROBLEM; ชิปแชท `state=problem` ไม่นับ; `enrichWithOrderStage` `problemOrderCount` ไม่นับ
- parity เงิน: `revenueOrderSql` (`agent-performance-sql.ts:60`) ↔ `revenueOrderWhere` ↔ `countsAsRevenue` บนคอร์ปัสเดียวกัน (F8)

## 3. Integration (service + DB local)
ไฟล์ `src/services/__tests__/parcel-close.service.test.ts` — สร้างร้าน/ออเดอร์/พัสดุของตัวเอง ลบตาม id

| ID | กรณี | คาดหวัง |
|---|---|---|
| I-1 | ปิด A (พัสดุ `issue`, ไม่มีหลักฐาน) | outcome A · basis NONE · 8 คอลัมน์ครบ · `Order.status` เดิม · OrderEvent `PARCEL_PROBLEM_CLOSED` 1 แถว มี actor |
| I-2 | ปิด B-COD | excludes=true · `refunded=null` |
| I-3 | ปิด B-โอน ไม่ส่ง `refunded` | `REFUND_ANSWER_REQUIRED` และ**ไม่มีแถวเปลี่ยน** |
| I-4 | ปิด B-โอน `refunded=false` | excludes=false |
| I-5 | ส่ง `refunded` ในกรณี A | ถูกทิ้ง = null |
| I-6 | `expectedOutcome` ไม่ตรง | `OUTCOME_CHANGED` ไม่เขียน |
| I-7 | ปิดซ้ำ | `ALREADY_CLOSED` |
| I-8 | ปิด 2 คำขอพร้อมกัน (Promise.all) | สำเร็จ 1 · 409 1 · event 1 แถว |
| I-9 | ระหว่างอ่านกับเขียน carrierStatus เปลี่ยนเป็น delivered | `NOT_IN_PROBLEM` ไม่เขียน |
| I-10 | ออเดอร์ CANCELLED / RETURNED / DRAFTED / PICKUP | `ORDER_FINISHED` / `NOT_SHIPPED_MODE` |
| I-11 | พัสดุ RETURN / dry-run / FAILED | `NOT_FORWARD` / `NOT_ACTIVE` |
| I-12 | ร้าน SERVICE_QUEUE (เรียก service ตรง) | `SERVICE_SHOP_UNSUPPORTED` |
| I-13 | พัสดุของร้านอื่น | `NOT_FOUND` (ไม่รั่วว่ามี) |
| I-14 | เลิกปิด → คอลัมน์ null ทั้ง 8 + event REOPENED; ปิดใหม่ได้ | |
| I-15 | เลิกปิดบน CANCELLED / ไม่ได้ปิด | `ORDER_FINISHED` / `NOT_CLOSED` |
| I-16 | **webhook/poll หลังปิด** ยิง `issue`,`progress`,`delivered`,`return` ผ่านตัวเขียน iShip (`iship.service`) และ Flash (`flash-status.service`) | กอง (`deriveShippingStage` + SQL) ไม่เปลี่ยน · คอลัมน์ปิดไม่ถูกแตะ · `problemAt`/`deliveredAt` write-once ยังทำงาน |
| I-17 | source-grep: ไม่มีตัวเขียน carrier ใด `update/updateMany` ใส่คีย์ `problemClose*` | |
| I-18 | GET preview ตรงกับผล POST ทุกกรณี (ใช้ `decideLossPhase` ตัวเดียว) | |
| I-19 | `getSalesSeries`: COD 360 / ค่าส่ง 30 / codFee 7.70 / ผล A ⇒ `values`=0 · `orderCounts`=0 · `cogsValues`=0 · `shippingValues`=30 · `shippingConfirmedValues`=30 · แถวยังอยู่ (ไม่ถูกตัด) | |
| I-20 | `getPnlReport` ร้านขายของ: ใบ A/B-COD ไม่อยู่ในยอดขาย; ไม่มีค่าส่งขาไปเพิ่ม (Q5) | |
| I-21 | cost-coverage / dashboard page / customer-directory `totalSpent` / agent-performance ไม่นับใบที่ปิด | |
| I-22 | `receivable.service` ไม่เปลี่ยนค่า (F5) | |
| I-23 | Trust Score / `cancelInitiator` / สิทธิ์รีวิว ไม่เปลี่ยนหลังปิด (BR-PC-41) | |

## 4. Route / สิทธิ์
ไฟล์ `src/app/api/seller/shipments/[id]/problem-close/__tests__/route.test.ts`

| ID | กรณี | คาดหวัง |
|---|---|---|
| R-1 | ไม่ล็อกอิน | 401 |
| R-2 | บทบาทไม่มี S1 (ทุกบทบาทที่ `can(...,'S1')` เป็น false) × 3 เมธอด | **403** |
| R-3 | ร้านบริการ (SERVICE_QUEUE) | 403 `NOT_ELIGIBLE` (F3) |
| R-4 | `?shopId=` เป็นร้านที่ไม่ได้เป็นสมาชิก | 403 ไม่ถอยไปใช้ร้าน active |
| R-5 | พัสดุของร้านอื่นแต่ session ร้านนี้ | 404 |
| R-6 | `mapParcelCloseError` ครอบทุก `code` ในตาราง API §4 (วนจาก union ของ code) | status ตามตาราง ไม่มี 500 |
| R-7 | body ผิด (OTHER ไม่มีโน้ต, โน้ต 4/201) | 400 |
| R-8 | `route-capabilities` ประกาศ route นี้ครบ 3 เมธอดเป็น `S1` | เทส declare-all เขียว |
| R-9 | ทุกคำตอบมี `cache-control: private, no-store` | |

## 5. UI / Browser QA (บังคับ — Chrome DevTools MCP / Playwright; 3 จอ มือถือ/แท็บเล็ต/เดสก์ท็อป)
- ปุ่มโผล่ที่หน้าคำสั่งซื้อ, โมดัลพัสดุในแชท, แผง Flash; ไม่โผล่เมื่อ: ไม่ใช่ PROBLEM · ปิดแล้ว · RETURN · dry-run · CANCELLED · ไม่มี S1
- modal: ผล A/B-COD/B-โอน ข้อความตรง FR-PC-02; ปุ่มยืนยันกดไม่ได้จนตอบคืนเงิน/โน้ตครบ; หมายเหตุประวัติไม่ครบ
- หลังปิด: ชิป "พัสดุมีปัญหา N" ที่ /orders และกล่องแชทลดลง = จำนวนแถวรายการ; ป้ายแถวแชทไม่แดง; ไทม์ไลน์ออเดอร์แสดงผู้ปิด/เวลา/เหตุผล/ผล
- หน้า `/o/[token]` ผู้ซื้อไม่ขึ้น "พัสดุมีปัญหา — ติดต่อร้านเพื่อตรวจสอบ"; DOM ไม่มี `closeNote`/`refunded`
- ไม่มี emoji (HR12) · `pacesToast` เท่านั้น (HR9: `rg "from ['\"]react-toastify" "src/app/(paces)/"` = 0)
- ไม่มี hook ใต้ early return ใน `ShipmentStatusView` (มีเทส `shipment-status-view-hooks.test.ts` เดิมคุม — ต้องผ่านต่อ)

## 6. ชุด mutation ที่ต้องแดง (ทำจริงก่อนปิดงาน — `mutation-silence-means-weak-corpus`)
1. ย้ายสาขา "ปิดแล้ว" ใต้ `isReturnedCarrierStatus` ⇒ parity/T-PAR แดง
2. ถอด arg 3 ของ `holdsParcelProblem` ให้คืนตามเดิม ⇒ T-CAN-2, ชิปแชท, parity แดง
3. ลืมแก้ SQL `buildShippingStageSql` ฝั่งเดียว ⇒ parity แดง
4. `resolveOutboundShippingCost` ไม่เคารพ `dropCodFee` ⇒ T-FIN-1/2, I-19 แดง (−37.70)
5. ถอด `NOT` ออกจาก `revenueOrderWhere` ⇒ T-REV-3, I-20/21 แดง
6. ถอดสาขา OR (B-โอน-ไม่คืน) ⇒ T-REV-2 แดง
7. server ไม่คำนวณ outcome ซ้ำ (เชื่อ `expectedOutcome`) ⇒ I-6 แดง
8. ลบ `carrierStatus` ออกจาก WHERE ของ conditional update ⇒ I-9 แดง
9. ใช้ `activeShopId` ของ session แทน `shipment.shopId` ⇒ R-4/R-5 แดง
10. ตั้ง `canManageParcel` ค่าตั้งต้น true ⇒ เทส UI แดง
11. `updateMany` ปิดแล้วเขียน `Order.status` ⇒ I-1/I-23 แดง
12. ลืมใส่ code ใหม่ใน `mapParcelCloseError` ⇒ R-6 แดง
13. ลบ `problemClosedAt` ออกจาก `NO_MONEY_SHIPMENT_KEYS` ⇒ เทส order-view-by-level แดง (stage ต่างบทบาท)
