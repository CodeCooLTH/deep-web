# QA Checklist — AI Suggestion Usage Limit & Credit (feature 00019 ext, 2026-07-29)

> reusable regression checklist · spec (SSOT): `docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-07-29-usage-limit.md`
> รันที่ `seller.deepth.local:4000` (user รัน dev server เอง) — **ต้องรันจาก worktree `feature-ai-suggestion-limit` (branch `feature/ai-suggestion-limit`)**
> code: `src/services/ai-suggest-quota.service.ts`, `src/lib/ai-suggest-limit.ts`, `src/app/api/chat/ai-quota/route.ts`,
> `src/app/api/chat/conversations/[id]/ai-suggest/route.ts`, `src/app/api/shops/ai-settings/route.ts`,
> `src/app/(paces)/seller/(dashboard)/settings/ai/{page.tsx,AiSettingForm.tsx}`,
> `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AiSuggestPanel.tsx`

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight — mandatory)
- [ ] **verify dev server ที่ port 4000 serve worktree/branch ที่ถูกต้อง** ก่อนเทสทุกครั้ง —
      `curl -s -o /dev/null -w "%{http_code}" http://seller.deepth.local:4000/api/chat/ai-quota` ต้องได้ `401`
      (unauthenticated) **ไม่ใช่ `404`** — 404 แปลว่า server กำลัง serve worktree อื่นที่ไม่มีฟีเจอร์นี้
      (เจอจริงในรอบ 2026-07-29: server ชี้ `revise-ui-order-link` branch `revise/ui-order-link` แทน)
- [ ] ยืนยัน `GEMINI_API_KEY` ตั้งค่าอยู่ใน process ของ dev server (ไม่มีใน `.env.local`/`.env.example` ที่ตรวจได้จาก QA
      agent — อาจ export ใน shell ก่อน `npm run dev`) — ถ้าไม่ตั้ง ทุก path จะจบที่ 503 "ระบบ AI ยังไม่พร้อมใช้งาน"
      + auto-refund (ทำให้ตัวนับ/เครดิตไม่ขยับสุทธิ แม้ gate logic ทำงานถูกต้อง) ต้องแจ้งผลนี้ในรายงานแยกจาก "โควตา block"
- [ ] seed ร้าน **non-paid** (ไม่มี `BusinessPackageSubscription` หรือมีแต่ไม่ `ACTIVE`) + ร้าน **paid**
      (`BusinessPackageSubscription.status='ACTIVE'`) ผ่าน Prisma script — **บันทึกค่าที่ seed ไว้เพื่อ cleanup**
- [ ] seed 1 conversation + ≥1 ChatMessage ต่อร้าน (ai-suggest 400 ถ้าเธรดไม่มีข้อความเลย)
- [ ] เตรียม `SellerWallet.balance` ของร้าน non-paid ตามซีนาริโอ (≥฿1 กับ ฿0)
- [ ] เตรียม `AiSuggestDailyUsage(shopId, date=todayThaiIsoDate())` ตาม boundary ที่จะเทส (count=9 / count=10)
- [ ] restart dev server ถ้าเพิ่ง migrate/generate (stale Prisma client)

## A. หน้า `/settings/ai`
- [ ] **A1** ร้าน non-paid เปิดหน้า → สวิตช์ทั้ง 3 (สินค้า/ประวัติลูกค้า/รูป-เสียง) แสดง **disabled** จริง (กด/คลิกไม่ติด, `pointer-events` หรือ `disabled` attr)
- [ ] **A1** ร้าน non-paid → badge **"อัพเกรดแพ็กเกจ"** ท้ายหัวข้อทั้ง 3 (หรือ **"ต่ออายุแพ็กเกจ"** ถ้า `LOCKED_RENEWAL_FAILED`) กดแล้วไป `/business` จริง
- [ ] **A1** ร้าน non-paid → banner เหนือกลุ่มสวิตช์ ข้อความ "ตอนนี้ AI เห็นเฉพาะข้อความในแชท…" + ลิงก์ `/business`
- [ ] **A2 (เคย BLOCKER)** ร้าน non-paid แก้ "คำสั่งประจำร้าน" แล้วกดบันทึก → **200** + `pacesToast.success` — verify `ShopAiSetting.instruction` ใน DB อัปเดตจริง
- [ ] **A3** ร้าน paid plan เปิดหน้าเดียวกัน → สวิตช์ทั้ง 3 กดได้ปกติ, **ไม่มี badge**, **ไม่มี banner** อัปเกรด
- [ ] **A4** curl ตรง `PUT /api/shops/ai-settings` (auth cookie ร้าน non-paid) body `{instruction, includeProductContext:true, ...}` → **403** `{error, code:"CONTEXT_GATE_PAID_PLAN_REQUIRED"}`
- [ ] **A4** curl ตรง `PUT /api/shops/ai-settings` (ร้าน non-paid) body `{instruction:"..."}` เท่านั้น (ไม่มี 3 ฟิลด์บริบท) → **200**
- [ ] **A5 (BR-AIQ-14)** ร้าน non-paid ที่ DB มี `includeProductContext=true` → หลังเซฟ instruction (A2) → query DB ยืนยัน `includeProductContext` **ยังเป็น `true`** (ไม่ถูกเขียนทับเป็น false)
- [ ] STAFF ของร้าน non-paid → เห็น banner `!canEdit` ("ดูได้อย่างเดียว") ไม่ใช่ banner อัปเกรด (ตาม implement note ในสเปก)
- [ ] visual: badge ไม่ทำ layout พังที่ 375px/768px/1280px — ห่อบรรทัดสวย ไม่ทับสวิตช์ (screenshot ทั้ง 3 breakpoint)

## B. แผง AI ในหน้าแชท (`/inbox/[conversationId]`)
- [ ] **B6** ร้าน paid → กดปุ่ม AI → ได้ suggestions **ไม่มี dialog**, badge "ใช้ได้ไม่จำกัด" ข้าง header, ไม่มี hint จำนวนที่เหลือ
- [ ] **B6** หลัง B6 → query `AiSuggestDailyUsage` ของร้านนี้ → **ไม่มีแถวใหม่ถูกสร้าง/แก้**
- [ ] **B7** ร้าน non-paid (count < 10) → auto ได้ suggestions ไม่มี dialog + hint "เหลือฟรีวันนี้ N/10"
- [ ] **B7** หลัง B7 → `AiSuggestDailyUsage.count` เพิ่มขึ้น 1 จริงใน DB (ระวัง: ถ้า Gemini ไม่ config จะโดน refund กลับ — ดู pre-flight note)
- [ ] **B8** ร้าน non-paid count=10 + wallet balance ≥ ฿1 → เห็นปุ่ม "ใช้เครดิต ฿1 เพื่อขอร่างเพิ่ม" (ไม่ auto ยิง POST)
- [ ] **B8** กดปุ่ม → **Swal** ยืนยัน (`ใช้เครดิต ฿1 ขอร่างเพิ่ม?`) ปรากฏ ไม่ auto หัก
- [ ] **B8** กด "ยืนยัน" ใน Swal → ได้ suggestions + `pacesToast.success` หักเครดิต + `SellerWallet.balance` ลด ฿1 จริงใน DB
- [ ] **B8** มีแถว `WalletTransaction` ใหม่ `reason="AI_SUGGEST_EXTRA_USE"` type=DEDUCT amount=1
- [ ] **B9** ร้าน non-paid count=10 + balance=฿0 → บล็อกทันที **ไม่มี Swal** + ปุ่ม "เติมเครดิต" (→`/wallet`) และ "อัพเกรดแพ็กเกจ ใช้ AI ไม่จำกัด" (→`/business`)
- [ ] **B10 (boundary)** seed count=9 → กดขอร่างครั้งที่ 10 → สำเร็จ **ไม่หักเงิน**, count กลายเป็น 10, ไม่มี Swal
- [ ] **B11** curl `POST .../ai-suggest` พร้อม `{"confirmUseCredit":true}` **ตอนยังมีโควตาฟรี** (count<10) → ใช้ free path แทน (`usedCredit:false` ใน response) — `SellerWallet.balance` ไม่เปลี่ยน
- [ ] มี `AiSuggestUsageEvent` แถวใหม่ทุกครั้งที่ผ่าน gate สำเร็จ, `kind` ตรงกับ path (FREE/CREDIT/UNLIMITED_PLAN)

## C. Edge / Fail-closed (จาก spec Acceptance Criteria — ควรมี regression เพิ่มถ้าเป็นไปได้)
- [ ] FR-AIQ-06: จำลอง Gemini fail (ปิด `GEMINI_API_KEY` ชั่วคราว) เส้นทาง free → count คืนกลับ N-1 (503, ไม่ใช่ 502 ถ้าเป็น NotConfigured — ยังต้อง refund เหมือนกัน)
- [ ] FR-AIQ-06: เส้นทาง credit → `SellerWallet.balance` คืน ฿1
- [ ] FR-AIQ-06: เส้นทาง unlimited (paid) → ไม่มีอะไรถูกคืน (ไม่มีอะไรถูกใช้ไปตั้งแต่ต้น)
- [ ] FR-AIQ-07 (concurrency): ยิง 2 request พร้อมกันตอน count=9 → มีแค่ 1 ได้ free slot ที่ 10 (count ไม่เกิน 10, ไม่ทั้งคู่ผ่านฟรี) — ต้องใช้ script ยิงขนาน ไม่ใช่ manual click
- [ ] FR-AIQ-08: จำลอง DB error ตอน query `AiSuggestDailyUsage`/`BusinessPackageSubscription` → response เป็น error (ไม่ default unlimited)

## D. Visual quality (Impeccable / brand)
- [ ] `/settings/ai` non-paid mobile 375px: badge/banner ไม่ดันสวิตช์ล้น, tap target readable
- [ ] `/settings/ai` tablet 768px, desktop 1280px: layout ปกติ ไม่มี overflow
- [ ] แผง AI ในแชท mobile 375px: hint "เหลือฟรีวันนี้ N/10" ไม่ตัดคำแปลก ๆ, ปุ่ม credit-prompt/credit-block ไม่ทับกัน
- [ ] Swal confirm dialog readable บนมือถือ, ปุ่มไม่ล้นจอ
- [ ] ตัดสิน "หน้าตาสมเป็น Deep ไหม" ไม่ใช่แค่ไม่ error — เทียบ token สี (success=เขียว unlimited, primary=ปุ่ม credit, warning=บล็อก) กับ `.impeccable/design.json`

## ยังไม่ได้เทส (carry) — จากรอบ 2026-07-29
> **ทุกข้อในไฟล์นี้ยังไม่ได้ verify แม้แต่ข้อเดียว** — QA run วันที่ 2026-07-29 เจอ blocker
> ตั้งแต่ pre-flight แรก (ดู VERDICT ในรายงาน): dev server บน `seller.deepth.local:4000` serve
> worktree ผิด (`revise-ui-order-link` / branch `revise/ui-order-link`) ซึ่งไม่มีโค้ดฟีเจอร์นี้เลย
> (`GET /api/chat/ai-quota` → 404 แทนที่จะเป็น 401) — ต้องแก้ก่อนแล้ว **รัน checklist นี้ใหม่ทั้งหมด**
> รวม Playwright spec `e2e/ai-suggest-usage-limit.spec.ts` (เขียนไว้แล้ว รอรันจริง)
