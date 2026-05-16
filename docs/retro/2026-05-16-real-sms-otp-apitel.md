# Retro — Real SMS OTP via apitel.co (2026-05-16)

Phase เปลี่ยน OTP จาก mock (`console.log`) เป็นส่ง SMS จริงผ่าน apitel.co SMS gateway

Commits: `402b397` (feat + security fix), `33680c1` (test 13 เคส)

---

## Problems

### P1 — การเปลี่ยน mock→real เปลี่ยน security posture ของโค้ดเดิมที่ไม่ได้แตะ
`consumeOtpRequestQuota` (src/lib/otp.ts:19 เดิม) มี `if (TEST_ACCOUNTS[contact]) return true` — bypass rate-limit. ตอนระบบเป็น mock (`console.log(otp)`) การ bypass นี้ **ไม่มีต้นทุน** จึงปลอดภัย. แต่พอเปลี่ยนเป็นส่ง SMS จริง บรรทัดเดิมที่ "ไม่ได้แก้" กลายเป็นช่องโหว่ cost-abuse ทันที (เบอร์ `0920791649` hardcode ใน source → ใครก็ยิง SMS ไม่จำกัด).
- Evidence: safepay-security รอบแรก verdict PARTIAL, HIGH finding @ `src/lib/otp.ts:19` + `src/app/api/otp/send/route.ts:34`
- จับได้เพราะ security agent มองผลข้างเคียงของ context change ไม่ใช่แค่ diff — ถ้า review แค่ diff lines จะ miss (บรรทัดนั้นไม่อยู่ใน diff)

### P2 — stale comment หลัง logic เปลี่ยน
หลังลบ bypass, comment `route.ts:24` "Test accounts bypass ใน consumeOtpRequestQuota อัตโนมัติ" กลายเป็นเท็จ. security re-check จับได้ (ไม่ใช่ช่องโหว่แต่ misleading). Controller แก้เอง 1 บรรทัด.

### P3 — happy-path ทดสอบอัตโนมัติเต็มรูปไม่ได้
apitel ไม่มี sandbox + ส่ง SMS จริงทุก env + key ยังไม่ถูกใส่ (user จะใส่เอง) → AC-1/AC-2 (รับ SMS จริง + verify) เป็น manual user-acceptance หลีกเลี่ยงไม่ได้.

---

## Root causes

- **P1:** review/security mental model มักโฟกัส "บรรทัดที่เปลี่ยน". แต่ feature ที่เปลี่ยน *พฤติกรรม runtime ของระบบ* (mock→real, sync→async, internal→external, free→paid) ทำให้โค้ดเดิมที่ assumption เปลี่ยนกลายเป็นบั๊ก/ช่องโหว่ — ต้อง review "code เดิมที่ assumption ถูกทำให้ผิด" ด้วย
- **P2:** comment ผูกกับ logic แต่ไม่มี gate บังคับให้ developer ที่ลบ logic ไปไล่ comment ที่อ้างถึง logic นั้น
- **P3:** dependency ภายนอกที่ไม่มี sandbox + มีต้นทุนต่อ call เป็นข้อจำกัดของ provider ไม่ใช่ของ workflow — ยอมรับและออกแบบ QA ให้ครอบ path ที่ทดสอบได้แทน

---

## Conventions to adopt

1. **Context-shift review rule:** เมื่อ task เปลี่ยน runtime behavior ของระบบ (mock→real / free→paid / internal→external call / sync→async) — reviewer + security ต้อง grep หา *โค้ดเดิมที่ไม่อยู่ใน diff* ซึ่ง assumption ถูกทำให้ผิด (เช่น bypass/short-circuit/skip/`if (TEST_`/`NODE_ENV` guard ที่เคยปลอดภัยเพราะ no-op) แล้วประเมินใหม่ภายใต้ behavior ใหม่. dispatch security เป็น **mandatory** สำหรับ task ประเภท free→paid/external-call ไม่ใช่แค่ auth/env.
2. **Comment-follows-logic:** developer ที่ลบ/ย้าย logic ต้อง grep ชื่อ function/flag ที่ลบ ใน comment ทั้ง repo แล้วอัปเดต comment ที่อ้างถึง — ก่อนรายงานเสร็จ.
3. **Lock external API schema ก่อน dispatch developer:** safepay-developer ไม่มี WebFetch — Controller ต้อง WebFetch/ยืนยัน request+response schema (field names verbatim) แล้วฝังใน developer prompt. ห้ามให้ developer เดา field name ของ third-party API.
4. **External-paid-dependency QA:** provider ที่ไม่มี sandbox + คิดเงินต่อ call → QA smoke ครอบ guard/error/degradation path (invalid input, format guard, rate-limit, provider-unconfigured→graceful) ด้วย curl ได้; happy-path เต็มประกาศเป็น manual user-acceptance พร้อมระบุ pre-req (key + เบอร์จริง) ใน commit body + final report. ไม่ block phase ด้วยเหตุรอ key.

---

## What went right (ทำซ้ำ)

- **security parallel กับ reviewer แล้วเจอ HIGH ที่ reviewer มองข้าม** — แยก 2 lens (correctness vs threat) คุ้มค่า, ควรคงไว้สำหรับ task แตะ env/external/auth/cost
- **WebFetch lock apitel schema ก่อน dispatch** — developer ได้ field `to/from/text/ttl/apiKey/apiSecret` ถูกตั้งแต่ first pass ไม่มี rework เพราะ schema เดา
- **AskUserQuestion ก่อน rework HIGH** — HIGH fix มีผลต่อ QA workflow + เบอร์ test ปลอม; ถาม user (rate-limit policy + เบอร์ test จริงไหม) ก่อนสั่งแก้ กัน rework ซ้ำ
- **curl smoke พิสูจน์ HIGH fix โดยตรง** — ยิง TEST_ACCOUNT 4 ครั้ง เห็น 3×503→429 เป็น evidence ว่า bypass หายจริง ไม่ใช่แค่ "อ่านโค้ดแล้วเชื่อ"
- **stage เฉพาะไฟล์ในขอบเขต** — `docs/PRD.md`/`seed.ts`/`badge.service.ts` ที่ค้างมาก่อน session ไม่ถูกลากเข้า commit

---

## Action items

1. โปรโมต Convention #1 (context-shift review) เข้า `docs/conventions/agent-team-workflow.md` — เพิ่มใน checklist ของ reviewer/security gate
2. โปรโมต Convention #3 (lock external API schema) เป็น personal-Claude memory (Controller habit)
3. **Pending user:** ใส่ `APITEL_API_KEY` + `APITEL_API_SECRET` ใน `.env.local` (sender = `ATSMS` ต้อง approve กับ apitel ก่อน) → ทดสอบ happy-path: ขอ OTP เบอร์ `0920791649` → รับ SMS จริง → verify เข้าสู่ระบบ (AC-1, AC-2, AC-13)
4. (future) ถ้า apitel มี cost monitoring ทีหลัง — พิจารณา alert credit ใกล้หมด (PRD §11 Known Gap, out of scope phase นี้)
