# Retro — Order Detail Phase 2: Slip Attachment + Digital Access Link (2026-05-23)

> Phase: ปลดล็อก OOS-1 (สลิปโอนเงิน) + OOS-2 (ลิงก์เข้าถึง digital) จาก V1 port
> Workflow: agent-team-phase (Gate 0 → Planner → 10 tasks/6 batches → Reviewer → safepay-database → safepay-security → QA → Gate 1/2 → retro)
> ผลลัพธ์: **SIGNED-OFF** — S-1..S-14 DONE, OOS-1..8 untouched, 13 commits, tsc 0, Vitest 47/47, security PASS

---

## What went right (anchor — ทำซ้ำ)

1. **Prior-art reuse แทนการสร้างใหม่** — storage abstraction (`lib/storage` + `validateUpload`), `/api/files` sensitive gate (KYC/TopUp slip), dedicated order-action endpoints (cancel/confirm/ship), seller `SlipImageClient.tsx` viewer. Phase 2 ต่อยอดทั้งหมด → เร็ว, consistent, security ผ่านรอบเดียว.
2. **safepay-security PASS รอบแรก ไม่มี must-fix** — design baก control ที่ถูกไว้ตั้งแต่ spec: HMAC SMS cookie verify-before-trust, URL scheme allowlist (`new URL().protocol` ไม่ใช่ regex), owner-from-session, sensitive `private,no-cache` gate. ลงทุนใน threat-model ตอน brainstorm คุ้ม.
3. **Frozen contract ก่อน parallel** — Controller ล็อก PublicOrderData fields + service signatures (`attachSlip`/`setAccessUrl`) + `isHttpUrl`/`showSlipZone` ก่อน dispatch → Batch 1 (3 dev disjoint) + Batch 2 (2 dev) integrate ศูนย์ conflict. ต่อจาก [[feedback-lock-contract-before-parallel]].
4. **Backend E2E ผ่าน curl โดยไม่ต้อง browser** — เมื่อ Chrome MCP หลุด, curl ยืนยัน S-4 (slip upload 200, wrong-contact 400) + S-7 (files-gate guest 401) ได้เลย → de-risk การที่ visual QA ติด MCP. แยก "backend verifiable headless" ออกจาก "visual needs browser".
5. **Planner จับ blocker ก่อน build** — `/api/upload` session-gated ขัดกับ guest-buyer upload → planner flag เป็น BLOCKER → Controller ตัดสิน combined-multipart endpoint ก่อนเขียนโค้ด (ไม่เสีย rework).

---

## Problems + root cause

### P1 — slip upload คืน 400 เพราะ dev server ถือ stale Prisma client
- **Evidence:** หลัง migration + `prisma generate` (ทำใน shell แยก), curl POST slip → generic 400. order เป็น PENDING + contact ตรง (query ยืนยัน) → attachSlip ควรผ่าน. fresh `tsx` query อ่าน `slipFileId` ได้ปกติ แต่ dev server เขียนไม่ได้.
- **Root cause:** running Next dev process load `node_modules/@prisma/client` ตอน startup (ก่อน migration). `prisma generate` อัปเดต client บน disk แต่ **HMR ไม่ reload generated client** ที่รันอยู่ใน process → `prisma.order.update({ data: { slipFileId } })` เจอ unknown column → throw → caught → generic 400. **reads degrade graceful** (`?? null`) จึงไม่ crash หน้าเว็บ ปิดบังปัญหา. เกือบสรุปผิดว่าเป็น code bug.
- **Fix:** restart dev server → โหลด client ใหม่ → curl ผ่านทันที (200).

### P2 — `/api/upload` session-gated บล็อก guest-buyer slip upload
- **Evidence:** spec §4 วาง 2-step (`/api/upload` → `/slip`) แต่ `/api/upload/route.ts:7-8` `if (!session?.user) return 401`. buyer เป็น guest → upload ไม่ได้.
- **Root cause:** spec สมมติ reuse `/api/upload` โดยไม่ตรวจ auth model ของมันก่อน. "buyer guest แนบสลิป" ขัดกับ session-only ของ endpoint เดิม.
- **Fix:** planner จับก่อน build → Controller refine S-4 เป็น combined-multipart endpoint (auth = contact-parity/SMS + PENDING guard, ไม่พึ่ง session). บันทึก Change Log.

### P3 — files-gate findFirst(slipFileId) ขาด index (table scan)
- **Evidence:** reviewer จับ — copy TopUp-slip gate pattern แต่ TopUpRequest มี `@@index([slipFileId])` ส่วน `Order.slipFileId` ที่เพิ่งเพิ่มไม่มี → findFirst ต่อ request = sequential scan.
- **Root cause:** mirror query pattern ที่พึ่ง index แต่ไม่ได้ copy index ตามไปยัง model ใหม่.
- **Fix:** เพิ่ม `@@index([slipFileId])` + migration `20260523124323`.

### P4 — review catches มาตรฐาน (import-at-bottom, missing catch)
- `validations.ts` import isHttpUrl ไว้ท้ายไฟล์ → ย้ายขึ้น top. `handleSlipUpload` ไม่มี catch → network/json error เงียบ → เพิ่ม catch+toast. ทั้งคู่ reviewer จับก่อน commit.

---

## Conventions to adopt (actionable)

1. **หลัง Prisma migration + `prisma generate` ต้อง RESTART dev server ก่อน QA ที่ write column ใหม่.** running Next process ถือ Prisma client ก่อน-migration (HMR ไม่ reload generated client ใน `node_modules/@prisma/client`); write column ใหม่ → throw (มักโผล่เป็น generic 400/500), read degrade เป็น null/undefined. **อาการวินิจฉัย:** fresh `tsx`/`prisma studio` query field ใหม่ได้ แต่ dev server error บน field เดียวกัน → คือ stale client ใน process ไม่ใช่ code bug. (P1)
2. **ก่อน reuse endpoint เดิมใน auth context ใหม่ ต้องตรวจ auth model ของมันก่อน lock contract.** `/api/upload` session-only → guest ใช้ไม่ได้. ตรวจ session/role gate ของ endpoint ที่จะ reuse เทียบกับ principal ใหม่ (guest/buyer/seller/admin) ก่อน. (P2 — ต่อ [[feedback_verify_dont_assume]])
3. **mirror indexed-query pattern → copy index ไป model ใหม่ด้วย.** files-gate `findFirst({where:{slipFileId}})` ต้องมี `@@index([slipFileId])` เหมือน TopUpRequest. ตรวจว่า column ที่ query ใน WHERE มี index. (P3)

---

## Action items

1. ✅ promote #1 (restart dev server after migration) → memory [[project_dev_db_and_paces_pitfalls]].
2. ✅ promote #2 (verify endpoint auth before reuse) → memory [[feedback_verify_dont_assume]].
3. ✅ promote #3 (index when mirroring query) → ใส่ใน retro นี้ + dev-db-pitfalls memory.
4. ⏳ **carried debt (Phase 3):** Chrome-MCP visual QA pass (รอบนี้ใช้ user eyeball เพราะ MCP หลุด); backfill `slipFileId` (real seeded file) ใน `qa-seed-order-detail.ts` เพื่อ reproducible seller-thumbnail QA.
5. 📋 backlog (จาก review nice-to-have): `OrderSummary.tsx` TYPE_META ขาด SUBSCRIPTION (pre-existing); object URL ไม่ revoke (acceptable short-lived page); double `getServerSession` ใน files-gate (perf, ยอมรับ); `validateUpload` trust client MIME (project-wide posture — magic-byte check = future).
6. 📋 จาก V1 carried debt ที่ยังค้าง: re-confirm scn8 CTA/cancel visual (V1), tracking-copy prod HTTPS, ReviewForm star-radio a11y.
