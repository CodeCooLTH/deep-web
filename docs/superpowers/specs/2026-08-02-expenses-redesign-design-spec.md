# Design Spec — `/expenses` redesign (feature 00016) + รายจ่ายไหลเข้าหน้ายอดขาย

> Route: `(paces)/seller/(dashboard)/expenses`, `(paces)/seller/(dashboard)/sales`, `(paces)/seller/(dashboard)/dashboard` — ทั้งหมด Paces (seller). SSOT ของหน้าตา = `docs/superpowers/specs/2026-08-02-expenses-redesign-mockup.html` (11 เฟรม, user approve แล้ว). Spec นี้อธิบาย + เติมช่องว่าง data/state/a11y ที่ mockup (เป็น static HTML) ไม่ครอบ ไม่ใช่ออกแบบใหม่.

อ่านครบตามลำดับ: `.impeccable/design.json` + `DESIGN.md` → `PRODUCT.md` → Impeccable `shape.md`/`operate.md`/`craft-floor.md` → Paces docs (`paces-component-reference.md`) → โค้ดปัจจุบันทั้งหมดที่ scope แตะ (`expenses/**`, `sales/**`, `dashboard/**`, services, `date-range.ts`, `format-date.ts`, `Icon.tsx`, `ApexChart.tsx`, `getColor`).

---

## 0. TL;DR การตัดสินใจหลัก (อ่านก่อน)

1. **ยกช่วงเวลา (`range`) ขึ้นไปเป็น state เดียวใน `ExpenseWorkspace`** — เดิม `PnlReportCard` เป็นเจ้าของ range เอง ตอนนี้ segmented switcher ย้ายออกมาเป็น `ExpenseToolbar` และ **1 endpoint เดียว** (`GET /api/expenses/report` ที่ขยาย response) คืนทั้ง `report` + `expenses[]` ที่ scope ด้วยช่วงเดียวกันเสมอ — แก้ปัญหา #2 ในบรีฟ (การ์ดแยกหมวด/สรุปเร็วขัดกับ P&L) ที่ราก ไม่ใช่แก้ที่ผล
2. **นิยาม "กำไรสุทธิ" มี 2 ระดับความละเอียดโดยตั้งใจ ไม่ใช่บั๊ก:**
   - `/expenses` P&L + `/sales` (ทั้ง 2 มี query items/cost อยู่แล้วหรือหาเพิ่มได้ถูก) = **เต็มสูตร** `grossProfit(revenue−COGS) − expense`
   - Command-center card + `SalesChartSheet` = **เต็มสูตรเหมือนกัน** (ตัดสินใจขยาย `getSalesSeries` ให้ query COGS ด้วย แทนที่จะใช้สูตรลัด `confirmedRevenue−expense` เพื่อไม่ให้ตัวเลขขัดกันข้าม surface — รายละเอียด §Data/API)
   - ทุก surface ที่โชว์ "กำไรสุทธิ" ต้องมีบรรทัดกำกับใต้ตัวเลขเสมอว่าใช้ยอดที่ยืนยันแล้ว (กัน "ทำไมไม่ตรงกับที่ฉันบวกลบเอง")
3. **สิทธิ์ (`resolveExpenseAccess`) ต้องครอบทั้ง 3 surface ใหม่** — ไม่ผ่าน gate = **ไม่ render** คอลัมน์/แถว/แถบค่าใช้จ่าย-กำไรสุทธิเลย (ไม่ใช่โชว์ ฿0)
4. **สีหมวดหมู่ (avatar/badge/legend dot) ต้องไม่ใช้ hex จาก mockup ตรง ๆ** (`#5b8fd9`/`#9dc9dd` ไม่ใช่ token จริง) — แม็ปใหม่จาก token จริงเท่านั้น (ตาราง §Theme Mapping), หลีกเลี่ยง `secondary`(#7b70ef ใกล้ม่วง Vuexy) และ `danger`(สงวนไว้กับความหมาย "เงินไหลออก" ที่ใช้อยู่แล้วทั้งหน้า) โดยเจตนา
5. **หมวดหมู่ในโมดัล = ปุ่มชิป (`role="group"` + `aria-pressed`)** ไม่ใช่ radiogroup — ยึด pattern เดิมที่ใช้ทั้งโปรเจกต์ (segmented switcher) เพื่อความสม่ำเสมอ ไม่ใช่ของใหม่
6. **Modal shell เดียว ปรับ CSS ตาม breakpoint** (ไม่ใช่ 2 component แยก mobile/desktop) — `sm:` (640px) เป็นจุดตัด: < 640px = bottom sheet, ≥ 640px = กล่องกลางจอ

---

## 1. ASCII Wireframes

### 1A. หน้ารายการ `/expenses` — Desktop (≥1024, พื้นที่เนื้อหา ~1020px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ธุรกิจ · ค่าใช้จ่าย                    [วันนี้|7วัน|●30วัน|เดือนนี้|กำหนดเอง] [+เพิ่มค่าใช้จ่าย]│
│ ค่าใช้จ่าย                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─ card ──────────────────────────────────────────────────────────────┐ │
│ │ กำไรสุทธิ · 30 วันล่าสุด    ┊  รายได้   ต้นทุนสินค้า  กำไรขั้นต้น  ค่าใช้จ่าย│ │
│ │ ฿17,680.00 ↑+12.4%         ┊  ฿48,900   ฿21,350     ฿27,550    ฿9,870 │ │
│ │ ⚠ กำไรอาจไม่สมบูรณ์ — มีสินค้าที่ยังไม่ตั้งต้นทุน [ตั้งต้นทุนตอนนี้→]       │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌─ ค่าใช้จ่ายแยกหมวด (1.75fr) ─────────┐ ┌─ สรุปเร็ว (1fr) ──────────────┐ │
│ │ รวม ฿9,870.00                        │ │ จำนวนรายการ        24 รายการ  │ │
│ │ [■■■■■□□□□□] (proportion bar)        │ │ เฉลี่ยต่อวัน          ฿329.00 │ │
│ │ ● 📢ค่าโฆษณา   36.5%   ฿3,600.00     │ │ หมวดที่จ่ายมากสุด    ค่าโฆษณา │ │
│ │ ● 🏪ค่าเช่า     25.3%   ฿2,500.00     │ │ สัดส่วนต่อรายได้      20.2%   │ │
│ │ ● 🚚ค่าขนส่ง    18.0%   ฿1,780.00     │ └────────────────────────────┘ │
│ │ ● 📦ค่าแพ็คเกจ  12.1%   ฿1,190.00     │                                │
│ │ ● ⋯อื่นๆ         8.1%   ฿800.00       │                                │
│ └───────────────────────────────────────┘                                │
│ ┌─ card: รายการค่าใช้จ่าย [24] ──────────────────── 🔍ค้นหาหมายเหตุ... ──┐ │
│ │ [●ทั้งหมด 24][📢ค่าโฆษณา 6][🏪ค่าเช่า 2][🚚ค่าขนส่ง 7][📦ค่าแพ็คเกจ 5]…  │ │
│ │ วันนี้ · 2 ส.ค. 2569                                    รวม ฿1,450.00 │ │
│ │  ⬜📢 ค่าโฆษณา            บูสต์โพสต์ TikTok…      ฿1,200.00  [✎][🗑]  │ │
│ │  ⬜🚚 ค่าขนส่ง            ค่าส่งของรอบเช้า          ฿250.00   [✎][🗑]  │ │
│ │ เมื่อวาน · 1 ส.ค. 2569                                  รวม ฿2,690.00 │ │
│ │  … (ต่อไปตามวัน)                                                       │ │
│ │ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │ │
│ │ แสดง 6 จาก 24 รายการ                                    [⌄ โหลดเพิ่ม] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1B. หน้ารายการ — Tablet (834)
เหมือน desktop แต่: (1) แถวหัวหน้าแยก 2 บรรทัด (title/action ชิดขวา, segmented แยกบรรทัดถัดมา) (2) breakdown/สรุปเร็ว สัดส่วน `1.4fr/1fr` (3) chip แถวเป็น `overflow-x-auto` ไม่ wrap (4) รายการเริ่มเผย 3 ไม่ใช่ 6

### 1C. หน้ารายการ — Mobile (390)
```
┌──────────────────────────────────┐
│ ธุรกิจ            ค่าใช้จ่าย   [🔍]│ ← sticky top
│ [วันนี้][7วัน][●30วัน][เดือนนี้][กำหนดเอง] (scroll แนวนอน)
├──────────────────────────────────┤
│ ┌ card: กำไรสุทธิ ─────────────┐ │
│ │ กำไรสุทธิ · 30 วันล่าสุด      │ │
│ │ ฿17,680.00  ↑+12.4%          │ │
│ │ ┌───────┬───────┐             │ │
│ │ │รายได้ │ต้นทุน │             │ │
│ │ ├───────┼───────┤             │ │
│ │ │กำไรขั้นต้น│ค่าใช้จ่าย│       │ │
│ │ └───────┴───────┘             │ │
│ │ ⚠ มีสินค้าที่ยังไม่ตั้งต้นทุน  │ │
│ └───────────────────────────────┘ │
│ ┌ card: ค่าใช้จ่ายแยกหมวด ──────┐ │
│ │ ฿9,870.00                     │ │
│ │ [■■■■■□□□□□]                  │ │
│ │ ● 📢ค่าโฆษณา      ฿3,600.00   │ │
│ │ ● 🏪ค่าเช่า        ฿2,500.00   │ │
│ │ ● 🚚ค่าขนส่ง       ฿1,780.00   │ │
│ │ [ดูทั้ง 5 หมวด]                │ │
│ └───────────────────────────────┘ │
│ ┌ card: รายการ [24]  [ตัวกรอง▾]─┐ │
│ │ วันนี้·2ส.ค.69      ฿1,450.00 │ │
│ │  📢 ค่าโฆษณา   ฿1,200.00      │ │ ← แตะแถว = แก้ไข
│ │  🚚 ค่าขนส่ง    ฿250.00        │ │
│ │ เมื่อวาน·1ส.ค.69   ฿2,690.00  │ │
│ │  … (ต่อ)                      │ │
│ │ แสดง 4 จาก 24   [โหลดเพิ่ม]   │ │
│ └───────────────────────────────┘ │
│ แตะแถวเพื่อแก้ไข · ปัดซ้ายเพื่อลบ  │
├──────────────────────────────────┤
│ ┌───────────────────────────────┐│ ← sticky bottom, safe-area
│ │      + เพิ่มค่าใช้จ่าย         ││
│ └───────────────────────────────┘│
└──────────────────────────────────┘
```
**ไม่มี "สรุปเร็ว" การ์ดบนมือถือ** (ตัดสินใจตาม mockup — ลดความลึกของ scroll; เห็น "จำนวนรายการ" ผ่าน badge `[24]` ที่หัวลิสต์อยู่แล้ว, "หมวดที่จ่ายมากสุด"/"เฉลี่ยต่อวัน" อ่านจากการ์ดแยกหมวดได้ในทางอ้อม)

### 1D. Modal สร้าง — Desktop/Tablet (กล่องกลางจอ ≤512px)
```
        ┌─ dialog (max-w-lg, กลางจอ, backdrop bg-dark/40) ──┐
        │ 🧾 เพิ่มค่าใช้จ่าย                          [✕]  │
        ├───────────────────────────────────────────────────┤
        │ จำนวนเงิน *                                        │
        │ [฿][___________1,200.00___________]                │
        │                                                     │
        │ หมวดหมู่ * (radiogroup-visual, 3 คอลัมน์)            │
        │ [🏪ค่าเช่า][📦แพ็คเกจ][📢●โฆษณา][🚚ขนส่ง][👥เงินเดือน]│
        │ [⚡สาธารณูปโภค][⋯อื่นๆ]                              │
        │                                                     │
        │ วันที่เกิดค่าใช้จ่าย *                                │
        │ [วันนี้●][เมื่อวาน]  [📅 2 ส.ค. 2569]                │
        │                                                     │
        │ หมายเหตุ (ไม่บังคับ)                    0/500       │
        │ [textarea 2 บรรทัด]                                 │
        ├───────────────────────────────────────────────────┤
        │                            [ยกเลิก]  [+บันทึกค่าใช้จ่าย]│
        └───────────────────────────────────────────────────┘
```

### 1E. Modal สร้าง — สถานะ error (Tablet ตัวอย่าง)
เหมือนบน แต่: input-group ขอบแดง + ข้อความ inline สีแดงใต้ช่อง ("กรุณากรอกจำนวนเงิน" / "กรุณาเลือกหมวดหมู่") — **ไม่ toast**, focus ไปช่อง error แรกอัตโนมัติหลัง submit ล้มเหลว

### 1F. Modal สร้าง — Mobile (bottom sheet, 390×844)
```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ← backdrop bg-dark/40 (พื้นหลังเบลอ/มืด)
┌──────────────────────────────────┐
│              ▬▬▬                 │ ← drag handle (ไม่ต้อง drag ได้จริง แค่ visual affordance)
│ 🧾 เพิ่มค่าใช้จ่าย            [✕]│
├──────────────────────────────────┤
│ จำนวนเงิน *                       │
│ [฿][____1,200.00____]             │
│ หมวดหมู่ * (2 คอลัมน์)             │
│ [🏪ค่าเช่า]    [📦แพ็คเกจ]        │
│ [📢●โฆษณา]     [🚚ขนส่ง]         │
│ [👥เงินเดือน]   [⚡สาธารณูปโภค]   │
│ [        ⋯ อื่นๆ (เต็มแถว)      ] │
│ วันที่ *                          │
│ [วันนี้●][เมื่อวาน] [📅 2 ส.ค. 69]│
│ หมายเหตุ (ไม่บังคับ)              │
│ [textarea]                        │
├──────────────────────────────────┤
│ [ยกเลิก]        [+ บันทึก]        │ ← safe-area-inset-bottom
└──────────────────────────────────┘
```

### 1G. Modal แก้ไข — Desktop (footer มีปุ่มลบ)
```
┌───────────────────────────────────────────────────┐
│ ✏ แก้ไขค่าใช้จ่าย                            [✕]  │
├───────────────────────────────────────────────────┤
│ (ฟิลด์เหมือนกัน prefill ค่าเดิม)                    │
├───────────────────────────────────────────────────┤
│ [🗑 ลบรายการ]              [ยกเลิก]  [💾บันทึกการแก้ไข]│
└───────────────────────────────────────────────────┘
```
Mobile edit = เหมือน 1F แต่ footer เป็น **2 แถว**: แถวบน `[🗑 ลบรายการ]` เต็มความกว้าง, แถวล่าง `[ยกเลิก][บันทึกการแก้ไข]` (extrapolation ของฉัน — mockup ไม่ได้วาด mobile-edit ชัด ดู §Design decisions)

### 1H. Empty state (การ์ดรายการ, ไม่เคยมีรายการเลย)
```
┌─ card ──────────────────────────────┐
│ รายการค่าใช้จ่าย         [+เพิ่มค่าใช้จ่าย]│
├──────────────────────────────────────┤
│              🧾 (52px, จาง)           │
│      ยังไม่มีรายการค่าใช้จ่าย         │
│  บันทึกค่าเช่า ค่าโฆษณา ค่าขนส่ง       │
│  แล้วระบบจะคำนวณกำไรสุทธิให้อัตโนมัติ  │
│         [+ บันทึกรายการแรก]           │
└──────────────────────────────────────┘
```
(2 variant เพิ่มเติมที่ mockup ไม่ได้วาด — ดู §Edge states)

### 1I–1K. 3 surface ยอดขาย

**(ก) Command-center card (mobile, 390) — ก่อน/หลัง**
```
┌ card ────────────────────┐        ┌ card ────────────────────┐
│ 📊 ยอดขาย · เดือนนี้    ⌄│   →    │ 📊 ยอดขาย · เดือนนี้    ⌄│
│ ฿3,680  ↑524%             │        │ ฿3,680  ↑524%             │
│ ▁▁█▁▁▁▁ (sparkline)       │        │ ▁▁█▁▁▁▁ (sparkline)       │
└───────────────────────────┘        │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈│
                                      │ ค่าใช้จ่าย  │ กำไรสุทธิ   │
                                      │  ฿1,450    │  −฿1,450    │ ← เปลี่ยนจาก "฿0" ใน mockup ดิบ ดู §Design decisions
                                      │ กำไรคิดจากยอดที่ยืนยันแล้วเท่านั้น│
                                      └───────────────────────────┘
(แถวใหม่แสดงเมื่อ resolveExpenseAccess = GRANTED เท่านั้น — ไม่งั้นการ์ดเหมือนเดิมทุกประการ)
```

**(ข) SalesChartSheet mobile เต็มจอ**
```
┌──────────────────────────────────┐
│ ‹  ยอดขาย         [รายวัน|รายเดือน]│
├──────────────────────────────────┤
│         ‹  ส.ค. 2569  ›           │
│           1–31 ส.ค.               │
│      ฿3,680  ↑524%                │
│   รวมทั้งเดือน · order ที่ไม่ยกเลิก│
│┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈│
│ ยืนยันแล้ว │ ค่าใช้จ่าย │ กำไรสุทธิ │
│    ฿0     │  ฿1,450   │ −฿1,450  │
│┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈│
│ ● ยืนยันแล้ว ● ยังไม่ยืนยัน ● ค่าใช้จ่าย│
│ [stacked bar (น้ำเงิน+เหลือง) + แท่งแดงแยกข้าง = ค่าใช้จ่าย]│
│ 1   5   9   13  17  21  25  29    │
│                                    │
│ รายวัน                [✓แสดงค่าใช้จ่าย]│
│ 1 ส.ค.        ฿3,680              │
│ ค่าใช้จ่าย ฿1,450  สุทธิ −฿1,450    │
│ 2 ส.ค.        ฿0 (ไม่มีค่าใช้จ่าย) │
└──────────────────────────────────┘
```
(บล็อกกลาง "ยืนยันแล้ว/ค่าใช้จ่าย/กำไรสุทธิ" + แท่งแดง + sub-line รายวัน ทั้งหมดแสดงเฉพาะ GRANTED)

**(ค) `/sales` Desktop**
```
┌ card: รายงานยอดขาย                              📅 1–31 ส.ค. 2569 ┐
│ [ยอดขายรวม][ออเดอร์][สำเร็จ][เฉลี่ย/ออเดอร์] [ค่าใช้จ่าย][กำไรสุทธิ]│ ← 4→6 (2 ใบหลังเฉพาะ GRANTED)
│ ฿48,900     32       27      ฿1,811          ฿9,870     ฿17,680   │
│ ● ยอดขาย(฿) ● ค่าใช้จ่าย(฿) ● ออเดอร์                              │
│ [mixed chart: area(ยอดขาย) + bar(ค่าใช้จ่าย, แดง) + line(ออเดอร์)]  │
├─────────────────────────────────────────────────────────────────┤
│ รายละเอียดรายวัน                                    🔍ค้นหา...    │
│ วันที่      ออเดอร์  สำเร็จ  ยอดขาย   ค่าใช้จ่าย   กำไรสุทธิ       │ ← 2 คอลัมน์ท้ายเฉพาะ GRANTED
│ 1 ส.ค. 69    3       3    ฿5,400   ฿2,690      ฿1,210             │
│ 2 ส.ค. 69    1       1    ฿1,800   ฿1,450      ฿120               │
│ 3 ส.ค. 69    0       0    ฿0       ฿430        −฿430               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Theme Source Mapping

| Section/Component | Base file (copy โครง) | ปรับอะไร |
|---|---|---|
| `ExpenseWorkspace` (rewrite) | ตัวเดิม (domain composition, ไม่มี theme 1:1) | เพิ่ม range state, combined fetch, modal state — ไม่ใช่ theme copy ใหม่ |
| `ExpenseToolbar` (ใหม่) — segmented desktop/tablet | `PnlReportCard.tsx` เดิม (segmented button-group ที่ย้ายออกมา) + `docs/system/ui-guideline/paces-component-reference.md §2` | ย้าย markup เดิม ไม่ประดิษฐ์ใหม่ |
| `ExpenseToolbar` — chip scroll มือถือ + search toggle | `dashboard/components/SalesChartSheet.tsx` mode-switch chip (`rounded-md bg-card` active state) + `products/components/ProductsListing.tsx` search input-icon-group | ปรับเป็น `rounded-full` ตาม mockup `.chip` |
| `ExpenseFormModal` (ใหม่, แทน `ExpenseForm.tsx`) — a11y shell (focus trap/Escape/backdrop/submitting-guard) | `orders/[token]/components/ShipmentEntryModal.tsx` ทั้งไฟล์ (คัด `dialogRef`/`FOCUSABLE_SELECTOR`/useEffect Escape+Tab-trap+return-focus ตรง ๆ) | เปลี่ยน field เป็นของ expense |
| `ExpenseFormModal` — bottom-sheet visual (mobile) | `orders/new/components/QuickPriceSheet.tsx` (`fixed inset-x-0 bottom-0 z-80 rounded-t-2xl` + drag-handle `h-1 w-10 rounded-full bg-default-300`) | รวมเข้ากับ a11y shell ข้างต้นด้วย responsive class เดียว (ดู §Responsive) ไม่ใช่ 2 component |
| `ExpenseFormModal` — amount input-group | `paces-component-reference.md §4` (`input-group` + `input-group-text` ฿) | ขยาย font เป็น `text-2xl font-bold` (primitive จริง ไม่ arbitrary) |
| `ExpenseFormModal` — category chips | ใหม่ทั้งหมด ประกอบจาก `.btn`+`.badge` primitive + `aria-pressed` convention ของ `PnlReportCard` เดิม | ไม่มี 1:1 เพราะเป็น domain-specific chip-grid — cite primitive ที่ใช้ประกอบ |
| `ExpenseFormModal` — quick-date chips | `paces-component-reference.md` chip/badge primitive (เดียวกับข้างบน) | ปุ่ม "วันนี้/เมื่อวาน" เรียก RHF `setValue` |
| `PnlReportCard` (rewrite เป็น presentational) | ตัวเดิม (ตัด segmented ออก, คง stat-grid) — Base เดิม `dashboard/components/SalesReport.tsx` stat row | ลบ fetch logic, รับ props `report`/`loading`/`rangeLabel` แทน |
| `PnlReportCard` — icon ต่อ label (desktop only) | ใหม่ minor addition | icon: รายได้=`cash`, ต้นทุนสินค้า=`package`, กำไรขั้นต้น=`calculator`, ค่าใช้จ่าย=`receipt` — โชว์เฉพาะ `lg:` |
| `ExpenseBreakdownCard` (ใหม่) | `.card`+`.card-header`+`.card-body` primitive + `bar`/`legend` เป็น domain composition ใหม่ (flex-based proportion bar, ไม่มี theme 1:1 — ไม่ใช่ chart, ไม่เข้า Hard Rule 10) | — |
| `ExpenseQuickStatsCard` (ใหม่) | `.card` + `quick-row` composition (คล้าย `SalesReport.tsx` stat-list pattern: `flex justify-between border-b border-dashed`) | — |
| `ExpenseList` (rewrite) — day-group + row | ใหม่: domain composition จาก `.card`+`.badge`+`Icon` — row action icon ✎/🗑 = `products/components/ProductsListing.tsx:194-220` (`btn btn-icon btn-sm border-default-300`) | ตัด `.table` ทิ้งทั้งหมด |
| `ExpenseList` — chip filter (desktop/tablet) | ใหม่ (badge/btn primitive ผสมกัน, cite เดียวกับ modal chips) | — |
| `ExpenseList` — search (desktop/tablet) | `sales/components/SalesTable.tsx` search `input-icon-group` | — |
| `ExpenseCategoryFilterSheet` (ใหม่, มือถือเท่านั้น) | `orders/new/components/QuickPriceSheet.tsx` (bottom-sheet shell เบา ไม่ full a11y-modal เพราะไม่ใช่ฟอร์ม critical) | list ของ 7 หมวด + "ทั้งหมด" แบบ tap-to-select-and-close |
| Empty state | `_shared/SellerEmptyState.tsx` (compact) + ปุ่ม onClick แยก (ไม่ใช้ prop `action` เพราะมันเป็น `Link` href-only แต่เราต้องเปิด modal) | — |
| ยืนยันลบ | `src/lib/paces-swal.ts` (`pacesConfirm.danger`) — ไม่เปลี่ยน | — |
| toast | `pacesToast` (`@/lib/paces-toast`) — ไม่เปลี่ยน | — |
| SalesChart 3rd series | `sales/components/SalesChart.tsx` เดิม (ApexChart wrapper + `getColor`) | เพิ่ม series `type:'bar'`, `getColor('chart-beta')` |
| SalesChartSheet 3rd series + stat row | ตัวเดิม (`buildSalesChartOptions`) | เพิ่ม series ค่าใช้จ่าย + stat-row markup ใหม่ (composition, ไม่มี 1:1) |

---

## 3. Component breakdown — สร้าง/แก้/ลบ

### `src/app/(paces)/seller/(dashboard)/expenses/`
| ไฟล์ | action | หมายเหตุ |
|---|---|---|
| `page.tsx` | **แก้** | `listExpenses(shopId, { range: range.expenseRange })` (ผูกช่วง 'today' default แทนดึงทั้งหมด) + เพิ่ม `hasAnyExpenseEver` (lightweight `prisma.expense.count` หรือ `findFirst` ผ่าน service ใหม่) ส่งเป็น initial prop |
| `components/ExpenseWorkspace.tsx` | **แก้ (rewrite ใหญ่)** | เจ้าของ `range`/`customDates`/`report`/`expenses`/`loading`/`error`/`modalState({mode,editing}|null)`; 1 fetch function เรียก `/api/expenses/report` |
| `components/ExpenseToolbar.tsx` | **สร้างใหม่** | segmented (≥640px) / chip-scroll (<640px) + ปุ่ม "เพิ่มค่าใช้จ่าย" (desktop/tablet inline; มือถือแยกเป็นปุ่มลอยล่างจอ — render จาก `ExpenseWorkspace` โดยตรง ไม่ใช่ toolbar) + search-icon toggle (มือถือ) |
| `components/ExpenseFormModal.tsx` | **สร้างใหม่** (แทน `ExpenseForm.tsx`) | dual-mode create/edit, responsive sheet↔dialog, RHF+Yup (schema เดิมย้ายมา), category chip-grid, quick-date chips |
| `components/ExpenseForm.tsx` | **ลบ** | ย้าย logic เข้า `ExpenseFormModal.tsx` |
| `components/PnlReportCard.tsx` | **แก้ (ลด scope)** | ลบ fetch/segmented ออก → รับ `report`/`loading`/`rangeLabel` เป็น props, คง stat-grid + missing-cost banner + hero |
| `components/ExpenseBreakdownCard.tsx` | **สร้างใหม่** | รับ `expenses: SerializedExpense[]` (full range-scoped) → group by category, sort desc amount, render bar+legend; มือถือจำกัด 3 แถวแรก + ปุ่ม "ดูทั้ง N หมวด" expand ในตัว (ไม่เปิด modal ใหม่) |
| `components/ExpenseQuickStatsCard.tsx` | **สร้างใหม่** | รับ `expenses` + `report.revenue` → คำนวณ 4 ค่า client-side; `hidden sm:block` (ซ่อนมือถือ) |
| `components/ExpenseList.tsx` | **แก้ (rewrite ใหญ่)** | ตัด `.table` → day-grouped card rows; เพิ่ม local state `search`/`categoryFilter`/`visibleCount`; เพิ่ม `ExpenseCategoryFilterSheet` trigger (มือถือ) |
| `components/ExpenseCategoryFilterSheet.tsx` | **สร้างใหม่** | bottom sheet เบา, มือถือเท่านั้น |
| `components/ExpenseLockedCard.tsx` | ไม่แก้ | — |

### `src/lib/`
| ไฟล์ | action |
|---|---|
| `expense.ts` | **แก้** — เพิ่ม `EXPENSE_CATEGORY_COLOR: Record<ExpenseCategory,{bg:string; dot:string}>` (ดูตาราง §Theme token) |
| `date-range.ts` | **แก้** — `ResolvedDateRange` เพิ่ม `prevRange: { orderRange; expenseRange }` (ช่วงก่อนหน้าความยาวเท่ากัน ต่อเนื่องก่อน `start`) |

### `src/services/`
| ไฟล์ | action |
|---|---|
| `pnl.service.ts` | **แก้** — `getPnlReport` query คู่ขนาน `prevRange` เพิ่ม คืน `prevNetProfit: number \| null` |
| `expense.service.ts` | ไม่แก้ (`listExpenses` มี `range` option อยู่แล้ว) — เพิ่ม `hasAnyExpense(shopId): Promise<boolean>` (ใหม่, เบา `findFirst({select:{id:true}})`) |
| `dashboard.service.ts` | **แก้ใหญ่** — `getSalesSeries` เพิ่ม: (1) select `items:{select:{cost:true,qty:true}}` ใน order query (2) query คู่ขนาน `Expense.groupBy`/aggregate ตาม bucket ด้วย **UTC-midnight boundary แบบเดียวกับ `date-range.ts`** (ไม่ใช่ boundary ที่ shift +7h ของ order) (3) คืนเพิ่ม `expenseValues[]`, `netProfitValues[]` (=`confirmedValues[i]-cogsValues[i]-expenseValues[i]`), `totalExpense`, `netProfit` |
| `expense-access.service.ts` | ไม่แก้ — เรียกใช้จาก `sales/page.tsx` + `dashboard/page.tsx` + `api/seller/sales-series/route.ts` เพิ่ม |

### `src/app/api/`
| ไฟล์ | action |
|---|---|
| `expenses/report/route.ts` | **แก้** — response เพิ่ม `expenses: SerializedExpense[]` + `prevNetProfit` |
| `seller/sales-series/route.ts` | **แก้** — เรียก `resolveExpenseAccess` ก่อนคืนค่า `expenseValues`/`netProfitValues`/`totalExpense`/`netProfit` (ถ้าไม่ GRANTED → field เหล่านี้ = `undefined`, ไม่ error ทั้ง response) |

### `src/app/(paces)/seller/(dashboard)/dashboard/`
| ไฟล์ | action |
|---|---|
| `page.tsx` | **แก้** — เพิ่ม `resolveExpenseAccess(session)` ใน `Promise.allSettled`, merge field เข้า `salesSeries` ก่อนส่งเป็น `CommandCenterData.salesSeries` |
| `_constants/command-center.ts` | **แก้** — `SalesSeries` type เพิ่ม optional `expenseValues?`, `netProfitValues?`, `totalExpense?`, `netProfit?` |
| `components/SalesChartCard.tsx` | **แก้** — เพิ่มแถว 2 คอลัมน์ (ค่าใช้จ่าย/กำไรสุทธิ) เมื่อ field มีค่า + subtitle "กำไรคิดจากยอดที่ยืนยันแล้วเท่านั้น" |
| `components/SalesChartSheet.tsx` | **แก้** — เพิ่ม stat-row 3 ช่อง (ยืนยันแล้ว/ค่าใช้จ่าย/กำไรสุทธิ), 3rd chart series (bar, ไม่ stack), sub-line ต่อแถวรายวัน/เดือน |

### `src/app/(paces)/seller/(dashboard)/sales/`
| ไฟล์ | action |
|---|---|
| `page.tsx` | **แก้** — เพิ่ม `resolveExpenseAccess`, คำนวณ cogs/expense/netProfit ต่อวันจาก `items` ที่ fetch อยู่แล้ว + query `Expense` ใหม่ในช่วงเดียวกัน |
| `components/data.ts` | **แก้** — `DailyRow` เพิ่ม `expense?`/`netProfit?`; `SummaryData` เพิ่ม `totalExpense?`/`netProfit?` |
| `components/SalesChart.tsx` | **แก้** — เพิ่ม series ค่าใช้จ่าย (bar, `chart-beta`), summary strip เพิ่ม 2 การ์ด (conditional) |
| `components/SalesTable.tsx` | **แก้** — เพิ่ม column `ค่าใช้จ่าย`/`กำไรสุทธิ` (conditional ผ่าน prop `showExpenseColumns`) |

---

## 4. Interaction + state spec

### 4.1 `ExpenseWorkspace` — single source of truth
```
state: range, customDates, report, expenses[] (full range-scoped), loading, error,
       hasAnyExpenseEver (static จาก SSR), modal: {mode:'create'|'edit', editing?} | null

fetchWorkspace(range, customDates):
  GET /api/expenses/report?range=...&start&end
  → { ...PnlReport, prevNetProfit, expenses[] }
  → setReport(...), setExpenses(...)

on mount: ข้าม fetch แรก (ใช้ initialReport/initialExpenses จาก SSR ตรงกับ range='today' default)
on range/customDates change: fetchWorkspace()
on mutate สำเร็จ (create/edit/delete จาก modal หรือ list):
  → fetchWorkspace(range เดิม)  ← FR-EXP-17: ไม่รีเซ็ต range
  → router.refresh() (sync layout อื่นที่อาจ depend on expense เช่น dashboard widget ถ้ามี cache)
```

### 4.2 เปิด/ปิดโมดัล
- เปิด create: ปุ่ม "เพิ่มค่าใช้จ่าย" (toolbar desktop/tablet, bottom-bar มือถือ) → `setModal({mode:'create'})`
- เปิด edit: แตะแถว (มือถือ) หรือปุ่ม ✎ (desktop/tablet) → `setModal({mode:'edit', editing: expense})`
- ปิด: ปุ่ม X / Escape / คลิก backdrop / (edit) ลบสำเร็จ → `setModal(null)`
- **กันปิดระหว่าง submitting** (FR-EXP-18): `dismiss()` เช็ค `submitting` guard เหมือน `ShipmentEntryModal` เป๊ะ — ปุ่ม X ก็ `disabled={submitting}`
- Focus: เปิด → focus ช่องแรก (จำนวนเงิน); ปิด → คืน focus ให้ trigger element เดิม (`previouslyFocused.current`)
- Escape/Tab-trap: เหมือน `ShipmentEntryModal` ทุกประการ (คัด logic ตรง ๆ)

### 4.3 Submit (create/edit)
- validate (Yup) → error inline ใต้ช่อง, ไม่ toast, focus ช่อง error แรก
- submit สำเร็จ → `pacesToast.success(...)` + ปิด modal + `onMutated()` (trigger fetchWorkspace)
- submit ล้มเหลว (network/500) → `pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')`, modal ไม่ปิด, ค่าฟอร์มไม่หาย
- **double-submit**: ปุ่ม submit `disabled={isSubmitting}` (RHF native) — เหมือนเดิม

### 4.4 ลบ (จาก list row หรือ modal edit footer)
- `pacesConfirm.danger('ลบรายการค่าใช้จ่ายนี้?', 'ลบแล้วกู้คืนไม่ได้')` → ยืนยัน → `DELETE /api/expenses/{id}`
- 200 → `pacesToast.success('ลบค่าใช้จ่ายแล้ว')` + (ถ้าลบจาก modal: ปิด modal ก่อน) + `onMutated()`
- 404 (ถูกลบจากแท็บอื่นไปแล้ว) → `pacesToast.error('รายการนี้ถูกลบไปแล้ว')` + ปิด modal ถ้าเปิดอยู่ + `onMutated()` (sync list ให้ตรงความจริง)

### 4.5 Sync: modal → list → P&L → breakdown/quick-stats
เพราะทั้ง 4 จุดอ่านจาก **`report`/`expenses` เดียวกันใน `ExpenseWorkspace`** (ไม่ใช่คนละ fetch เหมือนเดิม) การ mutate 1 ครั้ง → `fetchWorkspace()` 1 ครั้ง → ทั้ง 4 UI อัปเดตพร้อมกันเสมอ ไม่มีทางขัดกัน (แก้ปัญหา #2 ที่ราก)

### 4.6 Filter/search ใน `ExpenseList` (local, ไม่กระทบ report/breakdown/quick-stats)
```
categoryFilter: 'ALL' | ExpenseCategory (default 'ALL')
search: string (debounce ไม่จำเป็น — filter ใน memory, list ไม่ใหญ่)
visibleCount: number (reset → initial ทุกครั้ง categoryFilter/search เปลี่ยน)

filtered = expenses
  .filter(e => categoryFilter==='ALL' || e.category===categoryFilter)
  .filter(e => !search || (e.note ?? '').toLowerCase().includes(search.trim().toLowerCase()))

visible = filtered.slice(0, visibleCount)
"โหลดเพิ่ม" → visibleCount += 10
```
- chip count (`ค่าโฆษณา 6`) คำนวณจาก `expenses` เต็ม (ไม่ filter ด้วย search) — นับตาม category เท่านั้น
- มือถือ: กด "ตัวกรอง" → เปิด `ExpenseCategoryFilterSheet` (แสดง 7 หมวด + ทั้งหมด, จำนวนต่อหมวด, เลือกแล้วปิดทันที)

### 4.7 Loading/error states
- **โหลดรายงานครั้งแรก (mount)**: ใช้ initial data จาก SSR ทันที ไม่มี skeleton
- **เปลี่ยน range/mutate**: PnlReportCard/BreakdownCard/QuickStatsCard เข้า `opacity-50` + spinner กลาง (เหมือน `PnlReportCard` เดิม), list คงข้อมูลเก่าไว้ (ไม่ล้าง กัน layout jump)
- **fetch ล้ม**: `pacesToast.error('โหลดรายงานไม่สำเร็จ กรุณาลองใหม่')`, คงข้อมูลเก่าค้างไว้ (เหมือน `PnlReportCard` เดิม) — ไม่มีปุ่ม retry แยก (range switcher เองก็ trigger refetch ได้)

---

## 5. Responsive rules (Tailwind ปกติของ Paces — ไม่ remap แบบ Vuexy)

| Breakpoint | Threshold | เปลี่ยนอะไร |
|---|---|---|
| `< 640px` (มือถือ) | ปริยาย (ไม่มี prefix) | Modal = bottom sheet (`fixed inset-x-0 bottom-0 rounded-t-2xl`); Toolbar = sticky top bar + chip-scroll; ปุ่มเพิ่ม = sticky bottom full-width; QuickStatsCard `hidden`; BreakdownCard จำกัด 3 แถว+expand; List chip → ปุ่ม "ตัวกรอง" เปิด sheet; catgrid 2 คอลัมน์ (ปุ่มสุดท้าย `col-span-2`) |
| `sm:` (≥640px) | Modal → กล่องกลางจอ (`sm:items-center sm:rounded-xl sm:max-w-lg sm:m-3`); catgrid `sm:grid-cols-3` |
| `md:` (≥768px) | ไม่ใช้เป็นจุดตัดหลักของ feature นี้ (Paces ไม่ remap เป็น 900 เหมือน Vuexy) |
| `lg:` (≥1024px) | Toolbar/breadcrumb กลับมาแถวเดียว (title+segmented+ปุ่มชิดขวา); Breakdown/QuickStats กลับเป็น `lg:grid-cols-[1.75fr_1fr]`; PnlReportCard stat-cell icon `lg:flex` (ซ่อน < lg) |
| Tablet เฉพาะ (834, อยู่ระหว่าง sm/lg) | อัตโนมัติจากกฎข้างบน (ได้ modal กล่องกลางจอจาก `sm:`, breakdown/quickstats stack แนวตั้งเพราะยังไม่ถึง `lg:`) — ตรง mockup พอดี |

**Tap target**: ปุ่ม icon ทุกตัว (✎/🗑/close/chevron) ≥44px — ใช้ `btn btn-icon` (37px) **ต้องเพิ่ม `min-h-11 min-w-11`** เมื่ออยู่ในบริบทมือถือ (ตาม pattern `SalesChartSheet.tsx` prev/next button ที่ทำไว้แล้ว `btn-icon min-h-11 min-w-11`) — ปุ่ม icon ในแถว list มือถือ **ไม่แสดง** (ทั้งแถวแตะได้ = แก้ไข ตาม copy "แตะแถวเพื่อแก้ไข · ปัดซ้ายเพื่อลบ" — **swipe-to-delete ไม่ทำใน scope นี้**, ดู Open Questions)

---

## 6. A11y spec

- Modal: `role="dialog" aria-modal="true" aria-labelledby="expenseFormModalTitle"`, focus trap (Tab/Shift+Tab วนใน dialog), Escape ปิด (เว้น submitting), backdrop click ปิด (เว้น submitting), คืน focus ให้ trigger เดิมตอนปิด — **คัด logic จาก `ShipmentEntryModal.tsx` ตรง ๆ**
- ปุ่ม category chip: `role="group" aria-label="หมวดหมู่ค่าใช้จ่าย"` ครอบ, แต่ละปุ่ม `aria-pressed={selected}` (ไม่ใช่ radiogroup — เหตุผลดู §0.5)
- ปุ่ม range segmented: `role="group" aria-label="ช่วงเวลารายงาน"` (คงเดิม)
- Chip filter หมวด (list): `role="group" aria-label="กรองตามหมวดหมู่"`
- Search input: `aria-label="ค้นหาหมายเหตุ"` (ไม่ใช้ `<label>` element คั่นใน `.input-icon-group` — ตาม gotcha ที่ document ไว้แล้ว)
- Textarea counter: `aria-live="polite"` ไม่จำเป็น (ไม่ใช่ error, แค่ informational — เว้นไว้เงียบพอ)
- `alertbar` (missing-cost) คงเดิม `role="alert" aria-live="polite"`
- Day-group header ใน list: ไม่ใช่ interactive, ใช้ `<h3>`/`<div>` ธรรมดา + `aria-label` รวมยอดถ้าต้องการ (optional)
- ทุกปุ่ม icon-only มี `aria-label` ภาษาไทย (แก้ไข/ลบ/ปิด/ค้นหา/ตัวกรอง/ช่วงก่อนหน้า/ช่วงถัดไป)
- Contrast: ตัวเลข "กำไรสุทธิ" สีแดง/เขียวบนพื้นขาว/พื้นอ่อน → ต้องใช้ **`text-danger-ink`/`text-success-ink`** (ไม่ใช่ `text-danger`/`text-success` ตรง ๆ ซึ่งตกเกณฑ์ AA ตาม comment ใน `_root.css`) — โค้ดปัจจุบัน (`PnlReportCard.tsx`) ใช้ `text-success`/`text-danger` ตรง ๆ บน `StatCell` **นี่คือบั๊กที่มีอยู่แล้ว ต้องแก้พร้อมกันในงานนี้**: เปลี่ยนเป็น `text-success-ink`/`text-danger-ink` ทุกจุดที่แสดงตัวเลขเงินสีเขียว/แดงบนพื้นขาว (StatCell, hero, breakdown legend amount, sales table cell, command-center footer, sheet stat-row) — ยกเว้น badge ที่มีพื้นสี wash (`bg-success/15`) ซึ่งใช้ `text-success` ปกติได้ตามตารางคอนทราสต์ที่ comment ไว้ใน `_root.css`

---

## 7. Content outline (ภาษาไทย) — สรุปย่อ (รายละเอียดเต็มอยู่ใน ASCII wireframe แล้ว)

| จุด | ข้อความ |
|---|---|
| Empty (ไม่เคยมีรายการ) | หัว "ยังไม่มีรายการค่าใช้จ่าย" / รอง "บันทึกค่าเช่า ค่าโฆษณา ค่าขนส่ง แล้วระบบจะคำนวณกำไรสุทธิให้อัตโนมัติ" / ปุ่ม "บันทึกรายการแรก" |
| Empty (มีรายการแต่ไม่มีในช่วงนี้) | หัว "ไม่มีรายการค่าใช้จ่ายในช่วงนี้" / รอง "ลองเลือกช่วงเวลาอื่น หรือดู 30 วันล่าสุด" |
| Empty (filter ไม่เจอ) | หัว "ไม่พบรายการที่ตรงกับตัวกรอง" / ปุ่ม "ล้างตัวกรอง" |
| PACKAGE_LOCKED/STAFF_NOT_ALLOWED | คงเดิม (`ExpenseLockedCard.tsx`) |
| Error โหลดรายงาน | toast "โหลดรายงานไม่สำเร็จ กรุณาลองใหม่" |
| ลบสำเร็จ/ล้ม | "ลบค่าใช้จ่ายแล้ว" / "เกิดข้อผิดพลาด กรุณาลองใหม่" |
| ลบแล้ว(404 จากแท็บอื่น) | "รายการนี้ถูกลบไปแล้ว" |
| Field required | "กรุณากรอกจำนวนเงิน" / "กรุณาเลือกหมวดหมู่" / "กรุณาเลือกวันที่" (คงเดิมจาก Yup schema) |
| Command-center subtitle ใหม่ | "กำไรคิดจากยอดที่ยืนยันแล้วเท่านั้น" |
| SalesChartSheet subtitle | "รวมทั้งเดือน · เทียบเดือนก่อน +X% · order ที่ไม่ยกเลิก" (คงเดิม) |

---

## 8. Edge states ที่ต้องออกแบบ (ครบตามที่บรีฟระบุ)

| Edge | พฤติกรรม |
|---|---|
| List ว่าง (3 variant) | ดู §7 |
| PACKAGE_LOCKED/STAFF_NOT_ALLOWED | `ExpenseLockedCard` เดิม (ไม่แตะ `ExpenseWorkspace` เลย — page.tsx gate ก่อน) |
| Double-submit | ปุ่ม `disabled={isSubmitting}` |
| แถวถูกลบจากแท็บอื่น (404) | ดู §4.4 |
| จอ <375px | catgrid 2 คอลัมน์ยังพอ (ปุ่มมี `min-w-0` + text wrap ได้); amount `text-2xl` ยังไม่ล้น; segmented chip-scroll แนวนอนกันล้น |
| หมายเหตุยาวผิดปกติ (500 ตัวอักษร) | textarea ไม่ resize (`resize-none`), counter แดงเมื่อเกิน (`text-danger-ink` เมื่อ `length > 500`), list row `.nt` ใช้ `truncate` (ตัด ... ตามที่ mockup ทำไว้แล้ว `.erow .nt{overflow:hidden;text-overflow:ellipsis}`) |
| ตัวเลข 0 | breakdown/quick-stats: ถ้า `totalExpense===0` ทั้งช่วง → ซ่อนการ์ดแยกหมวด+สรุปเร็วทั้งคู่ (ไม่มีอะไรให้ breakdown) แสดงแค่ empty-state ของ list แทน |
| ตัวเลขหลักล้าน | `Intl.NumberFormat('th-TH')` จัดการเองอยู่แล้ว (คอมมา่ทุก 3 หลัก) — ทดสอบว่า `.amt`/hero ไม่ wrap แปลก บนมือถือ (font-size ใหญ่สุด `text-3xl` ที่ hero, 7 หลัก+จุดทศนิยม ยังพอ) |
| `/sales`+command-center ไม่ GRANTED | ไม่ render คอลัมน์/แถว/การ์ดค่าใช้จ่าย-กำไรสุทธิเลย (ดู §0.3) — UI ที่เหลือเหมือนก่อนแก้ทุกประการ |
| Custom range ที่ end < start (ผู้ใช้พิมพ์ผิด) | ไม่ใหม่ (Flatpickr range mode กันเองอยู่แล้วจากโค้ดเดิม) |

---

## 9. Theme token — สีหมวดหมู่ (ใหม่, ต้องเพิ่มใน `src/lib/expense.ts`)

| Category | badge/avatar wash | legend dot / breakdown bar (solid) |
|---|---|---|
| RENT (ค่าเช่า) | `bg-info/12 text-info-ink` | `bg-info` |
| PACKAGING (ค่าแพ็คเกจ) | `bg-info/12 text-info-ink` (opacity ต่ำกว่า, ใช้ `bg-info/60` เฉพาะ bar) | `bg-info/60` |
| ADVERTISING (ค่าโฆษณา) | `bg-primary/12 text-primary` | `bg-primary` |
| SHIPPING (ค่าขนส่ง) | `bg-primary/12 text-primary` (bar ใช้ `bg-primary/60`) | `bg-primary/60` |
| SALARY (เงินเดือน) | `bg-default-200 text-default-700` | `bg-default-600` |
| UTILITIES (สาธารณูปโภค) | `bg-warning/12 text-warning-ink` | `bg-warning` |
| OTHER (อื่นๆ) | `bg-default-100 text-default-600` | `bg-default-400` |

**เหตุผลเลือก:** หลีกเลี่ยง `secondary`(#7b70ef ใกล้ม่วง Vuexy เกินไป) และ `danger`/`success` (สงวนไว้กับความหมาย "เงินไหลออก"/"ยืนยันแล้ว" ที่ใช้อยู่ทั่วหน้าแล้ว กันสับสนความหมาย) — ใช้ ramp น้ำเงิน/เทา (primary+info+ค่า opacity) เป็นหลัก คล้ายสัญชาตญาณเดิมของ mockup (ที่ใช้ hex เถื่อนสร้าง ramp น้ำเงิน) แต่แทนด้วย token+opacity modifier จริง (`bg-primary/60` เป็น Tailwind opacity primitive มาตรฐาน ไม่ใช่ arbitrary value)

Chart-only (ผ่าน `getColor()`, ApexChart เท่านั้น ไม่ใช่ Tailwind class): ค่าใช้จ่ายในกราฟ (SalesChart/SalesChartSheet) ใช้ `getColor('chart-beta')` (#f7577e = เท่ากับ danger token เป๊ะ — token ที่ทำมาเพื่อ chart โดยเฉพาะ ไม่ใช่ hardcode)

---

## 10. Impeccable compliance

**Mode: Operate** — เหตุผล: หน้า `(paces)` seller เป็น dashboard/ฟอร์ม/ตารางล้วน (ตรงนิยาม `operate.md` เป๊ะ) ผู้ใช้อยู่ใน "งาน" ไม่ใช่ "เยี่ยมชม" — scanability/consistency/earned-familiarity ชนะการแสดงออก ตาม `operate.md`: "The tool should disappear into the task", ยึด **Restrained** color (accent = primary action + สถานะเท่านั้น ไม่ตกแต่ง), one-family typography (Anuphan ตัวเดียวทุก element รวม hero number — ไม่มี display font แยก), fixed rem scale (ใช้ token scale จริงของ Paces `text-2xs..text-4xl` ไม่ fluid/clamp)

- **One Voice Rule (primary ≤~10% จอ):** ตรวจแล้ว — primary (`bg-primary`) ปรากฏเฉพาะ: ปุ่ม "เพิ่มค่าใช้จ่าย"/"บันทึกค่าใช้จ่าย" (action), segmented range ตอน active, category chip ตอน active, ADVERTISING/SHIPPING category swatch (data-driven ไม่ใช่ตกแต่ง). พระเอกของหน้าคือ **"กำไรสุทธิ" hero number** (`text-3xl font-bold`) — ไม่ใช่สีน้ำเงิน แต่คือขนาด/น้ำหนักตัวอักษร (สอดคล้อง "แบรนด์อยู่ในรายละเอียดที่แม่นยำ" ของ `operate.md` มากกว่าสี)
- **Verified-Means-Green Rule:** ไม่มีสถานะ "รอยืนยัน" ในหน้านี้ที่เสี่ยงใช้เขียวผิด — "ยืนยันแล้ว" (confirmed revenue) ใช้ `chart-primary`(น้ำเงิน)/`bg-primary` ไม่ใช่เขียว (สอดคล้อง component เดิม `SalesChartSheet` ที่ทำถูกอยู่แล้ว: ยืนยันแล้ว=น้ำเงิน, ยังไม่ยืนยัน=เหลือง — **ไม่ใช่เขียว** ตั้งแต่แรก, ไม่ต้องแก้)
- **Sentence case:** ทุก label/ปุ่ม/หัวข้อในสเปกนี้เป็น sentence case ไทยอยู่แล้ว (ไม่มี ALL CAPS ที่ไหน)
- **Ink-tinted shadow:** `.card`/`.dialog` ใช้ `shadow`/`shadow-lg` token ของ Paces (`_root.css`: `rgba(130,143,163,.15)`/`rgba(76,76,92,.2)`) — เป็น slate-tinted ไม่ใช่ดำสนิทอยู่แล้ว (Paces token, ไม่ใช่ Vuexy ink-plum โดยตรง — ถือว่าเทียบเท่าเจตนา "ไม่ดำสนิท" ผ่าน)
- **Anti-slop:** ไม่มี gradient ตกแต่ง, ไม่มี hero-metric-template ซ้ำ (การ์ด breakdown/quick-stats มีข้อมูลจริงต่างกันชัดเจน ไม่ใช่การ์ดตัวเลขใหญ่เหมือนกันเป๊ะ), ไม่มี eyebrow ตัวพิมพ์เล็ก, ไม่ซ้อนการ์ดในการ์ด (breakdown/quick-stats เป็น sibling card ไม่ใช่ nested), border ที่ใช้ = `border-dashed` (ลายเซ็น Paces card-header, ไม่ใช่ >1px ตกแต่ง)
- **น้ำเสียง copy:** empty state ทั้ง 3 variant บอกทางออกชัดเจน ("ลองเลือกช่วงเวลาอื่น" / "ล้างตัวกรอง") ไม่ใช่แค่บอกว่าไม่มี; error copy ("โหลดรายงานไม่สำเร็จ กรุณาลองใหม่") ไม่กล่าวหาไม่ใช้ภาษาราชการ; ไม่มีคำไฮป์ที่ไหน
- **จุดที่ theme (Hard Rule 7) ขัดกับความตั้งใจของ mockup — ตัดสินแล้ว:**
  1. Hex สี breakdown bar (`#5b8fd9`/`#9dc9dd`) ใน mockup → **ไม่ใช้ตรงๆ** แปลงเป็น token+opacity (§9) — theme ชนะ
  2. `max-width: 520px` ของ dialog → ไม่มี token ตรง เลือก `sm:max-w-lg` (512px, primitive จริงที่ใกล้ที่สุด) แทน arbitrary `max-w-[520px]`
  3. Flatpickr ปฏิทินภาษาไทย พ.ศ. ("2 ส.ค. 2569" ในช่องวันที่โมดัล) → ไม่มี precedent ในโค้ดเบส ใช้ native `<input type="date">` + quick-chip แทน (ลด scope, ไม่เสี่ยง custom locale hack) — **นี่คือจุดที่ฉันตัดสินใจ deviate จาก pixel ของ mockup โดยเจตนา** ระบุใน Open Questions ว่าอยากได้ fidelity เป๊ะไหม

---

## 11. Design decisions + rationale (สรุปจุดสำคัญที่ไม่ได้อยู่ใน mockup ตรง ๆ)

1. **Command-center card "กำไรสุทธิ ฿0" → แก้เป็น "−฿1,450" (แดง)** — mockup ดิบมี 2 เฟรมขัดกันเอง (card แสดง ฿0, sheet แสดง −฿1,450 สำหรับ scenario เดียวกัน) เลือกสูตรที่ถูกต้องทางคณิตศาสตร์ (confirmedRevenue−cogs−expense อาจติดลบได้จริง) และ **สอดคล้องกับหลักการ "show don't tell / ห้ามโกหกตัวเลข"** ใน PRODUCT.md
2. **ขยาย `getSalesSeries` ให้ COGS-aware แทนสูตรลัด** — เพื่อให้ "กำไรสุทธิ" หมายถึงสูตรเดียวกันทุก surface (Hard Rule anti-slop #6 "คำเดียวกันหมายถึงของเดียวกันทั้งสเปก") แลกกับ query ที่หนักขึ้นเล็กน้อยใน dashboard (ยอมรับได้เพราะไม่ใช่ hot-path, โหลดครั้งเดียวตอนเข้า dashboard) — **ระบุเป็น Open Question ให้ Controller ยืนยัน** เผื่อกังวลเรื่อง perf
3. **แยก header (PageBreadcrumb) กับ toolbar (ExpenseToolbar) เป็น 2 แถว** แทนที่จะพยายามยัดในแถวเดียวกับ mockup — เพราะ range/modal state ต้องอยู่ใน client component เดียว (`ExpenseWorkspace`) ในขณะที่ title เดิม render จาก RSC (`page.tsx`) — แยกแถวคือทางที่สะอาดกว่าการ hack cross-component state
4. **Mobile edit-modal footer 2 แถว** (ลบเต็มความกว้างแยกจากยกเลิก/บันทึก) — mockup ไม่ได้วาด mobile-edit ชัด นี่คือ extrapolation ที่สมเหตุสมผลที่สุดในพื้นที่จำกัดของ sheet

---

### Anti-slop self-check

1. **เฉพาะกับ Deep ไหม** — ใช่: ตัวเลข "กำไรสุทธิ" ที่ต้องกำกับ "ยืนยันแล้วเท่านั้น" เป็นผลจาก business model เฉพาะของ Deep (order ต้องผ่าน buyer confirm ก่อนนับเป็นรายได้จริง) ไม่ใช่ pattern ที่ copy จาก dashboard ทั่วไปได้ตรง ๆ; หมวดค่าใช้จ่าย 7 หมวด+icon mapping ก็ผูกกับ `EXPENSE_CATEGORIES` ของโปรเจกต์นี้เท่านั้น
2. **มีพระเอก 1 อย่างต่อหน้าจอไหม** — มี: "กำไรสุทธิ" hero (`text-3xl`) เด่นกว่า 4 stat-cell รอบข้างชัดเจน (ขนาด+ตำแหน่งซ้ายสุด/บนสุด); ในหน้ารายการทั้งหน้า "รายการค่าใช้จ่าย" คือพระเอก (การ์ดใหญ่สุด อยู่ล่างสุดแต่กินพื้นที่มากสุด, breakdown/quick-stats เป็น context รอง เล็กกว่าเห็นชัด)
3. **การ์ด/element ที่ข้อมูลซ้ำ/ค่าคงที่ → ตัดแล้วหรือยัง** — quick-stats "จำนวนรายการ" ซ้ำกับ badge `[24]` บน list header ในทางแนวคิด **แต่ไม่ตัด** เพราะบน desktop มันอยู่คนละสายตา (quick-stats คือสรุปภาพรวมไม่ต้อง scroll ไปนับที่ list) — ตัดสินใจเก็บไว้เฉพาะ desktop/tablet และ **ตัดออกจากมือถือ** เพราะมือถือ badge `[24]` อยู่ใกล้กว่ามาก ซ้ำจริง (นี่คือเหตุผลที่ QuickStatsCard `hidden` บนมือถือ ไม่ใช่แค่ประหยัดพื้นที่)
4. **State ครบไหม** — empty (3 variant) / loading (skeleton opacity) / error (toast+ค้างข้อมูลเก่า) / note ยาว 500 ตัวอักษร (truncate+counter) / ตัวเลข 0 (ซ่อนการ์ดที่ไม่มีอะไรให้ breakdown) / หลักล้าน (Intl.NumberFormat) — ครบตาม §8
5. **Copy ตรงกับที่ระบบทำได้จริงไหม** — "บันทึกรายการแรก" เปิด modal จริง (ไม่ใช่ลิงก์ไปหน้าอื่น); "ล้างตัวกรอง" reset state จริง; error บอกให้ "ลองใหม่" เฉพาะตอนที่ retry จะได้ผลจริง (fetch ล้มเพราะ network ชั่วคราว ไม่ใช่ permission ที่ retry ไม่ช่วย)
6. **คำเดียวกัน = ของเดียวกันทั้งสเปกไหม** — "กำไรสุทธิ" ตอนนี้สูตรเดียวกันทุก surface หลังตัดสินใจข้อ 2 ใน §11 (แก้จากความขัดแย้งเดิมในตัว mockup); "ยืนยันแล้ว/ยังไม่ยืนยัน" หมายถึง order status เดียวกันทุกที่ (CONFIRMED vs PENDING/SHIPPED) ไม่เปลี่ยนความหมาย
7. **สีสื่อความหมายถูกไหม** — เขียว(`success`) ไม่ใช้เลยในฟีเจอร์นี้กับสถานะที่ยังไม่ยืนยัน (ยืนยันแล้ว=น้ำเงิน, ยังไม่ยืนยัน=เหลือง — ถูกต้องอยู่แล้วจากโค้ดเดิม); แดง(`danger-ink`) ใช้เฉพาะ "เงินไหลออก" (ค่าใช้จ่าย, กำไรติดลบ) เท่านั้น สอดคล้องทุกจุด; แก้บั๊ก contrast เดิม (`text-danger`→`text-danger-ink`) ที่พบระหว่างทำสเปกนี้ (§6)
8. **แตะได้จริงบนมือถือไหม** — ปุ่มเพิ่ม sticky bottom full-width (>44px แน่นอน); ปุ่ม prev/next chart มี `min-h-11 min-w-11` ชัดเจนใน spec; row ทั้งแถวแตะได้แทน icon เล็ก (ลด mis-tap); ปุ่มเพิ่มไม่ลอยนอกโซนนิ้วโป้ง (sticky bottom ล่างสุดของจอพอดี)
9. **จอกว้าง 1440 คอลัมน์ไหนว่าง** — breakdown/quick-stats เป็น `1.75fr/1fr` เต็มความกว้าง content (~1020px คงที่ตาม sidenav layout ของ Paces ไม่ยืดเป็น 1440 เต็มจอ — Paces sidenav+content มี max-width ของตัวเองอยู่แล้วจากธีมเดิม ไม่ใช่ 70/30 ที่ empty; ไม่มีคอลัมน์ไหนถูกปล่อยว่างในงานนี้)

---

## 12. Open questions (ให้ Controller/user ตัดสิน)

1. **COGS-aware ทุก surface (default ที่แนะนำ) vs สูตรลัดที่ command-center/sheet** — ยอมรับ query `items{cost,qty}` เพิ่มใน `getSalesSeries` (ทุกครั้งที่เข้า dashboard) เพื่อความสอดคล้อง 100% ไหม หรือให้ perf ชนะแล้วรับความไม่ตรงกันเล็กน้อย (พร้อม disclaimer ชัดเจนกว่านี้)?
2. **ช่องวันที่ในโมดัล** — native `<input type="date">` + chip ด่วน (ที่ recommend, ทำได้เลย) พอไหม หรืออยากได้ Flatpickr แสดง "2 ส.ค. 2569" แบบ pixel-perfect (ต้อง custom locale, effort เพิ่ม, เป็น Phase 2 ได้)?
3. **Swipe-to-delete บนมือถือ** — mockup มี copy "ปัดซ้ายเพื่อลบ" แต่ spec นี้ไม่ได้ implement (ใช้แตะแถว=แก้ไข + ปุ่มลบใน modal edit แทน) เพราะ swipe gesture เป็น effort สูง/เสี่ยง conflict กับ scroll แนวตั้ง — ตัดออกจาก scope นี้ได้ไหม (แนะนำ: ตัด, ไม่ critical)
4. **"+12.4% จากช่วงก่อนหน้า"** — ยืนยันสูตร "ช่วงก่อนหน้าความยาวเท่ากัน ต่อเนื่องก่อน start" (§0.6, §Data) ตามที่ออกแบบไว้ไหม หรือ product อยากได้นิยามอื่น (เช่น "เดือนก่อนหน้าเป๊ะ" สำหรับ preset 'month')?
5. **hasAnyExpenseEver query** — เพิ่ม `findFirst` เบา ๆ ที่ page.tsx ทุกครั้งที่เข้าหน้า (สำหรับแยก empty-state variant 1 vs 2) ยอมรับได้ไหม หรือยุบ 2 empty variant เป็นอันเดียวเพื่อลด query (ลด UX fidelity เล็กน้อย)?
---

## 13. คำตัดสินของ Controller ต่อ Open questions (2026-08-02)

| # | คำตัดสิน | เหตุผล |
|---|---|---|
| 1 | **COGS-aware ทุก surface** (ตามที่ ux แนะนำ) | "กำไรสุทธิ" ต้องหมายถึงสูตรเดียวกันทุกที่ ไม่งั้นผู้ใช้จับได้เองว่าตัวเลขสองหน้าไม่ตรง แล้วเลิกเชื่อทั้งฟีเจอร์ dashboard ไม่ใช่ hot-path (โหลดครั้งเดียวตอนเข้า) — ถ้าวัดแล้วช้าจริงค่อยแก้ด้วยการ cache ไม่ใช่ด้วยการยอมให้ตัวเลขเพี้ยน |
| 2 | **native `<input type="date">` + chip ด่วน** (ไม่เอา Flatpickr) | ไม่มี precedent ปฏิทิน พ.ศ. ในโค้ดเบส การ custom locale เพื่อ pixel-perfect ไม่คุ้มความเสี่ยง — display พ.ศ. ยังถูกต้องทุกที่ที่ *แสดงผล* ผ่าน `formatDate` อยู่แล้ว |
| 3 | **ตัด swipe-to-delete ออก** + ลบ copy "ปัดซ้ายเพื่อลบ" ออกจาก mockup ด้วย | gesture ชนกับ scroll แนวตั้ง เสี่ยงลบพลาด และ mockup ต้องไม่โฆษณาสิ่งที่ระบบไม่ทำ |
| 4 | **ยืนยันสูตร "ช่วงก่อนหน้าความยาวเท่ากัน ต่อเนื่องก่อน start"** | ตรงกับที่ผู้ใช้คาดเวลาเทียบ "30 วันนี้ vs 30 วันก่อน"; preset `month` จะได้ช่วงที่ยาวเท่ากันเสมอ ไม่แกว่งตามจำนวนวันในเดือน |
| 5 | **รับ `hasAnyExpense` findFirst** | query เบามาก (`select: {id}` + `take 1`) แลกกับ empty state ที่พูดถูก — ร้านที่ไม่เคยบันทึกเลย กับร้านที่ช่วงนี้ไม่มีรายการ ต้องเห็นข้อความคนละแบบ |

### หมายเหตุถึง developer
- **emoji ใน ASCII wireframe (§1) เป็น placeholder ของไอคอนเท่านั้น — ห้าม copy ลง JSX** ตัวจริงคือ tabler name จาก `EXPENSE_CATEGORY_ICON` ผ่าน `Icon` wrapper (Hard Rule 12)
- ขอบเขตงานนี้ **เกินกว่าที่ PRD/SRS ของ feature 00016 เขียนไว้** (การ์ดสรุป 2 ใบ, filter/ค้นหา, และรายจ่ายไหลเข้าหน้ายอดขาย 3 surface ซึ่งแตะ `sales/`+`dashboard/`+`dashboard.service.ts`) — ต้องอัปเดตเอกสาร 00016 ให้ตรงก่อนปิดงาน ไม่ทิ้งเป็นหนี้
