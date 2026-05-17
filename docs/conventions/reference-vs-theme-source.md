# Convention: Reference ≠ Theme Source — ของที่ user ส่งมาต้อง "ปรับเข้า theme" ไม่ใช่ "copy ตรง ๆ"

> เกิดจาก feedback 2026-05-17: bundle pixel-art SVG จาก design set ที่ user ส่ง —
> **ตัวรูป pixel ใช้ตาม ref ถูกแล้ว** (user ยืนยันเอาตรง ๆ) แต่ **layout การวาง
> บน badge page/widget หลุด theme** (ขนาด/circle/grid ดูเป็น mockup ต่างถิ่น) →
> user reject ที่ "layout ไม่เข้าหน้าอื่น" ไม่ใช่ที่ตัวรูป.

## กฎ

เมื่อ user ส่ง reference (asset, ภาพดีไซน์, mockup, โค้ดตัวอย่าง, ลิงก์, design set)
ต้อง **แยก 2 ชั้น**:

| ชั้น | คือ | วิธีปฏิบัติ |
|---|---|---|
| **Asset / content** | ตัวรูป/ไฟล์/เนื้อหาที่ user ส่ง | **ใช้ตามที่ user ตั้งใจ** — default ห้าม redesign/ทิ้งเอง ถ้าไม่ได้ขอ |
| **Layout / integration** | card, grid, ขนาด, การจัดวาง, framing, สไตล์การวางบนหน้า | **ตาม theme/layout ปัจจุบันเสมอ** (โครงจาก `theme/vuexy/...`,`theme/paces/...` — Hard Rule 1/3) |

ความผิดที่ต้องเลี่ยง = เอา **layout/สไตล์การวาง** แบบ mockup ต่างถิ่นมาแปะจน
"ดูเป็นตัวอย่างเกินไป ไม่กลมกลืนกับหน้าอื่น". **ไม่ใช่** การใช้ตัว asset ตาม ref.

ห้ามแกว่งสุดอีกทาง: "adapt" ≠ ไป redesign หรือทิ้ง asset ที่ user ส่ง. ถ้าไม่ชัดว่า
ส่วนไหน "ตาม ref" ส่วนไหน "fit theme" → **ถาม user ก่อน build** (พลาดได้ 2 ทาง:
แปะ layout ดิบ หรือ redesign asset เขาทิ้ง).

## เช็คก่อนเริ่ม build เมื่อมี reference

1. ถามตัวเอง: **"ปรับให้เข้า theme/layout ปัจจุบันยังไง"** ไม่ใช่ "จะ copy เข้ามายังไง"
2. ถ้า reference ขัดกับ theme ปัจจุบันมาก (เช่น สไตล์ pixel vs design system flat/modern,
   ขนาดไฟล์ใหญ่ผิดปกติ, ฟอนต์/สีคนละชุด) → **ยกขึ้นถาม user ก่อน build**
   ("ปรับสไตล์ให้เข้า theme หรือยึด reference") อย่าเงียบแล้ว copy
3. spec/plan ที่อ้าง reference ต้องเขียนชัด: **"adapt to current theme"** ไม่ใช่ "use as-is".
   ห้ามใส่ assumption ว่าเอา asset มาแปะตรง ๆ ได้
4. asset ดิบ (รูป/ไฟล์) ที่ user ส่ง: ถ้าจะใช้จริงต้องผ่านการ re-style/re-export/แปลง
   ให้เข้า theme ก่อน ไม่ bundle ดิบ ๆ

## ความสัมพันธ์กับ Hard Rule 1/3 (theme-copy)

ไม่ขัดกัน — เสริมกัน:
- **Theme file โปรเจกต์**: เป็น source of truth ของ "โครง UI" → copy ใกล้ชิด
- **Reference user**: เป็นวัตถุดิบของ "เนื้อหา/ทิศทาง" → adapt ให้ไหลเข้าโครงจาก theme

เวลา build จาก reference: เอา **โครง/layout จาก theme file** + **ปรับเนื้อหา/ดีไซน์
ตามทิศทางของ reference ให้กลมกลืน** = ได้ทั้ง Base: line ที่ถูก + ผลที่เข้า theme

## บังคับใช้

- `safepay-reviewer` / `ui-theme-sourcing` gate: ถ้า output "ดูเหมือน reference ดิบ"
  / หลุด theme → REWORK
- planner/Controller: เวลารับ reference เข้ามาใน spec ต้องระบุ "adapt" ชัด + flag
  ความขัด theme ให้ user ตัดสินก่อน
