# ทางลัดระบบนัดหมาย 3 จุด — ปุ่มปฏิทินในแชท · ไทล์นัดวันนี้ · `/queues` มือถือ

- **วันที่:** 2026-08-10
- **ร้านที่เกี่ยวข้อง:** `Shop.vertical === 'SERVICE_QUEUE'` เท่านั้น (ต่อยอด feature 00024 + 00036 + 00018)
- **Mockup:** `docs/superpowers/specs/2026-08-10-appointment-quick-access-mockup.html` (มือถือ / แท็บเล็ต / เดสก์ท็อป)
- **ux gate:** ผ่านแล้ว (safepay-ux 2026-08-10, Mode: Operate) — HR8
- **สถานะ:** user อนุมัติทิศทาง + เคาะ open questions ครบแล้ว

---

## 1. โจทย์ (คำสั่ง user 2026-08-10)

1. หน้าแชทควรมีไอคอนปฏิทินข้างปุ่ม AI กดแล้วเห็นตารางนัด เลือกวันได้เลย แล้วส่งต่อให้โมดัลสร้างงานบริการ — "จะได้ลดขั้นตอน"
2. ไทล์บน Mobile Command Center (รอดำเนินการ / นัดวันนี้ / สำเร็จ / ยกเลิก) ต้องพาไปที่รายการออเดอร์
3. หน้า "คิวงาน" บนมือถือควรแสดงผังเดียวกับชีตเลือกวันและเวลา (ดูอย่างเดียวก็พอ)

## 2. สิ่งที่เป็นอยู่ก่อนรอบนี้ (ยืนยันจากโค้ด ไม่ใช่ความจำ)

| จุด | สภาพจริง |
|---|---|
| แถบเครื่องมือแชท | 7 ปุ่ม (`bolt` `package` `paperclip` `mood-smile` `sticker` `sparkles` + สร้างออเดอร์ `ms-auto md:hidden`) — ที่ 320px กว้างรวม ~283/288px **เต็มพอดีอยู่แล้ว** |
| ไทล์หน้าแรก | รอดำเนินการ/สำเร็จ/ยกเลิก → `/orders?status=…` **ทำงานอยู่แล้ว** · นัดวันนี้ → `/queues` |
| `/orders` | มี 3 แกนกรอง `?status=` `?stage=` `?appt=` + `dateFilter` ฝั่ง client ซึ่งกรองบน `createdAtISO` = **วันที่สั่งซื้อ ไม่ใช่วันนัด** |
| `/queues` | `AppointmentCalendar` (FullCalendar) สลับมือถือ/เดสก์ท็อปด้วย `matchMedia('(max-width: 767px)')` → มือถือได้ `listWeek` |
| `AppointmentDateSheet` | ชีตเต็มจอ 1777 บรรทัด: ปฏิทินเดือน + รายการนัดของวันที่จิ้ม + ปุ่มยืนยัน · **ต้องมี `resourceId` ถึงจะโหลดข้อมูล** (`loadRange` early-return) · ทุก breakpoint เป็น container query `@3xl`/`@5xl` |
| `OrderCreateForm` | รับ `?appointmentDate=YYYY-MM-DD` อยู่แล้ว → `setValue('appointment.date')` + สั่ง `CartPanel` กาง accordion |

## 3. มติที่ user เคาะ

| # | คำถาม | คำตอบ |
|---|---|---|
| D-1 | ไทล์ไหนที่ยังไม่ถูกต้อง | 3 ใบแรกไปได้อยู่แล้ว · **"นัดวันนี้" ต้องไป `/orders` ด้วย** |
| D-2 | แชท: ส่งต่อโมดัลตอนไหน | **เลือกวัน → เลือกเวลา → ส่งต่อ** (ครบทั้ง 2 ขั้นในชีต) |
| D-3 | ปฏิทินจากแชทดูคิวไหน | **รวมทุกคิว** (ภาพรวมทั้งร้าน) |
| D-4 | `/queues` เปลี่ยนแค่ไหน | **มือถือเท่านั้น** เดสก์ท็อปคงเดิม |
| D-5 | ไอคอนปุ่มใหม่ | **`calendar-plus`** |
| D-6 | เส้น breakpoint ของ `/queues` | **ย้าย 768 → 1024 (`lg`)** ให้ตรงกับ shell ของแอปทั้งตัว |

## 4. สถาปัตยกรรม

```
src/lib/appointment-day.ts            [ใหม่]  SSOT "นัดคาบเกี่ยววันนี้" — ใช้ทั้ง Prisma where และ predicate ฝั่ง client
src/components/safepay/appointment-month-board/
  AppointmentMonthBoard.tsx           [ใหม่]  ปฏิทินเดือน + รายการนัดของวัน (สกัดจาก AppointmentDateSheet)
```

ผู้ใช้ `AppointmentMonthBoard` 3 บริบท:

| จุดที่ต่างกัน | (1) ชีต `/orders/new` (เดิม) | (2) ชีตจากแชท (ใหม่) | (3) `/queues` มือถือ (ใหม่) |
|---|---|---|---|
| ขอบเขตข้อมูล | คิวเดียว (`resourceId`) | **รวมทุกคิว** | รวมทุกคิว + ดรอปดาวน์เลือกคิว |
| ปุ่มยืนยันล่าง | มี | มี | **ไม่มี** |
| ขั้นเลือกเวลา | มี (granularity=TIME) | มี | **ไม่มี** |
| กดแถวรายการ | ไม่ทำอะไร | ไม่ทำอะไร | **ไป `/orders/{token}`** |
| ปุ่ม `+` ต่อวัน | ไม่มี | ไม่มี | **มี** → `/orders/new?appointmentDate=` |
| จำกัดความสูงรายการ | `max-h-48` บางโหมด | เหมือน (1) | **ไม่จำกัด** (เลื่อนไปกับหน้า) |

## 5. ส่วน A — ปุ่มปฏิทินในแชท

**ปุ่ม** — `ChatThread.tsx` แถบเครื่องมือ ถัดจากปุ่ม AI ก่อนปุ่มสร้างออเดอร์
- ไอคอน `calendar-plus` · สีตั้งต้น `text-default-600` + `hover:bg-primary/10` (**ไม่ tint ค้าง** — แถวนี้มี accent อยู่แล้ว 2 ตัวคือ AI=success และสร้างออเดอร์=primary การเพิ่มตัวที่ 3 กระจาย accent เกิน One Voice)
- `aria-label`/`title` = "ดูตารางว่างคิวงาน"
- เงื่อนไขแสดง: `vertical === 'SERVICE_QUEUE'` **และมีคิวงานที่เปิดใช้อย่างน้อย 1 ใบ** — ไม่มีคิวเลย = ซ่อนปุ่ม (ไม่ใช่เปิดชีตเปล่า)

**งบพื้นที่** — เพิ่ม `flex-wrap` ที่ `div.mb-2.flex.items-center.gap-1`
- worst case (SERVICE_QUEUE + ช่องทางที่ส่งสติกเกอร์ได้) = 8 ปุ่ม ≈ 324px > 288px → ปุ่มสร้างออเดอร์ (`ms-auto`) ตกลงบรรทัดสองแล้วชิดขวาในบรรทัดตัวเอง
- กรณีอื่นยังเป็นแถวเดียวเหมือนเดิมทุกประการ
- **ไม่ใช้เมนู `⋯`** — user ปฏิเสธการซ่อน shortcut ไปแล้ว 2026-08-07 · precedent ของ `flex-wrap` อยู่ที่ `OrdersTable.tsx:766` (`flex flex-wrap … lg:flex-nowrap`) แก้ปัญหาคลาสเดียวกัน

**ชีตโหมด aggregate** — `AppointmentDateSheet` รับ prop ใหม่ `aggregateResources?: {id,name,capacity}[]` (ใช้แทน `resourceId` ไม่ใช้คู่กัน)
- `loadRange` เลิก early-return เมื่อไม่มี `resourceId` → ยิง `/api/shops/current/appointments?from=&to=` (endpoint รองรับการละ `resourceId` อยู่แล้ว)
- ความจุของวัน = ผลรวม `capacity` ของคิวที่ `isActive` (สูตรเดียวกับ `totalCapacity` ใน `AppointmentCalendar.tsx:230`)
- `AppointmentItem` เพิ่ม `resource: { id, name } | null` (endpoint ส่งมาอยู่แล้ว แค่ไฟล์นี้ไม่เคยประกาศ)
- แถวรายการเปลี่ยนบรรทัดชื่อเป็น `{resourceName} · {buyerName}` (สูตรเดียวกับ `base` ใน `AppointmentCalendar.tsx:280`) — **ไม่เพิ่มบรรทัด ไม่เพิ่มความสูงแถว**
- หัวชีต: บรรทัดรองเป็น "ภาพรวมทุกคิวงาน · รับได้รวม N คิว" แทนชื่อคิวเดี่ยว
- 🛑 **บรรทัดเตือนใต้หัวชีต (เฉพาะโหมดนี้):** "ตัวเลขนับรวมทุกคิวงาน — ระบบจะแยกเช็กความว่างอีกครั้งตอนเลือกคิวในฟอร์ม" (`text-default-500 text-xs`) — ตัวเลขที่รวมทุกคิวคือ **ข้อมูลบางส่วนที่หน้าตาเหมือนข้อมูลครบ** ถ้าไม่ติดป้ายผู้ขายจะอ่านว่า "วันนี้ว่าง" แล้วไปเจอคิวที่เลือกเต็ม (`docs/conventions/partial-data-must-be-labeled-or-filled.md`)

**ส่งต่อโมดัล** — `OpenDraftInput` + `ChatDraft` เพิ่ม `appointmentPrefill?: { date; startTime?; endTime?; resourceId? }`
- ส่ง `resourceId` ให้ **ก็ต่อเมื่อคิวที่เปิดใช้เหลือใบเดียว** — หลายคิว = ไม่ส่ง ให้ช่อง "บริการ" คงสถานะ "ยังไม่เลือก" ที่มองเห็นได้ (`ui-complete-state-must-mirror-validation.md`)
- `OrderCreateForm` รับ prop ใหม่ที่ **ชนะ** `?appointmentDate=` (ในแชทไม่มี URL param อยู่แล้ว) แล้ว `setValue` ทั้ง `appointment.date`/`startTime`/`endTime` + สั่ง `CartPanel` กาง accordion เหมือนเส้นทางเดิม
- ร่างของเธรดเปิดค้างอยู่แล้ว → **ยังใส่ค่าให้** ผ่าน patch + seq counter (ต่างจากกติกาของ `prefillText` ที่ห้ามทับ เพราะอันนี้ผู้ขายเพิ่งจงใจเลือกในจังหวะนั้น ไม่ใช่ผลพลอยได้ของการกดปุ่มอื่น)
- 🛑 คอมเมนต์ใน `CustomerPanel.tsx:147-149` ที่เขียนว่า "การจองคิวเป็นคนละหน้าจอ /queues ไม่ใช่ CTA ของแผงลูกค้าในแชทนี้" คือมติเดิมที่รอบนี้กลับทิศ — **ต้องแก้คอมเมนต์ในคอมมิตเดียวกัน** ไม่ปล่อยให้ซอร์สขัดกันเอง

## 6. ส่วน B — ไทล์ "นัดวันนี้" → `/orders?apptDay=today`

**แกนใหม่ `?apptDay=today`** — ไม่ยัดลงใน `?appt=` ซึ่งเป็นแกน *สถานะนัด* (เอาค่าวันที่ไปปนแกนสถานะ = คลาสบั๊กเดียวกับที่ 00028 เจ็บมาแล้ว) · อ่านจาก URL แหล่งเดียวเหมือน `stage`/`appt` ไม่ mirror เป็น state · ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open)

**SSOT `src/lib/appointment-day.ts`**
```
thaiDayRange(dayKey)                    → { from, to }  ขอบวันตามปฏิทินไทย
appointmentOverlapsDayWhere(dayKey)     → Prisma where fragment
appointmentOverlapsDay(row, dayKey)     → predicate บน { startISO, endISO }
```
- ใช้ทั้ง `getTodayAppointmentCount` (ตัวเลขบนไทล์) และตัวกรองใน `OrdersList` → เลขบนไทล์กับจำนวนแถวที่กรองได้ตรงกันเสมอ (BR-SOV-06)
- เทส `[blocker]` พิสูจน์ว่า 2 ทางให้ผลตรงกันบน fixture ชุดเดียว: นัดข้ามคืน · นัดทั้งวัน · `serviceEnd` null · CANCELLED · ขอบเที่ยงคืนไทย

🛑 **แก้ความไม่ตรงที่มีอยู่ก่อนแล้ว:** `getTodayAppointmentCount` คัดด้วย `serviceResourceId != null` แต่แถวใน `/orders` คัดด้วย `serviceStart` (ตาม `deriveAppointmentStage`) — ปล่อยไว้จะได้ "ไทล์บอก 5 กดเข้าไปเจอ 6" ทันทีที่ทำลิงก์นี้ → ยึด **`serviceStart`** ทั้งคู่ · ผลข้างเคียงที่รับรู้: ตัวเลขบนไทล์อาจขยับจากวันนี้ถ้ามีนัดที่ไม่ได้ผูก resource

**UI ของตัวกรอง** — เป็น **แถบ/pill แยก ล้างเองได้** ไม่ใช่สมาชิกของ chip row (คนละแกน — ถ้ายัดเข้าไป ผู้ใช้กด "ทั้งหมด" แล้วจะนึกว่าล้างครบ ทั้งที่ apptDay ยังค้าง)
- มือถือ: แถบเหนือ chip row — "กำลังดูเฉพาะนัดวันนี้ · N รายการ" + ปุ่ม "ล้าง"
- เดสก์ท็อป: pill `badge bg-primary text-white` + ปุ่ม `×` วางก่อนดรอปดาวน์ตัวแรกใน toolbar
- ปุ่มล้างต้องเป็น `<button>` มี `aria-label="ล้างตัวกรองนัดวันนี้"` + ขยาย hit-area ด้วย padding (badge เปล่าเล็กกว่า 44px — `aria-name-requires-supporting-role.md`)

**ลำดับการกรอง** — `apptDay` กรองเป็นชั้นแรก และ **ตัวนับบนชิปสถานะนัด (`apptCounts`) ต้องคำนวณจากชุดที่ผ่าน apptDay แล้ว** ไม่ใช่จาก `orders` ดิบ ไม่งั้นชิปบอก 5 แต่กรองได้ 2

**ไทล์** — `OrderStatusBand.tsx:189` `href: '/queues'` → `` `/orders?apptDay=today` ``

**Empty state** — วันนี้ไม่มีนัด: "วันนี้ยังไม่มีนัดเข้ามา" + action "ดูนัดหมายทั้งหมด" → `/orders` · ถ้ามีชิปสถานะนัดกรองซ้อนอยู่ด้วย ข้อความต้องบอกทั้งสองเงื่อนไข ("ไม่มีนัดวันนี้ในสถานะที่เลือก")

## 7. ส่วน C — `/queues` มือถือ

- `<lg` แทนการ์ดปฏิทินเดิมด้วย `AppointmentMonthBoard` (read-only) · `≥lg` คง FullCalendar เดิมทุกบรรทัด · `ResourceList` + `GranularitySetting` อยู่ใต้เหมือนเดิม
- ห่อด้วย `.card` เหมือนพี่น้องในหน้าเดียวกัน · หัวการ์ด + `form-select` เลือกคิว **คงคลาสเดิมทุกตัว** (`sibling-surface-parity.md`)
- ปฏิทิน+รายการเลื่อนไปกับหน้า ไม่ใช่กล่อง overflow แยก (อยู่ในหน้าเต็ม ไม่ใช่ชีตจำกัดความสูง)
- แถวรายการกดได้ → `/orders/{token}` · ปุ่ม `+` ต่อวันคงพฤติกรรมเดิม (รวม toast เตือนวันเต็ม)
- `matchMedia('(max-width:767px)')` + state `isMobile` ถูกถอดออก เปลี่ยนเป็น `lg:hidden` / `hidden lg:block` (D-6)

## 8. ความเสี่ยง

| # | ความเสี่ยง | การรับมือ |
|---|---|---|
| R-1 | สกัด component ออกจากไฟล์ 1777 บรรทัดที่ใช้อยู่ 2 ที่บน prod (`/orders/new` + ชีตเลื่อนนัด) | ทำเป็น task แรก **แยกคอมมิต** ยืนยันว่าจอเดิมไม่เปลี่ยนก่อนต่อยอด |
| R-2 | container query `@3xl`/`@5xl` ของชีตหลุดกลายเป็น `md:`/`lg:` | บั๊กที่ user เจอ 2026-08-08 — ห้ามแตะ ต้องเดินทางไปกับ component ที่สกัด |
| R-3 | `flex-wrap` ที่ toolbar แชทไปกระทบแผงอิโมจิ/สติกเกอร์ที่ยึด parent เป็น `absolute` | แผงยึดกับ `div.relative` ของปุ่มตัวเอง ไม่ใช่ยึดแถว — wrap ไม่ย้ายจุดยึด แต่ต้องยืนยันด้วยตาบนจอแคบ |
| R-4 | ตัวเลขไทล์ "นัดวันนี้" ขยับหลังเปลี่ยนเกณฑ์ | ตั้งใจ — เกณฑ์เดิมสองที่ไม่ตรงกันอยู่แล้ว บันทึกไว้ที่ §6 |

## 9. นอกขอบเขต

- แกน `?apptDay=` ค่าอื่นนอกจาก `today` (พรุ่งนี้/สัปดาห์นี้) — ยังไม่มีใครขอ
- การลากย้ายนัดในปฏิทิน (ยังปิดอยู่ตามเดิม)
- เดสก์ท็อป `/queues` (คงเดิมตาม D-4)
- ปุ่มปฏิทินในแชทสำหรับร้าน `ONLINE_SALES` / `LODGING` (ไม่มีคิวงาน)
