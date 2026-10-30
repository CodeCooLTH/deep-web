# Retro — 00086 Service Staff Workflow (P1+P2+P3) · 2026-10-29

> สถานะตอนเขียน: โค้ดครบ ยังไม่ commit (รอ user รีวิวโค้ด) · เทสเต็ม 938 ไฟล์ / 12,656 เทส ผ่าน · browser QA P2+P3 ผ่าน · Impeccable critique แก้แล้ว (P0 + P1)

## 1. Problems

### P-1 🛑 migration ขึ้น prod ก่อน merge (2026-10-27)
- **evidence:** subagent P2-T1 ใช้ `E="DATABASE_URL=… DIRECT_URL=…"; env $E npx prisma migrate deploy` → zsh ไม่ word-split ตัวแปรที่ไม่ quote → `DIRECT_URL` ไม่ถูก override → Prisma อ่าน `.env` (Supabase prod) → `20261027100000/100100/100150/100200` ลง prod
- **ผลต่อเนื่อง:** CHECK `ShopMember_flags_admin_only_check` บน prod + โค้ดเก่าที่เลื่อนเป็น OWNER ไม่ล้างธง → เสี่ยง 500 ตอนเลื่อน/โอนเจ้าของ (user เลือกปล่อยไว้) · ต้องเพิ่ม `100210` (ใส่ CHECK กลับแบบปลอดภัยทั้งสองสภาพ) + `100220` (backfill ช่วงโค้ดเก่าสร้างงานไม่มี arrivalMode)

### P-2 ป้ายงานหน้าร้านยังเป็น "จองแล้ว" (P2 QA)
- **evidence:** `src/lib/service-status.ts` เดิมตัดสิน WALK_IN จาก `!hasAppointment` — งานหน้าร้านแบบใหม่มี `serviceStart` เลยตกเป็น BOOKED ทุกจอ (หน้างาน แชท ตารางงาน หน้าลูกค้า)

### P-3 หน้าเดียวมีป้ายสถานะ 2 ชุดขัดกัน (critique P0)
- **evidence:** `AppointmentCard.tsx` ใช้ `appointmentStageBadge` ขณะ `ServiceJobCard` ใช้ `resolveServiceStatusBadge` → "รับงานแล้ว" คู่กับ "กำลังให้บริการ" · หลังปิด "ให้บริการแล้ว" (เขียว) คู่กับ "ปิดงานแล้ว · ค้าง ฿6,500"

### P-4 งานที่มอบแล้วแต่ไม่มีเวลา ช่างมองไม่เห็นเลย (review M1)
- **evidence:** ทุกจอของช่าง (`/my-jobs`, TodayJobs, `/queues`) query ด้วย `serviceStart` · แถบล่างช่างไม่มี `/orders`

### P-5 ลบบัญชีไม่ปลดงาน (review M2)
- **evidence:** `account-deletion.service.ts:222` และ `reclaim/route.ts` ใช้ `shopMember.deleteMany` ตรง ข้าม `unassignMemberOpenJobs` · User soft-delete ⇒ FK SetNull ไม่ทำงาน

### P-6 ฐาน local มี push token จริง (QA P3)
- **evidence:** 8 token ของเจ้าของ/ผู้จัดการจริง · ปุ่มรับงาน/เริ่ม/เสร็จ/ปิดเรียก `pushToUsers` ทุกครั้ง · กันได้เพราะ QA agent ทำ guard เอง (12 ครั้งถูกดัก)

### P-7 เอกสารคลาดกับโค้ดหลายจุด
- **evidence:** docs agent พบ 8 จุด เช่น `FLAGS_NOT_AVAILABLE` (จริง `STAFF_FLAGS_NOT_AVAILABLE`), `/my-expenses` (จริง `/expenses/mine`), notification kind เดียว (จริง 4 kind), path claim `/claim` (ชนกับ buyer claim 00015 — จริง `/assign/claim`)

## 2. Root causes

- **P-1:** กฎ HR14 บอก "ปักหมุด URL" แต่ไม่ได้ห้าม *วิธี* ปักผ่านตัวแปร · prompt ของ subagent ไม่ได้ย้ำ — agent เลือกวิธีที่ดูสะอาดกว่า · ไม่มี guard ที่จับ `migrate deploy` ชี้ prod (hook `prod-db-guard` ดูเฉพาะคำสั่งล้าง schema)
- **P-2:** แผน P2 เพิ่ม "ค่าที่เก็บ" (`arrivalMode`) แต่ไม่ได้ไล่ **ทุกฟังก์ชันที่เคย derive ความหมายเดียวกันจากข้อมูลอื่น** (`hasAppointment` → WALK_IN)
- **P-3:** สถานะใหม่ (IN_SERVICE / FINISHED_AWAITING_CLOSE) เพิ่มที่ helper กลาง แต่การ์ดพี่น้องบนหน้าเดียวกันมี source ของตัวเอง — ไม่มีกฎ "หนึ่งหน้า หนึ่งป้ายสถานะ"
- **P-4:** ตัดสินจอของช่างจาก "วันที่" ไม่ใช่จาก "ใครถือ" — ไม่มี invariant ว่า *ทุกงานที่มอบให้คนหนึ่งต้องมีที่อยู่ในจอของคนนั้น*
- **P-5:** การลบ membership กระจายอยู่ 3 ที่ (`removeShopMember`, account deletion, reclaim) — hook ตอนลบไปผูกที่ service เดียว
- **P-6:** มองว่า "ฐาน local = sandbox" ทั้งที่ฐานเป็น clone ของจริง และบริการปลายทางเป็นของจริง
- **P-7:** เอกสารออกแบบเขียนก่อนโค้ด (ถูกตาม HR11) แต่ระหว่างทำมีมติใหม่หลายรอบ — sync ปลายทางรอบเดียวจึงเจอเยอะ

## 3. Conventions to adopt

1. **ปักหมุด URL ต้องเป็นตัวอักษรในคำสั่งเท่านั้น** — ห้ามผ่านตัวแปร/`env $VAR` · ต้องเห็นบรรทัด `Datasource … at "localhost:5434"` ก่อนเชื่อผล (เพิ่มใน HR14 แล้ว 2026-10-27)
2. **Browser QA ที่กดปุ่มส่งแจ้งเตือนต้องเปิด dev ด้วย `scripts/qa-block-external.cjs`** → [[docs/conventions/local-qa-blocks-external-side-effects]]
3. **เพิ่มค่าที่เก็บแทนค่าที่ derive ⇒ grep ทุกฟังก์ชันที่ derive ความหมายเดิม** (ใน 00086 คือ `deriveServiceStatus`, `appointmentStageBadge`, `serviceProgressStage`) แล้วระบุใน plan เป็นรายการ
4. **หนึ่งหน้า หนึ่งป้ายสถานะ** — การ์ดพี่น้องบนหน้าเดียวกันต้องอ่านจาก helper เดียวกัน หรือซ่อนป้ายของตัวเอง (`hideStageBadge`)
5. **งานที่มอบให้ใคร ต้องมีที่ในจอของคนนั้นเสมอ** — แผนที่เพิ่ม "ผู้รับผิดชอบ" ต้องไล่ทุกสภาพของงาน (ไม่มีเวลา / ข้ามวัน / ค้าง) ว่าโผล่ที่ไหน
6. **ผลข้างเคียงตอนลบสมาชิก ต้องหาทุกจุดที่ลบแถว ShopMember** (`rg "shopMember.delete"`) ไม่ใช่แค่ service หลัก

## 4. What went right

- **Mutation check ทุก task** — เทสที่ไม่แดงเมื่อลบกฎถูกจับได้ทันที · ตัวที่รอดถูกอธิบายว่าเป็น equivalent mutation (มีด่านชั้นสอง)
- **แบ่งไฟล์ให้ agent ชัด** — รันพร้อมกัน 3 ตัวโดยไม่ชนไฟล์ · บอก "ห้ามแตะไฟล์ของ agent อื่น" ตรง ๆ ใน brief
- **UX spec gate ก่อนทำจอ** — ตัดสินเรื่องขัดกับ mock ล่วงหน้า (สีปุ่มทำเสร็จ, ไม่ใส่ `capture`, ไม่โชว์ชื่อช่าง)
- **Reviewer → QA → critique เป็นสามด่านจริง** — แต่ละด่านเจอของที่ด่านก่อนไม่เจอ (M1/M2 จาก review, ป้ายหน้าร้านจาก QA, ป้ายซ้อนจาก critique)
- **หลัง incident ใส่กฎ DB ใน brief ทุกตัว** — ไม่มี agent ไหนแตะ prod อีก

## 5. Action items

1. ก่อน merge: นับแถว `Order` บน prod (index ใหม่ใน `100300` สร้างใน transaction) — ถ้าหลักล้านแยกเป็น `CONCURRENTLY`
2. ก่อน merge: ยืนยันสภาพ CHECK `ShopMember_flags_admin_only_check` บน prod (user เลือกปล่อยไว้) — `100210` ปลอดภัยทั้งสองสภาพ
3. ก่อน merge: เทียบ checksum `_prisma_migrations` บน prod ของ `100000/100100/100150/100200` กับไฟล์ (ห้ามแก้ไฟล์ทั้ง 4)
4. QA แนบรูปใน WebView แอปผู้ขาย iOS + Android (ไม่มี `capture` — ต้องเลือกจากคลังได้)
5. follow-up แยก: `/api/files` ยังเสิร์ฟรูปงานให้ทุกคนที่มีลิงก์ + ไม่ตรวจเจ้าของ fileId (ไม่มี upload ownership record)
6. follow-up แยก (ของเดิม): เมนูซ้ายของช่างโชว์ราคาแพ็กเกจ · หน้าแรกช่างยังมีตัวนับ/เมนูลัดเดิม
7. พิจารณาเพิ่ม hook จับ `prisma migrate deploy` ที่ไม่มี `localhost:5434` ตัวอักษรในคำสั่ง (ต่อยอด `prod-db-guard`)
8. commit retro + convention แยกจาก feature commit ตอน user สั่ง commit
