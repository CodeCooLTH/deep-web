# การ deploy รัน migrate ให้อยู่แล้ว — อย่าสั่งเอง (Hard Rule 15)

**สถานะ:** ยืนยันกับของจริงแล้ว 2026-08-04
**ที่มา:** user ถามว่า "ตอน deploy มีการรัน migrate ไหม" แล้วพบว่ามีมาตลอด แต่ไม่มีใครเขียนไว้ที่ไหนเลย

---

## ข้อเท็จจริง

`vercel.json` บรรทัดที่ 4:

```json
"buildCommand": "prisma migrate deploy && prisma generate && next build"
```

**ทุก deployment รัน `prisma migrate deploy` ก่อน build เสมอ** โดยใช้ `DATABASE_URL`/`DIRECT_URL`
ของ environment นั้น ๆ (production → ฐาน prod)

หลักฐานที่วัดได้ 2026-08-04: push `6be36049` (มี migration `20260804120000_order_created_by`)
ขึ้น main → ไม่ได้รันคำสั่ง migrate ใด ๆ ที่ชี้ prod เลย → 3 นาทีต่อมาคอลัมน์
`Order.createdByUserId` + FK + index อยู่บน prod ครบ และ `_prisma_migrations` บันทึกเวลา
06:36:57 UTC ซึ่งคือเวลา build ไม่ใช่เวลาที่ใครนั่งรันมือ

## กฎ

### 1. ห้ามรัน migrate ที่ชี้ prod จากเครื่อง dev — ไม่มีเหตุผลให้ทำอีกแล้ว

push ขึ้น `main` คือการ migrate prod ในตัว การสั่งเองเพิ่มมีแต่ความเสี่ยง ไม่ได้แลกอะไรกลับมา
ฐาน prod เคยถูกล้างทั้ง 64 ตารางมาแล้วครั้งหนึ่งจากคำสั่ง Prisma ที่ชี้ผิดที่ (Hard Rule 14)

### 2. เมื่อ user สั่งหรือถามเรื่อง migrate ต้องแจ้ง 3 ข้อนี้เสมอ ห้ามเงียบ

| # | ต้องบอกว่า |
|---|---|
| 1 | **prod ไม่ต้องสั่งเอง** — push แล้วจบ |
| 2 | **ฐาน local ยังต้อง apply เอง** — Vercel เห็นเฉพาะฐานที่ deployment ชี้ ไม่เห็น Postgres ใน Docker บนเครื่อง user |
| 3 | **migrate ล้ม = build ล้ม = deploy ไม่ขึ้น** — `&&` หยุดทันที ของเก่ายังเสิร์ฟอยู่ ไม่มีสถานะครึ่ง ๆ กลาง ๆ |

ข้อ 3 มีนัยตามมา: เวลา migration พังบน prod **ต้องแก้ไฟล์ migration แล้ว push ใหม่**
ไม่ใช่กด "Redeploy" ใน Vercel (มันจะพังซ้ำที่เดิม)

### 3. ฐาน local ต้อง apply เอง — ปักหมุด localhost ในคำสั่ง (Hard Rule 14)

```bash
DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
npx prisma migrate deploy
```

ห้ามใช้ `$(...)` หรือค่าจาก `.env.local` มาประกอบ URL — พิสูจน์ไม่ได้จากตัวคำสั่งว่าชี้ที่ไหน
= ถือว่าเป็น prod

### 4. `migrate deploy` รันเฉพาะไฟล์ใน `prisma/migrations/`

SQL ที่เคยรันมือบน Supabase console โดยไม่มีไฟล์ migration กำกับ **จะไม่ถูกสร้างซ้ำ**
ในฐานใหม่หรือหลังกู้ฐาน — นี่คือเหตุผลที่ยังห้าม `prisma db pull` ตลอดกาล: introspection
มองไม่เห็น unmanaged SQL (partial unique index, CHECK constraint, trigger, RPC) แล้วจะ
พยายาม "แก้ให้ตรง schema" ซึ่งอาจ DROP ทิ้ง

unmanaged SQL ที่รู้จักตอนนี้ — ทั้งหมดอยู่ในไฟล์ migration แล้ว ถือว่าปลอดภัย:
- `Shop_vertical_check` (CHECK constraint 3 ค่า — feature 00028)
- `Shop_userId_personal_key` (partial unique index WHERE kind='PERSONAL' — feature 00008)
- `page_comment_realtime_broadcast()` (trigger function — feature 00029)

## กับดักที่เจอจริงระหว่างทาง

**migration ค้างกลางคันบล็อกทุกตัวถัดไป** — 2026-08-04 ฐาน dev มี `20260803170000_page_comments`
ที่ `finished_at = NULL` (started แต่ไม่จบ) ทำให้ `migrate deploy` พยายามรันซ้ำแล้วชนกับ
ตารางที่มีอยู่แล้ว (`42P07 relation "FacebookPost" already exists`) → migration ใหม่ทุกตัว apply ไม่ได้เลย

วิธีแก้ที่ถูก: **ตรวจว่า object ที่ migration นั้นสร้าง "มีครบจริง" ก่อน** แล้วค่อย
`prisma migrate resolve --applied <name>` — ห้าม resolve ทิ้ง ๆ ขว้าง ๆ เพราะการ mark ว่า
applied ทั้งที่ schema ไม่ครบ คือการโกหกประวัติ ซึ่งจะไปโผล่เป็นบั๊กตอนกู้ฐานหรือสร้างฐานใหม่

```sql
-- ตรวจก่อน resolve เสมอ (SELECT ล้วน ปลอดภัย)
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1);
SELECT conname FROM pg_constraint WHERE conname = ANY($1);
SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2;
```

**"มีแถวใน `_prisma_migrations`" ≠ "schema มีจริง"** — ฐาน prod เคยถูกล้างแล้วสร้างประวัติกลับมา
เวลาตรวจว่า prod ตรงกับไฟล์ไหม ต้องดู object จริงด้วย ไม่ใช่นับแถวในตารางประวัติอย่างเดียว

**จำนวนแถวใน `_prisma_migrations` มากกว่าจำนวนไฟล์ได้โดยไม่ผิด** — migration ที่เคย rolled back
แล้ว apply ใหม่จะมี 2 แถว (prod 2026-08-04: 102 แถว / 100 ไฟล์ จาก `chat_crm` กับ
`iship_status_synced_at` อย่างละ 2 แถว) อย่าตกใจว่ามีของแปลกปลอม ให้เทียบด้วย **ชื่อ** ไม่ใช่จำนวน
