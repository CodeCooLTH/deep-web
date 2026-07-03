# Retro — Buyer Auction Redesign + Seller Mobile Polish + No-Emoji (2026-07-02)

Phase นี้ครอบหลายสาย (session เดียว, ทำงานบน `main` ผ่าน branch `shinobu22/main-2` → FF main → deploy prod):
1. **Buyer Auction detail redesign** — Concept 1 "Live Commerce" (`/a/[id]`): full-bleed hero + carousel + seller header + action rail + live comment + detail sheet + bid-history modal (lazy-load) + one-tap bid + ซื้อทันที
2. **Icon wrapper bug fix** — `solar:*` ไอคอนหายทั้ง seller
3. **No-emoji rule** (ตั้งใหม่ตาม user directive) + เก็บ emoji ทั่ว UI
4. **Buyer toast** → Vuexy `AppReactToastify` (เลิก `theme="colored"`)
5. **Seller mobile polish** — create-order (variant A) + products + orders + ปุ่ม "ส่ง SMS" primary CTA

ทุกอย่าง merge → main → deploy prod (`c1c2980`) + smoke-test + เทส interaction บน prod จริงผ่านหมด.

---

## Problems + evidence

1. **Icon wrapper double-prefix — ไอคอน `solar:*` หายทั้งแอป (กล่องว่าง)**
   - `src/components/wrappers/Icon.tsx` เดิม `icon={\`tabler:${icon}\`}` unconditional → `solar:pen-2-linear` กลายเป็น `tabler:solar:...` (invalid) → ปุ่ม action สินค้า/search/dashboard/notifications ว่าง 23 จุด
   - Root cause: wrapper ออกแบบสมัยมีแต่ tabler; พอมีคนใช้ `solar:*`/namespaced ไม่มีใครเช็ค wrapper. self-report "ทำแล้ว" ไม่ได้จับเพราะ tsc ผ่าน (ชื่อ icon เป็น string) — เป็น runtime/visual bug เท่านั้น
   - Fix: prepend `tabler:` เฉพาะเมื่อไม่มี `:` (commit 01079b5)

2. **Emoji หลุดเข้า UI จำนวนมากผ่าน theme copy**
   - buyer auth: 👋 sign-in / 🚀 sign-up / 💬 verify-otp (Vuexy welcome copy)
   - seller: 🔥 (bid velocity), 📦💻🛠️🔁 (product type badge), 🎉 (register success), 🏆 (winner Swal), 📷 (image dropzone), ⚙️ (capability)
   - Root cause: (ก) ธีม copy พา emoji มาด้วย + ไม่มีกฎห้าม (ข) emoji ที่ "ดูเหมือน icon" ถูกใช้แทน icon จริง → render ต่าง OS + คุมสี/ขนาดไม่ได้ หลุด design system

3. **Buyer toast ไม่เข้าธีม (เขียว/แดงสดทั้งใบ)**
   - `src/components/ToastMount.tsx` ใช้ `<ToastContainer theme="colored">` ดิบ ทั้งที่ธีมมี `src/libs/styles/AppReactToastify.tsx` (Vuexy styled: พื้น paper + ไอคอนสี token) อยู่แล้ว
   - Root cause: mount toast ด้วย default ของ library แทนที่จะใช้ integration component ของธีม

4. **Redesign branch แตกจาก base เก่า → ชนงานคู่ขนานบน main 3 รอบ**
   - main ขยับระหว่างทำ: `feat 00007` (auction bidding UX/validation), badge seed, badge-earned notification — บางอันแตะไฟล์ auction ชุดเดียวกัน (`AuctionHero/BidPanel/BidHistory/DetailClient`, `schema.prisma`)
   - auction redesign branch มาจากก่อน 00007 → merge ตรง ๆ เกือบ regress 6 ฟีเจอร์ของ 00007 (youAreHighestBidder disable / carousel / WinnerDialog / price flash / rate-limit / bid validation)
   - Root cause: redesign ใช้เวลานาน (iterative mockup) + ทีมอื่น push main ขนาน + shared repo → base stale โดยไม่รู้ตัว จนตอน FF main ถึงเจอ "not FF"

5. **HTML mockup: iconify-icon web component ไม่ render (ผู้ใช้เห็นกล่องว่าง)**
   - mockup ใช้ `<iconify-icon>` (โหลดจาก api.iconify.design) → ไอคอน rail หาย, ต้องสลับเป็น inline SVG
   - Root cause: web component โหลด async จาก network — ไม่ทัน/ไม่เสถียรตอนเปิดไฟล์ mockup

---

## Root causes (สรุป "ทำไม")
- **Wrapper/integration assumption ไม่ถูก re-verify เมื่อ input เปลี่ยน** (Icon wrapper รับ namespaced, toast มี integration component ของธีมอยู่แล้ว) → ควร grep imports/usage ก่อนเชื่อว่า wrapper/ค่า default ถูก
- **ไม่มี guard สำหรับ emoji + theme copy พา emoji มา** → ต้องมีกฎ + grep gate
- **Long-running redesign บน shared repo ไม่ sync main** → ต้องเช็ค in-flight parallel ก่อน + sync บ่อย

---

## What went right (ทำซ้ำ)
1. **Mockup-first + ให้ user เลือกก่อน build** — auction ผ่าน mockup หลายรอบ (v1 → concepts-10 → concept1 compact/flow) รับ feedback เร็ว/ถูกจุด ก่อนแตะโค้ดจริง (ตรง [[feedback_spec_html_mockup]]). ประหยัดการ rework โค้ดมหาศาล
2. **safepay-ux gate ก่อน frontend ทุกชิ้น** (HR8) — auction + seller polish มี Design Spec map → Vuexy/Paces token ก่อน implement
3. **Reconcile อย่างระวัง** — trial-merge (`--no-commit` แล้ว abort) ประเมิน conflict ก่อน, เช็ค disjoint files, graft 6 ฟีเจอร์ 00007 เข้า component ใหม่ทีละจุด, tsc 0 → ไม่ regress
4. **Verification gates ต่อ commit** — tsc + HR7 grep (arbitrary value) + no-emoji grep + live QA (dev 390/360) + prod smoke-test ทุก deploy
5. **Restore test data หลัง prod QA** — ตั้ง auction live เทสบน prod แล้ว restore กลับ ended ทุกครั้ง (ไม่ทิ้ง state ค้างบน prod จริง)

---

## Conventions to adopt (actionable)
1. **ห้าม emoji ใน UI ทุกจุด — ใช้ icon** (promote เป็น Hard Rule 12; SSOT `docs/conventions/no-emoji-use-icons.md`). Reviewer grep gate: `grep -rnP '[\x{1F000}-\x{1FAFF}]' src/app` บนไฟล์ UI ที่แตะ = 0 (ยกเว้น comment/data). icon ที่ mockup/spec ไม่ระบุ → ถาม user
2. **ก่อนแก้ wrapper-consumed value / library default** ให้ grep การใช้งานจริงก่อน (wrapper รับ namespace ไหม? ธีมมี integration component อยู่แล้วไหม?) — อย่าเชื่อ default. เพิ่มใน [[feedback_verify_import_safety]] แนวคิดเดียวกัน
3. **ก่อนเริ่ม redesign ใหญ่บนไฟล์ที่ทีมอื่นอาจแตะ**: `git fetch` + `git log --oneline origin/main ^HEAD -- <target files>` เช็ค in-flight parallel; ถ้า redesign ยาว ให้ merge main เข้า branch เป็นระยะ. ก่อน FF main เสมอเช็ค `git merge-base --is-ancestor origin/main HEAD`
4. **HTML mockup ใช้ inline SVG สำหรับ icon** (ไม่ใช่ `<iconify-icon>` web component) — กัน network/timing ทำให้ไอคอนหายตอน preview

---

## Action items
1. [done] Icon wrapper fix + no-emoji rule (docs/CLAUDE.md/memory) + prod QA/deploy nuances memory ([[project_prod_qa_and_deploy_nuances]])
2. [this retro] promote no-emoji → CLAUDE.md HARD RULES table (Rule 12) + reviewer grep gate ใน convention doc
3. [defer — team] Badge system emoji (`🏅` fallback + `badge.icon` data-driven) + typographic dingbats (★☆✓✗♡) — ตัดสินว่าจะแปลงเป็น icon set หรือคง (user เคาะ "ไม่เอา" รอบนี้)
4. [defer] Redis rate-limit hardening (จาก 00006/CSRF carry) — ยังไม่แตะ
5. [defer] prod visual QA ของหน้า auth-gated — ต้องมี path token ด้วย prod secret หรือ real creds (ตอนนี้ verify บน dev)
