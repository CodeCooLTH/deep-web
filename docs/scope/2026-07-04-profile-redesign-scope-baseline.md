# Scope Baseline — `/u/[username]` Profile Redesign

> **วันที่:** 2026-07-04 · **Owner sign-off:** user (ในเซสชัน brainstorm 7 รอบ + อนุมัติ mockup + เคาะ honesty decisions) · **Controller:** main session
> **Design spec:** `docs/superpowers/specs/2026-07-04-profile-redesign-design.md` (+ mockup `.html` คู่)

## Goal
Redesign หน้าโปรไฟล์ร้านสาธารณะ `/u/[username]` ให้สวย + น่าเชื่อถือ ตาม reference FB Page × Threads (Vuexy CI), full-bleed 3 devices, โชว์เฉพาะข้อมูลจริง

## S-id (งานที่อยู่ในขอบเขต)
| S-id | งาน | ไฟล์ |
|---|---|---|
| P-1 | Cover gradient ต่อ tier + helper `getTierGradient`/`getNextTierInfo` | `lib/trust-tier.ts`, `UserProfileHeader.tsx` |
| P-2 | Identity bar responsive (avatar overlap + metric row จริง + แชท/ติดตาม) | `UserProfileHeader.tsx` |
| P-3 | TrustScoreCard (gauge + next-tier + verify-level chips) | `TrustScoreCard.tsx` (ใหม่) |
| P-4 | ProfileTabsNav (underline anchor-scroll tabs) | `ProfileTabsNav.tsx` (ใหม่) |
| P-5 | Left/Right restructure (About+Trust+การรับรอง / ปักหมุด+ทั้งหมด+platforms) + ProductCard bordered ใหม่ | `profile/index.tsx` |
| P-6 | PlatformReputationList (placeholder "ตัวอย่าง") | `PlatformReputationList.tsx` (ใหม่) |
| P-7 | Achievements medal-frame | `profile/AchievementBadgeRow.tsx` |
| P-8 | Full-bleed layout (grid areas + ตัดการ์ดลอย/gradient frame/padding ขอบ) | `index.tsx`, `page.tsx` (u + b/[slug]) |
| P-9 | memberSince `formatMonthYearTH` | `lib/format-date.ts` |
| P-10 | Honesty: ตัดเลขปลอม 3 จุด (ผู้ติดตาม, ★rating รายสินค้า, ส่งตรงเวลา 98%) | `UserProfileHeader.tsx`, `profile/index.tsx` |

## Supersedes / reconcile (สำคัญ — เหตุที่ reviewer flag)
- **Supersedes OOS-13** ของ `docs/scope/2026-07-03-00011-deep-chat-scope-baseline.md` — OOS-13 เขียนว่า "ห้ามแก้ logic หน้า `/u/[username]` ส่วนอื่นนอกจากปุ่ม Chat" เป็นการ **จำกัดขอบเขตของฟีเจอร์ Deep Chat** (กัน 00011 ไป redesign หน้าโปรไฟล์) — **ไม่ใช่การห้าม redesign ถาวร**. งานนี้เป็น redesign ที่ user สั่งใหม่โดยตรง จึงเป็นสิทธิ์ที่ยกเลิก OOS-13 ได้ (P-1..P-10 นี้คือ scope ใหม่ที่ครอบ). ปุ่ม Chat login-gate (S-8) + ปุ่มสอบถามสินค้า (S-19) + response-rate (S-25) **คงพฤติกรรมเดิมทุกอย่าง** — ย้ายตำแหน่ง render เท่านั้น
- **Reconcile S-25 note "ไม่แตะ 98% on-time"** (`_extensions/response-rate-metric.md`) — note นั้นหมายถึง "task S-25 (response-rate) อย่าไปยุ่งกับ metric on-time" (กัน scope creep ของ S-25). ภายใต้ scope P-10 นี้ การ**ตัด** "98% on-time" เป็นการตัดสินใจใหม่ที่ user อนุมัติ (เลขปลอม ไม่มี field จริง) — ไม่ขัดเจตนาเดิมของ S-25 (S-25 = ต้องการกันไม่ให้ 98% ถูกแก้โดย "ไม่ตั้งใจ" ระหว่างทำ response-rate; ครั้งนี้ตั้งใจตัดโดยมี sign-off)

## Out of scope
- **Pin backend** (Product pin field + seller backoffice จัดการ pin + wire pinned จริง) → feature ถัดไป (interim = 3 ชิ้นแรก)
- Follow system, real cross-platform integration, real on-time tracking, product detail page

## Verification
- tsc `node node_modules/typescript/lib/tsc.js --noEmit` = 0 error
- reviewer 8-gate: PASS 1-5,7,8 (theme-sourcing+Base, RSC nav, Anuphan, no-emoji, RSC-PII, types, code quality); Gate 6 = เอกสารนี้ปิด gap
- **Visual QA: user เทสเองบน dev** (`deepth.local:4000/u/shinobu22`) — Controller/MCP start dev server ไม่ได้
