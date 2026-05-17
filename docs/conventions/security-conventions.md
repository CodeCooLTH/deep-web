# Security Conventions — SafePay/Deep

> โผล่จาก Phase B retro (`docs/retro/2026-05-16-phase-b-seller-resource.md` P5/P6/P7/P8). กฎ security ที่ต้อง enforce ทุก session — reviewer/safepay-security ใช้เป็น checklist. **ห้าม defer security-boundary fix ไป phase หน้า** (precedent: CRITICAL prod auth-bypass P6).

## S-C1. PII mask ที่ RSC→client boundary ไม่ใช่ที่ display
- ห้ามส่ง raw phone/email/contact ใน **prop / key / field ใด ๆ** ที่ข้าม RSC server → client component (มันลงใน `__next_f` payload = page-source เห็น แม้ UI จะ mask ตอน render).
- row identity/grouping ที่ต้องใช้ contact → ใช้ hash server-side: `crypto.createHash('sha256').update(contact).digest('hex').slice(0,16)` (irreversible, deterministic = grouping ยังถูก).
- เฉพาะ masked string (`••••1234`, last-4) เท่านั้นที่ข้าม boundary ได้. ใช้ `maskContact` แบบเดียวกันทุกที่ (last-4 + bullets; **ห้าม** `slice(0,2)***@domain` แบบโชว์ local/domain).
- reviewer/security: enumerate ทุก field บน object ที่ข้าม RSC→client, classify safe/unsafe.

## S-C2. Test-account bypass ต้อง NODE_ENV-gated (prod-dead) เสมอ
- ห้าม ship hardcoded credential ที่ authenticate ได้ใน production (แม้จะอยู่ใน seed/test util).
- gate ที่ **source-of-truth constant** ให้ตายทุก call path พร้อมกัน:
  ```ts
  const TEST_ACCOUNTS: Record<string,string> = process.env.NODE_ENV === 'production' ? {} : { ... };
  ```
  (empty object → ทั้ง verify lookup และ membership predicate ตายใน prod อัตโนมัติ — ไม่ต้อง per-call guard).
- การ "ขยาย bypass โดย mirror model เดิม" = ขยาย vulnerability. เจอ bypass ไม่ gate → fix ทันที ในงานเดียวกัน ไม่ใช่ track ไป phase หน้า.

## S-C3. Input ข้าม auth boundary ต้อง server-side validate
- `credentials.*` ใน NextAuth `authorize()` = **untrusted** (client POST ตรง /api/auth/callback bypass Yup/frontend ได้).
- length/charset/empty guard server-side ก่อน DB write เสมอ — ให้ตรงสัญญา schema (เช่น `if (x.length > 100) return null;` ตรง CreateShopSchema maxLength). frontend validation ไม่นับ.

## S-C4. Multi-write ที่ต้อง consistent → `prisma.$transaction`
- เช่น `shop.create` + `user.update({isShop})` แยก query = partial-fail → state กู้ไม่ได้ (unique constraint บล็อก recreate, flag ค้างผิด). wrap `prisma.$transaction(async (tx) => { tx.x.create(); tx.y.update(); })`. P2002-catch ยังทำงานจาก inside transaction.

## S-C5. ห้าม defer security-relevant fix ที่ agent flag เอง
- ถ้า developer/reviewer flag "ควร gate prod / ควร validate / ควร transaction" สำหรับ auth/PII/redirect → safepay-security ตัดสิน; ถ้า required → แก้ก่อน commit (mandate-before-commit) ไม่ใช่ backlog. (Phase B: OTP bypass P6 + shopName P7 ทั้งคู่ mandate ก่อน commit ถูกต้อง.)

## S-C6. proxy ไม่ใช่ auth/redirect safety-net
- ดู `docs/system/ui-guideline/seller/page-sourcing.md` (explicit `/seller/*` nav). security angle: อย่าพึ่ง edge rewrite เป็น auth guard — guard ที่ server component / route handler เสมอ; redirect target เป็น static literal (ไม่ต่อ user input → กัน open-redirect).

## S-C7. DAL ownership — enforce ที่ query layer ไม่ใช่หลัง fetch (Next RSC)
- **กฎ:** resource-by-identifier ที่ผูกกับเจ้าของ ต้อง scope ownership ใน WHERE clause:
  `prisma.x.findFirst({ where: { <id>, <ownerKey: serverDerivedId> } })` → คืน `null` ให้ non-owner → `notFound()`.
- **ห้าม** pattern: `const x = await findUnique({where:{id}}); if (x.ownerKey !== me) redirect()/notFound()`.
  Next.js 16 App Router **serialize fetched object เข้า RSC flight payload (`self.__next_f.push`) รอบ ๆ redirect throw** → response เป็น HTTP **200** + soft meta-refresh, PII (เช่น `buyerContact`) รั่วใน body แม้ browser จะ redirect ทีหลัง. ownership check **หลัง** fetch สายเกินไปเสมอ.
- `<ownerKey>` ต้องเป็นค่า **server-derived จาก session** (เช่น `shop.id` จาก `getShopByUserId(session.user.id)`) — ห้าม trust จาก URL/param.
- ฟังก์ชัน fetch ที่ใช้กับ public flow (ไม่มีเจ้าของ เช่น buyer `/o/[token]`) แยกออกจาก ownership-scoped variant อย่าใช้ตัวเดียวข้าม boundary. (เช่น `getOrderByToken` public vs `getOrderForShop(token, shopId)` seller.)
- Evidence/origin: OMS retro 2026-05-16 P3 — curl repro leak `buyerContact` ใน flight; fix commit `8d9485b` (DAL); แตกต่างจาก S-C1 (S-C1 = mask ตอน display boundary; S-C7 = ไม่ให้ fetch เข้า tree ตั้งแต่แรก).

## S-C8. Financial deduct: conditional-updateMany ห้าม read-then-decrement
- การหักเครดิต/balance ที่ต้องไม่ติดลบ: ห้าม pattern `getBalance()` แล้ว `if (b >= amount) update()` (2 query แยก = race double-deduct ถ้า concurrent).
- **ใช้ conditional WHERE atomic เดียว:**
  ```ts
  await client.sellerWallet.updateMany({
    where: { shopId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  })
  // count === 0 → throw INSUFFICIENT_CREDIT (ไม่มีทาง commit ติดลบ)
  ```
- DB `CHECK(balance >= 0)` เป็น backstop ชั้นสุดท้าย — primary guard ยังต้องเป็น WHERE เสมอ.
- ใช้ร่วมกับ S-C4 (`prisma.$transaction`) เมื่อต้อง deduct + side-effect อื่น atomic (เช่น deduct + issue SmsCode + set buyerContact ใน tx เดียว).
- Origin: Phase 4 SMS Wallet — `wallet.service.ts::deductCredit`; RC-3 design requirement.

## S-C9. Server-decided unlock: HMAC signed cookie ห้ามใช้ query param client-trusted
- ของที่ server ตัดสิน (เช่น "buyer นี้ผ่าน SMS code แล้ว ข้าม phone-unlock ได้") ต้องเป็น **server-signed httpOnly cookie** ไม่ใช่ `?unlocked=1` query param ที่ browser/user ต่อเองได้.
- Pattern: `signSmsUnlock(orderId)` → HMAC-SHA256 ด้วย `NEXTAUTH_SECRET` → `base64url(payload).base64url(sig)`. verify ด้วย `timingSafeEqual` (กัน timing side-channel).
- fail-closed: `SECRET` ไม่มี → throw ตอน module load; `verifySmsUnlock` error ทุกอย่าง → return false.
- RSC ใน Next.js 16 อ่าน cookie ได้แต่ set ไม่ได้ → การ set cookie ต้องทำใน route handler (ไม่ใช่ RSC).
- Origin: Phase 4 SMS Wallet — `lib/sms-unlock-cookie.ts`; แก้ไขจาก `?unlocked=1` pattern เดิมที่ security flag.
