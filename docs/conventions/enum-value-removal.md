# การลบ/เปลี่ยนค่าใน enum ที่ผู้ใช้เห็น

> ที่มา: retro feature 00028 (`docs/retro/2026-08-03-feature-00028-shop-business-type-retrospective.md`) — ลบ `Shop.vertical = 'GENERAL'` ถาวร แล้วค่าตกค้างหลุดรอบแรกไป 3 ไฟล์

เอกสารนี้ครอบ **การลบค่าออกจากชุดค่าที่อนุญาต** (enum, union, สถานะ, ประเภท) ซึ่งต่างจากการ *เพิ่ม* ค่าใหม่ตรงที่มันทำให้โค้ดเดิมผิดเงียบ ๆ ไม่ใช่พังเสียงดัง

---

## 1. ขอบเขตการสแกน — ทั้ง repo ไม่ใช่แค่ `src/`

```bash
# ต้องคืน 0 (ยกเว้นคอมเมนต์ที่อธิบายว่าค่านี้ถูกลบแล้ว)
rg -n "'<VALUE>'|\"<VALUE>\"" src/ e2e/ scripts/ prisma/ docs/
```

**ทำไม `src/` อย่างเดียวไม่พอ:**

- `e2e/` และ `scripts/` **seed row จริงเข้าฐานข้อมูล** — ค่าที่ลบไปแล้วยังถูกเขียนกลับเข้ามาได้จากตรงนี้
- คอลัมน์ที่ประกาศเป็น `String` ใน Prisma (ไม่ใช่ `enum`) **ไม่มี type ให้ TypeScript จับเลย** — ฝั่ง `src/` รอดเพราะมี union ของตัวเองคอยจับ แต่ e2e/scripts ส่ง string ดิบเข้าไปได้ตรง ๆ
- `docs/` ถือค่าเก่าไว้ในตัวอย่าง/สเปก ซึ่งจะถูกอ่านเป็นความจริงในรอบถัดไป

**กฎที่จำง่าย:** ที่ที่ compiler มองไม่เห็น คือที่ที่ต้อง grep หนักที่สุด — แต่มันคือที่ที่ถูกลืม grep เสมอ

### เคสจริงที่หลุด (00028)

commit `8945ef2a` เขียน verify ว่า `rg "'GENERAL'" src/ เหลือแต่ comment` แล้ว claim PASS
commit ถัดมา `e9cc76e0` ต้องตามเก็บ `e2e/iship-shipping.spec.ts`, `e2e/service-appointment.spec.ts`, `scripts/tc-a05-concurrent-capacity.ts`

---

## 2. grep อย่างเดียวไม่พอ — ต้องให้ compiler ช่วยจับด้วย

`rg "'<VALUE>'"` **จับ object key ไม่ได้** เช่น

```ts
const LABEL: Record<ShopVertical, string> = {
  GENERAL: "ร้านทั่วไป",   // ← ไม่มี quote, grep มองไม่เห็น
  LODGING: "บ้านพัก",
}
```

**ท่าที่ได้ผล:** ขยาย type union ให้ครบชุดค่าใหม่ก่อน แล้วรัน `tsc` — TypeScript จะบังคับให้เติม/ลบ key เอง

เคสจริง: `CustomerPanel.tsx` ถูกจับได้ด้วยวิธีนี้ใน 00028 ทั้งที่ grep มองไม่เห็น

**สรุปสองด่าน:** grep ทั้ง repo (จับ string literal) + ขยาย union แล้ว `tsc` (จับ object key / exhaustive check)

---

## 3. ระวังตรรกะ binary ที่ไม่พังเสียงดังเมื่อค่าที่ 3 โผล่มา

```ts
vertical === 'LODGING' ? A : B     // ← ค่าใหม่ตกเข้า B เงียบ ๆ ไม่มี error
```

โค้ดแบบนี้ **compile ผ่าน ทดสอบผ่าน และผิด** เมื่อชุดค่าขยาย — ต้องไล่ grep คำว่าชื่อฟิลด์เอง (`vertical`, `isLodging`) ควบคู่ไปกับการ grep ค่า ไม่ใช่ grep แค่ค่า

เขียนใหม่เป็น allow-list ต่อค่า + fail-closed:

```ts
const VISIBLE: Record<string, string[]> = { ONLINE_SALES: [...], SERVICE_QUEUE: [...], LODGING: [...] }
const visible = VISIBLE[vertical] ?? VISIBLE.ONLINE_SALES   // ค่าที่ 4 ตกไปทางปลอดภัยเอง
```

ดู `src/lib/seller-menu.ts` เป็นตัวอย่างที่ทำถูก และ `docs/conventions/` ที่เกี่ยวข้อง: การ enumerate ค่าจากฐานจริงก่อนเขียนเงื่อนไข

---

## 4. ตั้งชื่อไทยของค่าใหม่ — ต้อง grep ว่าคำนั้นถูกใช้เป็น label อยู่ก่อนไหม

```bash
rg -n "ชื่อไทยที่จะใช้" src/ --type tsx --type ts
```

**ทำไม:** ชื่อที่ชนกับ label ที่มีอยู่แล้วจะสร้าง "คำเดียวกันสองความหมาย" บนหน้าจอเดียวกัน

เคสจริง (00028): `SERVICE_QUEUE` ถูกตั้งชื่อว่า **"สินค้าและบริการ"** ซึ่งเป็น label แท็บสินค้าบน public profile อยู่ก่อนแล้ว → ร้านที่เลือกประเภทนี้จะเห็นแท็บ `บริการ` กับ `สินค้าและบริการ` เคียงกัน ต้องตามเปลี่ยน label แท็บเป็น "สินค้า" ทีหลัง

การตั้งชื่อไม่ใช่งาน product ล้วน ๆ — ตรวจตอนเขียน PRD ถูกกว่าตามแก้ตอน implement มาก

---

## 5. กันที่ระดับ DB ด้วย CHECK constraint

```sql
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_vertical_check"
    CHECK ("vertical" IN ('ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING')) NOT VALID;
ALTER TABLE "Shop" VALIDATE CONSTRAINT "Shop_vertical_check";
```

`NOT VALID` แล้ว `VALIDATE` แยกคำสั่ง เพื่อไม่ให้ล็อกตารางยาวตอน migrate

🛑 **Prisma DSL ประกาศ CHECK ไม่ได้ → เป็น unmanaged SQL → ห้าม `prisma db pull`** เด็ดขาด เพราะจะทับ schema แล้ว constraint หายไปเงียบ ๆ (constraint ที่มีอยู่แบบนี้ตอนนี้: `Shop_vertical_check`, `Shop_pinSlots_min1`, `Room_price_positive`, EXCLUDE ของ 00017)

---

## Checklist ก่อน merge

- [ ] `rg "'<VALUE>'" src/ e2e/ scripts/ prisma/ docs/` = 0 (เหลือได้แค่คอมเมนต์ที่อธิบายว่าค่านี้ถูกลบแล้ว)
- [ ] ขยาย type union ครบแล้วและ `tsc --noEmit` = 0 error
- [ ] grep ชื่อฟิลด์เอง (ไม่ใช่แค่ค่า) หาตรรกะ binary ที่ต้องกลายเป็น 3 ทาง
- [ ] ชื่อไทยของค่าใหม่ไม่ชนกับ user-facing label ที่มีอยู่
- [ ] CHECK constraint ที่ระดับ DB + บันทึกไว้ว่าเป็น unmanaged SQL
- [ ] migration ไม่ลบแถว: `UPDATE ... WHERE <field> = '<ค่าเก่า>'` เท่านั้น ห้าม unscoped
