# Prod DB Safety — Hard Rule 14

> **บริบทที่ทำให้กฎนี้จำเป็น:** dev DB = prod DB ตัวเดียวกัน (Supabase project
> `spdihgeisieelbexfirk` แชร์กันทุก worktree) คำสั่งที่ "รีเซ็ตฐานเพื่อทำงานบางอย่าง"
> จึงไม่ได้รีเซ็ตฐานทดสอบ แต่ลบข้อมูลลูกค้าจริง

---

## เหตุการณ์ที่ทำให้เกิดกฎนี้ — 2026-07-31 22:37 น.

ฐาน Supabase ถูกล้างทั้งฐาน: 64 ตาราง drop แล้วสร้างใหม่ ข้อมูลลูกค้าหายทั้งหมด
(User/Shop/Order/Review/Conversation/ChatMessage/Product/Badge/Wallet — ทุกตาราง)

คำสั่งที่ทำ รันใน worktree `feature-auto-reply`:

```bash
npx dotenv -e .env.local -- npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-migrations prisma/migrations \
  --shadow-database-url "$(grep -m1 DIRECT_URL .env.local | cut -d= -f2- | tr -d '"')" \
  --script
```

**shadow database คือฐานทิ้งขว้าง** — Prisma drop ทั้ง schema แล้ว replay migration
ใหม่ทั้งชุดลงไป เพื่อคำนวณ diff คำสั่งนี้เอา `DIRECT_URL` ของ prod ไปใส่ตรงนั้น
Prisma จึงทำกับ prod ตามที่มันถูกออกแบบมาให้ทำกับ shadow DB

### ทำไมกลไกที่มีอยู่ถึงกันไม่ได้เลย

| ชั้นที่มี | ทำไมไม่ทำงาน |
|---|---|
| Hard Rule 13 + `test-db-guard.sh` | ตรวจแค่ **ไฟล์เทสตอนถูกเขียน** — นี่คือคำสั่งที่รันในเทอร์มินัล ไม่ใช่ไฟล์ |
| `tests/setup.ts` allowlist | คุมแค่ Prisma client ของชุดเทส — คำสั่งนี้ไม่ผ่าน `tests/setup.ts` |
| สายตาคน / code review | คำสั่งไม่มีคำว่า `delete`/`drop`/`reset` สักคำ อ่านแล้วเหมือนคำสั่งอ่านอย่างเดียว |

**บทเรียน:** ตัวทำลายไม่ได้อยู่ที่ *ชื่อคำสั่ง* แต่อยู่ที่ *อาร์กิวเมนต์ที่ชี้ผิดฐาน*
guard ที่ตรวจแค่ keyword อันตรายจึงมองไม่เห็น

### ร่องรอยที่ใช้ยืนยัน (ไว้ใช้ตรวจซ้ำถ้าเกิดอีก)

```sql
-- 1. ตารางถูกสร้างใหม่จริงไหม: reltuples = -1 คือ "ไม่เคยมีแถวเลยตั้งแต่สร้าง"
SELECT relname, reltuples::bigint FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY reltuples DESC;

-- 2. ประวัติ migration หายไหม (หาย = schema ถูก drop ไม่ใช่ลบทีละแถว)
SELECT * FROM information_schema.tables WHERE table_name LIKE '%prisma%';

-- 3. คอลัมน์ที่เพิ่งเพิ่มล่าสุดยังอยู่ไหม (หาย = ถูก rebuild จาก migration ชุดเก่า)
SELECT column_name FROM information_schema.columns WHERE table_name = 'ChatMessage';
```

---

## กฎ

🛑 **คำสั่งที่ล้าง/สร้าง schema ใหม่ได้ ต้องพิสูจน์ได้จากตัวคำสั่งเองว่าเป้าหมายคือ
Postgres บนเครื่องตัวเอง** — อะไรที่พิสูจน์ไม่ได้ ถือว่าเป็น prod

หลักการเดียวกับ `tests/setup.ts`: **allowlist / fail-closed** ไม่ใช่ denylist
เพราะ denylist พลาดได้เสมอเมื่อมีวิธีใหม่ที่ยังไม่มีใครนึกถึง (เช่น shadow DB)

### สิ่งที่ถูกบล็อก

| คำสั่ง | เหตุผล |
|---|---|
| `--shadow-database-url` / `SHADOW_DATABASE_URL=` ที่ไม่ใช่ localhost | ต้นเหตุ 2026-07-31 — Prisma drop schema ของ shadow DB เสมอ |
| `prisma migrate reset` | drop ทั้ง schema แล้ว replay migration |
| `prisma db push --force-reset` / `--accept-data-loss` | ล้างข้อมูลเพื่อให้ schema ตรง |
| `prisma migrate dev` | เจอ drift เมื่อไหร่จะเสนอ reset ทั้งฐาน — ใช้ `migrate deploy` แทน |
| `prisma db pull` | ทับ `schema.prisma` และลบ EXCLUDE/partial-unique ที่ introspection มองไม่เห็น (feat 00008/00017/00024) |
| `supabase db reset` | ล้างฐานทั้งลูก |
| `psql` ที่มี `DROP TABLE/SCHEMA/DATABASE`, `TRUNCATE`, `DELETE FROM` ไม่มี `WHERE` | ลบตรง ๆ |
| `playwright test` / `npm run e2e` | `playwright.config.ts` โหลด `.env.local` = prod และ `e2e/helpers/auth.ts` ลบ User/Shop/Product จริง |

### วิธีทำเมื่อจำเป็นจริง

ปักหมุด URL localhost ไว้ใน **ตัวคำสั่งเอง** — ห้ามใช้ `$(...)` หรือตัวแปรที่อ่านจาก
`.env.local` เพราะ guard พิสูจน์ไม่ได้ว่ามันชี้ที่ไหน:

```bash
# ✅ ผ่าน — เห็น localhost ในคำสั่งตรง ๆ
DATABASE_URL="postgresql://safepay:safepay@localhost:5544/safepay" npx prisma migrate dev --name x
npx prisma migrate diff --to-migrations prisma/migrations \
  --shadow-database-url "postgresql://safepay:safepay@localhost:5544/shadow"

# ❌ บล็อก — พิสูจน์ไม่ได้ว่าชี้ที่ไหน
npx prisma migrate diff --shadow-database-url "$DIRECT_URL"
npx prisma migrate diff --shadow-database-url "$(grep DIRECT_URL .env.local | cut -d= -f2-)"
```

### สิ่งที่ยังทำได้ตามปกติ

`migrate deploy` (ทางที่ถูกต้องสำหรับ prod), `migrate status`, `generate`, `validate`,
`psql` ที่ SELECT หรือ DELETE ที่มี WHERE, `vitest`, `npm run dev/build`,
และการ `grep`/`rg`/`echo` ที่ *พูดถึง* คำสั่งเหล่านี้ (guard ตัดข้อความในเครื่องหมาย
คำพูดออกก่อนตัดสิน จึงไม่บล็อกการสืบค้น)

---

## การบังคับใช้

`.claude/hooks/prod-db-guard.sh` — **PreToolUse บน Bash** ตรวจตอนจะรันคำสั่ง
(ต่างจาก `test-db-guard.sh` ที่เป็น PostToolUse บน Write/Edit และเห็นแค่ไฟล์เทส)

ติดตั้ง 2 ที่โดยตั้งใจ:

1. **ในรีโป** `.claude/settings.json` — committed ติดไปกับโค้ด ใช้ได้กับ worktree
   ที่มี commit นี้และ clone ใหม่
2. **ระดับ user** `~/.claude/hooks/prod-db-guard.sh` + `~/.claude/settings.json` —
   ครอบ worktree ที่ยังไม่ได้ merge (ตอนเกิดเหตุมี 9 worktree รันพร้อมกัน ถ้ารอ merge
   ก็ไม่มีใครถูกป้องกันเลย)

สคริปต์มี scope check (`*safepay*|*deepthailand*|*deepth.local*`) เพื่อไม่ให้กฎเฉพาะ
โปรเจกต์นี้ไปบังคับใช้กับโปรเจกต์อื่นบนเครื่องเดียวกัน

**เมื่อแก้สคริปต์ ต้อง sync ทั้งสองที่:**

```bash
cp .claude/hooks/prod-db-guard.sh ~/.claude/hooks/prod-db-guard.sh
```

---

## สิ่งที่กฎนี้ยัง**ไม่**แก้ (หนี้ที่เหลือ)

1. 🛑 **รากของปัญหาคือ dev DB = prod DB ตัวเดียวกัน** — guard ทุกชั้นเป็นแค่การกัน
   อุบัติเหตุ ตราบใดที่ connection string ของ prod อยู่ในมือทุก worktree ความเสี่ยง
   ไม่เคยเป็นศูนย์ ทางแก้จริงคือแยกฐาน dev ออกมา
2. **PITR / backup** — ต้องมีเปิดไว้ ไม่งั้นเหตุแบบนี้กู้ไม่ได้เลย
3. **คำสั่งที่พิมพ์เองในเทอร์มินัล** — hook คุมได้เฉพาะคำสั่งที่ผ่าน Claude Code
   คนพิมพ์เองใน iTerm ไม่มีอะไรกั้น
4. **`prisma migrate deploy`** ยังรันได้ตามปกติ — ถ้าไฟล์ migration เองมี SQL
   ทำลายล้าง guard ไม่ได้ตรวจเนื้อใน
