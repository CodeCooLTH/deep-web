# งานวิจัย: แพลตฟอร์มอื่นแสดง "ความน่าเชื่อถือของผู้ขาย" บนหน้าโปรไฟล์ร้านอย่างไร

> **วันที่:** 2026-08-08
> **บริบท:** ใช้ประกอบการออกแบบใหม่ของหน้า Public Profile ของ Deep — โดยเฉพาะ 3 เรื่อง: (A) การแสดงจำนวนคำสั่งซื้อ (B) อัตราความสำเร็จ/อัตราการยกเลิก และการยกเว้นความผิดที่ไม่ใช่ของผู้ขาย (C) ช่องทางโซเชียลที่ยืนยันแล้ว
> **วิธีเก็บข้อมูล:** WebSearch/WebFetch เท่านั้น — ไม่ได้เปิดหน้าร้านจริงในเบราว์เซอร์ (bot protection ทุกเจ้า)

---

## 0. ข้อค้นพบที่สำคัญที่สุด (ถ้าอ่านได้ย่อหน้าเดียว)

🛑 **ไม่มีแพลตฟอร์มใหญ่เจ้าไหนโชว์ "อัตราการยกเลิก / อัตราความสำเร็จ" เป็นเปอร์เซ็นต์ให้ผู้ซื้อเห็นบนหน้าโปรไฟล์เลยสักเจ้า**

Shopee · Lazada · TikTok Shop · eBay · Amazon · Etsy · Airbnb · Mercari · Carousell · Grab · LINE MAN — ทั้งหมดเก็บเมตริกกลุ่มนี้ไว้ **หลังบ้านผู้ขายเท่านั้น** และลงโทษผ่านทางอ้อม 4 ทาง: (1) กดอันดับค้นหา (2) จำกัดจำนวนออเดอร์ต่อวัน (3) ถอดป้าย (4) ปิดร้าน

สิ่งที่ผู้ซื้อเห็นจริงมีแค่ 4 กลุ่ม: **ดาว + จำนวนรีวิว · อัตราการตอบแชท · ป้าย · จำนวนขาย** — ทั้งหมดเป็นตัวเลข "ทำดีได้ดี" ไม่ใช่ตัวเลขลงโทษ

**ข้อยกเว้นเดียวคือ Upwork** (Job Success Score เป็น % บนโปรไฟล์) — และเป็นแพลตฟอร์มที่ผู้ใช้บ่นเรื่องคะแนนหนักที่สุดในกลุ่มที่สำรวจ

---

## 1. ตารางเทียบต่อแพลตฟอร์ม

### 1.1 อะไรที่ **ผู้ซื้อเห็น** บนหน้าโปรไฟล์/หน้าร้าน

| แพลตฟอร์ม | ตัวเลขคำสั่งซื้อ/ยอดขาย | เมตริกคุณภาพที่โชว์ | เมตริกลงโทษ (ยกเลิก/ส่งช้า/คืนของ) |
|---|---|---|---|
| **Shopee** | ❓ ไม่พบว่าโชว์ยอดออเดอร์รวมของร้าน · โชว์ "ขายแล้ว N ชิ้น" รายสินค้า (**ไม่พบหน้าทางการ**ที่ระบุรูปแบบการปัดเลข) | คะแนนร้าน (เฉลี่ยรีวิวสินค้าทั้งหมด) · **Chat Response Rate + First Response Time** · ป้าย ร้านค้าแนะนำ/Mall | 🔒 **ซ่อนหมด** |
| **Lazada** | ❌ ไม่โชว์ | Seller Rating % · Chat Response Rate · Ship-on-Time · ป้าย LazMall/LazPick | 🔒 ซ่อน — **แต่การยกเลิกที่เป็นความผิดร้านถูกยัดเข้าเป็น Negative Rating ในคะแนนที่โชว์อยู่แล้ว** |
| **TikTok Shop** | ❓ มี public Sold Count (บุคคลที่สาม) | คะแนนร้าน 0–5 · ป้าย TopChoice/Mall | 🔒 ซ่อน (แม้แต่ response rate ก็ซ่อน) |
| **eBay** | Feedback score (จำนวนสะสม) | % positive 12 เดือน · DSR 4 ด้าน (ต้องมี ≥10 DSR ดาวถึงขึ้น) | 🔒 ซ่อน |
| **Amazon** | จำนวน total ratings | **≥10 feedback ใน 12 ด. →** "XX% positive over the past 12 months (N total ratings)" · **<10 →** สลับไปใช้ lifetime | 🔒 ซ่อน (ODR/PFCR/LSR/VTR ผู้ซื้อไม่เห็นสักตัว) |
| **Etsy** | "N sales" (**ไม่พบหน้านโยบายรองรับ** — เห็นบนหน้าจริงเป็นปกติ) | ดาว + จำนวนรีวิว (**ค่าถ่วงน้ำหนักลดครึ่งทุกปี**) · ป้าย Star Seller **+ ป้ายรายเกณฑ์** (smooth dispatch / speedy replies / rave reviews) | 🔒 ซ่อน |
| **Airbnb** | จำนวนรีวิว · **จำนวนปีที่อยู่บน Airbnb** | ดาว · ป้าย Superhost · ป้าย Guest Favourite · "Identity verified" + เดือน/ปีที่ยืนยัน | 🔒 ซ่อน |
| **Upwork** | — | **Job Success Score เป็น %** · Rising Talent / Top Rated / Top Rated Plus | — |
| **Fiverr** | — | ดาว (all-time) · Level | 🔒 **Success Score 1–10 ผู้ซื้อไม่เห็น เห็นแค่ Level** |
| **Mercari** | ❓ **ไม่พบ**ว่าโชว์จำนวน transaction | ดาว (US) / 良かった-残念だった (JP) · ป้าย Member Since / Quick Shipper / **Reliable** / Fast Responder | 🔒 ซ่อน — **แปลงเป็นป้าย "Reliable"** แทน |
| **Carousell** | — | รีวิว 1–5 ดาว **แยก 3 หัวข้อ** · **Response Rate เป็น 3 ระดับ ไม่ใช่ %** · ป้าย Verified | 🔒 |
| **FB Marketplace** | — | ดาว (โชว์ต่อเมื่อมี **≥5 rating**) · "เข้าร่วม Facebook เมื่อ YYYY" · เพื่อนร่วมกัน · seller badges 5 ตัว | 🔒 |
| **Grab TH** | `Grab รีวิว: 3K+` | ดาวเต็ม 5 + จำนวนรีวิว · ป้าย #GrabThumbsUp | 🔒 ซ่อน (มี metric จริงใน Code of Conduct แต่ไม่เปิดตัวเลขและไม่โชว์ลูกค้า) |
| **LINE MAN TH** | ❓ ไม่พบว่าแสดงจำนวนบนแอป | ดาวเต็ม 5 (จากออเดอร์ LINE MAN เท่านั้น ไม่รวมรีวิว Wongnai) · ป้าย Users' Choice | 🔒 ซ่อน — **แม้ร้านจะเห็นเกณฑ์ตัวเองชัด (ยกเลิก/ปฏิเสธ <2%)** |

### 1.2 สูตร · ตัวหาร · sample ขั้นต่ำ · ข้อยกเว้น

| แพลตฟอร์ม | เมตริก | สูตร & **ตัวหาร** | หน้าต่างเวลา | เกณฑ์ | sample ขั้นต่ำ | ตัดอะไรออก |
|---|---|---|---|---|---|---|
| **Shopee** | **NFR** (Non-Fulfilment Rate) | (ยกเลิกโดยผู้ขาย + ยกเลิกอัตโนมัติ + คืนเงิน/คืนสินค้า) ÷ **ออเดอร์ทั้งหมด** | 🛑 **แหล่งขัดกัน**: บทความ TH ปัจจุบัน = **7 วัน** อัปเดตทุกวันจันทร์ · คอร์ส PDF ทางการ (ฉบับเก่า) = **30 วัน** | เกณฑ์ใน PDF: **10%** ถ้า <100 ออเดอร์ / **5%** ถ้า >100 · เกณฑ์บทความปัจจุบัน: NFR ≥10% = 1 คะแนน, **+≥30 ใบไม่สำเร็จ = 2 คะแนน**, ≥60% = 3–4 คะแนน | ❌ **ไม่มีประตูกันร้านเล็ก** — "≥30 ออเดอร์" เป็น **ตัวคูณโทษ** ไม่ใช่ประตูเข้า ร้าน 3 ออเดอร์ยกเลิก 1 = 33% โดนทันที | ผู้ซื้อยกเลิกเองผ่านระบบ = ไม่นับ · **อุทธรณ์ได้**: ขนส่งผิด / ระบบ Shopee ขัดข้อง / ภัยธรรมชาติ |
| **Shopee** | **CRR** (Chat Response Rate) | ตอบภายใน **12 ชม.** ÷ ข้อความที่ต้องตอบ | 30 วัน | **≥70%** ทั่วไป · **≥85%** Preferred · **≥95%** Mall | หักคะแนนเมื่อ CRR <60% **และ** ≥8 ข้อความที่ไม่ตอบ | — |
| **Shopee** | **ร้านค้าแนะนำ** (Preferred Seller) | — | รายเดือน | **≥100 ออเดอร์/เดือน และ ≥15 ผู้ซื้อไม่ซ้ำหน้า/เดือน** (บุคคลที่สาม) · FHR >80% (ตั้งแต่ 31 มี.ค. 2025) · **เชิญเท่านั้น** | — | ไม่นับออเดอร์ที่ยกเลิก/คืนใน 30 วัน |
| **Lazada** | Cancellation Rate | ชิ้นที่ยกเลิกจากความผิดผู้ขาย ÷ **ชิ้นที่ขาย (รายชิ้น ไม่ใช่รายออเดอร์)** | **Day N-7 ถึง N-35** (28 วัน โดย**ตัด 7 วันล่าสุดทิ้ง**) | >5% → จำกัดออเดอร์/วัน · LazMall ≤2% | **ไม่พบ** | ผู้ซื้อยกเลิกเอง = ไม่นับ (เว้นแต่ร้านขอให้กดแทน) |
| **Lazada** | Seller Rating | Positive ÷ Total ratings | 8 สัปดาห์ | — | ไม่พบ | 🛑 **การยกเลิกที่เป็น seller default สะสมเป็น Negative Rating** |
| **TikTok Shop** | **SFCR** (Seller-Fault Cancellation Rate) | ออเดอร์ที่ยกเลิกด้วยความผิดผู้ขาย ÷ **ออเดอร์ที่อยู่สถานะ "To Ship – Awaiting Shipment"** (ไม่ใช่ออเดอร์ทั้งหมด) | 7 วัน (TH) / 30 วัน (แดชบอร์ด) | **≤2.5%** · 10–30% → cap 90% + หัก 5 · 30–50% → cap 70% + หัก 10 · ≥50% → cap 50% | ❌ ไม่มี | 🛑 **allow-list 6 เหตุผลเท่านั้น**: ของหมด · ตั้งราคาผิด · ไม่มีใบรับรองของแท้ · auto-cancel เพราะไม่ใส่เลขพัสดุทัน SLA · เรียกคืนสินค้า · ปัญหาฉลาก/ค่าส่ง — **นอกจากนี้ไม่นับ** · ตัด creator sample + FBT ออกจากตัวเศษ |
| **TikTok Shop** | **LDR** (Late Dispatch Rate) | (ส่งล่าช้า + ยังไม่ส่ง) ÷ ออเดอร์ทั้งหมด | 7 วัน | **<4%** · ≥10% → หัก 5 คะแนน | ไม่มี | — |
| **TikTok Shop** | **NRR** (Negative Review Rate) | รีวิว 1–2 ดาว **ที่เกี่ยวกับสินค้า/บริการผู้ขาย** ÷ ออเดอร์ที่ส่งสำเร็จ | 30 วัน | ≤1% | — | ✅ **รีวิวลบที่เกิดจากโลจิสติกส์ ไม่นับ** |
| **TikTok Shop** | คะแนนร้าน | เฉลี่ยรีวิว 0–5 | — | — | ✅ **ซ่อนคะแนนจนกว่ามีออเดอร์สำเร็จ ≥30 ใบ** (🛑 หน้า TH ว่า 60 วัน / หน้า SG ว่า 90 วัน — **หน้าทางการสองหน้าขัดกัน**) | — |
| **eBay** | **Transaction defect rate** | ธุรกรรมที่มี defect ÷ ธุรกรรมทั้งหมด | ประเมิน**ทุกวันที่ 20** · **<400 ธุรกรรมใน 3 ด. → มองย้อน 12 เดือน** · ≥400 → 3 เดือน | ≤2% (Above Standard) · Top Rated **≤0.5% และ ≤3 defect จากผู้ซื้อไม่ซ้ำหน้า** | Top Rated: ≥100 ธุรกรรม + $1,000 ใน 12 ด. กับผู้ซื้อ US | 🛑 **defect มีแค่ 2 ชนิด**: (1) ร้านยกเลิกเอง (2) เคสที่ eBay ต้องเข้ามาตัดสินแล้วร้านแพ้ — **ผู้ซื้อขอยกเลิก / remorse return / เคสที่ตกลงกันเองได้ = ไม่นับ** |
| **eBay** | Cases closed without seller resolution | เคสที่ eBay ตัดสินให้ผู้ซื้อ ÷ ธุรกรรม | เหมือนบน | ≤0.3% และ ≤2 เคส · Top Rated ≤0.3%/≤2 | เหมือนบน | เคสที่ตกลงกันเองได้ ไม่นับ |
| **eBay** | Late shipment rate | ส่งช้า ÷ ธุรกรรม | เหมือนบน | **ไม่มีเกณฑ์ขั้นต่ำ** (ไม่ทำให้ Below Standard) · Top Rated ≤3% และ ≤5 ใบ | เหมือนบน | ✅ ถอนอัตโนมัติเมื่อมี **carrier scan** ในเวลา handling |
| **Amazon** | **ODR** (Order Defect Rate) | ออเดอร์ที่มี ≥1 defect ÷ ออเดอร์ทั้งหมด | **60 วัน** | **<1%** | ❌ **ไม่มี** (Amazon ยอมรับเองในเอกสารว่า 10 ออเดอร์พลาด 1 = 10% "doesn't necessarily reflect an actual problem") | A-to-z ที่ **ถูก deny** ไม่นับ · 🛑 **แต่ negative feedback นับหมดไม่ว่าใครผิด** |
| **Amazon** | **Pre-fulfilment Cancel Rate** | ออเดอร์ที่**ผู้ขาย**ยกเลิก ÷ ออเดอร์ทั้งหมด | **7 วัน** | **<2.5%** | ❌ | ✅ ผู้ซื้อยกเลิกผ่านบัญชีตัวเอง = **ไม่นับ** · 🛑 แต่ **auto-cancel เพราะร้านไม่ยืนยันการส่ง = นับ** |
| **Amazon** | LSR / VTR | ส่งช้า / มี tracking ที่ carrier ยืนยันได้ | 10 หรือ 30 วัน | LSR <4% · VTR >95% | ❌ | ออเดอร์ digital ฯลฯ |
| **Etsy** | **Star Seller** | 4 เกณฑ์ต้องผ่านพร้อมกัน | ทุกวันที่ 1 มองย้อน **3 เดือน** | ตอบข้อความแรกใน 24 ชม. **≥95%** · ส่งตรงเวลา+มี tracking **≥95%** · ดาว **≥4.8** | **≥5 ออเดอร์ และ ≥$300** · ต้องผ่าน **90 วันนับจากยอดขายแรก** | 🛑 **ออเดอร์ที่ยกเลิกไม่ถูกนับเลย (ตัดออกจากตัวหาร)** · ข้อความที่เป็น spam ไม่นับ · **ถ้าไม่มีข้อความเข้าเลย → ข้ามเกณฑ์นั้น ยังได้ป้าย** · ส่งมือ/รับหน้าร้าน = นับเป็นส่งไม่มี tracking = ตก |
| **Etsy** | Customer Service Standards | เคสที่ถูกหักเงินคืนจากบัญชีผู้ขาย ÷ ออเดอร์ | — | <1% | **≥300 ออเดอร์** จึงเริ่มบังคับ | นับเฉพาะเคส <$250 · ✅ **เขียนยกเว้นเหตุสุดวิสัยตรง ๆ**: ภัยธรรมชาติ, carrier strike, สงคราม |
| **Airbnb** | **Superhost** | — | ประเมิน**รายไตรมาส** (1 ม.ค./เม.ย./ก.ค./ต.ค.) มองย้อน 12 เดือน | ดาว ≥4.8 · ตอบ 90% ใน 24 ชม. · **cancellation <1%** | **≥10 การจอง หรือ 3 การจองรวม ≥100 คืน** | "with exceptions for **Major Disruptive Events or other valid reasons**" — 🛑 **สูตร/ตัวหารของ 1%: ไม่พบหน้าทางการ** |
| **Airbnb** | **Guest Favourite** | ป้ายของ **ที่พัก ไม่ใช่คน** | **ประเมินทุกวัน** | ดาวเฉลี่ย **>4.9** · โฮสต์ยกเลิก+ปัญหาที่ต้องเรียก CS เฉลี่ย 1% | **≥5 รีวิว** (และ ≥1 รีวิวใน 2 ปีล่าสุด) | รวมคะแนนย่อย 6 ด้าน + **การสนทนาระหว่างแขกกับโฮสต์บนแพลตฟอร์ม** |
| **Upwork** | **JSS** | (ผลลัพธ์สำเร็จ − ผลลัพธ์ลบ) ÷ ผลลัพธ์ทั้งหมด | 🛑 คำนวณ **3 หน้าต่างพร้อมกัน (6/12/24 เดือน) แล้วโชว์อันที่ดีที่สุด** · อัปเดต**ทุกวัน** · เกิน 24 เดือนหลุดออก | Top Rated ต้อง ≥90% ต่อเนื่อง **13 ใน 16 สัปดาห์** | **≥2 ผลลัพธ์ จาก ≥2 ลูกค้า ใน 24 เดือน** ไม่งั้นไม่โชว์เลย | สัญญาที่**ไม่มีรายได้และไม่มี feedback** ไม่นับ (เปลี่ยนกฎ 8 พ.ย. 2020) · **ความสัมพันธ์ที่จ่ายเงินต่อเนื่อง >90 วัน = นับเป็นสำเร็จอัตโนมัติ** · feedback จาก client ที่ละเมิด ToS ไม่นับ · ใช้ **private feedback ที่ freelancer ไม่มีวันเห็น** เป็น input |
| **Fiverr** | **Success Score** | สเกล 1–10 คิดรายกิ๊กก่อนแล้วรวม · เทียบกับคนอื่น (relative) | ประเมิน**ทุกวัน** + **grace period 30 วัน**ก่อนลดระดับ | Top Rated ต้อง ≥9 | Top Rated: 40 ออเดอร์ + **20 ลูกค้าไม่ซ้ำหน้า** + $10,000 — **ไม่อัตโนมัติ ต้องผ่านทีมรีวิว** | ✅ **ยกเลิกก่อนผู้ซื้อส่ง requirements → ไม่กระทบ** · กรณีอื่นนับหมด *"all cancellations are taken into account"* แต่ *"some... have a lower impact"* (**ไม่ประกาศน้ำหนัก**) · 🛑 เกณฑ์ตัวเลข Level 1/2: **ไม่พบหน้าทางการ** |
| **Mercari** | ป้าย Reliable / Fast Responder / Quick Shipper | — | — | ✅ **เป็นป้าย ไม่ใช่ %** — Reliable = "ทำออเดอร์สำเร็จตามสัญญา ยกเลิกน้อยหรือไม่มี" (**ไม่พบ threshold ตัวเลข**) · Fast Responder = ตอบเฉลี่ยใน 12 ชม. · Quick Shipper = ส่งใน 24 ชม. **วัดจาก carrier tracking scan ไม่ใช่ตอนกดปุ่ม** | ไม่พบ | ธุรกรรมที่ยกเลิก/คืนของ **ให้คะแนนไม่ได้เลย** · ผู้ซื้อไม่ให้คะแนนใน 3 วัน → **ระบบให้ 5 ดาวอัตโนมัติ** |
| **Carousell** | Response Rate | % แชท/ข้อเสนอใหม่ที่ตอบใน 24 ชม. | — | 🛑 **แสดงเป็น 3 ระดับ: Very / Mostly / Not Responsive — ไม่โชว์ % เลย** (**ไม่พบเกณฑ์ % ของแต่ละระดับ**) | ผู้ใช้ใหม่ที่ยังไม่มีแชท = **ไม่แสดงอะไรเลย** | — |
| **Carousell** | รีวิว | 1–5 ดาว **แยก 3 หัวข้อ** (Communication / Coordination of meetup / Actual item to description) | 30 วัน | — | — | **blind review** — ไม่เผยแพร่จนอีกฝ่ายรีวิว หรือครบ 14 วัน · แก้ได้ 1 ครั้ง **ลบไม่ได้** |
| **FB Marketplace** | Seller rating | 1–5 ดาว (บวก = 4–5, ลบ = ≤3) | — | — | ✅ **≥5 ratings ถึงแสดงสาธารณะ** | คะแนนผู้ซื้อ **เป็นส่วนตัวเสมอ** · Meta ประกาศเองว่า *"ไม่ได้ตรวจสอบยืนยันว่าผู้ใช้ซื้อสินค้าจริง"* · 🛑 **เกณฑ์ badge ทั้ง 5 ตัว: ไม่พบหน้าทางการ** |
| **LINE MAN TH** | คะแนนร้าน | เฉลี่ยจากออเดอร์ LINE MAN เท่านั้น | — | เกณฑ์ฝั่งร้าน: **rating ≥4.7 และอัตรายกเลิก/ปฏิเสธ <2%** (ดูใน Merchant Center อัปเดตรายสัปดาห์) | **ไม่มี** — ร้านที่มีรีวิว <5 ก็แสดง | **ลูกค้าไม่เห็นอัตราการยกเลิกเลย** |

### 1.3 ป้ายยืนยันตัวตน / ช่องทางโซเชียล (คำถาม C)

| แพลตฟอร์ม | ป้าย | เกณฑ์ | ซื้อด้วยเงินได้? | ตำแหน่งบนหน้า |
|---|---|---|---|---|
| **Carousell** | **Verified** (ติ๊กน้ำเงิน) | 🛑 ต้องครบ **ทั้ง 3 อย่าง**: SingPass (บัตรประชาชน) + เบอร์โทร + อีเมล · แต่ละอันผ่านแล้วขึ้นติ๊กเขียวแยก | ❌ | **ข้างชื่อผู้ใช้** บนโปรไฟล์ |
| **Carousell** | ไอคอนโทรศัพท์ | ยืนยันเบอร์ด้วย SMS — **ทุกคนต้องยืนยันก่อนแชท/ลงประกาศได้** | ❌ | โปรไฟล์ (เห็นได้ทุกคน) |
| **Carousell** | ป้ายประเภทผู้ใช้ 8 แบบ | Admin / **New User** / **Not Verified** / Verified User / Verified Business / Certified Partner / Preferred Merchant / Carousell Official | ❌ | 🛑 **ทั้งในแชทและโปรไฟล์** — โชว์ตอนเริ่มคุยกับคนใหม่ |
| **Carousell** | "Verified by Facebook" | **ไม่มี** — Facebook เป็นแค่ช่องทาง login ไม่ได้ให้ badge | — | — |
| **Mercari** | Verified | Email + SMS + **บัตรประชาชนรัฐ + selfie** (ตรวจใน 48 ชม.) | ❌ | **"Trust & Verification section"** แยกต่างหาก |
| **Mercari** | เชื่อม Facebook | *"Others will not be able to see your Facebook profile"* = **ไม่ใช่ trust signal สาธารณะ** | — | — |
| **Airbnb** | "Identity verified" | ยืนยันเอกสาร | ❌ | **ป้ายแดงมีเครื่องหมายถูก ข้างรูปโปรไฟล์** + ลิงก์ข้อความ · กดแล้วเห็น **เดือน/ปีที่ยืนยันครั้งแรก** · โฮสต์จะโผล่ในส่วนโฮสต์ของหน้าประกาศด้วย · Airbnb เขียนกำกับเองว่า *"does not guarantee that someone is who they claim to be"* |
| **Meta Verified for business** | ติ๊กน้ำเงิน + ลิงก์ธุรกิจ 3–8 ลิงก์ + ขึ้นบนสุดของผลค้นหา + ป้องกันการปลอมตัว | อายุบัญชีขั้นต่ำ + กิจกรรมขั้นต่ำ + 2FA + ยืนยันความเชื่อมโยงกับธุรกิจ — 🛑 **ไม่มีเกณฑ์คุณภาพการขายเลย** | ✅ **$11.99–$499.99/เดือน · หยุดจ่าย = ป้ายหาย** | โปรไฟล์ FB/IG |
| **LINE OA** | บัญชีรับรอง / Premium | ต้องผ่าน **screening** · Verified โผล่ในผลค้นหาในแอป (Unverified ไม่โผล่) · **รับใบสมัคร verify เฉพาะ ญี่ปุ่น/ไต้หวัน/ไทย** · Premium: **LINE ประกาศเองว่าไม่มีหน้าที่ต้องเปิดเผยเกณฑ์** | ⚠️ **ค่าใช้จ่ายการ verify: ไม่พบในหน้าทางการ** (บล็อกไทยบุคคลที่สามระบุ ฿888 จ่ายครั้งเดียว — **ยืนยันไม่ได้**) | ข้างชื่อ OA — 🛑 **หน้าทางการยืนยันแค่ว่ามีไอคอนเทา/น้ำเงิน/เขียว แต่ไม่ระบุว่าสีไหน = ประเภทไหน** |
| **Alibaba** | **Verified Supplier** | ตรวจสอบหน้าโรงงานโดยบุคคลที่สาม (**SGS / Bureau Veritas / TÜV**) มีรายงานให้ดาวน์โหลด | ❌ (จ่ายค่าตรวจ) | โปรไฟล์ |
| **Alibaba** | Gold Supplier / "**15 Year** Gold Supplier" | 🛑 **แค่จ่ายค่าสมาชิกรายปีมา 15 ปี** — 1 ปีกับ 15 ปีผ่านการตรวจสอบระดับเดียวกัน | ✅ | โปรไฟล์ |
| **Fiverr** | Seller Plus badge | ซื้ออย่างเดียว — **โผล่บนทุก offer ที่ส่งถึงผู้ซื้อ ปะปนกับป้าย Level ที่ได้จากผลงาน** | ✅ $25/$49 ต่อเดือน | ในสายตาผู้ซื้อ |
| **Fiverr** | ผูกโซเชียลเข้าโปรไฟล์ | 🛑 **เคยมีแล้วเลิกไป** — ย้ายไปใช้ ID verification แทน | — | — |
| **Taobao** | หัวใจ/เพชร/มงกุฎ | แปลงจำนวนธุรกรรม+รีวิวบวกเป็น **ไอคอนช่วง** แทนตัวเลขดิบ (250 / 10,000 / 500,000 แต้ม) | ❌ | ข้างชื่อร้าน |

---

## 2. บทสรุปคำถาม B — "แพลตฟอร์มใหญ่ยกเว้นความผิดที่ไม่ใช่ของผู้ขายจริงไหม และใช้หลักฐานอะไรตัดสิน"

### 2.1 ยกเว้นจริงทุกเจ้า — แต่ **ตัดคนละที่** และผลข้างเคียงต่างกัน

| วิธี | ใครใช้ | ผล |
|---|---|---|
| **ตัดที่ตัวเศษ** (ใบนั้นยังอยู่ในตัวหาร แต่ไม่นับเป็นความผิด) | eBay, Amazon, TikTok, Shopee, Lazada | ✅ ปลอดภัยที่สุด — ร้านที่มีปัญหาเยอะแต่เคลียร์เก่ง ยังดูดีได้อย่างซื่อสัตย์ |
| **ตัดที่ตัวหาร** (ใบนั้นหายไปทั้งใบจากทุกการคำนวณ) | Etsy | 🛑 ร้านที่ยกเลิกบ่อยจะดู "สะอาด" เกินจริง |
| **จำกัดตัวหารตั้งแต่ต้น** (นับเฉพาะออเดอร์ที่เดินมาถึงขั้นที่ผู้ขายรับผิดชอบแล้ว) | **TikTok** (ตัวหาร = ออเดอร์สถานะ *Awaiting Shipment*) · **Fiverr** (ยกเลิกก่อนผู้ซื้อส่ง requirements = ไม่กระทบ) | ✅ **ตรงกับ Deep ที่สุด** — ยกเลิกก่อนร้านเริ่มจัดของ ไม่ควรอยู่ในสมการเลย |
| **allow-list เหตุผลที่ถือว่าผิดผู้ขาย** | **TikTok** (6 เหตุผลปิด) | ✅ ชัดที่สุด ไม่ต้องตีความ |
| **allow-list ชนิด defect** | **eBay** (มีแค่ 2 ชนิด) | ✅ ชัด + ตรวจสอบย้อนได้ |

### 2.2 หลักฐานที่ใช้ตัดสิน — 🛑 **ไม่มีเจ้าไหนให้ผู้ขายอัปโหลดหลักฐานเป็นด่านแรก**

ทุกเจ้าตัดสิน**อัตโนมัติ**จากสัญญาณเชิงระบบที่แพลตฟอร์มถืออยู่แล้ว แล้วค่อยเปิด appeal เป็นตาข่ายรอง เรียงตามลำดับที่ใช้จริง:

**หลักฐานชั้นที่ 1 — "ปุ่มไหนถูกกด / เส้นทางไหนถูกใช้"** (ตัวหลักของทุกเจ้า)

- **Amazon** — *"does not include any cancelled orders that are initiated by the customer"* คือ **ผู้ซื้อต้องกดยกเลิกจากบัญชีตัวเอง** ถึงไม่นับ 🛑 **ถ้าผู้ซื้อทักแชทมาขอ แล้วร้านกดยกเลิกให้ ระบบบันทึกเป็น seller-initiated ทันที** — เจตนาไม่มีผล มีแต่เส้นทาง
- **Amazon (ปิดช่องเงียบ)** — auto-cancel เพราะร้านไม่ยืนยันการส่ง **นับเป็นความผิดร้าน** ป้องกันไม่ให้ร้านเลี่ยงด้วยการ "ไม่ทำอะไรเลย" แทนการกดยกเลิก
- **eBay** — มี reason code `BUYER_ASKED_CANCEL` ให้ร้านกดเอง **แต่ eBay สแกนข้อความในระบบตรวจย้อน** ถ้าโกหก = defect ที่ร้ายแรงกว่าเดิมและกระทบสิทธิ์การขาย
- **Shopee** — 🛑 **หัก 2 คะแนนความประพฤติ ถ้าจับได้ว่าร้านขอให้ผู้ซื้อกดยกเลิกแทน** (chat scan จับคำว่า "ยกเลิก" ในแชท) และในคอร์สทางการแนะนำตรง ๆ ว่า *"เราแนะนำให้ท่านกดยกเลิกออเดอร์ด้วยตัวท่านเอง หากพบว่าเป็นความผิดของท่าน"*

**หลักฐานชั้นที่ 2 — สถานะจากระบบภายนอกที่ปลอมไม่ได้**

- **eBay** ถอน late-shipment defect **อัตโนมัติ** เมื่อมี **carrier scan** ในช่วง handling time
- **Mercari** วัด Quick Shipper จาก **carrier tracking scan** ไม่ใช่ตอนร้านกดปุ่ม
- **Amazon** VTR ต้องเป็น tracking ที่ **carrier ยืนยันได้** เท่านั้น

**หลักฐานชั้นที่ 3 — ผลของ case (ใครชนะ)**

- **Amazon**: A-to-z claim ที่ **ถูก deny** ไม่นับเข้า ODR
- **eBay**: *"The transaction will receive a defect only if a seller doesn't come to terms with the buyer and eBay has to ultimately make a decision on the case, and it rules in favor of the buyer."*

**หลักฐานชั้นที่ 4 — เหตุการณ์วงกว้างที่แพลตฟอร์มประกาศเอง**

- **eBay ถอน defect อัตโนมัติภายใน 72 ชั่วโมง** สำหรับ: ผู้ซื้อไม่จ่ายเงิน · ระบบ eBay ขัดข้อง · eBay ลงโทษผู้ซื้อตาม Abusive buyer policy · eBay สั่งให้ระงับการส่ง · **"wide-scale shipping carrier delays, items stuck in customs, or power outages due to extreme weather"**
- **Etsy** เขียนยกเว้นเป็นข้อความในนโยบายตรง ๆ: *"extraordinary events (e.g. natural disasters, carrier strike, war) outside of the seller's reasonable control"*

**ชั้นสุดท้าย — อุทธรณ์ด้วยมือ (ทุกเจ้ามี แต่เป็นด่านสุดท้าย ไม่ใช่ด่านแรก)**

| แพลตฟอร์ม | ช่องทาง | เวลา | ใครตัดสิน |
|---|---|---|---|
| eBay | Seller Hub | **90 วัน** (ถ้าระบบไม่ถอนให้อัตโนมัติ) | eBay |
| Shopee TH | **Call Centre 02-017-8399** | — | 🛑 *"รวบรวมหลักฐานอย่างละเอียด... ขึ้นอยู่กับดุลยพินิจของทาง Shopee ในการพิจารณาตัดสิน รายกรณี"* — 4 หมวดที่อุทธรณ์ได้: Product Listing / ระบบ Shopee ไม่เสถียร / ความบกพร่องของบริษัทขนส่ง / กรณีผู้ซื้ออยากยกเลิกเองแต่ให้ร้านกดให้ |
| Lazada | Seller Center | ครั้งที่ 1 ภายใน 7 วัน, ครั้งที่ 2 ภายใน 14 วัน | Lazada — final เว้นมีหลักฐานใหม่ |
| TikTok Shop | — | อุทธรณ์ AHR ได้ 2 ครั้ง (30 วัน แล้ว 15 วัน) | TikTok |
| Airbnb | ยื่นเคลม **ภายใน 14 วัน** หลังยกเลิก (หรือก่อนแขกคนถัดไปมาถึง) | 14 วัน | Airbnb — *"may be required to submit proof of documentation"* (รูป/วิดีโอความเสียหาย, ใบรับรองแพทย์, หลักฐาน API outage) |

### 2.3 🛑 ข้อควรรู้: "ยกเว้นค่าปรับ" ≠ "ยกเว้นผลกระทบต่อป้าย"

Airbnb เขียนไว้ตรง ๆ ว่าแม้ค่าปรับถูกยกเว้นแล้ว **"other consequences may still apply"** — ยังเสียสถานะ Superhost / ถูกปิดปฏิทิน / ถูกระงับประกาศได้อยู่

**Deep ต้องตัดสินใจให้ชัดว่าการยกเว้นของเรายกเว้นถึงชั้นไหน**: ยกเว้นจากสูตร % อย่างเดียว หรือยกเว้นจาก Trust Score / ป้าย ด้วย — ถ้าไม่ระบุจะกลายเป็นความคลุมเครือแบบเดียวกัน

### 2.4 🛑 ช่องว่างที่ **ไม่มีเจ้าไหนตอบ**

**"ลูกค้าไม่รับพัสดุ / พัสดุตีกลับ (RTS)" — ไม่พบหน้านโยบายทางการของเจ้าไหนเลย** ที่ระบุชัดว่านับเข้าความผิดผู้ขายหรือไม่ (Shopee พูดถึงแค่ "ขนส่งเข้ารับช้า" ซึ่งเป็นคนละเรื่อง) — **เราต้องเขียนกฎเอง ไม่มีของลอก และไม่ควรเดา**

---

## 3. บทเรียนที่ใช้กับหน้า Deep ได้ (ข้อเสนอที่ตัดสินใจได้)

### 3.1 อย่าโชว์ "% ความสำเร็จ / % ยกเลิก" บนหน้าโปรไฟล์สาธารณะ — แปลงเป็นป้าย/ระดับ

ไม่มีมาร์เก็ตเพลสเจ้าไหนโชว์ และ **3 เจ้าที่มีตัวเลขจริงในมือยังจงใจไม่โชว์**: Carousell แปลง response rate เป็น 3 ระดับ (Very/Mostly/Not Responsive) · Fiverr ซ่อน Success Score 1–10 ให้ผู้ซื้อเห็นแค่ Level · Upwork คือเจ้าเดียวที่โชว์ % ดิบและได้เสียงบ่นหนักที่สุด

**ทำอะไร:** ใช้ทรง **Mercari "Reliable"** หรือ **Etsy ป้ายรายเกณฑ์** (ส่งไว / ตอบไว / รีวิวดี) — ผ่านเกณฑ์ = ขึ้นป้าย, ไม่ผ่าน = **ไม่มีป้าย (ไม่ใช่ป้ายแดง)** ส่วน % ตัวจริงให้อยู่ในหลังบ้านร้านเท่านั้น

**ทรงที่น่าลอกเพิ่ม:** Mercari แยก **"Known for"** (คำชมสาธารณะ) ออกจาก **"Things to improve"** ที่ **เจ้าของร้านเห็นคนเดียว** — แสดงด้านลบให้ร้านปรับปรุง โดยไม่แสดงให้ผู้ซื้อตัดสิน

### 3.2 ตัวเลขที่โชว์ ให้เป็นตัวเลข "นับดี" ไม่ใช่ "นับเสีย" — และต้องมี N กำกับเสมอ

โชว์ **จำนวนออเดอร์ที่ผู้ซื้อยืนยันรับของแล้ว** + จำนวนรีวิว + วันที่เข้าร่วม

Baymard Institute (25 รอบ usability testing, 4,400+ session): *"Without knowledge of how many users had rated products, a substantial number of participants distrusted the validity of user ratings averages"* — **ค่าเฉลี่ยต้องมีจำนวน N กำกับเสมอ**

ช่วงตัวเลขน้อยใช้เลขดิบได้ (17 ออเดอร์) — ปัดเป็นช่วงเมื่อโตค่อยทำ (Taobao แปลงเป็นไอคอนช่วงไปเลย)

### 3.3 ผูก attribution กับ "เส้นทางที่ถูกใช้" ไม่ใช่ "เหตุผลที่ร้านกรอก"

**ข้อเสนอชัด ๆ:** ทำปุ่ม **"ฉันขอยกเลิกคำสั่งซื้อนี้" บนหน้า `/o/[token]` ฝั่งผู้ซื้อ** แล้วประกาศว่า **นี่คือเส้นทางเดียวที่ทำให้การยกเลิกไม่นับเป็นความผิดร้าน** — ร้านกดยกเลิกเอง = นับเสมอ (เว้นอุทธรณ์)

นี่คือกฎเดียวกับ Amazon เป๊ะ และแก้ปัญหาที่ eBay ต้องเสียแรงสแกนแชทตามจับ เพราะ eBay เลือกให้ร้านกด reason code เอง

### 3.4 เตรียมด่านกัน "ร้านผลักภาระให้ลูกค้ากด" ตั้งแต่วันแรก — ไม่ใช่ตามแก้ทีหลัง

ทันทีที่ข้อ 3.3 มีผล ร้านจะเริ่มขอให้ลูกค้ากดยกเลิกแทน Shopee เจอปัญหานี้จนต้องตั้งโทษ **2 คะแนน + สแกนแชท** ซ้อนอีกชั้น

เรามีข้อมูลแชท FB/LINE อยู่แล้ว ทำ detector ง่าย ๆ ได้ หรืออย่างน้อยใส่ข้อความในหน้ายกเลิกฝั่งผู้ซื้อว่า "ร้านขอให้คุณกดใช่ไหม? แจ้งเราได้"

### 3.5 ออเดอร์ที่ยกเลิกก่อนร้านเริ่มจัดของ ควรหลุดจากสมการทั้งตัวเศษและตัวหาร

TikTok ใช้ตัวหาร = ออเดอร์ที่ถึงสถานะ *"To Ship – Awaiting Shipment"* · Fiverr: ยกเลิกก่อนผู้ซื้อส่ง requirements = ไม่กระทบเลย

**สำหรับ Deep:** ออเดอร์ที่ยกเลิกก่อนร้านกรอกเลขพัสดุ/เริ่มดำเนินการ ไม่ควรอยู่ในสมการเลย — ไม่ใช่ "นับแล้วยกเว้น" แต่คือ "ไม่เข้าสมการตั้งแต่แรก"

### 3.6 "ลูกค้าไม่รับของ / ตีกลับ" → ผูกกับสถานะขนส่ง ไม่ใช่คำบอกเล่า

ไม่มีของลอก (ไม่มีเจ้าไหนเขียนกฎนี้) แต่มีแพตเทิร์นให้ลอก: **eBay ใช้ carrier scan เป็นหลักฐานถอน defect อัตโนมัติ** · Mercari วัดจาก carrier scan ไม่ใช่ปุ่ม

**ข้อเสนอ:** ออเดอร์ที่สถานะพัสดุจาก iShip = ตีกลับ / ผู้รับปฏิเสธ → **ไม่หักร้านอัตโนมัติ ไม่ต้องอุทธรณ์** · ส่วนออเดอร์ที่ร้านกรอกเลขพัสดุเอง (ไม่มีสถานะจากระบบ) ต้องเข้าเส้นทางอุทธรณ์

### 3.7 ร้านออเดอร์น้อย: ยืดหน้าต่างเวลา หรือซ่อนตัวเลข — อย่าคิด % ตรง ๆ

มี 4 ทางที่ใช้จริง เรียงจากดีไปแย่:

1. **eBay (ดีที่สุด):** <400 ธุรกรรม → มองย้อน **12 เดือน** แทน 3 เดือน — ได้ตัวหารใหญ่พอโดยไม่ต้องซ่อนอะไร
2. **Upwork:** คำนวณ 3 หน้าต่างพร้อมกัน (6/12/24 เดือน) **แล้วโชว์อันที่ดีที่สุด**
3. **Amazon:** สลับหน้าต่างตาม sample — ≥10 feedback ใน 12 ด. → โชว์ 12 เดือน · <10 → สลับไป lifetime
4. **TikTok / FB Marketplace / Airbnb Guest Favourite:** ซ่อนไปเลยจนถึงเกณฑ์ (30 ออเดอร์ / 5 ratings / 5 รีวิว)

**ข้อเสนอตัวเลข:** **ใช้ 5 เป็นเกณฑ์ขั้นต่ำก่อนแสดงค่าเฉลี่ย/ป้ายใด ๆ** — FB Marketplace (≥5 ratings) และ Airbnb Guest Favourite (≥5 รีวิว) ตรงกัน และเป็นบริบท C2C ที่ใกล้เราที่สุด ต่ำกว่านั้นให้แสดง **ป้าย "ร้านใหม่" + จำนวนออเดอร์ดิบ + วันที่เข้าร่วม** แทนช่องว่าง

### 3.8 เกณฑ์ต้องเป็น "% และจำนวนดิบ" คู่กันเสมอ

eBay Top Rated: *"≤0.5% **และ** ≤3 defect จากผู้ซื้อไม่ซ้ำหน้า"* — ต้องผ่านทั้งคู่
Shopee: NFR ≥10% = 1 คะแนน · ≥10% **และ ≥30 ใบ** = 2 คะแนน
eBay late shipment: ≤3% **และ** ≤5 ใบ

กันได้ทั้งร้านใหญ่ที่ % สวยแต่จำนวนเคสดิบเยอะ และร้านเล็กที่พลาดใบเดียวแล้ว % พุ่ง

### 3.9 นับ "ผู้ซื้อไม่ซ้ำหน้า" ไม่ใช่แค่จำนวนออเดอร์ — สำคัญเป็นพิเศษเพราะเราไม่ใช่ escrow

Deep ไม่ถือเงิน ร้านจึงสร้างออเดอร์ปลอมแล้วให้เพื่อนกดยืนยันได้ฟรี ๆ แพลตฟอร์มที่ใช้ตัวนับนี้เป็นเกราะ:

- Shopee ร้านค้าแนะนำ: **≥15 ผู้ซื้อไม่ซ้ำหน้า/เดือน** (คู่กับ ≥100 ออเดอร์)
- Fiverr Top Rated: **20 ลูกค้าไม่ซ้ำหน้า** (คู่กับ 40 ออเดอร์)
- eBay: **≤3 defect จากผู้ซื้อไม่ซ้ำหน้า**
- Upwork: **≥2 ลูกค้า** (ไม่ใช่แค่ ≥2 สัญญา)

### 3.10 ต้องมี auto-confirm timer ไม่งั้น "อัตราสำเร็จ" จะวัดความขี้ลืมของผู้ซื้อ

- **Mercari** (ไม่ใช่ escrow เหมือนเรา): ผู้ซื้อไม่ให้คะแนนใน 3 วัน → **ระบบให้ 5 ดาวอัตโนมัติ** · ธุรกรรมที่ยกเลิก/คืนของ **ให้คะแนนไม่ได้เลย**
- **Shopee**: ยืนยันรับของอัตโนมัติเมื่อผู้ซื้อไม่กด (ระยะเวลาที่ร้านตั้ง + 5 วัน — *แหล่งไม่ทางการ*)
- **Upwork**: ความสัมพันธ์ที่จ่ายเงินต่อเนื่อง >90 วัน = **นับเป็นสำเร็จอัตโนมัติ** แม้ปิดสัญญาโดยไม่มี feedback

ถ้า Deep ไม่มีตัวนี้ ออเดอร์ที่จบดีแต่ผู้ซื้อไม่กด จะไปกองอยู่ในกลุ่ม "ไม่สำเร็จ" ตลอดกาล

### 3.11 ช่องทางโซเชียล: แยก "เชื่อมบัญชี" ออกจาก "ยืนยันตัวตน" ให้ชัด

เพจ FB ที่ผูกผ่าน OAuth **พิสูจน์ได้แค่ว่า "คนนี้คุมเพจนี้จริง" ไม่ได้พิสูจน์ตัวตน** — Carousell ให้ติ๊กฟ้าต่อเมื่อครบทั้ง 3 อย่าง (บัตรประชาชน + เบอร์ + อีเมล) และ Mercari บอกตรง ๆ ว่าการเชื่อม Facebook ไม่แสดงให้คนอื่นเห็น

**ทำอะไร:** แถวไอคอนช่องทาง (FB/IG) ใต้หัวโปรไฟล์ + ข้อความ "เชื่อมต่อเมื่อ [วันที่]" — **ห้ามใช้เครื่องหมายถูกสีเดียวกับป้ายยืนยันตัวตน 3 ขั้นของเรา** (Airbnb ทำถูก: "Identity verified" ป้ายแดง แยกจาก "Superhost" · Mercari รวมป้ายซื้อไม่ได้ไว้ใน "Trust & Verification section" ต่างหาก)

**พิจารณาโชว์ป้ายในแชทด้วย ไม่ใช่แค่โปรไฟล์** — Carousell โชว์ "New User" / "Not Verified" ตอนเริ่มแชท ซึ่งคือจุดที่การหลอกลวงเกิดจริง (บริบทเดียวกับ Deep ที่ดีลเกิดในแชท)

---

## 4. Anti-pattern ที่เห็นจากของคนอื่น

### 4.1 ไม่มี sample floor = ร้านใหม่ดูแย่ถาวร

**Amazon ยอมรับปัญหานี้ในเอกสารตัวเองแล้วไม่แก้:** *"if you have only 10 orders and one of them has a defect, your ODR will be 10%. While that is technically over our target of 1%, it doesn't necessarily reflect an actual problem with your performance given the low number of orders."* — ไม่มีการแสดง "—" หรือยกเว้นการประเมินอย่างเป็นทางการ มีแค่ "ใช้ดุลพินิจ"

**Shopee หนักกว่า** เพราะ "≥30 ออเดอร์" เป็น**ตัวคูณโทษ** ไม่ใช่ประตูกัน → ร้าน 3 ออเดอร์ยกเลิก 1 ใบ = NFR 33% โดนคะแนนทันที เอกสารระบุเองว่าระบบเริ่มคำนวณ NFR ทันทีที่มีคำสั่งซื้อไม่สำเร็จเกิดขึ้น

### 4.2 ยัดของที่ไม่ใช่ความผิดร้านเข้าเมตริกเดียวกัน

**Amazon นับ negative feedback เข้า ODR ไม่ว่าใครผิด** — ลูกค้าให้ 1 ดาวเพราะขนส่งช้าก็นับ นี่คือจุดที่ Amazon ถูกด่ามากที่สุด

**TikTok แก้ถูกแล้ว:** รีวิวลบที่เกิดจากโลจิสติกส์ **ไม่นับ** เข้า NRR

### 4.3 ตัดออกจากตัวหารแทนตัวเศษ

**Etsy** ทำให้ร้านที่ยกเลิกบ่อยดู "สะอาด" เกินจริง เพราะออเดอร์ที่ยกเลิกหายไปทั้งใบจากทุกการคำนวณ — ผู้ซื้อมองไม่เห็นเลยว่าร้านนี้ยกเลิกบ่อย

### 4.4 % ที่คำนวณย้อนกลับไม่ได้

**Lazada:** หน้านโยบายจริงถูก gate ทั้งหมด · ตัวเลขเกณฑ์จากแหล่งต่าง ๆ ขัดกันเอง · หน้าต่างเวลาแปลก (Day N-7 ถึง N-35 = ตัด 7 วันล่าสุดทิ้ง) → ผู้ขายคำนวณตามไม่ได้เลย

**Upwork:** ใช้ **private feedback ที่ freelancer ไม่มีวันเห็น** เป็น input ของ JSS — กัน retaliation ได้จริง แต่แลกกับ "คะแนนที่อธิบายให้ตัวเองฟังไม่ได้" ซึ่งคือรากของเสียงบ่นทั้งหมด

**ถ้า Deep จะโชว์ % ต้องกดดูรายการที่ประกอบเป็น % นั้นได้ทุกใบ**

### 4.5 ป้ายที่ซื้อได้ด้วยเงินปนกับป้ายที่ต้องทำได้

| | ป้ายจากผลงาน | ป้ายที่ซื้อด้วยเงิน |
|---|---|---|
| ตัวอย่าง | Superhost, Guest Favourite, Top Rated, Star Seller, eBay Top Rated, GrabThumbsUp, Users' Choice | **Meta Verified** ($11.99–$499.99/ด.), **Fiverr Seller Plus** ($25/$49 ต่อ ด.), **LINE OA Premium**, **Alibaba Gold Supplier** |
| รับรองอะไร | **พฤติกรรมย้อนหลัง** | **ตัวตน** (หรือแค่การจ่ายเงิน) |
| เสียเมื่อไหร่ | ผลงานตก | หยุดจ่าย |
| มี sample floor ไหม | มีเสมอ | ไม่มีแนวคิดนี้ |

ตัวที่แย่ที่สุดคือ **Alibaba "15 Year Gold Supplier"** ซึ่งอ่านเหมือนความน่าเชื่อถือสะสม 15 ปี แต่แปลว่า "จ่ายค่าสมาชิกมา 15 ปี" — 1 ปีกับ 15 ปีผ่านการตรวจสอบระดับเดียวกัน

**Fiverr Seller Plus badge โผล่บนทุก offer ที่ส่งถึงผู้ซื้อ ปะปนกับป้าย Level ที่ได้จากผลงาน** โดยไม่มีอะไรบอกผู้ซื้อว่าอันไหนซื้อมา

### 4.6 กฎที่ลงโทษหนักสร้างพฤติกรรมเลี่ยง

ยิ่งลงโทษ % ยกเลิกหนัก ร้านยิ่งผลักลูกค้าไปกดยกเลิกเอง Shopee ต้องเพิ่มโทษซ้อนอีกชั้น (2 คะแนน + chat scan) เพื่ออุดช่องนี้ · Amazon ต้องนับ "auto-cancel เพราะร้านไม่ยืนยันการส่ง" เป็นความผิดร้าน เพื่ออุดช่อง "เงียบแทนกด" — **ต้องออกแบบด่านนี้พร้อมกับกฎ ไม่ใช่ตามแก้ทีหลัง**

### 4.7 ตัวเลขเดียวกันคำนวณคนละแบบในสองที่

**Fiverr:** rating ที่โชว์บนโปรไฟล์ = **all-time** แต่ rating ที่ใช้ตัดระดับ = **เฉลี่ย 2 ปีล่าสุด** → ผู้ขายเห็น 4.9 บนหน้าตัวเองแล้วโดนลดระดับ งงว่าทำไม

(คลาสเดียวกับบทเรียน `docs/conventions/sibling-surface-parity.md` ของเรา: ตัวเลข/สถานะเดียวกันที่โผล่ >1 ที่ ต้องมาจาก symbol เดียว)

### 4.8 ป้ายชื่อซ้ำกันคนละระบบ

**Facebook** มี "Very responsive" ของ **Page** (เกณฑ์ = response rate ≥90% + response time <15 นาที) และ "Very responsive" ของ **Marketplace seller** (เกณฑ์ไม่เปิดเผย) — คนละระบบสนิท ผู้ใช้แยกไม่ออก

### 4.9 ซ่อนคะแนนโดยไม่บอกว่าซ่อนอยู่

**Facebook Marketplace** ไม่โชว์ rating จนครบ 5 ใบ แต่ผู้ซื้อแยกไม่ออกระหว่าง "ร้านใหม่" กับ "ไม่มีข้อมูล" → ถ้าเราจะซ่อน ต้องใส่ป้าย "ร้านใหม่ · เข้าร่วมเมื่อ..." แทนที่ช่องว่าง (Fiverr มี level "New Seller" ตรง ๆ)

### 4.10 เอกสารทางการที่ขัดกันเอง

- **TikTok**: หน้าไทยบอก 60 วัน หน้า SG บอก 90 วัน สำหรับเกณฑ์เดียวกัน
- **Shopee TH**: บทความปัจจุบันบอก NFR 7 วัน แต่คอร์ส PDF ทางการบอก 30 วัน
- **Lazada**: ตัวเลข OVL ขัดกันระหว่างสองแหล่ง (≥5% vs ≥30%)

**ถ้าเรามีตัวเลขเกณฑ์ ต้องมี SSOT ที่เดียว** (แบบเดียวกับ `src/lib/order-date-window.ts`)

---

## 5. ข้อจำกัดของงานวิจัยนี้ — สิ่งที่ "ไม่พบหน้านโยบายทางการ"

### 5.1 แพลตฟอร์มที่เข้าหน้าทางการไม่ได้เลย

| แพลตฟอร์ม | อาการ |
|---|---|
| **Lazada** | 🛑 `sellercenter.lazada.*` redirect เข้า bot-block (`punish:resource:template action=deny`) · help center เป็น SPA ว่าง · **ข้อมูล Lazada ทั้งหมดในเอกสารนี้เป็นบุคคลที่สาม ยืนยันด้วยตาไม่ได้แม้ข้อเดียว** |
| **eBay help pages** | `ebay.com/help/*` timeout ทุกครั้ง (JS หนัก) — แต่ `export.ebay.com` เป็นหน้าทางการที่ fetch สำเร็จ จึงยืนยันนิยาม defect + auto-removal ได้ |
| **Etsy / Amazon Seller Central / Upwork / Fiverr / Meta Business Help** | คืน HTTP 403 — อ่านผ่าน search snippet ของหน้าทางการเอง (URL อ้างได้ แต่ไม่ได้เห็นหน้าเต็ม) |
| **Grab** | `help.grab.com` เป็น JS ล้วน ดึงเนื้อหาไม่ได้ |

### 5.2 คำถามที่ค้นแล้วไม่พบ — **ห้ามเดาตัวเลขในสเปก**

1. 🛑 **RTS / ลูกค้าไม่รับพัสดุ นับเข้าผู้ขายไหม — ไม่มีเจ้าไหนระบุเลยสักเจ้า**
2. **รูปแบบ "ขายแล้ว N ชิ้น" (เลขดิบ vs `1พัน+`)** — ไม่พบหน้าทางการของ Shopee/Lazada/TikTok/Etsy
3. **ตัวเลขผู้ติดตาม / "เข้าร่วมเมื่อ" โชว์บนหน้าร้านไหม** (Shopee/Lazada/TikTok) — ไม่พบเอกสารทางการ
4. **สูตร/ตัวหารของ Airbnb cancellation rate 1%** — รู้แค่ threshold
5. **เกณฑ์ % ของ Carousell Very / Mostly / Not Responsive**
6. **เกณฑ์ทั้ง 5 badge ของ Facebook Marketplace** (Top seller / Very responsive / Highly rated / Top shipper / Top category seller)
7. **เกณฑ์ตัวเลข Fiverr Level 1 / Level 2** (Fiverr ให้ดูในแดชบอร์ดผู้ขายเท่านั้น)
8. **Mercari:** threshold ของป้าย "Reliable" · จำนวน transaction ที่โชว์บนโปรไฟล์
9. **LINE OA:** สีไหน = ประเภทไหน (เทา/น้ำเงิน/เขียว) · **ค่าใช้จ่ายการ verify** · เกณฑ์ Premium (LINE ประกาศเองว่าไม่เปิดเผย) — ตัวเลข **฿888** มาจากบล็อกไทยบุคคลที่สาม **ยืนยันไม่ได้**
10. **Grab:** sample ขั้นต่ำก่อนโชว์คะแนน · คะแนนไรเดอร์ที่ลูกค้าเห็น · cancellation rate ที่ลูกค้าเห็น
11. **eBay:** สถานะ DSR ปี 2025-2026 — หน้าทางการยังอธิบาย DSR 4 ด้านให้ผู้ซื้ออ่าน (= ยังแสดงผลอยู่) แต่ที่ว่า "ไม่ถูกใช้คำนวณระดับผู้ขายแล้ว" มาจาก community post ไม่ใช่หน้านโยบาย
12. **Etsy:** "N sales" / "on Etsy since" บนหน้าร้าน — ไม่มีหน้านโยบายรองรับ

---

## 6. แหล่งอ้างอิง

### 6.1 หน้าทางการที่ **อ่านหน้าเต็มได้เอง** (ความน่าเชื่อถือสูงสุด)

- **Shopee TH — Seller Penalty Point Course (PDF ทางการ):** https://cdngarenanow-a.akamaihd.net/shopee/seller/seller_cms/9d23969bfb7bc3a93ebd853b76d4c3e0/EDH%20Seller%20Penalty%20Point%20Course.pdf
- **TikTok Shop — Seller-Fault Cancellation Rate Requirements:** https://seller-us.tiktok.com/university/essay?knowledge_id=7953001314830094
- **eBay — The ABCs of metrics and defects on eBay:** https://export.ebay.com/en/growth/seller-performance/the-abcs-of-metrics-and-defects-on-ebay/
- **eBay — Appeal a defect:** https://export.ebay.com/en/fees-regulations-policies/seller-protection/appeal-defect/
- **eBay — Seller levels and performance standards:** https://export.ebay.com/in/growth/seller-performance/seller-levels/
- **Airbnb — Superhost requirements (article 829):** https://www.airbnb.com/help/article/829
- **Carousell — What is a Verified Badge (SG):** https://support.carousell.com/hc/en-us/articles/360022767413--Singapore-What-is-a-Verified-Badge

### 6.2 หน้าทางการ — Shopee

- NFR (อัตราการจัดส่งสินค้าไม่สำเร็จ): https://seller.shopee.co.th/edu/article/10702 · https://seller.shopee.co.th/edu/article/408
- นโยบายคะแนนความประพฤติ: https://seller.shopee.co.th/edu/article/7052
- FAQ ระบบคะแนนความประพฤติ: https://seller.shopee.co.th/edu/article/15742
- ประสิทธิภาพร้านค้า: https://seller.shopee.co.th/edu/article/8182
- การตรวจสอบเหตุผลการขอยกเลิก: https://seller.shopee.co.th/edu/article/3756
- ร้านค้าแนะนำ (Preferred Seller): https://seller.shopee.co.th/edu/article/12559
- ร้านค้าทางการ (Shopee Mall): https://seller.shopee.co.th/edu/article/7066
- คะแนนรีวิวร้านค้า: https://seller.shopee.co.th/edu/article/2118
- ตรวจสอบประสิทธิภาพการแชท: https://seller.shopee.co.th/edu/article/11903
- Non-Fulfilment Rate PDF (ภูมิภาค): https://deo.shopeemobile.com/shopee/seller/seller_cms/dafe694beac5bec8c8d64504ff492640/Non-fulfilment%20Rate.pdf
- Monitoring Chat Performance (SG — ยืนยันว่า **ผู้ซื้อเห็น CRR + FRT**): https://seller.shopee.sg/edu/article/2587/monitoring-chat-performance
- Understanding Chat Response (SG): https://seller.shopee.sg/edu/article/50/understanding-chat-response
- How is Chat Response Rate calculated (MY): https://seller.shopee.com.my/edu/article/1792/understanding-chat-response

### 6.3 หน้าทางการ — TikTok Shop

- LDR (ไทย): https://seller-th.tiktok.com/university/essay?knowledge_id=4294209511982864&default_language=th-TH
- SFCR (ไทย): https://seller-th.tiktok.com/university/essay?knowledge_id=4260207925872400
- คะแนนร้าน (ไทย): https://seller-th.tiktok.com/university/essay?knowledge_id=6837810275616514
- Customer Review Policy: https://seller-th.tiktok.com/university/essay?knowledge_id=10013848&lang=en
- CS Communication: https://seller-th.tiktok.com/university/essay?knowledge_id=8918857185183490
- คะแนนสถานะบัญชี (AHR): https://seller-th.tiktok.com/university/essay?knowledge_id=8901265719953153&lang=en
- TopChoice: https://seller-th.tiktok.com/university/essay?knowledge_id=8698899484116737&lang=en
- Seller Performance Evaluation Policy (SEA): https://seller-ph.tiktok.com/university/essay?knowledge_id=4237248996673282&default_language=en
- Late Dispatch Rate (US): https://seller-us.tiktok.com/university/essay?knowledge_id=3668989549299511&lang=en
- Account Health Rating (US): https://seller-us.tiktok.com/university/essay?knowledge_id=6750828276418350&lang=en

### 6.4 หน้าทางการ — eBay (อ่านผ่าน search index)

- Seller levels and performance standards: https://www.ebay.com/help/selling/seller-levels-performance-standards/seller-levels-performance-standards?id=4080
- Seller standards policy: https://www.ebay.com/help/policies/selling-policies/seller-standards-policy?id=4347
- Seller protections: https://www.ebay.com/help/policies/selling-policies/seller-protections?id=4345
- Appeal a defect or late shipment: https://www.ebay.com/help/selling/selling/seller-performance-overview/appeal-defect-late-shipment?id=4871
- Defect removal (Seller Center): https://www.ebay.com/sellercenter/protections/defect-removal
- Top Rated Seller Program: https://www.ebay.com/sellercenter/protections/top-rated-program
- How sellers can cancel an order: https://www.ebay.com/help/selling/getting-paid/sellers-can-cancel-order?id=4136
- Order cancellation policy: https://www.ebay.com/help/policies/member-behavior-policies/order-cancellation-policy?id=5298
- Seller ratings (มุมผู้ซื้อ): https://www.ebay.com/help/buying/resolving-issues-sellers/seller-ratings?id=4023

### 6.5 หน้าทางการ — Amazon (อ่านผ่าน search index; sellercentral ต้อง login)

- Order Performance program policy: https://sellercentral.amazon.com/help/hub/reference/external/GGJVNFDXQT8C3RA8?locale=en-US
- Order defect rate: https://sellercentral.amazon.com/help/hub/reference/external/G200285170?locale=en-US
- How does feedback and rating work: https://sellercentral.amazon.com/help/hub/reference/external/G97692EVY8H3CZY9

### 6.6 หน้าทางการ — Etsy (403; อ่านผ่าน search index)

- What is the Star Seller Badge: https://help.etsy.com/hc/en-us/articles/4403058372503-What-is-the-Star-Seller-Badge
- How to Track Your Progress Toward Becoming a Star Seller: https://help.etsy.com/hc/en-us/articles/29665255990039-How-to-Track-Your-Progress-Toward-Becoming-a-Star-Seller
- What are Etsy's Customer Service Standards: https://help.etsy.com/hc/en-us/articles/360036207794-What-are-Etsy-s-Customer-Service-Standards
- Star Seller landing page: https://www.etsy.com/starseller
- We're Updating How Average Review Ratings Are Calculated: https://www.etsy.com/seller-handbook/article/1471073427393

### 6.7 หน้าทางการ — Airbnb

- Superhost: https://www.airbnb.com/help/article/829
- Major Disruptive Events Policy: https://www.airbnb.com/help/article/1320
- valid reasons ที่ยกเว้นการยกเลิกของโฮสต์: https://www.airbnb.com/help/article/2022
- ผลกระทบเมื่อโฮสต์ยกเลิก ("other consequences may still apply"): https://www.airbnb.com/help/article/990
- Guest Favourite: https://www.airbnb.com/help/article/3496 · https://www.airbnb.com/help/article/3495
- Identity verification บนโปรไฟล์: https://www.airbnb.com/help/article/1237
- โปรไฟล์แสดงอะไรบ้าง: https://www.airbnb.com/help/article/3386

### 6.8 หน้าทางการ — Upwork / Fiverr (403; อ่านผ่าน search index)

- Upwork — Job Success Score: https://support.upwork.com/hc/en-us/articles/211063558-Job-Success-Score
- Upwork — All about your Job Success Score: https://support.upwork.com/hc/en-us/articles/211068358-All-about-your-Job-Success-Score
- Upwork — How is my JSS calculated: https://support.upwork.com/hc/en-us/articles/38437458199059-How-is-my-Job-Success-Score-calculated
- Upwork — When will I get a JSS: https://support.upwork.com/hc/en-us/articles/38437546570643-When-will-I-get-a-JSS
- Upwork — Job Success Score insights: https://support.upwork.com/hc/en-us/articles/35230612015123-Job-Success-Score-insights
- Upwork — Rising Talent: https://support.upwork.com/hc/en-us/articles/211063228-How-to-become-a-Rising-Talent-on-Upwork
- Upwork — Top Rated: https://support.upwork.com/hc/en-us/articles/211068468-How-to-become-Top-Rated-on-Upwork
- Upwork — Top Rated Plus: https://support.upwork.com/hc/en-us/articles/360050417233-Top-Rated-Plus
- Upwork — ประกาศ "no-feedback contracts no longer impact JSS" (8 พ.ย. 2020): https://community.upwork.com/t5/Announcements/No-feedback-contracts-no-longer-impact-Job-Success-Score-JSS/td-p/824751
- Fiverr — Success score: https://help.fiverr.com/hc/en-us/articles/21965360854673-Success-score
- Fiverr — Understanding freelancer levels: https://help.fiverr.com/hc/en-us/articles/360010560118-Understanding-Fiverr-s-freelancer-levels
- Fiverr — Top Rated freelancers: https://help.fiverr.com/hc/en-us/articles/15140188560913-Top-Rated-freelancers
- Fiverr — How cancellations work for freelancers: https://help.fiverr.com/hc/en-us/articles/47789995041297-How-cancellations-work-for-freelancers
- Fiverr — How cancellations work: https://help.fiverr.com/hc/en-us/articles/37332594937105-How-cancellations-work
- Fiverr — Seller Plus: https://help.fiverr.com/hc/en-us/articles/360017140717-Seller-Plus-Standard-and-Premium-Advanced-tools-for-business-growth
- Fiverr blog — Level system update 2024: https://blog.fiverr.com/level-systems-update-what-fiverr-sellers-need-to-know/

### 6.9 หน้าทางการ — C2C / โซเชียล

- Carousell — Response Rate: https://support.carousell.com/hc/en-us/articles/115015124207-What-is-Response-Rate
- Carousell — Rating and Review System: https://support.carousell.com/hc/en-us/articles/360018880254-How-does-the-Rating-and-Review-System-work-New-
- Carousell — User Badges and Indicators in Chat: https://support.carousell.com/hc/en-us/articles/36263482237849-Understanding-User-Badges-and-Indicators-in-Chat-A-Guide-to-User-Profiles
- Carousell — Verifying my mobile phone number: https://support.carousell.com/hc/en-us/articles/360000702048-Verifying-my-mobile-phone-number
- Carousell — SingPass identity verification: https://support.carousell.com/hc/en-us/articles/360022583734--Singapore-How-does-SingPass-identity-verification-work
- Mercari US — Seller Badges: https://www.mercari.com/us/help_center/article/288/
- Mercari US — Ratings: https://www.mercari.com/us/help_center/article/380/
- Mercari US — Verification and Badges: https://www.mercari.com/us/help_center/topics/account/guides/verification-and-badges/
- Mercari JP — ระบบให้คะแนน 良かった/残念だった: https://help.jp.mercari.com/guide/articles/1016/
- Facebook — Marketplace seller ratings (≥5 ratings): https://www.facebook.com/help/915385548593204
- Facebook — Marketplace profile: https://www.facebook.com/help/2912273018986831
- Facebook — Rate a seller (แอปมือถือเท่านั้น): https://www.facebook.com/help/1049892879215022
- Facebook — Marketplace seller badges: https://www.facebook.com/help/1684084458520855
- Facebook — Page "Very responsive" badge (คนละระบบ): https://www.facebook.com/business/help/201893553741970
- Meta Verified: https://www.meta.com/meta-verified/
- Meta Verified for businesses (ประกาศ): https://about.fb.com/news/2023/09/meta-verified-for-businesses/
- Meta Verified — eligibility: https://www.facebook.com/business/help/248456111431653
- LINE — official account icon colors: https://help.line.me/line/?contentId=20018637
- LINE — official account types: https://help2.line.me/official_account_jp/web/?contentId=20011726&lang=en
- LINE — verification application (JP/TW/TH เท่านั้น): https://help2.line.me/official_account_th/web/categoryId/200000074/pc?lang=en
- LINE for Business TH — Verified Account: https://lineforbusiness.com/th/service/line-official-account/verified-account

### 6.10 หน้าทางการ — Grab / LINE MAN (ไทย)

- Grab — reviews & ratings: https://www.grab.com/inside-grab/stories/grab-food-delivery-reviews-ratings/
- Grab TH — food blog (ฟอร์แมต Rating/รีวิว): https://www.grab.com/th/en/food-blog/
- Grab — Code of Conduct: Merchant TH: https://www.grab.com/th/en/terms-policies/code-of-conduct-merchant/
- Grab — GrabThumbsUp Awards 2025: https://www.grab.com/th/en/press/others/gtuawards2025/
- LMWN — Rating & Review บนแอป LINE MAN: https://linemanwongnai.my.salesforce-sites.com/wongnai/wnarticles?id=Rating-Review-%E0%B8%9A%E0%B8%99%E0%B9%81%E0%B8%AD%E0%B8%9B%E0%B8%9E%E0%B8%A5%E0%B8%B4%E0%B9%80%E0%B8%84%E0%B8%8A%E0%B8%B1%E0%B8%99-LINE-MAN
- LMWN — วิธีตรวจสอบคุณภาพร้านค้า (rating ≥4.7, ยกเลิก <2%): https://linemanwongnai.my.salesforce-sites.com/wongnai/wnarticles?id=restaurant-metric
- LMWN — Users' Choice Best of 2026: https://www.wongnai.com/news/line-man-wongnai-users-choice-2026
- LMWN Merchant Center — Users' Choice รายไตรมาส: https://www.lmwnmerchantcenter.com/news-content/crm-campaign-jul-sep-2025

### 6.11 หน้าทางการ Lazada ที่ถูก gate (อ้างอิงได้แต่ยืนยันเนื้อหาไม่ได้)

- Summary of Seller Metrics (SG): https://sellercenter.lazada.sg/seller/helpcenter/summary-of-seller-metrics-15337.html
- Disputes Against Cancellation Rate (MY): https://sellercenter.lazada.com.my/seller/helpcenter/disputes-against-cancellation-rate-metrics-15572.html
- LazMall Seller Performance Assessment Cycle: https://sellercenter.lazada.com.my/seller/helpcenter/LazMall-Seller-Performance-Assessment-Cycle.html

### 6.12 งานวิจัย UX

- **Baymard Institute — Always Show the Number of User Ratings in List Items:** https://baymard.com/blog/user-perception-of-product-ratings
- Baymard — Sort with Both Ratings Average and Number of Ratings: https://baymard.com/blog/sort-by-customer-ratings

### 6.13 บทความบุคคลที่สาม (ความน่าเชื่อถือต่ำกว่า — ใช้เมื่อหน้าทางการเข้าไม่ได้)

- BigSeller — Lazada Store Health: https://help.bigseller.com/en_US/detailPage/10/1/5207/content
- BigSeller — Lazada Cancellation Rate: https://www.bigseller.com/blog/articleDetails/4341/lazada-seller-cancellation-.htm
- BigSeller — LazPick ไทย: https://www.bigseller.com/blog/articleDetails/187/Lazada-LazPick-Program.htm
- BigSeller — Shopee NFR: https://www.bigseller.com/blog/articleDetails/3618/shopee-non-fulfillment-rate.htm
- duoke — Chat Response Rate Guide 2026 (Lazada/Shopee/TikTok): https://www.duoke.com/en/blog/article/398-Malaysia-E-commerce-Chat-Response-Rate-Complete-Guide-2026-Lazada-Shopee-and-TikTok-Shop
- PayRecon — How to Become Shopee Preferred Seller 2025: https://payrecon.my/how-do-you-become-a-preferred-seller-on-shopee/
- carry.co.th — ร้านค้าต้องรับมือยังไง เมื่อโดนลดคะแนนความประพฤติ Shopee: https://blog.carry.co.th/shopee-penalty-points-appeal/
- Cosmo Sourcing — Alibaba Verified Suppliers: https://www.cosmosourcing.com/blog/what-are-alibaba-verified-suppliers
- Baidu Baike — Taobao credit rating: https://baike.baidu.com/en/item/Taobao%20credit%20rating/1454525
- Pantip — Shopee ลูกค้าไม่กดรับสินค้า (auto-confirm timer): https://pantip.com/topic/41784197
