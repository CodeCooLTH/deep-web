# Retro — Phase `orders-new-desktop-parity` (2026-07-08)

> desktop parity ของหน้า `/orders/new` (seller, Paces): เติม 4 UX affordance ให้ desktop viewport (`≥ lg`) เท่ากับ mobile `QuickForm`
> S-1 paste-parse · S-2 address autocomplete · S-3 SKU search · S-4 remember default channel/payment
> ผล: SIGNED-OFF · merged FF → main · deploy prod · commit `76792422`/`40750164`/`2f7ae787` (+ baseline `7127c527`, sign-off docs `846fde5f`)

---

## Problems

### P1 — Controller mis-plan: 2 developer แก้ `CartPanel.tsx` พร้อมกันใน working tree เดียว
- **อะไรพัง:** Plan ระบุ Batch 1 = S-1/S-2/S-3 parallel "คนละไฟล์ ไม่ชนกัน" โดยเข้าใจว่า S-1 แตะแค่ `CustomerSelectBlock.tsx`. แต่จริง ๆ S-1 (paste-parse) ต้อง **plumb `setValue` prop ผ่าน `CartPanel.tsx` → `OrderCreateForm.tsx`** เพื่อส่งเข้า `CustomerSelectBlock` (embedded) — ซึ่งเป็นไฟล์เดียวกับที่ S-2 (address autocomplete) แก้ accordion "ที่อยู่จัดส่ง"
- **Evidence:** S-1 dev report: "พบว่ามีงาน S-2 รันคู่ขนานอยู่ ... แก้ `CartPanel.tsx` ด้วย"; S-2 dev report: "working tree already had uncommitted S-1 changes when I started ... both S-1 and S-2 diffs are currently co-mingled". โชคดีที่ทั้งคู่ใช้ `Edit` แบบ targeted (คนละ hunk) + tsc ยังเขียว ไม่มี clobber จริง — แต่เป็น **near-miss** ไม่ใช่การวางแผนที่ถูก
- **ผลกระทบ:** เสี่ยง lost-edit ถ้า dev สองตัว `Write` ทับไฟล์เต็ม; และทำให้ commit granularity พัง (ดู P2)

### P2 — commit รวม S-1+S-2 (แยก 1-task-1-commit ไม่ได้)
- **อะไรพัง:** Hard Rule "one task = one commit" + reviewer เตือน "ห้าม commit S-1/S-2 รวมก้อนเดียว" แต่ปิดไม่ได้เพราะ (ก) ทั้งคู่แชร์ `CartPanel.tsx`, (ข) S-2 พึ่งพา `setValue` prop ที่ S-1 เพิ่ม (คนละ commit จะ compile ไม่ผ่านถ้าแยก), (ค) **environment ไม่รองรับ `git add -p` interactive** → แยก hunk ในไฟล์เดียวข้าม 2 commit ทำไม่ได้
- **Evidence:** commit `40750164` = S-1+S-2 รวม; commit body อธิบายเหตุผล + code แยกด้วย comment tag `S-1`/`S-2`
- **ผลกระทบ:** traceability ยังอยู่ (comment tag + cite ทั้ง 2 S-id) แต่ผิด rule ตัวอักษร — เป็น trade-off ที่ยอมรับได้ **ถ้าวางแผนไว้แต่แรก** ไม่ใช่ค้นพบตอน dev เสร็จ

### P3 — Batch E2E QA blocked (infra ไม่พร้อม)
- **อะไรพัง:** safepay-qa รันไม่ได้เลยสักเคส — dev server ไม่ได้รัน (ไม่มี process next/turbopack, port 4000 ไม่มี listener) + `/etc/hosts` ไม่มี entry `*.deepth.local`
- **Evidence:** qa report VERDICT REWORK (blocked — infra); `curl seller.deepth.local:4000` → could not resolve host
- **ผลกระทบ:** visual/functional E2E ไม่ได้รัน → user ตัดสินใจ merge main + เทสบน prod จริง → visual E2E = carried debt

---

## Root causes

- **P1:** ตอน Controller map task → target file ยึด "primary target file" จาก baseline (S-1 = `CustomerSelectBlock`) โดย **ไม่ trace prop/state plumbing ที่ต้องร้อยผ่าน parent component**. ใน React form ที่ owner ของ `setValue`/`control` อยู่สูง (`OrderCreateForm`) ฟีเจอร์ที่ต้อง `setValue` มักต้องแตะ parent (`CartPanel`) เพื่อร้อย prop — parent จึงเป็น **shared dependency ที่ซ่อนอยู่** ไม่ใช่แค่ leaf component ที่ระบุใน baseline
- **P2:** เป็นผลลูกโซ่ของ P1 — ถ้ารู้ตั้งแต่ plan ว่า S-1/S-2 แชร์ `CartPanel` จะเลือกได้ 2 ทาง: (ก) sequential (S-1 → commit → S-2) ให้แยก commit ได้สะอาด หรือ (ข) จงใจ bundle เป็น 1 task ตั้งแต่ต้น. การค้นพบตอน dev เสร็จทำให้เหลือแต่ทางเลือกแย่สุด (รวม commit แบบไม่ได้ตั้งใจ)
- **P3:** ไม่มี pre-flight check ว่า dev server + hosts พร้อมก่อน dispatch safepay-qa — QA เป็น gate สุดท้ายที่พึ่ง infra ที่ Claude ไม่มีสิทธิ์จัดการเอง (ห้าม start server, ห้ามแก้ hosts sudo)

---

## Conventions to adopt

### C1 — วางแผน parallel developer: trace "shared parent" ไม่ใช่แค่ leaf target file
เมื่อ Controller map task → target file เพื่อตัดสิน parallelize:
- **ถ้า task ต้อง `setValue`/`control`/context ที่ owner อยู่ใน parent component** → parent นั้นเป็น shared dependency. task อื่นที่แตะ parent เดียวกัน = **ชนกัน ห้าม parallel**
- pre-flight: สำหรับแต่ละ task ถามว่า "ฟีเจอร์นี้ต้องร้อย prop/state ผ่านไฟล์ไหนบ้างนอกจาก leaf target?" — ไฟล์ที่ต้องร้อยผ่านทั้งหมดนับเป็น target ของ task นั้น
- ไฟล์ที่ ≥2 task แตะ → sequential (task A → review → commit → task B) หรือจงใจรวมเป็น 1 task ตั้งแต่ plan (ประกาศใน baseline ว่า commit เดียวคุม ≥1 S-id)
- **ห้าม dispatch developer หลายตัวที่ working tree เดียวกันแตะไฟล์เดียวกัน** (ไม่มี worktree isolation) — clobber risk. ถ้าเลี่ยงไม่ได้ ใช้ `isolation: worktree` หรือ sequential

### C2 — pre-flight infra check ก่อน dispatch safepay-qa
ก่อน dispatch QA ที่พึ่ง Chrome DevTools MCP: Controller เช็ค `ss -tlnp | grep 4000` + `getent hosts seller.deepth.local` ก่อน. ถ้าไม่พร้อม → แจ้ง user เปิด dev server + hosts **ก่อน** dispatch (ไม่เสีย round QA ที่ block ทันที). ถ้า user ไม่พร้อม/เลือก merge → บันทึก visual E2E เป็น carried debt อย่างชัดเจนใน sign-off + retro (ไม่ปล่อยลอย)

---

## What went right (anchor ที่ควรทำซ้ำ)

- **safepay-product gap analysis ก่อนลงมือ** — จับได้ว่า "ไม่ครบเหมือน mobile" **ไม่ใช่บั๊ก** แต่เป็น scope decision เดิม (spec 2026-07-06 ประกาศ non-goal desktop) → เปลี่ยนจาก "ไล่แก้บั๊ก" เป็น "เปิด scope ใหม่ที่ตัดสินใจร่วม user" — กัน scope creep เงียบ
- **reuse logic layer เท่านั้น (baseline บังคับ + reviewer grep gate OOS-5)** — ทั้ง 4 ฟีเจอร์ reuse `parseOrderMessage`/thai-address dataset/filter predicate/localStorage key จากมือถือ **โดยไม่ import mobile sheet component** → desktop ได้ container ที่เหมาะจอกว้าง (popover/combobox) ไม่ใช่ full-screen sheet ยัดมา
- **UX gate จับ hs-dropdown risk ล่วงหน้า** — Design Spec อ้าง `paces-component-reference §3` ว่า Preline `hs-dropdown` พังใน RHF re-render context → กำหนดใช้ custom React popover ตั้งแต่ต้น กันบั๊กที่เคยเจอ (บทเรียน 2026-06-15) ซ้ำ
- **baseline Risks เขียน "key ต้องตรงเป๊ะ" ล่วงหน้า** → S-4 dev import `DEFAULT_CHANNEL_KEY` แทน hardcode → sync ข้าม viewport ได้จริง (reviewer verify grep 0 hardcode)

---

## Action items

1. **[convention]** เพิ่ม C1 (trace shared-parent ก่อน parallelize) เข้า `docs/conventions/agent-team-workflow.md` §Parallelism + memory feedback
2. **[convention]** เพิ่ม C2 (pre-flight infra check ก่อน QA) เข้า `docs/conventions/agent-team-workflow.md` §QA
3. **[debt — visual E2E]** เทส 4 จุดสัมผัสบน prod `seller.deepthailand.app` desktop `/orders/new`: paste-parse, address picker, SKU search, star default — เจ้าภาพ: user/Controller หลัง deploy เสร็จ
4. **[debt — ESLint]** เปิด ticket แยกล้าง `react-hooks/refs` error เดิมที่ `CartPanel.tsx:313-316` (`internalNote` textarea / `noteField.ref`) + `OrderCreateForm.tsx:152` unused `_shopId` — pre-existing ไม่เกิดจาก phase นี้ แต่ไม่ควรปล่อย
5. **[perf — known-gap ยอมรับแล้ว]** `DESKTOP_ADDR_CACHE` แยกจาก mobile `ADDR_CACHE` — ถ้าอนาคตแตะ `AddressSearchSheet.tsx` ได้ ค่อย extract `src/lib/thai-address-data.ts` shared loader (ไม่เร่ง)
