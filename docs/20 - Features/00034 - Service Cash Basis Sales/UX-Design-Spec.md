---
title: "UX Design Spec — 00034 ยอดขายเกณฑ์เงินสดสำหรับร้านบริการ"
owner: shinobu22
status: draft
module: M00034-ServiceCashBasisSales
version: "1.0"
created: 2026-08-07
tags: [feature, ux, design-spec, service-queue, paces]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]"]
---

> **Gate:** Hard Rule 8 — `safepay-ux` (ผ่านแล้ว 2026-08-07)
> **Surface:** `(paces)/seller/**` (Paces) — vertical `SERVICE_QUEUE` เท่านั้น
> **อ้างอิงมติ:** `docs/superpowers/specs/2026-08-07-service-sales-chart-deposit-design.md` (D-1..D-7 = user เคาะแล้ว ห้ามขัด) + mockup `2026-08-07-service-sales-chart-deposit-mockup.html`

## Controller resolution ของ Open questions (2026-08-07)

| # | คำถามจาก ux | มติ |
|---|---|---|
| 3 | บันทึก `OrderEvent` ไหม | **บันทึก** (D-9) → `AppointmentCard` ต้องมีบรรทัด "บันทึกเมื่อ {occurredAt}" ใต้ badge terminal ตามที่ ux เขียนเงื่อนไขไว้ |
| 2 | ชื่อ endpoint รับมัดจำ | ใช้ `PATCH /api/orders/[token]/deposit-received` ตามที่ ux เสนอ แต่ตัด segment `appointment` ออก เพราะมัดจำไม่ผูกกับนัด (งานที่ไม่มี `serviceStart` ก็มีมัดจำได้ — ดู Edge states) — ยืนยันใน [[API]] |
| 1 | ghost overflow เกิน 2 ตัว | รับ resolution rule ที่ ux เสนอ + **บังคับให้เขียน unit test** ใน `order-action-set.test.ts` ครอบ combination นี้ |
| 4 | `ServiceSalesChartSheet` เต็มรูป | ยังไม่ออกแบบ — **ต้องกลับมาที่ ux gate อีกรอบก่อน implement ชีต** (Hard Rule 8 บังคับทุกรอบ) |

---

# Design Spec

## หน้า/component ที่ครอบ

1. `SalesChartCard` → **`ServiceSalesChartCard.tsx`** (ไฟล์ใหม่) บน Command Center (`dashboard/page.tsx`, mobile-only surface)
2. `AppointmentBlock.tsx` — checkbox "รับเงินมัดจำแล้ว"
3. `orders/[token]` — การ์ดใหม่ **`AppointmentCard.tsx`** (ปุ่มรับมัดจำ + ปิดงาน) ต่อยอด `order-action-set.ts` / `OrderActionBar.tsx` เดิม

### User stories ที่ครอบ
- ในฐานะร้านบริการ ฉันอยากเห็นยอดขายที่ "เข้ามือจริง" แยกจากยอดที่ยังรอ เพื่อวางแผนเงินสดได้ถูก
- ในฐานะร้านบริการ ฉันอยากบอกระบบว่ารับมัดจำแล้วหรือยัง โดยไม่ต้องแนบสลิป (BR-RSV-49/50)
- ในฐานะร้านบริการ ฉันอยากกดปิดงาน (เสร็จสิ้น/ไม่มาตามนัด) จากหน้าออเดอร์ได้จริง (ปัจจุบันกดไม่ได้เลย — dead feature ตั้งแต่ 00024)

---

## 1) การ์ดยอดขาย Command Center — `ServiceSalesChartCard.tsx`

### ทำไมแยกไฟล์ ไม่แก้ `SalesChartCard.tsx` เดิม

`SalesChartCard.tsx` ปัจจุบันคือไฟล์ที่ผ่านการดีบักละเอียดมากมาแล้ว (มี comment อธิบายบั๊กที่แก้ไปแล้วนับสิบจุด — label สองชั้น, mask future, annotation points ฯลฯ) และ field ของมัน (`confirmedValues`/`unconfirmedValues`/`orderCounts`) ผูกกับความหมาย ONLINE_SALES ตรง ๆ ตามที่ design doc ยืนยันเอง ("คง confirmedValues/unconfirmedValues ไว้ให้ vertical อื่นใช้ต่อ ไม่รื้อ") SERVICE_QUEUE มี 4-series + ไม่มีเส้นจำนวนออเดอร์เลย — เป็นรูปทรงคนละแบบ ไม่ใช่แค่เปลี่ยนสี ผสม branching เข้าไปในไฟล์เดิมจะเพิ่มความเสี่ยง regression กับ ONLINE_SALES โดยไม่จำเป็น

- **Base (in-app precedent, โครง shell/pill/hero/chevron-open-sheet ก็อปมาทั้งชุด):** `src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartCard.tsx`
- **Base (chart primitive, HR10):** `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx` (ผ่าน `@/components/wrappers/ApexChart` เท่านั้น)
- **สี:** `getColor('warning'|'success'|'primary'|'danger'|'chart-border-color'|'warning-ink'|'default-700')` เท่านั้น — ห้าม hardcode hex (mockup ใช้ hex ตรง ๆ เพราะเป็นไฟล์สาธิตนอกระบบ ต้องแปลงเป็น `getColor()` ทั้งหมดตอน implement)

`dashboard/page.tsx` เลือก render `ServiceSalesChartCard` แทน `SalesChartCard` เมื่อ `shop.vertical === 'SERVICE_QUEUE'` (เงื่อนไขเดียวกับที่คุมเมนู/onboarding ทั้งระบบอยู่แล้ว)

### Layout — แท็บ "เดือนนี้" (มือถือ ~375px)

```
┌ .card !p-4 ──────────────────────────────────┐
│ [icon] ยอดขาย                [วันนี้|เดือนนี้●]│  ← เหมือนเดิม 100%
│                                                │
│  8,300                                    ›   │  ← hero = มัดจำ+เสร็จสิ้น เท่านั้น
│  ▲ 12% จากเดือนก่อน                            │  ← เหมือนเดิม (pctChangeVsPrev)
│                                                │
│  ● มัดจำ 3,100      ● เสร็จสิ้น 5,200         │  ← grid-cols-2
│  ▨ วันเข้ารับบริการ 18,000  ▨ เลยวันนัด 900   │  ← ช่องแดงซ่อนเมื่อไม่มีนัดค้าง (D-2)
│                                                │
│  [กราฟแท่งซ้อน 4 ชั้น 31 วัน + เส้นประ "วันนี้"]│
│  1        7↑      10   15  20  25    31       │
└────────────────────────────────────────────────┘
```

`●` = จุดกลมทึบ (`bg-warning`/`bg-success`) · `▨` = สี่เหลี่ยมขอบประ ไม่ทึบ (`border border-dashed border-primary`/`border-danger`) — แทน pattern ทแยงของ mockup ที่ไม่มี primitive ตรงในธีม (ดู Design decisions #2)

### แท็บ "วันนี้" (14 วัน, D-6 — 2 สีล้วน ไม่มีลายทาง)

```
  2,300                                     ›
  ▲ 31% จากค่าเฉลี่ย 14 วัน
  ● มัดจำ 800      ● เสร็จสิ้น 1,500          ← grid-cols-2, 2 ช่องพอดี 1 แถว
  [กราฟแท่งซ้อน 2 ชั้น 14 วัน + เส้นค่าเฉลี่ย]
```

### Section breakdown

- **Hero + %chg:** โครงเดิมเป๊ะ (`text-4xl font-extrabold tracking-tight tabular-nums` — Metric ramp ของ DESIGN.md) แค่เปลี่ยนสูตร: `heroValue = isToday ? (todayDeposit+todayCompleted) : (totalDeposit+totalCompleted)`. `pctChangeVsPrev` ใช้ตัวเดียวกันเป๊ะ แค่ feed เลขคนละสูตร — ห้ามเขียนสูตร % ใหม่
- **Legend:** เปลี่ยนจาก `flex flex-wrap` → **`grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs`** โดยตั้งใจ เพราะป้าย "วันเข้ารับบริการ" ยาวกว่าป้ายเดิมทุกตัว วัดรวมแล้วเกิน 330px แน่นอน (มัดจำ~70px + เสร็จสิ้น~75px + วันเข้ารับบริการ~120px + เลยวันนัด~75px + gap 3×16px ≈ 388px) ถ้าปล่อย flex-wrap ตัวห่อจะตัดกลางคำแบบเดายาก — grid-cols-2 บังคับ 2 คอลัมน์เท่ากันเสมอ จับคู่เชิงความหมาย: แถวบน = เงินที่เข้าแล้ว แถวล่าง = เงินที่รอ
- **ซ่อนช่องแดง:** เฉพาะช่อง "เลยวันนัด" ที่ซ่อนเมื่อ `legendOverdue === 0` (D-2) — เมื่อซ่อน ให้ "วันเข้ารับบริการ" ขยับมากิน `col-span-2`
- **แท็บวันนี้:** legend เหลือ 2 ช่อง วางบน grid-cols-2 แถวเดียว — ไม่มีแถวล่าง ไม่มีลายทาง (D-6)
- **ตัดเส้น/ป้ายจำนวนออเดอร์ทั้งหมด** ออกจากแท็บเดือนนี้ของ vertical นี้ (mockup ไม่มี `type:'line'` เลย, legend ไม่มีช่องคำสั่งซื้อ) — ห้ามยกโครงเส้น+ป้ายสองชั้นจากการ์ด ONLINE_SALES มาใส่ เพราะจะชนสี primary/danger ที่ถูกใช้เป็นเส้นขอบลายทางไปแล้ว
- **Chart config (`getMonthOptions`):**
  - `series`: 4 ตัว ตามลำดับ มัดจำ / เสร็จสิ้น / วันเข้ารับบริการ / เลยวันนัด — ทั้งหมด `type:'bar'`, `stacked:true`
  - `colors: [getColor('warning'), getColor('success'), getColor('primary'), getColor('danger')]`
  - `fill: { type: ['solid','solid','pattern','pattern'], opacity: [1,1,.28,.28], pattern: { style:'slantedLines', width:5, height:5, strokeWidth:1.5 } }` — ตรงตาม mockup (ApexCharts JS option ไม่ใช่ Tailwind class → ไม่ติด HR7)
  - `stroke: { show:true, width:[0,0,1.5,1.5], colors:['transparent','transparent', getColor('primary'), getColor('danger')] }`
  - `plotOptions.bar.columnWidth: '92%'` (คงของเดิม การ์ดนี้ยังเป็น 31-bucket เหมือนกัน)
  - `maskFuture()` / เส้นประ "วันนี้" (`annotations.xaxis`) / axis-label anchor (`axisAnchorDays`) — **ใช้ฟังก์ชันเดิมจาก `sales-chart-axis.ts` ตรง ๆ** ไม่เขียนใหม่
  - `dataLabels:false`, `legend:{show:false}`, `tooltip:{enabled:false}` (การ์ดทั้งใบเป็นปุ่ม)
- **แท็บวันนี้ (`getTodayOptions`):** 2 series ล้วน bar, `colors:[getColor('warning'), getColor('success')]`, ไม่มี `fill.pattern`/`stroke` ลายทาง — โครง 14-bucket + เส้นค่าเฉลี่ย (`annotations.yaxis`) ใช้ของเดิมทั้งชุด

> ⚠️ **maskFuture กับแท่งลายทาง:** `maskFuture()` ตัดค่าหลัง `futureFromIndex` เป็น `null` — ใช้กับ **2 ชั้นทึบเท่านั้น** ชั้น "วันเข้ารับบริการ" อยู่ในอนาคตโดยนิยาม ห้าม mask ไม่งั้นแท่งลายทางจะไม่ปรากฏเลยสักแท่ง

### Theme Source Mapping

| Section | Theme/in-app source | Component | หมายเหตุ adapt |
|---|---|---|---|
| Card shell / pill switch / hero / open-sheet button | `src/.../dashboard/components/SalesChartCard.tsx` | ทั้งไฟล์เป็น structural Base | คัดลอกโครง คงพฤติกรรม เปลี่ยนเฉพาะ data/series/legend |
| Chart primitive (stacked bar, colors array, grid) | `theme/paces/Admin/TS/.../widgets/charts/components/FinancialOverview.tsx` | ผ่าน `ApexChart` wrapper | เพิ่ม `fill.pattern` (ApexCharts native option ไม่ใช่ theme markup) |
| Axis anchor / mask-future | `src/.../dashboard/components/sales-chart-axis.ts` | reuse ตรง | ไม่แก้ไฟล์นี้ |
| Legend swatch (จุดกลม) | ของเดิมในการ์ด (`size-2 rounded-full bg-{semantic}`) | reuse | ไม่เปลี่ยน |
| Legend swatch (ลายทาง) | ไม่พบ primitive ตรงในธีม — closest primitive = `border border-dashed border-{semantic} size-2` | ใหม่ (adapt) | ดู Design decisions #2 |

---

## 2) checkbox "รับเงินมัดจำแล้ว" — `AppointmentBlock.tsx`

- **Base (checkbox primitive):** `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx` (`<input type="checkbox" className="form-checkbox" />` + `<label>`)
- **In-app precedent:** `src/app/(paces)/seller/(dashboard)/settings/ShippingSettingsRow.tsx:989-993`

### Layout (แทรกหลังบรรทัด helper text เดิม ~บรรทัด 398-402)

```
มัดจำที่เก็บ
[  500  ] บาท
ลูกค้าจ่ายหน้างานอีก ฿1,500

┌ (แสดงเมื่อ depositAmount > 0 เท่านั้น) ───────
│ ☑ รับเงินมัดจำแล้ว
│    ลูกค้าจ่ายมัดจำที่หน้าร้านแล้ว — ปลดติ๊กถ้ายังไม่ได้รับ
└─────────────────────────────────────────────
```

### Section breakdown

- `<Controller name="appointment.depositReceived" defaultValue={true} />` (D-4) → `<input type="checkbox" id="{idPrefix}-appt-deposit-received" className="form-checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} />` + `<label htmlFor="..." className="text-default-800 text-sm font-medium">รับเงินมัดจำแล้ว</label>` ห่อด้วย `flex items-center gap-2`
- helper: `<p className="text-default-500 mt-1 text-sm">ลูกค้าจ่ายมัดจำที่หน้าร้านแล้ว — ปลดติ๊กถ้ายังไม่ได้รับ</p>` — ไม่ชนกับ helper เดิมของช่องจำนวนเงิน เพราะอยู่คนละบล็อก (บล็อกเดิมพูดเรื่อง "เหลืออีกเท่าไหร่" บล็อกใหม่พูดเรื่อง "รับมัดจำหรือยัง")
- ทั้งบล็อกซ่อนด้วย `{Number(value.depositAmount ?? 0) > 0 && (...)}` — reuse condition เดิมที่ helper text ใช้อยู่แล้ว
- **🛑 โหมดแก้ไข (edit order, reuse component เดียวกันผ่าน `OrderCreateForm` `editOrderToken`):** ค่าตั้งต้นของ checkbox **ต้อง** มาจาก `depositReceivedAt` ของออเดอร์จริง (`!= null` → ติ๊ก, `null` → ไม่ติ๊ก) ที่ prefill ตอนโหลดฟอร์ม — **ห้าม** default เป็น `true` เสมอแบบฟอร์มสร้างใหม่ ไม่งั้นแก้ยอดมัดจำของออเดอร์ที่ "ยังไม่ได้รับ" จะเผลอติ๊กทับสถานะจริงเงียบ ๆ (ตรง BR-SCB-15)

### Content outline (ไทย)
- Label: "รับเงินมัดจำแล้ว"
- Helper: "ลูกค้าจ่ายมัดจำที่หน้าร้านแล้ว — ปลดติ๊กถ้ายังไม่ได้รับ"

---

## 3) ปุ่ม "รับมัดจำแล้ว" + "เสร็จสิ้น / ไม่มาตามนัด" — หน้ารายละเอียดออเดอร์

### เลือก surface: หน้า `orders/[token]` (ไม่ใช่ปฏิทิน/แชท)

สำรวจ 3 surface:

- **ปฏิทิน `/queues` (`AppointmentCalendar.tsx`)** — `eventClick` ปัจจุบัน `router.push('/orders/${token}')` ตรง ๆ ไม่มี modal/popover ให้แทรกปุ่ม การเพิ่ม action ที่นี่ต้องประดิษฐ์ popover ใหม่ทั้งชุด (เสี่ยงชน `docs/conventions/scroll-container-clips-popovers.md`) และ **ปฏิทินไม่มีข้อมูล deposit เลย** ต้อง fetch เพิ่ม — ไม่คุ้ม
- **การ์ดออเดอร์ในแชท** — เป็นสรุปย่อ ไม่ใช่ที่ตัดสินใจเชิงการเงิน/ปิดงาน (action ทางการเงินอื่น ๆ เช่น COD/ยกเลิก ก็ไม่อยู่ตรงนี้อยู่แล้ว — สอดคล้อง IA เดิม)
- **หน้ารายละเอียดออเดอร์ `orders/[token]`** ✅ — เป็นที่เดียวที่ทำ pattern นี้อยู่แล้วจริง: `CodCard` คือ precedent ตรงตัว (การ์ดเงิน + ปุ่ม primary + promote เข้า global action bar) และ `order-action-set.ts`/`OrderActionBar.tsx` คือ "symbol เดียว" ที่ทั้ง mobile bottom-bar และ desktop inline-row ใช้ร่วมกันอยู่แล้ว — ไม่ติดปัญหา `seller-action-placement.md` §5.1 เพราะหน้านี้มี bottom action bar ของตัวเองแทน `SellerBottomNav` FAB

**→ ก้อนใหม่: `AppointmentCard.tsx`** (side card)

- **Base:** `src/app/(paces)/seller/(dashboard)/orders/[token]/components/CodCard.tsx` (โครงการ์ด+badge+ไอคอนกลม+ปุ่ม `hidden lg:flex`) + `theme/paces/Admin/TS/.../order-details/components/CustomerDetails.tsx` (theme ต้นทางของ CodCard เอง)
- **สถานะ/สี:** reuse `APPOINTMENT_STATUS_LABEL` (`src/lib/appointments.ts`) ตรงตัว ห้ามตั้งคำใหม่ · โทนสีต้องตรงกับ `AppointmentCalendar.tsx` `STATUS_DOT` เป๊ะ (sibling-surface-parity): SCHEDULED=warning, CONFIRMED_BY_BUYER=success, RESCHEDULE_REQUESTED=info, COMPLETED=neutral (`bg-default-100 text-default-700`), NO_SHOW=danger
- **แนะนำ implementation:** ยก `STATUS_DOT`-equivalent ออกมาเป็น `APPOINTMENT_STATUS_TONE` ใน `src/lib/appointments.ts` แล้วให้ทั้งปฏิทินและการ์ดใหม่ import ตัวเดียวกัน (ตอนนี้ประกาศ local ในปฏิทิน — SSOT เดียวกันกันสีเพี้ยน 2 จอ)

### Layout — AppointmentCard

```
┌ .card ─────────────────────────────────┐
│ card-header (border-b dashed)           │
│  นัดหมาย                [นัดแล้ว]        │ ← badge ผันตาม appointmentStatus
├──────────────────────────────────────── │
│ card-body                                │
│  [icon] ช่างสม                           │
│         1 ส.ค. 2569 · 10:00–11:00       │
│                                           │
│  ── (ถ้า depositAmount > 0) ──────────    │
│  [icon] มัดจำ ฿500                       │
│         ยังไม่ได้รับ                     │
│  [รับมัดจำแล้ว]  ← btn primary, hidden lg:flex
│                                           │
│  ── (ถ้าถึงเวลานัด + ยังไม่ terminal) ──   │
│  [เสร็จสิ้น]  [ไม่มาตามนัด]              │
│                                           │
│  ── (ถ้ายังไม่ถึงเวลานัด) ──────────────   │
│  [icon] ปิดงานได้เมื่อถึงเวลานัด (1 ส.ค. 10:00 น.)
│                                           │
│  ── (ถ้า terminal แล้ว, D-9) ───────────  │
│  บันทึกเมื่อ 10 ส.ค. 2569 14:32           │
└───────────────────────────────────────────┘
```

ตำแหน่งในคอลัมน์ขวา (`OrderDetailClient.tsx`): `{customerCard}` → **`<AppointmentCard/>`** → `{isCod && <CodCard/>}` → `{sideCards}` — ลำดับอ่านตามที่ร้านใช้จริง: ใครซื้อ → นัดอะไร/ต้องทำอะไรกับนัดนี้ → เงินปลายทาง (ถ้ามี) → ที่เหลือ

### Action-set extension (`order-action-set.ts`)

เพิ่ม input ใหม่ (optional, ไม่กระทบ caller เดิม):

```
appointment?: { status: AppointmentStatus; canMarkOutcome: boolean }
  // canMarkOutcome = now ≥ serviceStart && !terminal — คำนวณที่ RSC (page.tsx)
deposit?: { amount: number; received: boolean }
```

Action item ใหม่ 3 ตัว: `depositReceived` (icon `cash`), `markComplete` (icon `circle-check`), `markNoShow` (icon `user-off`)

**Precedence (post-process หลัง matrix เดิมคำนวณ `base` เสร็จ — ไม่แตะ logic เดิมของ shipping/COD):**

1. ไม่มี `appointment`/`deposit` เกี่ยวข้อง (`!depositDue && !outcomeReady`) → คืน `base` เดิมเป๊ะ
2. `depositDue` (มัดจำ>0 ยังไม่รับ) → **`primary = depositReceived`** ถ้า `base.primary` มีอยู่แล้ว → ดันลงเป็น ghost แทนที่จะหาย
3. `outcomeReady` → ถ้า primary ยังว่าง: `primary = markComplete`, ghost += `markNoShow` · ถ้า primary ถูกจองแล้ว (ข้อ 2) → ghost += `markComplete, markNoShow` ทั้งคู่
4. ghost รวมเกิน 2 ตัว (เช่น `isCodUnpaid` + `depositDue` + `outcomeReady` พร้อมกัน) → ตัวที่ priority ต่ำสุด (ปุ่มเดิมจาก `base.primary` ที่ถูกแทนที่ในข้อ 2) ตกไปอยู่ใน `menu` (⋯) แทนที่จะเป็น ghost ตัวที่ 3 — กันแถบล่างมือถือแน่นเกิน · **ต้องมี unit test ครอบ combination นี้**

ปุ่มทั้ง 3 **ไม่อยู่ใน `⋯`** (ไม่ใช่ destructive ตามนิยาม `seller-action-placement.md` §3 — ไม่ลบ/ไม่ยกเลิกข้อมูล) แต่ **ทุกตัวต้องมี `pacesConfirm` ก่อนยิง API** เหมือน `handleCodReceived`/`handleCancelOrder`:

| ปุ่ม | `pacesConfirm.*` | title | text | confirmButtonText |
|---|---|---|---|---|
| รับมัดจำแล้ว | `.question` | "ยืนยันว่าได้รับมัดจำแล้ว?" | "ระบบจะบันทึกว่าลูกค้าจ่ายมัดจำ ฿{amount} แล้ว" | "รับมัดจำแล้ว" (cancel: "ยังไม่ได้รับ") |
| เสร็จสิ้น | `.question` | "ยืนยันว่าให้บริการเสร็จแล้ว?" | "ระบบจะบันทึกว่า{vocab.noun}นี้เสร็จสิ้น — ย้อนกลับไม่ได้" | "เสร็จสิ้น" (cancel: "ยังไม่ใช่ตอนนี้") |
| ไม่มาตามนัด | `.warning` | "บันทึกว่าลูกค้าไม่มาตามนัด?" | "ใช้เมื่อลูกค้าไม่มาโดยไม่แจ้งล่วงหน้า — บันทึกแล้วย้อนกลับไม่ได้ มัดจำที่รับไว้ (ถ้ามี) จะไม่ถูกคืนอัตโนมัติ" | "ไม่มาตามนัด" (cancel: "ยกเลิก") |

3 handler ใหม่ใน `OrderDetailClient.tsx` (pattern เดียวกับ `handleCodReceived`): confirm → `fetch` → toast success → `router.refresh()`

**Error mapping:**

| error | HTTP | ข้อความบนจอ |
|---|---|---|
| `AppointmentNotStartedError` | 409 | "ยังไม่ถึงเวลานัด — รีเฟรชหน้าแล้วลองใหม่" |
| `AppointmentTerminalError` | 409 | "บันทึกไปแล้วก่อนหน้านี้ — รีเฟรชหน้า" |

ทั้งคู่ไม่ควรเกิดจริงเพราะ UI ซ่อนปุ่มไว้แล้ว แต่ต้อง handle เผื่อ race (2 แท็บเปิดพร้อมกัน)

### User flow

1. ร้านเปิดออเดอร์ที่มีนัดแต่ยังไม่รับมัดจำ → เห็นการ์ด "นัดหมาย" มีปุ่ม primary "รับมัดจำแล้ว" ทั้งบนการ์ดขวา (≥1024) และแถบล่าง/หัวการ์ดหลัก (ทุกขนาดจอ ผ่าน actionSet เดียวกัน)
2. กด → Swal ถาม → ยืนยัน → toast "บันทึกแล้วว่าได้รับมัดจำ" → refresh → ปุ่มหาย, badge เปลี่ยนเป็น "รับแล้ว"
3. ถึงเวลานัด → ปุ่ม "เสร็จสิ้น"/"ไม่มาตามนัด" โผล่ (ก่อนหน้านั้นเห็นแค่ helper "ปิดงานได้เมื่อถึงเวลานัด")
4. กด "เสร็จสิ้น" → Swal → ยืนยัน → `appointmentStatus=COMPLETED` → badge เทา "ให้บริการแล้ว" ปุ่มหายทั้งคู่ (terminal) + บรรทัด "บันทึกเมื่อ …"

### Content outline (ไทย)

- หัวการ์ด: "นัดหมาย"
- แถวเวลา: `{resourceName} · {formatDateTimeTH(start)} – {formatTimeHM(end)}`
- แถวมัดจำ: "มัดจำ ฿{amount}" + สถานะ "รับแล้ว {formatDateTimeTH}" / "ยังไม่ได้รับ"
- helper รอเวลา: "ปิดงานได้เมื่อถึงเวลานัด ({formatDateTimeTH(serviceStart)})"

### Theme Source Mapping

| Section | Theme/in-app source | Component | หมายเหตุ |
|---|---|---|---|
| Card + badge + icon กลม + ปุ่ม `hidden lg:flex` | `src/.../orders/[token]/components/CodCard.tsx` | `AppointmentCard.tsx` (ใหม่) | Base 1:1 สลับ business logic |
| Primary/ghost button ในแถบ action | `src/components/safepay/OrderActionBar.tsx` | reuse ตรง (เพิ่ม ActionItem 3 ตัวใน `order-action-set.ts`) | ไม่แก้ markup |
| Confirm dialog | `src/lib/paces-swal.ts` (`pacesConfirm.question`/`.warning`) | reuse ตรง | ตาม Hard Rule 8 |
| Status badge tone | `AppointmentCalendar.tsx` `STATUS_DOT` (ยกเป็น SSOT กลาง) | `src/lib/appointments.ts` (`APPOINTMENT_STATUS_TONE`) | กันสีเพี้ยน 2 จอ |

### Edge states

- **ไม่มี `serviceStart` เลย** (D-5) → ไม่แสดงแถวเวลา/ปุ่มปิดงาน · ถ้า `depositAmount>0` ยังโชว์แถวมัดจำ+ปุ่มรับมัดจำได้ตามปกติ (ไม่ผูกกับ serviceStart) · ถ้าไม่มีทั้งคู่ → การ์ดทั้งใบคืน `null`
- **terminal อยู่แล้ว** (COMPLETED/NO_SHOW) → badge เทา/แดง ไม่มีปุ่ม ไม่มี helper รอเวลา + บรรทัด "บันทึกเมื่อ …"
- **`RESCHEDULE_REQUESTED`** → badge info "ลูกค้าขอเลื่อน" ปุ่มปิดงานยังทำงานตาม `canMarkOutcome` ปกติ (ยังไม่ terminal ตาม BR-RSV-31) — ไม่มี action พิเศษสำหรับ reschedule ในสโคปนี้
- **Race condition** → 409 → toast error ตามตาราง ไม่ throw ค้าง
- **loading** → disable ปุ่มระหว่างรอ fetch (`busy` prop pattern ของ `CodCard`)

---

## Edge states ของงานทั้งชิ้น

- **empty:** ร้าน SERVICE_QUEUE ที่ยังไม่มีออเดอร์เลยเดือนนี้ → hero `0` + กราฟแบน (ไม่ใช่ error state — พฤติกรรมเดิมของการ์ด ONLINE_SALES เมื่อ `total===0`)
- **loading:** `initialSeries === null/undefined` → การ์ดทั้งใบไม่ render (honest-hide ตามพฤติกรรมเดิม)
- **error:** fetch series ล้มตอน SSR → honest-hide เช่นกัน
- **ตัวเลขหลักล้าน:** `formatNumberNoSymbol` ใช้ `toLocaleString` ไม่ตัดทอน — ต้องทดสอบว่าเลข 6-7 หลักใน grid cell (~150px ที่ 375px viewport) ไม่ตัดคำ
- **นัดค้างจำนวนมาก:** แท่งแดงซ้อนสูงได้ตามข้อมูลจริง ไม่มี cap — ตรงกับ D-2 ที่อยากให้ "เห็นว่าค้างเยอะ"

---

## Impeccable compliance

**Mode: Operate** (`~/.claude/skills/impeccable/reference/operate.md`) — dashboard/ฟอร์มของเจ้าของร้าน ไม่ใช่ brand surface เกณฑ์ตัดสิน = scanability + consistency กับหน้าอื่นในระบบ ชนะการแสดงออกทางภาพ — สอดคล้องกับที่ spec นี้ไม่ประดิษฐ์ทรงใหม่เลยสักจุด

- **One Voice:** ปุ่ม primary ทุกตัว (รับมัดจำแล้ว/เสร็จสิ้น) ยัง `bg-primary` น้ำเงินตามธีม Paces — ไม่ใช้เขียวแม้ "เสร็จสิ้น" จะฟังดูเหมือนความสำเร็จ เพราะ role ของ `bg-primary` คือ "ปุ่มหลักที่ขยับสถานะไปข้างหน้า" (เหมือน reportTracking/codReceived ทุกตัว) ไม่ใช่ตัวบ่งชี้สถานะ
- **Verified-Means-Green:** badge COMPLETED = **เทา** ไม่ใช่เขียว (reuse การตัดสินใจเดิมของ `AppointmentCalendar` STATUS_DOT) เพราะ "ให้บริการแล้ว" เป็นข้อเท็จจริงที่จบแล้ว ไม่ใช่สัญญาณ trust ใหม่ · CONFIRMED_BY_BUYER = เขียวจริง เพราะเป็นสัญญาณยืนยันจากบุคคลที่สาม (ตรงนิยาม rule) · มัดจำ "ยังไม่ได้รับ" = warning
- **Sentence case:** ทุก label เป็นประโยคปกติ ไม่มี ALL CAPS
- **Ink-tinted shadow:** ไม่มี shadow ใหม่ — ใช้ `.card` shadow token เดิมของ Paces
- **Anti-slop:** ไม่มี gradient/hero-metric-template ใหม่, ไม่มี eyebrow ตัวพิมพ์เล็ก, ไม่มีการ์ดซ้อนการ์ด (AppointmentCard เป็น sibling ของ CodCard ไม่ใช่ nested)
- **น้ำเสียง:** ข้อความ confirm บอกผลลัพธ์ตรง ๆ ("ย้อนกลับไม่ได้", "มัดจำที่รับไว้จะไม่ถูกคืนอัตโนมัติ") ไม่กล่าวหาลูกค้า
- **accent สีธีม:** การ์ดกราฟไม่มีปุ่ม primary เลย accent เดียวคือแท่ง "วันเข้ารับบริการ" ซึ่งเป็นสี semantic ของสถานะ ไม่ใช่ decoration · พระเอกของการ์ดคือตัวเลข hero (ramp Metric ใหญ่สุด)
- **จุดที่ theme ขัดกับ Impeccable:** ไม่มีจุดขัดตรง ๆ — จุดเดียวคือ mockup ใช้ `repeating-linear-gradient` (arbitrary CSS) สำหรับ legend swatch ซึ่งขัด HR7 → ตัดสินใช้ `border-dashed` แทน (ดู Design decisions #2) **แยกให้ชัด: ApexCharts config ไม่ถูกครอบ HR7 (ไม่ใช่ Tailwind class) แต่ legend swatch เป็น DOM element ปกติ จึงอยู่ใต้ HR7 เต็มรูป**

---

## Design decisions + rationale

1. **ปุ่ม primary ทุกตัวเป็นสีน้ำเงิน ไม่ใช้เขียวสำหรับ "เสร็จสิ้น"** — สอดคล้องกับ `OrderActionBar.tsx` `PrimaryButton` ที่ `bg-primary` มาตั้งแต่ต้น การเปลี่ยนเฉพาะปุ่มนี้จะทำลาย "same button = same color" (`operate.md`: "If the save button looks different in two places, one is wrong")
2. **legend swatch ลายทางใช้ `border-dashed` แทน diagonal-stripe ของ mockup** — `repeating-linear-gradient` เป็น arbitrary CSS ที่ไม่มี Paces primitive รองรับ (grep `theme/paces` ไม่พบเลย) และ HR7 ห้าม arbitrary value ใน `(paces)` โดยไม่มีข้อยกเว้นสำหรับ decorative CSS — closest primitive คือเส้นประ ซึ่งเป็น signature ของธีมนี้อยู่แล้ว (The Dashed Card-Header Rule) เนื้อหาการสื่อความ (ทึบ=ได้เงินแล้ว, ประ=ยังไม่ได้) ยังครบ **ตัวกราฟจริงยังใช้ pattern fill ตาม mockup ได้เต็มที่**
3. **legend เปลี่ยนจาก `flex-wrap` เป็น `grid grid-cols-2`** — วัดความกว้างจริงแล้วเกิน card width แน่นอน ป้องกัน wrap แบบเดาไม่ได้ (ตัดกลางคำ) ด้วย layout ที่กำหนดตายตัว จับคู่เชิงความหมาย (เงินที่ได้แล้ว / เงินที่รอ)
4. **AppointmentCard รวมมัดจำ+นัดหมาย+ปุ่มปิดงานไว้การ์ดเดียว ไม่แยก DepositCard** — deposit เกิดจาก flow การจองเดียวกัน (FR-RSV-12 อยู่ใน AppointmentBlock เดียวกับวันนัด) แยกการ์ดจะพรากข้อมูลที่เกี่ยวกันออกจากกันโดยไม่มีเหตุผล (ตรงข้ามกับ CodCard ที่แยกเพราะเป็นคนละ domain จริง)
5. **ไม่ออกแบบ `SalesChartSheet` เต็มรูปในรอบนี้** — ให้แนวทางย่อไว้ (สร้าง `ServiceSalesChartSheet.tsx` คู่กัน คอลัมน์ตาราง = วันที่/มัดจำ/เสร็จสิ้น/วันเข้ารับบริการ/เลยวันนัด) แต่ต้องกลับมาที่ ux gate อีกรอบก่อน implement ชีต

---

## Anti-slop self-check

1. **เฉพาะกับ Deep จริงไหม?** ใช่ — ทุกจุดผูกกับข้อมูล/กฎเฉพาะ (`Order.depositReceivedAt`, BR-RSV-34 serviceStart gate, `APPOINTMENT_STATUS_LABEL` ไทย, Trust-score-neutral ตาม BR-RSV-33/35)
2. **มีของเด่นที่สุด 1 อย่างต่อจอไหม?** Command Center: hero number (Metric ramp ใหญ่สุด) · Order detail: ไม่มีตัวไหนแข่งกับ primary action-bar เดิม (AppointmentCard เป็น 1 ใน sidebar cards เท่ากับ CodCard)
3. **มีอะไรซ้ำ/ต้องตัดไหม?** ตัดเส้น+ป้ายจำนวนคำสั่งซื้อออกจากการ์ด SERVICE_QUEUE ทั้งชุด — ตัดจริง ไม่ใช่ปล่อยไว้ให้ "ครบ"
4. **state ครบไหม?** empty/loading/error/ไม่มี serviceStart/terminal/race/เลขหลักล้าน ครบใน Edge states
5. **copy ตรงกับสิ่งที่ระบบทำได้จริงไหม?** ปุ่มไม่โผล่เมื่อระบบจะปฏิเสธ · error message ระบุทางออก ("รีเฟรชหน้าแล้วลองใหม่")
6. **คำเดียวกัน = ของเดียวกันไหม?** "เสร็จสิ้น"/"ไม่มาตามนัด" มาจาก `APPOINTMENT_STATUS_LABEL` ทุกจุด · badge tone จาก SSOT เดียว
7. **สีสื่อความหมายถูกไหม?** เขียวเฉพาะ CONFIRMED_BY_BUYER · COMPLETED เทาโดยตั้งใจ · มัดจำยังไม่ได้รับ = warning
8. **แตะได้จริงบนมือถือไหม?** ปุ่มผ่าน `OrderActionBar` `min-h-11`(44px) · checkbox ห่อ label ทั้งแถวให้พื้นที่แตะกว้าง
9. **คอลัมน์ว่างที่ 1440?** ไม่มี layout ใหม่ — ทุกจุดยัดเข้า pattern การ์ดที่ผ่าน QA มาแล้ว

---

**Files ที่อ่านแล้ว (สำหรับ developer อ้างอิงต่อ):**
`SalesChartCard.tsx` · `SalesChartSheet.tsx` · `_constants/command-center.ts` · `AppointmentBlock.tsx` · `AppointmentCalendar.tsx` · `OrderDetailClient.tsx` · `OrderSummary.tsx` · `CodCard.tsx` · `order-action-set.ts` · `OrderActionBar.tsx` · `lib/appointments.ts` · `lib/paces-swal.ts` · `services/appointment.service.ts`
