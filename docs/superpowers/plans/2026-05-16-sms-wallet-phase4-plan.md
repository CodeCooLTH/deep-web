# Phase 4 Build Plan — Paid SMS Order Link + Seller Wallet/Credit

สถานะ: **Phase 1-3 (Discovery/Requirement/Design+Security) เสร็จ — read-only. Phase 4 BUILD ยังไม่เริ่ม (deferred).**
Input: spec `docs/superpowers/specs/2026-05-16-sms-order-link-wallet.md` (decisions D1-D3, hard constraints, **RC-1..RC-8 mandatory, AR-1..AR-3**). Full FR/AC/edge = spec. ตัวนี้ = execution plan.

## ⛔ Phase 4 Preconditions (ครบทุกข้อก่อน build)
1. **git สะอาด** — parallel stream (Anuphan/OMS uncommitted: prisma/seed.ts, lib/auth.ts, prisma/schema.prisma, marketing/o/[token], dashboard/verification) commit ก่อน. schema.prisma + /o/[token]/page.tsx ชนตรง ๆ — ห้ามเริ่มจนเคลียร์
2. **Explore E1-E4** (Controller, read-only ก่อน dispatch):
   - E1: `git diff src/app/(marketing)/o/[token]/page.tsx` — short-code resolver จะ modify ไฟล์นี้ (รวม route, ไม่สร้าง [code] แยก — Next ห้าม dynamic ซ้ำ)
   - E2: อ่าน `src/lib/storage/*` — confirm validateUpload MIME+5MB (security อ่านแล้ว = PASS; re-confirm ตอน build)
   - E3: seller sidebar `_seller-menu.ts` — เพิ่ม nav `/seller/wallet` (explicit /seller/*)
   - E4: admin sidebar — เพิ่ม nav `/admin/topups`
3. security review design = **DESIGN-MUST-CHANGE → RC-1..8 fold ใน spec แล้ว** (ทำแล้ว). Phase 5 security re-review โค้ดจริงอีกครั้ง
4. `safepay-database` review schema + migration-safe (Unit A) — additive 4 model, no destructive, Supabase-applied, prisma generate + tsc full pass
5. Controller WebFetch apitel SMS API schema (field verbatim) ฝังใน T2 prompt (retro lesson 10; devs ไม่มี WebFetch)

## Models (Unit A — safepay-database; RC folded)
- **SellerWallet** 1:1 Shop: id, shopId@unique, balance Int default0 (฿ integer), ts. **RC-3: DB `CHECK(balance>=0)`**
- **WalletTransaction**: id, walletId FK, type(TOPUP|DEDUCT), amount Int+, balanceAfter Int, description, refId String?, createdAt. idx walletId+createdAt desc
- **TopUpRequest**: id, shopId FK, amount Int, slipFileId, status(PENDING|APPROVED|REJECTED), reviewedById FK User?, reviewedAt?, rejectedReason?, ts. idx status
- **SmsCode**: id, codeHash@unique(SHA-256), orderId FK, buyerPhone, expiresAt(+72h), usedAt?, **deliveryStatus(PENDING|SENT|FAILED) [RC-3]**, createdAt. idx codeHash, orderId, expiresAt

## Task plan (22 tasks; RC mapped) — agent-team-phase 5-gate, batch≤3
| Unit/Batch | Tasks | RC ที่ผูก |
|---|---|---|
| **A** safepay-database | T1 schema (4 model + CHECK bal>=0 + deliveryStatus) | RC-3 |
| **B1** dev×3 | T2 `lib/sms.ts` generic sendSms (apitel, sender omit, no-log code/text) · T3 wallet.service (conditional-update `WHERE balance>=1`, getOrCreate/deduct/getTx) · T4 sms-code.service (crypto 12-char base32, hash-at-rest, single-use in $transaction, uniform-error) | RC-3,RC-8 / RC-1,RC-2 |
| **B2** dev×3 | T5 topup.service (create/approve-atomic/reject) · T6 validations (+3 Valibot) · T8 `GET /api/wallet` | — |
| **B3** dev×3 | T7 `POST /api/orders/[token]/send-sms` (L2 gate NO test-exc, DAL ownership, daily-cap, atomic deduct+issueCode+set buyerContact, 2-phase compensate, rate-limit) · T9 `POST /api/wallet/topup`+slip · T12 `GET /api/admin/topups` | **RC-4,RC-5,RC-6,RC-8** |
| **B4** dev×2 | T10 admin approve (**self-approve block** shop.userId!==admin.id) · T11 admin reject+reason | **RC-7** |
| **B5** dev×3 | T13 modify `/o/[token]/page.tsx` short-code resolver (12-char→consume→autoUnlock; UUID→เดิม) **[E1 gated]** · T14 `/seller/wallet` page · T19 `/admin/topups` queue | RC-1,RC-2,RC-6 |
| **B6** dev×3 | T15 TopUpRequestModal (slip upload) · T16 WalletTransactionTable · T20 `/admin/topups/[id]` detail | — |
| **B7** dev×2 | T17 SendSmsButton (**ไม่รับ raw buyerContact prop** [RC-8]) · T21 TopUpReviewActions | RC-8 |
| **B8** seq | T18 wire SendSmsButton เข้า order-detail page.tsx · T22 docs | — |
| **Phase 5** | safepay-reviewer + safepay-security (re-review code; context-shift C1 grep; verify RC-1..8 implemented) | all RC |
| **Phase 6** | safepay-qa 3-level: seller topup+slip → admin approve → balance → send SMS → buyer /o/{code} auto-unlock → confirm; negative: L2-block, balance<1, expired code, rate-limit 429, self-approve-block, daily-cap | — |

Theme map (Paces): /seller/wallet ← orders/page.tsx+OrdersList · TopUpRequestModal ← AddCategoryModal · WalletTransactionTable ← OrdersList · SendSmsButton ← in-proj CopyLinkButton · /admin/topups ← issue-tracker · /admin/topups/[id] ← order-details · TopUpReviewActions ← in-proj verifications/[id]/ReviewActions. (Anuphan Hard Rule 5; theme-copy + Base:)

## Phase 7 → invoke `phase-retro`
