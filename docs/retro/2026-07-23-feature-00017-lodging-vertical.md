# Retro — Feature 00017 Lodging Vertical (2026-07-23)

ประเภทกิจการ "บ้านพักตากอากาศ" ครบ 3 phase (P1 ห้องพัก / P2 การจอง / P3 แม่บ้าน)
เอกสาร 7/7, migration M1+M2+M3 apply prod, deployed main `0f62d355`

---

## What went right (anchor ที่ควรทำซ้ำ)

### R1 — spike พิสูจน์เดิมพันสถาปัตยกรรม "ก่อน" เขียนโค้ด
EXCLUDE constraint เป็นหัวใจของทั้ง P2 (กันจองทับ) ก่อนเขียน service ได้เขียน spike รันบน DB จริง
(transaction rollback + TEMP TABLE ไม่เหลือร่องรอย prod) พิสูจน์ 6 พฤติกรรม: `'[)'` semantics,
`WHERE status<>'CANCELLED'`, zero-regression ออเดอร์สินค้า, รูปร่าง error จริง
ถ้าไม่ทำ spike จะไปเจอตอน P2 เสร็จแล้วซึ่งแพงกว่ามาก และค้นพบ transaction-poisoning (25P02)
ที่ทำให้ต้องวาง retry loop ครอบ `$transaction` ทั้งก้อน

### R2 — reuse ของเดิมให้มากที่สุด แทนสร้างระบบคู่ขนาน
การจอง = `Order.type='BOOKING'` ไม่ใช่ตารางแยก → ได้ publicToken/slipFileId/customerId/review/
Trust Score/ประวัติออเดอร์/Access Gate (feat 00015) มาใช้ซ้ำทั้งหมด ส่วนที่สร้างใหม่จริงเหลือแค่
`Room`/`Housekeeper` + สูตรมัดจำ ทำให้ขอบเขตแคบกว่าการสร้าง PMS เต็มรูปหลายเท่า

### R3 — verify แทน assume ทุกจุดที่แตะของเดิม
- ตรวจ `btree_gist` มีจริงบน Supabase ก่อนพึ่งพา (ไม่เดา)
- verify ชื่อ icon ทุกตัวกับ iconify API ตาม convention `_seller-menu.ts` (เจอ 4 ตัวไม่มีจริง)
- เจอ GAP เชิงลบ: `createBusinessShop` ไม่เขียน `vertical` — ช่องฟอร์มจะเป็นของประดับถ้าไม่จับ

### R4 — Impeccable เป็น gate จริง ไม่ใช่พิธี
รัน detector ทุก commit UI + critique หน้าโปรไฟล์สาธารณะเจอ P0 จริง (ตัวเลข Shopee/Lazada ปลอม
บนหน้าที่ขายความน่าเชื่อถือ) + verified สีฟ้าแทนเขียว — แก้แล้ว deploy มีผลผู้ใช้ทุกคน

---

## Problems

### P1 — 🛑 spike ด้วย raw query ไม่ได้พิสูจน์ production path (บั๊กหลุดถึง prod)
spike ใช้ `$executeRaw` พิสูจน์ว่า EXCLUDE ทำงาน แต่ `createBooking` ใช้ **model call**
ซึ่งโยน error **คนละรูป**:
- `$executeRaw` → `PrismaClientKnownRequestError`, `meta.code='23P01'`, DETAIL ใน `meta.message`
- model call → `PrismaClientUnknownRequestError`, `meta=undefined`, DETAIL ใน `err.message`

ผล: `parseConflictRange` อ่านแค่ `meta.message` เลยแกะวันที่ชนไม่ออก → 409 ถูกแต่ไม่มี `conflict`
`isExclusionViolation` รอดเพราะเผอิญเขียนให้ทน 2 รูปแบบไว้ (ไม่งั้นจะเป็น 500)
ซ้ำ: regex `[^[]*` พังเพราะข้อความมี `'[)'::text` ที่มี `[` ข้างใน

จับได้ตอน **QA จริงผ่าน API** (fix `d0bb9dc6`) ไม่ใช่ตอน spike — deploy บั๊กไปแล้ว

### P2 — subagent ทั้ง session ไม่ส่งงานกลับ (6/6)
safepay-product ×2, safepay-ux ×1, safepay-qa ×1 + อื่น ๆ — dispatch แล้ว idle โดยไม่เรียก
SendMessage ทุกตัว ทั้งที่ prompt ย้ำเป็นบรรทัดแรก Controller ต้องทำเองทั้งหมด (Discovery,
PRD/BRD, Design Spec, QA) ซึ่งจนถึงตอนนี้ได้ผลดีกว่า แต่เสียเวลารอ + ทวงหลายรอบต่อตัว

### P3 — dev = prod ทำให้ทุก migration + ทุก test แตะข้อมูลจริง
apply M1/M2/M3 บน prod โดยตรง (ปลอดภัยเพราะ additive + ทดสอบก่อน) และ smoke test สร้าง/ลบ
ข้อมูลบน prod ต้องเก็บกวาดเองทุกครั้ง มีความเสี่ยงถ้าลืม cleanup

### P4 — Chrome MCP ต่อไม่ได้ → UI ไม่เคยถูกดูด้วยตา
เบราว์เซอร์เปิดค้าง profile เดียวกัน ตรวจได้แค่ HTTP/payload/DB (ทำงานถูก) ไม่ได้ตรวจ
visual quality — critique รอบเต็มยังทำไม่ได้

### P5 — node_modules symlink ข้าม worktree ทับ Prisma client
worktree `feat-chats-facebook` symlink `node_modules` มาที่โปรเจกต์นี้ → `prisma generate`
ที่ branch อื่นทับ client ของเรา ทำให้ tsc ฟ้อง error ปลอม (field ของ branch อื่น) จน
diagnose อยู่พักหนึ่งระหว่าง P2

---

## Root causes

- **P1:** spike ออกแบบมาพิสูจน์ "constraint ทำงานไหม" ไม่ได้ออกแบบให้พิสูจน์ "โค้ดที่เรียกจริง
  อ่าน error ได้ไหม" — เลือก raw query เพราะเขียนง่าย แต่ production ใช้ model call
- **P2:** ปัญหาเชิงระบบของ session (ไม่ใช่ prompt) — pattern เดียวกันทุกตัว
- **P3:** ข้อจำกัด infra ที่มีมาก่อน (บันทึกใน memory แล้ว) ไม่ใช่ของ feature นี้
- **P5:** การตั้ง worktree ที่ share node_modules ผ่าน symlink — Prisma client เป็น global mutable state

---

## Conventions to adopt

### C1 — spike ต้องพิสูจน์ด้วยเส้นทางเดียวกับ production path
ถ้า service ใช้ Prisma model call (`prisma.x.create`) spike ต้องใช้ model call ด้วย ไม่ใช่ `$executeRaw`
เพราะ error shape / transaction behavior ต่างกัน การพิสูจน์ constraint ทำงานไม่ได้แปลว่าโค้ด
handle error ถูก → เพิ่มใน `feedback_verify_dont_assume`

### C2 — error-shape helper ต้องทนหลายรูปแบบตั้งแต่แรก
Prisma error มี ≥2 รูป (Known/Unknown) ตามว่าเรียกผ่าน raw หรือ model — helper ที่แกะ error
(`isExclusionViolation`/`parseConflictRange`) ต้องอ่านทั้ง `meta.message` + `err.message` และ
regex ต้องไม่พึ่งโครงประโยครอบ ๆ (`[^[]*` พังกับ `'[)'::text`)

### C3 — cleanup ข้อมูลทดสอบบน prod ต้องเป็นส่วนหนึ่งของสคริปต์เทส ไม่ใช่ทำทีหลัง
ทุก smoke test ที่เขียน prod ให้ปิดท้ายด้วยการลบ/reset ในสคริปต์เดียวกัน + verify count กลับเท่าเดิม

---

## Action items

- [ ] (infra) แยก `node_modules` ของ worktree `feat-chats-facebook` ออกจาก symlink — หรืออย่างน้อย
      `prisma generate` ก่อนเชื่อ tsc/dev ในแต่ละ worktree (P5)
- [ ] (debt) `react-toastify` ตกค้างใน `(paces)` 2 ไฟล์ (settings, inventory) = ละเมิด HR9 — เก็บเป็น task แยก
- [ ] (debt) font-size 16 จุด + radius 1 ในหน้าโปรไฟล์สาธารณะ = type-ramp refactor คนละก้อน
- [ ] (visual) เมื่อ Chrome MCP ว่าง — ถ่ายภาพทุกหน้า + `/impeccable critique` รอบเต็ม
- [ ] promote C1/C2 เข้า memory (มีค่ากับทุก feature ที่ใช้ DB constraint)
