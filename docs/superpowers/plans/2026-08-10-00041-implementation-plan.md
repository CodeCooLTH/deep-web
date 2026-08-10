# แผน implement — 00041 Buyer Order Experience

> เขียน 2026-08-10 หลังผ่าน gate ครบ (doc-first 7/7 + `safepay-ux` + mockup 3 จอ)
> เอกสารต้นทาง: `docs/20 - Features/00041 - Buyer Order Experience/` (PRD/BRD/SRS/SDS/DATABASE/API/TestCase/UX-Design-Spec)
> ทุกอย่างในแผนนี้อ้าง SDS §6 (Deploy Order + task breakdown) เป็นฐาน — ที่เพิ่มคือ gate/verify/ownership ต่อก้อน

---

## 0. สถานะ ณ วันเขียน

| gate | สถานะ |
|---|---|
| HR11 doc-first (7/7 ตรงชื่อ template) | ผ่าน — ตรวจด้วย `diff` ชื่อไฟล์ ไม่ใช่นับจำนวน |
| HR8 `safepay-ux` Design Spec + mockup 3 จอ | ผ่าน — `UX-Design-Spec.md` + `docs/superpowers/specs/2026-08-10-buyer-order-experience-mockup.html` |
| user review เอกสาร | **ยังไม่ได้รับ sign-off ชัดเจน** — user สั่ง push แล้วให้วางแผนต่อ ถือว่ายอมรับทิศทาง แต่ยังไม่เคยพูดว่า "อ่านครบแล้วผ่าน" |
| โค้ด | **ยังไม่แตะแม้บรรทัดเดียว** |

### มติที่ปิดแล้ว (ไม่ต้องถามซ้ำ)

- **D-1/D-2/D-3** — user เคาะ 2026-08-10
- **BR-BOE-03/17/19/22** — user ยืนยันตัวเลข 2026-08-10 (mask ที่อยู่ 3 ตัวท้าย+จังหวัดเต็ม · แก้รีวิว 24 ชม. · รูป 4 ใบ · ร้านแก้คำตอบไม่จำกัดเวลา)
- **soft-delete รีวิว** (SRS §8) — Controller ตัดสิน ปิดรูรั่วยืดหน้าต่างแก้ไข
- **TD-001 ตำแหน่งปุ่ม dispute/contact** — ux ตัดสิน (UX-Design-Spec §D)
- **C-1 breakpoint = 768** — Controller ตัดสินทับข้อเสนอ ux (`<900`) เพราะ BRD FR-018 ที่ user อนุมัติเขียน ≤767 และโค้ดจริง `(buyer-app)/layout.tsx:49` สลับ `AccountSidebar` ที่ 768 ด้วย `min-[768px]:` — ถ้าใช้ 900 จะเกิดช่วง 768–899 ที่ sidebar โผล่แล้วแต่เนื้อหายังเป็นโหมดมือถือ
- **C-2 (PII บนหน้า OTP) — ปิดแล้ว ไม่ใช่ความเสี่ยงจริง:** ผู้ที่อยู่บนหน้า `PHONE_VERIFY_REQUIRED` คือผู้ถือ token อยู่แล้ว และ **D-1 เปิดให้ผู้ถือ token คนเดียวกันเห็นชื่อร้าน/รายการสินค้า/ยอดเงินไปแล้วผ่าน guest view** ⇒ การโชว์ `orderNo` + `shopName` บนหน้า OTP เป็น **subset ของสิ่งที่เปิดไปแล้ว** ไม่ใช่ช่องเปิดเผยใหม่ · เงื่อนไข: **ห้ามโชว์ field ที่ guest view ไม่โชว์** (เบอร์เต็ม/ที่อยู่เต็ม/สลิป) — ถ้าวันหนึ่ง D-1 ถูกถอย ต้องกลับมาทบทวนข้อนี้ด้วย
- **C-3 ไอคอน** — `tabler-flag-3`/`tabler-headset`/`tabler-mood-sad` ยืนยันแล้วว่ามีจริงใน `generated-icons.css`

### ยังเปิดอยู่ (ไม่บล็อกการเริ่ม)

- **C-4** Paces reply lightbox — รอบนี้ใช้ `target=_blank` (ถ้าจะทำ lightbox ต้องผ่าน ux รอบใหม่)
- **C-5** desktop 1200–1280px มี 3 แถบ อาจแน่น — ต้อง browser QA จริง (user ตรวจเอง)
- **`ReplyToReviewSchema` maxLength 1000** — SRS ตั้งเอง ยังไม่มีเคส boundary ใน TestCase (carry)

---

## 1. หลักการที่ใช้ตัดสินทั้งแผน

1. **แยก 2 PR เด็ดขาด** (SDS §6) — schema ก่อน โค้ดทีหลัง ห้ามรวม
2. **HR15 บังคับ:** push `main` = `prisma migrate deploy` บน prod อัตโนมัติ ⇒ **ต้องแจ้ง user ก่อน push PR-1 ทุกครั้ง** ไม่มีข้อยกเว้น
3. **HR4:** งาน ≥3 tasks = agent team (Planner→Developer→Reviewer→QA→Controller) — แผนนี้กำหนด reviewer gate ต่อ batch ไม่ใช่ตอนจบทีเดียว
4. **เทส `[blocker]` ต้องพิสูจน์ด้วย mutation ทุกตัว** ไม่ใช่แค่เขียนให้เขียว (SDS §8 มี 7 ตัวพร้อม mutation กำกับแล้ว)
5. **verify หลัง rebase เสมอ + เช็ค fast-forward ซ้ำก่อน push แยกคำสั่ง** (HR17)
6. **user ตรวจ browser QA เอง** (`feedback_user_does_visual_qa`) — ไม่ลงแรงกับ browser QA/ซ่อม dev server

---

## 2. PR-1 — schema only

**ขอบเขต:** 2 migration + `prisma/schema.prisma` เท่านั้น **ห้ามมีโค้ดแอปที่อ้างคอลัมน์/ค่าใหม่แม้บรรทัดเดียว**

| # | งาน | เจ้าของ | อ้างอิง |
|---|-----|---------|---------|
| 1.1 | เขียนไฟล์ migration 2 ตัวจาก DDL ใน `DATABASE.md` §5.1 | `safepay-database` ร่าง → Controller Write | `DATABASE.md` §5.1 |
| 1.2 | อัปเดต `prisma/schema.prisma` (model `Review` + คอมเมนต์ `OrderEvent.type` 17 ค่า) | Controller | `DATABASE.md` §3 |
| 1.3 | 🛑 **query `pg_get_constraintdef` บนฐานปลายทางก่อน** แล้วยืนยันว่าได้ 15 ค่าตามที่ระบุ — ไม่ตรงให้หยุดสืบ | Controller | `docs/conventions/migration-check-constraint-additive.md` |
| 1.4 | เช็ค timestamp migration ชนกับ branch อื่นซ้ำ (`git log --all`) ก่อน Write | Controller | `DATABASE.md` §5.1 |
| 1.5 | apply ฐาน local (`migrate deploy` ที่ **ปักหมุด localhost ในคำสั่งตรง ๆ**) แล้ว `prisma generate` | Controller | HR14 |
| 1.6 | verify: `tsc` + `npx vitest run src/` (เทียบจำนวน fail กับ baseline) + `next build` | Controller | HR17 |
| 1.7 | **แจ้ง user ว่า push นี้ = migrate prod** แล้วรอสัญญาณ | Controller | HR15 |
| 1.8 | push → รอ deploy สำเร็จ → **ยืนยัน CHECK constraint บน prod ด้วย query ซ้ำ** (ไม่เชื่อว่า migrate สำเร็จ = ค่าอยู่ครบ) | Controller | `DATABASE.md` §5.1 |

**เกณฑ์ผ่าน:** deployment สำเร็จ + query ยืนยันเห็นครบ 17 ค่า + `Review` มีคอลัมน์ใหม่ครบ 6 ตัว

---

## 3. PR-2 — feature code (14 commit จัดเป็น 5 batch)

> เริ่มได้เมื่อ PR-1 deploy สำเร็จแล้วเท่านั้น · แต่ละ batch จบด้วย reviewer gate ก่อนขึ้น batch ถัดไป

### Batch A — pure/SSOT (ไม่แตะ schema ไม่แตะ UI)

| commit | งาน | เทส `[blocker]` |
|---|---|---|
| A1 | `src/lib/order-pii-mask.ts` (ใหม่) | #1 — mutation: ให้ `province` ถูก mask ด้วย ต้องแดง |
| A2 | SSOT ป้ายสถานะ: ลบ `getStatusPill`+เทส · `OrderDetailMobile` ใช้ `resolveOrderStatusBadge` · แก้ label SHIPPED ใน `orders/list/index.tsx` + `dashboard/Orders.tsx` | #6 — mutation: คืน `'จัดส่งแล้ว'` ที่ไฟล์ใดไฟล์หนึ่ง ต้องแดง |
| A3 | `order.service.ts` ขยาย select (`carrierStatus`, `disputeOpenedAt`, `disputeResolvedAt`) | — |

**เหตุผลที่แยกมาก่อน:** ไม่มี dependency กับ migration เลย ทำคู่ขนานกับ PR-1 ได้ถ้าจำเป็น และ A2 เป็นงานที่แตะ 4 ไฟล์ข้ามฝั่ง buyer/seller — ถ้าพลาดจะเห็นทันทีก่อนงานอื่นทับ

### Batch B — instrumentation (ต้องรอ PR-1)

| commit | งาน | เทส `[blocker]` |
|---|---|---|
| B1 | `order-event.ts` +2 type · `order-event.service.ts` exclusion filter | #5 |
| B2 | `order-access.service.ts` แยก event write ออกนอก transaction | #3 — mutation: ย้ายกลับเข้า tx ต้องแดง |
| B3 | `POST /api/orders/[token]/auth-flow/start` + `AuthFlowStartSchema` | — |

🛑 **B2 คือจุดเสี่ยงสูงสุดของทั้งฟีเจอร์** — `guaranteeOrderLink()` เป็นหัวใจของ claim ทั้งระบบ ถ้าพลาดจะพังเงียบ (fn ห่อ try/catch ที่ swallow ทุก error) ⇒ **ต้องมีเทสมัดพฤติกรรมเดิมก่อนแตะ** ไม่ใช่หลังแตะ

### Batch C — review service + API (ต้องรอ PR-1)

| commit | งาน | เทส `[blocker]` |
|---|---|---|
| C1 | `review.service.ts`: 4 ฟังก์ชันใหม่ + 5 error class + `canEditReview` + `findActiveReviewOrThrow` | #2 (B03/B04 ประกบขอบเขต), #7 |
| C2 | **read-path filter `deletedAt` ครบ 22 จุด** ตาม `DATABASE.md` §8.1 — รวม trust-score/badge/admin dashboard/app-shop | #4 — สแกนซอร์ส ไม่ hardcode รายชื่อไฟล์ |
| C3 | route ใหม่ 4 ตัว + `UpdateReviewSchema`/`ReplyToReviewSchema` | — |

🛑 **C2 ห้ามแตะ 2 จุดใน allow-list** (`createReview` guard, `linkBuyerHistory`) — เขียนเหตุผลเป็นคอมเมนต์ตรงนั้นด้วย ไม่ใช่แค่ในเอกสาร เพราะคนถัดไปที่มา sync จะไม่ได้เปิด `DATABASE.md`

### Batch D — UI ฝั่งผู้ซื้อ (ต้องรอ A+B+C)

| commit | งาน |
|---|---|
| D1 | `page.tsx` guest branch + `buildGuestOrderData()` + filter `deletedAt` หลัง fetch (TD-003) |
| D2 | `GuestOrderView.tsx` (ใหม่) |
| D3 | `o/layout.tsx` (ใหม่) — header 2 แบบ + breakpoint 768 |
| D4 | `OrderDetailMobile.tsx` — reorder (สลิปก่อนรีวิว) + `ShippingProgressCard` + help-card + dispute dialog + responsive Grid |
| D5 | `ReviewForm.tsx` — ล้าง hardcode hex + โหมด edit + photo grid + countdown |

ทุก commit ต้องมี `Base:` ชี้ไฟล์ theme ตาม Theme Source Mapping ใน `UX-Design-Spec.md` §3 (HR3)

### Batch E — UI ฝั่งร้าน + metrics

| commit | งาน |
|---|---|
| E1 | `seller/(dashboard)/reviews/*` — ชื่อผู้รีวิวจริง + UI ตอบกลับ (Paces primitive เท่านั้น, `⋯` ต้อง `size-11`) |
| E2 | `scripts/metrics/00041-buyer-order-experience-kpi.sql` (อย่าลืม `deletedAt IS NULL` ใน Review Rate query — `DATABASE.md` §8.3) |

---

## 4. Gate ต่อ batch

| หลังจบ batch | ต้องผ่าน |
|---|---|
| ทุก batch | `tsc` exit 0 · `npx vitest run src/` จำนวน fail ไม่เกิน baseline · เทส `[blocker]` ของ batch นั้นเขียว **และพิสูจน์ mutation แล้ว** |
| A, B, C | `safepay-reviewer` 8-gate |
| D, E | `safepay-reviewer` + 🛑 **Controller รัน `/impeccable critique` และ `/impeccable clarify`** (HR8 บังคับหลัง build UI ก่อน mark complete) · `/impeccable audit` เพิ่มถ้าแตะ a11y |
| ก่อน push ทุกครั้ง | HR17: rebase → verify **หลัง** rebase → เช็ค fast-forward ซ้ำแยกคำสั่ง |

---

## 5. ความเสี่ยงที่ต้องจับตา

| ความเสี่ยง | ทำไมอันตราย | วิธีกัน |
|---|---|---|
| **B2 `guaranteeOrderLink`** | พังเงียบ 100% (try/catch swallow) → claim ไม่ทำงาน = ย้อนกลับไปที่ `BUYER_CONFIRMED = 0` ซึ่งเป็นปัญหาที่ทั้งฟีเจอร์นี้ตั้งใจแก้ | เทส #3 มัดพฤติกรรมเดิม **ก่อน** แตะ + mutation พิสูจน์ |
| **C2 ลืมกรอง `deletedAt` แม้จุดเดียว** | รีวิวที่ลบแล้วโผล่กลับ · ที่แย่กว่าคือไปดัน **Trust Score + เกณฑ์เหรียญ** โดยไม่มีอะไรฟ้อง | เทส #4 สแกนซอร์สแบบไดนามิก ไม่ hardcode รายชื่อไฟล์ |
| **A2 แตะ 4 ไฟล์ข้ามฝั่ง** | แก้ไม่ครบ = สร้างความไม่ตรงกันแบบใหม่แทนที่จะแก้ของเดิม | เทส #6 + grep ทั้ง repo ก่อนปิด batch |
| **มีคน push แทรกระหว่างทาง** | เกิดขึ้นแล้ว 2 ครั้งในวันเดียว (7 คอมมิตจากอีกฝั่ง) | HR17 ทุกรอบ — โดยเฉพาะ `OrderDetailMobile.tsx`/หน้าสร้างออเดอร์ที่อีกฝั่งกำลังแตะอยู่ |
| **`coverage/probe-profile-access.ts`** | ทำ `npm run build` ในเครื่องล้มทุกครั้ง (บน Vercel ไม่พังเพราะ gitignore) | ย้ายออกชั่วคราวตอน build หรือให้ user ลบทิ้ง |

---

## 6. Definition of Done (ตาม BRD §6.3 — ไม่ใช่แค่ UI เสร็จ)

- [ ] เทส `[blocker]` ครบ 7 ตัว เขียว + พิสูจน์ mutation ทุกตัว
- [ ] `tsc` + `build` exit 0 · เทสไม่แย่ลงกว่า baseline
- [ ] `/impeccable critique` + `/impeccable clarify` ผ่าน (HR8)
- [ ] **วัด KPI ทั้ง 4 ตัวได้จริงอย่างน้อยหนึ่งครั้ง** — งานที่ UI ครบแต่ยังวัดไม่ได้ **ถือว่ายังไม่เสร็จ** (บทเรียนตรงจาก 00015 ที่ประกาศ KPI แล้วไม่เคยวัด)
- [ ] `docs/SRS.md` (เอกสารระบบ) sync ครบ — §6.2 `OrderEvent` 17 ค่า + `WalletTransaction.reason` + `Review` field ใหม่ · §7.5 endpoint ใหม่ 5 ตัว · §9.1 authorization matrix (HR11: "ครบ 7 ไฟล์ ≠ เอกสารเสร็จ")
- [ ] retro ปลาย phase (HR4)

---

## 7. สิ่งที่ **ไม่** อยู่ในรอบนี้

- รีวิวรายสินค้า (ต้องรื้อ `Review.orderId @unique`)
- Trust Score v2 (00040) — รอผลลัพธ์ของฟีเจอร์นี้ก่อน
- ย้าย `OrderDetailMobile` ไป direct upload เต็มรูป + ถอด multipart branch ของ `slip/route.ts` (หนี้ที่บันทึกไว้แล้ว — ทำได้ระหว่าง D4 ถ้าสะดวก แล้วถอด allow-list ใน `upload-no-multipart-callers.test.ts` พร้อมกัน)
- lightbox รูปรีวิวฝั่งร้าน (C-4)
- `trackingUrl` ของขนส่ง (ไม่มีในระบบเลย — Phase 2 candidate)
