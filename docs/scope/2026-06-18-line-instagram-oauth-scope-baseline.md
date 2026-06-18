# Scope Baseline — LINE + Instagram OAuth (feature 00001 extension)

> **วันที่:** 2026-06-18
> **Feature:** 00001 - Login & Onboarding
> **Contract:** `docs/20 - Features/00001 - Login & Onboarding/_extensions/2026-06-18-line-instagram-oauth-design.md`
> **FR:** FR-LO-14 (LINE — live), FR-LO-15 (Instagram — prepared/flag-off), BR-19 (pre-tick line)

---

## In Scope (commit นี้)

| S-id | รายการ | Trace | สถานะ |
|---|---|---|---|
| **S-LO-14-1** | `LineProvider` + `InstagramProvider` ใน `authOptions.providers` | FR-LO-14, FR-LO-15 | ✅ done |
| **S-LO-14-2** | `upsertOAuthUser` helper (generalize FB block; FB behavior คงเดิม) | FR-LO-14 | ✅ done |
| **S-LO-14-3** | ปุ่ม LINE 3 surface (seller Paces + buyer Vuexy sign-in/up) | FR-LO-14-AC-04 | ✅ done |
| **S-LO-14-4** | callback dynamic route `/auth/callback/[provider]` (FB ใช้ต่อได้) | FR-LO-14-AC-05 | ✅ done |
| **S-LO-14-5** | `next.config.ts` remotePatterns LINE/IG avatar CDN | FR-LO-14 | ✅ done |
| **S-LO-14-6** | gating เดิม (needsRegistration/onboarding) ใช้ได้กับ LINE user (ไม่มี phone) | FR-LO-14-AC-06 | ✅ done (reuse) |
| **S-LO-15-1** | ปุ่ม Instagram flag-gated (`NEXT_PUBLIC_ENABLE_IG_LOGIN`) — ไม่ render เมื่อ off | FR-LO-15-AC-01/03 | ✅ done |
| **S-SEC-1** | email guard — LINE/IG ไม่เก็บ/ไม่ link email (linkEmail=false); P2002 race handling | security R1/R3 | ✅ done |

## Out of Scope / Carry (commit นี้ไม่ทำ)

| รายการ | เหตุผล | แผน |
|---|---|---|
| **BR-19 — pre-tick "line" ใน onboarding** (FR-LO-14-AC-07) | **BR-07 (FB pre-tick) ที่ BR-19 ตั้งใจ mirror เป็น vestigial** — `OnboardingGate` ที่ dashboard render โดยไม่ส่ง `facebookPrefill` (default false) + OnboardingModal = dead code (ย้ายไป `/onboarding` page 2026-06-17) + `/onboarding` page ไม่มี channel-prefill. ทำ BR-19 จริงต้องเก็บ OAuth provider ลง JWT/session + เดินสายเข้า `/onboarding` page = architectural change เกินขอบเขต "เพิ่ม LINE login" และไม่ block การ login | **Carry → Phase 2** — ทำพร้อมรื้อ BR-07 ให้ทำงานจริง (เก็บ `lastOAuthProvider` ใน JWT → prefill channel ใน `/onboarding` page ทั้ง facebook + line รวดเดียว) |
| Instagram ใช้งานจริง (live) | ติด Meta Business Verification | เปิด flag เมื่อ verify ผ่าน |
| LINE email scope + history-link by email | ไม่ขอ scope (security R1) | — |
| Cross-provider account linking | YAGNI | — |

---

## หมายเหตุ
- BR-19 ยังคงเป็น requirement ที่ valid ใน BRD/FR-LO-14-AC-07 — เพียงแต่ **deferred** จาก commit นี้ (สถานะ implementation = carry) เพราะ dependency (provider-in-JWT + onboarding prefill wiring) ยังไม่มี และ BR-07 ที่เป็นต้นแบบก็ยังไม่ทำงานจริง
- ต้องแจ้ง product owner (user) รับทราบการ defer BR-19 ก่อนปิด feature
