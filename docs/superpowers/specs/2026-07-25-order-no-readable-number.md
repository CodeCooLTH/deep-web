# เลขคำสั่งซื้ออ่านง่าย (orderNo) — 2026-07-25

## โจทย์
User ต้องการให้ระบบมี "เลขคำสั่งซื้อ" อ่านง่าย รูปแบบ `DP25690751043FB1` แทนการโชว์โค้ด 8 หลักดิบ

## Format (ล็อก)
```
DP  2569      07       51043FB1
│   ปีพ.ศ.     เดือน     publicToken 8 ตัวแรก (พิมพ์ใหญ่)
DP  ← createdAt (timezone ไทย) →
```
- prefix คงที่ `DP`
- ปี = พ.ศ. (ค.ศ.+543) ของ `createdAt` คิดใน `Asia/Bangkok`
- เดือน = 2 หลักของ `createdAt` (ไทย)
- 8 ตัวท้าย = `publicToken.slice(0,8).toUpperCase()` (เดียวกับโค้ดที่ระบบโชว์เป็น `#code` เดิม)

ตัวอย่างจริง (backfill): `DP25690751043FB1` (token `51043fb1-…`), `DP25690774365CCE` (token `74365cce-…`)

## ทำไม deterministic (ไม่ใช่ running counter)
User กังวลเรื่อง race condition + performance เมื่อ user โตขึ้น. เพราะ 8 ตัวท้ายมาจาก `publicToken`
(สุ่มในตัว) → **ไม่มีตัวนับ**:
- ไม่มี race (ไม่ต้อง lock/atomic increment)
- ไม่ต้อง reset รายเดือน
- ไม่มีต้นทุน scale (ไม่ query/นับอะไร — คำนวณจากข้อมูลที่มีอยู่แล้ว)

## Data model
- `Order.orderNo String?` + `@@index([orderNo])` (index ธรรมดา ไม่ unique — เป็นป้าย/ค้นหา ไม่ใช่ identity;
  key จริงยังเป็น `publicToken` globally-unique). migration `20260725120000_order_no` (additive, applied prod)
- generate ตอน `createOrder` (หลัง create เพื่อใช้ publicToken/createdAt ที่ DB สร้าง) — `src/lib/order-no.ts`
- backfill ออเดอร์เก่า: `prisma/backfill-order-no.ts` (deterministic ต่อแถว — รันแล้ว 63/63)

## จุดที่แสดง orderNo (สลับจาก `#code8` เดิม)
- seller: orders list/table (`OrderCard`/`OrdersTable`/`OrdersList` cancel label), order detail (`StatusHero`),
  QR sheet (`OrderQrSheet`), dashboard (`RecentOrder`)
- แชท: การ์ดคำสั่งซื้อ (`OrderCardView` — ทั้ง bubble + right panel) ผ่าน enrich `orderCard.orderNo`
- buyer (Vuexy): `/o/[token]` (`OrderDetailMobile`), การ์ดในแชท buyer (`(buyer-app)/messages/.../ChatThread`)

seller pages ที่มี `publicToken`+`createdAt` อยู่แล้ว derive ด้วย `formatOrderNo()` (ผลลัพธ์ตรงกับ `orderNo` ใน DB);
การ์ดแชทใช้ `orderNo` ที่ enrich มา (ไม่มี createdAt ใน card data). fallback โค้ด 8 หลักถ้า `orderNo` null

## ระหว่างทาง
- แก้ HR7: `OrderCard.tsx` arbitrary `text-[11px]`/`text-[15px]` → token `text-2xs`/`text-base`/`text-sm`
- แก้ font-mono: `RecentOrder.tsx` เลิกใช้ `font-mono` (Anuphan ไม่มี glyph mono)
