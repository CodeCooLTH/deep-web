# Retrospective — Feature 00028 Shop Business Type (ประเภทร้านค้า 2 → 3 แบบ)

**วันที่:** 2026-08-03
**ขอบเขต:** เปลี่ยน `Shop.vertical` จาก `GENERAL | LODGING` เป็น `ONLINE_SALES | SERVICE_QUEUE | LODGING` — ลบค่า `GENERAL` ถาวร
**สถานะ:** deployed prod (`68348a49`, migration `20260803140000_shop_business_type` apply แล้ว)
**เอกสาร:** `docs/20 - Features/00028 - Shop Business Type/`

## Timeline

| เวลา | commit | สิ่งที่เกิด |
|---|---|---|
| 10:53 | `6f628bdb` | PRD + BRD (798 บรรทัด) |
| 11:05 | `1e365bd0` | DATABASE.md + schema + migration (ยังไม่ apply) |
| 11:34 | `0f1fc390` | SRS + SDS + API + UX-Design-Spec (1,268 บรรทัด) |
| 11:58 | `8945ef2a` | P1 — U1–U9, 21 ไฟล์ |
| 12:28 | `e9cc76e0` | P2 — U10–U12 + inventory guard + เก็บ `GENERAL` ที่ค้าง, 27 ไฟล์ |
| 12:34 | `68348a49` | เลื่อน timestamp migration หนีการชนกับอีก session |

**PRD ถึง prod = 1 ชั่วโมง 41 นาที** — ตัวเลขนี้เป็นบริบทของเกือบทุกปัญหาข้างล่าง

---

## Problems

### P1 — verify command ครอบแคบกว่าขอบเขตที่การเปลี่ยนแปลงกระทบจริง

**หลักฐาน:** commit `8945ef2a` เขียนบรรทัด verify ว่า

```
verify: tsc 0 error · rg "'GENERAL'" src/ เหลือแต่ comment · reviewer 8 gate PASS
```

commit ถัดมา `e9cc76e0` มีหัวข้อ **"เก็บ `'GENERAL'` ที่ค้าง"** และ U12 ระบุว่า `e2e/iship-shipping.spec.ts`, `e2e/service-appointment.spec.ts`, `scripts/tc-a05-concurrent-capacity.ts` ยัง seed `'GENERAL'` อยู่

**ทำไม:** verify ผูกกับ `src/` เพราะเป็น path ที่คุ้นมือ แต่การลบค่าออกจาก enum มีขอบเขตกระทบ = **ทุกที่ที่ประกอบข้อมูล** ไม่ใช่แค่ที่ที่อ่านข้อมูล — seed ใน `e2e/` และ `scripts/` สร้าง row จริงในฐาน

**ทำไมถึงชั้นที่สอง:** `Shop.vertical` เป็น `String` ใน Prisma ไม่ใช่ enum → e2e/scripts ส่ง string ดิบเข้าไปได้โดยไม่มี type ใดจับเลย ในขณะที่ฝั่ง `src/` มี `ShopVertical` union คอยจับให้ **ที่ที่ TypeScript มองไม่เห็นคือที่ที่ต้อง grep หนักที่สุด แต่กลับเป็นที่ที่ถูกลืม grep**

### P2 — เจอช่องโหว่ประเภทเดียวกันสองรอบ เพราะรอบแรกไม่ถูก generalize

**หลักฐาน:** U6 ใน `8945ef2a` — "auction guard ใหม่ — ของเดิมไม่เคยมี server-side vertical check เลย กันด้วยการซ่อนเมนูอย่างเดียวมาตลอด"

commit ถัดมา `e9cc76e0` — "inventory — `/api/inventory/**` 7 route ไม่เคยมี vertical guard เลย **เหมือนประมูล**"

**ทำไม:** พอเจอ "โดเมนนี้กันด้วยการซ่อนเมนู" ครั้งแรก มันถูก treat เป็น**บั๊กเฉพาะจุด**แล้วปิดไป แทนที่จะถูกอ่านเป็น**คลาสของบั๊ก** ("ระบบนี้เคยกันด้วย UI มาก่อน แล้วโดเมนไหนอีกที่ยังเป็นแบบนั้น") ถ้าตั้งคำถามนั้นตอน U6 จะเจอ inventory ในรอบเดียวกัน ไม่ต้องมีรอบสอง

**หมายเหตุ:** ทั้งสองช่องโหว่ **มีอยู่ก่อน 00028** ไม่ใช่ของใหม่ที่งานนี้ทำพัง — 00028 เป็นแค่งานที่บังคับให้เดินสำรวจจนเจอ

### P3 — ชื่อ vertical ใหม่ชนกับ label ที่มีอยู่แล้วในระบบ

**หลักฐาน:** `SERVICE_QUEUE` ถูกตั้งชื่อไทยว่า **"สินค้าและบริการ"** ซึ่งเป็น label ของแท็บสินค้าบน public profile อยู่ก่อนแล้ว U11 ใน `e9cc76e0` ต้องเปลี่ยน label แท็บเป็น "สินค้า" ไม่งั้น "จะมีร้านที่เห็นแท็บ `บริการ` กับ `สินค้าและบริการ` เคียงกัน = คำเดียวกันสองความหมาย"

**ทำไม:** ชื่อถูกเคาะใน PRD ในฐานะ "ชื่อประเภทร้าน" โดยไม่ได้ grep ว่าคำนั้นถูกใช้เป็น **user-facing string** ที่ไหนอยู่ก่อน — การตั้งชื่อถูกมองเป็นงาน product ไม่ใช่งานที่ต้องตรวจกับโค้ด

### P4 — `/b/[slug]` ไม่อยู่ใน SDS

**หลักฐาน:** commit `e9cc76e0` — "แก้ทั้ง 2 เส้นทาง — `/u/[username]` และ `/b/[slug]` (**เส้นหลังไม่มีใน SDS** reviewer จับได้)"

**ทำไม:** SDS เขียนจากเส้นทางที่คุ้น ไม่ได้ grep หา entry point ทั้งหมดที่ render `ShopProfile.tsx` ตัวเดียวกัน — ตรงกับบทเรียนที่บันทึกไว้แล้วใน [[feedback_write_docs_from_code_not_memory]] ซึ่งแปลว่ากฎมีอยู่แล้วแต่ไม่ถูกหยิบมาใช้ตอนเขียน SDS

### P5 — `createQueue` เขียนข้อมูลลงร้านผิดถาวร แล้วขึ้น toast ว่าสำเร็จ

**หลักฐาน:** commit `e9cc76e0` — `switchContext()` กลืน error เงียบและไม่เช็ค `res.ok`; endpoint สร้างคิวงาน resolve ร้านจาก session อย่างเดียว → ถ้าสลับร้านไม่สำเร็จ คิวงานถูกสร้างที่ร้านที่ active ค้างอยู่ backend คืน 200 ผู้ใช้เห็น toast ว่าสำเร็จ

**ทำไม:** การสลับร้านถูก treat เป็น **navigation** (พลาดได้ best-effort) ทั้งที่มันเป็น **precondition ของ write** — มันเปลี่ยน "ตัวตนของ request" ไม่ใช่แค่เปลี่ยนหน้าที่ดู

**จับได้โดย:** reviewer ไม่ใช่ QA — ถ้า reviewer ไม่จับ บั๊กนี้จะไปโผล่ที่ prod ในรูป "ข้อมูลของฉันหายไปไหน"

### P6 — เอกสารขาด `TestCase.md` แต่ถูกนับว่า "7/7 ครบ"

**หลักฐาน:** `docs/20 - Features/00028/` มี 7 ไฟล์ = API, BRD, DATABASE, PRD, SDS, SRS, **UX-Design-Spec** — ไม่มี `TestCase.md`

template ที่ `docs/99 - Rules/Feature-Templates/` มี 7 ไฟล์เหมือนกัน แต่คือ API, BRD, DATABASE, PRD, SDS, SRS, **TestCase** และ feature 00017–00026 **ทุกตัว** มี TestCase.md ครบ

CLAUDE.md บันทึกไว้ว่า "docs 7/7 ที่ `docs/20 - Features/00028...`" ซึ่ง**ยืนยันความเข้าใจผิดนี้ต่อ**

**ทำไม:** UX-Design-Spec.md ถูกเพิ่มเข้าชุด (จำเป็นจริง งานนี้แตะ UI หนัก) แล้วจำนวนไฟล์ครบ 7 พอดี → **"7 ไฟล์" ถูกอ่านเป็น "ครบชุด"** ทั้งที่เป็นคนละ 7 ไฟล์ การนับด้วยจำนวนแทนการเทียบชื่อทำให้การเพิ่มไฟล์หนึ่งกลบการหายไปของอีกไฟล์หนึ่งได้พอดี

### P7 — ไม่มี scope baseline และไม่มี browser QA

**หลักฐาน:** `docs/scope/` ไม่มีไฟล์ของ 00028 · CLAUDE.md carry ระบุ "browser QA (user รับไปกดเองบน prod 2026-08-03)"

**ทำไม:** 1 ชั่วโมง 41 นาทีจาก PRD ถึง prod ไม่มีที่ว่างให้ทั้งสองอย่าง งานที่ถูกตัดคืองานที่ตัดแล้วยัง deploy ได้ — ซึ่งก็คือ QA และ baseline เสมอ

---

## What went right

สิ่งเหล่านี้เป็น anchor ที่ควรทำซ้ำ ไม่ใช่แค่คำชม

1. **Documentation-first ถูกทำจริงแม้เร่ง** — PRD+BRD (10:53) มาก่อนโค้ดจริง ไม่มีการ back-fill ย้อนหลัง ตรงตาม Hard Rule 11 ที่ระบุว่าความเร็วมาจากการข้าม micro-approval ไม่ใช่ข้าม Requirement

2. **Migration ปลอดภัยจริง ไม่ใช่แค่เขียนว่าปลอดภัย** — ไม่ลบแถวใดเลย · `ALTER COLUMN SET DEFAULT` เป็น metadata-only แล้ว backfill แยกคำสั่ง · `UPDATE` ผูก `WHERE vertical='GENERAL'` จึงไม่แตะแถว `LODGING` ไม่ว่ากรณีใด · CHECK ใช้ `NOT VALID` แล้ว `VALIDATE` แยก (pattern เดียวกับ `Shop_pinSlots_min1`)

3. **ใช้ type system เป็นตัวจับ regression แทน grep** — ขยาย `ShopVertical` union เป็น 3 ค่าทำให้ `Record<ShopVertical, ...>` ใน `CustomerPanel.tsx` ถูก compiler บังคับให้เติม key ครบ **ทั้งที่ `rg "'GENERAL'"` มองไม่เห็นเพราะมันเป็น object key ไม่ใช่ string literal** — นี่คือวิธีที่ได้ผลจริงและควรเป็นท่ามาตรฐานเวลาขยาย union

4. **guard วางที่จุดเดียว ครอบ GET ด้วย** — `_shared.ts::requireSellerShop` ครอบ 6 route ประมูล, `requireOnlineSalesVertical()` ครอบ 7 route inventory (ยืนยันแล้ว: 7/7 ไฟล์ import จริง) การครอบ GET ด้วยสำคัญ เพราะ GET ก็รั่วข้อมูลได้

5. **allow-list + fail-closed แทน deny-list** — `VERTICAL_VISIBLE_SLUGS[vertical] ?? VERTICAL_VISIBLE_SLUGS.ONLINE_SALES` ค่าที่ 4 ในอนาคตจะตกไปทางปลอดภัยเอง **นี่คือ convention จาก retro รอบก่อน ([[feedback_enumerate_field_values_from_db]]) ที่ถูกหยิบมาใช้จริง** — เป็นหลักฐานว่ากลไก retro → convention ทำงาน

6. **409 `VERTICAL_LOCKED` แทนการ ignore เงียบ** — `vertical` ตั้งได้เฉพาะตอน `slug === null` มี slug แล้วต้องคืน error ไม่ใช่เมินคำขอเงียบ ๆ

7. **Reviewer จับของจริงได้ 2 เรื่อง** — `/b/[slug]` ที่หายจาก SDS และ race ของ `createQueue` ทั้งคู่เป็นเรื่องที่ tsc และ grep จับไม่ได้

8. **`Base:` line ครบทั้ง 2 commit ที่แตะ UI** และระบุถึงระดับบรรทัด (`CreateBusinessForm.tsx:139-174`)

---

## Conventions to adopt

### C1 — ลบค่าออกจาก enum/union ต้องสแกนทั้ง repo ไม่ใช่แค่ `src/`

```bash
# ต้องคืน 0 (ยกเว้นคอมเมนต์ที่อธิบายว่าค่านี้ถูกลบแล้ว)
rg -n "'<VALUE>'|\"<VALUE>\"" src/ e2e/ scripts/ prisma/ docs/
```

เหตุผลที่ `src/` อย่างเดียวไม่พอ: `e2e/` และ `scripts/` **seed row จริงเข้าฐาน** และคอลัมน์ที่เป็น `String` ใน Prisma ไม่มี type ให้ TypeScript จับเลย → ที่ที่ compiler มองไม่เห็นคือที่ที่ต้อง grep หนักที่สุด

คู่กัน: **ขยาย type union ให้ compiler บังคับ key ครบ** เป็นด่านที่สอง เพราะ grep จับ object key (`Record<T, ...>`) ไม่ได้

### C2 — guard ที่หายไปหนึ่งที่ = สมมติว่าหายทั้งคลาส ตรวจทุกโดเมนในรอบเดียวกัน

พอเจอ endpoint กลุ่มหนึ่งที่ "กันด้วยการซ่อนเมนูอย่างเดียว" **ห้ามปิดเฉพาะจุดแล้วเดินต่อ** ต้องหยุดแล้วไล่ทุก API namespace ใน `src/app/api/` ว่ามีอันไหนอีกที่พึ่ง UI เป็นด่านกัน — แล้วปิดให้หมดใน commit เดียวกันหรือ commit ติดกัน

### C3 — ก่อนเคาะชื่อไทยของ enum/สถานะที่ผู้ใช้เห็น ต้อง grep คำนั้นในฐานะ user-facing string ก่อน

การตั้งชื่อไม่ใช่งาน product ล้วน ๆ — ชื่อที่ชนกับ label ที่มีอยู่จะสร้าง "คำเดียวกันสองความหมาย" บนหน้าจอเดียวกัน ตรวจตอนเขียน PRD ถูกกว่าตามแก้ตอน implement

### C4 — write action ที่ตามหลังการสลับ context ต้องเช็คผลลัพธ์ก่อนยิง

การสลับร้าน/บัญชี **เปลี่ยนตัวตนของ request** ไม่ใช่ navigation — `switchContext()` ต้องคืนค่าที่เช็คได้ และ write action ต้องเช็คก่อนยิงเสมอ ส่วน navigation ยัง best-effort ได้ (worst case ผู้ใช้เห็นเองแล้วสลับใหม่) เกณฑ์: **ถ้าพลาดแล้วข้อมูลไปอยู่ผิดที่ถาวร = ไม่ใช่ best-effort**

### C5 — นับเอกสาร feature ด้วยการเทียบชื่อไฟล์กับ template ไม่ใช่ด้วยจำนวน

"7/7" ไม่มีความหมายถ้าไม่ระบุว่าไฟล์ไหน — การเพิ่มไฟล์นอก template หนึ่งไฟล์กลบการหายไปของไฟล์ใน template หนึ่งไฟล์ได้พอดี

```bash
diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/<NNNNN> - <Name>/")
```

`UX-Design-Spec.md` เป็นไฟล์ที่ควรมีจริงสำหรับ feature ที่แตะ UI หนัก — แต่มัน**เพิ่ม**เข้าชุด ไม่ได้**แทน** `TestCase.md`

---

## Action items

1. **เขียน `TestCase.md` ของ 00028** — ตาม template `docs/99 - Rules/Feature-Templates/TestCase.md` (owner: `safepay-qa`) ครอบอย่างน้อย: กติกา `vertical` immutable หลัง slug (409 `VERTICAL_LOCKED`), เมนู fail-closed เมื่อค่าไม่รู้จัก, guard ประมูล + inventory ทั้ง GET และ mutate, `fulfillmentMode=NO_SHIPPING` ตั้งต้นในร้าน `SERVICE_QUEUE`, onboarding แตก 3 ทางทั้ง 2 ที่
2. **เขียน scope baseline** ที่ `docs/scope/2026-08-03-00028-shop-business-type-scope-baseline.md`
3. **browser QA** — ยังไม่เคยกดจริงสักเคส user รับไปกดเองบน prod 2026-08-03 แต่ยังไม่มีผลกลับมาบันทึก
4. **P3 Public Profile เต็มรูปตาม `UX-Design-Spec.md` §B** — ตอนนี้เป็น ready-state
5. **ลบพารามิเตอร์ตายออกจาก `canUseAppointments`** — signature ยังรับ `{ kind: string; vertical: string }` แต่ body ใช้แค่ `vertical` (`src/lib/appointments.ts:47-51`) พารามิเตอร์ที่ไม่ถูกใช้ชวนให้คนอ่านรอบหน้าเชื่อว่า `kind` ยังมีผล ทั้งที่ BR-SBT-11 ตัดทิ้งไปแล้ว
6. **แก้ CLAUDE.md** ที่บันทึกว่า 00028 "docs 7/7" ให้ตรงความจริง (ขาด TestCase.md)
7. **ไล่ตรวจ API namespace ที่เหลือตาม C2** — ทำเป็นรอบเดียวจบ อย่ารอให้ feature หน้าไปสะดุดเอง

---

## หมายเหตุที่ไม่ใช่ปัญหา

- **ลำดับ DATABASE.md (11:05) มาก่อน SRS/SDS/API (11:34)** ต่างจากลำดับใน template (PRD→BRD→SRS→SDS→DATABASE→API→Tests) — **ไม่ถือเป็นการละเมิด** Hard Rule 11 บังคับแค่ว่า PRD+BRD ต้องมาก่อน implement ซึ่งทำครบแล้ว การล็อก schema ก่อนเขียน SRS เป็นลำดับที่สมเหตุสมผลเมื่องานมีแกนอยู่ที่ data model บันทึกไว้กันคนอ่านรอบหน้าสรุปผิดว่าเป็น finding
- **`68348a49` เลื่อน timestamp migration** เพราะชนกับอีก session ที่ทำงานบนเวิร์กทรีเดียวกัน — เป็นผลของสภาพแวดล้อม ไม่ใช่ความผิดพลาดของงานนี้ ดู [[feedback_shared_worktree_cherry_pick]]
