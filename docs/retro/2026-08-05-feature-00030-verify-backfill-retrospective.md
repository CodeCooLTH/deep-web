# Retro — รอบ verify + backfill feature 00030 (2026-08-05)

**ขอบเขตรอบนี้:** ไม่ใช่รอบ implement — เป็นรอบ "กลับมาดูงานที่ขึ้น prod ไปแล้ว" (`9d900146`/`58d35418`/`dfe24e64` ขึ้น 2026-08-04) แล้วพบว่าโค้ดเสร็จแต่ gate/เอกสารไม่เสร็จ: reviewer sweep → rework `ca961af1` → docs backfill `e2aeedad` → doc-sync `1a2193dd`

---

## Problems

### P1 — memory บอกว่า 00030 "รอ implement" ทั้งที่โค้ดขึ้น prod ไปแล้วทั้งฟีเจอร์

Evidence: `project_service_appointment_00024_resume.md` ยังบันทึกว่า P0 contrast ค้างบน prod (ปิดแล้วที่ `1630a8bf` ตั้งแต่ 08-01) · PRD 00030 เขียน "รอ implement" ทั้งที่ 3 ก้อน merge origin/main แล้ว · session นี้เกือบวางแผน implement ซ้ำ — รอดเพราะ `safepay-product` เปิดโค้ดจริงอ่านก่อนเชื่อ brief ของ Controller

### P2 — HR8 + HR11 ถูกข้ามเงียบ ๆ ได้ทั้งที่เป็น Hard Rule

Evidence: ก้อน wording (`58d35418`) + field-hide (`dfe24e64`) ไม่มี Design Spec ไม่ผ่าน ux gate ไม่รัน Impeccable · เอกสารขาด 5/7 ไฟล์ · `dfe24e64` ไม่มี `Base:` line (HR3) — ทั้งหมดตรวจไม่พบจนกว่าจะมีคนตั้งใจ audit ย้อนหลัง

### P3 — แทน noun ใน template ประโยค = ประโยคถูกไวยากรณ์แต่ผิดโลกจริง (พลาดซ้ำใน commit แก้เอง)

Evidence: รอบ rework แรกของ session นี้เองแทน `${vocab.noun}` เข้า `blockedCopy` ตรง ๆ → ได้ "สร้างบิลเข้าพักใบใหม่" (ละเมิดคำล็อก "เปิดบิลเข้าพัก" ที่โค้ด 20 บรรทัดก่อนหน้าเขียนคอมเมนต์ห้ามไว้เอง), "การเข้ารับบริการนี้จัดส่งไปแล้ว" (ร้านไม่มีจัดส่ง), "ผู้ซื้อยืนยันรับสินค้า"/"ต้องการขาย" กับร้านบริการ — จับได้โดย `/impeccable critique` (Assessment A) ไม่ใช่ reviewer/tsc/detector (detector = 0 findings)

### P4 — checklist per-feature มองไม่เห็น surface ข้าม feature

Evidence: BRD §2.2 ผ่านครบ 15/15 แต่ `ORDER_EVENT_META` (`src/lib/order-event.ts` — ของ feature 00031) hardcode "สร้าง/แก้ไข/ยกเลิกคำสั่งซื้อ" render เป็น `<h5>` ทุกแถวใน `ShippingActivity` ซึ่งอยู่ในจอเดียวกับหัวการ์ดที่ผันคำถูกแล้ว — คำผิดกับคำถูกอยู่ห่างกัน 20px บนจอเดียว

## Root causes

- **P1:** session 08-04 จบงานโดยไม่อัปเดต memory/retro/PRD status → "ความจริง" กระจายอยู่ใน git เท่านั้น ส่วน memory กลายเป็นบันทึกอดีตที่อ่านเหมือนปัจจุบัน
- **P2:** งาน 3 ก้อนถูก treat เป็น "แก้เล็กระหว่างทาง" ใน session อื่น ไม่ได้เข้า workflow feature — gate ทุกตัวผูกกับ "การประกาศว่าเป็น feature" ถ้าไม่ประกาศ ก็ไม่มีใคร trigger
- **P3:** ประโยค UI มี "กริยา/ลักษณนาม/บทบาทเชิงโดเมน" ฝังอยู่ (จัดส่ง, ใบ, ผู้ซื้อ, ขาย) — การผันคำระดับ noun ไม่ crash ไม่แดง ไม่มี detector จับ เพราะความผิดอยู่ที่ "โลกจริงของธุรกิจ" ไม่ใช่ syntax
- **P4:** grep gate เดินตามรายการไฟล์ที่ BRD ระบุ ไม่ได้เดินตาม "สิ่งที่ render บนจอเดียวกัน" — SSOT ที่ประกาศใน lib หนึ่งกับ label ที่ประกาศใน lib อื่นมาบรรจบกันที่ component เดียว

## Conventions to adopt

1. **Resume จาก git ไม่ใช่จาก memory:** ก่อนวางแผนงาน "กลับมาทำต่อ" ต้องรัน `git log --oneline -- <ไฟล์เป้าหมาย>` + `git branch -r --contains <commit>` ยืนยันว่าโค้ดที่ memory บอกว่า "ค้าง" ยังค้างจริง — memory เป็น point-in-time เสมอ (ขยาย `feedback_verify_dont_assume` เป็นเคส resume)
2. **ผันคำตาม vertical ห้ามแทนแค่ noun ในประโยคที่มีกริยา/ลักษณนาม/บทบาทเชิงโดเมน** — ประโยคแบบนั้นต้องแยกเป็นชุดต่อกลุ่ม vertical (allow-list booking verticals → vocab-template, อื่น ๆ fail-closed ไปชุด ONLINE_SALES) และคำ create ใช้ `vocab.createLabel` ตรง ๆ เท่านั้น ห้ามประกอบ "สร้าง"+noun → promote เป็น memory `feedback_vocab_substitution_needs_sentence_sets`
3. **Wording gate ต้อง grep ที่ render layer ไม่ใช่แค่ไฟล์ใน checklist** — `rg "คำสั่งซื้อ|ออเดอร์" src/lib/ src/app/(paces)/seller/` แล้วไล่ hit ที่เป็น string ผู้ใช้เห็น รวม lib ของ feature อื่นที่ป้อนจอเดียวกัน
4. **จบ session ที่แตะสถานะ feature = ต้องอัปเดต memory ของ feature นั้นก่อนปิด** (สิ่งที่ session 08-04 ไม่ได้ทำและ session นี้ต้องมาจ่ายดอกเบี้ย)

## What went right

- **`safepay-product` อ่านโค้ดจริงก่อนเชื่อ brief** → จับ state mismatch ได้ทั้ง 00030 (code-complete แล้ว) และ 00024 (P0 ปิดแล้ว) — ประหยัดการ implement ซ้ำทั้งฟีเจอร์
- **Impeccable critique แบบ 2 sub-agent แยกอิสระ** จับ defect ชั้น "ภาษาผิดโลกจริง" ที่ reviewer 8-gate + detector + tsc + เทส 107 ตัว **ทั้งหมดมองไม่เห็น** — gate นี้พิสูจน์ค่าตัวเองในรอบที่เนื้องานเป็น copy ล้วน
- **Backfill เอกสารจากโค้ดจริงไม่ใช่จาก BRD** — จับได้ว่า BRD checklist เน่า (อ้างไฟล์ที่ถูกรื้อ) และ BRD ขัดกับ UX-Copy ที่ตัวเองอ้าง
- **นับความครบด้วย diff ชื่อไฟล์กับ template** (บทเรียน 00028) ใช้งานจริงครั้งแรกแล้วให้คำตอบถูก: 7/7 + UX-Copy.md เป็นส่วนเกินที่อนุญาต
- กฎ copy ที่กลายเป็น logic ได้เทสกันถอยทันที (`order-event.test.ts` — ล็อก "เปิดบิลเข้าพัก")

## Action items

1. **Browser QA ตาม `TestCase.md` §6** — กลุ่ม A (onboarding), C (wording จอจริง โดยเฉพาะ D-1 + C07 + 320px), E (ยิง API ตรง) + หนี้ 00024 (contrast 4 จุด + การ์ดนัดผู้ซื้อ) — ติด dev server
2. **E2E Playwright spec ครอบ onboarding 2 ขั้น** (Personal + Business) เป็นอย่างน้อย
3. **Debt wording ที่ประกาศแล้ว:** OrdersList/OrdersTable/OrderQrSheet/BulkActionBar/Customer\*Block + stat card "กำลังจัดส่ง" ทุก vertical + default prop `'คำสั่งซื้อ'` ซ้ำ 5 ไฟล์ (→ อ่านจาก `ORDER_VOCAB.ONLINE_SALES`)
4. **เขียน memory** `feedback_vocab_substitution_needs_sentence_sets` + อัปเดต `project_booking_ux_00030_resume` (ทำพร้อม retro นี้)
5. TC-BKU-C07 (LODGING เข้า `/orders/new` ได้จริงไหม) — ปิด open verify เดิมของ UX-Copy §8
