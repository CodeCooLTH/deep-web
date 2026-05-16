# SafePay — Seed & Env Convention

## DB ที่แต่ละ context ใช้

| Context | ไฟล์ env | DB จริง |
|---|---|---|
| `next dev` (dev server) | `.env.local` (Next.js โหลดอัตโนมัติ) | Supabase (pgbouncer, port 6543) |
| `npm run migrate` | `.env` (dotenv -e .env) | Local Docker Postgres |
| `npm run test` | `.env` (dotenv -e .env) | Local Docker Postgres |
| `npm run seed:local` | `.env` (dotenv -e .env) | Local Docker Postgres |
| `npm run seed:supabase` | `.env.local` (dotenv -e .env.local) | Supabase (DIRECT_URL, port 5432) |

**ปัญหา split-brain**: `next dev` อ่าน `.env.local` → Supabase. แต่ `npx tsx prisma/seed.ts` โดยตรง (ไม่มี dotenv wrapper) จะอ่านจาก `.env` หรือ shell env ปัจจุบัน ถ้า shell ไม่ได้ set `DATABASE_URL` ไปที่ Supabase ก็จะ seed Docker แทน → QA เห็น data ไม่ตรงกับ dev server.

## วิธี seed ที่ถูกต้อง

### Seed Supabase (สำหรับ QA / dev server)

```bash
# ใช้ npm script ที่เตรียมไว้
npm run seed:supabase
```

หรือ manual (เทียบเท่า):

```bash
npx dotenv -e .env.local -- npx tsx prisma/seed.ts
```

seed.ts จะอ่าน `DIRECT_URL` (non-pooled, port 5432) จาก `.env.local` โดยอัตโนมัติ ไม่ผ่าน pgbouncer → ไม่มี FK race condition.

### Seed Docker (สำหรับ local dev/test)

```bash
npm run seed:local
```

## วิธีรัน Vitest (unit tests)

```bash
npm run test
# ใช้ dotenv -e .env → local Docker Postgres
```

**ห้ามรัน `npx vitest` โดยตรงจาก shell ที่มี `.env.local` โหลดอยู่** เพราะ `cleanDatabase()` ใน `tests/setup.ts` จะลบ data ทั้งหมดใน Supabase รวมถึง seed data สำหรับ QA.

`tests/setup.ts` มี guard ตรวจ `DATABASE_URL` — ถ้าชี้ไป Supabase จะ throw error ทันที ก่อน wipe DB.

## Test accounts (Supabase)

หลัง `npm run seed:supabase`:

| Account | Phone | OTP | บทบาท |
|---|---|---|---|
| Primary seller | `0920791649` | `123456` | testuser, มีร้าน + 8 สินค้า + 10 คำสั่งซื้อ + 3 รีวิว |
| 2nd seller | `0000000001` | `123456` | btpremium_suksawat, มีร้าน + 5 สินค้า + 4 คำสั่งซื้อ |
| Admin | — | — | admin user (no phone login) |

## connection_limit บน Supabase pgbouncer

`.env.local` DATABASE_URL ปัจจุบัน: `?pgbouncer=true&connection_limit=1`

`connection_limit=1` = Prisma จะมี pool แค่ 1 connection ไว้ส่งให้ pgbouncer. ปลอดภัยสำหรับ serverless (หลาย lambda instance แต่ละตัวมี 1 conn) แต่สำหรับ Next.js SSR บน single process ที่รัน concurrent requests หลายอัน `connection_limit=1` ทำให้ request ต่อแถว → timeout และ silent error (พบใน B3: badge query fail).

**แนะนำ**: เพิ่มเป็น `connection_limit=5` สำหรับ dev เพื่อ handle concurrent SSR requests. Supabase free tier รองรับ max 60 client connections รวม — 5 จาก dev server ไม่กระทบ limit.

```
# .env.local — เปลี่ยน connection_limit
DATABASE_URL="...?pgbouncer=true&connection_limit=5"
```

สำหรับ migration และ seed: ใช้ `DIRECT_URL` (port 5432, non-pooled) ไม่ใช่ pooled URL — Prisma docs กำหนดว่า migration ต้องไม่ผ่าน pgbouncer.

## ทำไม seed ต้องใช้ DIRECT_URL ไม่ใช่ DATABASE_URL (pgbouncer)

pgbouncer บน Supabase ทำงานใน **transaction mode**: assign connection ต่อ 1 transaction แล้วคืน pool. เมื่อ seed ทำ `shop.create()` แล้วตามด้วย `product.create()` บน connection คนละ session (pgbouncer สลับ) บางกรณี FK ของ `Product_shopId_fkey` ตรวจ parent ก่อนที่ prior write จะ visible → P2003.

ใช้ DIRECT_URL (port 5432 = persistent connection) หลีกเลี่ยงปัญหานี้ทั้งหมด.
