# Deferred Backlog — รอ parallel stream commit ก่อน (2026-05-16)

> งานที่ **ทำได้แล้วทันที** แต่ถูก block ด้วย pre-flight rule: ไฟล์เป้าหมายมี
> uncommitted work ของ parallel stream (Anuphan Hard Rule 5 + OMS) อยู่ —
> แตะ/commit ตอนนี้ = clobber งาน stream อื่น. **ไม่ใช่ skip — รอ unblock.**

## วิธีเช็คว่า unblock แล้ว
`git status --short` — ถ้าไฟล์ใน "ไฟล์ที่ block" ของแต่ละ item **ไม่อยู่ใน M list**
แล้ว = parallel stream commit แล้ว → ทำ item นั้นได้เลย. ทำทีละ item, แต่ละ
item = atomic commit, tsc 0, ตาม convention เดิม (theme-copy/Anuphan/S-C*).

## Items (เรียงตามคุณค่า)

### 1. seed: badge naming + verification records
- **ทำอะไร:** `prisma/seed.ts` — (a) badge nameEN "Seller Only Badge"/"Buyer
  Only Badge"/"Any Audience Badge" เป็น test artifact ไม่ตรง PRD achievement
  system → เปลี่ยนให้ตรง PRD (หรือเอาออกถ้าไม่ใช่ achievement จริง).
  (b) เพิ่ม verification records ให้ test seller (`0000000001`) — L1 PHONE_OTP
  APPROVED อย่างน้อย เพื่อให้ S18 verification upload flow QA E2E ได้ครบ
  (B9 QA NOTE: ตอนนี้ seller มี 0 verification record → upload CTA ไม่โผล่).
- **Block file:** `prisma/seed.ts` (parallel M — OMS Task 8 seed work)
- **Ref:** retro action #5; B9 QA NOTE S18-1a

### 2. maskContact shared util (DRY + จุด harden เดียว)
- **ทำอะไร:** สกัด `maskContact` (last-4 + bullets) เป็น util เดียว (เช่น
  `src/lib/pii.ts`) — ตอนนี้ inline ซ้ำ ≥5 จุด: customers/page.tsx,
  CustomerDetails.tsx, dashboard/page.tsx, products/[id]/page.tsx,
  orders/[token]/page.tsx. แทนที่ทุก inline ด้วย import. harden email-mask
  (เดิมโชว์ TLD 4 ตัวท้าย — security ว่า low-risk แต่ทำทีเดียวตอนรวม util).
- **Block file:** `dashboard/page.tsx` (parallel M) + อาจมีอื่นใน seller M list
- **Ref:** retro action #2 + #10; security-conventions S-C1

### 3. typed session shape (kill systemic `(session as any)?.user`)
- **ทำอะไร:** สร้าง typed session helper/module-augmentation แทน
  `(session as any)?.user` ที่ใช้ทุก seller page (~9+ ไฟล์). ทำเป็น sweep
  เดียว type-safe.
- **Block file:** seller pages หลายตัวใน parallel M list (dashboard/verification ฯลฯ)
- **Ref:** retro action #3; agent-team-workflow lesson

### 4. auth.ts shop-create route ผ่าน shop.service
- **ทำอะไร:** `src/lib/auth.ts` task #9 ทำ inline `prisma.shop.create`+
  `user.update` ใน `$transaction` เอง. `createShop` service ตอนนี้รับ logo +
  $transaction แล้ว (commit `262b009`) → ให้ auth.ts เรียก `createShop` แทน
  inline (DRY, จุด atomic เดียว). ระวัง: auth.ts ทำใน $transaction กับ
  user create อยู่แล้ว — ต้องคง atomicity (อาจต้องให้ createShop รับ tx client
  หรือ refactor ระวัง). ผ่าน safepay-security (แตะ auth.ts).
- **Block file:** `src/lib/auth.ts` (parallel M — Anuphan/OMS)
- **Ref:** retro action #8; B-phase #9 reviewer nice-to-have

## ทำเสร็จแล้ว (อ้างอิง — ไม่ต้องทำซ้ำ)
StatStrip ลบ `424f912` · S7 review card `fa04de1` · createShop logo+$txn
`262b009` · OMS tsc verified-clean (no-op) · order-500 `959b7cd`.
