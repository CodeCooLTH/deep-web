---
title: "Test Case — iShip Shipping Integration (เชื่อมระบบขนส่ง iShip)"
owner: shinobu22
status: draft
module: M00022-iShipShippingIntegration
version: "1.0"
created: 2026-07-26
tags: [feature, shipping, logistics, iship, seller, test, 00022]
related: ["[[PRD]]", "[[BRD]]", "[[DATABASE]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** 00022 — iShip Shipping Integration
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-26
> **สถานะ:** Draft — **เอกสารนี้เป็นแผนการทดสอบ ไม่ใช่รายงานผลทดสอบ** เขียนขึ้นก่อนมีโค้ด (doc-first ตาม Hard Rule 11) — ยังไม่มี SRS/SDS/API.md ของโมดูลนี้ ณ วันที่จัดทำ ดังนั้นชื่อ route/endpoint/env var บางจุดในเอกสารนี้เป็น **ข้อเสนอที่ต้องยืนยันซ้ำกับ SRS/SDS ก่อนเขียนโค้ดจริง** (ระบุไว้ชัดเจนทุกจุดที่เป็นสมมติฐาน)
> **เจ้าของเอกสาร:** QA (ดู [[Feature-Docs-Ownership]])

# Test Case: เชื่อมระบบขนส่ง iShip (iShip Shipping Integration)

---

## 1. Overview

ชุดทดสอบนี้ครอบคลุมฟีเจอร์ `00022 - iShip Shipping Integration` ทั้งเส้น — การเชื่อมต่อบัญชี, ค่าตั้งต้นของร้าน, การสร้างพัสดุ 3 โหมด, การพิมพ์ใบปะหน้า, การรับแจ้งสถานะ (webhook), การยกเลิก/เรียกรถเข้ารับ, มุมมองผู้ซื้อ, โหมดจำลอง (dry-run) และ regression ของฟีเจอร์เดิม

**เอกสารต้นทาง:** [[PRD]] (business goals/personas/journeys), [[BRD]] §2 (FR-ISHIP-001..061), §8 (BR-ISHIP-01..62) — ทุก TC ในเอกสารนี้ต้อง trace กลับรหัสเหล่านั้น. [[DATABASE]] เป็น schema ที่ freeze แล้ว ใช้เป็น ground truth ของโครงสร้างข้อมูลที่อ้างถึงในเคส

### 1.1 บริบทที่กำหนดรูปแบบชุดทดสอบทั้งฉบับ — 🛑 ไม่มี UAT sandbox

iShip **ไม่มีระบบทดสอบแยกจากระบบจริง** (PRD §4.2, BRD §7.2) — ทุกการเรียก API ที่ก่อค่าใช้จ่าย (เปิดพัสดุ, เรียกรถเข้ารับ) บนระบบจริงของ iShip **คือพัสดุจริงและเงินจริงทุกครั้ง** ไม่มีข้อยกเว้น ด้วยเหตุนี้ชุดทดสอบทั้งฉบับจึงถูกแบ่งเป็น **3 ชั้นที่ไม่เท่ากัน** (ดูรายละเอียดที่ §2) — ห้ามข้ามชั้นหรือรวมชั้น เพราะแต่ละชั้นมี "ต้นทุนความเสี่ยง" ต่างกันคนละระดับ

### 1.2 ขอบเขต (Scope)

**In-scope:**
- การเชื่อมต่อบัญชี iShip ระดับร้าน (Token, ทดสอบ/บันทึก, เปลี่ยน, ยกเลิก)
- การจำกัดสิทธิ์ตาม `Shop.vertical` (GENERAL เท่านั้น) และตาม role (OWNER vs STAFF)
- ค่าตั้งต้นของร้าน (ที่อยู่ผู้ส่ง, ขนส่ง/กล่อง/น้ำหนักเริ่มต้น, โหมด AUTO/ASK/OFF)
- การสร้างพัสดุจากออเดอร์ทั้ง 3 โหมด + เงื่อนไขข้าม/แจ้งเตือน + กันเปิดซ้ำ (idempotency)
- ความทนทานต่อความล้มเหลวของ iShip (BR-ISHIP-21 "ออเดอร์ต้องรอด")
- การพิมพ์ใบปะหน้า (เดี่ยว/หลายใบ) + ความปลอดภัยของ Token ระหว่างพิมพ์
- webhook รับสถานะจาก iShip + กฎห้ามแตะ `Order.status` อัตโนมัติ
- การยกเลิกพัสดุ + การเรียกรถเข้ารับ
- มุมมองผู้ซื้อบน `/o/{token}`
- โหมดจำลอง (dry-run) สำหรับ dev/QA
- regression ของร้านที่ไม่เชื่อมต่อ + ร้าน LODGING เดิม

**Out-of-scope (ตาม PRD §5):** ส่งต่างประเทศ, ส่งด่วนภายในวัน, การเปลี่ยนสถานะออเดอร์อัตโนมัติจากสถานะขนส่ง (ตั้งใจไม่ทำ — มีเคส negative ยืนยันว่า "ไม่ทำ" แทน), การจัดการเงิน/เติมเงิน iShip — ~~การเปรียบเทียบราคาข้ามขนส่งเต็มรูป~~ **ปิดแล้ว 2026-08-05** ดูเคสท้ายเอกสาร "ส่วนขยาย 2026-08-05"

### 1.3 สภาพแวดล้อม

| ชั้นทดสอบ | Environment | หมายเหตุ |
|---|---|---|
| Unit | local, ไม่ต้องมี dev server, ไม่ต้องมี network จริง | mock HTTP client ของ iShip ทั้งหมด (`nock`/`vi.fn()` ตาม pattern เดิมของโปรเจกต์ เช่น `graph.test.ts` ของ feature 00018) |
| E2E (dry-run) | `http://seller.deepth.local:4000` (Playwright), `http://deepth.local:4000` (buyer, สำหรับ TC กลุ่ม K) | ต้องตั้งค่าเซิร์ฟเวอร์เป็นโหมดจำลอง (ดู §2.2) — ห้ามรันกลุ่มนี้ถ้าเซิร์ฟเวอร์ไม่ได้อยู่ใน dry-run |
| Prod smoke (ครั้งเดียว) | `https://deepthailand.app` (seller subdomain จริง) | ของจริง เงินจริง — ทำตาม checklist §8 เท่านั้น ต้องขออนุญาต user ก่อนทุกครั้ง |

---

## 2. Test Level & Environment Convention (บังคับอ่านก่อนรันเคสใด ๆ)

### 2.1 นิยาม 3 ชั้น

| ชั้น | ใช้ตรวจอะไร | เครื่องมือ | ยิง iShip จริงไหม | ใครรันได้ / บ่อยแค่ไหน |
|---|---|---|---|---|
| **[Unit]** | mapping/idempotency-key generation/error-taxonomy/business-rule ล้วน — logic ที่แยก pure function ได้ | Vitest | **ไม่** (mock ทั้งหมด) | ทุกคน รันได้ไม่จำกัดครั้ง เป็นส่วนของ CI |
| **[E2E-dry-run]** | flow ทั้งเส้นผ่าน browser จริง (UI, session, DB persist, redirect) แต่ "ขั้นที่ก่อค่าใช้จ่ายจริง" (เปิดพัสดุ/เรียกรถ) ถูกสกัดด้วยโหมดจำลองฝั่งเซิร์ฟเวอร์ | Playwright | **ไม่** (BR-ISHIP-60: dry-run ต้องเปิดไม่ได้บน production — เพราะฉะนั้นชั้นนี้รันได้เฉพาะ dev เท่านั้น) | QA/dev รันซ้ำได้ไม่จำกัด เป็น regression suite |
| **[Prod-Smoke-Once]** | ว่า integration กับ iShip จริงทำงานจริง (ไม่ใช่แค่ mock ถูก) | manual, ตาม checklist §8 | **ใช่ — พัสดุจริง เงินจริง** | ทำ **ครั้งเดียวต่อรอบ release ใหญ่** เท่านั้น ต้องขออนุญาต user ก่อนทุกครั้ง (BR-ISHIP-62) แล้ว cancel ทันทีหลังตรวจ |

### 2.2 ข้อกำหนดของโหมดจำลอง (dry-run) ที่ E2E ชั้นนี้พึ่งพา

ตาม FR-ISHIP-060 / BR-ISHIP-60/61:
- ต้องมี server-side flag เปิดโหมดจำลองได้ (ชื่อ env var จริงรอยืนยันจาก SRS/SDS — สมมติฐานในเอกสารนี้คือ `ISHIP_DRY_RUN=1`)
- ต้อง**เปิดไม่ได้บน production** ไม่ว่ากรณีใด — TC-DRYRUN-01 (§3.12) เป็นเคส**บังคับต้องมี** ก่อนปล่อยใช้งาน
- คำสั่งที่ไม่ก่อค่าใช้จ่าย (ขอรายชื่อขนส่ง, เช็คราคา, ดูสถานะ) **ยังเรียก iShip จริงได้ตามปกติแม้อยู่ใน dry-run** — เพราะฉะนั้น E2E dry-run ที่ทดสอบหน้าตั้งค่าที่ต้องดึงรายชื่อขนส่งจริง อาจจำเป็นต้องมี "Token ทดสอบจริงของ iShip" ไว้ในบัญชี dev — เป็น dependency ภายนอกที่ต้องขอ user เตรียมไว้ก่อน (ไม่ใช่ mock)
- พัสดุที่เกิดใน dry-run ต้องมี `isDryRun=true` (ดู DATABASE §3.2) — ทุก TC ในชั้น E2E-dry-run ต้อง assert ค่านี้เป็น `true` เสมอเป็นส่วนหนึ่งของ expected result (ไม่ใช่แค่ "ทำงานได้")

### 2.3 คำสั่งรันมาตรฐาน

```bash
# Unit
npx vitest run src/lib/__tests__/iship-address-mapping.test.ts
npx vitest run src/services/__tests__/iship-*.test.ts
npm run test    # รันทั้งชุด

# E2E (dry-run เท่านั้น — Controller ต้องยืนยัน ISHIP_DRY_RUN=1 บน dev server ก่อนสั่ง)
npx playwright test e2e/iship-*.spec.ts
```

---

## 3. Test Scenarios

> ทุก TC ระบุ **ระดับเทส** ชัดเจน — [Unit] / [E2E-dry-run] / [Manual-dry-run] (ต้องใช้ตาเทียบ เช่น ดูว่าปุ่มไม่ปรากฏ ทำอัตโนมัติยาก) / [Prod-Smoke-Once] เคสที่ทำเครื่องหมาย 🛑 **BLOCKER** คือ **ห้าม merge ถ้าไม่ผ่าน**

### 3.1 กลุ่ม A — การเชื่อมต่อบัญชี iShip (Connection)

#### TC-CONN-01: บันทึก Token สำเร็จ (happy path)
- **Linked to:** FR-ISHIP-001, BR-ISHIP-11, BR-ISHIP-12
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** seller (OWNER) login แล้ว, ร้าน `vertical=GENERAL`, ยังไม่เคยเชื่อมต่อ iShip, มี Token ทดสอบจริงที่ใช้ได้ (ของบัญชี iShip dev — ดู §2.2)
- **Steps:**
  1. เข้าหน้าตั้งค่า → การ์ด "การจัดส่ง — iShip" → กด "เชื่อมต่อ"
  2. วาง Token ที่ใช้ได้จริง → กด "ทดสอบและบันทึก"
- **Expected Result:** ระบบเรียก endpoint ทดสอบ Token (เช่น รายชื่อขนส่ง) สำเร็จก่อนบันทึก; สถานะเปลี่ยนเป็น "เชื่อมต่อแล้ว"; DB มีแถว `ShopShippingAccount` ใหม่ (`status=ACTIVE`, `accessTokenEnc` เป็น ciphertext ไม่ใช่ plaintext, `tokenLast4` ตรงกับ 4 ตัวท้ายจริง); response body ของทุก request ที่เกี่ยวข้อง (ตรวจด้วย Chrome DevTools Network) **ไม่มี** field ที่เป็น token เต็ม

#### TC-CONN-02: บันทึก Token ผิด/หมดอายุ → ไม่บันทึก
- **Linked to:** FR-ISHIP-001, BR-ISHIP-11
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** เหมือน TC-CONN-01 แต่ใช้ Token ที่จงใจผิด/สุ่มขึ้นมา
- **Steps:** วาง Token ผิด → กด "ทดสอบและบันทึก"
- **Expected Result:** ขึ้นข้อความ error ที่เข้าใจได้ (ไม่ใช่ raw error จาก iShip); DB **ไม่มี** แถว `ShopShippingAccount` ใหม่เกิดขึ้นเลย (ตรวจด้วย Prisma query ตรง ไม่ใช่แค่ดูหน้าจอ)

#### TC-CONN-03: 🛑 **BLOCKER** — Token ไม่ปรากฏในทุก response ของ API
- **Linked to:** BR-ISHIP-12, FR-ISHIP-001 AC "คำตอบจากเซิร์ฟเวอร์ทุกเส้นทางต้องไม่มี Token"
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** เชื่อมต่อสำเร็จแล้ว (ต่อจาก TC-CONN-01)
- **Steps:** เปิด Chrome DevTools → Network tab → เรียกทุก endpoint ที่เกี่ยวกับ `ShopShippingAccount` (GET สถานะ, GET รายละเอียดตั้งค่า, ทุก mutation) → grep response body ทุกอันหา token pattern (ความยาว/prefix ของ Token จริงที่ใช้)
- **Expected Result:** **ไม่มี response ใดเลย** ที่มี token เต็มปรากฏ — มีแค่ `tokenLast4` (4 ตัวท้าย) เท่านั้น

#### TC-CONN-04: หน้าจอแสดงแค่ 4 ตัวท้ายของ Token
- **Linked to:** BR-ISHIP-13, FR-ISHIP-001 AC
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** หลังเชื่อมต่อสำเร็จ ดูการ์ดสถานะ
- **Expected Result:** ข้อความแสดงรูปแบบ "…xxxx" (4 ตัวท้ายจริง) เท่านั้น ไม่มีปุ่ม/ลิงก์ใดเปิดดู Token เต็มได้อีก

#### TC-CONN-05: เปลี่ยน Token ใหม่ทับของเดิม
- **Linked to:** FR-ISHIP-002, BR-ISHIP-14
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** เชื่อมต่อสำเร็จแล้วด้วย Token A
- **Steps:** กด "เปลี่ยน Token" → วาง Token B (ใช้ได้จริง) → บันทึก
- **Expected Result:** ต้องผ่านการทดสอบเหมือนตอนสร้างครั้งแรก (เรียก endpoint ทดสอบ Token ก่อนบันทึก); DB แถวเดิมถูก update (`accessTokenEnc`/`tokenLast4` เปลี่ยนเป็นของ Token B) ไม่สร้างแถวใหม่ซ้อน

#### TC-CONN-06: 🛑 **BLOCKER** — ยกเลิกการเชื่อมต่อแล้วประวัติพัสดุยังอยู่
- **Linked to:** FR-ISHIP-002, BR-ISHIP-15, DATABASE §3.5 (ไม่มี cascade ลบ OrderShipment)
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ร้านเชื่อมต่อแล้ว และมีพัสดุที่เคยสร้างสำเร็จอย่างน้อย 1 ใบ (dry-run) ผูกกับออเดอร์ที่มีอยู่
- **Steps:**
  1. จดเลขติดตามพัสดุที่มีอยู่ไว้
  2. ไปหน้าตั้งค่า → กด "ยกเลิกการเชื่อมต่อ" → ยืนยันใน Sweet Alerts
  3. กลับไปดูหน้ารายละเอียดออเดอร์เดิม
- **Expected Result:** `ShopShippingAccount` ของร้านนั้น**ถูกลบจริง** (ไม่ใช่ soft-delete — ตรวจด้วย query `findUnique` คืน `null`); แถว `OrderShipment`/`ShipmentEvent` เดิม **ยังอยู่ครบ** พร้อมเลขติดตามเดิม; ปุ่ม "พิมพ์ใบปะหน้า" ของพัสดุใบเดิม**หายไปหรือกดไม่ได้** (ไม่มี Token ให้เรียก iShip แล้ว) แต่เลขติดตามยังแสดงอยู่

#### TC-CONN-07: 🛑 **BLOCKER** — STAFF ตั้งค่า/วาง Token ไม่ได้
- **Linked to:** FR-ISHIP-001 AC, BR-ISHIP-03
- **ระดับเทส:** [E2E-dry-run] — seed user เป็น STAFF ผ่าน `e2e/helpers/auth.ts` (ต้องเพิ่มความสามารถ seed STAFF role ผูกกับ feature 00012 Shop Staff ถ้ายังไม่มี)
- **Precondition:** user เป็นพนักงานร้าน (STAFF) ของร้านที่ยังไม่เชื่อมต่อ iShip
- **Steps:** login เป็น STAFF → เข้าหน้าตั้งค่า iShip
- **Expected Result:** เห็นหน้าจอว่าเป็นสิทธิ์เจ้าของร้านเท่านั้น กดบันทึก/วาง Token ไม่ได้ (ปุ่ม disabled หรือไม่มีให้กด); ยิง mutation endpoint ตรง (bypass UI) ด้วย session STAFF → **ต้องได้ 403** ไม่ใช่แค่ UI ซ่อน

#### TC-CONN-08: iShip ปฏิเสธสิทธิ์ระหว่างใช้งาน → เปลี่ยนสถานะอัตโนมัติ
- **Linked to:** FR-ISHIP-002, BR-ISHIP-14
- **ระดับเทส:** [Unit] (mock iShip client คืน 401/403) + [Manual-dry-run] เสริม (ตั้งใจใช้ Token ที่ revoke ไปแล้วจริงถ้ามีบัญชีทดสอบสำรอง)
- **Steps (unit):** mock ให้ iShip client throw error รหัสสิทธิ์ไม่ผ่านตอนเรียก "สร้างพัสดุ" → เรียก service function
- **Expected Result:** `ShopShippingAccount.status` เปลี่ยนเป็น `TOKEN_INVALID`; มีการสร้าง flag/notification แจ้งร้าน; ออเดอร์ที่กำลังสร้างไม่ throw 500 ที่ผู้ใช้เห็น — ต้องเข้า flow "ออเดอร์ต้องรอด" (ดูกลุ่ม G)

---

### 3.2 กลุ่ม B — 🛑 ร้าน LODGING (ทั้งกลุ่มเป็น BLOCKER)

#### TC-LODGE-01: 🛑 **BLOCKER** — ร้าน LODGING ไม่เห็น UI ของ iShip เลย
- **Linked to:** FR-ISHIP-003, BR-ISHIP-01, BR-ISHIP-02
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** seed shop `vertical=LODGING` (feature 00017)
- **Steps:** login เป็น owner ร้าน LODGING → ไปหน้าตั้งค่า, หน้ารายละเอียดออเดอร์/การจอง, หน้ารายการออเดอร์
- **Expected Result:** ไม่มีการ์ด/เมนู/ปุ่ม/ข้อความใด ๆ ที่เกี่ยวกับ iShip ปรากฏในทั้ง 3 หน้า — ตรวจด้วย snapshot (`take_snapshot`) หา keyword "iShip"/"พัสดุ"/"ใบปะหน้า" ต้องไม่เจอ

#### TC-LODGE-02: 🛑 **BLOCKER** — ยิง API ตรงทุก endpoint ของ iShip ต้องได้ 403
- **Linked to:** BR-ISHIP-01, BR-ISHIP-02
- **ระดับเทส:** [E2E-dry-run] (ผ่าน Playwright `request` context เรียกตรง ไม่ผ่าน UI)
- **Precondition:** login เป็น owner ร้าน LODGING (มี valid session)
- **Steps:** เรียกทุก mutation/GET endpoint ของ iShip ตรง ๆ ด้วย session cookie ของร้าน LODGING (รายการ endpoint อ้างตาม API.md เมื่อมี — ระหว่างที่ยังไม่มี ให้ระบุ route ที่คาดว่าจะมีตาม FR: connect account, get status, set defaults, create shipment, print label, cancel shipment, request pickup, get tracking)
- **Expected Result:** **ทุก endpoint คืน 403** พร้อมข้อความ "ไม่มีสิทธิ์" — ไม่ใช่ 404/500; ไม่มีข้อมูลใดถูกสร้าง/แก้ไขใน DB จากการยิงเหล่านี้

#### TC-LODGE-03: 🛑 **BLOCKER** — createOrder ของร้าน LODGING ข้ามเงียบ ไม่ error
- **Linked to:** BR-ISHIP-23 (ส่วน LODGING), FR-ISHIP-003 AC "ขั้นตอนสร้างพัสดุอัตโนมัติต้องข้ามร้าน LODGING ทันที"
- **ระดับเทส:** [Unit]
- **Precondition:** mock order-creation hook ที่เรียก iship-order-hook logic ด้วยออเดอร์ประเภท BOOKING ของร้าน `vertical=LODGING`
- **Steps:** เรียก hook/service ที่ตัดสินใจสร้างพัสดุอัตโนมัติหลังบันทึกออเดอร์
- **Expected Result:** ฟังก์ชันคืนค่า "ข้าม" ทันที (early return) ไม่มีการเรียก iShip client แม้แต่ครั้งเดียว, ไม่ throw error, การจองสำเร็จตามปกติ (regression กับ feature 00017 — ดู TC-REG-04 ด้วย)

#### TC-LODGE-04: ร้านที่เชื่อมต่อแล้วสลับเป็น LODGING → ซ่อน+ปิด แต่ข้อมูลไม่หาย
- **Linked to:** BR-ISHIP-04, FR-ISHIP-003 AC
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ร้าน `vertical=GENERAL` เชื่อมต่อ iShip แล้ว มีพัสดุอย่างน้อย 1 ใบ
- **Steps:**
  1. เปลี่ยน `Shop.vertical` เป็น `LODGING` (ผ่าน mechanism ที่มีจริงของ feature 00017 — ถ้าไม่มี UI ให้เปลี่ยน ให้ทำผ่าน Prisma โดยตรงในเทส เพื่อจำลองสถานการณ์)
  2. เข้าหน้าตั้งค่า
- **Expected Result:** เมนู/การ์ด iShip หายไปทันที (เหมือน TC-LODGE-01); `ShopShippingAccount` ในตารางยัง**อยู่ครบ** (ตรวจด้วย query ตรง ไม่ผ่าน UI); สลับกลับเป็น `GENERAL` → เมนูกลับมาเหมือนเดิมพร้อมค่าตั้งต้นเดิมทุกอย่าง (ไม่ต้องตั้งค่าใหม่)

#### TC-LODGE-05: 🛑 **BLOCKER** — Unit test 403 ที่ระดับ authorization guard
- **Linked to:** BR-ISHIP-01, BR-ISHIP-02
- **ระดับเทส:** [Unit]
- **Steps:** เรียก authorization helper (คาดว่าเป็นฟังก์ชันรวมกลาง เช่น `assertShopCanUseShipping(shop)`) ด้วย shop object ที่ `vertical=LODGING`
- **Expected Result:** throw error ประเภทที่ route-catch แมปเป็น 403 (ดู memory `feedback_service_error_route_mapping` — ต้องมี route-catch ครอบทุก error type ใหม่)

---

### 3.3 กลุ่ม C — 🛑 BR-ISHIP-31 การจับคู่ที่อยู่กลับหัว (ทั้งกลุ่มเป็น BLOCKER)

> นี่คือความเสี่ยงระดับ "สูง" ที่สุดใน PRD §6.1 — ที่อยู่ผิดช่องจะทำให้พัสดุถึงผิดพื้นที่ทั้งระบบโดยไม่มีอะไรฟ้อง เพราะผ่านการตรวจสอบทุกด่าน (ค่าที่ส่งไปเป็นค่าจริงที่มีอยู่ใน DB แค่ไปคนละช่อง)

#### TC-ADDR-01: 🛑 **BLOCKER** — unit test บังคับ mapping ผู้รับ
- **Linked to:** BR-ISHIP-31, BR-ISHIP-32
- **ระดับเทส:** [Unit] — ไฟล์ต้องมี: `src/lib/__tests__/iship-address-mapping.test.ts`
- **Precondition:** `shippingAddress` ตัวอย่าง `{ line1: '123 ถ.สุขุมวิท', subdistrict: 'คลองตันเหนือ', district: 'วัฒนา', province: 'กรุงเทพมหานคร', postcode: '10110' }`
- **Steps:** เรียกฟังก์ชัน mapper ที่แปลง `Order.shippingAddress` → payload ของ iShip (เช่น `mapReceiverAddressToIship()`)
- **Expected Result:**
  - `payload.dst_district === 'คลองตันเหนือ'` (ต้องมาจาก `shippingAddress.subdistrict` — ตำบล)
  - `payload.dst_amphure === 'วัฒนา'` (ต้องมาจาก `shippingAddress.district` — อำเภอ)
  - **ถ้า mapper สลับกัน (ผลลัพธ์ตรงข้าม) เทสนี้ต้อง fail ทันที** — เขียนแบบ assert ค่าตายตัวไม่ใช่แค่ "ไม่ null"

#### TC-ADDR-02: 🛑 **BLOCKER** — unit test บังคับ mapping ผู้ส่ง (`ShopShippingAccount.sender*`)
- **Linked to:** BR-ISHIP-31, DATABASE §3.1 (`senderSubdistrict` → `src_district`, `senderDistrict` → `src_amphure`)
- **ระดับเทส:** [Unit] — ไฟล์เดียวกับ TC-ADDR-01
- **Steps:** เรียก mapper ฝั่งผู้ส่งด้วย `senderSubdistrict='บางรัก'`, `senderDistrict='บางรัก'` (ตั้งใจใช้ชื่อชนกันเพื่อจับบั๊กสลับช่องได้แน่นอน 100%)
- **Expected Result:** `payload.src_district === senderSubdistrict` เท่านั้น (ไม่ผสมกับ `src_amphure`) — ถ้า mapper สลับ ผลจะยังดูเหมือนถูกเพราะค่าเท่ากัน **จึงต้องมีอีก sub-case ที่ค่าไม่เท่ากันจริง** (เช่นเดียวกับ TC-ADDR-01) เพื่อกันเทสหลอกผ่าน

#### TC-ADDR-03: บังคับด้วยข้อมูลจริงจากชุดข้อมูลมาตรฐาน (ป้องกัน false-confidence จากข้อมูลสมมติ)
- **Linked to:** BR-ISHIP-31, PRD §9.2 (สมมติฐานว่าที่อยู่มาจากช่องค้นหามาตรฐาน)
- **ระดับเทส:** [Unit]
- **Steps:** ใช้ตัวอย่างที่อยู่จริงอย่างน้อย 3 ชุดจากชุดข้อมูลตำบล/อำเภอ/จังหวัดของระบบ (เช่น ที่ใช้ในหน้าเปิดออเดอร์) ยิงผ่าน mapper เดียวกัน
- **Expected Result:** ทุกชุด `dst_district`=ตำบลจริง, `dst_amphure`=อำเภอจริง ตรงกับชุดข้อมูลต้นทาง 100%

#### TC-ADDR-04: 🛑 **BLOCKER** — E2E ยืนยัน mapping ที่ปลายทางจริง (ผ่าน network request payload)
- **Linked to:** BR-ISHIP-31, BR-ISHIP-32
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** โหมด dry-run เปิดอยู่ แต่ payload ที่ "จะส่งไป iShip" ต้อง log/expose ไว้ให้ตรวจได้ (เช่น response ของ dry-run คืน payload ที่เตรียมส่งกลับมาด้วยเพื่อให้ QA ตรวจ)
- **Steps:** สร้างออเดอร์ที่มีที่อยู่ผู้รับครบ (ตำบล/อำเภอ/จังหวัดต่างกันชัดเจน) → กดสร้างพัสดุ (dry-run)
- **Expected Result:** payload เสมือนที่ระบบเตรียมส่ง (dry-run response) มี `dst_district`=ตำบลจริงของออเดอร์นั้น และ `dst_amphure`=อำเภอจริง — ตรวจด้วยตาเทียบค่าที่กรอกตอนสร้างออเดอร์ ไม่ใช่แค่ "ไม่ error"

---

### 3.4 กลุ่ม D — 3 โหมดการสร้างพัสดุ (AUTO / ASK / OFF)

#### TC-MODE-01: โหมด AUTO ยิงทันทีไม่ถาม
- **Linked to:** FR-ISHIP-020, BR-ISHIP-20 (ไม่ใช่ default แต่ต้องเลือกได้)
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ร้านเชื่อมต่อแล้ว, ตั้งค่าเริ่มต้นครบ (ที่อยู่ผู้ส่ง+ขนส่ง+กล่อง), `createMode=AUTO`
- **Steps:** สร้างออเดอร์ PHYSICAL ที่ที่อยู่ผู้รับครบผ่าน POS
- **Expected Result:** ออเดอร์บันทึกสำเร็จทันที; ไม่มีหน้าต่างถามใด ๆ; ภายในไม่กี่วินาทีหน้ารายละเอียดออเดอร์แสดงเลขติดตาม (dry-run) โดยที่ผู้ใช้ไม่ต้องกดอะไรเพิ่ม; `OrderShipment.isDryRun=true`

#### TC-MODE-02: โหมด ASK ขึ้น confirm และกดยกเลิก → ไม่เกิดพัสดุ
- **Linked to:** FR-ISHIP-021, BR-ISHIP-20 (default)
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** `createMode=ASK` (ค่าเริ่มต้น)
- **Steps:**
  1. สร้างออเดอร์ PHYSICAL ที่ที่อยู่ครบ
  2. เห็นหน้าต่าง Sweet Alerts สรุป (ขนส่ง/ผู้รับ/ที่อยู่/ขนาด/น้ำหนัก/COD/ราคาประมาณ)
  3. กด "ไม่ใช่ตอนนี้"
- **Expected Result:** ออเดอร์บันทึกสำเร็จอยู่แล้วก่อนหน้าต่างนี้ขึ้น (ไม่ block การบันทึกออเดอร์); หลังกดยกเลิก **ไม่มี** แถว `OrderShipment` ใดถูกสร้างใน DB เลย; หน้ารายละเอียดออเดอร์แสดงปุ่ม "สร้างพัสดุ" ให้กดย้อนหลังได้

#### TC-MODE-03: โหมด ASK — ปิดหน้าต่าง/รีเฟรชกลางคัน ต้องไม่เกิดพัสดุเอง
- **Linked to:** FR-ISHIP-021 AC "ปิดหน้าต่างหรือรีเฟรชหน้าระหว่างนั้น ต้องไม่เกิดพัสดุขึ้นมาเอง"
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** สร้างออเดอร์ → เห็นหน้าต่างยืนยัน → กด reload หน้าเว็บทันที (ไม่กดปุ่มใด ๆ ในหน้าต่าง)
- **Expected Result:** ไม่มี `OrderShipment` ถูกสร้าง; หน้ารายละเอียดออเดอร์ (หลัง reload) แสดงปุ่มสร้างพัสดุปกติ ไม่ค้างสถานะ "กำลังสร้าง"

#### TC-MODE-04: โหมด ASK — แก้ค่าก่อนยืนยันไม่กระทบค่าตั้งต้นของร้าน
- **Linked to:** FR-ISHIP-021 AC "แก้ไขได้ก่อนกดยืนยัน โดยไม่กระทบค่าตั้งต้นของร้าน"
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** สร้างออเดอร์ → ในหน้าต่างยืนยัน แก้น้ำหนักจากค่าเริ่มต้น 1kg เป็น 3kg → กดยืนยัน
- **Expected Result:** `OrderShipment.weight=3` (ค่าที่แก้); กลับไปดู `ShopShippingAccount.defaultWeight` **ยังเป็น 1** (ไม่เปลี่ยน)

#### TC-MODE-05: โหมด OFF ไม่ทำอะไร แต่กดสร้างเองได้
- **Linked to:** FR-ISHIP-022, BR-ISHIP-20
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** `createMode=OFF`
- **Steps:** สร้างออเดอร์ PHYSICAL ที่ที่อยู่ครบ → สังเกตว่าไม่มีอะไรเกิดขึ้น → เปิดหน้ารายละเอียดออเดอร์ → กด "สร้างพัสดุ" เอง
- **Expected Result:** ตอนสร้างออเดอร์ไม่มีหน้าต่างใด ๆ ขึ้น, ไม่มี `OrderShipment` ถูกสร้างอัตโนมัติ; กดปุ่มสร้างเองสำเร็จ ได้เลขติดตาม (dry-run)

#### TC-MODE-06: เปลี่ยนโหมดไม่มีผลย้อนหลัง
- **Linked to:** FR-ISHIP-012 AC "เปลี่ยนโหมดแล้วมีผลกับออเดอร์ที่สร้างหลังจากนั้นเท่านั้น"
- **ระดับเทส:** [E2E-dry-run]
- **Steps:**
  1. ตั้ง `createMode=OFF` → สร้างออเดอร์ A (ไม่มีพัสดุอัตโนมัติ, ยังไม่กดสร้างเอง)
  2. เปลี่ยน `createMode=AUTO`
  3. เปิดหน้ารายละเอียดออเดอร์ A อีกครั้ง
- **Expected Result:** ออเดอร์ A **ไม่** มีพัสดุถูกสร้างขึ้นย้อนหลังโดยอัตโนมัติจากการเปลี่ยนโหมด — ยังต้องกดสร้างเองเหมือนเดิม (โหมดใหม่มีผลกับออเดอร์ที่สร้าง**หลังจาก**เปลี่ยนเท่านั้น — สร้างออเดอร์ B ทดสอบว่า AUTO ทำงานให้)

---

### 3.5 กลุ่ม E — เงื่อนไขข้าม/แจ้งเตือน

#### TC-SKIP-01: NO_SHIPPING ข้ามเงียบ
- **Linked to:** BR-ISHIP-23, FR-ISHIP-023
- **ระดับเทส:** [Unit] + [E2E-dry-run] (ยืนยันไม่มี UI รบกวน)
- **Steps:** สร้างออเดอร์ `fulfillmentMode=NO_SHIPPING` ที่ร้านเชื่อมต่อแล้วโหมด AUTO
- **Expected Result:** ไม่มีหน้าต่าง/ข้อความใด ๆ ปรากฏ; ไม่มี `OrderShipment` ถูกสร้าง; ไม่มี log ระดับ error

#### TC-SKIP-02: BOOKING / DIGITAL / SERVICE / SUBSCRIPTION ข้ามเงียบ (4 sub-case)
- **Linked to:** BR-ISHIP-23, FR-ISHIP-023
- **ระดับเทส:** [Unit] (parametrized test 4 case) + [E2E-dry-run] อย่างน้อย 1 sub-case
- **Steps:** สร้างออเดอร์แต่ละประเภท (BOOKING, DIGITAL, SERVICE, SUBSCRIPTION) ที่ร้านเชื่อมต่อแล้วโหมด AUTO
- **Expected Result:** ทั้ง 4 ประเภทไม่มี `OrderShipment` ถูกสร้าง, ไม่มี error, ออเดอร์บันทึกสำเร็จปกติ

#### TC-SKIP-03: 🛑 ที่อยู่ผู้รับไม่ครบ → ต้องแจ้งพร้อมระบุช่องที่ขาด (ไม่ใช่เงียบ)
- **Linked to:** BR-ISHIP-24, BR-ISHIP-33, FR-ISHIP-023 AC "ต้องระบุว่าขาดช่องไหน"
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ร้านเชื่อมต่อแล้ว โหมด AUTO หรือ ASK
- **Steps:** สร้างออเดอร์ PHYSICAL ที่มีแค่ชื่อ+เบอร์ผู้รับ ไม่มีตำบล/รหัสไปรษณีย์
- **Expected Result:** ออเดอร์บันทึกสำเร็จ; หน้ารายละเอียดออเดอร์แสดงป้ายเตือนระบุชัดว่า "ยังไม่มี ตำบล, รหัสไปรษณีย์" (ระบุเป็นราย field จริง ไม่ใช่ข้อความรวม ๆ เช่น "ข้อมูลไม่ครบ") พร้อมปุ่ม/ลิงก์ไปแก้ที่อยู่; **ไม่ใช่การข้ามเงียบ** — ต้องมี UI element ปรากฏชัด

#### TC-SKIP-04: เติมที่อยู่ครบภายหลัง → ปุ่มสร้างพัสดุปรากฏ
- **Linked to:** BR-ISHIP-24, FR-ISHIP-022 (BRD Scenario C/2)
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ต่อจาก TC-SKIP-03
- **Steps:** แก้ที่อยู่ผู้รับให้ครบ (ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ผ่านช่องค้นหามาตรฐาน) → กลับไปดูหน้ารายละเอียดออเดอร์
- **Expected Result:** ป้ายเตือนหายไป เปลี่ยนเป็นปุ่ม "สร้างพัสดุ" กดได้ปกติ

#### TC-SKIP-05: Token ใช้ไม่ได้ / ยอดเงิน iShip ไม่พอ / iShip ตอบผิดพลาด → ต้องแจ้ง ไม่ใช่เงียบ
- **Linked to:** BR-ISHIP-24, FR-ISHIP-023 AC
- **ระดับเทส:** [Unit] (mock error code ของ iShip 3 แบบ: token invalid / insufficient balance / generic 5xx)
- **Steps:** เรียก service สร้างพัสดุ โดย mock client คืน error 3 แบบแยกกัน
- **Expected Result:** แต่ละแบบ map เป็นข้อความไทยที่ต่างกันและ "บอกวิธีแก้" (ไม่ใช่ error message เดียวทุกกรณี); `lastErrorCode`/`lastErrorMessage` บันทึกครบ; ไม่ throw ขึ้นไปจนออเดอร์ล้มเหลว (เชื่อมกับ BR-ISHIP-21 — ดูกลุ่ม G)

#### TC-SKIP-06: ข้อความ error ที่แสดงต่อผู้ใช้ต้องเป็นภาษาไทยที่เข้าใจ ไม่ใช่ raw error จาก iShip
- **Linked to:** BR-ISHIP-61 AC, FR-ISHIP-023 AC
- **ระดับเทส:** [E2E-dry-run] (บังคับ mock iShip response ให้คืน error message ภาษาอังกฤษ/รหัสดิบ ผ่าน dry-run injected-failure mode ถ้ามี หรือ [Unit] ถ้า UI-layer ยังไม่พร้อม)
- **Expected Result:** UI แสดงข้อความไทยที่แปลแล้วเท่านั้น; raw message เก็บใน `lastErrorMessage` (DB) สำหรับทีมงาน แต่ **ไม่โผล่ตรงบนหน้าจอผู้ใช้**

---

### 3.6 กลุ่ม F — Idempotency (กันเปิดพัสดุซ้ำ)

#### TC-IDEM-01: 🛑 **BLOCKER** — กดปุ่ม "สร้างพัสดุ" ซ้ำรัว ๆ ไม่เกิด 2 ใบ
- **Linked to:** BR-ISHIP-22, BR-ISHIP-26, FR-ISHIP-024
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ออเดอร์ที่ยังไม่มีพัสดุ, โหมด OFF (กดเอง)
- **Steps:** เปิดหน้ารายละเอียดออเดอร์ → คลิกปุ่ม "สร้างพัสดุ" รัว ๆ ติดกัน (เช่น double-click หรือยิง request ซ้ำผ่าน Playwright `Promise.all` ยิง 2 request พร้อมกัน)
- **Expected Result:** DB มี `OrderShipment` ที่ `status <> CANCELLED` **ได้แถวเดียวเท่านั้น** (พิสูจน์ผ่าน partial unique index — request ที่สองต้องได้ error/ผลลัพธ์ที่บอกว่า "มีพัสดุอยู่แล้ว" ไม่ใช่สร้างซ้ำ); ปุ่มต้อง disabled ระหว่างรอผลลัพธ์ (UI-level guard เป็นชั้นป้องกันเสริม ไม่ใช่ชั้นหลัก)

#### TC-IDEM-02: 🛑 **BLOCKER** — retry จากใบที่ FAILED ใช้ idempotencyKey เดิม
- **Linked to:** BR-ISHIP-26, DATABASE §3.2.1
- **ระดับเทส:** [Unit] — ตรวจ `idempotencyKey` ที่ generate ตอน retry เท่ากับตอนสร้างครั้งแรก (`<orderId>:<attemptGroup>` เดิม, `attemptGroup` ไม่ขยับ)
- **Steps:** สร้าง `OrderShipment` จำลอง `status=FAILED` ด้วย `idempotencyKey=<orderId>:1` → เรียกฟังก์ชัน "ลองใหม่"
- **Expected Result:** คำขอที่ยิงออกไปใหม่ (หรือแถวที่ update) ใช้ `idempotencyKey` เดิมทุกตัวอักษร — ไม่ generate key ใหม่

#### TC-IDEM-03: ยกเลิกแล้วเปิดใหม่ได้ (attemptGroup +1)
- **Linked to:** DATABASE §3.2.1 "attemptGroup เพิ่มขึ้นเมื่อพัสดุใบก่อนหน้าถูกยกเลิกเท่านั้น"
- **ระดับเทส:** [Unit] + [E2E-dry-run]
- **Steps:** สร้างพัสดุสำเร็จ (`idempotencyKey=<orderId>:1`) → ยกเลิก → สร้างพัสดุใบใหม่สำหรับออเดอร์เดียวกัน
- **Expected Result:** ใบใหม่มี `idempotencyKey=<orderId>:2`; ทั้งสองใบอยู่ใน DB ได้พร้อมกัน (ใบเก่า `status=CANCELLED`, ใบใหม่ `status=PENDING/CREATED`) — partial unique ไม่บล็อกเพราะ WHERE เงื่อนไข `status <> 'CANCELLED'`

#### TC-IDEM-04: 🛑 **BLOCKER** — partial unique บน DB ทำงานจริง (ไม่ใช่แค่ logic ชั้น service)
- **Linked to:** DATABASE §4, BR-ISHIP-22
- **ระดับเทส:** [Unit] (integration-level กับ DB จริงของ dev — ต้องต่อ `.env.local`) หรือทดสอบผ่าน migration test script
- **Steps:** insert `OrderShipment` 2 แถวตรง ๆ ผ่าน Prisma ให้ `orderId` เดียวกัน ทั้งคู่ `status='PENDING'` (ไม่ผ่าน service layer เลย — bypass application logic โดยตั้งใจ)
- **Expected Result:** แถวที่สอง**ต้อง throw unique constraint violation จาก DB เอง** (P2002) — พิสูจน์ว่าการป้องกันอยู่ที่ระดับฐานข้อมูลจริง ไม่ใช่แค่ application code ที่ bypass ได้

#### TC-IDEM-05: ส่งรหัสอ้างอิงออเดอร์ไปกับทุกคำขอ
- **Linked to:** BR-ISHIP-25
- **ระดับเทส:** [Unit]
- **Steps:** ตรวจ payload ที่ mapper เตรียมส่งให้ iShip ตอนสร้างพัสดุ
- **Expected Result:** มี field `custom_order_id` (หรือชื่อจริงตาม API iShip) เท่ากับ `idempotencyKey` เสมอ

---

### 3.7 กลุ่ม G — 🛑 ออเดอร์ต้องรอด (BR-ISHIP-21, ทั้งกลุ่มเป็น BLOCKER)

#### TC-RESIL-01: 🛑 **BLOCKER** — iShip timeout → createOrder ยังสำเร็จ
- **Linked to:** BR-ISHIP-21, FR-ISHIP-020 AC
- **ระดับเทส:** [Unit] (mock client ให้ hang เกิน timeout ที่กำหนด/throw timeout error)
- **Steps:** mock iShip client ให้ timeout ระหว่างเรียก "สร้างพัสดุ" ที่ผูกกับ order-creation flow โหมด AUTO → เรียก order creation service
- **Expected Result:** `Order` ถูกสร้างสำเร็จ (มี `id`, commit แล้ว) แม้การเรียก iShip จะ timeout; `OrderShipment.status=FAILED`, `lastErrorCode` ระบุ timeout; ไม่มี exception ใดหลุดขึ้นไปทำให้ endpoint สร้างออเดอร์คืน 5xx

#### TC-RESIL-02: 🛑 **BLOCKER** — iShip คืน 500 → createOrder ยังสำเร็จ
- **Linked to:** BR-ISHIP-21
- **ระดับเทส:** [Unit]
- **Steps:** mock iShip client throw 500 ระหว่างเรียกจาก order creation flow (AUTO)
- **Expected Result:** เหมือน TC-RESIL-01 — order สำเร็จเสมอ

#### TC-RESIL-03: 🛑 **BLOCKER** — iShip ล่มทั้งระบบ (connection refused) → สร้างออเดอร์ 12 รายการติดกัน ไม่มีรายการไหนหาย
- **Linked to:** BR-ISHIP-21, PRD §10.1 Scenario D
- **ระดับเทส:** [E2E-dry-run] (จำลองด้วย flag/env ที่ทำให้ dry-run "บังคับ fail" ทุกครั้ง — ต้องมีความสามารถนี้ในโหมดจำลองเพื่อทดสอบ resilience โดยเฉพาะ ถ้ายังไม่มีให้ทำเป็น [Unit] แทนชั่วคราวและ mark เป็น debt)
- **Steps:** ตั้งโหมด AUTO → สร้างออเดอร์ PHYSICAL ติดกัน 12 รายการ ขณะที่ iShip client ถูก mock ให้ fail ทุกครั้ง
- **Expected Result:** ทั้ง 12 ออเดอร์บันทึกสำเร็จ (นับจำนวนแถว `Order` ใหม่ = 12); ทั้ง 12 แถว `OrderShipment` มี `status=FAILED`; ไม่มีออเดอร์ใดหายหรือ duplicate

#### TC-RESIL-04: retry หลัง iShip กลับมา → สำเร็จทั้งหมด ไม่มีใบซ้ำ
- **Linked to:** BR-ISHIP-21, BR-ISHIP-26, PRD §10.1 Scenario D
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ต่อจาก TC-RESIL-03 (12 ใบ FAILED)
- **Steps:** เอา mock failure ออก (iShip "กลับมา") → เลือกทั้ง 12 รายการ → กด "ลองใหม่" ทีละใบหรือรวด
- **Expected Result:** ทั้ง 12 ใบเปลี่ยนเป็น `CREATED` มีเลขติดตาม; นับจำนวนแถว `OrderShipment` ทั้งหมดของ 12 ออเดอร์นี้ = **12 แถว** (ไม่ใช่ 24 — ไม่มีใบซ้ำจากการ retry)

---

### 3.8 กลุ่ม H — ใบปะหน้า (Label Printing)

#### TC-LABEL-01: พิมพ์เดี่ยว — ได้ไฟล์ A6
- **Linked to:** FR-ISHIP-030
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ออเดอร์ที่มีพัสดุ `status=CREATED` (dry-run)
- **Steps:** เปิดหน้ารายละเอียดออเดอร์ → กด "พิมพ์ใบปะหน้า"
- **Expected Result:** ได้เอกสาร (PDF/รูปภาพ) ขนาด A6; `OrderShipment.labelPrintedAt` อัปเดต, `labelPrintCount` +1; ป้าย "พิมพ์แล้ว" ปรากฏพร้อมเวลา

#### TC-LABEL-02: พิมพ์หลายใบพร้อมกัน + บอกรายการที่ถูกข้าม
- **Linked to:** FR-ISHIP-031
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** หน้ารายการออเดอร์มีอย่างน้อย 3 ออเดอร์: 1 มีพัสดุ CREATED, 1 ไม่มีพัสดุเลย, 1 มีพัสดุ CANCELLED
- **Steps:** เลือกทั้ง 3 (checkbox) → กด "พิมพ์ใบปะหน้าที่เลือก"
- **Expected Result:** ได้เอกสารรวม 1 ไฟล์ มีแค่ใบของออเดอร์ที่มีพัสดุ CREATED; มีข้อความ/สรุประบุชัดว่าอีก 2 รายการถูกข้ามและเพราะอะไร ("ไม่มีพัสดุ" / "พัสดุถูกยกเลิกแล้ว") — ไม่ใช่เงียบ

#### TC-LABEL-03: 🛑 **BLOCKER** — Token ไม่ปรากฏในเบราว์เซอร์เด็ดขาด (ตรวจด้วย Chrome DevTools)
- **Linked to:** FR-ISHIP-030 AC, BR-ISHIP-12
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** เปิด Chrome DevTools → Network tab → กดพิมพ์ใบปะหน้า → ตรวจทุก request/response ที่เกิดขึ้น (รวม request ไปยัง third-party ถ้ามี)
- **Expected Result:** ไม่มี request ใดจาก browser ยิงตรงไปยัง `*.iship.co`/domain ของ iShip เลย (ไฟล์ต้องออกผ่านระบบของเราเท่านั้น — proxy/download ผ่าน backend); ไม่มี token ปรากฏใน URL/header/body ของ request ใด ๆ ที่ browser ยิงออก

#### TC-LABEL-04: 🛑 คนนอกร้านขอไฟล์ไม่ได้แม้รู้ tracking number
- **Linked to:** FR-ISHIP-030 AC "เฉพาะเจ้าของ/พนักงานของร้านนั้นเท่านั้น"
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** มี seller ร้าน B ที่ไม่เกี่ยวข้อง (login เป็นคนละ session), รู้ tracking number ของพัสดุร้าน A (สมมติได้ยินมาจากลูกค้า)
- **Steps:** login เป็น seller ร้าน B → ยิง endpoint ขอไฟล์ใบปะหน้าตรง ๆ ด้วย `orderId`/`shipmentId` ของร้าน A (เดา/รู้ id)
- **Expected Result:** **403** — ต้องปฏิเสธด้วย ownership check ไม่ใช่แค่ hide ปุ่มที่ UI

#### TC-LABEL-05: พัสดุที่ยกเลิกแล้วพิมพ์ไม่ได้
- **Linked to:** FR-ISHIP-030 AC
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** พัสดุที่ยกเลิกแล้ว (`status=CANCELLED`)
- **Steps:** เปิดหน้ารายละเอียดออเดอร์ → พยายามพิมพ์ (ทั้งจาก UI ถ้ามีปุ่มหลงเหลือ และยิง endpoint ตรง)
- **Expected Result:** ปุ่มพิมพ์ไม่ปรากฏ/disabled; ยิง endpoint ตรงคืน error พร้อมเหตุผล (ไม่ใช่ 500)

#### TC-LABEL-06: พิมพ์ซ้ำได้ไม่จำกัดครั้ง
- **Linked to:** FR-ISHIP-030 AC, BR-ISHIP หมวดค่าใช้จ่าย (ไม่มีค่าใช้จ่ายเพิ่ม)
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** พิมพ์ใบเดิม 3 ครั้งติดกัน
- **Expected Result:** ทั้ง 3 ครั้งสำเร็จ; `labelPrintCount=3`; ไม่มีการเรียกสร้างพัสดุใหม่ (ยังใช้ `trackingNo`/`refCode` เดิม)

#### TC-LABEL-07: มีเพดานจำนวนต่อครั้งของการพิมพ์หลายใบ
- **Linked to:** FR-ISHIP-031 AC "มีเพดานจำนวนต่อครั้ง"
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** เลือกออเดอร์เกินเพดาน (ตัวเลขจริงรอ SRS ยืนยัน — สมมติฐานทดสอบที่ 51 ถ้าเพดาน=50)
- **Expected Result:** ระบบแจ้งจำนวนสูงสุดให้ทราบ ไม่ใช่ตัดรายการทิ้งเงียบ ๆ

#### TC-LABEL-08: บอกว่ารายการไหนถูกข้าม (ครอบซ้ำเพื่อยืนยันข้อความเจาะจง ไม่ใช่ generic)
- **Linked to:** FR-ISHIP-031 AC
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** ต่อจาก TC-LABEL-02 อ่านข้อความสรุปที่ระบบแสดง
- **Expected Result:** ข้อความระบุ**ชื่อ/รหัสออเดอร์**ที่ถูกข้ามแต่ละรายการพร้อมเหตุผลเฉพาะราย ไม่ใช่ตัวเลขรวม เช่น "ข้าม 2 รายการ" ลอย ๆ

---

### 3.9 กลุ่ม I — Webhook (การรับแจ้งสถานะจาก iShip)

#### TC-WH-01: ยิงซ้ำไม่ทำ timeline บวม (dedupeKey)
- **Linked to:** FR-ISHIP-041 AC, DATABASE §3.3 (`@@unique([shipmentId, dedupeKey])`)
- **ระดับเทส:** [Unit] + [E2E-dry-run] เสริม (ยิง webhook endpoint จริงด้วย `curl`/Playwright request context 2 ครั้งด้วย payload เดิม)
- **Steps:** ยิง webhook payload เดิม (status/occurredAt เดิม) 2 ครั้งติดกันไปยัง endpoint จริง
- **Expected Result:** ทั้งสองครั้งคืน 200 (idempotent จากมุมของ iShip); DB มี `ShipmentEvent` สำหรับ event นี้ **แถวเดียวเท่านั้น**

#### TC-WH-02: จับคู่ไม่ได้ให้ทิ้ง
- **Linked to:** FR-ISHIP-041 AC, BRD §4.3 Flow
- **ระดับเทส:** [Unit]
- **Steps:** ยิง webhook ที่ `trackingNo`/`refCode` ไม่ตรงกับ `OrderShipment` ใดในระบบเลย
- **Expected Result:** คืน 200 (ไม่ throw ให้ iShip เห็น error แล้ว retry วนซ้ำ); ไม่มี `ShipmentEvent` ใหม่เกิดขึ้น; มี log สำหรับตรวจสอบภายหลัง (ไม่ silent-fail แบบไม่มีร่องรอยเลย)

#### TC-WH-03: 🛑 **BLOCKER** — ห้ามเปลี่ยน `Order.status`
- **Linked to:** BR-ISHIP-41, FR-ISHIP-041 AC
- **ระดับเทส:** [Unit] + [E2E-dry-run]
- **Precondition:** ออเดอร์ `status` ปัจจุบันเป็นค่าใด ๆ (เช่น `PENDING`), มีพัสดุผูกอยู่
- **Steps:** ยิง webhook สถานะ "จัดส่งสำเร็จ/นำจ่ายแล้ว" (สถานะที่ดูเหมือนควรทำให้ออเดอร์ "สำเร็จ") เข้าระบบ
- **Expected Result:** `OrderShipment.carrierStatus`/`carrierStatusText` เปลี่ยนตามจริง; **`Order.status` ต้องไม่เปลี่ยนเลยแม้แต่ค่าเดียว** — เทียบค่า before/after ต้อง**เท่ากันเป๊ะ**; ถ้าสถานะคือ "ขนส่งรับของแล้ว" ให้มี flag/field ที่บอกว่า "เสนอเปลี่ยนเป็นจัดส่งแล้ว" รอร้านกดยืนยันเอง (ไม่ใช่เปลี่ยนให้)

#### TC-WH-04: ร้านกดยืนยันเปลี่ยนเป็น "จัดส่งแล้ว" เอง (ทางเลือกที่อนุญาต)
- **Linked to:** BR-ISHIP-43
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ต่อจาก TC-WH-03 ที่ระบบเสนอเปลี่ยนสถานะ
- **Steps:** ร้านกดปุ่ม "เปลี่ยนเป็นจัดส่งแล้ว" ที่ UI เสนอมา
- **Expected Result:** `Order.status` เปลี่ยนเป็น SHIPPED **เฉพาะตอนที่ร้านกดเอง** พร้อมบันทึกว่าใครกด — ไม่ใช่ automation

#### TC-WH-05: over-weight/over-size แสดงเตือน
- **Linked to:** BR-ISHIP-34, FR-ISHIP-041 AC "ขนส่งชั่งได้เกินที่ร้านแจ้งต้องแสดงให้ร้านเห็น"
- **ระดับเทส:** [Unit] + [E2E-dry-run]
- **Steps:** ยิง webhook payload ที่มีน้ำหนัก/ขนาดมากกว่าที่ `OrderShipment.weight/width/length/height` บันทึกไว้
- **Expected Result:** `isOverWeight`/`isOverSize=true`, `carrierPrice` อัปเดตถ้ามี; หน้ารายละเอียดออเดอร์แสดงคำเตือนชัดเจนว่ากระทบค่าส่งจริง

#### TC-WH-06: ที่อยู่รับแจ้งเดาไม่ได้ + ไม่เชื่อ payload โดยไม่ตรวจสอบ
- **Linked to:** BRD §11 OQ-1, DATABASE §8 DB-OQ-1
- **ระดับเทส:** [Unit] (blocked/pending จนกว่าจะรู้กลไก signature ของ iShip จริง — ดู Open Questions ท้ายเอกสารนี้)
- **สถานะ:** ⚠️ **รอคำตอบ OQ-1/OQ-2 ของ BRD** — endpoint path ต้องมี secret แบบเดาไม่ได้อย่างน้อย (path-based secret) เป็น minimum bar ถ้า iShip ไม่มีลายเซ็นจริง เขียนเคสละเอียดเพิ่มเมื่อ SRS ตอบคำถามนี้แล้ว

---

### 3.10 กลุ่ม J — ยกเลิกพัสดุ + เรียกรถเข้ารับ

#### TC-CANCEL-01: ยกเลิกพัสดุสำเร็จ
- **Linked to:** FR-ISHIP-050, BR-ISHIP-28
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** เปิดพัสดุ dry-run → กด "ยกเลิก" → ยืนยัน Sweet Alerts
- **Expected Result:** `status=CANCELLED`, `cancelledByUserId`/`cancelledAt` ถูกบันทึก; ปุ่มพิมพ์หายไป; ออเดอร์เปิดพัสดุใบใหม่ได้ทันที (ดู TC-IDEM-03)

#### TC-CANCEL-02: ยกเลิกไม่ได้เพราะรับของแล้ว → บอกตามตรง
- **Linked to:** FR-ISHIP-050 AC "ยกเลิกไม่ได้เพราะขนส่งรับของไปแล้ว"
- **ระดับเทส:** [Unit] (mock iShip client คืน error "already picked up")
- **Steps:** เรียก service ยกเลิกพัสดุที่ mock ให้ iShip ปฏิเสธเพราะรับของแล้ว
- **Expected Result:** `OrderShipment.status` **ไม่เปลี่ยน** (ยังเป็น CREATED); UI แสดงข้อความบอกตรงว่า "ต้องไปจัดการที่ iShip เอง" พร้อมเหตุผล ไม่ใช่ error ทั่วไป

#### TC-CANCEL-03: บันทึกผู้กระทำ (ยกเลิก)
- **Linked to:** BR-ISHIP-28
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** login เป็น STAFF ที่มีสิทธิ์สร้าง/ยกเลิกพัสดุ (ไม่ใช่ตั้งค่า Token — ตาม BR-ISHIP-03 STAFF ใช้งานได้แต่ตั้งค่า Token ไม่ได้)
- **Steps:** STAFF กดยกเลิกพัสดุ
- **Expected Result:** `cancelledByUserId` = userId ของ STAFF คนนั้นจริง ไม่ใช่ owner

#### TC-PICKUP-01: เรียกรถเข้ารับสำเร็จ
- **Linked to:** FR-ISHIP-051
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ที่อยู่ผู้ส่งตั้งครบแล้ว
- **Steps:** หน้าตั้งค่าการจัดส่ง → กด "เรียกรถเข้ารับ" → กรอกขนส่ง/จำนวนพัสดุ/หมายเหตุ → ยืนยัน Sweet Alerts
- **Expected Result:** `ShipmentPickup` แถวใหม่ `status=REQUESTED`, `isDryRun=true`; แสดงหมายเลขคำขอ (dry-run mock) และช่วงเวลาที่จะเข้ารับถ้ามี

#### TC-PICKUP-02: ยกเลิกคำขอเข้ารับที่ยังไม่ถูกดำเนินการ
- **Linked to:** FR-ISHIP-051 AC
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ต่อจาก TC-PICKUP-01 (`status=REQUESTED`)
- **Steps:** กด "ยกเลิกคำขอเข้ารับ"
- **Expected Result:** `status=CANCELLED`, `cancelledAt` บันทึก

#### TC-PICKUP-03: เรียกรถระดับร้าน ไม่ใช่ระดับออเดอร์ (รับได้หลายกล่อง)
- **Linked to:** BR-ISHIP-51 (Business Flow §3.7 "เรียกครั้งเดียวรับได้หลายกล่อง")
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** ตรวจว่าปุ่มเรียกรถอยู่ที่หน้าตั้งค่าการจัดส่ง ไม่ใช่หน้ารายละเอียดออเดอร์
- **Expected Result:** ไม่มีปุ่มเรียกรถในหน้ารายละเอียดออเดอร์เลย; หน้าตั้งค่ามีช่องกรอก `parcelCount` แยกจากออเดอร์ใด ๆ

#### TC-PICKUP-04: บันทึกผู้กระทำ (เรียก/ยกเลิกเข้ารับ)
- **Linked to:** BR-ISHIP-28
- **ระดับเทส:** [E2E-dry-run]
- **Expected Result:** `createdByUserId` ของ `ShipmentPickup` ตรงกับผู้กด

---

### 3.11 กลุ่ม K — ผู้ซื้อ (`/o/{token}`)

#### TC-BUYER-01: เห็น tracking + ชื่อขนส่งเมื่อมีพัสดุ
- **Linked to:** FR-ISHIP-042
- **ระดับเทส:** [E2E-dry-run] (buyer subdomain `http://deepth.local:4000`)
- **Precondition:** ออเดอร์มีพัสดุ `status=CREATED` (dry-run)
- **Steps:** เปิด `/o/{token}` ของออเดอร์นั้นแบบ guest (ไม่ login)
- **Expected Result:** เห็นชื่อขนส่งและเลขติดตาม กดคัดลอกได้ (ตรวจ clipboard หรือ UI feedback "คัดลอกแล้ว")

#### TC-BUYER-02: 🛑 ไม่เห็นข้อมูลภายในของร้าน
- **Linked to:** FR-ISHIP-042 AC "ไม่เห็นที่อยู่ผู้ส่ง/ราคา/error ดิบ"
- **ระดับเทส:** [E2E-dry-run] — ตรวจทั้ง visual และ RSC flight payload (ตาม memory `feedback_rsc_pii_neutralize_at_source` — ต้อง view-source/network ไม่ใช่แค่ดูตา)
- **Steps:** เปิด `/o/{token}` → ตรวจ DOM + view page source + network response (ไม่ใช่ React DevTools ธรรมดา เพราะข้อมูลอาจซ่อนด้วย CSS แต่ยัง serialize อยู่ใน HTML/flight)
- **Expected Result:** ไม่มี `senderSnapshot`/`carrierPrice`/`lastErrorMessage`/`accessTokenEnc` ปรากฏใน HTML source หรือ network response ใด ๆ ที่ browser ของผู้ซื้อได้รับ

#### TC-BUYER-03: ยังไม่มีพัสดุ → ไม่แสดง section เลย (ไม่ใช่ช่องว่าง)
- **Linked to:** FR-ISHIP-042 AC
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ออเดอร์ที่ยังไม่มีพัสดุ (โหมด OFF ยังไม่กดสร้าง)
- **Steps:** เปิด `/o/{token}`
- **Expected Result:** ไม่มี heading/section "การจัดส่ง" ปรากฏเลยในหน้า (ไม่ใช่แสดง section เปล่า ๆ ที่บอกว่า "ยังไม่มีข้อมูล")

#### TC-BUYER-04: หลังพัสดุถูกสร้าง → section ปรากฏแบบ realtime หรือหลัง refresh
- **Linked to:** FR-ISHIP-042
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** เปิด `/o/{token}` ค้างไว้ (ยังไม่มีพัสดุ) → อีกแท็บฝั่ง seller กดสร้างพัสดุ → กลับมา refresh หน้า buyer
- **Expected Result:** section ปรากฏพร้อมข้อมูลถูกต้องหลัง refresh (ไม่บังคับต้อง realtime ถ้า SRS ไม่ได้ระบุไว้ — ถ้า SRS ระบุ realtime ต้องปรับเคสนี้)

---

### 3.12 กลุ่ม L — โหมดจำลอง (dry-run)

#### TC-DRYRUN-01: 🛑 **BLOCKER** — เปิด dry-run บน production ไม่ได้
- **Linked to:** BR-ISHIP-60, FR-ISHIP-060 AC
- **ระดับเทส:** [Unit] (ตรวจ config-loading logic โดยตรง: ถ้า `NODE_ENV=production` หรือ `VERCEL_ENV=production` แล้วพยายามตั้ง flag dry-run → ต้อง throw/force-false เสมอ ไม่ใช่ผ่านค่าที่ env ตั้งมา)
- **Steps:** เรียกฟังก์ชันอ่านค่า config dry-run โดย mock `process.env` ให้ `NODE_ENV=production` และตั้ง dry-run flag เป็น true พร้อมกัน
- **Expected Result:** ฟังก์ชันคืนค่า dry-run = **false เสมอ** ไม่ว่า env var จะตั้งเป็นอะไรก็ตาม เมื่ออยู่ใน production — ต้องพิสูจน์ว่าเป็น hard-code guard ไม่ใช่ documentation-only

#### TC-DRYRUN-02: 🛑 พัสดุจำลองมีเครื่องหมายกำกับ ทั้ง DB และหน้าจอ
- **Linked to:** BR-ISHIP-61
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** สร้างพัสดุ dry-run → เปิดหน้ารายละเอียดออเดอร์
- **Expected Result:** `OrderShipment.isDryRun=true` ใน DB; UI มี badge/label ชัดเจน (เช่น "พัสดุจำลอง") ไม่ปนกับพัสดุจริงจนแยกไม่ออก

#### TC-DRYRUN-03: 🛑 dry-run ไม่ปนสถิติ
- **Linked to:** DATABASE §6 "isDryRun=true ต้องกรองออกจากสถิติทุกชนิด"
- **ระดับเทส:** [Unit]
- **Steps:** สร้างข้อมูลผสม (พัสดุจริง N ใบ + dry-run M ใบ) → เรียกฟังก์ชันคำนวณ KPI ใด ๆ ที่เกี่ยวข้อง (เช่น "อัตราสร้างพัสดุสำเร็จรอบแรก" ตาม PRD §1.2 ถ้ามี implement)
- **Expected Result:** ตัวเลขคำนวณจาก N เท่านั้น ไม่รวม M

#### TC-DRYRUN-04: คำสั่งที่ไม่ก่อค่าใช้จ่ายยังเรียกจริงได้แม้อยู่ใน dry-run
- **Linked to:** FR-ISHIP-060 AC
- **ระดับเทส:** [Manual-dry-run] (ต้องมี Token จริงของบัญชี iShip dev — ดู §2.2)
- **Steps:** เปิด dry-run บน dev → เข้าหน้าตั้งค่า → ดูรายชื่อขนส่งที่ดึงมา
- **Expected Result:** รายชื่อขนส่งเป็นข้อมูลจริงจากบัญชี iShip dev (ไม่ใช่ mock/placeholder) แม้อยู่ใน dry-run mode

---

### 3.13 กลุ่ม M — Regression

#### TC-REG-01: ร้านที่ไม่เชื่อม iShip — POS ใช้งานได้ปกติ
- **Linked to:** DATABASE §5.5 "ร้านที่ไม่เชื่อมต่อ iShip — ไม่มีผลกระทบ"
- **ระดับเทส:** [E2E-dry-run]
- **Precondition:** ร้าน `vertical=GENERAL` ที่ไม่เคยเชื่อมต่อ iShip เลย
- **Steps:** เปิดออเดอร์ผ่าน POS ปกติทุกขั้นตอน
- **Expected Result:** ไม่มีความช้าลง/error ใด ๆ ที่เกี่ยวกับ iShip; ไม่มีหน้าต่าง/ป้ายใด ๆ ของ iShip ปรากฏเลย (เพราะไม่มี `ShopShippingAccount`)

#### TC-REG-02: ร้านที่ไม่เชื่อม iShip — หน้ารายละเอียดออเดอร์ + รายการออเดอร์ปกติ
- **Linked to:** DATABASE §5.5
- **ระดับเทส:** [E2E-dry-run]
- **Expected Result:** หน้าทั้งสองแสดงผลเหมือนก่อนมีฟีเจอร์นี้ทุกประการ (visual regression เทียบ baseline ถ้ามี snapshot เดิม)

#### TC-REG-03: ร้าน LODGING — การจองปกติไม่กระทบ (ครอบซ้ำกับ TC-LODGE-03 มุม regression)
- **Linked to:** DATABASE §5.5 "ร้าน LODGING — ไม่มี"
- **ระดับเทส:** [E2E-dry-run]
- **Steps:** ร้าน LODGING สร้างการจองห้องพักปกติ (feature 00017 flow เดิม)
- **Expected Result:** flow การจองทำงานเหมือนก่อนมีฟีเจอร์ 00022 ทุกจุด รวมความเร็ว

#### TC-REG-04: migration ไม่กระทบ `Order`/`Shop` เดิม (schema-level regression)
- **Linked to:** DATABASE §5.1 "additive ล้วน ไม่แตะตารางเดิม"
- **ระดับเทส:** [Unit] — เขียน test ยืนยันว่า query เดิมที่มีอยู่ (เช่น `order.service.ts` ปัจจุบัน) ยัง compile และ pass โดยไม่ต้องแก้โค้ดจากการเพิ่ม schema นี้
- **Expected Result:** unit test suite เดิมของ `order.service`/`shop.service` (ก่อนมีฟีเจอร์นี้) ยัง**ผ่านทั้งหมดโดยไม่แก้โค้ด** หลัง apply migration

---

## 4. Playwright Spec ที่ต้องเขียน (`e2e/`)

| ไฟล์ | ครอบคลุม TC | หมายเหตุ |
|---|---|---|
| `e2e/iship-connection.spec.ts` | TC-CONN-01..07 | ต้อง extend `e2e/helpers/auth.ts` ให้ seed OWNER/STAFF ของร้าน GENERAL ที่ยังไม่เชื่อมต่อ + seed ร้านที่เชื่อมต่อแล้ว (mock/fixture token) |
| `e2e/iship-lodging-scope.spec.ts` | TC-LODGE-01, 02, 04 | seed shop `vertical=LODGING`; ใช้ Playwright `request` context ยิง API ตรงสำหรับ TC-LODGE-02 |
| `e2e/iship-order-create-modes.spec.ts` | TC-MODE-01..06 | ครอบ AUTO/ASK/OFF ผ่าน POS flow จริง |
| `e2e/iship-skip-conditions.spec.ts` | TC-SKIP-01..04 (unit ครอบ 02/05/06 เพิ่มด้วย) | |
| `e2e/iship-idempotency.spec.ts` | TC-IDEM-01, 03 | ใช้ `Promise.all` ยิง 2 request พร้อมกันสำหรับ TC-IDEM-01 |
| `e2e/iship-resilience.spec.ts` | TC-RESIL-03, 04 | ต้องมีความสามารถ "บังคับ dry-run fail" — ประสานกับ dev เพิ่ม flag ถ้ายังไม่มี |
| `e2e/iship-label-print.spec.ts` | TC-LABEL-01, 02, 03, 04, 05, 06, 08 | TC-LABEL-03 ต้องใช้ `list_network_requests`/Playwright network interception ตรวจ request ไป iShip domain |
| `e2e/iship-webhook.spec.ts` | TC-WH-01, 03, 04, 05 (ยิงผ่าน Playwright `request` context ตรง ไม่ผ่าน browser UI) | |
| `e2e/iship-cancel-pickup.spec.ts` | TC-CANCEL-01, 03, TC-PICKUP-01..04 | |
| `e2e/iship-buyer-order-view.spec.ts` | TC-BUYER-01..04 | รันบน `http://deepth.local:4000` (buyer subdomain) |
| `e2e/iship-dryrun-marker.spec.ts` | TC-DRYRUN-02 | |
| `e2e/iship-regression.spec.ts` | TC-REG-01, 02, 03 | |

> ทุกไฟล์ต้องมี `cleanup()` ใน `finally`/`afterEach` ตาม pattern `e2e/helpers/auth.ts` — ห้ามทิ้ง seed data ค้าง

---

## 5. Vitest Unit Test ที่ต้องมี

| ไฟล์ (ต้องสร้าง) | ครอบคลุม TC | Mock strategy |
|---|---|---|
| `src/lib/__tests__/iship-address-mapping.test.ts` | 🛑 TC-ADDR-01, 02, 03 | pure function, ไม่ mock อะไร (input/output ตรง ๆ) |
| `src/services/__tests__/iship-account.service.test.ts` | TC-CONN-08, TC-LODGE-05 | mock iShip HTTP client ทั้งก้อน (เหมือน `graph.test.ts` ของ feature 00018) |
| `src/services/__tests__/iship-shipment.service.test.ts` | TC-SKIP-01, 02, 05, TC-IDEM-02, 03, 05, 🛑 TC-RESIL-01, 02, TC-DRYRUN-03 | mock client, ตรวจ error-taxonomy + idempotencyKey generation |
| `src/services/__tests__/iship-webhook.service.test.ts` | TC-WH-01, 02, 🛑 TC-WH-03, 05 | ไม่ต้อง mock network (webhook เป็นขาเข้า) — mock แค่ DB fixture |
| `src/services/__tests__/iship-cancel.service.test.ts` | TC-CANCEL-02 | mock client คืน "already picked up" error |
| `src/lib/__tests__/iship-dryrun-config.test.ts` | 🛑 TC-DRYRUN-01 | mock `process.env` หลายชุด (`NODE_ENV`/`VERCEL_ENV`) |
| `prisma/__tests__/iship-schema-constraints.test.ts` (หรือ integration test แยก) | 🛑 TC-IDEM-04 | ต่อ DB จริงผ่าน `.env.local` — ไม่ mock (จงใจทดสอบ DB constraint) |
| ยืนยัน regression เดิม (TC-REG-04) | `src/services/__tests__/order.service.test.ts` (ที่มีอยู่แล้วถ้ามี) | รันซ้ำหลัง migration ไม่ต้องแก้ |

---

## 6. Traceability Matrix

### 6.1 Functional Requirements (FR-ISHIP-xxx)

| FR | เนื้อหาย่อ | Test Case |
|---|---|---|
| FR-ISHIP-001 | สร้างการเชื่อมต่อด้วย Token | TC-CONN-01, 02, 03, 04, 07 |
| FR-ISHIP-002 | ดู/เปลี่ยน/ยกเลิกการเชื่อมต่อ | TC-CONN-05, 06, 08 |
| FR-ISHIP-003 | จำกัดเฉพาะร้าน GENERAL | TC-LODGE-01, 02, 03, 04 |
| FR-ISHIP-010 | ตั้งที่อยู่ผู้ส่ง | TC-ADDR-02, TC-PICKUP-03 (ผ่านที่อยู่ผู้ส่ง) |
| FR-ISHIP-011 | ตั้งค่าเริ่มต้นพัสดุ | TC-MODE-04 (ยืนยันแยกจากค่าจริงที่แก้ต่อออเดอร์) |
| FR-ISHIP-012 | เลือกโหมด | TC-MODE-06 |
| FR-ISHIP-020 | สร้างอัตโนมัติ (AUTO) | TC-MODE-01, TC-RESIL-01..04 |
| FR-ISHIP-021 | ถามก่อน (ASK) | TC-MODE-02, 03, 04 |
| FR-ISHIP-022 | สร้างย้อนหลังจากหน้าออเดอร์ | TC-MODE-05, TC-SKIP-04 |
| FR-ISHIP-023 | เงื่อนไขข้าม/แจ้งเตือน | TC-SKIP-01..06 |
| FR-ISHIP-024 | กันเปิดซ้ำ | TC-IDEM-01..05 |
| FR-ISHIP-030 | พิมพ์ทีละใบ | TC-LABEL-01, 03, 04, 05, 06 |
| FR-ISHIP-031 | พิมพ์หลายใบ | TC-LABEL-02, 07, 08 |
| FR-ISHIP-040 | สถานะ+ประวัติ | TC-WH-01, 05 (การแสดงผลฝั่ง UI ครอบเสริมใน spec) |
| FR-ISHIP-041 | webhook อัตโนมัติ | TC-WH-01..06 |
| FR-ISHIP-042 | ผู้ซื้อเห็น tracking | TC-BUYER-01..04 |
| FR-ISHIP-050 | ยกเลิกพัสดุ | TC-CANCEL-01, 02, 03 |
| FR-ISHIP-051 | เรียกรถเข้ารับ | TC-PICKUP-01..04 |
| FR-ISHIP-060 | โหมดจำลอง | TC-DRYRUN-01..04 |
| FR-ISHIP-061 | ความปลอดภัย/PII | TC-LABEL-03, 04, TC-BUYER-02, TC-CONN-03 |

### 6.2 Business Rules (BR-ISHIP-xx)

| BR | เนื้อหาย่อ | Test Case |
|---|---|---|
| BR-ISHIP-01 | เฉพาะ GENERAL | TC-LODGE-01, 02, 05 |
| BR-ISHIP-02 | บังคับที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อน UI | TC-LODGE-02, 05 |
| BR-ISHIP-03 | เฉพาะ OWNER ตั้งค่า/วาง Token | TC-CONN-07 |
| BR-ISHIP-04 | LODGING ปิด+ซ่อน ไม่ลบข้อมูล | TC-LODGE-04 |
| BR-ISHIP-05 | แอดมินไม่เห็น Token | (รอ TC เพิ่มเมื่อมี admin UI — ปัจจุบัน implicit จาก TC-CONN-03 ที่ไม่มี response ใดมี token) |
| BR-ISHIP-10 | 1 ร้าน 1 บัญชี | TC-CONN-05 (update ไม่สร้างซ้ำ) |
| BR-ISHIP-11 | ห้ามบันทึกก่อนทดสอบผ่าน | TC-CONN-01, 02 |
| BR-ISHIP-12 | เข้ารหัสเสมอ | TC-CONN-01, 03 |
| BR-ISHIP-13 | แสดงแค่ 4 ตัวท้าย | TC-CONN-04 |
| BR-ISHIP-14 | ปฏิเสธสิทธิ์ → TOKEN_INVALID | TC-CONN-08 |
| BR-ISHIP-15 | ยกเลิก = ลบ Token จริง ประวัติอยู่ | TC-CONN-06 |
| BR-ISHIP-20 | default = ASK | TC-MODE-02 (ค่า default), เคสตั้งต้นระบบ (ดู open item §7) |
| BR-ISHIP-21 | 🛑 ออเดอร์ต้องรอด | TC-RESIL-01..04 |
| BR-ISHIP-22 | 1 ออเดอร์ 1 พัสดุ active | TC-IDEM-01, 04 |
| BR-ISHIP-23 | ข้ามเงียบเมื่อไม่เข้าเงื่อนไข | TC-SKIP-01, 02 |
| BR-ISHIP-24 | แจ้งเมื่อข้อมูลไม่ครบ | TC-SKIP-03, 04, 05 |
| BR-ISHIP-25 | ส่งรหัสอ้างอิงเสมอ | TC-IDEM-05 |
| BR-ISHIP-26 | retry ไม่ซ้ำ | TC-IDEM-02, TC-RESIL-04 |
| BR-ISHIP-27 | COD default ปิด | (ต้องเพิ่ม TC เฉพาะ — ดู §7 gap) |
| BR-ISHIP-28 | บันทึกผู้กระทำทุกครั้ง | TC-CANCEL-03, TC-PICKUP-04 |
| BR-ISHIP-30 | ที่อยู่ผู้ส่งบังคับ | TC-ADDR-02 (ทางอ้อม), ดู §7 gap สำหรับเคสตรง |
| BR-ISHIP-31 | 🛑 ตำบล/อำเภอ mapping | TC-ADDR-01, 02, 03, 04 |
| BR-ISHIP-32 | ต้องมีเทสเฉพาะ mapping | TC-ADDR-01..04 (เอกสารนี้เอง = การปฏิบัติตามกฎนี้) |
| BR-ISHIP-33 | ที่อยู่ผู้รับครบก่อนเปิดพัสดุ | TC-SKIP-03 |
| BR-ISHIP-34 | น้ำหนัก/ขนาดเป็นค่าที่แจ้ง ไม่ผูกราคา | TC-WH-05 |
| BR-ISHIP-40 | สถานะพัสดุแยกจากสถานะออเดอร์ | TC-WH-03 |
| BR-ISHIP-41 | 🛑 ห้ามเปลี่ยนสถานะออเดอร์อัตโนมัติ | TC-WH-03 |
| BR-ISHIP-42 | ผู้ซื้อยืนยันรับของเท่านั้นที่ทำให้สำเร็จ | TC-WH-03 (negative), TC-WH-04 (positive path ที่อนุญาต) |
| BR-ISHIP-43 | เสนอเปลี่ยนเป็นจัดส่งแล้ว ร้านกดเอง | TC-WH-04 |
| BR-ISHIP-44 | ไม่กระทบ Trust Score/Badge/รีวิว | (ต้องเพิ่ม TC เฉพาะ — ดู §7 gap) |
| BR-ISHIP-50 | ฟรีทุกร้าน | (regression เชิงลบ — ดู §7 gap) |
| BR-ISHIP-51 | ไม่แตะ SellerWallet | (ต้องเพิ่ม TC เฉพาะ — ดู §7 gap) |
| BR-ISHIP-52 | ไม่ถือเงิน/ไม่การันตี COD | (เอกสาร/UI copy — ตรวจด้วย content review ไม่ใช่ automation) |
| BR-ISHIP-53 | ไม่แสดงยอดเงิน iShip | (ต้องเพิ่ม TC เฉพาะ — ดู §7 gap) |
| BR-ISHIP-60 | 🛑 dry-run เปิดบน prod ไม่ได้ | TC-DRYRUN-01 |
| BR-ISHIP-61 | dry-run มีเครื่องหมายกำกับ | TC-DRYRUN-02, 03 |
| BR-ISHIP-62 | ทดสอบจริงบน prod ต้องขออนุญาต+cancel ทันที | §8 (smoke test checklist) |

---

## 7. Gap ที่ต้องเพิ่มเมื่อมี SRS/SDS (ยังไม่เขียน TC เต็มตอนนี้)

รายการนี้คือ BR/FR ที่ตรวจแล้วว่า**ยังไม่มี TC ตรง ๆ ครอบ** ในเอกสารรอบนี้ เพราะรายละเอียดทาง technical (เช่น ชื่อ endpoint, ชื่อ field UI จริง) ยังไม่ freeze ใน SRS/SDS — บันทึกไว้กันตกหล่น ไม่ใช่ถือว่า "ผ่านแล้ว":

| รหัส | สิ่งที่ยังขาด | ต้องเพิ่มเมื่อ |
|---|---|---|
| BR-ISHIP-05 | TC ตรงสำหรับ "แอดมิน Deep ไม่เห็น Token" (ต้องมี admin UI/endpoint ที่ดูรายชื่อร้านเชื่อมต่อก่อน) | เมื่อ SDS ระบุหน้า admin จริง |
| BR-ISHIP-20 (ค่าเริ่มต้นระบบ) | TC ตรงยืนยันว่าร้านที่เพิ่งเชื่อมต่อครั้งแรก `createMode` เริ่มที่ `ASK` โดยไม่ต้องตั้งเอง | เพิ่มง่ายเมื่อ implement — ควรเป็น TC-CONN-01 sub-assertion |
| BR-ISHIP-27 | TC ตรงยืนยัน `defaultCodEnabled=false` ตอนสร้างครั้งแรก | เพิ่มง่ายเมื่อ implement |
| BR-ISHIP-30 | TC ตรง "กันไม่ให้เปิดใช้งานสร้างพัสดุถ้าที่อยู่ผู้ส่งยังไม่ครบ" (แยกจาก TC-SKIP ที่เป็นเรื่องที่อยู่ผู้รับ) | เพิ่มเมื่อรู้ว่า UI/error message เป็นอย่างไร |
| BR-ISHIP-44 | TC ยืนยัน Trust Score/Badge/รีวิวไม่เปลี่ยนหลังมีพัสดุ (regression กับ feature 00003/trust-score service) | เพิ่มเป็น TC-REG-05 เมื่อ implement เสร็จ |
| BR-ISHIP-50/51 | TC ยืนยัน `SellerWallet.balance` ไม่ขยับหลังสร้าง/ยกเลิกพัสดุ/เรียกรถ (regression กับ feature 00004 Wallet) | เพิ่มเป็น TC-REG-06 |
| BR-ISHIP-53 | TC ยืนยันไม่มี field ใดแสดงยอดเงิน iShip ในทุกหน้าที่เกี่ยวข้อง | เพิ่มเมื่อมี UI จริง |

---

## 8. ขั้นตอน Smoke Test ของจริงบน Production

> 🛑 **อ่านก่อนเริ่ม: ทุกขั้นตอนในหัวข้อนี้ใช้เงินจริงและสร้างพัสดุจริง** (BR-ISHIP-62) — ห้ามทำโดยไม่ผ่าน checklist นี้ครบทุกข้อ ห้ามทำเกิน 1 ครั้งต่อรอบ release ใหญ่ ห้ามทำถ้ายังไม่ผ่านทั้งชั้น Unit + E2E-dry-run (§3 ทุก 🛑 BLOCKER ต้อง PASS ก่อน)

### Checklist

- [ ] **1. ขออนุญาตจาก user (เจ้าของระบบ) ก่อนทุกครั้ง** — ระบุวันเวลาที่จะทำ, ร้านทดสอบที่จะใช้ (บัญชี iShip ของใคร), ขนส่งที่จะเลือก, และยืนยันว่าจะมีค่าใช้จ่ายจริงเกิดขึ้น (แจ้งค่าประมาณถ้าทราบ)
- [ ] **2. ยืนยันก่อนเริ่มว่าทุก 🛑 BLOCKER test case ในเอกสารนี้ผ่านหมดแล้ว** (Unit + E2E-dry-run) — ไม่ใช่แค่ "โค้ดเขียนเสร็จ"
- [ ] **3. ยืนยันว่า production อยู่ใน dry-run = false จริง** (TC-DRYRUN-01 ต้องผ่านมาก่อนแล้ว) — เพื่อให้แน่ใจว่าสิ่งที่กำลังจะทำคือของจริง ไม่ใช่ปนกับ mock
- [ ] **4. เตรียมร้านทดสอบบน production** — ร้าน `vertical=GENERAL` ที่เป็นบัญชีทดสอบภายใน (ไม่ใช่ร้านลูกค้าจริง), เชื่อมต่อด้วย Token จริงของบัญชี iShip ที่ user จัดเตรียม/อนุญาตให้ใช้
- [ ] **5. สร้าง 1 ออเดอร์ทดสอบ** — สินค้าราคาต่ำสุดที่เป็นไปได้/สินค้าทดสอบ, ที่อยู่ผู้รับเป็นที่อยู่จริงที่ควบคุมได้ (เช่น ที่อยู่ของทีมงานเอง ไม่ใช่ที่อยู่สุ่ม) เพื่อให้ยกเลิกแล้วไม่มีผลกระทบต่อบุคคลที่สาม
- [ ] **6. สร้างพัสดุ 1 ใบ (โหมด ASK หรือกดเองจากหน้าออเดอร์)** — ยืนยันหน้าต่างสรุปด้วยตาก่อนกดจริง
- [ ] **7. ตรวจผลลัพธ์:**
  - [ ] ได้เลขติดตามพัสดุจริงกลับมา ผูกกับออเดอร์ถูกต้อง
  - [ ] **ตรวจว่าที่อยู่ผู้รับ/ผู้ส่งที่ iShip บันทึกไว้ตรงกับที่กรอกจริง โดยเฉพาะตำบล/อำเภอ (ยืนยัน BR-ISHIP-31 กับของจริง ไม่ใช่แค่ dry-run)** — เข้าดูที่หลังบ้าน iShip โดยตรงเทียบกับที่กรอกใน Deep
  - [ ] พิมพ์ใบปะหน้าได้จริง เปิดไฟล์ได้ ไม่มี error
  - [ ] `Order.status` ยังไม่เปลี่ยนอัตโนมัติ (ยืนยัน BR-ISHIP-41 กับของจริง)
- [ ] **8. ยกเลิกพัสดุทันทีหลังตรวจสอบเสร็จ** (BR-ISHIP-62) — กดยกเลิกจากหน้า Deep
- [ ] **9. ยืนยันว่ายกเลิกสำเร็จจริง** — เช็คทั้งฝั่ง Deep (`status=CANCELLED`) และฝั่งหลังบ้าน iShip โดยตรง (สถานะพัสดุที่ iShip ต้องแสดงว่ายกเลิกแล้วด้วย ไม่ใช่แค่ Deep คิดว่ายกเลิก)
- [ ] **10. รายงานผลกลับ user** — สรุปว่าทำอะไรไปบ้าง, ผลลัพธ์แต่ละข้อ, ค่าใช้จ่ายที่เกิดขึ้นจริง (ถ้ามี แม้ยกเลิกแล้วบางขนส่งอาจมีค่าธรรมเนียมขั้นต่ำ — ต้องแจ้ง user ให้ทราบตามตรง)
- [ ] **11. ถ้าพบปัญหาใด ๆ ระหว่างขั้นตอนนี้ (โดยเฉพาะข้อ 7.2 ที่อยู่ผิดช่อง) ให้หยุดทันทีและรายงาน — ห้ามพยายามแก้ต่อบน production โดยไม่แจ้ง user ก่อน**

---

## 9. ผลล่าสุด

| Run | วันที่ | ผล (Pass/Fail/Blocked) | ผู้ทดสอบ (Tester) |
|-----|--------|--------------------------|---------------------|
| — | — | ยังไม่เคยรัน — เอกสารนี้เขียนก่อนมีโค้ด (doc-first) ไม่มีอะไรให้รันจนกว่าจะมี implementation | — |

---

## 10. สรุป (Summary)

เอกสาร Test Case นี้กำหนด **ชุดเคสทดสอบ 3 ชั้น** ของ **iShip Shipping Integration** ที่ trace กลับ FR-ISHIP-xxx/BR-ISHIP-xx ใน [[BRD]] ทุกข้อที่เป็นไปได้ ณ ตอนที่ยังไม่มี SRS/SDS (ดู §7 gap สำหรับส่วนที่ต้องเติมภายหลัง)

**หลักการที่ยึดตลอดเอกสาร:**
- **ไม่มี UAT sandbox** → แยก Unit (mock ล้วน) / E2E-dry-run (browser จริง, iShip mock) / Prod-smoke (ของจริง ครั้งเดียว, ต้องขออนุญาต) อย่างเคร่งครัด ห้ามข้ามชั้น
- **BR-ISHIP-31 (ตำบล/อำเภอ mapping) และ BR-ISHIP-41 (ห้ามแตะสถานะออเดอร์) คือ blocker สูงสุด** — ทั้งสองเรื่องมีเคสยืนยันด้วยค่าที่ไม่เท่ากันโดยตั้งใจ กันเทสหลอกผ่าน
- **BR-ISHIP-21 (ออเดอร์ต้องรอด)** มีชุดเคสจำลองความล้มเหลวของ iShip ครบ (timeout/500/connection refused) เพื่อพิสูจน์ว่าฟังก์ชันหลักของ Deep ไม่มีวันหยุดเพราะระบบภายนอก
- **Idempotency มีทั้ง unit (key generation) และ integration ระดับ DB จริง (partial unique constraint)** — ไม่เชื่อแค่ application logic

**Open Questions ที่ยังค้าง (สืบทอดจาก [[BRD]] §11):**
- OQ-1: กลไกพิสูจน์ตัวตนของ webhook iShip — กระทบ TC-WH-06 โดยตรง ต้องตอบก่อนเขียนเคสละเอียดของกลุ่ม webhook ให้ครบ
- OQ-2/OQ-3: ขอบเขตต่างประเทศ/ส่งด่วน — ยืนยันแล้วว่า out-of-scope เวอร์ชันนี้ ไม่ต้องมี TC
- OQ-4/OQ-6: รายละเอียด UX (เปิดแท็บใหม่พิมพ์ใบปะหน้า, แสดงราคาประมาณ) — กระทบ TC-LABEL-01 และ TC-MODE-02 เล็กน้อย ต้องปรับ Expected Result ให้ตรงเมื่อ SRS/SDS ยืนยัน

**สิ่งที่ต้องทำก่อนเริ่ม implement (ตาม Hard Rule 11):** SRS/SDS/API.md ของโมดูลนี้ยังไม่มี — เมื่อมีแล้วต้องนำเอกสารนี้กลับมา sync ชื่อ endpoint/env var/field ที่เป็นสมมติฐานในเอกสารนี้ทั้งหมด (ทำเครื่องหมาย "รอ SRS/SDS" ไว้ทุกจุดแล้ว)

---

## ส่วนขยาย 2026-08-01 — ผูกพัสดุที่มีอยู่แล้วบน iShip

### เทสอัตโนมัติที่มีแล้ว — `src/lib/iship/unlinked.test.ts` (16 เคส ผ่าน)

| กลุ่ม | เคส |
|---|---|
| **คู่ตำบล/อำเภอ ขาเข้า (blocker)** | `dst_district`→ตำบล และ `dst_area`→อำเภอ ไม่สลับกัน · `dst_amphure` ชนะ `dst_area` เมื่อส่งมาทั้งคู่ |
| ทนชื่อฟิลด์ไม่ตรงเอกสาร | อ่านเวลาได้ทั้ง `created`/`created_at` · `cod_amount` สตริง→ตัวเลข · ไม่มี COD = 0 ไม่ใช่ null · แถวไม่มี `track_no` ถูกทิ้ง · แถวเสีย 1 แถวไม่ทำให้ทั้งชุดหาย |
| เทียบที่อยู่ | เขียนคนละแบบแต่ที่เดียวกันต้องไม่ถูกฟ้อง (ต./แขวง/เขต, `กรุงเทพ`=`กรุงเทพมหานคร`, เบอร์มีขีด) · เบอร์ต่างต้องถูกจับและชี้เฉพาะแถวนั้น · **ตำบล/อำเภอสลับที่กันต้องถูกฟ้อง** · ออเดอร์ที่ยังไม่มีที่อยู่เลยต้องเทียบได้ ไม่ใช่พัง |
| ช่องค้นหา | เลขบางส่วน (ไม่สนตัวพิมพ์) · เบอร์ที่พิมพ์มีขีด · ชื่อผู้รับ · ไม่เจอ = false · ช่องว่าง = ผ่านทุกแถว |

🛑 ทุกเคสในกลุ่ม blocker ใช้ค่าตำบลกับอำเภอ **ต่างกัน** เสมอ — ตัวอย่างในเอกสารของ iShip
ใส่ค่าเดียวกันทั้งสองช่อง ซึ่งเป็นรูปแบบที่จับคู่กลับหัวแล้วยังเขียวอยู่ดี

### เทสที่ต้องทำด้วยมือ (ยังไม่ได้ทำ — ต้องมี dev server + บัญชี iShip จริง)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| M-1 | เปิดพัสดุบน iShip เอง → สร้างคำสั่งซื้อใน Deep → "แจ้งเลขพัสดุ" → "เลือกจาก iShip" | เห็นใบนั้นในรายการ พร้อมที่อยู่/COD/สถานะจริง |
| M-2 | **ยิง `query_orders` กับพัสดุที่ตำบล ≠ อำเภอ** | ตารางเทียบแสดงตำบลกับอำเภอถูกช่อง ไม่สลับ (ปิดความเสี่ยง `dst_area`) |
| M-3 | เลือกใบที่ที่อยู่ต่างจากออเดอร์ → เลือก "ใช้ที่อยู่จาก iShip ทับ" | ที่อยู่ในคำสั่งซื้อถูกแก้ · **รายการสินค้าและสต็อกต้องไม่เปลี่ยน** (ใช้ `applyReceiverPatch` ไม่ใช่ `updateOrder`) |
| M-4 | ผูกใบที่ iShip บอกว่า "ส่งสำเร็จแล้ว" | แถบ 4 ขั้นอยู่ที่ขั้นสุดท้ายทันที · ไทม์ไลน์มีครบทุกขั้น · คำสั่งซื้อกลายเป็น "จัดส่งแล้ว" |
| M-5 | ผูกใบเดิมซ้ำกับคำสั่งซื้ออีกใบ | 409 พร้อมข้อความ "ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว" |
| M-6 | กด "ยกเลิกการผูก" | แถวหาย · ออเดอร์กลับเป็น "รอจัดส่ง" · **พัสดุบน iShip ยังอยู่ครบ** · ผูกเลขเดิมกับออเดอร์อื่นได้ |
| M-7 | ออเดอร์ที่เคยกด "แจ้งจัดส่ง" ด้วยมือมาก่อน แล้วมาผูกพัสดุ | ไม่ชน P2002 (upsert) |
| M-8 | ร้านที่ไม่มีพัสดุว่างใน 7 วัน | สถานะว่างพร้อมปุ่ม "สร้างพัสดุ iShip แทน" |
| M-9 | token เสีย / iShip ล่ม | กล่องแดง + ปุ่มลองใหม่ ไม่ใช่หน้าขาว |

---

## ส่วนขยาย 2026-08-05 — เปรียบเทียบราคาทุกขนส่ง (ปุ่ม "เทียบราคา")

> สเปกเต็ม `docs/superpowers/specs/2026-08-05-iship-price-compare-design.md` — trace FR-ISHIP-032, BR-ISHIP-35/36

### เทสอัตโนมัติที่มีแล้ว

**`src/lib/iship/mapping.test.ts` — `buildCheckPricePayload`** (BR-ISHIP-31, blocker; 4 เคสท้ายไฟล์):

| เคส | ยืนยันอะไร |
|---|---|
| ตำบล/อำเภอไม่สลับ | ตำบล→`district`, อำเภอ→`amphure` ทั้งขา `src`/`dst` (ค่าตำบล≠อำเภอเสมอในชุดนี้ — กันเทสหลอกผ่าน) |
| จังหวัดผ่าน `normalizeProvince` | กทม./กรุงเทพ → "กรุงเทพมหานคร" เสมอ (ตามเอกสาร iShip, ตัดสิน 2026-07-29) |
| ค่าว่าง/null | กลายเป็นสตริงว่าง ไม่ใช่ literal `"null"` |
| ขนาด/น้ำหนัก | ส่งผ่านตามตัวเลขเดิม ไม่ปัดเศษ |

**`src/lib/iship/compare.test.ts` — `assembleCompareResult`** (5 เคส):

| เคส | ยืนยันอะไร |
|---|---|
| เรียงราคา + reject เข้า failed | ถูก→แพง, ตัวที่ reject มีชื่อครบใน `failed` |
| ราคาเท่ากัน | คงลำดับตามรายการขนส่งเดิม (stable sort) |
| `total_price` ไม่ใช่เลข | ถือว่า fail ไม่ใช่การ์ดราคา 0 |
| field ประกอบราคา | ไม่ส่ง/ศูนย์ → `null` (ช่องแสดง "—"), ส่งมา → ตัวเลขจริง |
| รายการขนส่งว่าง | ผลว่างทั้งคู่ ไม่ throw |

### เทสที่ต้องทำด้วยมือ (browser QA)

> 🛑 **สถานะ: ยังไม่ได้ browser QA — user รับไปทดสอบเองบน prod 2026-08-05** (pattern เดียวกับฟีเจอร์อื่นในโปรเจกต์ที่ user QA เองบน prod)

| # | ขั้นตอน | ผลที่คาด |
|---|---|---|
| M-10 | เปิดฟอร์มสร้างพัสดุ ยังไม่กรอกที่อยู่/ขนาด | ปุ่ม "เทียบราคา" disabled + ข้อความใต้ช่องบอกว่าต้องกรอกอะไรก่อน |
| M-11 | กรอกที่อยู่+ขนาดครบ แล้วกดปุ่ม | ปุ่มเปิดใช้งาน → เห็น skeleton → เห็นรายการเรียงราคาถูก→แพง badge "ถูกที่สุด"/"เร็วที่สุด" อยู่ถูกใบ |
| M-12 | กด "ใช้ขนส่งนี้" ที่ใบใดใบหนึ่ง | กลับไปฟอร์มหลัก dropdown ขนส่งเปลี่ยนเป็นใบที่เลือก บรรทัด "ค่าส่งโดยประมาณ" เดิมอัปเดตตาม |
| M-13 | บัญชีที่มีขนส่งบางเจ้าตอบไม่ได้ (partial fail) | เห็นสรุปท้ายรายการ "ประเมินไม่ได้ N ขนส่ง: …" พร้อมปุ่ม "ลองใหม่อีกครั้ง" ที่ยิงจริง (ไม่ใช้ cache เดิม) |
| M-14 | ที่อยู่ผู้ส่งของร้านยังไม่ครบ | เห็น `SenderIncompleteNotice` (ระบุช่องที่ขาด) แทนรายการราคา (INCOMPLETE_DATA) |
| M-15 | บัญชีที่ยังไม่มีขนส่งเปิดใช้งานเลย | empty state "ยังไม่มีขนส่งให้เทียบราคา" + ปุ่มลองใหม่ + ลิงก์ "ตรวจการเชื่อมต่อ iShip" |
| M-16 | เปิด sheet แล้วกด Escape | กลับไปหน้าฟอร์ม (ไม่ปิดโมดัลทั้งใบ — ข้อมูลที่กรอกในฟอร์มไม่หาย) |
| M-17 | เปิดซ้ำโดยไม่แก้ที่อยู่/ขนาด | เห็นผลเดิมทันที ไม่มี skeleton โหลดใหม่ (cache ตาม `inputKey`) |
| M-18 | มือถือ 375px | breakdown 3 ช่องแผ่ใต้การ์ด ปุ่มเต็มความกว้าง หัว sheet มีปุ่มย้อนกลับด้านซ้าย |
| M-19 | tablet (768–1023px) | breakdown ยุบไว้ กดหัวการ์ดเพื่อกางดู (accordion, `aria-expanded` ตรงสถานะจริง) |
| M-20 | desktop (≥1024px) | breakdown แผ่เป็นคอลัมน์ในแถวเดียว ไม่ต้องกด |

---

## ส่วนขยาย 2026-08-06 — ปิดงาน COD อัตโนมัติ

| # | เคส | ข้อมูลตั้งต้น | คาดหวัง | อ้างกฎ |
|---|-----|---------------|---------|--------|
| E6-1 | เงินเข้าครั้งแรก | ใบ COD, `status=SHIPPED`, `codReceivedAt=null`, iShip ส่ง `settlement_at` | `codSettledAt` ถูกเขียน · `codReceivedAt` = เวลาที่ iShip แจ้ง · `codReceivedByUserId=null` · `status=CONFIRMED` · มี event `COD_SETTLED` + `SYSTEM_CONFIRMED` | BR-ISHIP-45/47 |
| E6-2 | รอบ sync ซ้ำ | ใบเดียวกับ E6-1 ที่ประมวลผลไปแล้ว | ไม่เขียนอะไรเพิ่ม ไม่เกิด event ซ้ำ | idempotent |
| E6-3 | ร้านกดไปก่อนแล้ว | `codReceivedAt` มีค่าจากร้าน (มี `codReceivedByUserId`) | `codReceivedAt`/ผู้กดเดิม **ไม่ถูกทับ** · `codSettledAt` ยังถูกเขียน · ยัง auto-confirm ได้ถ้ายังไม่ CONFIRMED | BR-ISHIP-48 |
| E6-4 | ใบที่ยกเลิกแล้ว | `status=CANCELLED` + iShip ส่ง `settlement_at` | สถานะคงเป็น `CANCELLED` · ไม่มี `SYSTEM_CONFIRMED` | BR-ISHIP-46 |
| E6-5 | ไม่ใช่ COD | `paymentMethod=TRANSFER`, `cod_amount="0.00"` | ไม่แตะ `codReceivedAt` · ไม่ auto-confirm | BR-ISHIP-45(ก) |
| E6-6 | ผู้ซื้อกดยืนยันไปก่อน | `status=CONFIRMED` อยู่แล้ว | ไม่เกิด `SYSTEM_CONFIRMED` ซ้ำ · `codSettledAt` ยังถูกเขียน (เป็นข้อเท็จจริงคนละเรื่อง) | — |
| E6-7 | ยังติดตามพัสดุที่ส่งถึงแล้ว | ใบ COD `carrierStatus=delivered`, `codSettledAt=null` | ยังอยู่ในชุดที่ sync ถาม iShip รอบถัดไป | BR-ISHIP-49 |
| E6-8 | เลิกติดตามเมื่อจบจริง | ใบ COD ที่มี `codSettledAt` แล้ว | ไม่ถูกถามอีก | BR-ISHIP-49 |
| E6-9a | ส่งถึงแล้วแต่ยังไม่โอน | สถานะพัสดุ `3` + `settlement_at` เป็นวันพรุ่งนี้ (นัดโอน) | ไม่เขียนอะไรเลย · ไม่ auto-confirm — **เคสนี้คือบั๊กที่ dry-run จับได้ 2026-08-06** | BR-ISHIP-45.1 |
| E6-9 | เขตเวลา | `settlement_at="2026-08-05 19:00:00"` | เก็บลงฐานแล้วอ่านกลับเป็น 5 ส.ค. 19:00 เวลาไทย ไม่ใช่ 02:00 ของวันถัดไป | SRS §18.1 |
| E6-10 | Trust Score | ใบที่ auto-confirm สำเร็จ | คะแนน/badge ถูกคำนวณใหม่ด้วยเส้นทางเดียวกับผู้ซื้อกดยืนยัน | BR-ISHIP-44 |

### ปรับวิธีชำระเงินตามพัสดุ (BR-ISHIP-51..54)

| # | เคส | ข้อมูลตั้งต้น | คาดหวัง |
|---|-----|---------------|---------|
| E7-1 | พัสดุ COD / คำสั่งซื้อไม่ใช่ | `paymentMethod='CASH'`, พัสดุ `codAmount=360` | `paymentMethod` เป็น `COD` · event `PAYMENT_METHOD_SYNCED` (meta `paymentFrom='CASH'`, `amount=360`) · toast `info` · แถบในหน้าสถานะ |
| E7-2 | ไม่เคยระบุวิธีชำระ | `paymentMethod=null`, พัสดุ `codAmount=590` | เหมือน E7-1 แต่ `paymentFrom=null` |
| E7-3 | คำสั่งซื้อ COD / พัสดุไม่ COD | `paymentMethod='COD'`, พัสดุ `codAmount=0` | **ไม่แก้อะไรเลย** · toast `warning` · แถบสีเตือน |
| E7-4 | ตรงกันอยู่แล้ว | ทั้งคู่ COD หรือทั้งคู่ไม่ COD | ไม่มี toast พิเศษ (ขึ้น "สร้างพัสดุสำเร็จ" ตามเดิม) ไม่มีแถบ |
| E7-5 | ข้อความไทยที่ร้านพิมพ์เอง | `paymentMethod='เก็บเงินปลายทาง'` | ถือว่าเป็น COD (ไม่เทียบ enum เป๊ะ) |
| E7-6 | ยอดขยะ | พัสดุ `codAmount=NaN` หรือติดลบ | ถือว่าไม่ใช่ COD — ห้ามแก้คำสั่งซื้อจากค่าขยะ |
| E7-7 | สร้างพัสดุล้มเหลว | ยิง iShip ไม่ผ่าน แต่ตั้ง COD ไว้ | `paymentMethod` ยังถูกปรับ (เกิดตอนกดสร้าง) · ไม่ยิง toast ซ้อน error · แถบยังขึ้นในหน้าสถานะ |
| E7-8 | แชท: ติ๊กแจ้งเลข + ส่งสำเร็จ | แผงปิดทันที | toast ต้องมีทั้งคำยืนยันสำเร็จและข้อความเรื่องเงินในใบเดียว |

### ลองใหม่ / นิยาม "มีพัสดุ" / เครดิตไม่พอ (BR-ISHIP-63..67, FR-ISHIP-074 — เพิ่ม 2026-08-06)

อัตโนมัติแล้ว: `src/services/__tests__/iship-shipment-retry.test.ts` (E8-1, E8-2) ·
`src/lib/iship/errors.test.ts` (E8-5)

| # | เคส | ข้อมูลตั้งต้น | คาดหวัง | สถานะ |
|---|-----|---------------|---------|-------|
| E8-1 | ลองใหม่โดยไม่แนบ patch หลังที่อยู่ในออเดอร์ถูกแก้ | snapshot = `ช้างซาย/กาญจดิษ/สุราษฐานี` · ออเดอร์ = `ช้างซ้าย/กาญจนดิษฐ์/สุราษฎร์ธานี` | payload ที่ยิงมี `dst_district=ช้างซ้าย`, `dst_amphure=กาญจนดิษฐ์`, `dst_province=สุราษฎร์ธานี` | ✅ unit |
| E8-2 | กด "แก้ข้อมูลแล้วลองใหม่" ทับใบ FAILED โดยเปลี่ยนขนส่ง/น้ำหนัก/หมายเหตุ | ใบเดิม `FlashExpressA` 4.01 กก. · ฟอร์มส่ง `KerryExpress` 2 กก. "ห้ามโยน" | payload ใช้ค่าใหม่ทั้ง 3 ช่อง (ไม่ใช่ค่าเดิม) | ✅ unit |
| E8-3 | ช่องที่ไม่ได้ส่งมาใน override | ส่งเฉพาะ `courierCode` | ช่องอื่นคงค่าเดิมของใบนั้น **ห้าม** ตกไปใช้ค่าตั้งต้นของร้าน | ⬜ |
| E8-4 | ใบ FAILED ในกล่องแชท | ออเดอร์มี `OrderShipment` เดียว status=FAILED | ชิปแถวต้องเป็น "สั่งซื้อแล้ว" ไม่ใช่ "สร้างพัสดุแล้ว" · ไทล์ = "รอเลขพัสดุ" | ⬜ browser |
| E8-5 | iShip ตอบ `"เครดิตไม่เพียงพอ"` | — | `classifyUpstream` = `INSUFFICIENT_BALANCE` (ไม่ใช่ `UPSTREAM_ERROR`) · `retryable=false` | ✅ unit |
| E8-6 | หน้าจอเมื่อเครดิตไม่พอ | shipment FAILED + `lastErrorCode=INSUFFICIENT_BALANCE` | กล่อง alert + ปุ่ม "เข้าระบบ iShip เพื่อเติมเงิน" (แท็บใหม่ → `app.iship.cloud/`) · ปุ่มลองใหม่เป็นปุ่มรอง · สปินเนอร์มองเห็นบนพื้นอ่อน | ⬜ browser |
| E8-7 | error สาเหตุอื่น | `lastErrorCode=ADDRESS_INVALID` | หน้าตาเดิมทุกอย่าง (บรรทัดเดียว + ปุ่มลองใหม่เป็นปุ่มหลัก) | ⬜ browser |
| E8-8 | `REJECTED_BY_CARRIER` | iShip ตอบ "กรุณากรอก สีสินค้า" | ข้อความบนจอมีรายละเอียดดิบต่อท้าย ไม่ใช่ประโยคกลาง ๆ อย่างเดียว | ⬜ |
