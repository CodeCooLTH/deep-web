# Scope Baseline — 00019-ext Typhoon auto-suggest (ย้ายผู้ให้บริการร่างคำตอบเป็น Typhoon + แสดงคำแนะนำอัตโนมัติเมื่อมีคนดูห้อง)

สถานะ: ACTIVE
อ้างอิง PRD: 00019 FR-008 / BR-AI-09 / BR-AI-14 / BR-AI-15 · FR-AIT-01..21 · BR-AIT-01..12 · NFR-AIT-* · AC-AIT-01..16 · TC-AIT-01..09
spec (SSOT, อนุมัติโดย user 2026-10-09 "ตามข้อเสนอทั้งหมด"): `docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-10-09-typhoon-auto-suggest.md` (รวมภาคผนวก ก ซึ่งมีผลทับหัวข้อที่อ้างถึง)
มติ OQ: OQ-1..11 และ OQ-12..14 = ข้อเสนอในเอกสาร (สรุปที่ Assumptions)

## Goal
เมื่อแอดมินเปิดห้องแชทอยู่ (เว็บหรือแอป) และข้อความล่าสุดเป็นของลูกค้า ระบบสร้างคำแนะนำคำตอบเดียว (1-3 ประโยค) ด้วย Typhoon ให้เห็นเองโดยไม่ต้องกดขอ โดยไม่ส่งข้อมูลส่วนบุคคลหรือสื่อออกไปหา Typhoon (fail-closed) และเรียกโมเดลเฉพาะตอนมีคนดูห้องอยู่จริง

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.
> S-id "บังคับที่" ต้องมีเทสที่แดงเมื่อกฎถูกละเมิด (convention `rule-must-be-enforced-not-described`)

### A. เอกสาร (HR11 — ต้องเสร็จก่อนเขียนโค้ด)

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | sync เอกสาร feature 00019: `PRD.md` (§5/§6/§9 + ประโยค "แสดงอัตโนมัติ ≠ ส่งอัตโนมัติ" + ตัดข้อความบรรทัดเตือนท้ายแผงถ้ามี), `BRD.md` (BR-AI-09 · BR-AI-09-EX หมายเหตุขอบเขต · BR-AI-15 · §7.1 · §7.2 · เพิ่ม §8.5 BR-AIT-01..12), `SRS.md` (FR-AIT + TFR), `API.md`, `SDS.md`, `DATABASE.md`, `EXTENSIONS-2026-07-25.md` (BR-AIM-01 แก้ให้ตรงความจริง F-1), `EXTENSIONS-2026-07-29-usage-limit.md` (หมายเหตุ BR-AIT-08) — ตามเอกสาร §6.1 + §17 | `rg "BR-AIT-0[1-9]\|BR-AIT-1[0-2]"` พบใน BRD.md ครบ 12 ข้อ · `rg "Typhoon"` พบใน BRD §7.2 · BR-AIM-01 ไม่เขียนว่า "ข้อความถูกกรอง PII" อีกต่อไป · `diff` ชื่อไฟล์เอกสาร feature กับ template ครบ | TODO |
| S-2 | sync `docs/SRS.md` (root): data model `AiSuggestRun` (รวมฟิลด์ feedback 4 ตัว), API reference `POST/GET/PATCH .../ai-suggest/auto`, enums (`outcome`, `trigger`, `status`, `feedback`, `feedbackReason`) — HR11 | `rg "AiSuggestRun" docs/SRS.md` และ `rg "ai-suggest/auto" docs/SRS.md` พบ · ค่า enum ครบเท่า FR-AIT-17 + FR-AIT-20 | TODO |
| S-3 | `.env.example`: เพิ่ม `TYPHOON_API_KEY`, `TYPHOON_MODEL`, `TYPHOON_SUGGEST_SHOP_IDS`, `AI_SUGGEST_RPS`, `AI_SUGGEST_RPM` + แก้คอมเมนต์ `GEMINI_MODEL` ที่ล้าสมัย (F-12) · `docs/qa/ai-suggestion-usage-limit-qa-checklist.md` เพิ่มเส้นทาง Typhoon (ไม่มีโควตา) | `rg "TYPHOON_" .env.example` ครบ 3 ตัว + `AI_SUGGEST_RPS/RPM` · คอมเมนต์ `GEMINI_MODEL` ตรง default จริงใน `gemini.ts` | TODO |

### B. Data model

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-4 | `prisma/schema.prisma` + migration additive: ตาราง `AiSuggestRun` ตามเอกสาร §9 + ฟิลด์ feedback 4 ตัว (`feedback`, `feedbackReason`, `feedbackNote`, `feedbackAt`) · unique `(conversationId, anchorMessageId, attempt)` · index `createdAt`, `(shopId, createdAt)`, `(conversationId, createdAt)` · ไม่มีคอลัมน์ transcript/payload/ตารางป้าย (BR-AIT-09) · migration ไม่แตะตารางเดิม · ก่อน merge ต้องแจ้ง user 3 ข้อของ HR15 | migration เป็น CREATE TABLE/INDEX ล้วน (grep ไม่พบ ALTER/DROP ตารางอื่น) · apply บน local ด้วย `migrate deploy` ปักหมุด URL localhost (HR14) · ห้าม `migrate dev`/`db pull` · insert แถวซ้ำ key เดียวกัน = unique violation | TODO |

### C. Backend core (FR-AIT-01/02/10/11/12/13/17/18, BR-AIT-01/02/04/07/09)

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-5 | `src/lib/typhoon.ts` (`server-only`): ตัวเรียก `POST https://api.opentyphoon.ai/v1/chat/completions` Bearer `TYPHOON_API_KEY`, โมเดลจาก `TYPHOON_MODEL`, timeout แข็ง ~8 วิ, ไม่ retry, parse เองทนข้อความเปล่า · `TyphoonNotConfiguredError` / `TyphoonRateLimitedError` / `TyphoonApiError` · prompt ใช้กฎความปลอดภัยร่วมกับ Gemini โดยแยกตัวประกอบ prompt ออกมาใช้ร่วม ไม่คัดลอกสองชุด + คำสั่ง "ห้ามเดาชื่อ/เบอร์ ใช้ป้ายตามที่เห็น" + สั่งความยาว 1-3 ประโยค (A-7, FR-AIT-02/06) · key ไม่อยู่ใน error/log (NFR-AIT-Secrets) | `typhoon.test.ts`: ถูก URL/header/body · 429 → throw RateLimited และ fetch ถูกเรียก 1 ครั้ง · ตอบว่าง → ApiError · key หาย → ไม่มี fetch | TODO |
| S-6 | `src/lib/reply-suggest-provider.ts`: `resolveSuggestProvider(shopId)` คืน `typhoon`\|`gemini` ตาม `TYPHOON_SUGGEST_SHOP_IDS` (ว่าง = ไม่มีร้านไหน, ระบุ id, `*` = ทุกร้าน) · ทุกการร่างคำตอบผ่านตัวสลับนี้ · ร้านใน allow-list แต่ไม่มีกุญแจ → `NONE` ไม่ถอยไป Gemini เงียบ ๆ (E-13) | `reply-suggest-provider.test.ts` (TC-AIT-06) ว่าง/ระบุ/`*`/ไม่มีกุญแจ · grep-gate: `rg "generateReplySuggestions" src/app` พบเฉพาะการเรียกผ่านตัวสลับ | TODO |
| S-7 | `src/lib/ai-suggest-sanitize.ts`: `sanitizeForExternalAi` ครอบ turns + `instruction` + `contextBlock` · ใช้ `redactPii` + ชื่อที่ระบบรู้ (alias, realName, ExternalContact/Customer) → "ลูกค้า", ชื่อแอดมิน → "แอดมิน" · ไม่ส่ง `customerNote`/`customerName` ดิบ · สื่อ → `[รูป]`/`[ข้อความเสียง]`/`[ไฟล์]` ไม่ส่งสื่อ · throw = ไม่เรียก Typhoon (fail-closed) · สวิตช์ `includeMediaContext` ไม่มีผลกับ Typhoon (FR-AIT-10/18, BR-AIT-01) | `ai-suggest-sanitize.test.ts` (TC-AIT-01, AC-AIT-04/05/12): corpus เบอร์ 10 รูปแบบ (+66/ขีด/วรรค) เลขบัตร 13 หลัก อีเมล เลขบัญชี 10-15 หลัก ที่อยู่เต็ม ชื่อที่ระบบรู้ · payload ไม่มี `inline_data`/base64/URL สื่อ · **mutation**: ถอด `redactPii` ทีละชนิด เทสต้องแดงทุกชนิด · mock sanitize throw → fetch ไม่ถูกเรียก | TODO |
| S-8 | `src/lib/pii-redact.ts` เพิ่ม `redactPiiReversible()` + `restorePii()` แบบ additive (ป้ายมีลำดับ, ตารางจับคู่อยู่ในหน่วยความจำของ request เท่านั้น ไม่เก็บ DB ไม่ log) · ป้ายที่หาค่าไม่เจอ → ไม่แสดง `outcome=UNRESOLVED_TOKEN` · ห้ามเปลี่ยนพฤติกรรม `redactPii` เดิม (FR-AIT-11, BR-AIT-09, E-16) | `pii-redact.test.ts` เดิมผ่านโดยไม่แก้ · เทส round-trip (TC-AIT-02) ป้ายซ้ำ/หลายชนิดไม่สลับ · AC-AIT-13 · ป้ายที่ลูกค้าพิมพ์เลียน → ไม่แสดง | TODO |
| S-9 | `src/services/ai-suggest-auto.service.ts` — orchestration: (ก) claim แถว `AiSuggestRun` แบบ conditional idempotent ตาม (conversationId, anchorMessageId, attempt) ขอซ้ำขณะ THINKING/READY ไม่เรียกโมเดลซ้ำ · THINKING ค้าง >30 วิ = ตาย ขอใหม่ได้ (FR-AIT-13) (ข) เงื่อนไขข้าม: ไม่ใช่ BUYER · isSpam · งานบอทของ anchor PENDING/กำลังทำ · turns ว่าง · ไม่อยู่ allow-list · ไม่มีกุญแจ → คืน `NONE`+reason ไม่เรียก fetch (FR-AIT-09, E-4, OQ-11) (ค) ตัวคุมจังหวะนับจาก `AiSuggestRun`: รวม ≤ `AI_SUGGEST_RPS` (3), รวม ≤ `AI_SUGGEST_RPM` (100), ต่อร้าน ≤ ครึ่งของ RPM (50) · รอได้ ~5 วิ แล้วทิ้งเงียบ · 429 ไม่ retry · `RATE_LIMITED` (FR-AIT-12, BR-AIT-04) (ง) ตัดผลเกิน 3 ประโยค/ยาวผิดปกติ ไม่ทิ้งทั้งก้อน (FR-AIT-06) (จ) บันทึก outcome/latency/token/provider/model/trigger ทุกคำขอ ห้ามบันทึกเนื้อความ (FR-AIT-17) (ฉ) ทิ้งผลที่ anchor ไม่ใช่ BUYER ล่าสุด (FR-AIT-08, BR-AIT-05) | เทสแยกต่อเงื่อนไข: TC-AIT-03 (claim พร้อมกัน 2 ตัว → 1 แถว 1 เรียกโมเดล, AC-AIT-10) · TC-AIT-04 (20 คำขอพร้อมกัน ยิงจริง ≤3/วินาที, ร้านเดียว 100 คำขอ/นาที ไม่เกินโควตาร้านและไม่บล็อกร้านอื่น, AC-AIT-06/07) · TC-AIT-05 (ทุกเงื่อนไขข้ามมี outcome ถูก + ไม่มี fetch) · ป้อนคำตอบ 6 ประโยค → ≤3 ประโยค · ไฟล์ไม่มี `console.*` ที่รับ body/text (TC-AIT-07) | TODO |

### D. API

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-10 | `src/app/api/chat/conversations/[id]/ai-suggest/auto/route.ts` handler `POST` + `GET` ตามเอกสาร §10 · Valibot ใน `src/lib/validations.ts` · `force-dynamic` + `Cache-Control: private, no-store, max-age=0, must-revalidate` · `shopId` จากเธรดผ่าน `resolveConversationShopId` เท่านั้น · `sessionUserId()` ไม่ cast · ownership ใน WHERE `{id, shopId}` · `manual:true` ใช้ `checkApiRateLimit` 15/นาที/ผู้ใช้ → 429+`Retry-After` · `GET` อ่าน DB อย่างเดียวไม่เรียกโมเดล · ล้มเหลวทุกแบบคืน 200 `NONE` ไม่ใช่หน้า error (NFR-AIT-Failsoft) (FR-AIT-03/04/13/16, NFR-AIT-Cache/Sec/Load) | เทส route: 200 READY/THINKING/NONE · 400 body ผิด/anchor ไม่ใช่ของห้อง · 401/404 (ห้องร้านอื่นไม่ leak) · กด ↻ 2 ครั้ง → 2 แถว attempt ต่างกัน · ครั้งที่ 16 ใน 1 นาที → 429 · header Cache-Control ถูก · `GET` ไม่มี fetch | TODO |
| S-11 | `PATCH .../ai-suggest/auto` (feedback): `{anchorMessageId, attempt, feedback:"UP"\|"DOWN", reason?, note?≤120}` · `reason` ∈ {WRONG_INFO, OFF_TOPIC, BAD_TONE, LENGTH} · DOWN เปล่า ๆ ก็นับ · `note` ผ่าน `redactPii` ก่อนบันทึก (BR-AIT-11) · ตรวจ `{id, shopId}` → 404 ถ้าไม่ใช่ · กดซ้ำเปลี่ยนค่าได้ · ไม่เรียกโมเดล (FR-AIT-20) | TC-AIT-09: `reason` นอกรายการ → 400 · note 121 ตัว → 400 · note มีเบอร์ → ถูกปิดบังก่อนบันทึก (**mutation**: ถอดตัวกรอง เทสต้องแดง) · AC-AIT-15 (DOWN, reason=null) · แถวของร้าน/เธรดอื่น → 404 | TODO |
| S-12 | แก้เส้นทางเดิม `ai-suggest/route.ts`: เรียกผ่านตัวสลับ (S-6) · ร้านนอก allow-list = พฤติกรรมเดิม 100% (Gemini + โควตา 10/วัน + 402) · ร้านใน allow-list เรียกเส้นเดิมได้ (กันแอปเก่า) ผ่าน sanitize + ตัวสลับเหมือนกัน · เส้นทาง Typhoon ไม่นับโควตาฟรี ไม่หักเครดิต ไม่ถามยืนยัน ไม่เขียน `AiSuggestUsageEvent` · ข้ามบล็อก media เมื่อ provider = Typhoon (FR-AIT-01/14/18, BR-AIT-08) | AC-AIT-11: ร้านใน allow-list ขอ 20 ครั้ง → `AiSuggestDailyUsage`/`WalletTransaction` ไม่เปลี่ยน · ร้านนอก allow-list ครั้งที่ 11 ยังเจอ 402 `QUOTA_EXCEEDED` · เทสทั้งสองสาขา | TODO |
| S-13 | **OQ-3 = ใช่:** ใช้ `sanitizeForExternalAi` กับเส้นทาง Gemini เดิมสำหรับ ข้อความลูกค้า + ชื่อ + `customerNote` (ปิดช่องว่าง BR-AI-09 ที่ F-1 พบ) · รูป/เสียงบน Gemini ยังเป็นไปตามสวิตช์ BR-AIM-01 เดิม · ทำโดยแก้ที่ route/ตัวประกอบ turns เท่านั้น **ห้ามแก้ `gemini.ts`** | เทสว่า payload ที่ไป Gemini ผ่านเส้น ai-suggest ไม่มีเบอร์/อีเมล/ที่อยู่/`customerNote` ดิบ · `git diff` ไม่แตะ `src/lib/gemini.ts` | TODO |

### E. Frontend (ทุกข้อผ่าน `safepay-ux` ก่อน — HR8; ใช้ `AiSuggestPanel` เดิม ไม่ออกแบบ layout ใหม่; ห้าม emoji HR12; theme Paces HR1/HR6/HR7)

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-14 | hook `useAutoSuggest` ใน `ChatThread.tsx`: เกาะ `refetchNewer` ของ `useSellerChatThread.ts` · ยิงเฉพาะเมื่อ mount ห้อง + `document.visibilityState==='visible'` · debounce trailing ~1.5 วิ ใช้ anchor ล่าสุด · กฎ ข (เปิดห้องที่ค้างข้อความลูกค้า: `GET` ก่อน มีผลแล้วแสดงทันที ไม่มีผลค่อย `POST`) · poll `GET` ทุก ~1.5 วิ สูงสุด ~10 วิ เฉพาะ THINKING แล้วกลับ "ไม่มี" · ทิ้งผลที่ anchor ไม่ใช่ BUYER ล่าสุด · ไม่มี polling ที่ยิงโมเดล (FR-AIT-03/04/05/08, BR-AIT-03/05, NFR-AIT-Load, E-3, E-14) | เทสพฤติกรรม hook: hidden → ไม่เรียก POST · ส่ง A แล้ว B → แสดงเฉพาะ B (AC-AIT-08) · ร้านตอบก่อนผลมา → ไม่แสดง · เปิดซ้ำ → ไม่มีแถวใหม่ (AC-AIT-02) · หลัง 10 วิยัง THINKING → กลับเป็น "ไม่มี" · ปิดแท็บแล้วลูกค้าส่ง → ไม่มีแถว `AiSuggestRun` ใหม่ (AC-AIT-03) | TODO |
| S-15 | ปรับ `AiSuggestPanel.tsx` (ไม่ออกแบบใหม่): แทน 3 ปุ่มด้วยคำตอบเดียว · รูปแบบ FR-AIT-19 (ไม่มีกรอบ/การ์ด · บรรทัดเล็กสีรอง "AI · คำตอบแนะนำ" + ข้อความ · กดข้อความ = ใส่ช่องพิมพ์ ไม่ส่งเอง) · ปุ่มครบ 4 อย่างเท่านั้น ถูกใจ/ไม่ถูกใจ/สร้างใหม่/ปิด ไม่มีปุ่มแก้ · ตัดบรรทัดเตือนท้ายแผง (`:336-338`) · ถอดชิป token/USD + ป้ายโควตาบนเส้นทาง Typhoon และไม่เรียก `GET /api/chat/ai-quota` · เมนูเหตุผล "ไม่ถูกใจ" (4 ข้อ + ช่อง ≤120 ไม่บังคับ, เมนูไม่ปิดเมื่อเลือกเหตุผล) · สถานะ "กำลังคิด" · live region `role="status"` · `aria-label` ที่มี role รองรับ · tap target `size-11 lg:size-7` · ข้อความใหม่ผ่านระบบ i18n TH/EN ไม่ hardcode ไทยใน component ร่วม (FR-AIT-14/16/19/20, NFR-AIT-i18n/A11y) | AC-AIT-16: นับปุ่มได้ 4 ไม่มีปุ่มแก้ ไม่มีบรรทัดท้ายแผง · กดข้อความ → ช่องพิมพ์ได้ข้อความนั้น และไม่มี request ส่งข้อความ · ร้าน Typhoon ไม่เห็น "เหลือฟรีวันนี้"/"ใช้ได้ไม่จำกัด"/ชิป token · ร้าน Gemini ยังเห็นป้ายโควตาเดิม · `rg "from ['\"]react-toastify" "src/app/(paces)/"` = 0 (HR9) · ไม่มี emoji | TODO |
| S-16 | พฤติกรรมช่องพิมพ์ FR-AIT-07: คำแนะนำไม่เขียนลงช่องพิมพ์เอง (`setText` เรียกเฉพาะจาก `onPick`) · แอดมินเริ่มพิมพ์ → แผงซ่อน + ปุ่มเรียกกลับเฉพาะตอนซ่อน · "ปิด" ปิดเฉพาะ anchor นี้ ข้อความลูกค้าใหม่เปิดแผงอีกครั้ง · ไม่แย่งโฟกัส/ไม่เลื่อนหน้า (E-2) · ความเห็นผูกแถวเดิม ไม่ย้ายไปแถวใหม่ (E-17/E-18) | AC-AIT-09: พิมพ์ "abc" → คำแนะนำมา → ช่องยังเป็น "abc" ตลอด · แผงซ่อนมีปุ่มเรียกกลับ · "ปิด" แล้วข้อความใหม่ → แผงกลับมา · กด "สร้างใหม่" หลัง "ไม่ถูกใจ" → ความเห็นเดิมอยู่ที่ attempt เดิม ผลใหม่ไม่มีความเห็น | TODO |
| S-17 | หน้า `/settings/ai`: คำอธิบายสวิตช์สื่อว่าใช้กับผู้ให้บริการที่รองรับสื่อเท่านั้น (FR-AIT-18) — ข้อความจริงโดย `safepay-ux` · ผ่าน i18n | เปิดหน้า → คำอธิบายแสดง TH/EN · สวิตช์เปิดแล้วลูกค้าส่งรูป ร้าน Typhoon → payload มีแค่ `[รูป]` (AC-AIT-12) | TODO |
| S-18 | FR-AIT-21 (กล่องกลางสาย "ลูกค้าต้องการคุยกับแอดมิน" จาก `handoffAt`/`handoffReason`) **แบบมีเงื่อนไข (OQ-13):** `safepay-ux` ตรวจก่อนว่ามีอยู่แล้วหรือไม่ — มีแล้ว = ปิด S-18 เป็น N/A (บันทึก Change Log) · ไม่มี = ทำตามพฤติกรรมอ้างอิง ใช้ฟิลด์เดิม ไม่สร้างฟิลด์ใหม่ | บันทึกผลตรวจของ ux ใน Change Log · ถ้าทำ: ห้องที่ `handoffAt` มีค่า → กล่องกลางสายแสดงเหตุผลจาก `handoffReason` · `handoffAt` ว่าง → ไม่แสดง · ไม่ซ้ำกับที่แสดงอยู่ | TODO |

### F. Gate คุณภาพ / ปิดงาน

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-19 | grep-gate ความปลอดภัยและขอบเขต (TC-AIT-07, FR-AIT-05, NFR-AIT-Webhook, AC-AIT-14): webhook ไม่เรียก provider, ไม่แตะเวลาตอบ 200 | `rg "reply-suggest-provider\|typhoon" src/app/api/**/webhook*` = 0 · `git diff main --stat` ไม่มี `facebook/webhook`, `line/webhook` · ไฟล์ใหม่ทั้งหมดไม่มี `console.*` ที่รับ body/text | TODO |
| S-20 | QA end-of-phase: Playwright E2E บนเบราว์เซอร์จริง (TC-AIT-08) เปิดห้อง → กำลังคิด → คำแนะนำ → พิมพ์ → แผงซ่อน → เรียกกลับ → ถูกใจ/ไม่ถูกใจ/สร้างใหม่/ปิด · มือถือ 390px · วัด latency ซ้ำบนระบบเรา (NFR-AIT-Latency p95 ≤ 4 วิ — ไม่เชื่อตัวเลข gochat) · reviewer (grep-gate) + security (PII) + `safepay-ux` + `/impeccable critique` + `clarify` (HR8) ก่อน mark complete · Playwright ปักหมุด URL localhost (HR14) | รายงาน QA แนบหลักฐาน AC-AIT-01..16 ทุกข้อ · ผล latency p95 บันทึกจริง · security sign-off ว่า payload ที่ออกไปหา Typhoon ไม่มี PII ใน corpus | TODO |
| S-21 | ปิด phase: บรรทัด snapshot ใน `CLAUDE.md` + `docs/claude/state-snapshots.md` · ยืนยัน A-3 (แอป `deep-seller-app` เปิดหน้าแชทเว็บเดียวกันใน WebView) ก่อน dev และบันทึกผล · ยืนยัน `TYPHOON_API_KEY` ใน Vercel Production (งาน env ไม่ใช่โค้ด — แจ้ง user) | snapshot ลงครบ · ผลยืนยัน A-3 บันทึกใน Change Log (ถ้าไม่จริง = กลับไปทบทวน D-1/OQ-1 ต้องผ่าน Controller) | TODO |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | **ความจำของแชท** (ย่อหน้าที่ AI เขียน/แอดมินแก้) — ห้ามมีปุ่ม ช่อง หรือ prompt | ภาคผนวก ก §12 "รอ user ตัดสินแยก" ข้อ 1 |
| OOS-2 | **สินค้าที่สนใจที่แอดมินแปะ** — ห้ามมีปุ่ม ช่อง หรือ prompt | ภาคผนวก ก §12 ข้อ 2 |
| OOS-3 | **ดึงสต็อกสดจาก OMS ให้ AI ตอบ มี/หมด** — ห้ามมีปุ่ม ช่อง หรือ prompt | ภาคผนวก ก §12 ข้อ 3 |
| OOS-4 | **00072 OCR ที่อยู่จากรูป** (`docs/20 - Features/00072 - Address From Image (OCR)/`) และ `POST /api/orders/parse-address` (ข้อยกเว้น BR-AI-09-EX ไม่ขยายมาครอบ Typhoon) | เอกสาร §12 |
| OOS-5 | **ฟีเจอร์ Gemini อื่น:** ChatBot ตอบอัตโนมัติ 00023 (`auto-reply.service.ts`) · AI Enhance (`ai-enhance.service.ts`, `ai-enhance-billing.service.ts`) · `generateText()` และ `MODEL_CANDIDATES` | เอกสาร §12 — คง Gemini ตามเดิม |
| OOS-6 | **แก้ไฟล์ห้ามแตะ:** `src/lib/gemini.ts`, `ai-enhance.service.ts`, `auto-reply.service.ts`, `parse-address/route.ts` (แก้ = CREEP ทันที) | เอกสาร §17 "ห้ามแตะ" + F-11 (ยังเป็นเส้นทางของร้านนอก allow-list) |
| OOS-7 | **ส่งสื่อ (รูป/เสียง) ให้ Typhoon** ไม่ว่าสวิตช์ `includeMediaContext` จะเปิดหรือไม่ | ข้อ 2 ของ TAC · FR-AIT-18 |
| OOS-8 | **ส่งคำแนะนำอัตโนมัติโดยไม่มีคนกด** และ **สร้างคำแนะนำล่วงหน้า/ย้อนหลังให้ห้องที่ไม่มีคนเปิด** | ขัด BR-AI-14 / BR-AIT-06 / BR-AIT-03 ข้อ ค |
| OOS-9 | **Presence ฝั่ง server แบบ gochat + trigger จาก webhook**, heartbeat, การเพิ่มงานใดใน webhook | OQ-1 = D-1 (client เป็นผู้ขอ) · NFR-AIT-Webhook · พิจารณาเมื่อ A-3 ไม่จริง |
| OOS-10 | **โควตารายเดือน + สถานะ "AI ใช้ครบโควตา/วันเริ่มใหม่" (FR-AIT-22)**, การ์ด "โควตาเดือนนี้" หน้า /ai, ป้าย/ตัวกรอง "รอแอดมิน" ในรายการห้อง | OQ-12 = ไม่เพิ่มโควตารายเดือน · §12 หมายเหตุ UI |
| OOS-11 | **ย้ายตำแหน่ง credit-block เดิมของเส้นทาง Gemini ไปเป็นกล่องกลางสายแชท** | OQ-12 ข้อเสนอระบุ "ต้องให้ user ตัดสินว่าย้ายหรือคงตำแหน่ง" → สมมติ **คงตำแหน่งเดิม** (ดู Assumptions) |
| OOS-12 | **ลบ/แก้ตรรกะระบบโควตา/เครดิต/`AiSuggestUsageEvent` เดิม** และ endpoint `GET /api/chat/ai-quota` | OQ-5 = คงโค้ดไว้ทั้งหมดสำหรับ Gemini · การลบต้องขอ user |
| OOS-13 | **ตัวลบแถว `AiSuggestRun` เก่า (retention)** และแดชบอร์ดสถิติ outcome | OQ-8 · การลบต้องขออนุมัติ user · Phase 2 |
| OOS-14 | **สวิตช์ปิดการแสดงอัตโนมัติต่อร้าน/ต่อผู้ใช้** (`ShopAiSetting.autoSuggest`) | OQ-10 = ยังไม่ทำ ปุ่ม "ปิด" ของแผงพอ |
| OOS-15 | **ระบบความยินยอม/ประกาศเงื่อนไขข้อ 4 ของ TAC กับร้านลูกค้าทั่วไป** และการเปิด Typhoon ให้ทุกร้าน (`TYPHOON_SUGGEST_SHOP_IDS=*` บน prod) | OQ-2 / BR-AIT-10 — ต้อง user อนุมัติแยก (รับ R-1/R-2 เป็นลายลักษณ์อักษร + ประกาศ + ดูสถิติ `RATE_LIMITED`) |
| OOS-16 | **ตัวนับจังหวะกลาง (Redis/แถว counter)** แทนการนับจาก DB | R-5 ceiling ที่ยอมรับ — ทำเมื่อ burst เกินจริง |
| OOS-17 | **ให้ความเห็น (feedback) ย้อนกลับไปปรับ prompt** | OQ-14 — เก็บเพื่อวัดคุณภาพเท่านั้น |
| OOS-18 | **เพดานอายุข้อความลูกค้าที่ค้าง (ตัด >24 ชม.)** | OQ-9 — สร้างตามกฎ ข ไม่ตัดอายุ |
| OOS-19 | **สิทธิ์บริบทสินค้า/ลูกค้าของร้าน non-paid (FR-AIQ-10) ไม่เปลี่ยน** | OQ-7 — คงตามเดิม |
| OOS-20 | **ออกแบบ layout/สี/ธีมใหม่ของแผง** หรือคัดลอก layout/สีของธีม gochat | HR1/HR6/HR8 — อ้างอิงเฉพาะพฤติกรรมและสถานะ |
| OOS-21 | **งาน Vercel env** (ตั้ง/ยืนยัน `TYPHOON_API_KEY` และตัวแปรใหม่บน Production) | ไม่ใช่งานของโค้ด — แจ้ง user ใน S-21 |

## Assumptions
- OQ-1..11 = ข้อเสนอในเอกสาร §15 ทุกข้อ: D-1 client เป็นผู้ขอ · allow-list ช่วงนำร่อง ค่าเริ่มต้นว่าง · OQ-3 sanitize ครอบเส้นทาง Gemini ด้วย · คำตอบเดียว · ไม่คิดโควตา/เครดิตบนเส้นทาง Typhoon · RPM รวม 100 / ต่อร้าน 50 · คงสิทธิ์ non-paid · เก็บ 30 วัน (ลบเป็นงานแยก) · ไม่ตัดอายุข้อความ · ยังไม่มีสวิตช์ปิด · ข้ามบอทเมื่องานของ anchor ยัง PENDING/กำลังทำ
- OQ-12 → ไม่เพิ่มโควตารายเดือน; ส่วนที่ข้อเสนอเปิดทางเลือก "ย้ายตำแหน่ง credit-block ของ Gemini" PM สมมติเป็น **ไม่ย้าย** (เสียงข้างน้อยคือไม่เปลี่ยนของเดิม) จนกว่า user ตัดสินเพิ่ม
- OQ-13 → `safepay-ux` ตรวจก่อน ถ้ามีอยู่แล้วตัด FR-AIT-21 (S-18)
- OQ-14 → 4 เหตุผลตาม gochat ตรงตัว
- A-1..A-8 ตามเอกสาร §14 (debounce ~1.5 วิ · timeout Typhoon ~8 วิ · รอคิว ≤ ~5 วิ · poll GET ~1.5 วิ ไม่เกิน ~10 วิ · ปรับได้ตอน QA) เพดานตัวอักษรของ "ยาวผิดปกติ" (FR-AIT-06) กำหนดตอนเขียน SDS
- ชื่อตาราง/สถานะของงานบอท (S-9 ข้อ ข) ต้องยืนยันจากโค้ดตอนเขียน SDS (เอกสารยังไม่ได้ระบุ — OQ-11)
- ข้อความล่าสุดเป็นสื่อล้วนยังสร้างคำแนะนำได้ (A-4)
- ช่วงนำร่อง = ร้านของเราเอง (ผ่าน `TYPHOON_SUGGEST_SHOP_IDS`); ใน phase นี้ **ไม่เปิด `*` บน prod**

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- ความจำของแชท · สินค้าที่สนใจที่แอดมินแปะ · ดึงสต็อกสดจาก OMS (OOS-1..3) — รอ user ตัดสินแยก
- retention/ลบแถว `AiSuggestRun` + แดชบอร์ดสถิติ outcome (OOS-13)
- เปิด Typhoon ให้ทุกร้าน + ประกาศ/ความยินยอม + ตัดสินแพ็กเกจ "AI ไม่จำกัด" ที่ผูก paid plan (OOS-15, OQ-5)
- สวิตช์ปิดต่อร้าน/ต่อผู้ใช้ (OOS-14)
- ตัวนับจังหวะกลาง (OOS-16) · presence ฝั่ง server (OOS-9)
- โควตารายเดือน/การย้ายตำแหน่ง credit-block (OOS-10, OOS-11)

## Definition of Done
phase นี้ SIGNED-OFF ได้เมื่อครบทุกข้อ (อ้างหลักฐานทีละข้อ):
1. S-1..S-21 ทุกข้อ DONE และ acceptance ผ่านพร้อมหลักฐาน (commit hash / ชื่อเทส / ผล QA) — S-18 อาจเป็น N/A เมื่อบันทึกใน Change Log
2. AC-AIT-01..16 และ TC-AIT-01..09 ผ่านครบ โดยเทสที่ระบุ mutation (S-7, S-8, S-11) แดงจริงเมื่อถอดตัวกรอง
3. `npx tsc --noEmit` exit 0 · เทสทั้งชุดผ่าน (รันกับ `DATABASE_URL` ชี้ localhost เท่านั้น — ห้ามชี้ Supabase prod; HR13/HR14) · `pii-redact.test.ts`/เทส gemini เดิมผ่านโดยไม่แก้
4. `git diff main` ไม่แตะ OOS-6 (`gemini.ts`, `ai-enhance.service.ts`, `auto-reply.service.ts`, `parse-address/route.ts`, webhook) และทุก commit map S-id ได้ (ไม่มี CREEP)
5. migration เป็น additive ล้วน, แจ้ง user ครบ 3 ข้อของ HR15 ก่อน push `main`, ไม่มีการสั่ง migrate ชี้ prod เอง
6. grep-gate ผ่าน: HR9 (react-toastify = 0), HR12 (ไม่มี emoji), HR7 (ไม่มี arbitrary Tailwind ใน `(paces)/**` เว้นมีคอมเมนต์), TC-AIT-07
7. QA ด้วยเบราว์เซอร์จริง (Playwright E2E + มือถือ 390px) ผ่าน และวัด latency p95 ≤ 4 วิ บนระบบเรา; `safepay-ux` gate + `/impeccable critique` + `clarify` ผ่านก่อน mark complete
8. security review ยืนยันว่า payload ที่ออกไปหา Typhoon ไม่มี PII/สื่อ และ fail-closed ทำงานจริง; R-1 และ BR-AIT-12/R-10 (การตัดบรรทัดเตือนท้ายแผง) user รับรู้เป็นลายลักษณ์อักษรแล้ว (user ตอบ "ตามข้อเสนอทั้งหมด" 2026-10-09 — ข้อนี้ต้องแจ้งซ้ำในรายงานปิด phase)
9. เอกสาร S-1..S-3 sync แล้ว และ `CLAUDE.md` + `docs/claude/state-snapshots.md` มีบรรทัด snapshot
10. ผล A-3 (แอป WebView) ถูกยืนยันและบันทึก
11. Change Log ครบทุกการรับเข้า/เลื่อนออก ไม่มี CREEP ค้าง

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-10-09 | S-18 → N/A | safepay-ux ตรวจ OQ-13: handoff แสดงอยู่แล้วที่ชิปบอทหยุด/`BotPausedBanner.tsx` และไม่มีข้อมูล "ลูกค้าขอคุยกับคน" ให้แสดง → ไม่ทำกล่องกลางสายใหม่ | Controller |
| 2026-10-09 | S-15 ทำเป็นไฟล์ใหม่ `AiSuggestInline.tsx` แทนการแก้ `AiSuggestPanel.tsx` | ร้าน Gemini คงพฤติกรรมเดิม 100% พิสูจน์ด้วย diff ว่าง + เลี่ยง hook ใต้ early return | Controller |
| 2026-10-09 | S-4 เพิ่มคอลัมน์ `firedAt` + index `[firedAt]`, `[shopId, firedAt]` | planner C-2: นับ "ยิงจริง" จาก createdAt ไม่ได้ ต้องมีเวลาเริ่มยิงแยก | Controller |
| 2026-10-09 | S-10 response เพิ่ม `provider`/`attempt`/`feedback`, POST body เพิ่ม `trigger?` | planner C-3: superset ของ spec §10 ที่ client ต้องใช้ | Controller |
| 2026-10-09 | A-3 ยืนยัน | `safepay-mobile/App.tsx` = react-native-webview ห่อ seller.deepthailand.app | Controller |
