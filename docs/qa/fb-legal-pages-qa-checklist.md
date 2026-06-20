# QA Checklist — fb-legal-pages (Privacy Policy + Data Deletion)

> Phase: `fb-legal-pages` — static legal pages สำหรับ Facebook App Review
> วันที่ทดสอบครั้งแรก: 2026-06-17
> Level: smoke + batch-E2E (end-of-phase visual QA)
> ผ่านทุกข้อ: ดู "Run History" ด้านล่าง

---

## Pre-flight Setup

- [x] Dev server ที่ `http://deepth.local:4000` ตอบสนอง HTTP 200 (user รันเอง ห้าม QA start)
- [x] Pages ที่ต้อง QA อยู่ใน route group `(marketing)` (`src/app/(marketing)/privacy/page.tsx`, `src/app/(marketing)/data-deletion/page.tsx`)
- [x] DB มี users อย่างน้อย 1 คนสำหรับทดสอบ `/u/{username}` footer link

---

## หน้า /privacy

### Smoke
- [x] S-1: navigate `http://deepth.local:4000/privacy` → HTTP 200 (ไม่ redirect ไป login)
- [x] S-2: page title = "นโยบายความเป็นส่วนตัว — Deep"
- [x] S-3: ไม่มี `x-robots-tag: noindex` ใน HTTP response header (curl -sI)
- [x] S-4: FrontLayout render ครบ — Header (logo "Deep", sign-up link) + Footer (ฉบับเต็ม)
- [x] S-5: console ไม่มี error/warn ใด ๆ (list_console_messages)

### Happy Path — Content
- [x] C-1: heading "นโยบายความเป็นส่วนตัว (Privacy Policy)" ปรากฏ (h4)
- [x] C-2: วันที่ "อัปเดตล่าสุด 17 มิถุนายน 2569" ปรากฏ
- [x] C-3: ครบ 6 หัวข้อ — 1.ข้อมูลที่เราเก็บ, 2.วัตถุประสงค์, 3.การเปิดเผย/แชร์, 4.การเก็บรักษา/ความปลอดภัย, 5.สิทธิ์ผู้ใช้, 6.การติดต่อ
- [x] C-4: email link section 6 → `href="mailto:shinobu22@outlook.com"` (ตรวจ DOM)
- [x] C-5: crosslink "การลบข้อมูลผู้ใช้" ใน section 5 → `href="http://deepth.local:4000/data-deletion"` (NextLink RSC-safe)
- [x] C-6: font computed = `Anuphan, "Anuphan Fallback"` บน h4 heading (ไม่ fallback Courier/Inter)

### Footer
- [x] F-1: footer มีลิงก์ "นโยบายความเป็นส่วนตัว" → `/privacy` (2 จุด: column links + bottom bar)

---

## หน้า /data-deletion

### Smoke
- [x] S-1: navigate `http://deepth.local:4000/data-deletion` → HTTP 200 (ไม่ redirect ไป login)
- [x] S-2: page title = "การลบข้อมูลผู้ใช้ — Deep"
- [x] S-3: ไม่มี `x-robots-tag: noindex` ใน HTTP response header
- [x] S-4: FrontLayout render ครบ — Header + Footer
- [x] S-5: console ไม่มี error/warn

### Happy Path — Content
- [x] C-1: heading "การลบข้อมูลผู้ใช้ (User Data Deletion)" ปรากฏ (h4)
- [x] C-2: วันที่ "อัปเดตล่าสุด 17 มิถุนายน 2569" ปรากฏ
- [x] C-3: ครบ 4 หัวข้อ — 1.วิธีขอลบข้อมูล, 2.ข้อมูลที่จะถูกลบ, 3.กรอบเวลา, 4.การติดต่อ
- [x] C-4: callout box เด่น (`.bg-actionHover` div) ปรากฏใน section 1
- [x] C-5: callout box มี email link `href="mailto:shinobu22@outlook.com"` + ข้อความ h6 "shinobu22@outlook.com" (visual highlight)
- [x] C-6: กรอบเวลา 30 วัน ปรากฏในข้อความ section 3
- [x] C-7: section 4 มี email link `href="mailto:shinobu22@outlook.com"` ด้วย
- [x] C-8: font computed = `Anuphan, "Anuphan Fallback"` บน h4 heading

### Footer
- [x] F-1: footer มีลิงก์ "นโยบายความเป็นส่วนตัว" → `/privacy`

---

## Footer Link — Cross-page (S-6)

- [x] FL-1: จากหน้า `/privacy` — footer มีลิงก์ "นโยบายความเป็นส่วนตัว" → `/privacy` (2 จุด)
- [x] FL-2: จากหน้า `/u/testuser` (public profile) — mini-footer ล่างสุดมีลิงก์ "นโยบายความเป็นส่วนตัว" → `/privacy`
- [x] FL-3: คลิก footer link จาก `/u/testuser` → navigate ไป `/privacy` ได้ (heading แสดง, URL เปลี่ยน)

---

## noindex Check (CQD-2 / S-3)

- [x] N-1: `/privacy` — curl -sI ไม่มี `x-robots-tag: noindex`; HTTP 200
- [x] N-2: `/data-deletion` — curl -sI ไม่มี `x-robots-tag: noindex`; HTTP 200
- [x] N-3: ทั้ง 2 หน้า metadata เว้น robots (ไม่ set `robots: { index: false }`) — ตรวจ source code

---

## Visual / UX

- [x] V-1: `/privacy` — single-column layout อ่านง่าย, ไม่มี Grid sidebar เกะกะ
- [x] V-2: `/data-deletion` — callout box มี bg-color ที่ต่างจาก background (rgba 0.06), email เด่น
- [x] V-3: ทั้ง 2 หน้า FrontLayout header/footer ไม่ขาดหาย (ตรวจ snapshot)

---

## Edge Cases / Negative

- [ ] E-1: navigate `/privacy` ขณะ login แล้ว — ต้องแสดงหน้าปกติ ไม่ redirect (ยังไม่ได้เทส — carry)
- [ ] E-2: mobile viewport (375px) — layout ไม่แตก, ข้อความอ่านได้ (ยังไม่ได้เทส — carry)
- [ ] E-3: `/data-deletion` เข้าจาก crosslink ใน `/privacy` section 5 — click navigation ทำงาน (ยังไม่ได้เทส — carry)

---

## ยังไม่ได้เทส (carry)

| # | Scenario | เหตุผลที่ข้าม | Priority |
|---|---|---|---|
| E-1 | เปิดหน้าขณะ login แล้ว | ต้องการ session | P2 |
| E-2 | Mobile 375px responsive | ต้องการ mobile viewport test | P2 |
| E-3 | Click crosslink /privacy → /data-deletion | ทดสอบ reverse direction | P2 |
| META-1 | ตรวจ FB App Review URL กับ facebook.com validation tool จริง | ต้องการ FB dev account | P1 ก่อน prod submit |

---

## Run History

| วันที่ | Branch | Level | Verdict | ผู้ทดสอบ |
|---|---|---|---|---|
| 2026-06-17 | main | smoke + batch-E2E | PASS (ทุก AC) | safepay-qa |

