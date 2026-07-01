---
title: "Scope Baseline — Seller Auction + Realtime Bidding (M00002)"
owner: safepay-product
status: baseline
date: 2026-07-01
module: M00002-SellerAuction
version: "1.0"
related:
  - "docs/20 - Features/00002 - Seller Auction/PRD.md"
  - "docs/20 - Features/00002 - Seller Auction/BRD.md"
  - "docs/20 - Features/00002 - Seller Auction/SRS.md"
  - "docs/20 - Features/00002 - Seller Auction/SDS.md"
  - "docs/20 - Features/00002 - Seller Auction/API.md"
  - "docs/20 - Features/00002 - Seller Auction/DATABASE.md"
  - "docs/20 - Features/00002 - Seller Auction/TestCase.md"
  - "docs/20 - Features/00002 - Seller Auction/UI-DESIGN-SPEC.md"
---

# Scope Baseline — Seller Auction + Realtime Bidding (M00002)

> สถานะ: **BASELINE** (Gate 0 — freeze ก่อนเข้า `agent-team-phase`)
> ที่มา: PRD v1.1 + BRD v1.1 (approved 2026-07-01, sign-off Open Questions ที่ BRD §2.7) + SRS/SDS/API/DATABASE/TestCase (draft, technical)
> Controller เป็นผู้ Write ไฟล์นี้ลง `docs/scope/2026-07-01-seller-auction-scope-baseline.md` และเป็นผู้ commit — เอกสารนี้เป็น **สัญญา scope** ที่ทุก subagent ใน team อ้างอิงตลอด phase

---

## Goal / Success Statement

Feature นี้ทำสำเร็จเมื่อ: Seller L2+ สร้าง/จัดการ auction ได้ครบวงจร (create→edit→cancel→publish→end-early→settle) ผ่าน seller dashboard (Paces); Buyer เสนอราคาได้แบบ atomic-safe ผ่าน `/api/app/auctions/*` พร้อม Realtime broadcast (currentPrice/endTime) ที่ **ไม่รั่ว** `reservePrice`/`expectedPrice`; auction ที่จบแบบมีผู้ชนะสร้าง SafePay Order อัตโนมัติแบบ idempotent เข้า OMS เดิม; ครบทุก FR-AUC-01~13 + watch/unwatch + User Level + Auction badges ตามที่ sign-off ใน BRD §2.5/§2.7 — และผ่าน DoD (§ด้านล่าง) ทั้งหมดโดยไม่มี CREEP ค้าง

---

## In-Scope (ตัดสินแล้ว)

> ทุก commit ของทุก batch ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว — map ไม่ได้ = CREEP (ดู Mode 3 Scope Audit)

### กลุ่ม A — Seller: สร้าง/จัดการ Auction

| ID | รายการ | Ref (FR/TFR) | Acceptance (ทดสอบได้) |
|----|--------|--------------|------------------------|
| S-1 | สร้าง auction (L2 guard, validate price/time/title/image, draft/scheduled/live) | FR-AUC-01, TFR-001 | AC-01~09 ของ FR-AUC-01 (BRD §2.1) ผ่านทั้งหมด — L2<2 → 403; startPrice≤0/reserve<start/buyNow≤reserve-or-start/endTime<+30min → 400; scope by session shopId → 403 ถ้าข้าม shop |
| S-2 | แก้ไข auction (draft/scheduled เท่านั้น รวม **price fields** ตาม OQ-4) | FR-AUC-02, TFR-002 | AC-01~03 — live/ended/unsold/cancelled แก้ไม่ได้ (409); ไม่ใช่เจ้าของ → 403; price fields (startPrice/reserve/buyNow/expectedPrice) แก้ได้เมื่อยังไม่มี bid |
| S-3 | ยกเลิก auction (draft/scheduled เสมอ; live เฉพาะ bidCount=0) | FR-AUC-03, TFR-003 | AC-01~04 — live+bid≥1 → 409; ended/unsold/cancelled → 409 |
| S-4 | Seller list auctions (scope by shopId, filter by status) | FR-AUC-04, TFR-004 | AC-01~03 — เห็นเฉพาะร้านตัวเอง; filter ตาม status ทำงาน |
| S-11 | Seller detail console (bid history, currentPrice, ปุ่ม edit/cancel ตาม state) | FR-AUC-11, TFR-011 | AC-01~05 — bidder เห็นแค่ displayName+amount (ไม่มี PII อื่น); ปุ่ม cancel/edit โผล่ตาม state guard |
| S-12 | จบประมูลก่อนเวลา (End Early) + below-reserve confirm flow | FR-AUC-12, TFR-012 | AC-01~06 (BRD §2.5) — bidCount=0→unsold; bid<reserve ต้อง `confirmBelowReserve` แยก 409 code; ไม่ใช่เจ้าของ/status≠live → 403/409 |
| S-13 | ยอดที่คาดหวัง (expectedPrice, seller-only, ไม่ leak buyer) | FR-AUC-13, TFR-013 | AC-01~05 (BRD §2.5) — optional int>0; gauge %progress เห็นเฉพาะ seller console; `GET /api/app/auctions/*` response **ต้องไม่มี** field `expectedPrice` (grep gate SDS §13 test #4) |

### กลุ่ม B — Buyer: Realtime Bidding

| ID | รายการ | Ref (FR/TFR) | Acceptance |
|----|--------|--------------|------------|
| S-5 | เสนอราคา (atomic bid, conditional-update, self-bid block) | FR-AUC-05, TFR-005 | AC-01~08 — **ต้องแก้ R-SRS-1** (conditional `updateMany` กัน lost update) ก่อนถือว่า DONE; 2 bid amount เท่ากันพร้อมกัน → มีแค่ 1 ชนะ |
| S-6 | Anti-snipe (ต่อเวลา 60s, cap 5 ครั้ง, ใน transaction เดียวกับ bid) | FR-AUC-06, TFR-006 | AC-01~04 — bid ≤60s ก่อนจบ + count<5 → +60s; count=5 → ไม่ต่อ; bid นอกช่วง 60s → ไม่ trigger |
| S-7 | Buy-Now (instant settle, auto-close เมื่อ currentPrice≥buyNowPrice) | FR-AUC-07, TFR-007 | AC-01~05 — 2 buyer กด buy-now พร้อมกัน → Order เดียว (`auctionId @unique` backstop, R-SRS-4) |
| S-8 | Reserve price + unsold path | FR-AUC-08, TFR-008 | AC-01~05 — buyer เห็น "มีราคาขั้นต่ำ" แต่ไม่เห็นค่าจริงแม้ auction จบแบบ unsold |
| S-9 | Win→Order (settle idempotent + notify) | FR-AUC-09, TFR-009 | AC-01~05 — เรียกซ้ำได้ orderId เดิม; `settleAuctionCore` รับ `tx` จากภายนอกเท่านั้น (กัน nested-transaction, R-SRS-5) |
| S-14 | Watch/Unwatch auction (OQ-3 — รวมเข้า M00002) | OQ-3 (BRD §2.7), Supporting SRS §4.1 | `POST/DELETE /api/app/auctions/[id]/watch` toggle `WatchList` upsert สำเร็จ; idempotent (watch ซ้ำไม่ error) |

### กลุ่ม C — Realtime Infra

| ID | รายการ | Ref | Acceptance |
|----|--------|-----|------------|
| S-10 | Realtime broadcast แบบ **Broadcast-from-Database** (Postgres trigger, ไม่ผ่าน `postgres_changes`/publication) | FR-AUC-10, TFR-010, OQ-1 (BRD §2.7) | AC-01~04 — payload broadcast มีเฉพาะ `id/currentPrice/bidCount/endTimeMs/status/antiSnipeCount/hasReserve` (grep gate SDS §13 test#4/#5 = 0 hit ของ `reservePrice`/`expectedPrice`/`cancelledAt`); Realtime ล้มเหลว → bid/settle ยังสำเร็จ (fail-safe `EXCEPTION WHEN OTHERS`) |

### กลุ่ม D — Data/Schema/Trust Systems

| ID | รายการ | Ref | Acceptance |
|----|--------|-----|------------|
| S-17 | Migration M1 (`auction_schema_delta`: description/startTime/reservePrice/buyNowPrice/antiSnipeCount/cancelledAt/expectedPrice + index) + M2 (`user_bid_level`: `User.successfulBidCount` + backfill) | DATABASE §4 | apply ไม่มี data loss (nullable/default); DB CHECK constraints (§8.2 DATABASE) ติดตั้งครบ; `prisma generate` + tsc 0; **ต้อง user approve ก่อน apply** (แตะ prod Supabase แชร์ dev) |
| S-18 | Migration M3 (Postgres trigger `auction_realtime_broadcast`) | DATABASE §9, OQ-1 | trigger สร้างสำเร็จ, verify `realtime.send()` รองรับจริง (prerequisite), rollback script พร้อม (`DROP TRIGGER...`); **user approve แยกจาก M1/M2** (คนละ risk ตาม SDS §12 task#2) |
| S-15 | User Level (successfulBidCount ladder 5 ระดับ, `lib/auction-level.ts`) | TFR-016 (DATABASE §5) | increment เมื่อ winner settle สำเร็จ (Order ไม่ CANCELLED), `GREATEST(0,...)` เมื่อ order ถูก cancel ภายหลัง (ชิ่ง); label/icon ถูกตาม threshold ขอบ (2/3, 9/10, 29/30, 99/100 — TestCase#12); ไม่กระทบ Trust Score เดิม |
| S-16 | Auction Achievement Badges — **6 badge MVP** (BRD §11.2 คอลัมน์ ✅ เท่านั้น: First Auctioneer, Auction Host 10, First Auction Win, Auction Closer 10 [seller]; First Bidder, First Winner [buyer]) | TFR-017 (DATABASE §6.1) | seed upsert by `nameEN`; `evaluateBadges('BUYER')` มี caller จริงหลัง placeBid/settle (SDS flag §7.2 ต้องปิด); ไม่ throw ถ้า criteria type ยังไม่มี checker (default switch+warn) |

**รวม 18 S-id** ครอบ FR-AUC-01~13 ครบ, watch (OQ-3), Realtime broadcast-from-DB (OQ-1), User Level (TFR-016), Badge (TFR-017), migration (M1/M2/M3)

---

## Out-of-Scope (freeze — แตะ = CREEP)

### จาก BRD §2.6 Deferred → Phase 2 (sign-off 2026-07-01)

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | ต่อเวลาเอง (Manual extend +N นาที) | anti-snipe (S-6) จัดการเคสหลักแล้ว; เพิ่ม abuse surface |
| OOS-2 | บล็อกผู้บิด (Block bidder / ลบ bid) | ซับซ้อนสูง + เสี่ยง fraud (seller ลบคู่แข่งตัวเอง) ต้องออกแบบ anti-abuse ก่อน |
| OOS-3 | ปรับ buy-now ระหว่าง live | edge feature ไม่จำเป็นต่อ core loop |
| OOS-4 | Feature/Pin (ดันรายการเด่น) | พัวพัน monetization decision แยกต่างหาก |

### จาก PRD §5 Out of Scope

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-5 | Auto-Bid (Proxy Bid) | Phase 2 |
| OOS-6 | Escrow Refund อัตโนมัติ / Auto-Timeout Winner Payment / Winner Penalty Score | winner ไม่จ่าย = ใช้ OMS cancel manual ใน MVP เท่านั้น (ไม่มี auto-penalty) |
| OOS-7 | WebSocket Server + Redis | Supabase Realtime (broadcast-from-DB) เพียงพอสำหรับ MVP |
| OOS-8 | Admin Auction Moderation Dashboard | Phase 2 |
| OOS-9 | Live-Stream Auction | Phase 2 |
| OOS-10 | Buyer Web View (ประมูลผ่าน browser) | ~~MVP = Deep-App มือถือเท่านั้น~~ → **pulled to feature 00004 (2026-07-01)** — detail-only `/a/[id]` (view public + login-gated bid/buy-now/watch), Vuexy, session-authed routes reuse auction.service. spec: docs/superpowers/specs/2026-07-01-buyer-web-auction-design.md |
| OOS-11 | Seller Mobile Auction Management | MVP = seller dashboard web (Paces) เท่านั้น |
| OOS-12 | Dutch Auction / Reverse Auction | Phase 2 |
| OOS-13 | Auction Analytics Dashboard (Seller) | Phase 2 |

### จาก accepted-risk (BRD §2.7 OQ-2 + SRS R-SRS-6) — ไม่ทำ ไม่ใช่ bug

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-14 | Buyer verification-level gate ก่อน bid | OQ-2 sign-off: ไม่ gate ใน MVP — ทุกคน login Deep-App bid ได้; shill-bidding เป็น risk รับไว้ |
| OOS-15 | Re-check L2 ระหว่าง auction live (ถ้า seller ถูก revoke level ภายหลัง create) | R-SRS-6 accepted-risk — ไม่มี AC กำหนดให้ re-check |

### Phase 2 badge (BRD §11.2 คอลัมน์ "Phase 2")

| ID | รายการ |
|----|--------|
| OOS-16 | Auction Pro 50, Bid Magnet (seller) / Active Bidder, Winner's Circle, Auction Completer (buyer) — checker ซับซ้อน/threshold สูง ไม่ seed ใน MVP |

### อื่น ๆ

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-17 | Deep-App (Expo) ฝั่ง client Realtime + UI จริง | cross-repo, ไม่ block backend/seller-web MVP (BRD §2.7 Group A) — fallback REST polling |
| OOS-18 | "ผ่าน Facebook" ใน bid feed = decorative copy เท่านั้น | OQ-5 sign-off — ห้าม integrate Facebook API จริง |

---

## Assumptions / Decisions Locked (ห้ามเปลี่ยนกลางทางโดยไม่ผ่าน change-control)

จาก BRD §2.7 Decisions Log (SSOT):

| # | ประเด็น | มติ locked |
|---|---|---|
| OQ-1 | Realtime mechanism | **Broadcast from Database** (trigger, `realtime.send()`) — ไม่ใช้ `postgres_changes`/publication ตรง ๆ (กัน leak reservePrice/expectedPrice) |
| OQ-2 | Buyer verify level ก่อน bid | **ไม่ gate ใน MVP** |
| OQ-3 | Watch/Unwatch | **รวมใน M00002** (S-14) |
| OQ-4 | แก้ price fields ขณะ draft/scheduled | **แก้ได้** (S-2 ครอบ) |
| OQ-5 | "ผ่าน Facebook" bid feed copy | **decorative UI เท่านั้น** ห้าม integrate จริง |
| OQ-6 | schedule startTime อดีต/ปัจจุบัน | **Reject 400** (ไม่ auto-fallback publishNow) |

**Group A — Controller technical defaults (ทีม dev ยึดตามนี้ ไม่ต้อง user เคาะซ้ำ):**
- countdown=0 → `router.refresh()` + poll 5s (lazy-settle, ไม่มี cron ใหม่)
- bidHistory re-fetch หลัง broadcast → reuse `GET /api/seller/auctions/[id]` (ไม่สร้าง endpoint ใหม่)
- theme source path ไม่ตรงตัว → developer ต้อง `Glob` ยืนยันก่อน copy จริง (ห้ามเดา)
- response shapes (publish `{mode,startTime?}`, cancel/buy-now คืน DTO+orderId, `images[]` เพิ่มใน `AuctionDTO`) → ตาม planner เสนอใน API.md
- Deep-App Realtime client = cross-repo, ไม่ block MVP sign-off (fallback REST polling)

---

## Dependencies / Prerequisites (บังคับก่อน dev เริ่ม batch ที่เกี่ยวข้อง)

1. **User approve Migration M1+M2** (`prisma/schema.prisma` + SQL, S-17) — แตะ prod Supabase ตัวเดียวกับ dev (ดู memory `project_prisma_migration_env_targets`) — ต้องขอ confirm ก่อน `migrate deploy -e .env.local`
2. **User approve Migration M3 แยกต่างหาก** (Postgres trigger, S-18) — คนละ risk profile จาก M1/M2 (แก้ trigger บน table ที่ traffic สูงกว่า) — ต้อง verify ก่อนว่า Supabase project รองรับ `realtime.send()` (Realtime ≥ 2.x); ถ้าไม่รองรับ → หยุด แล้ว escalate กลับมาที่ SRS §2.4 Option B (แยกตาราง sensitive fields) — **ไม่ implement Option B เองโดยไม่ผ่าน Controller/product**
3. **`placeBid` concurrency refactor เป็น prerequisite ของทุก task ที่แตะ bid** (R-SRS-1, SDS §12 task #3) — ต้อง refactor เป็น conditional `updateMany` (atomic, กัน lost update) **ก่อน** S-5/S-6/S-7/S-9/S-12/S-15/S-16 เริ่ม เพราะทุกตัว build บน `placeBid`/`settleAuctionCore` ตัวเดียวกัน
4. `settleAuctionCore` ต้องรับ `tx` จากภายนอกเสมอ (ห้ามเปิด `$transaction` ซ้อนข้างใน) — เฉพาะ wrapper `settleAuction()` เท่านั้นที่เปิด transaction (R-SRS-5) — ต้อง sign-off design นี้ก่อน task #3/#4 เริ่ม
5. Migration M1+M2 ต้อง apply สำเร็จก่อน Service core refactor เริ่ม (compile ต้องเห็น field ใหม่)

---

## Build Phases / Task Breakdown (map จาก SDS §12, 13 task → agent-team-phase)

> ทุก batch ผ่าน 5 gates เดิม (Planner→Developer→Reviewer→QA→Controller) ตาม `docs/conventions/agent-team-workflow.md`; parallel เฉพาะ batch ที่ระบุ "parallel" (ไฟล์ไม่ทับกัน) — serialize ถ้าแตะไฟล์เดียวกัน (feedback_parallel_dev_agents_no_commit)

| Batch | Task (SDS #) | S-id ที่ปิด | Mode | Dependency |
|---|---|---|---|---|
| **A** (serial) | #1 Migration M1+M2 (`safepay-database`) → #2 Migration M3 | S-17 → S-18 | serial | ไม่มี — ทำก่อนสุด, ต้อง user approve ทั้งคู่แยกกัน |
| **B** (serial, ต่อจาก A) | #3 Service core refactor (`settleAuctionCore`/`settleAuction`/`placeBid`/`flipScheduledToLive`/DTO split) → #4 Seller CRUD functions | (foundation สำหรับ S-1~S-13, S-15) | serial | รอ A (compile ต้องเห็น field ใหม่); ต้อง sign-off R-SRS-1/5 design ก่อน (Dependency #3/#4) |
| **C** (parallel ×3) | #5 Badge extension, #6 Seller API routes (7 endpoint), #7 Buyer API routes (ขยาย4+ใหม่3) | S-16 / S-1~S-4,S-11,S-12,S-13 / S-5~S-7,S-9,S-14 | parallel | ทุกตัวรอ B เสร็จ; ไฟล์คนละชุด (`badge.service.ts` vs `api/seller/auctions/**` vs `api/app/auctions/**`) |
| **D** (parallel ×3) | #9 Seller UI List, #10 Seller UI Create/Edit form, #13 Command center entry tile+sidenav | S-4/S-11 (list) / S-1/S-2 (form) / navigation (ไม่มี S-id เดี่ยว — supporting) | parallel | รอ C (#6) เสร็จ; ไฟล์คนละ route/component; **ทุกหน้าต้องผ่าน `safepay-ux` ก่อน dev (Hard Rule 8)** |
| **E** (serial) | #11 Seller UI Detail Console → #8 Postgres trigger wiring verify → #12 Seller UI Realtime bid feed/chart/gauge | S-11 (detail) → S-10 (verify) → S-10/S-13 (bid feed+gauge) | serial | #11 รอ C(#6); #8 รอ A(#2)+C(#7) มี write path ใหม่ยิง UPDATE จริง; #12 รอ #11+#8 |

**Batch C/D ต้อง lock contract ก่อนขนาน** — Controller freeze DTO field name/shape (`AuctionDTO`/`PublicAuctionDTO` split, broadcast payload shape) ลง prompt ของทุก developer parallel ก่อน dispatch (feedback_lock_contract_before_parallel)

---

## Definition of Done (DoD)

Feature ปิดได้เมื่อครบทุกข้อ:

1. **S-1~S-18 ทั้งหมด DONE** ตาม acceptance ในตาราง In-Scope — มีหลักฐาน (test/QA log) ไม่ใช่ self-report
2. **TestCase.md ~185 TC รันจริงและ PASS** — โดยเฉพาะ **SDS §13 14/14 จุดวิกฤต ต้องครบ 14/14** (concurrency conditional-update, anti-snipe boundary 59s/61s/6th, buy-now double-trigger, PII grep-gate `reservePrice|expectedPrice` = 0 hit ใน `src/app/api/app/`, Realtime payload inspect, settle idempotency, reserve/unsold path, end-early below-reserve confirm, ownership scope 404-not-403, L2 guard, self-bid block, User Level ladder boundary, badge trigger BUYER audience, UI visual QA Paces compliance) — **fail ข้อใดข้อหนึ่งใน 14 = block merge**
3. `tsc` = 0 error ทั้ง repo
4. `safepay-reviewer` 8-gate ผ่าน (รวม grep gate: ไม่มี `react-toastify` ใน `(paces)/**`, ไม่มี arbitrary Tailwind value ใน `(paces)/**` ยกเว้น comment กำกับ, chart ผ่าน `ApexChart` wrapper, font Anuphan, `Base:` line ทุก UI commit)
5. `safepay-security` review ผ่าน (auth/PII) — โดยเฉพาะ L2 guard, self-bid block, scope-by-shopId, Realtime payload ไม่ leak reservePrice/expectedPrice
6. QA 3-level ผ่าน + Playwright E2E เขียวทุก spec ที่เกี่ยวข้อง (feedback_qa_playwright_e2e_mandatory)
7. Chrome DevTools MCP visual QA ผ่าน (mobile viewport, ไม่มี Vuexy bleed ใน `(paces)/**`)
8. Migration M1/M2/M3 apply สำเร็จบน Supabase (dev=prod) โดย user approve แล้ว, rollback script พร้อมใช้จริง
9. Traceability §14 ของ SDS ปิดสถานะจาก "Draft" → "Done" ครบทุกแถว
10. ไม่มี CREEP ค้าง (ทุก commit map S-id ได้, ไม่มี OOS-id ถูกแตะ)

---

## Risks + Mitigation

จาก SRS §8 Architectural Risks (ต้อง mitigate ก่อน merge ไม่ใช่แค่รับรู้):

| Risk | ผลกระทบ | Mitigation | Gate |
|---|---|---|---|
| **R-SRS-1** `placeBid` เดิมไม่มี conditional-update guard | lost update ภายใต้ concurrent bid | conditional `updateMany` — **prerequisite ของทุก task ที่แตะ bid** (Dependency #3) | Batch B ก่อนเปิด C |
| **R-SRS-2** Realtime `postgres_changes` รั่ว reservePrice/expectedPrice | ขัด FR-AUC-13-AC-04 | ใช้ Broadcast-from-DB (S-10/S-18) แทน — sync `safepay-database` + user approve | Batch A |
| **R-SRS-3** `antiSnipeCount` race ข้าม transaction | extension เกิน 5 ครั้ง | anti-snipe check+update อยู่ใน transaction เดียวกับ bid + DB CHECK `<=5` backstop | S-6, DB CHECK §8.2 |
| **R-SRS-4** Buy-now double-trigger | สร้าง 2 Order | conditional update `WHERE currentPrice < buyNowPrice` + `Order.auctionId @unique` backstop 2 ชั้น | S-7, TestCase #3 |
| **R-SRS-5** `settleAuctionCore` nested `$transaction` | deadlock/error | core รับ `tx` จากภายนอกเสมอ, เฉพาะ wrapper เปิด transaction | Dependency #4 |
| **R-SRS-6** L2 guard เช็คเฉพาะตอน create | seller ถูก revoke level แต่ auction live ต่อได้ | **accepted risk MVP** (OOS-15) — ไม่ implement re-check | ระบุใน DoD ว่าเป็น known-gap |
| **R-SRS-7** Vercel per-instance rate-limit ไม่ครอบ bid storm ข้าม instance | ไม่กระทบ correctness (DB-level guard คุ้มครอง) | known-gap เดิม, Redis = Phase 2 | ไม่ block merge |
| **Scope: prod-shared-DB** M1/M2/M3 apply บน Supabase เดียวกับ prod | migration ผิดกระทบ prod จริง | additive/nullable columns only (§8.2 DATABASE), rollback script พร้อม, user approve **แยก** M1+M2 กับ M3 (Dependency #1/#2) | Batch A |
| **Scope: 18 S-id กว้าง — risk creep เข้า OOS** | เผลอ implement Manual-extend/Block-bidder/Buy-now-adjust-live/Feature-Pin ระหว่างทำ end-early (S-12) หรือ buy-now (S-7) เพราะใกล้เคียงกัน | Scope Audit (Mode 3) ทุก batch เช็ค OOS-1~4 touch โดยเฉพาะ | ทุก batch |

---

## Change-Control Note

ถ้ามีการเปลี่ยน scope หรือ contract ระหว่าง build (เช่น เปลี่ยนกลไก Realtime จาก Option A→B, เพิ่ม FR ใหม่, ดึง OOS-item กลับเข้า scope) — **ต้องกลับมาแก้ไฟล์นี้ + re-sign-off ผ่าน `safepay-product`** ก่อนดำเนินการต่อ ห้าม Controller/agent ตัดสินใจเปลี่ยน scope เองโดยไม่บันทึก Change Log ด้านล่าง

### Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-01 | baseline สร้าง (S-1~S-18 In-Scope, OOS-1~18 freeze) | kick-off Seller Auction + Realtime Bidding หลัง PRD/BRD sign-off + OQ resolve | shinobu22 |

---

## Traceability (Phase → FR-AUC/TFR → เอกสารต้นทาง)

| Batch | S-id | FR-AUC | TFR | SDS §/API §/DATABASE § |
|---|---|---|---|---|
| A | S-17 | — | — | DATABASE §4 (M1/M2) |
| A | S-18 | FR-AUC-10 | TFR-010 | DATABASE §9 (M3), SRS §2.4 |
| B | (foundation) | FR-AUC-05,08,09 | TFR-005,008,009 | SDS §6, §12 task#3/#4 |
| C | S-16 | — (BRD §11) | TFR-017 | SDS §5.1, DATABASE §6 |
| C | S-1,S-2,S-3,S-4,S-11,S-12,S-13 | FR-AUC-01,02,03,04,11,12,13 | TFR-001,002,003,004,011,012,013 | SDS §5.2, API (seller endpoints) |
| C | S-5,S-6,S-7,S-9,S-14 | FR-AUC-05,06,07,09 + OQ-3 | TFR-005,006,007,009 | SDS §5.3, API (buyer endpoints) |
| D | S-4,S-11 (list UI) | FR-AUC-04,11 | TFR-004,011 | SDS §8.1, UI-DESIGN-SPEC |
| D | S-1,S-2 (create/edit form) | FR-AUC-01,02 | TFR-001,002 | SDS §8.2, UI-DESIGN-SPEC |
| E | S-11 (detail console) | FR-AUC-11 | TFR-011 | SDS §8.3 |
| E | S-10 (trigger verify) | FR-AUC-10 | TFR-010 | SDS §12 task#8 |
| E | S-10,S-13 (bid feed/chart/gauge) | FR-AUC-10,13 | TFR-010,013 | SDS §8.3, §9 |
| ทุก batch | S-15 (User Level) | — | TFR-016 | DATABASE §5, SRS Traceability §9 |

---

**หมายเหตุปิดท้าย:** เอกสารนี้ freeze scope ระดับ "อะไรอยู่ใน MVP" เท่านั้น — รายละเอียด implementation (function signature, DTO shape, route contract) ให้อ้าง SDS/API/DATABASE โดยตรง ไม่ duplicate ที่นี่ ถ้า spec เหล่านั้นเปลี่ยนกระทบ scope (เพิ่ม/ลด S-id) ต้องกลับมา sync ที่ baseline นี้ก่อนเสมอ
