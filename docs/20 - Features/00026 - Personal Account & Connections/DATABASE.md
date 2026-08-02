# DATABASE — Personal Account & Connections (feature 00026)

- **วันที่:** 2026-08-02
- **สถานะ:** deployed prod

## สรุป: ไม่มี migration

ฟีเจอร์นี้ **ไม่แก้ schema เลยแม้แต่ field เดียว** ทุกอย่างที่ต้องใช้มีอยู่ครบก่อนแล้ว

| ความต้องการ | ของที่มีอยู่แล้ว |
|---|---|
| ร้านส่วนตัว 1 ร้านต่อ user | partial unique index `Shop_userId_personal_key ON "Shop"("userId") WHERE "kind" = 'PERSONAL'` (migration `20260702000002_business_account_packages_owner_cutover`) |
| ผูก provider เข้าบัญชี | `model AuthAccount` + `@@unique([provider, providerAccountId])` |
| รหัสผ่าน | `User.passwordHash String?` |
| ชื่อ/รูป/ชื่อผู้ใช้ | `User.displayName` / `User.avatar` / `User.username @unique` |
| เบอร์โทร | `User.phone @unique` |
| สมาชิกร้านธุรกิจ (ใช้ตัดสินว่าจะโชว์ปุ่ม "กลับไปร้านเดิม") | `model ShopMember` + `@@index([userId])` |

## ข้อควรระวังที่สืบทอดมา

🛑 **ห้าม `prisma db pull` และ `prisma migrate dev` บนโปรเจกต์นี้** — partial unique index ด้านบนเป็น **unmanaged SQL** ที่ Prisma DSL ประกาศไม่ได้ (ไม่รองรับ partial index) introspection จะมองไม่เห็นแล้วพยายาม "แก้ให้ตรง schema" ซึ่งอาจ DROP มันทิ้ง — เมื่อนั้น user คนเดียวจะสร้างร้านส่วนตัวได้หลายร้าน ซึ่งเป็นกฎที่ทั้งฟีเจอร์นี้พึ่งพา (ดู `docs/conventions/prod-db-safety.md`, memory `project_shared_db_drift_no_migrate_dev`)

🛑 **`prisma migrate diff --shadow-database-url` ห้ามใช้กับ URL ที่ไม่ได้ปักหมุด localhost** — Hard Rule 14 (เหตุการณ์ 2026-07-31 ฐาน prod ถูกล้างทั้ง 64 ตาราง)

## Query ที่ฟีเจอร์นี้เพิ่ม

ทั้งหมดเป็น read ยกเว้นที่ระบุ — ไม่มี query ที่เขียนข้ามเจ้าของ

| จุด | query | scope |
|---|---|---|
| `/account` page | `authAccount.findMany({ where: { userId }, select: { provider } })` | session user เท่านั้น; select แค่ provider เพื่อไม่ให้ `providerAccountId`/`accessToken` หลุดเข้า RSC flight |
| `/account` page | `user.findUnique({ where: { id }, select: { displayName, username, avatar, email, phone, passwordHash } })` | `passwordHash` ถูกแปลงเป็น boolean ก่อนส่ง client |
| `check-username` | `user.findFirst({ where: { username, NOT: { id: userId } }, select: { id } })` | — |
| `otp-for-password` / `set-password-otp` | `user.findUnique({ where: { id: userId }, select: { phone } })` | เบอร์ไม่เคยออกจาก server แบบเต็ม |
| `set-password-otp` | **write** `user.update({ where: { id: userId }, data: { passwordHash } })` | ผูกกับ session user เสมอ ไม่รับ id จาก client |
| `PATCH /api/users/me` | **write** `user.update({ where: { id: userId }, data: pick(3 field) })` | allow-list 2 ชั้น (Valibot + pick ใน service) |

## สถานะข้อมูลจริงบน prod (2026-08-02, นับด้วย SELECT อย่างเดียว)

| | จำนวน |
|---|---|
| User ทั้งหมด | 10 |
| ไม่มี `phone` | 6 |
| มี `phone` | 4 |
| **ไม่มีทั้ง `phone` และ `passwordHash`** (login ได้ทางเดียวคือ OAuth, กู้คืนไม่ได้) | **5** |

ตัวเลขชุดนี้เป็นที่มาของ FR-PAC-11 (แถบเตือนบัญชีที่กู้คืนไม่ได้) — สมมติฐานที่ว่า "ทุกบัญชีผ่าน OTP ตอนสมัครอยู่แล้วจึงต้องมีเบอร์" ไม่จริง เพราะ `upsertOAuthUser` (`lib/auth.ts:52-59`) สร้าง User โดยไม่มี `phone` และหน้ารับคำเชิญเองก็ให้เลือก Facebook/LINE เป็นทางลัด
