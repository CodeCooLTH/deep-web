# Retro — Order Confirm UX redesign (`/o/[token]`)

> วันที่ 2026-05-23 · branch `feat/seller-orders-phase-a` · commits `8464c84`(spec)→`6a339b8`(feat)
> Phase: redesign UX หน้า public order confirmation — trust signal, payment, buyer cancel, status states, polish (UX-only; user delegate "ดูแลจนจบ")

## สิ่งที่ทำ
discovery (flow มีอยู่แล้ว) → product req → ux Design Spec (ครบทุก state) → **Controller verify backend reality** → scope lock (defer slip, 5-tier tier) → planner (frozen contract + util) → developer ×5 (3 batch parallel) → reviewer MERGE → QA API+DB E2E → commit. Autonomous (user delegate).

## Problems + Root causes
### P1 — product/spec assume "backend done" ผิด (slip)
product req ระบุ FR-6.12 (แนบสลิป) = "backend code-complete" และ ux ออกแบบ slip UI เต็ม. **Controller verify schema/routes แล้วพบ `requiresSlip`/order-slip ไม่มีจริง** (มีแต่ wallet topup slip) → ถ้าไม่ verify จะ build UI บน backend ที่ไม่มี → พังตอน wire.
- **Root cause:** product/discovery เชื่อ PRD §"backend done" โดยไม่ grep schema จริง; "code-complete" ใน doc ≠ field มีจริง.

### P2 — tier mapping drift 3 ทาง
order page เคยใช้ letter (A+/A/B...), profile ใช้ 5-tier covers (Classic/Silver/Gold/Diamond/Star), spec product เขียน 6-tier (Deep Starter/Bronze/Platinum). ขัดกัน 3 แบบ.
- **Root cause:** ไม่มี SSOT ของ tier; แต่ละหน้า hardcode mapping เอง.

## What went right (anchor)
- **Discovery ก่อน → ไม่ rebuild:** flow `/o/[token]` มีอยู่ครบ (confirm/unlock/SMS/review) — ไม่สร้างซ้ำ (เหมือนเปิด session ที่ CLAUDE.md มีอยู่แล้ว).
- **Controller verify backend reality จับ slip-gap:** grep schema+routes ก่อน scope → defer slip ทันแทนพังภายหลัง (verify-dont-assume คุ้มอีกครั้ง).
- **Tier SSOT + shared util กัน drift:** สร้าง `docs/10 - Business Rules/Tier Lists.md` + `src/lib/trust-tier.ts` (pure, client-safe) — Controller สร้าง util **ก่อน** dispatch parallel batch กัน race/duplicate; CLAUDE.md เพิ่มกฎ "พูดถึง tier ต้องอ่าน SSOT".
- **Optional-prop pattern → parallel สะอาด:** T2/T3 ทำ prop ใหม่ optional → ไม่มี cross-task tsc error ตอน parallel; T5 wire ทีหลัง. tsc gate ทุก batch.
- **API+DB E2E พิสูจน์ core แม้ browser QA หลุด:** seed→curl confirm/cancel→query DB = CONFIRMED/CANCELLED ✅ (chrome MCP down ไม่ block การพิสูจน์ backend persist).
- reviewer MERGE must-fix 0; frozen contract (consumer-mapped) → integrate ไม่ rework.

## Conventions to adopt (actionable)
1. **"Backend done" claim ของ product/spec → Controller grep-verify (schema+routes) ต่อ feature ก่อน scope UX-only** — อย่าเชื่อ PRD/"code-complete" ลอย ๆ. เคย: slip "done" แต่ schema ไม่มี `requiresSlip` → defer. (extends verify-dont-assume / workflow #15)
2. **Shared mapping/business rule ข้ามหลาย surface → 1 client-safe util + SSOT doc, ไม่ copy ต่อไฟล์** — Controller สร้าง util ก่อน dispatch parallel batch (กัน race + drift). business-rule สำคัญ → เขียน SSOT ใน `docs/10 - Business Rules/` + กฎ "ต้องอ่านก่อนทำงาน" ใน CLAUDE.md. เคย: tier drift 3 ทาง.
3. **browser QA ใช้ไม่ได้ + feature แตะ DB-mutation → พิสูจน์ด้วย API-curl + DB-query E2E** (seed→curl endpoint จริง→query DB ยืนยัน persist) — ไม่ blanket-defer ทั้งหมด; defer เฉพาะ visual layer. ระบุ origin/CSRF + field-name ของ API ก่อน curl.

## Action items
1. [done] commit phase (`6a339b8`) + Base: + QA evidence
2. [done] promote #1-3 → agent-team-workflow.md addendum (#38-40)
3. [ ] **Phase 2 — slip upload (FR-UX-4):** ต้อง backend ใหม่: schema (`requiresSlip` Bool + `slipUrl`/relation), storage, API associate slip↔order, **security review upload** (MIME/size/auth) → แล้วค่อย UI
4. [ ] **deferred:** browser/visual QA ของ /o/[token] (chrome MCP หลุด) — รันเมื่อ MCP กลับ
5. [ ] nice-to-have cleanup (ไม่บล็อก): dialog icon size (72 vs theme 88), `fulfillmentMode`/`username` forward-fields ที่ยังไม่ consume — ตัดถ้า phase ถัดไปไม่ใช้
