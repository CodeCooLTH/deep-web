# Prisma migration บน shared DB (dev = prod) — ห้าม `migrate dev`

> 🛑 **กฎ:** migration ทุกครั้งบน Supabase (dev = prod ตัวเดียวกัน) ใช้ **`prisma migrate deploy` + hand-written migration file เท่านั้น — ห้าม `prisma migrate dev`**

## ทำไม

DB Supabase ที่ dev/prod แชร์กัน (memory `project_prod_deploy_setup`) มี **drift**: มี migration ที่ apply ลง DB แล้วแต่ **ไม่มีในโฟลเดอร์ `prisma/migrations/` ของ main และไม่มีใน branch ไหนเลย** (apply นอก git — local ที่ไม่ push / db push / manual):

| orphaned migration | สถานะ DB | ใน git |
|---|---|---|
| `20260607071349_add_category_taxonomy` | `Category` table (**~19 rows มีข้อมูลจริง**) + `Shop.categoryId` FK | ❌ ไม่มีที่ไหน |
| `20260607092931_add_report_system` | `Report` table (0 rows) + `User.isBlocked` | ❌ ไม่มีที่ไหน |

(ตรวจเมื่อ 2026-07-02: `prisma/migrations/` = 27, DB `_prisma_migrations` = 29)

### ผลกระทบต่อคำสั่ง

- **`prisma migrate dev`** → เห็น drift (DB มี migration ที่ folder ไม่มี) → **เสนอ `migrate reset` = ลบข้อมูลทั้ง DB** (เกือบพลาดมาแล้ว 2026-07-02 — piped stdin เลย abort เอง ไม่ reset). **ห้ามใช้เด็ดขาดบน shared DB**
- **`prisma migrate deploy`** → **ทนได้** — apply เฉพาะ migration ใน folder ที่ยังไม่ถูก apply, ไม่สนใจ orphaned entry ใน `_prisma_migrations`, ไม่ reset (พิสูจน์แล้ว: feature 00005 `add_bid_reaction` apply ผ่านทั้งที่มี drift)
- **`prisma db pull`** → ห้าม (memory `feedback_qa_agent_no_prisma_pull` — ทับ schema.prisma, ดึง orphaned model เข้ามา, ลบ uuid default)

## วิธีทำ migration ใหม่ (ปลอดภัย)

1. แก้ `prisma/schema.prisma` (เพิ่ม model/field)
2. **เขียน migration SQL เอง** ที่ `prisma/migrations/<timestamp>_<name>/migration.sql` (CREATE TABLE/ALTER ... — additive, ตรง Prisma convention: quoted identifiers, `TEXT`, FK `ON DELETE CASCADE ON UPDATE CASCADE`)
3. `npx dotenv -e .env.local -- npx prisma migrate deploy` (apply เฉพาะ pending → shared DB)
4. `npx prisma generate` + **restart dev server** (client เก่าไม่มี model ใหม่ → session 500)
5. verify ที่ DB layer ด้วย fresh client ก่อน UI QA

## ทำไมไม่ "ลบ drift ให้หมด"

- ไฟล์ migration ต้นฉบับ **หาย** → สร้างใหม่ checksum ไม่ตรง `_prisma_migrations` → `migrate deploy` อาจ error = **พัง prod deploy ทุกครั้ง**
- `Category` มี **19 rows จริง** → drop ทิ้ง = เสียข้อมูล (อาจเป็น feature ที่ทำค้างแล้วหลุด git)
- full reconcile ต้องแตะ `_prisma_migrations` บน shared prod → ต้อง team sign-off + backup ก่อน

## 🚩 Action item (team)
สืบว่า `add_category_taxonomy` (19 rows) + `add_report_system` มาจากไหน — feature ที่ทำค้างแล้วไม่ commit? ต้อง adopt เข้า main (backfill schema+code) หรือ drop? — เป็น decision ของ team ไม่ใช่แก้เงียบ ๆ
