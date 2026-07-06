# Order Card Redesign — หน้าออเดอร์ (Seller · Paces)

- **วันที่:** 2026-07-06
- **Scope:** การ์ดออเดอร์ในหน้า `/orders` (seller) — `OrderCard.tsx` + ปุ่ม action + QR sheet ใหม่
- **Mockup:** `2026-07-06-seller-order-card-redesign-design.html` (3 อุปกรณ์)
- **Theme:** Paces default skin (primary `#236dc9`)

---

## 1. ปัญหา (จาก user)

การ์ดออเดอร์ปัจจุบัน "ใช้ยาก":
1. **ข้อมูลรก อ่านลำบาก** — 4 บล็อกซ้อนกันคั่นด้วยเส้นประหลายเส้น + label ซ้ำซ้อน
2. **หา/แยกแยะออเดอร์ยาก** — `#ID` ตัวหนาใหญ่บนสุด (ช่วย scan น้อยสุด) แต่ชื่อลูกค้าเป็นตัวเทาแถวสอง
3. **ปุ่มกินที่** — `[คัดลอกลิงก์]` `[ส่ง SMS]` มี label เต็มแถว → การ์ดสูง

## 2. เป้าหมาย

- ลดความรก อ่านง่าย
- กวาดตาแยกออเดอร์ได้เร็ว (scan by: **ชื่อลูกค้า · ชื่อสินค้า · ยอดเงิน · สถานะ**)
- ปุ่ม action เป็น **icon-only** กระชับ
- เพิ่ม action **QR code** (คู่กับปุ่มคัดลอกลิงก์)

## 3. การเปลี่ยนแปลง (decisions ที่ล็อกกับ user)

| # | เดิม | ใหม่ |
|---|------|------|
| 1 | `#ID` หนาใหญ่บนสุดซ้าย | **ซ้าย = ชื่อลูกค้า(หนา)** · **ขวา = `#ID`(เทาเล็ก) + status badge** (stack) |
| 2 | บรรทัดใต้ชื่อ = เบอร์โทร | **บรรทัดใต้ชื่อ = ช่องทางการขาย(โลโก้สี+label) · วิธีชำระ(icon+label)** — เอาเบอร์โทรออกจากหน้าการ์ด (ยังกดโทรได้ในหน้า detail) |
| 3 | channel icon ลอยข้างชื่อ / บน avatar | ใช้ **โลโก้แบรนด์สีจริง self-host** ในบรรทัด meta (ไม่ใช่ badge บนอวตารแล้ว) — FB/LINE/IG |
| 4 | ไม่มีตัวช่วยแยกด้วยสี | **แถบสีซ้ายการ์ด 4px** ตามสถานะ (PENDING=warning · SHIPPED=info · CONFIRMED=success · CANCELLED=gray) |
| 5 | `[คัดลอกลิงก์] [ส่ง SMS] [⋮]` มี label | **icon-only 4 ปุ่ม** `[SMS ทึบ] [QR] [copy] [⋮]` มุมขวาล่าง |
| 6 | — | **QR action ใหม่** → เปิด sheet/modal โชว์ QR + ลิงก์ + ปุ่มคัดลอก |
| 7 | payment อยู่ footer + label "สินค้า" ใต้ชื่อ + timestamp เต็ม | payment ย้ายขึ้นบรรทัด meta · **footer เหลือแค่ ฿ยอดรวม + เวลาย่อ** (`วันนี้ 16:07`) · ตัด label ประเภทสินค้า |

**คงไว้:** รูป+ชื่อ+จำนวน+ราคาสินค้า, expand หลายรายการ, PII mask เดิม.
**ย้ายไป detail:** เบอร์โทรลูกค้า (ไม่โชว์บนหน้าการ์ดแล้ว — tap-to-call อยู่ในหน้า order detail).

> **หมายเหตุ channel logo (self-host):** ของเดิมใช้ `tabler:brand-*` (monochrome, on-demand). เปลี่ยนเป็น **โลโก้แบรนด์สีจริง เก็บไฟล์ไว้เองในโปรเจกต์** `src/assets/images/logos/` — ไม่พึ่ง CDN/on-demand:
> - `facebook.svg` (จาก iconify `logos:facebook`), `instagram.svg` (มีอยู่แล้ว — icons8 gradient), `line.svg` (hand-composed: สี่เหลี่ยมมนเขียว #06C755 + LINE glyph จาก `simple-icons:line`)
> - render เป็น `<img>` ใน badge วงกลม (white bg + object-fit:cover) ซ้อนมุมอวตาร
> - เข้าข่าย carve-out Hard Rule 12 (โลโก้แบรนด์ = asset จาก data ไม่ใช่ emoji)
>
> **⚠️ ประเด็นที่ต้องเคาะกับ user:** ช่องทางการขายจริงใน enum ปัจจุบัน = **STOREFRONT / FACEBOOK / LINE / TIKTOK / OTHER** — **ไม่มี Instagram** (มี TikTok แทน). ต้องตัดสินใจ:
> 1. เพิ่ม **Instagram** เป็นช่องทางใหม่ไหม (แตะ enum/data + backend)?
> 2. **TikTok** ต้องมีโลโก้ด้วย (ยังไม่ได้โหลด) + STOREFRONT/OTHER ใช้ icon อะไร?

## 4. QR sheet

- **มือถือ:** bottom-sheet เลื่อนขึ้นจากล่าง (pattern เดียวกับ `SalesChartSheet.tsx` / `AccountSwitcherSheet.tsx`)
- **desktop:** modal กลางจอ
- **เนื้อหา:** หัวข้อ "QR สำหรับลูกค้า" → รูป QR → เลขออเดอร์+ชื่อ+ยอด → แถบลิงก์ + ปุ่มคัดลอก
- **QR เข้ารหัส:** ลิงก์ buyer `/o/{shortCode}` (URL เดียวกับปุ่มคัดลอกลิงก์)

## 5. Responsive

- การ์ดแสดงบน **mobile + tablet** (`<lg` = <1200px)
- **desktop** (`≥lg`) = ตาราง `OrdersTable.tsx` → เพิ่มปุ่ม QR เข้า action group เดิม `[ดู][แก้ไข][SMS][QR][copy]`

## 6. Implementation notes

- ไฟล์หลัก: `OrderCard.tsx`, `OrderActions.tsx` (เพิ่มปุ่ม QR ทั้ง 2 variant)
- Component ใหม่: `QrCodeButton.tsx` + `OrderQrSheet.tsx` (bottom-sheet/modal)
- Lib ใหม่: `qrcode.react` (ยังไม่มีในโปรเจกต์)
- Hard Rule 7: แถบสีซ้าย + ปุ่ม icon + timestamp ย่อ = มี arbitrary บางจุด → เขียน comment กำกับ
- Hard Rule 9: toast ใช้ `pacesToast`; Hard Rule 3: commit ต้องมี `Base:` line
- ปุ่ม SMS ยังซ่อนบน terminal order (สำเร็จ/ยกเลิก) เหมือนเดิม; QR/copy แสดงทุกสถานะ

## 7. Out of scope

- ไม่แตะ backend / data model / API (ใช้ `order.shortCode`/`publicToken` เดิม)
- ไม่แตะ logic filter/search/lazy-load ใน `OrdersList.tsx`
- ย่อวันที่: ใช้ helper ที่มีอยู่หรือเพิ่ม format สั้น (ยึด `format-date.ts`, พ.ศ., tz ไทย)
