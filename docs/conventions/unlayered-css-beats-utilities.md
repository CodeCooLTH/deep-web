# CSS ที่ไม่อยู่ใน `@layer` ชนะ utility ของ Tailwind เสมอ

> เกิดจริง 2026-08-09 (`93a65f87`) — user เจอเองบน prod

## อาการ

ปุ่มที่เขียนว่า `className="form-input flex w-full items-center justify-between gap-2"`
กลับวางลูกเป็น **inline** ไอคอนจึงตกไปบรรทัดที่สองทันทีที่ข้อความยาวขึ้น แล้วล้นออกนอกกรอบ
ที่ความสูงคงที่ — `items-center justify-between gap-2` ก็ไม่เคยทำงานเลยด้วย

## กลไก

- `src/assets/css/custom/_forms.css` **ไม่ได้ห่อด้วย `@layer`** → เป็น unlayered CSS
- utility ของ Tailwind v4 อยู่ใน `@layer utilities`
- ตามสเปก cascade layers: **unlayered styles ชนะ layered styles เสมอ ไม่ว่า specificity จะเป็น
  อย่างไร** → `.form-input { display: block }` ทับ `.flex { display: flex }` ทุกครั้ง

## กติกา

🛑 **จะเปลี่ยน `display` (หรือ property ใด ๆ ที่ `.form-input`/`.form-select` ตั้งไว้แล้ว) บน
element ที่ใส่คลาสเหล่านั้น ต้องใช้ important suffix ของ Tailwind v4:**

```tsx
// ❌ ไม่ทำงาน — .form-input (unlayered) ทับทิ้ง
className="form-input flex items-center justify-between"

// ✅
className="form-input flex! items-center justify-between"
```

property ที่ `.form-input` ตั้งไว้และมักถูกพยายามทับ: `display: block`, `height` (`h-11 lg:h-9.25`),
`width: 100%`, `border-radius`, `font-size`, `padding-block: 0`

## กับดักที่พ่วงมา: `lg:` ใน `_forms.css` เป็น **viewport** query

`.form-input` = `h-11 lg:h-9.25` → 44px บนมือถือ / **37px ตั้งแต่ 1024px ขึ้นไป**

ชีต/แผงที่เรนเดอร์ในกล่องแคบบนจอกว้าง (เช่น `AppointmentDateSheet` ในรางแชท 384px บนวิวพอร์ต
~1400px) จะได้ช่อง **37px ทั้งที่นิ้วมีที่ให้แตะเท่ามือถือเป๊ะ** ซึ่งต่ำกว่าเกณฑ์ 44px ที่
PRODUCT.md ประกาศไว้ — เติม `min-h-11` ทับเมื่ออยู่ในบริบทแบบนี้

คลาสเดียวกับกับดัก `.btn.btn-icon = size-9.25` (37px) ที่ต้องทับด้วย `min-h-11 min-w-11`

## ทำไมถึงเพิ่งเจอ

บั๊กนี้อยู่มานานแล้ว แต่เพิ่งชัดเมื่อ flow ใหม่ทำให้ **ข้อความยาวขึ้นเป็นปกติ**
(เดิมยาวแบบนั้นเฉพาะตอนผู้ขายกรอกครบเองซึ่งเกิดไม่บ่อย)

> **บทเรียนทั่วไป:** ฟีเจอร์ที่ทำให้ค่าที่แสดง "ยาวขึ้น/ครบขึ้นเป็นปกติ" ต้องไล่ดู element ที่
> ความกว้าง/ความสูงคงที่ซึ่งเคยรอดมาได้เพราะเนื้อหาสั้น — งานใหม่ไม่ได้สร้างบั๊ก แต่ปลุกบั๊กที่หลับอยู่

## เกี่ยวข้อง

- `docs/conventions/flex-header-truncation.md` — flex ตัดสิน wrap จากขนาดเนื้อหาเต็มก่อนหด
- memory `feedback_paces_forms_css_gotchas` — `_forms.css` ไม่ห่อ `@layer` + ห้ามแทรก element ใน `.input-icon-group`
