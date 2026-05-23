# Retro — Order Detail `/o/[token]` V1 Profile-consistent Port (2026-05-23)

> Phase: port หน้า buyer order detail จาก Shopee-style → V1 "Profile-consistent" (ทิศทางเดียวกับ `/u/[username]`)
> Workflow: agent-team-phase (Gate 0 → Planner → 4 tasks → Reviewer → QA → Gate 1 → Gate 2 → retro)
> ผลลัพธ์: **SIGNED-OFF** — S-1..S-16 DONE, OOS-1/OOS-2 deferred, 9 commits, tsc 0, Vitest 18/18, QA 7/8 PASS + 2 fix

---

## What went right (anchor — ทำซ้ำ)

1. **Frozen contract ก่อน parallel dev** — Controller ล็อก raw-image/avatar contract (`(images as string[])[0]` / `user.avatar` ดิบ เหมือน `/u/[username]/page.tsx:98,109`) + image-URL pattern ก่อน dispatch → T1/T2/T3 รวมกับ T4 **ศูนย์ integration surprise**. ตรงตาม [[feedback-lock-contract-before-parallel]].
2. **Parallel batch 3 dev (T1/T2/T3) ไฟล์ disjoint** — order.service+page+type / trust-tier+UserProfileHeader / order-display(new) — ทั้งหมด tsc 0 รอบเดียว ไม่ทับกัน.
3. **Pure helpers + Vitest** — `getOrderTimeline`/`getStatusPill` แยกเป็น `src/lib/order-display.ts` + 18 unit cases → logic timeline/pill ครบทุก state×type×payment ถูก verify โดยไม่ต้องพึ่ง DB/browser. ช่วยตอน QA หน้าเว็บมาก (logic ไม่ใช่ตัวแปร).
4. **getTierCover SSOT dedup แบบ provably-identical** — ย้าย mapping ออกจาก `UserProfileHeader` เป็น score-keyed ใน `trust-tier.ts`; threshold ตรงกับ `letterFromScore` เดิม → หน้า `/u/[username]` ที่ user approve แล้วไม่ regress.
5. **Reviewer จับ must-fix จริง 2 จุดก่อน commit** — CANCELLED ghost CTA หาย (S-13) + cancel dialog ไม่มี accessible name. independent review คุ้ม.
6. **QA seed deterministic (fixed UUID v4 tokens)** — 8 scenario ใน `prisma/qa-seed-order-detail.ts` → QA reproducible + re-seed ได้หลัง mutation. ทำให้ QA functional (confirm/cancel จริง) ทำได้โดยไม่ทำลายชุดทดสอบถาวร.

---

## Problems + root cause

### P1 — T4 รอบแรกตก CANCELLED CTA (S-13) + dialog a11y
- **Evidence:** reviewer (commit ก่อน 66b472d) flag — footer non-canConfirm ไม่ render ปุ่ม "ติดต่อร้านค้า" ที่ mockup scenario 7 มี; `<Dialog>` ไม่มี `aria-labelledby`.
- **Root cause:** prompt T4 บอก "non-functional CTA → disabled/omit (เลือกได้)" กำกวม → developer omit ปุ่ม CANCELLED ทั้งหมด. mockup มีปุ่มนั้นแต่ prompt ไม่ enumerate CTA ของ **ทุก** state แบบ explicit (เน้น canConfirm states).

### P2 — scn8 digital PENDING CTA label ตก case → "ยืนยันการชำระเงิน"
- **Evidence:** QA scn8 FAIL; `OrderDetailMobile.tsx` `ctaLabel` ternary (SHIPPED / isCOD / else) ไม่มี branch `fulfillmentMode==='NO_SHIPPING'` → digital ตกไป else. fix commit 5af74eb.
- **Root cause:** **helper จัดการ NO_SHIPPING แล้ว (timeline+pill) แต่ inline CTA label ไม่ได้ mirror.** prompt T4 ระบุ label สำหรับ SHIPPED/COD/transfer แต่ไม่ได้ระบุ label ของ digital/NO_SHIPPING ทั้งที่ pill/timeline helper branch มันอยู่แล้ว → developer ไม่เห็นว่าเป็น case ที่ต้อง cover. คือ **contract-completeness gap**: state×fulfillment matrix ไม่ครบใน prompt.

### P3 — live buyer-cancel optimistic update drop `cancelInitiator` + ไม่มี success toast
- **Evidence:** QA functional — กด cancel แล้ว re-render เป็น "คำสั่งซื้อนี้ถูกยกเลิก" (generic) แทน "คุณยกเลิกคำสั่งซื้อ"; ไม่มี toast. `PublicOrderClient.tsx:101` optimistic set แค่ `status`. fix 5af74eb.
- **Root cause:** **seeded render path บัง bug ของ live-mutation path.** scn7b (seed `cancelInitiator='buyer'`) render ถูกตอน fresh load → render-QA ผ่าน. แต่ optimistic-update (กด cancel สด) เป็นคนละ code path ที่ไม่ได้ merge field จาก response. render-only QA ไม่จับ.

### P4 — tracking copy button ไม่ render บน HTTP dev
- **Evidence:** QA scn4 — `navigator.clipboard` = null บน `http://` (non-secure context) → guard `navigator?.clipboard` = false → ปุ่มไม่ขึ้น. ไม่ใช่ bug (prod `deepthailand.app` = HTTPS → ใช้ได้).
- **Root cause:** Clipboard API ต้อง secure context; dev server เป็น HTTP. = env limitation, ไม่ใช่ code.

### P5 — `deepth.local` curl คืน 000 ทั้งที่ server รัน
- **Evidence:** `curl http://deepth.local:3000/` → 000 แต่ `curl -4 ...` → 200 และ `localhost:3000` → 200. dev server bind IPv6 `::1` สำหรับ localhost; `deepth.local`→127.0.0.1 (IPv4) → curl default ลอง IPv6 ก่อน → fail. เสีย probe cycle ไป 1 รอบ + เกือบสรุปผิดว่า server ไม่รัน.
- **Root cause:** dual-stack resolution; curl default order ≠ browser (browser ทำ happy-eyeballs).

---

## Conventions to adopt (actionable)

1. **Lock the FULL state×variant label matrix ใน prompt — ไม่ใช่แค่ common cases.** ถ้า UI มี per-state label/CTA และ state space มี variant ตาม `fulfillmentMode` (SHIPPED vs NO_SHIPPING), `type`, หรือ `paymentMethod` → developer prompt ต้อง enumerate label ของ **ทุก cell** โดยเฉพาะ cell ที่ helper (timeline/pill) branch มันอยู่แล้ว. กฎ: **ถ้า helper handle variant ใด inline label logic ต้อง mirror variant นั้น.** (P2)
2. **QA ต้อง exercise live-action path ไม่ใช่แค่ seeded end-state.** field ที่ derive จาก mutation response (เช่น `cancelInitiator` หลังกด cancel) ต้องทดสอบโดย **ทำ action จริง** — seeded data ที่มี field ครบจะ render ถูกตอน fresh load และ **บัง** bug ของ optimistic-update/live path. (P3)
3. **HTTP dev test ไม่ได้สำหรับ secure-context API** (Clipboard, `navigator.share`, ServiceWorker, getUserMedia ฯลฯ) — บันทึกเป็น env-debt, verify บน prod HTTPS; ไม่ treat เป็น code bug. (P4)
4. **Probe `deepth.local` ด้วย `curl -4`** (หรือเชื่อ browser ที่ทำ happy-eyeballs) — default curl อาจคืน 000 เพราะลอง IPv6 ก่อน ทั้งที่ server รันบน IPv4. อย่าสรุปว่า server ตายจาก 000 รอบเดียว — ลอง `-4` + `localhost` ก่อน. (P5)

---

## Action items

1. ✅ promote convention #1 (label-matrix completeness) → extend memory [[feedback-lock-contract-before-parallel]] + lesson `agent-team-workflow.md`.
2. ✅ promote #2 (live-action QA) + #3 (secure-context HTTP) + #4 (deepth.local IPv4) → extend memory [[feedback_qa_domains]].
3. ⏳ **carried debt (non-blocking, ทำต้น session ถัดไปที่ dev server + Chrome MCP พร้อม):** visual re-confirm scn8 CTA = "ยืนยันว่าได้รับแล้ว" + live-cancel copy "คุณ/ร้านค้ายกเลิก" + success toast (fix 5af74eb code-verified แล้ว แต่ MCP หลุดก่อน re-QA).
4. ⏳ verify tracking copy button บน prod HTTPS (`deepthailand.app`) ก่อนปิด S-11 เต็ม.
5. 📋 backlog: ReviewForm star-radio ไม่มี `id`/`name` (a11y) — pre-existing, Phase 2.
6. 📋 Phase 2 backend: OOS-1 slip upload (`Order.requiresSlip`+`slipUrl`+storage+security), OOS-2 digital access link field → ปลดล็อก slip zone (scenario 1/2) + access link box (scenario 8).
