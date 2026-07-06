# Sales Chart บน Command Center

> วันที่: 2026-07-06 · Surface: seller `(paces)/**` (Paces) · Mockup: `2026-07-06-quick-create-order.html` (command center frame + "ยอดขาย → full sheet" frame)

## 1. เป้าหมาย
Seller เห็นกราฟแท่งยอดขายบน command center — 2 โหมด:
- **รายวัน:** เลือกเดือน → แท่งต่อวันทั้งเดือน; `‹ ›` ย้อนหลัง/ถัดไปได้ (อนาคต disabled).
- **รายเดือน:** เลือกปี → แท่งต่อเดือนทั้งปี (ม.ค.–ธ.ค.); `‹ ›` ย้อนหลังปีได้.

## 2. Scope
**In:**
1. **การ์ด "ยอดขาย" mini บน command center** — วาง**เหนือ section "คำสั่งซื้อ"**; สูงพอดีมือถือ: ยอดรวมเดือนนี้ + %เทียบเดือนก่อน + mini bars (sparkline). แตะ → full-screen sheet.
2. **Full-screen chart sheet** — toggle `[รายวัน|รายเดือน]` + period nav `‹ … ›` + ยอดรวมช่วง + **กราฟแท่ง** (ApexChart) + วันอนาคต dim.
3. **Backend** — service aggregate ยอดขายต่อวัน/เดือน.

**Out (Phase 2):** เปรียบเทียบหลายช่วง, export, filter ตามช่องทาง/สินค้า.

## 3. Metric
- **ยอดขาย = sum `Order.totalAmount`** ของ order ที่ **status ≠ CANCELLED** (นับ PENDING+SHIPPED+CONFIRMED), `shopId` = ร้านปัจจุบัน.
- จัดกลุ่มตาม **`Order.createdAt`** (โซนเวลาไทย) — รายวัน = ตามวันของเดือนที่เลือก; รายเดือน = ตามเดือนของปีที่เลือก.
- **%เทียบ:** ยอดรวมช่วงนี้ vs ช่วงก่อนหน้า (เดือนก่อน / ปีก่อน).

## 4. สถาปัตยกรรม
### 4.1 Backend — `getSalesSeries` (`src/services/dashboard.service.ts` หรือ `order.service.ts`)
```
getSalesSeries(shopId: string, mode: 'daily'|'monthly', period: { year: number; month?: number })
  : Promise<{ labels: string[]; values: number[]; total: number; prevTotal: number }>
```
- คำนวณช่วง: daily → ต้นเดือน..ปลายเดือน (`period.year`,`period.month`); monthly → ต้นปี..ปลายปี.
- `prisma.order.findMany({ where: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte, lt } }, select: { totalAmount, createdAt } })` → aggregate sum ต่อวัน/เดือน ใน JS (ช่วงเล็ก: ≤31 วัน หรือ 12 เดือน — ไม่ต้อง raw SQL).
- `prevTotal` = sum ของช่วงก่อนหน้า (เดือน/ปีก่อน) query แยก (หรือรวม query เดียว range กว้าง).
- labels: daily → "1".."31"; monthly → "ม.ค.".."ธ.ค.". อนาคต (วันที่ > วันนี้) → value 0 + flag dim.
- วันที่ทั้งหมดใช้ `formatDate`/tz ไทย ตาม convention.

### 4.2 UI — command center
- `dashboard/page.tsx` ดึง series เริ่มต้น (mode='daily', เดือนปัจจุบัน) ส่งเข้า CommandCenter.
- Component ใหม่ `dashboard/components/SalesChartCard.tsx` — การ์ด mini (`.sc` shell): ยอดรวม + % + **mini bars** (div ธรรมดา หรือ ApexChart sparkline). `'use client'` + `useState` เปิด full sheet. render ใน CommandCenter **ก่อน block "คำสั่งซื้อ"**.
- `dashboard/components/SalesChartSheet.tsx` — full-screen sheet: toggle mode + period nav (‹ ›) + total + **ApexChart bar** + xaxis. เปลี่ยน mode/period → fetch series ใหม่ (`GET /api/seller/sales-series?mode=&year=&month=`).

### 4.3 Chart (Hard Rule 10)
- **copy structure จาก `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/` (bar chart)** แล้วปรับ data — **ห้าม build options from scratch, ห้าม import `react-apexcharts` ตรง ๆ** (ผ่าน `@/components/wrappers/ApexChart`).
- สี: `getColor('chart-*')` token (ห้าม hardcode hex). แท่งสูงสุด/วันนี้ highlight; อนาคต = สีจาง.
- Commit ต้องมี `Base:` ชี้ theme charts file (HR3).

### 4.4 API
- `GET /api/seller/sales-series?mode=daily|monthly&year=YYYY&month=MM` → `{ labels, values, total, prevTotal }`. auth = seller session + active shop; guardApi (Origin/rate-limit) ตามระบบ.

## 5. UX micro-rules
- period nav: ปุ่ม `›` (ถัดไป) **disabled** เมื่อถึงเดือน/ปีปัจจุบัน (ไม่มีอนาคต).
- daily: วันที่ยังไม่ถึง (> วันนี้) แท่ง dim/0.
- mini card: โชว์ยอด "เดือนนี้" (mode daily, เดือนปัจจุบัน) เสมอ.
- ไม่มียอดขายในช่วง → กราฟว่าง (แท่ง 0) + ข้อความ "ยังไม่มียอดขายในช่วงนี้".
- loading: skeleton/spinner ระหว่าง fetch เปลี่ยน period.

## 6. Acceptance
- CC เห็นการ์ดยอดขาย mini เหนือคำสั่งซื้อ; แตะ → full sheet.
- รายวัน: เลือกเดือน → แท่งต่อวันถูก; `‹` เดือนก่อน โหลดข้อมูลใหม่; `›` ปัจจุบัน disabled.
- รายเดือน: เลือกปี → 12 แท่ง; `‹` ปีก่อน.
- ยอด = order ไม่ยกเลิก (verify DB: exclude CANCELLED).
- Chart ผ่าน ApexChart wrapper + token สี (reviewer grep `react-apexcharts` ใน (paces) = 0).

## 7. Non-goals / คงเดิม
ไม่มี migration; ไม่แตะ order/create; ไม่แตะ dashboard metrics เดิม (เพิ่มการ์ดใหม่).
