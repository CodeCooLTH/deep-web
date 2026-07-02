# Shared DB Drift — Reconcile Plan (Category / Report)

> 2026-07-02 · investigation + แผน reconcile ให้ team ตัดสิน · complement `docs/conventions/prisma-shared-db-drift.md`

## 1. สรุปปัญหา
Shared Supabase (dev=prod) มี 2 migration + schema ที่ **ไม่มีในทุก branch/folder ของ git**:
- `20260607071349_add_category_taxonomy` → table `Category` (**19 rows**) + `Shop.categoryId`
- `20260607092931_add_report_system` → table `Report` (0 rows) + `User.isBlocked`

`prisma/migrations/` folder = 27, DB `_prisma_migrations` = 29 → drift 2 รายการ. `migrate dev` เห็น drift → เสนอ reset (ลบ DB) → **ห้ามใช้** (ใช้ migrate deploy แทน — convention doc).

## 2. ต้นตอ (forensics 2026-07-02)
มาจาก **worktree `home-redesign`** (branch `worktree-home-redesign` — ปัจจุบัน**ถูกลบแล้ว**, เหลือแต่ dangling commits) — มีคนรัน `prisma migrate dev` ใน worktree นั้น → apply ลง shared DB → ไม่เคย merge main:

| dangling commit | เนื้อหา |
|---|---|
| `158257f` | feat(category): Category model + Shop.categoryId FK (P1) |
| `a1278e0` | feat(category): seller signup category + auth.ts (P1 T8) |
| `5bca116` | feat(report): report + admin review/block API (P2 R3) |
| WIP stashes: `7fa249a`, `5ae0748`, `c7f9235` | WIP on worktree-home-redesign |

> Home Redesign = feature ที่ **paused กลาง P1** (memory `project_home_redesign_resume`, resume doc `docs/superpowers/plans/2026-06-07-home-redesign-RESUME.md`). Category/Report เป็น sub-project ของมัน. **code + schema + migration ยังกู้ได้** จาก dangling commits (ไม่ได้หายจริง แค่ branch ถูกลบ).
>
> (`ScamReport` บน main = คนละตัว — `449a5fd feat(scam)` committed แล้ว ไม่เกี่ยว drift นี้)

## 3. DB DDL ปัจจุบัน (as-applied)
```
Category: id text PK | name text | slug text (unique) | icon text | sortOrder int | isActive bool | createdAt timestamp
Shop.categoryId: text (FK → Category)
Report: id text PK | reporterId text | reportedUserId text | orderId text? | reason text | detail text? | status text | reviewedById text? | reviewedAt timestamp? | createdAt timestamp
User.isBlocked: boolean
rows: Category=19, Report=0
```

## 4. ทางเลือก reconcile (team ตัดสิน)

### Option A — **Recover + merge เข้า main (แนะนำถ้า Home Redesign จะไปต่อ)**
Home Redesign ยัง active (paused ไม่ใช่ cancel) → นำงาน Category/Report เข้า main ให้ครบ (schema+migration+code) แล้ว main จะตรงกับ DB
1. กู้ dangling: `git branch recover-category 158257f` (+ a1278e0) และ `git branch recover-report 5bca116` — review code
2. cherry-pick/merge schema (`Category`/`Report`/`Shop.categoryId`/`User.isBlocked`) + migration files + service/API/UI เข้า main ผ่าน PR ปกติ (review)
3. migration **apply บน DB แล้ว** → **ห้าม re-run**: หลังเอา migration file เข้า folder ใช้ `prisma migrate resolve --applied 20260607071349_add_category_taxonomy` + `..._add_report_system` (mark applied ไม่ execute) → `_prisma_migrations` ตรงกับ folder → drift หาย, migrate dev/deploy ปกติ
4. ⚠️ ต้องแน่ใจ file content ตรง DDL จริง (ข้อ 3) มิเช่นนั้น future migrate ยังเห็น diff

### Option B — **Baseline schema เข้า main (ถ้ายังไม่พร้อม merge code)**
เอาแค่ schema + migration file เข้า main (ไม่เอา service/UI) → tooling ตรง แต่มี dead schema
- เหมือน A ข้อ 3 (migrate resolve --applied) + เพิ่ม model ใน schema.prisma ตรง DDL — แต่ code ไม่ใช้ = สับสน ไม่แนะนำเว้นจำเป็น

### Option C — **Drop จาก DB (ถ้า Category/Report ถูกยกเลิก)**
ถ้าตัดสินว่าไม่ทำ Home Redesign Category/Report แล้ว → เขียน migration drop (ผ่าน migrate deploy) ลบ table + column
- ⚠️ **destructive**: เสีย Category 19 rows (dev/test data จาก worktree — ไม่ใช่ prod user data จริง แต่ยืนยันก่อน). ต้อง backup ก่อน

## 5. คำแนะนำ
- **ตอนนี้: ไม่ต้องทำ surgery** — convention migrate-deploy กัน reset trap แล้ว, DB extra tables ไม่กระทบ main (code ไม่ใช้). ปลอดภัยพอสำหรับ dev/deploy ต่อ
- **ตัดสินตอนกลับมาทำ Home Redesign:** ถ้าไปต่อ → **Option A** (recover+merge+migrate resolve); ถ้าเลิก → **Option C** (drop, backup ก่อน)
- **ห้าม `migrate dev` บน shared DB จนกว่า drift หาย** (ข้อ 4 A.3) — ทุกคนในทีมต้องรู้ (convention doc)

## 6. Recovery reference (dangling SHAs — กู้ได้ก่อน gc)
`158257f` (Category model), `a1278e0` (category signup+auth), `5bca116` (report API), WIP: `7fa249a`/`5ae0748`/`c7f9235`.
กู้: `git branch <name> <sha>` โดยด่วน (dangling อาจโดน `git gc` ลบ) — แนะนำสร้าง branch กันไว้เลยถ้าจะใช้
