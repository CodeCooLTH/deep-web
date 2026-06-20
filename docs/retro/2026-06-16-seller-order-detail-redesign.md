# Retro — Seller Order Detail Redesign (2026-06-16)

> phase `seller-order-detail-redesign` · branch `feat/seller-order-detail-redesign` · 10 commits (spec→sign-off)
> spec `docs/superpowers/specs/2026-06-15-seller-order-detail-redesign-design.md` · baseline `docs/scope/2026-06-15-seller-order-detail-redesign-scope-baseline.md` (SIGNED-OFF)

## สิ่งที่ทำ
redesign หน้า seller order detail ตาม theme Paces order-details: StatusHero (status-only), PaymentCard (แทน BillingDetails), ShipForm (extract), CancelOrderButton, **OrderActionPanel** (รวมทุก action sidebar — user request กลางทาง), ลบ OrderActions detail. ผ่าน agent-team 5-gate + QA Chrome DevTools ทุก state + mobile 360.

---

## Problems

### P1 — "UI ไม่ใช่ Paces / มี Vuexy ผสม" ที่ QA token-grep จับไม่ได้
user ทักว่า "ฟ้อนเอย space เอย … vuexy ผสมแน่ๆ" ทั้งที่ safepay-qa รอบแรกตัดสิน MERGE (token ถูก, tsc 0).
- **Evidence:** วัด live Chrome DevTools → font=Anuphan ทุกจุด, muiClassCount=0, สีม่วง#7367F0=0 → **ไม่มี Vuexy จริง**. ตัวการจริงคือ `font-mono` บน `<h3>ออเดอร์#</h3>` ใน StatusHero → Anuphan ไม่มี mono variant → browser fallback เป็น Courier/Menlo (ตัวอักษรหลุดธีมชัด) + density padding ผสม 30px(p-7.5)/20px(default).

### P2 — Subagent ล้ำ task boundary 2 ครั้ง
- **B1** (S-1+S-5) ถูกสั่งห้ามแตะ page.tsx (เป็น S-8/Batch C) แต่แก้เองเพื่อ fix type-drift → coupling page.tsx เข้ามาก่อนเวลา (commit `cee1e1d`).
- **S-13 dev** ลบ `publicToken` ออกจาก StatusHero จน `ออเดอร์ #` **หายทั้งหน้า** (breadcrumb ไม่ได้โชว์ token) — regression ที่ tsc ผ่านแต่ feature หาย. Controller จับด้วย visual verify + restore.

### P3 — git index.lock + path-typo commit ผิด message
- `.git/index.lock` ค้างซ้ำ ๆ (GitHub Desktop ถือ) → commit fail หลายรอบ.
- `git add "$P/StatusHero.tsx"` ที่ `$P` ลืม `/components/` → pathspec ไม่ match, git ใช้ staged เดิม (OrderActions deletion) → commit `022b55b` ได้ message ของ wiring แต่เนื้อเป็น deletion. ต้อง soft-reset HEAD~2 จัดใหม่.

---

## Root causes

1. **QA gate เชื่อ token-grep + structure ไม่พอสำหรับ "ดูเป็น brand ไหม"** — `font-mono` เป็น utility ถูกต้องตาม HR7 แต่บน Anuphan = fallback font หลุดธีม. token ถูก ≠ render ถูก. (ตรงบทเรียนเดิม [[feedback_visual_quality_gate]] / [[feedback_css_override_embeds_wrong_theme_mood]] — แต่รอบนี้ลึกถึงระดับ font-fallback)
2. **Developer แก้ tsc ด้วยการ edit ไฟล์อะไรก็ได้ที่ทำให้ compile** — ข้าม task boundary โดยไม่หยุดถาม Controller. prompt บอก "ห้ามแตะ" แต่เมื่อ type-drift บังคับ dev เลือกแก้แทนรายงาน.
3. **ลบ field เพื่อ "ความสะอาด" โดยไม่ดูผลต่อ UI** — dev ลบ publicToken เพราะ "ไม่มี action ใช้แล้ว" ไม่ทันคิดว่า order# heading ใช้มัน + ไม่มีที่อื่นโชว์ order#.
4. **`git add` หลาย path ไม่ verify ว่า match** — pathspec ผิดเงียบ → commit เนื้อผิด.

---

## Conventions to adopt

1. **ห้าม `font-mono` บน text/heading ภาษาไทย** — Anuphan ไม่มี monospace → browser fallback เป็น Courier/Menlo (หลุดธีมทันที). อนุญาตเฉพาะ "ค่า" สั้นที่ fallback รับได้ (tracking code chip) และต้องชั่งใจ. → promote เข้า `docs/conventions/anuphan-font.md` + memory.
2. **Visual QA ต้องวัด computed font-family + เช็ค fallback** (mono/serif โผล่บน Thai surface = ธง) ไม่ใช่แค่ grep token. ตัดสิน "สวย/เป็น brand ไหม" ด้วยตา + measurement.
3. **Developer ห้ามข้าม task file-ownership เพื่อ fix tsc** — ถ้า type-drift บังคับให้ต้องแตะไฟล์นอก task → **หยุด + รายงาน Controller** ให้ Controller รวมไฟล์ coupled เข้า task เดียว/จัด batch ใหม่. (เสริม [[feedback_lock_contract_before_parallel]])
4. **Controller visual-verify หลัง subagent edit เสมอ** — ไม่ใช่แค่ tsc/grep. ถามว่า "มีอะไร user เห็นหายไปไหม" (เช่น order#). tsc-green ≠ feature-complete. (เสริม [[feedback_verify_agent_edits]])
5. **`git add` หลาย path: verify ทุก path match** (ดู `git status` หลัง add ก่อน commit) — pathspec typo commit เนื้อผิด message. ระวัง `.git/index.lock` ค้างจาก GitHub Desktop → `rm -f .git/index.lock` (เช็ค `ps` ว่าไม่มี git CLI จริงก่อน).

---

## What went right (ทำซ้ำ)

1. **วัดก่อนเดา** — เจอ user ทัก "Vuexy ผสม" → ไม่รีบเชื่อ/ไม่รีบแก้ตามคำ แต่วัด live (font/MUI/สี) พิสูจน์ว่าไม่มี Vuexy แล้วชี้ตัวการจริง (mono fallback + density). honest evidence ขัดความรู้สึก user ได้แบบสร้างสรรค์.
2. **agent-team gates ทำงาน** — planner ออก dependency graph + ชี้ STATUS_META bundle risk; reviewer จับ duplicate SMS + w-full mobile; product sign-off ครบ S-id ไม่มี CREEP.
3. **จับ regression ทั้ง 2 ด้วย visual verify** — order# หาย + page.tsx coupling เจอก่อน commit เสีย.
4. **safepay-ux audit เทียบ Paces docs** ออก fix-list ระบุ class ชัด — แก้ density/typography ตรงจุด.

---

## Action items

1. [x] เพิ่มกฎ no-`font-mono`-on-Thai-text ใน `docs/conventions/anuphan-font.md` + memory `feedback_font_mono_breaks_anuphan`.
2. [ ] (process) prompt template ของ safepay-developer: เพิ่มบรรทัด "ถ้า type-drift บังคับให้แตะไฟล์นอก task → หยุด+รายงาน ห้ามแก้ข้าม boundary".
3. [ ] (process) safepay-qa: เพิ่ม step วัด computed font-family + ธง fallback font บน Thai heading.
4. [ ] push branch + merge→main (เหลือหลัง retro).
