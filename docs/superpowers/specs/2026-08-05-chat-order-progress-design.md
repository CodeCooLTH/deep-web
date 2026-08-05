# Order Progress ในห้องแชท — Design Spec

> 2026-08-05 · สถานะ: รอ user review
> Mockup ประกบ: `2026-08-05-chat-order-progress-mockup.html` (3 จอ: Mobile/Tablet/Desktop + states)

## เป้าหมาย

แชทไหนที่มีคำสั่งซื้อผูกอยู่ (ผ่าน Customer ของเธรด) แอดมินต้องเห็น "ของถึงไหนแล้ว"
ได้จากในห้องแชทนั้นทันที ไม่ต้องสลับไปหน้า /orders — ตอบคำถามยอดฮิตของลูกค้า
"ของถึงไหนแล้ว" ได้โดยไม่เสียจังหวะคุย

## การตัดสินใจ (เคาะกับ user แล้ว)

| เรื่อง | ตัดสินใจ |
|---|---|
| ตำแหน่ง (mobile/tablet) | แถบปักใต้หัวเธรด **ยุบเป็นค่าตั้งต้น** แตะแล้วกางเห็นทุกใบ + timeline ในการ์ดออเดอร์ด้วย |
| ตำแหน่ง (desktop) | **timeline ในการ์ดออเดอร์** (bubble ในเธรด + แท็บคำสั่งซื้อใน right panel) — ไม่มีแถบปัก เพราะ right panel เห็น progress ทุกใบอยู่แล้วแม้ bubble เลื่อนหาย · **breakpoint จริง = 1280px (`xl:`)** ตรงกับ `xl:block` ของ CustomerPanel — ไม่ใช่ 1024 (ux gate ตรวจพบ 2026-08-05: ช่วง 1024-1279 iPad Pro ยังใช้ sheet จึงต้องได้แถบปัก) |
| ขอบเขตออเดอร์ | ทุกใบที่ **ยังไม่จบงาน** (`deriveShippingStage() !== 'DONE'`) — ยุบเหลือใบล่าสุด 1 บรรทัด กางเห็นครบ |
| รูปแบบ | **Stepper 4 ขั้น** ตาม `SHIPMENT_STAGES`: สร้างพัสดุ → รับเข้าระบบแล้ว → กำลังจัดส่ง → จัดส่งสำเร็จ + หัวบล็อกโลโก้ขนส่ง/เลขพัสดุ/ปุ่มคัดลอก (ตาม ref รูปที่ user ส่ง) |
| สี | ยึดกติกา `describeProgress().tone` เดิม: กำลังเดินทาง = primary น้ำเงินทุกจุดที่ถึง / delivered = เขียวทั้งแถบ / ตีกลับ-หมดอายุ = เทา (ref ใช้เขียว+น้ำเงินผสม → ปรับตามธีมเราตามกฎ reference-vs-theme) |

## SSOT ที่ต้องใช้ซ้ำ (ห้ามเขียนใหม่)

- `src/lib/iship/status.ts` — `SHIPMENT_STAGES` (4 ขั้น + icon), `describeProgress()` (สถานะ → stage 0-3 + tone + notice), `NOTICE_OF`
- `src/lib/order-stage.ts` — `deriveShippingStage()` (ตัดสิน "ยังไม่จบงาน"), `ORDER_STAGE_META` (ชิปใบที่ยังไม่มีพัสดุ)
- `src/lib/iship/courier.ts` — `courierLogoUrl()` (โลโก้ขนส่งระดับแบรนด์)
- โครง stepper: ยก markup จาก `src/components/safepay/iship/ShipmentStatusView.tsx` (STAGE_DOT/STAGE_LINE — Base: อ้างไฟล์นี้ใน commit)
- แถบปัก: pattern จาก `ThreadStatusBar.tsx` (ยุบ 1 บรรทัด + กาง + truncate + ปุ่มย่อ)

## องค์ประกอบ

### 1) `OrderCardView` — เพิ่ม section พัสดุ (ทุกจอ)

แทนแถวข้อความ "พัสดุ · Flash · TH…" เดิม (บรรทัด 80-89) ด้วยบล็อกใหม่ท้ายการ์ด:

- **มีพัสดุ active:** โลโก้ขนส่ง (34px rounded) + ชื่อขนส่ง (11px, default-700) + เลขพัสดุ (bold tabular-nums) + ปุ่มคัดลอก → ใต้ลงมาเป็น stepper 4 จุด (dot 26px + เส้นเชื่อม + label 2xs)
- **ยังไม่มีพัสดุ:** ชิปสถานะจาก `ORDER_STAGE_META` เช่น "สั่งซื้อแล้ว · รอเลขพัสดุ" (bg-primary/15 text-primary-ink)
- **พัสดุมีปัญหา:** stepper ค้างจุดที่ไปถึง + กล่อง notice จาก `NOTICE_OF` (bg-danger/15 text-danger-ink)
- **ยกเลิก:** ชิป danger เดิมของการ์ด — ไม่มี timeline
- **งานไม่มีการส่งของ:** ตัดสินด้วย **`fulfillmentMode === 'NO_SHIPPING'` เท่านั้น ห้ามเช็ค `Order.type`** (guard ใน `src/lib/iship/eligibility.ts` — ร้านบริการที่ส่งอุปกรณ์ได้มี SHIPPED) → ชิปสถานะอย่างเดียว ไม่มี stepper
- data prop ขยาย: `shipment` เพิ่ม `carrierStatus`, `shipmentStatus`, `courierCode` (ให้ `describeProgress` + `courierLogoUrl` ทำงานได้)

### 2) แถบปักใต้หัวเธรด (mobile/tablet เท่านั้น — ซ่อนที่ breakpoint ที่ right panel โผล่)

- **ยุบ (ค่าตั้งต้นเสมอ — ไม่จำสถานะกาง):** `[icon truck] DP…F054 · กำลังจัดส่ง [+N] [chevron]` — โทน bg-primary/12 text-primary-ink (ไม่ใช่ warning/danger เพราะไม่ใช่ alert)
- **กาง:** การ์ดย่อยต่อใบ — เลขออเดอร์ + ชิป stage + ยอด + stepper ย่อ (dot 20px) + บรรทัดขนส่ง·เลขพัสดุ; ใบไม่มีพัสดุ = ชิป + วันที่สั่ง; ท้ายสุดปุ่ม "ย่อสถานะออเดอร์"
- แตะการ์ดใบไหน → เปิดโมดัลพัสดุเดิม (`ShipmentStatusView`) ของใบนั้น
- ไม่มีใบค้าง → ไม่มีแถบ (ไม่กินพื้นที่)
- อยู่ร่วมกับ `ThreadStatusBar` เดิม: order-progress อยู่ **ใต้** ThreadStatusBar (alert สำคัญกว่า)

### 3) ข้อมูล

- ต่อยอด `GET /api/chat/conversations/[id]/orders` (ผูกผ่าน Customer อยู่แล้ว, IDOR guard เดิม) — เพิ่ม field ต่อ item: `carrierStatus`, `shipmentStatus`, `courierCode`, `paymentMethod`, `codReceivedAt`, `labelPrintedAt`, `hasShipment`
- แถบปักใช้ query เดียวกัน (filter ฝั่ง client ด้วย `deriveShippingStage`) — โหลดครั้งเดียวตอนเปิดเธรด ไม่ polling; realtime อัปเดตรอบหน้า (ตอนนี้สถานะพัสดุเปลี่ยนช้าเป็นชั่วโมง ไม่คุ้ม subscribe เพิ่ม)
- bubble ORDER ในเธรด: enrich ที่ server ตอนประกอบ message (จุดเดียวกับที่เติม `shipment` เดิม)

## Edge cases

- ออเดอร์เก่าไม่มี `courierName`/โลโก้ไม่รู้จัก → fallback ไอคอน `truck-delivery` ใน box default-100 (ห้ามเว้นว่าง)
- `return_success` → ป้ายขั้นสุดท้ายใช้ `progress.lastLabel` (ไม่ใช่ "จัดส่งสำเร็จ") — พฤติกรรมเดิมของ `describeProgress`
- COD ส่งถึงแล้วแต่ยังไม่กดรับเงิน (`AWAITING_COD`) → ยังนับเป็น "ไม่จบงาน" โผล่ในแถบ (ได้ฟรีจาก `deriveShippingStage`)
- คัดลอกเลขพัสดุบน dev ที่ไม่ใช่ https → toast เตือนแบบเดียวกับ `ShipmentStatusView` (pacesToast)
- Dark mode: ใช้ token เดิมทั้งหมด (มี override ฝั่ง dark แล้ว) — ห้าม hardcode hex

## Out of scope

- Realtime push สถานะพัสดุเข้าแถบ (รอบหน้า)
- ปุ่ม action ในแถบปัก (พิมพ์ใบปะหน้า ฯลฯ) — กดเข้าโมดัลเดิมแทน
- ฝั่ง buyer (`/o/{token}`) — งานนี้เฉพาะ seller inbox

## Hard-rule checklist ตอน implement

- ผ่าน `safepay-ux` ก่อนแตะโค้ด (HR8) + Impeccable CLI gate หลัง build
- Commit มี `Base:` ชี้ `ShipmentStatusView.tsx` / `ThreadStatusBar.tsx` (HR3)
- Paces primitive เท่านั้น ห้าม arbitrary value (HR7) · ห้าม emoji ใช้ tabler icon (HR12)
- toast = `pacesToast` (HR9)

## Resolution (2026-08-05 — เคาะระหว่าง implement, โหมด autonomous)

- ชิปสถานะในการ์ดออเดอร์ **ไม่หมดอายุ** — เรียก `deriveOrderStage(order, now = statusAt)` ปิด age-decay (ป้ายในลิสต์แชทยังหายตามเดิม — คนละบริบท)
- ใบ AWAITING_COD ในการ์ด: stepper เขียวเต็ม (ของถึงจริง) + notice info "ส่งถึงแล้ว — รอยืนยันรับเงินปลายทาง" กันงงว่าทำไมยังค้างในแถบ
- แถบกางเกิน ~4 ใบ: scroll ภายใน `max-h-80 overflow-y-auto` (ไม่ cap จำนวน)
- แถบยุบใช้ `bg-primary/15` (ไม่ใช่ /12 ตามแผน) — ให้ตรง pattern `/15` ของ ThreadStatusBar/ชิปทั้งระบบ
