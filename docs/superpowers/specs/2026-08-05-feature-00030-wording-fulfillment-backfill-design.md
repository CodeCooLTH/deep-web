# Design Spec — Feature 00030 ก้อน 1+2 (backfill) + Rework round 2026-08-05

> **สถานะเอกสาร:** backfill ตาม Hard Rule 8 — ก้อน 1 (Wording SSOT rollout, commit `58d35418`)
> และก้อน 2 (ProductFormV2 field-hide, commit `dfe24e64`) ขึ้น prod โดยไม่ผ่าน ux gate
> เอกสารนี้ (1) บันทึก design ของสิ่งที่ shipped จากการอ่านโค้ดจริง (2) เป็น spec ของ rework
> items ที่ reviewer พบในรอบ verify 2026-08-05 ซึ่งแก้ตาม spec นี้แล้วในคอมมิตเดียวกับที่เพิ่มไฟล์นี้
>
> ผู้ออกแบบ: safepay-ux (2026-08-05) · Controller ตัดสิน open question #1 = รวม hardcode
> เพิ่มเติมใน `edit/page.tsx` (blockedCopy + h2) เข้ารอบแก้เดียวกัน (BR-BKU-09 gap ไฟล์เดียวกัน)
>
> **หมายเหตุ mockup:** งานนี้ไม่มี markup/จอใหม่แม้แต่จุดเดียว (text substitution + logic-only)
> จึงไม่ออก HTML mockup แยก — wireframe ASCII ในเอกสารนี้ชี้ "จุดที่คำเปลี่ยน" บน layout
> ที่ approve แล้วในสเปกก่อนหน้า (seller order detail v5, vertical picker)

Design Spec เดิมของก้อน onboarding picker: `2026-08-04-feature-00030-vertical-picker-design.md` (ไม่ทำซ้ำที่นี่)

---

## Scope

- **ก้อน 1 — Wording SSOT rollout (shipped, verified ✅):** `ORDER_VOCAB`/`resolveOrderVocab`
  (`src/lib/seller-menu.ts`) เป็น SSOT 4 ช่อง (`noun`/`nounShort`/`createLabel`/`createLabelShort`)
  ผันตาม `Shop.vertical` — reviewer ตรวจ BRD §2.2 ครบ 15/15 จุดแล้ว
- **ก้อน 2 — ProductFormV2 field-hide (shipped, verified ✅):** ร้าน `SERVICE_QUEUE` ซ่อน
  fieldset `fulfillmentMode` (ไม่ใช่ disable) แสดง `<p>` อธิบายแทน (`ProductCapabilityCardV2.tsx`)
- **Rework round 2026-08-05 (แก้ในคอมมิตนี้):** 6 จุดด้านล่าง

## Pattern ที่ล็อกเป็น convention

Server Component resolve `shop.vertical` ที่มีในมืออยู่แล้ว (จาก `requireActiveShop`) →
เรียก `resolveOrderVocab(shop.vertical)` **ครั้งเดียว (hoist)** → ส่ง string ที่ derive แล้ว
(`vocab.noun`, `vocab.createLabel`, `` `แก้ไข${vocab.noun}` ``) เป็น prop ให้ Client Component →
**Client Component ห้าม import `resolveOrderVocab`/รู้จัก vertical เอง**

การผันคำ: `ORDER_CREATED` ใช้ `vocab.createLabel` ตรง ๆ (LODGING = "เปิดบิลเข้าพัก" **ห้าม**
ประกอบ "สร้าง"+noun เป็น "สร้างบิลเข้าพัก" — UX-Copy §3) · แก้ไข/ยกเลิก = `แก้ไข${noun}`/`ยกเลิก${noun}`
(pattern เดียวกับ `order-action-set.ts`)

## Rework items ที่แก้รอบนี้

| # | ไฟล์ | อาการ | วิธีแก้ตาม spec |
|---|---|---|---|
| 1 | `src/lib/order-event.ts` + `ShippingActivity.tsx` + `orders/[token]/page.tsx` | `ORDER_EVENT_META` hardcode "สร้าง/แก้ไข/ยกเลิกคำสั่งซื้อ" render เป็น `<h5>` ทุกแถว timeline — ร้าน SERVICE_QUEUE/LODGING เห็นคำผิดธุรกิจ (ขัด BR-BKU-09) | เพิ่ม `resolveOrderEventLabel(type, {noun, createLabel})` override เฉพาะ 3 event lifecycle, fallback `ORDER_EVENT_META[type].label` สำหรับโดเมนพัสดุ (BR-BKU-11 ห้ามผัน) — ไม่แตะ `icon`/`tone` (Verified-Means-Green ของ timeline คงเดิม: เขียวเฉพาะ BUYER_CONFIRMED) · `ShippingActivity` รับ prop `createLabel` เพิ่ม |
| 2 | `(fullscreen)/orders/[token]/edit/page.tsx` | `metadata.title` (module constant) + `FullscreenPageHeader title` hardcode "แก้ไขคำสั่งซื้อ" | `generateMetadata()` async mirror `orders/page.tsx` (fail-safe ตก ONLINE_SALES) + hoist `const vocab` ใช้ทั้งไฟล์ |
| 2b | ไฟล์เดียวกัน (Controller เพิ่ม scope) | `blockedCopy` dict + h2 "แก้ไขคำสั่งซื้อ {orderNo} ไม่ได้" hardcode | แทน "คำสั่งซื้อ" ด้วย `${vocab.noun}` ทุก string — คงเนื้อความ D-1 ที่ไม่โกหกไว้ครบ |
| 3 | `bookings/page.tsx` | ไม่มี subtitle disambiguation คู่กับ `/orders` (UX-Copy §6 C-3) | เพิ่ม `<p className="text-default-400 text-xs mt-0.5">การจองห้องพัก — วันเข้าพักและห้องที่กันไว้</p>` เป็น sibling ของ `PageBreadcrumb` — **ห้ามใช้ prop `subtitle` ของ `PageBreadcrumb`** (prop นั้นคือ breadcrumb crumb ไม่ใช่บรรทัดคำอธิบาย) |
| 4 | `ProductFormV2.tsx` | create-mode default `fulfillmentMode='SHIPPED'` แม้ `noShipping=true` (service ล็อกทับให้ แต่ payload ไม่ตรงเจตนา UI) | `?? (noShipping ? 'NO_SHIPPING' : 'SHIPPED')` |

## Theme Source Mapping

| Section | Theme source | หมายเหตุ |
|---|---|---|
| ก้อน 1 ทุกจุด + rework #1/#2 | **ไม่มี markup ใหม่** — prop threading บนโครงเดิมที่ source แล้ว (`PageBreadcrumb`, `FullscreenPageHeader`, `.card`, Swal, `pacesToast`, `ShippingActivity` ที่มี `Base:` theme comment อยู่หัวไฟล์) | เปลี่ยนเฉพาะค่า string ที่ป้อนเข้า component เดิม |
| rework #3 subtitle | copy pattern จากพี่น้อง `orders/page.tsx:246-248` (`docs/conventions/sibling-surface-parity.md`) | text ธรรมดา ไม่ใช่ component ใหม่ |
| ก้อน 2 `<p>` แทน fieldset | `ProductCapabilityCardV2.tsx` ประกาศตรงไปตรงมาในหัวไฟล์ว่าเป็น Domain component ไม่มี 1:1 Paces equivalent — ใช้ primitive ที่ลงทะเบียนแล้ว (`text-default-500 text-xs` + `Icon`) | ยอมรับโดยเปิดเผยตาม HR1 |
| rework #4 | logic-only ไม่มี markup | — |

## Edge states

- vertical ไม่รู้จัก/resolve ไม่ได้ → fallback ชุด `ONLINE_SALES` (fail-safe เดียวกับ SSOT ทุกจุด)
- ประวัติ event ว่าง → empty-state ที่บอกสาเหตุ (มีอยู่แล้ว ไม่กระทบ)
- คำยาวสุด "การเข้ารับบริการ" ใน `<h5 min-h-9>` ที่ 320px → wrap ได้ (ไม่มี nowrap/truncate) —
  **หนี้ verify ด้วยตาจริง** (UX-Copy §8 ข้อ 6 ยังไม่เคยเช็ค)
- สินค้าเก่าของร้าน SERVICE_QUEUE ที่ `fulfillmentMode='SHIPPED'` ค้างในฐาน → ปลอดภัย:
  field ถูกซ่อน + `updateProduct` override เป็น NO_SHIPPING ตอน submit เสมอ (BR-BKU-13/14)

### Impeccable compliance

**Mode: Operate** (`operate.md` — seller console งานประจำวัน) — bug ที่แก้คือ "strangeness
without purpose" ตรงเกณฑ์: sidebar/ปุ่มพูดคำหนึ่ง timeline/edit-title พูดอีกคำ ผู้ใช้ต้องหยุดคิดว่า
กดถูกที่ไหม (pain point PRD §2.2 คำต่อคำ)

- **One Voice:** ไม่กระทบ — text/logic-only ไม่เพิ่ม accent ใหม่
- **Verified-Means-Green:** คงเดิม — rework #1 แก้เฉพาะ `label` ไม่แตะ `tone` (เขียวสงวนให้
  `BUYER_CONFIRMED`, แดงให้ยกเลิก ตามคอมเมนต์ `order-event.ts`)
- **Sentence case ไทย, ไม่มี ALL CAPS/emoji** — ผ่าน
- **น้ำเสียง (clarify):** blockedCopy คงหลัก "บอกทางออก ไม่โกหก" ของ D-1 ไว้ครบทุก vertical

## ผล Impeccable gate (2026-08-05 — HR8)

**critique** (2 sub-agent แยกอิสระ: design review + detector): detector = **0 findings ทั้ง 5 ไฟล์**
· design review จับ defect จริง 4 ตัวซึ่ง**แก้แล้วใน batch เดียว**ตาม playbook:

- **P1/P3:** `blockedCopy` แทน noun อย่างเดียวผลิตประโยคผิดโลกจริง — "สร้างบิลเข้าพักใบใหม่"
  (ละเมิดคำล็อก "เปิดบิลเข้าพัก"), ลักษณนาม "ใบ" กับ nominalized action, "ผู้ซื้อ/รับสินค้า/
  ต้องการขาย" กับร้านบริการ → แยกชุด copy: allow-list `SERVICE_QUEUE|LODGING` ใช้ vocab-template
  (ลูกค้า/createLabel/ไม่มี "ใบ"), vertical อื่น fail-closed ไปชุด ONLINE_SALES literal เดิม
- **P2:** "จัดส่งไปแล้ว" โผล่กับร้านที่ไม่มีจัดส่งได้จริง (สินค้า SHIPPED เก่าค้างในฐาน →
  order-level fulfillmentMode → status SHIPPED) → ชุด booking ใช้ "เลยขั้นรอดำเนินการไปแล้ว"
- **P4:** subtitle `/bookings` โผล่บนมือถือทั้งที่คู่ของมันใน `/orders` เป็น desktop-only + ซ้ำ
  title ใน `SellerMobileHeader` → ห่อ `hidden lg:block` ตรงพี่น้อง
- **minor:** empty state timeline "…นี้**สร้าง**ก่อนระบบ…" → "เกิดขึ้น" (กริยากลาง) ·
  เพิ่ม unit test `src/lib/order-event.test.ts` ล็อกกฎผัน (LODGING ห้าม "สร้าง"+noun)

**clarify:** ไล่ string สุดท้ายทุกตัว — error copy ครบ what/why/recovery, ทางออกอ้างปุ่มที่มีจริง
ต่อ vertical, noun/verb เดียวกันต่อ concept ทั้ง flow — ผ่าน

verify: vitest 107/107 (order-event 3 ใหม่ + seller-menu 19 + order-action-set 73 + fulfillment 12)
· tsc ไม่มี error ในไฟล์ที่แตะ (baseline worktree 78 × TS2307 asset ไม่เกี่ยว)

## หนี้/ข้อสังเกตที่ไม่ทำรอบนี้ (บันทึกไว้)

0. **(ใหม่จาก critique)** stat card "กำลังจัดส่ง" ใน `/orders` ยังเป็นคำเดียวทุก vertical —
   ฝาแฝดฝั่ง list ของ P2 · `ORDER_EVENT_META` 3 label lifecycle กลายเป็น dead path ใน consumer
   เดียวที่มี แต่ยังประกาศคำ ONLINE_SALES ซ้ำกับ SSOT · default prop `'คำสั่งซื้อ'` ซ้ำ 5 ไฟล์
   (ShippingActivity/OrderReviewCard/OrderSummary/order-action-set/OrderCardMenu) — ควรอ่านจาก
   `ORDER_VOCAB.ONLINE_SALES` รวบรอบเดียว

1. `/bookings` ไม่ห่อ breadcrumb ด้วย `hidden lg:block` ต่างจาก `/orders` — ความไม่ตรงที่มีอยู่ก่อน
   ถ้าจะ sync เป็นงานแยก (sibling parity)
2. UX-Copy §8 ข้อ 7: ยังไม่ยืนยันว่าร้าน LODGING เข้า `/orders/new` ได้จริงไหม (ถ้าไม่ได้
   `createLabel` "เปิดบิลเข้าพัก" ไม่มีที่ใช้) — หนี้ verify เดิม
3. hardcode "ออเดอร์" ที่ประกาศเป็น debt ไว้แล้วใน `58d35418` (OrdersList/OrdersTable/
   OrderQrSheet/BulkActionBar/Customer*Block ฯลฯ) — คงสถานะ debt เดิม
4. `VerticalTaxonomyPicker.tsx` คอมเมนต์หัวไฟล์ vs `Base:` ใน commit message เล่าคนละมุม —
   คอมเมนต์ในไฟล์ละเอียดกว่า (อ้าง theme path จริง 2 จุด) ตัดสินคงไว้ตามเดิม
5. commit `dfe24e64` ไม่มี `Base:` line (ละเมิด HR3, merge ไปแล้ว) — บันทึก retroactive:
   markup `<p>` ใน `ProductCapabilityCardV2.tsx:65-70` เป็น Domain component ตามที่ไฟล์ประกาศ
   (primitive: `text-default-500 text-xs` + `Icon` wrapper — ไม่มี 1:1 theme file)
