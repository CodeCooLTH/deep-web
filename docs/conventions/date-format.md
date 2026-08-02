# กฎการแสดงวันที่/เวลา (Date & Time Format) — ทั้งระบบ

> **SSOT** ของการ format วันที่/เวลาทุกหน้า ทุก subdomain (buyer/seller/admin) ทุกธีม (Vuexy/Paces).
> สร้าง 2026-06-16 ตามคำสั่ง: "format วันที่ทั้งระบบ ใช้เหมือนกัน".

## รูปแบบมาตรฐาน (เดียวเท่านั้น)

| ฟังก์ชัน | ผลลัพธ์ | ใช้เมื่อ |
|---|---|---|
| `formatDateTime(d)` | `2569-06-07 10:06:13` | ต้องการวันที่ + เวลา (รายการ/รายละเอียดที่เวลามีความหมาย: ออเดอร์, รีวิว, ธุรกรรม, log) |
| `formatDate(d)` | `2569-06-07` | ต้องการวันที่ล้วน (เช่น "เปิดร้านเมื่อ", วันสมัคร, วันรีวิวแบบย่อ) |
| `formatTime(d)` | `10:06:13` | เวลาล้วน — **เฉพาะ** context ที่มีวันที่แยกแสดงอยู่แล้ว เช่น นาฬิกา live (ห้ามใช้แทน `formatDateTime` ในการแสดง timestamp ของ record) |
| `formatDateTH(d)` | `01 ส.ค. 2569` | วันที่แบบอ่านง่าย (เดือนเป็นตัวอักษร) — ใช้กับ **หัวข้อ/ป้ายที่คนอ่านเป็นภาษา** ไม่ใช่ตารางข้อมูล เช่น หัวกลุ่มวันในรายการ, วันเข้าพัก, วันนัดหมาย |
| `formatDateTimeTH(d)` | `01 ส.ค. 2569 19:30` | เหมือน `formatDateTH` แต่มีเวลา |
| `formatTimeHM(d)` | `19:30` | เวลาแบบไม่มีวินาที — บริบทที่วินาทีไม่มีความหมาย (นัดหมาย/รอบเวลา) |
| `formatMonthYearTH(d)` | `ส.ค. 2569` | เดือน+ปี — หัวรายงานรายเดือน |

> **เพิ่ม 2026-08-02:** ตระกูล `*TH` (เดือนเป็นตัวอักษร) ถูกเพิ่มเข้ามา 2026-07-04 พร้อมงาน buyer
> แต่ **ไม่ได้จำกัดเฉพาะ buyer** — ใช้ในฝั่ง seller `(paces)` อยู่แล้วจริงหลายจุด (bookings ที่อยู่บน
> prod, ปฏิทินนัดหมาย, แชท, ตะกร้า POS, หัวกลุ่มวันในรายการค่าใช้จ่าย)
> **เกณฑ์เลือก:** ตัวเลข ISO (`formatDate`/`formatDateTime`) สำหรับ **ตาราง/ข้อมูลที่ต้องเรียงหรือเทียบ**;
> ตระกูล `*TH` สำหรับ **ข้อความที่คนอ่านเป็นประโยค** (หัวข้อ ป้าย คำบรรยาย)
> ห้ามใช้สองตระกูลปนกันในหน้าเดียวกันสำหรับข้อมูลชนิดเดียวกัน

> **นโยบาย default (2026-06-16, ตาม user):** ใช้ `formatDateTime` (วันที่+เวลา) เป็นค่าเริ่มต้น **ทุกจุด**ที่แสดง timestamp. ใช้ `formatDate` (วันที่ล้วน) **เฉพาะจุดที่ตัดสินใจลดเป็นวันที่ล้วนโดยเจตนา** เท่านั้น (ปัจจุบัน: sales chart แบบ daily-aggregate ที่เวลาเป็น artifact, และ UserCard greeting ที่แยกแสดงเวลาด้วยนาฬิกา live อยู่แล้ว). เพิ่มจุดที่จะลด → user แจ้งเป็นจุด ๆ

รายละเอียดรูปแบบ:
- **ปี = พ.ศ.** (ค.ศ. + 543)
- `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss` — **เติม 0 นำหน้า 2 หลัก** ทั้งเดือน/วัน/ชม./นาที/วินาที
- เลข **ASCII** (ปฏิทินสากล) ไม่ใช่เลขไทย, ไม่ใช้ชื่อเดือนไทย
- **24 ชั่วโมง** (00–23)
- format ใน **timezone ไทย (Asia/Bangkok)** เสมอ — แม้ server เป็น UTC ก็ได้เวลาไทยตรง
- ค่าไม่ valid / null → `—`

## 🛑 กฎ

1. **ห้าม format วันที่เองทุกกรณี** — ห้ามเรียก `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString` (กับ Date) / `Intl.DateTimeFormat` / ต่อ string `getFullYear()+543` เองในไฟล์ component/page/view ใด ๆ
2. **ใช้ `src/lib/format-date.ts` เท่านั้น** — `import { formatDate, formatDateTime } from '@/lib/format-date'`
3. ใช้ได้ทั้ง **RSC และ client** (pure module ไม่มี import)
4. ข้อยกเว้น (ไม่ใช่ "การแสดงวันที่ให้ผู้ใช้") — ไม่อยู่ใต้กฎนี้:
   - `toLocaleString` ที่ใช้ format **ตัวเลข/เงิน** (เช่น `amount.toLocaleString('th-TH')`) — คนละเรื่อง
   - คีย์ภายใน/grouping/ค่า input ของ date-picker, การคำนวณช่วงเวลา (`getFullYear()` ใน logic ไม่ใช่การแสดงผล)

## Reviewer grep gate

ก่อน merge ต้องคืน **0** (ยกเว้น `src/lib/format-date.ts` เอง):

```bash
rg -n "toLocaleDateString|toLocaleTimeString|Intl\.DateTimeFormat" src/ --glob '!src/lib/format-date.ts'
# toLocaleString กับ Date (ตรวจมือ — แยกจาก number formatting):
rg -n "Date\([^)]*\)\.toLocaleString" src/
```

## ตัวอย่าง

```tsx
import { formatDate, formatDateTime } from '@/lib/format-date'

// วันที่ + เวลา
<span>{formatDateTime(order.createdAtISO)}</span>   // 2569-06-07 10:06:13

// วันที่ล้วน
<p>เปิดร้านเมื่อ {formatDate(shop.createdAt)}</p>     // เปิดร้านเมื่อ 2569-06-07
```
