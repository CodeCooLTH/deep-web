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
