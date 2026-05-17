# Convention: Reference ≠ Theme Source — ของที่ user ส่งมาต้อง "ปรับเข้า theme" ไม่ใช่ "copy ตรง ๆ"

> เกิดจาก feedback 2026-05-17: เอา pixel-art SVG จาก design set ที่ user ส่งมา
> bundle เป็นรูป badge ตรง ๆ → หลุดจาก theme Vuexy/Paces, ไม่กลมกลืนกับ surface
> อื่น user reject. เป็น pattern ผิดที่เกิดซ้ำเวลามี reference ภายนอกเข้ามา.

## กฎ

มี **2 ประเภทของ "ของอ้างอิง"** ที่ปฏิบัติตรงข้ามกันโดยตั้งใจ:

| ประเภท | ตัวอย่าง | วิธีปฏิบัติ |
|---|---|---|
| **Theme source ของโปรเจกต์** | `theme/vuexy/...`, `theme/paces/...` | **copy โครงใกล้ชิด** — Hard Rule 1/3 (ห้าม compose เอง, ต้องมี `Base:` line) |
| **Reference ภายนอกที่ user ส่ง** | asset, ภาพดีไซน์, mockup, โค้ดตัวอย่าง, ลิงก์, design set | **adapt ให้เข้า theme/layout ปัจจุบัน** — ห้าม copy verbatim |

"Reference" จาก user = **ทิศทาง/ไอเดีย** ไม่ใช่ **ผลลัพธ์สุดท้ายที่จะแปะลงระบบ**.
หน้าที่คือกลั่นให้เข้า design system ที่มีอยู่ ให้ดูเป็นส่วนหนึ่งของระบบเดียวกัน
ไม่ใช่ของแปะที่ "ดูเป็นตัวอย่างเกินไป".

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
