# 00014 — Customer Directory · BRD (Business Rules — SSOT)

- **BR-CUST-01 (unique phone):** Customer.phone unique global (normalize `^0[0-9]{9}$` ก่อนเขียนเสมอ). ห้ามมี 2 record เบอร์เดียวกันเด็ดขาด
- **BR-CUST-02 (cross-shop identity):** เบอร์เดียวกัน = Customer id เดียว ไม่ว่าสั่งจากกี่ร้าน (findOrCreate by phone)
- **BR-CUST-03 (privacy):** seller เห็น/ค้นลูกค้าเฉพาะจากออเดอร์ของร้านตัวเอง; ชื่อลูกค้าเก็บต่อออเดอร์ (`order.buyerName`) — ร้าน A ไม่เห็นชื่อที่ร้าน B ตั้งให้เบอร์เดียวกัน
- **BR-CUST-04 (phone-only entity):** สร้าง Customer เฉพาะเมื่อมีเบอร์ valid; email-only/เบอร์ผิด → order สร้างได้ (buyerContact เดิม) แต่ไม่มี Customer / customerId=null
- **BR-CUST-05 (denormalized keep):** คง `order.buyerName`/`buyerContact` เสมอ (display + backward compat + buyer-history-linking เดิมไม่พัง)
- **BR-CUST-06 (link User = Phase 2):** Customer.userId (link → registered buyer) เป็น Phase 2 — MVP ไม่ auto-link
- **BR-CUST-07 (นิยามยอดซื้อสะสม = countsAsRevenue, ไม่ใช่ "ไม่รวมยกเลิก" เฉย ๆ):** "ยอดซื้อสะสม" ของลูกค้าในหน้า `/customers` ต้องคำนวณด้วย SSOT เดียวกับยอดขายทั้งระบบ — `countsAsRevenue(order)` ที่ `src/lib/order-revenue.ts` (`status==='CONFIRMED'` **หรือ** `status==='SHIPPED'` ที่มี shipment `status==='CREATED'` + `isDryRun===false` + `carrierStatus` อยู่ใน `REVENUE_CARRIER_STATUSES`) — **ห้าม** เขียนเงื่อนไข `status==='CONFIRMED'` ซ้ำเองที่หน้านี้ และ**ห้าม**นิยามว่า "ทุกสถานะที่ไม่ใช่ CANCELLED" (นั่นกว้างเกิน SSOT จริง เพราะ PENDING/SHIPPED-ยังไม่ถึงมือขนส่ง ก็ไม่นับเป็นยอดขายเช่นกัน). คำบนหน้าจอที่กำกับตัวเลขนี้ต้องใช้ **"(นับเป็นยอดขายแล้ว)"** เท่านั้น ห้ามใช้ "ยืนยันแล้ว" เพราะคำนั้นถูกใช้แล้วที่หน้า `/sales` ผูกกับความหมาย CONFIRMED-only โดยเฉพาะ ใช้ปนกันจะสื่อเกณฑ์ผิด
  - **known gap (บันทึกไว้ ไม่แก้ในรอบนี้):** หน้า `/sales` ปัจจุบันยังคำนวณยอดขายแบบ CONFIRMED-only (คนละเกณฑ์กับ `/customers`/dashboard ที่ใช้ `countsAsRevenue`) — ตัวเลขสองหน้าจึงไม่เท่ากันได้โดยเจตนา ณ ตอนนี้ เป็น debt แยกที่ต้องปิดทีหลัง ไม่ใช่ scope ของ `00014-ext-customers`
- **BR-CUST-08 (soft-deleted user แสดงเป็น guest-like):** ลูกค้าที่เป็นสมาชิก (มี `buyerUserId`) แต่ `User.deletedAt` ถูกตั้งแล้ว — หน้า `/customers` ต้องแสดงแถวนั้นเป็น guest-like: **ไม่มีลิงก์ไปหน้าโปรไฟล์สาธารณะ** `/u/{username}` (เพราะ `findByUsername` กัน soft-deleted user ที่ต้นทางแล้ว ลิงก์จะพาไปหน้า 404) แต่ยัง **นับ** เป็น 1 แถวในลิสต์ตามปกติ (ไม่ใช่ถูกซ่อน/ลบทิ้ง — ประวัติออเดอร์ของร้านยังต้องอยู่ครบ)

## Acceptance
- 2 ออเดอร์เบอร์เดียว (ร้านเดียว/ต่างร้าน) → customerId เดียวกัน
- เบอร์รูปแบบผิด → ไม่สร้าง Customer; order ผ่านถ้า contact เป็น email/ว่าง
- concurrent create เบอร์เดียว → ไม่ error (P2002 re-find)
- หน้า `/customers`: 2 ออเดอร์เบอร์เดียวกัน format ต่างกัน → 1 แถว (dedupe ด้วย `customerId`, FR-7)
- หน้า `/customers`: ลูกค้ามีออเดอร์ `SHIPPED` + shipment `carrierStatus` อยู่ใน `REVENUE_CARRIER_STATUSES` → นับเข้ายอดซื้อสะสม แม้ buyer ยังไม่กด CONFIRMED (BR-CUST-07)
- หน้า `/customers`: user soft-deleted (`deletedAt` ตั้งแล้ว) → แถวแสดงแบบ guest-like ไม่มีลิงก์โปรไฟล์ (BR-CUST-08)

## Edge / risk
- race สร้างพร้อมกัน → unique + P2002 catch (BR-CUST-01 enforce ที่ DB)
- backfill order เก่า email-only → ข้าม (BR-CUST-04)

**User ack:** ไม่มี BR pre-tick ที่ต้อง defer — ทุก rule active ตั้งแต่ MVP
