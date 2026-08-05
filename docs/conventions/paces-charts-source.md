# Paces Charts Source — chart ทุกตัวใน (paces) ต้อง copy จาก theme charts dir (Hard Rule 10)

> **กฎ:** ทุก chart/graph ใน `(paces)/**` (seller + admin) **ต้อง copy structure มาจาก**
> `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/` **เท่านั้น** แล้วปรับ content/data ตามความต้องการจริง.
> ห้าม build chart options เอง from scratch, ห้าม source จาก Vuexy theme, ห้ามใช้ chart lib อื่นที่ไม่ผ่าน wrapper `@/components/wrappers/ApexChart`.

ที่มา: user สั่ง (2026-06-16) — กัน chart หลายสไตล์ปนกัน (color token ต่าง/spacing ไม่ Paces/mood ผิด) และให้มีจุดอ้างอิงเดียวที่เป็น Paces แท้.

---

## Component ที่มีใน theme dir

path: `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/`

| Component | ชนิด chart | ใช้เมื่อ |
|---|---|---|
| `SalesReport.tsx` | Line + Area combo | ภาพรวมยอดขาย/revenue รายช่วงเวลา (Today/Monthly/Annual tab) |
| `SalesChart.tsx` (ถ้ามี) / `StorePerformance.tsx` | Bar / Area | ผลประกอบการร้าน เปรียบเทียบ period |
| `RevenueStat.tsx` | Sparkline (mini line/bar แนวนอน) | stat card หัวข้อ revenue/expense/cashflow |
| `Stat.tsx` | Sparkline (mini) | stat card ตัวเลขสำคัญ (revenue, orders, growth) |
| `FinancialOverview.tsx` | Bar/Column | ภาพรวมการเงิน หลาย category |
| `ProjectPerformance.tsx` | Radial Bar / Gauge | อัตราสำเร็จ / progress metric |
| `ProjectStatus.tsx` | Donut / Pie | สัดส่วนสถานะ (เช่น คำสั่งซื้อแต่ละ status) |
| `data.ts` | — | ข้อมูล seed + `chartOptions()` factory สำหรับ Stat/RevenueStat |

> ตรวจไฟล์จริงก่อนใช้ — เปิด `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/` และเลือก component ที่ shape ใกล้เคียงที่สุดกับสิ่งที่ต้องการ

---

## วิธีใช้ (developer workflow)

### 1. เลือก component ใน theme dir ที่ shape ใกล้เคียง

```
# ดูไฟล์ที่มี
ls theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/
```

### 2. Copy ไฟล์มาวางใน feature dir แล้วปรับ content/data

```bash
cp theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx \
   src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx
```

จากนั้นปรับ:
- ชื่อ function/component (rename ให้ตรงกับ feature)
- series data / data factory function (เชื่อม API/props จริง)
- label ภาษาไทย
- สี: **ใช้ `getColor('chart-*')` token เท่านั้น** — ห้าม hardcode hex (`#236dc9`, `#0a74ff`, ฯลฯ)
- ขนาด height ตามพื้นที่จริง (แต่อิง Paces spacing token)

**อย่าแตะ:** chart type, stroke width, grid, tooltip structure — copy จาก theme เพื่อ mood Paces แท้

### 3. Import wrapper ที่ถูกต้อง

```ts
import ApexChart from '@/components/wrappers/ApexChart'
import { ApexOptions } from 'apexcharts'
```

`ApexChart` คือ wrapper ที่ Paces theme ใช้ — **ห้าม import `react-apexcharts` โดยตรง** (bypass wrapper = ขาด SSR guard + lazy load ที่ wrapper จัดการ)

#### 🛑 `height` / `type` — prop ชนะ options เสมอ ต้องแก้ทั้งสองที่พร้อมกัน

wrapper เขียนว่า `height={height ?? options.chart?.height}` แปลว่า **ค่าใน `getOptions()` จะถูก prop ทับเงียบ ๆ** ไม่มี type error ไม่มี warning ไม่มีอะไรเตือน

```tsx
// ❌ แก้ options ฝั่งเดียว — 168 ถูกทิ้ง กราฟยังสูง 104 เหมือนเดิม
const getOptions = (): ApexOptions => ({ chart: { type: 'line', height: 168, ... } })
<ApexChart getOptions={getOptions} series={s} type="bar" height={104} />

// ✅ ตรงกันทั้งสองที่
const getOptions = (): ApexOptions => ({ chart: { type: 'line', height: 168, ... } })
<ApexChart getOptions={getOptions} series={s} type="line" height={168} />
```

**เหตุการณ์จริง 2026-08-05** (`c15c79bc` → แก้ที่ `9d01cb2e`): ตั้ง `height: 168` ใน options ตามที่ user สั่ง แต่ prop ยังค้าง `104` กราฟจึงเรนเดอร์ 104px ขึ้น prod ทั้งที่ commit message กับ mockup ยืนยันว่า 168 · โค้ดอ่านแล้วเหมือนถูกทุกบรรทัด · ผลลูกโซ่คือป้ายวันเอียงกินความสูงราว 40px จาก 104px เหลือพื้นที่วาด ~55px แท่งวันยอดน้อยเตี้ยกว่า 1px = **หายไปทั้งแท่งทั้งที่มีออเดอร์จริง** แล้วถูกตีความผิดว่า "กราฟไม่สวย"

**กฎ:** แก้ `chart.height`/`chart.type` ใน options เมื่อไหร่ → ไปแก้ prop ที่จุดเรียกในคอมมิตเดียวกันเสมอ และเขียนคอมเมนต์กำกับที่จุดเรียกว่า prop ชนะ options

#### กราฟกลับหัว/เพี้ยน "เฉพาะตอนเปิดครั้งแรก" = ปัญหาการวัดกล่อง ไม่ใช่ข้อมูล

ApexCharts วัด container ตอน render ครั้งเดียว ถ้าจังหวะนั้นค่ายังไม่นิ่ง (paint แรกบน iOS Safari หรือฟอนต์ Anuphan ยังโหลดไม่เสร็จ) มันคำนวณความสูงแถบป้ายแกน x ผิดจนพื้นที่วาดเหลือใกล้ศูนย์/ติดลบ แล้ววาดแท่งกลับด้าน — **เหมือนยอดติดลบทั้งที่ข้อมูลเป็นบวกล้วน** และหายเองเมื่อผู้ใช้สลับแอปกลับมา (iOS ยิง resize → วัดใหม่)

`ApexChart` wrapper ยิง `resize` ให้เองหลัง mount แล้ว (double rAF + `document.fonts.ready`) ตั้งแต่ `eb1b5bf6` — **ห้ามถอดออก** ถ้าเจออาการนี้อีกให้ไล่ที่การวัดกล่อง อย่าไปไล่ data path

🛑 **การวัด DOM ย้อนหลังพิสูจน์ได้แค่ว่า "ตอนนี้ถูก" ไม่ได้พิสูจน์ว่า "ตอน paint แรกถูก"** — ห้ามใช้ผลวัดที่หน้านิ่งแล้วมาปฏิเสธรายงานของ user

### 4. Commit ต้องมี `Base:` line ชี้ theme file ต้นทาง (Hard Rule 3)

```
Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
```

---

## Rationale — ทำไมต้อง copy จาก theme dir เท่านั้น

| ปัญหาถ้าไม่ทำตาม | ผลที่เกิด |
|---|---|
| Build chart options เองจาก scratch | สี/stroke/grid ไม่ตรง Paces token — chart "ลอย" ไม่เป็น mood เดียวกับ card/badge รอบข้าง |
| Copy มาจาก Vuexy theme | ใช้ Vuexy color palette (#7367F0 ม่วง) + MUI-style typography — ขัด Hard Rule 7 (ห้ามม่วง Vuexy ใน paces) |
| ใช้ ECharts / Chart.js / Recharts โดยตรง | Chart lib เพิ่มขึ้น (bundle ใหญ่), สไตล์ไม่เป็น Paces เลย, ไม่มีตัวอย่างใน theme dir ให้อ้างอิง |
| Hardcode hex สี | ผิด Hard Rule 7 — ต้องใช้ `getColor('chart-*')` / Paces CSS token แทน |

---

## ข้อยกเว้น

1. **`(marketing)/**` (buyer/landing)** — Vuexy zone: ใช้ chart wrapper ตาม Vuexy source (`theme/vuexy/...`) ได้ตามปกติ กฎนี้บังคับเฉพาะ `(paces)/**`
2. **chart ที่ theme dir ไม่มี shape รองรับ** (เช่น heatmap, candlestick ที่ไม่มีใน component dir) — ต้องขอ approval จาก user ก่อน จากนั้นสร้างโดยยึด: `ApexChart` wrapper + `getColor()` token + Paces spacing + เขียน comment `// ไม่มีใน theme dir — approved [date]`

---

## Reviewer grep gate (ต้องผ่านก่อน merge ทุก PR ที่แตะ `(paces)/**`)

```bash
# ต้องคืน 0 — ห้าม import react-apexcharts โดยตรง (ข้าม wrapper)
rg "from 'react-apexcharts'" "src/app/(paces)/"

# ต้องคืน 0 — ห้าม import echarts โดยตรง
rg "from 'echarts'" "src/app/(paces)/"

# ต้องคืน 0 — ห้าม import chart.js โดยตรง
rg "from 'chart\.js'" "src/app/(paces)/"

# ต้องคืน 0 — ห้าม import recharts
rg "from 'recharts'" "src/app/(paces)/"

# ตรวจว่าทุก chart component ใน (paces) มี Base: comment ชี้ theme/paces charts dir
rg "Base:" "src/app/(paces)/" -l | head -20
# แล้ว manual verify ว่า Base: ชี้ไป theme/paces/Admin/TS/src/app/(admin)/widgets/charts/
```

ถ้าพบ direct import chart lib (ไม่ผ่าน `@/components/wrappers/ApexChart`) → block merge + ให้ refactor ผ่าน wrapper พร้อม copy structure จาก theme dir
