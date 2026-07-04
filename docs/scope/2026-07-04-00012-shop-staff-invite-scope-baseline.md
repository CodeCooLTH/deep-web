# Scope Baseline — feat 00012 Shop Staff Invite Links

สถานะ: **DEPLOYED (AS-BUILT) — doc back-fill in progress**
> ฟีเจอร์นี้ implement เสร็จ + deploy prod แล้ว **ก่อน** เอกสารชุดนี้ถูกเขียน (ละเมิด Hard Rule 11 Documentation-First ย้อนหลัง — PRD/BRD ถูก back-fill พร้อมกับ baseline นี้). ถือเป็นหนี้เอกสารที่ปิดต่อ ไม่ใช่ signal ว่างานยังไม่เสร็จเชิง implementation

อ้างอิง: `docs/20 - Features/00012 - Shop Staff Invite Links/{PRD,BRD,SRS,SDS,DATABASE,API,Tests}.md` — FR-STAFF-01..14, BR-STAFF-01..15
· Design Spec: `docs/superpowers/specs/2026-07-04-shop-staff-invite-link-design.md`
· UX Spec: `docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md`
· Plan: `docs/superpowers/plans/2026-07-04-shop-staff-invite-link.md`
· Retro: `docs/retro/2026-07-04-00012-shop-staff-invite-link.md`
เจ้าของ scope: `safepay-product` · commit/สถานะ: Controller

## หมายเหตุก่อนเริ่ม (as-built)

Baseline นี้เขียน**ย้อนหลัง**จาก plan ที่ agent ทำงานตามจริง ใช้เป็น SSOT ของ "สิ่งที่ตกลงจะทำ" เทียบ "สิ่งที่ทำจริง". S-id map ตรงกับ Task ในแผน — "DONE (as-built)" = Controller commit + deploy แล้ว (git verified ผ่าน merge 0f2b197) แต่ **runtime E2E/regression QA ยังไม่รัน** (user เทส prod).

## Goal

ให้เจ้าของร้าน BUSINESS เชิญพนักงาน (ADMIN) เข้าร้านด้วยลิงก์แชร์ reusable (`deepthailand.app/i/<slug>`, มีวันหมดอายุ + revoke ได้) แทน contact-match invite เดิม (00008) — ผู้ถูกเชิญ login/accept แล้วเป็นแอดมินโดยไม่ถือเป็น seller (Lazy Personal shop) แต่เปิดร้านเองได้ภายหลัง, จัดการรวมที่เมนู "พนักงาน" → `/admins`, และมีหน้าเลือกร้านสำหรับผู้ใช้หลายร้าน (`/choose-shop`) — **โดยไม่ regress seller/onboarding flow เดิม**

## In-Scope

| ID | รายการ | Acceptance | สถานะ | Commit |
|----|--------|-----------|-------|--------|
| **S-1** | `ShopInviteLink` model + hand-written migration (Task 1.1) | migrate deploy สำเร็จไม่กระทบ table เดิม; `slug @unique` | DONE | 7a6bbce |
| **S-2** | `src/lib/invite-link.ts` — slug gen + URL + expiry options (Task 1.2) | unit test ผ่าน (7/7) | DONE | dd1ed81 |
| **S-3** | `invite-link.service.ts` — create/list/revoke/resolve/accept (Task 1.3) | quota atomic ที่ accept; idempotent; typed errors (20/20 test) | DONE | a67f003 |
| **S-4** | Owner API create/list/revoke (Task 2.1) | 403 non-owner; happy path | DONE | c8c6453 |
| **S-5** | Public API resolve + accept (Task 2.2) | ไม่รั่ว PII เมื่อ invalid; HTTP mapping; rate-limit | DONE | 6125d81 |
| **S-6** | `auth.ts` — gate `needsOnboarding/needsRegistration` ด้วย `!!personal` (Task 3.1) | seller เดิมไม่เด้ง; invited-only ไม่โดนเด้ง | DONE (**high-risk, ต้อง regression-verify**) | 5717e48 |
| **S-7** | ถอด `ensurePersonalShop` auto-create จาก layouts (Task 3.2) | seller เดิมเข้า dashboard ปกติ; invited-only ไม่มี Personal ถูกสร้าง | DONE (**high-risk**) | 1171538 |
| **S-8** | `proxy.ts` exempt `/choose-shop`+`/i` (Task 3.3) | invited-only ไม่โดน redirect loop | DONE | 4e75ac0 |
| **S-9** | `proxy.ts` main `/i/*` → seller redirect (Task 3.4) | main → 302/307 seller subdomain | DONE | 4e75ac0 |
| **S-10** [UI] | `/choose-shop` + `open-personal` API (Task 4.1) | 0/1/≥2 ร้าน routing; become-seller idempotent | DONE | ae1d46a |
| **S-11** [UI] | Landing `/i/[slug]` + `/i/invalid` (Task 4.2) | 3 states; ผ่าน safepay-ux | DONE | f23d90c |
| **S-12** [UI] | เมนู "พนักงาน" + หน้า `/admins` (Task 4.3) | เห็นเฉพาะ BUSINESS+OWNER; RSC guard; ไม่มี arbitrary value; pacesToast/Swal | DONE | 28b3a85 |
| **S-13** | Deprecate contact-match invite UI (Task 4.4) | ถอด form; ไม่ลบ ShopInvite data | DONE | ce48bcb |
| **S-14** | E2E QA + docs sync + retro (Task 5.1/5.2) | `npm run e2e` PASS; regression seller เดิมผ่าน | **PARTIAL** — docs back-fill DONE; **E2E/regression = PENDING (user เทส prod)** |

## Out-of-Scope (แตะ = CREEP)

OOS-1 Role ย่อยกว่า ADMIN (permission granularity) · OOS-2 เชิญเข้า PERSONAL shop · OOS-3 Email/SMS ส่งลิงก์อัตโนมัติ · OOS-4 Audit log เข้า/ออกแอดมิน · OOS-5 ลบ/drop `ShopInvite`/service เดิม (deprecate เฉพาะ UI) · OOS-6 บังคับยืนยันเบอร์ก่อน accept · OOS-7 แก้ RBAC granular ของ 00008

## Assumptions

- Migration `ShopInviteLink` apply แล้วบน shared dev=prod Supabase 2026-07-04 (ขอ user ยืนยันก่อน apply ตาม `docs/conventions/prisma-shared-db-drift.md` — ทำถูกขั้นตอน)
- OD-STAFF-A (ไม่บังคับยืนยันเบอร์ invited-only) + OD-STAFF-B (contact-match API เดิมคงไว้ dead, ถอดเฉพาะ UI) resolve โดย Controller ระหว่าง build — บันทึกเป็น as-built (BRD §10)
- Icon (`users-group`/`copy`/`link-off`/`plus`) ยืนยันกับ user ระหว่าง UX gate — ไม่ได้เดา
- ทุก S-id git-verified ผ่าน merge `0f2b197` (commit hash ระบุในตาราง)

## Deferred → Phase 2 (ไม่นับ GAP)

Role ย่อยกว่า ADMIN · Audit log เข้า/ออกแอดมิน · Email/SMS auto-send · เชิญเข้า PERSONAL shop · แก้ TOCTOU quota race (inherited) · wrap open-personal ใน transaction

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | อนุมัติ |
|--------|-----------|--------|---------|
| 2026-07-04 | baseline สร้าง (back-fill หลัง deploy) | ปิดหนี้ Hard Rule 11 — PRD/BRD/baseline/retro ทำพร้อมกัน | safepay-product / Controller |
