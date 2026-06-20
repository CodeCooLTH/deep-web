# Retro — Feature #00001 Login & Onboarding (Modal redesign)

> วันที่: 2026-06-18 · phase: Documentation-First feature เต็มรูป (PRD→build→QA)
> ผลลัพธ์: SIGNED-OFF — 9 commits, tsc 0, E2E happy-path PASS + 42/42 regression

## Problems + Root cause

1. **Modal auto-open ไม่ทำงานใน dev** (เจอตอน E2E)
   - evidence: `OnboardingGate.tsx` — modal ไม่เด้งทั้งที่ checklist ไม่ครบ
   - root cause: React StrictMode (dev) double-invoke effect → mount1 ตั้ง localStorage flag + เริ่ม fetch, cleanup ตั้ง `cancelled=true`, mount2 เห็น flag แล้ว `return` ก่อน fetch → fetch แรกโดน cancelled ไม่เปิด modal
   - fix: `ranRef` guard (กันรันซ้ำ) + ตัด `cancelled` (component คงอยู่บน dashboard, setState หลัง async ปลอดภัย)

2. **Shared dev/prod DB มี migration จาก branch อื่น** (เจอตอน migrate)
   - evidence: `migrate status` → 5 migration บน DB (category_taxonomy/report_system/auction/push_token) ไม่มี local
   - root cause: Supabase ตัวเดียวแชร์ทุก branch (รู้อยู่แล้ว — memory project_prisma_migration_env_targets)
   - mitigation: query `information_schema.columns` ยืนยัน column ใหม่ยังไม่มีก่อน ALTER (verify-don't-assume) → ปลอดภัย apply additive

3. **Subagent สมมติ endpoint/field ที่ไม่มีจริง**
   - evidence: OnboardingModal ใช้ `GET /api/users/me/badges` (ไม่มี) + `badge.nameTH` (schema มี `name`)
   - root cause: dev เดา API surface แทนตรวจ source
   - fix: Controller verify → สร้าง `/api/account/badge-progress` จริง + fix URL/field; **บทเรียน:** prompt dev ต้องสั่ง "ตรวจ route/field จริงก่อนใช้" (ทำแล้วบางตัว เช่น /api/upload — ตัวที่สั่งชัด dev ตรวจถูก)

## What went right (anchor)

- **Documentation-First ครบชุด** (PRD→BRD→SRS→SDS→DATABASE→API→Tests) ก่อน build → dev มี spec ชัด, scope ไม่ creep, subagent ตรวจพบ infra ที่มีอยู่ (badge SIGNUP_YEAR, Product fields) ลด scope
- **safepay-ux gate** ออก theme-source mapping ต่อ component → leaf components ใช้ Paces primitive ตรง ไม่มี arbitrary value เถื่อน (reviewer grep gate ผ่าน)
- **Parallel leaf-component dispatch** (3 ตัวอิสระ + lock prop contract) → เร็ว, integration ไม่ชน
- **Verify agent edits** (git-diff + tsc + grep หลังทุก batch) จับ nameTH/endpoint bug ก่อน QA
- **E2E capture จับ bug จริง** (StrictMode) ที่ tsc/review มองไม่เห็น

## Conventions to adopt

1. **Effect ที่ "รันครั้งเดียว + มี side-effect (localStorage/fetch→setState)" ต้องกัน StrictMode ด้วย `ranRef`** ไม่ใช่ `cancelled` flag อย่างเดียว — cancelled+flag ชนกันใน dev double-invoke
2. **ก่อน apply migration บน shared Supabase: query `information_schema` ยืนยัน column จริงก่อน** (อย่าเชื่อ local schema — มี migration branch อื่น)
3. **Prompt subagent ที่แตะ API: สั่ง "อ่าน route/service/schema จริงก่อน — ห้ามเดา endpoint/field"** (badge bug มาจากการเดา)

## Action items

1. ✅ fix OnboardingGate StrictMode (commit 48d6a17)
2. ✅ badge-progress route + API.md sync (9da69bb)
3. ✅ scope baseline S-001..010 (9da69bb)
4. ⏳ negative-case E2E (category>5, รูป>5MB, lat นอกไทย, skip-all) — schema validate แล้ว, UI E2E = Phase 2
5. ⏳ carry: S3 presigned preview URL, Facebook session pre-tick (OnboardingGate facebookPrefill ยังไม่ wire provider detect)
6. ⏳ push → deploy prod (รอ user ตัดสิน)
