# กฎการแสดงวันที่/เวลา (Date & Time Format) — ทั้งระบบ

> **SSOT** ของการ format วันที่/เวลาทุกหน้า ทุก subdomain (buyer/seller/admin) ทุกธีม (Vuexy/Paces).
> สร้าง 2026-06-16 ตามคำสั่ง: "format วันที่ทั้งระบบ ใช้เหมือนกัน".

## รูปแบบมาตรฐาน (เดียวเท่านั้น)

| ฟังก์ชัน | ผลลัพธ์ | ใช้เมื่อ |
|---|---|---|
| `formatDateTime(d)` | `07-06-2569 10:06:13` | ต้องการวันที่ + เวลา (รายการ/รายละเอียดที่เวลามีความหมาย: ออเดอร์, รีวิว, ธุรกรรม, log) |
| `formatDate(d)` | `07-06-2569` | ต้องการวันที่ล้วน (เช่น "เปิดร้านเมื่อ", วันสมัคร, วันรีวิวแบบย่อ) |
| `formatTime(d)` | `10:06:13` | เวลาล้วน — **เฉพาะ** context ที่มีวันที่แยกแสดงอยู่แล้ว เช่น นาฬิกา live (ห้ามใช้แทน `formatDateTime` ในการแสดง timestamp ของ record) |
| `formatDateTH(d)` | `01 ส.ค. 2569` | วันที่แบบอ่านง่าย (เดือนเป็นตัวอักษร) — ใช้กับ **หัวข้อ/ป้ายที่คนอ่านเป็นภาษา** ไม่ใช่ตารางข้อมูล เช่น หัวกลุ่มวันในรายการ, วันเข้าพัก, วันนัดหมาย |
| `formatDateTimeTH(d)` | `01 ส.ค. 2569 19:30` | เหมือน `formatDateTH` แต่มีเวลา |
| `formatTimeHM(d)` | `19:30` | เวลาแบบไม่มีวินาที — บริบทที่วินาทีไม่มีความหมาย (นัดหมาย/รอบเวลา) |
| `formatMonthYearTH(d)` | `ส.ค. 2569` | เดือน+ปี — หัวรายงานรายเดือน |
| `formatDayMonth(d)` | `07-06` | วัน-เดือน ไม่มีปี — **ป้ายแกนกราฟรายวัน** เท่านั้น (ปีอยู่ที่หัวการ์ด, tooltip ใช้ `formatDate`) |
| `formatDateStampBE(d)` | `25690607` | **ชื่อไฟล์**ที่ต้องเรียงตามวันได้ — ห้ามใช้แสดงผล |
| `formatYearTH(d)` | `2569` | ปี พ.ศ. ของเวลาหนึ่ง ตัดด้วย timezone ไทย (เช่น © ท้ายหน้า) — **ห้าม** `new Date().getFullYear() + 543` |
| `toBuddhistYear(y)` | `2569` | แปลงปี ค.ศ. ที่ถือเป็นตัวเลขอยู่แล้ว (state ตัวเลือกเดือน/ปี, เกณฑ์เหรียญ) |
| `thaiDayKey(d)` | `2026-09-01` | **คีย์ภายใน** (จัดกลุ่ม/ค่า input/query) ตามวันไทย — ห้ามโชว์ผู้ใช้ · `.slice(0, 7)` = คีย์เดือน |

**ตารางคำที่ export จากตัวกลาง (เพิ่ม 2026-09-30)** — ห้ามประกาศซ้ำในไฟล์อื่น:
`THAI_MONTHS_ABBR` (ม.ค.…) · `THAI_MONTHS_FULL` (มกราคม…) · `WEEKDAY_SHORT_TH` (อา…) · `WEEKDAY_TH` (อาทิตย์…)
เวลาสัมพัทธ์ ("2 นาทีที่แล้ว") ใช้ `relativeTimeTh` จาก `src/lib/relative-time-th.ts` ที่เดียว

> **เพิ่ม 2026-08-02:** ตระกูล `*TH` (เดือนเป็นตัวอักษร) ถูกเพิ่มเข้ามา 2026-07-04 พร้อมงาน buyer
> แต่ **ไม่ได้จำกัดเฉพาะ buyer** — ใช้ในฝั่ง seller `(paces)` อยู่แล้วจริงหลายจุด (bookings ที่อยู่บน
> prod, ปฏิทินนัดหมาย, แชท, ตะกร้า POS, หัวกลุ่มวันในรายการค่าใช้จ่าย)
> **เกณฑ์เลือก:** ตัวเลข (`formatDate`/`formatDateTime`) สำหรับ **ตาราง/ข้อมูลที่ต้องเรียงหรือเทียบ**;
> ตระกูล `*TH` สำหรับ **ข้อความที่คนอ่านเป็นประโยค** (หัวข้อ ป้าย คำบรรยาย)
> ห้ามใช้สองตระกูลปนกันในหน้าเดียวกันสำหรับข้อมูลชนิดเดียวกัน

> **นโยบาย default (2026-06-16, ตาม user):** ใช้ `formatDateTime` (วันที่+เวลา) เป็นค่าเริ่มต้น **ทุกจุด**ที่แสดง timestamp. ใช้ `formatDate` (วันที่ล้วน) **เฉพาะจุดที่ตัดสินใจลดเป็นวันที่ล้วนโดยเจตนา** เท่านั้น (ปัจจุบัน: sales chart แบบ daily-aggregate ที่เวลาเป็น artifact, และ UserCard greeting ที่แยกแสดงเวลาด้วยนาฬิกา live อยู่แล้ว). เพิ่มจุดที่จะลด → user แจ้งเป็นจุด ๆ

รายละเอียดรูปแบบ:
- **เรียง วัน-เดือน-ปี** — `DD-MM-YYYY` / `DD-MM-YYYY HH:mm:ss` (user สั่ง 2026-10-01: "ต้องเรียงแบบนี้หมด วัน-เดือน-ปี = 02-09-2569"; เดิมเป็น ปี-เดือน-วัน)
- **ปี = พ.ศ.** (ค.ศ. + 543)
- **เติม 0 นำหน้า 2 หลัก** ทั้งเดือน/วัน/ชม./นาที/วินาที
- เลข **ASCII** (ปฏิทินสากล) ไม่ใช่เลขไทย, ไม่ใช้ชื่อเดือนไทย
- **24 ชั่วโมง** (00–23)
- format ใน **timezone ไทย (Asia/Bangkok)** เสมอ — แม้ server เป็น UTC ก็ได้เวลาไทยตรง
- ค่าไม่ valid / null → `—`

## 🛑 รูปแบบ วัน-เดือน-ปี เรียงเป็นสตริงไม่ได้ (2026-10-01)

`"01-10-2569" < "30-09-2569"` เมื่อเทียบเป็นข้อความ ⇒ **ห้ามเรียง/เทียบ/ใช้เป็นคีย์ด้วยข้อความที่ได้จากตัวกลาง**
- ตาราง TanStack: ให้ accessor เก็บค่าดิบ (ISO/`thaiDayKey`) แล้วจัดรูปใน `cell` หรือใส่ `sortingFn` เทียบค่าดิบ
  (ตัวอย่าง: `SalesTable` คอลัมน์วันที่ · `InventoryManagementTable` คอลัมน์อัปเดตล่าสุด)
- ชื่อไฟล์: `formatDateStampBE` (ปีนำหน้า) ไม่ใช่ `formatDate(...).replace(/-/g, '')`
- เทียบ "วันเดียวกันไหม" ด้วยความเท่ากันของ `formatDate` ยังใช้ได้ (ไม่ได้เรียงลำดับ) แต่ `thaiDayKey`/`isSameBangkokDay` ชัดกว่า

## 🛑 กฎ

1. **ห้าม format วันที่เองทุกกรณี** — ห้ามเรียก `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString` (กับ Date) / `Intl.DateTimeFormat` / ต่อ string `getFullYear()+543` เองในไฟล์ component/page/view ใด ๆ
2. **ใช้ `src/lib/format-date.ts` เท่านั้น** — `import { formatDate, formatDateTime } from '@/lib/format-date'`
3. ใช้ได้ทั้ง **RSC และ client** (pure module ไม่มี import)
4. ข้อยกเว้น (ไม่ใช่ "การแสดงวันที่ให้ผู้ใช้") — ไม่อยู่ใต้กฎนี้:
   - `toLocaleString` ที่ใช้ format **ตัวเลข/เงิน** (เช่น `amount.toLocaleString('th-TH')`) — คนละเรื่อง
   - คีย์ภายใน/grouping/ค่า input ของ date-picker, การคำนวณช่วงเวลา (`getFullYear()` ใน logic ไม่ใช่การแสดงผล)

## ด่านอัตโนมัติ (2026-09-30)

`src/lib/__tests__/date-format-single-source.test.ts` (`[blocker]`) สแกนทั้ง `src/` หลังตัดคอมเมนต์ — แดงเมื่อเจอ:
`toLocaleDateString`/`toLocaleTimeString`/`Intl.DateTimeFormat` · `toLocaleString` ที่มีตัวเลือกวันเวลา · `+ 543` ·
ตารางชื่อเดือน/ชื่อวันไทย · `function relativeTimeTh` ซ้ำ · `date-fns` นอกรายชื่อที่ลงทะเบียน
(ยกเว้นที่ลงทะเบียนพร้อมเหตุผลในไฟล์เทส: `order-search-sql.ts` = นิพจน์ SQL · `RecentActivityFeed.tsx` = สลับภาษา th/en)

**ทำไมต้องมี:** กฎข้อนี้เขียนไว้ตั้งแต่ 2026-06-16 แต่ด่านเป็น grep ให้ reviewer รันเอง — วันที่ 2026-09-30 สแกนเจอ
ของที่เขียนเองนอกตัวกลาง 25 จุดใน 20 ไฟล์ ในนั้นมีบั๊ก timezone จริง 2 ตัว (ยอดรายเดือนบนหน้าหลักร้านตัดเดือนด้วย
`getMonth()` ของ server UTC · ช่วงวันที่ที่เลือกเองในแท็บค่าใช้จ่ายเลื่อนไป 1 วันจาก `toISOString()`)

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
<span>{formatDateTime(order.createdAtISO)}</span>   // 07-06-2569 10:06:13

// วันที่ล้วน
<p>เปิดร้านเมื่อ {formatDate(shop.createdAt)}</p>     // เปิดร้านเมื่อ 07-06-2569
```
