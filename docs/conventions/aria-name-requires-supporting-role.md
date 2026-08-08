# `aria-label` ใช้ได้เฉพาะกับ role ที่รองรับ — ไม่งั้นเงียบสนิท

> **ที่มา:** impeccable audit 2026-08-08 บนโฟลเดอร์ `src/app/(paces)/seller/(dashboard)/orders/`
> เจอในโค้ดที่เพิ่งเขียนเองในรอบเดียวกัน (`OrderProfitInline`) + อีก 8 จุดที่มีมาก่อนแล้ว
> **ไม่มี gate ไหนของโปรเจกต์จับคลาสนี้ได้เลย** — `tsc`/`build`/detector/`theme-guard` ผ่านหมด
> เพราะ markup ถูกต้องทุกตัวอักษร มันแค่ไม่ทำงาน

---

## กฎ

**`aria-label` / `aria-labelledby` มีผลเฉพาะกับ element ที่ role ของมันรองรับ "ชื่อจากผู้เขียน" (accessible name from author)**

| element | role ปริยาย | รับ `aria-label` ไหม |
|---|---|---|
| `<button>` `<a href>` `<input>` `<img>` | button / link / textbox / img | ✅ |
| `<div role="dialog">` `<div role="img">` `<div role="group">` | ตามที่ประกาศ | ✅ |
| **`<p>`** | paragraph | ❌ **ถูกทิ้ง** |
| **`<div>` / `<span>` เปล่า** | generic | ❌ **ถูกทิ้ง** |

พฤติกรรมของ screen reader ที่ทำตามสเปกคือ **ทิ้ง label แล้วไปอ่านเนื้อในแทน**

---

## 🛑 กับดัก: ทำแล้ว "แย่กว่าไม่ทำ"

แพตเทิร์นที่ดูรอบคอบแต่พังเงียบ — ใส่ label ที่พ่อ แล้ว `aria-hidden` ลูกทุกตัวกันอ่านซ้ำ:

```tsx
// ❌ ผู้ใช้ screen reader ไม่ได้ยินอะไรเลยสักคำ
<p aria-label="กำไรขั้นต้นจากใบนี้ ฿150 · ยังไม่หักค่าใช้จ่ายร้าน">
  <Icon icon="trending-up" aria-hidden="true" />
  <span aria-hidden="true">฿150</span>
</p>
```

พอ `aria-label` ถูกทิ้ง เนื้อในก็ซ่อนไว้หมด → element นี้ **ไม่มีทั้งชื่อและเนื้อหา** = หายไปจาก accessibility tree ทั้งก้อน

**ผลลัพธ์ไม่ใช่ "อ่านได้ไม่ครบ" แต่คือ "ไม่ถูกอ่านเลย"** — ถ้าไม่ใส่ `aria-hidden` ตั้งแต่แรก อย่างน้อยยังได้ยิน "150"

```tsx
// ✅ ประกาศ role ที่รองรับชื่อ — ทั้งก้อนถูกอ่านเป็นหน่วยเดียว
<p
  role="img"
  aria-label="กำไรขั้นต้นจากใบนี้ ฿150 · ยังไม่หักค่าใช้จ่ายร้าน"
>
  <Icon icon="trending-up" aria-hidden="true" />
  <span aria-hidden="true">฿150</span>
</p>
```

`role="img"` เหมาะกับกลุ่ม icon+ตัวเลข/กราฟิกย่อที่ต้องการให้อ่านเป็นประโยคเดียว —
ทรงนี้มีใช้อยู่แล้วใน `src/app/(paces)/seller/(dashboard)/orders/components/MiniShipmentTimeline.tsx`
**อ่านไฟล์พี่น้องในโฟลเดอร์เดียวกันก่อนเขียนก็จะไม่พลาด** (`sibling-surface-parity.md`)

---

## `title=` ไม่ใช่ตัวแทนของ `aria-label`

- `title` โผล่เฉพาะตอน **hover ด้วยเมาส์** — มือถือไม่มี hover จึงไม่มีทางเห็นเลย
- screen reader บางตัวอ่าน `title` บางตัวไม่อ่าน ขึ้นกับ role และการตั้งค่า

**ต้องมีคู่กันเสมอ ไม่ใช่เลือกอย่างใดอย่างหนึ่ง** — `title` เป็นของแถมสำหรับคนมีเมาส์

---

## ญาติสนิท: `role="dialog"` ต้องมี `aria-modal="true"`

โมดัล/ชีตที่ประกาศ `role="dialog"` แต่ไม่มี `aria-modal="true"` → AT ไม่รู้ว่าต้องกักผู้ใช้ไว้ในแผง
ผู้ใช้จะอ่านเลยขอบแผงออกไปเจอเนื้อหาหลังฉากที่มองไม่เห็นและกดไม่ได้ **โดยไม่มีอะไรบอกว่าออกมาแล้ว**

โฟลเดอร์ `orders/` พลาดข้อนี้พร้อมกัน **8 ใบ** (ปิดใน `780322d8`) ทั้งที่โมดัลตัวกรองใน
`OrdersList.tsx` ทำถูกมาตลอด — อยู่โฟลเดอร์เดียวกันแท้ ๆ

### ข้อยกเว้นที่ต้องไม่ใส่

**popover / dropdown ที่เกาะปุ่มและหน้าหลังยังกดได้จริง** — นั่นคือ *non-modal dialog*
การติด `aria-modal="true"` ให้มันคือการโกหก AT (`PasteParsePanel.tsx` เป็นเคสนี้ ตั้งใจไม่ใส่)

เกณฑ์ตัดสิน: ดูว่ามันมี `fixed inset-0` เต็มจอ หรือฉากทึบ (`bg-dark/40`) ไหม —
**ไม่ใช่ดูจากชื่อไฟล์ว่าลงท้ายด้วย `Modal`/`Sheet`**

---

## วิธีสแกนทั้งโฟลเดอร์

```bash
# 1) role="dialog" ที่ไม่มี aria-modal (ต้องดูทั้ง tag ไม่ใช่บรรทัดเดียว — JSX ขึ้นบรรทัดใหม่ได้)
node -e '
const fs=require("fs"),path=require("path");
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const f of walk(process.argv[1]).filter(f=>/\.tsx$/.test(f))){
  const src=fs.readFileSync(f,"utf8"); const re=/role=["{]?.?dialog/g; let m;
  while((m=re.exec(src))){
    const tag=src.slice(src.lastIndexOf("<",m.index), src.indexOf(">",m.index)+1);
    if(!/aria-modal/.test(tag)) console.log(f+":"+src.slice(0,m.index).split("\n").length);
  }
}' "src/app/(paces)/"

# 2) aria-label บน element ที่ไม่รองรับ (ต้องดูด้วยตาต่อ — บางตัวมี role ประกาศไว้ถูกแล้ว)
rg -n '<(p|div|span)\b[^>]*aria-label' "src/app/(paces)/"
```

🛑 **สคริปต์สแกนแบบ regex เชื่อผลดิบไม่ได้ ต้องเปิดไฟล์ยืนยันทุกจุด** — รอบ 2026-08-08 สคริปต์
รายงาน `<img>` ไม่มี `alt` 2 จุด และ `<input>` ไม่มีชื่อ 2 จุด **เป็น false positive ทั้งหมด**
(ตัวแรกตัด tag ผิดเพราะมีคอมเมนต์ JSX คั่นกลาง ตัวหลังไปนับ `<input` ที่ถูกอ้างถึงในคอมเมนต์หัวไฟล์)

---

## เกี่ยวข้อง

- `docs/conventions/sibling-surface-parity.md` — อ่านหน้าพี่น้องก่อนเขียน
- `docs/conventions/contrast-fix-keeps-hue.md` — a11y อีกคลาสที่ gate มองไม่เห็น
- memory `feedback_aria_label_needs_supporting_role`
