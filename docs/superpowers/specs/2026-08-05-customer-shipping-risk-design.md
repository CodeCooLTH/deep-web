# Design Spec — Customer Shipping Risk (feature 00032)

> วันที่: 2026-08-05 · สถานะ: user อนุมัติแนวทางแล้ว (brainstorm 3 ข้อ) · mockup: `2026-08-05-customer-shipping-risk-mockup.html`
> ต้นเรื่อง: user เห็นแท็บ "พัสดุมีปัญหา / ติดต่อผู้รับไม่ได้ / พัสดุตีกลับ" บน iShip แล้วต้องการให้ Deep
> บันทึกปัญหาพวกนี้ผูกกับลูกค้าไว้ส่วนกลาง เพื่อให้ seller เห็น risk notice ตอนค้นหาลูกค้า

## การตัดสินใจที่ล็อกแล้ว (จาก brainstorm)

| ประเด็น | คำตอบ user |
|---|---|
| แหล่งข้อมูล | อัตโนมัติจากสถานะขนส่ง + seller จดโน้ตเองได้ |
| ขอบเขตแชร์ | ข้ามร้านทั้งแพลตฟอร์ม ("ไว้ตรงกลาง") |
| กันกลั่นแกล้ง | สถิติอัตโนมัติเท่านั้นที่แชร์ข้ามร้าน — โน้ตจดเองเห็นเฉพาะร้านตัวเอง |

## 1. แนวคิดหลัก — derive สด ไม่มีตาราง counter

`Customer` เป็น entity กลางระดับแพลตฟอร์มอยู่แล้ว (`phone @unique` ทั้งระบบ ไม่ผูกร้าน) และทุกออเดอร์ผูก
`customerId` → สถิติปัญหาข้ามร้าน**คำนวณสดจากตารางที่มีอยู่** (`Order` join `OrderShipment.carrierStatus`)
ไม่มีตารางสถิติใหม่ที่ต้อง sync/backfill และไม่มีทางเพี้ยนจากข้อมูลจริง

### หมวดความเสี่ยง (SSOT ใหม่: `src/lib/customer-risk.ts`)

| หมวดที่แสดง | สัญญาณ | นับเป็นความเสี่ยงลูกค้า? |
|---|---|---|
| พัสดุตีกลับ | `carrierStatus ∈ {return, return_success}` | ✅ |
| พัสดุมีปัญหา | `carrierStatus = issue` | ✅ |
| ปฏิเสธ/ขอคืนเงิน COD | `carrierStatus = cod_refund` | ✅ |
| ผู้ซื้อยกเลิกออเดอร์ | `Order.status=CANCELLED AND cancelInitiator='buyer'` | ✅ |
| ขนส่งเข้ารับจากร้านไม่ได้ | `cannot_pickup`, `is_expired` | ❌ ปัญหาฝั่งร้าน — ห้ามนับ |

- นับแบบ **ต่อพัสดุ/ต่อออเดอร์ ไม่ใช่ต่อ event** — 1 ใบที่ `return → return_success` นับ "ตีกลับ 1"
  (นับจากสถานะปัจจุบันของ `OrderShipment` แถวละ 1)
- ข้อจำกัดที่บอกตรง ๆ: "ติดต่อผู้รับไม่ได้" ตามแท็บ iShip เราไม่มีรหัสแยก (มาถึงเราเป็น `issue`)
  → เฟสนี้รวมใน "พัสดุมีปัญหา" · ใบที่ถูก **เลิกผูก** (unlink ลบแถว) ประวัติหายตามแถว — ยอมรับ
- ตรรกะเป็น allow-list + fail-closed: carrierStatus ที่ไม่รู้จัก = ไม่นับ (ตาม convention enum-value-removal)

## 2. โน้ตจดเอง — ตารางใหม่ตารางเดียว

```prisma
model CustomerNote {
  id              String   @id @default(uuid())
  customerId      String
  shopId          String            // scope การมองเห็น — โน้ตไม่มีวันข้ามร้าน
  text            String   @db.Text // จำกัด 500 ตัวอักษรที่ validation
  createdByUserId String?           // SetNull เมื่อลบพนักงาน — โน้ตของร้านไม่หายตาม
  createdAt       DateTime @default(now())
  @@index([customerId, shopId])
}
```
- เห็น/สร้าง/ลบได้เฉพาะสมาชิกร้านตัวเอง (scope `shopId` ใน WHERE ทุก query)
- insert + delete เท่านั้น ไม่มี edit (โน้ตสั้น ลบแล้วจดใหม่ง่ายกว่า และไม่ต้องทำ audit การแก้)

## 3. API

`GET /api/seller/customers/[id]/risk` (guard: `requireGeneralShop` + ลูกค้าต้องเคยมีความสัมพันธ์กับร้าน
หรือถูกอ้างจาก flow ค้นหา — ดู SRS ตอน implement)

```jsonc
{
  "returned": 2, "problem": 1, "codRefund": 1, "buyerCancelled": 0,
  "totalOrders": 7,          // ออเดอร์ทั้งหมดของเบอร์นี้ทั้งแพลตฟอร์ม (ตัวหาร)
  "shopsInvolved": 3,        // จำนวนร้านที่ข้อมูลมาจาก — บอกน้ำหนักหลักฐาน
  "notes": [ { "id", "text", "createdAt", "authorLabel" } ]   // เฉพาะร้านตัวเอง
}
```
- ข้ามร้านคืน**เฉพาะตัวเลขรวม** — ไม่มีชื่อร้านอื่น/เลขออเดอร์/รายละเอียดใด ๆ ของร้านอื่น (กัน PII/ความลับทางค้ารั่ว)
- `POST /api/seller/customers/[id]/notes` + `DELETE /api/seller/customers/[id]/notes/[noteId]`

## 4. จุดแสดงผล — component เดียวใช้ซ้ำ

Pattern ต้นแบบ = กล่องเตือนของ BookingForm ("เบอร์นี้มีประวัติการจองที่ถูกยกเลิก X ครั้ง"):
**เตือนอย่างเดียว ไม่บล็อกการขาย** ทุกจุด

| จุด | รูปแบบ |
|---|---|
| ค้นหาลูกค้าตอนสร้างออเดอร์ (`CustomerSearchSheet`/`CustomerSelectBlock`) | แถบ warning ใต้ลูกค้าที่เลือก: "เบอร์นี้มีประวัติ: ตีกลับ 2 · ปฏิเสธ COD 1 — จาก 3 ร้านบน Deep" |
| หน้า `/customers` (ตาราง + โปรไฟล์ลูกค้า) | badge จำนวนในแถว + การ์ด "ความเสี่ยงการจัดส่ง" ในโปรไฟล์ + กล่องโน้ตของร้าน |
| แผงลูกค้าในห้องแชท (`CustomerPanel`) | แถวสรุปย่อ 1 บรรทัด ใต้หัวลูกค้า |

- ตัวเลข = ข้อเท็จจริงดิบ + จำนวนร้านที่มา — **ไม่มี** risk score/เกรดสี
- ไม่มีประวัติเลย = **ไม่ render อะไรเลย** (ไม่โชว์ "ความเสี่ยง 0" — no-news-is-no-card)
- โทนสี: warning amber ตาม token ธีม (ไม่ใช่แดง — เตือนให้ระวัง ไม่ใช่ตัดสินว่าผิด)

## 5. Out of scope เฟสนี้ (YAGNI)

Risk score/เกรด · ระบบ report/appeal ของลูกค้า · การบล็อกสร้างออเดอร์ · ผลต่อ Trust Score ·
แยกหมวด "ติดต่อผู้รับไม่ได้" (รอ mapping เพิ่มจาก iShip) · โน้ตแชร์ข้ามร้าน (แม้แบบเลือกหมวด)

## 6. Testing

- unit: `customer-risk.ts` (mapping/นับ ต่อสถานะ, fail-closed ต่อค่าใหม่) — vitest, mock prisma
- unit: notes scope — ร้าน A มองไม่เห็นโน้ตร้าน B (WHERE shopId)
- E2E ตาม TestCase.md ของ feature docs (Playwright, bypass login ตาม convention)
