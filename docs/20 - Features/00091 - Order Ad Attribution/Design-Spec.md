---
title: "Design-Spec — 00091 ที่มาโฆษณาของคำสั่งซื้อ + รายงานยอดขายตามโฆษณา"
owner: shinobu22
status: draft
created: 2026-11-14
tags: [feature, design-spec, ads, order]
related: ["[[PRD]]", "[[BRD]]"]
---

> ผลิตโดย safepay-ux (HR8) 2026-11-14

## หน้า: ที่มาโฆษณาของคำสั่งซื้อ 5 จุด (00091) — Design Spec

Mode: **Operate**. ทุกจุดเป็นหลังบ้านผู้ขาย (Paces) ที่ผู้ใช้สแกนตัวเลขและทำงานซ้ำทุกวัน

ลำดับอ่านที่ใช้: PRD+BRD 00091, DESIGN.md, ตาม code จริงของแต่ละ surface (อ่านแล้วทุกไฟล์ที่อ้างด้านล่าง), `native-chat-sync/manifest.ts`, `order-export.ts`

**ข้อจำกัดของการสำรวจ:** ผมไม่ได้เปิดไฟล์ `.impeccable/design.json`, PRODUCT.md, `frontend-design/SKILL.md` และ playbook Impeccable เลย (อ่านแค่ DESIGN.md). ส่วน `docs/system/ui-guideline/README.md` กับ seller page-sourcing ก็ไม่ได้เปิด. ถ้า Controller ต้องการให้ spec ผ่านเกณฑ์ Hard Rule 9/10 เต็มรูป ต้องให้ผมอ่านชุดนี้ก่อนปิดงาน

### ข้อค้นพบที่เปลี่ยนการออกแบบ

1. **แถวหัวรายการ `/orders` ไม่ใช่ component ตัวเดียว.** เดสก์ท็อป ≥1024 อยู่ใน `OrdersTable.tsx` (`cell` ของคอลัมน์หัวแถว บรรทัด ~1284-1334). มือถือ <1024 เป็นการ์ด `OrderCard.tsx` ซึ่งไม่มีแถว "เลขที่+คัดลอก+เปิดข้อความ+วันที่" แบบเดสก์ท็อป จึงต้องวางต่างกัน
2. **`OrderCardView` ถูกใช้ฝั่งผู้ซื้อด้วย** (`side='buyer'` ในแอป Deep). บรรทัดโฆษณาต้อง gate สองชั้น: server ไม่ส่ง `adTitle`/`adId` ให้ผู้ดูที่ไม่ใช่สมาชิกร้าน (`chat-thread-messages.service.ts` มีผู้เรียกฝั่งผู้ซื้อ ตามคอมเมนต์บรรทัด 63) และ component render เฉพาะ `side==='seller'`
3. **`/orders` กรองฝั่ง client เต็มชุด และไม่มี filter ตามแอด** (PRD §5 ตัดออกจากรอบนี้). FR-008 "กดแถว → คำสั่งซื้อของแอดนั้น" จึงทำเป็น **ชีตในหน้ารายงาน** ไม่ลิงก์ไป `/orders?ad=`
4. **รายงานสินค้าเป็นรายเดือน ไม่ใช่ช่วงวันที่.** BRD ต้องการช่วงวันที่ (ค่าเริ่มต้น 30 วัน) จึงยืมแถบกรองจาก `reports/agents` (`ReportFilters` + `_shared/DateRangeControl`) ส่วนตาราง/มือถือ/ชีต/empty/error ยืมจาก products
5. **ชีตรายงานสินค้าอยู่แค่ <768 และใช้แสดงกราฟ** ผมเลยยืมแค่เปลือก (ล็อก scroll, ปุ่มย้อนกลับปิดชีต, focus) ไม่ใช่เนื้อหา

---

### 1. รายการคำสั่งซื้อ `/orders`

**เดสก์ท็อป (≥1024, `OrdersTable.tsx`)** วางชิปในแถว `flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1` ต่อจากป้าย "ประมูล" และก่อนกลุ่ม `ms-auto` (เปิดข้อความสนทนา + วันที่).

```
[checkbox][logo] DP2611-0042 [copy] [ประมูล]  (speakerphone) โฆษณา: โปรล้อแม็ก 11.11 วันเดียว…   ⟶ เปิดข้อความสนทนา  📅 14 พ.ย. 2569 09:41
```

(wireframe นี้มีแค่ของจริงในแถว ไม่มี emoji ใน UI จริง: ใช้ `Icon calendar`/`message-circle` ตามเดิม)

- ชิป: `<span className="badge bg-default-100 text-default-700 inline-flex max-w-xs min-w-0 items-center gap-1" title="โฆษณา: {ชื่อเต็ม}">`
  - ในชิป: `<Icon icon="speakerphone" className="size-3 shrink-0">` + `<span className="truncate">โฆษณา: {ชื่อ}</span>`
- โทน **กลาง (default-100)** ไม่ใช่ primary/warning/เขียว เพราะเป็นข้อมูลบริบท ไม่ใช่สถานะ ตามเหตุผลเดียวกับแบนเนอร์ในแชท
- ชื่อยาว: ตัด `…` ที่ `max-w-xs` (20rem). ชี้เมาส์เห็นชื่อเต็มผ่าน `title`. ถ้าแถวแคบ `flex-wrap` ดันชิปลงบรรทัดสองเอง
- **ไม่มีแอด = ไม่ render node เลย** ใช้ `{row.original.adTitle ?? row.original.adId ? <chip/> : null}` ห้าม placeholder/ช่องว่าง

**มือถือ (`OrderCard.tsx`)** ใส่แถวเต็มความกว้างใหม่ **ระหว่างบล็อกหัว (อวตาร/ชื่อ/#ID/สถานะ) กับเส้นประเหนือรายการสินค้า** (ก่อน `<div className="mt-2.5 border-t border-dashed …">` บรรทัด ~309).

```
┌ ▌(avatar) สมชาย ใจดี                       DP2611-0042 ┐
│  FB·โอน·081-234-5678                      [ส่งแล้ว]   │
│  (speakerphone) โฆษณา: โปรล้อแม็ก 11.11 วันเดียว ลด…   │   ← แถวใหม่ เมื่อมีแอดเท่านั้น
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
```

- เหตุผลที่ไม่ใส่ในแถว meta เดิม: คอลัมน์ซ้ายที่ 390px เหลือราว 168px หลังหักคอลัมน์ขวา ชื่อแอดจะถูกตัดเหลือไม่กี่ตัวอักษร
- `<p className="text-default-700 mt-2 flex min-w-0 items-start gap-1.5 text-xs"><Icon icon="speakerphone" className="mt-0.5 size-3.5 shrink-0"/><span className="line-clamp-2 break-words">โฆษณา: {ชื่อ}</span></p>`
- **"ชื่อเต็มเมื่อแตะ"**: ไม่ทำ tooltip/expand บนมือถือ เพราะแผ่นลิงก์โปร่งใสทับทั้งการ์ดอยู่ (`absolute inset-0`) แล้วแตะ = ไปหน้ารายละเอียด ซึ่งแสดงชื่อเต็ม (จุดที่ 3). แถวนี้ **ไม่ใส่ `relative z-10`** (เป็นข้อความล้วน ไม่ใช่ปุ่ม)
- อย่าเติมชื่อแอดเข้าฟังก์ชันค้นหา (`HighlightText`/order-search) รอบนี้ — นอกขอบเขต

**แท็บเล็ต ~768** ใช้การ์ดมือถือ (breakpoint ตัดที่ `lg` 1024 ตาม OrdersList) จึงไม่มีเลย์เอาต์ที่สาม

**ไอคอน:** `speakerphone` (ใช้แล้วใน ChatThread แบนเนอร์โฆษณา และตัวธีมเองใช้ใน `dashboard/ecommerce/components/data.ts`) ใช้ตัวเดียวกันทุกจุดของฟีเจอร์ เพื่อให้ "โฆษณา" = สัญลักษณ์เดียว

---

### 2. การ์ดคำสั่งซื้อในห้องแชท (ฝั่งผู้ขาย)

**ไฟล์:** `src/app/(paces)/seller/(chat)/_components/OrderCardView.tsx` (component เดียว ใช้ทั้งฟองแชท `OrderCardBubble` `w-64` และแท็บคำสั่งซื้อแผงขวา `w-full`).

**ตำแหน่งบรรทัด:** ใน `body` ภายใน `<div className="bg-card px-4 py-2.5">` (บรรทัด ~414) เป็น **ลูกตัวแรก ก่อน `<div className="space-y-1.5">` ของรายการสินค้า** คือใต้หัวน้ำเงินทันที.

```
┌─────────────────────────────┐
│ ██ (receipt-2) ล้อแม็ก 17 นิ้ว │  หัวน้ำเงิน (bg-primary)
│ ██ คำสั่งซื้อ · DP2611-0042   │
├─────────────────────────────┤
│ (speakerphone) จากโฆษณา: โปรล้อแม็ก 11… │  ← บรรทัดใหม่ text-2xs
│ [รูป] ล้อแม็ก 17 นิ้ว  x4 ฿3,200 │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ยอดสุทธิ            ฿12,800 │
```

- `<p className="text-default-700 mb-1.5 flex min-w-0 items-center gap-1.5 text-2xs" title={ชื่อเต็ม}><Icon icon="speakerphone" className="shrink-0 text-sm" aria-hidden="true"/><span className="truncate">จากโฆษณา: {ชื่อ}</span></p>`
- กว้างข้อความที่ `w-64` ≈ 224px ราว 28-30 ตัวอักษรไทย จึงต้อง `truncate`. ไม่มี border คั่น (กันบรรทัดเดียวดูเป็นการ์ดซ้อน)
- Render เมื่อ `side === 'seller'` **และ** `(data.adTitle ?? data.adId)` เท่านั้น. ไม่มี = การ์ดเหมือนเดิมทุกพิกเซล
- เพิ่ม field ใน `OrderCardViewData`: `adTitle?: string | null`, `adId?: string | null` (optional ทั้งคู่ ผู้เรียกเก่าไม่กระทบ). ถ้าไม่มีชื่อ ใช้ข้อความ "รหัสโฆษณา {adId}" (ต้องเป็นคีย์ i18n ไม่ hardcode เพราะไฟล์นี้ hardcode ไทยอยู่ตอนนี้ ให้เพิ่ม `useT` ที่ส่วนนี้)
- ผู้ส่ง data: `chat-thread-messages.service.ts` (select ของ `order.findMany` บรรทัด ~99-135) และ `CustomerPanel.tsx` (บรรทัด ~575 ที่ประกอบ data ให้การ์ดแผงขวา)
- 🛑 **ข้อความที่ส่งถึงลูกค้า** (FR-007) สร้างที่ `sendOrderToChat.ts`/route ส่งข้อความ ไม่ผ่าน `OrderCardViewData`. ห้ามแตะ/ห้ามให้ใช้ type นี้ร่วมกัน

**HR18: ไฟล์นี้ถูกเฝ้าแน่นอน.**
- `OrderCardView.tsx` ถูกปักหมุดรายไฟล์ใน `pins.json` (บรรทัด 272) และอยู่ใน `WATCHED_DIRS` ของ `src/app/(paces)/seller/(chat)` ด้วย
- `chat-thread-messages.service.ts` เป็นรายการ SYNC_ENTRIES (shape ของ field การ์ด → `parse.ts`, `MessageBubble.tsx` ในแอป)
- ผลคือเทส `native-chat-sync` จะแดง จนกว่าจะแก้ `deep-seller-app` ตาม หรือเขียนใน PR ว่า `Native: ไม่กระทบเพราะ…`
- ไฟล์แอปที่ manifest ชี้: `src/features/chat/api/parse.ts` (อ่าน `adTitle`/`adId`), `src/features/chat/ui/MessageBubble.tsx` + `OrderActionCard.tsx` (วางบรรทัดใต้หัวการ์ด). ผมอ่านโค้ดแอปไม่ได้ จึงยืนยันตำแหน่งตรงนั้นไม่ได้ ให้ developer เปิดแอปตรวจ
- คำ "จากโฆษณา" ต้องเหมือนเว็บทุกตัวอักษร. ใส่ key ไว้นอกก้อน `inbox: {` ของ `th.ts` (ก้อนนั้นถูกเฝ้าทั้งก้อน) ไม่ใช่เหตุผลให้ข้ามด่าน แต่ลดสัญญาณรบกวน

---

### 3. หน้ารายละเอียดคำสั่งซื้อ (ผู้ขาย)

**ไฟล์:** `orders/[token]/components/OrderSummary.tsx`. ตรงที่ที่ "ช่องทาง/ที่มา" อยู่แล้ว: ไทล์โลโก้ช่องทาง + เลขคำสั่งซื้อ + บรรทัดวันที่ ใน `card-header` ซ้าย (บรรทัด 166-238). ผมเลือกที่นี่ไม่ใช่ `CustomerDetails` เพราะ CustomerDetails เป็นการ์ด "ผู้ซื้อ" และโลโก้ช่องทางที่ซ้อนบนอวตารตรงนั้นเป็นแค่ข้อมูลของลูกค้า.

```
[logo FB]  DP2611-0042
           (calendar) 14 พ.ย. 2569 09:41   (receipt) ใบเสร็จเลขที่ …
           (speakerphone) มาจากโฆษณา: โปรล้อแม็ก 11.11 วันเดียวลด 40%
              · ลูกค้ากดโฆษณาเมื่อ 12 พ.ย. 2569 20:15            ← แถวใหม่
           [ส่งแล้ว] [ชำระแล้ว]
```

- แทรกต่อจาก `<p …>` บรรทัดวันที่ (บรรทัด 194-204) ก่อนแถวป้ายสถานะ. ปรับ `mb-3.5` ของบรรทัดวันที่เป็น `mb-1.5` **เฉพาะตอนมีแอด** แล้วให้แถวใหม่รับ `mb-3.5`
- `<p className="text-default-700 mb-3.5 flex flex-wrap items-center gap-x-1 text-xs"><Icon icon="speakerphone" aria-hidden="true"/>มาจากโฆษณา: <span className="text-default-900 font-medium break-words">{ชื่อ}</span><span> · ลูกค้ากดโฆษณาเมื่อ {formatDateTimeTH(clickedAt)}</span></p>`
- ใช้ `formatDateTimeTH` ตัวเดียวกับบรรทัดวันที่สร้างด้านบน (ซึ่งมาจาก `src/lib/format-date.ts`) เพื่อสองวันที่ในกล่องเดียวกันหน้าตาเหมือนกัน. **ไม่ truncate** ชื่อ: หน้านี้เป็นที่อ่านชื่อเต็ม
- ไม่มีชื่อ = รหัสโฆษณา. ไม่มี `clickedAt` (ไม่ควรเกิด) = ตัดท่อนหลัง " · … " ทิ้ง
- ไม่มีแอด = ไม่ render ทั้งแถวและไม่ปรับ margin
- plumb: `page.tsx` → `OrderDetailClient` (prop ถูกส่งต่อบรรทัด ~887) → `OrderSummary` เป็น prop เดียว `adSource?: { adId; adTitle; clickedAtISO } | null`
- ฝั่งผู้ซื้อ (`/o/[token]`) **ไม่ส่ง prop นี้** (FR-003)
- `TechnicianOrderDetail.tsx` ส่ง `salesChannel` เข้าชุดคล้ายกัน. PRD บอกให้เห็นกับทุกคนที่เห็นคำสั่งซื้อ จึงควรโชว์ด้วย (Open Q2)

---

### 4. ไฟล์ส่งออก (00086) — `src/lib/order-export.ts`

เพิ่ม 2 คอลัมน์ `text` **ต่อท้าย `salesChannel` ("ช่องทางขาย")** ในชุดคอลัมน์ที่ใช้ทุก vertical (ไม่อยู่ใน `isOnline`/`isService`/`isLodging`):

| ลำดับ | key | header | ค่า |
|---|---|---|---|
| ต่อจาก `salesChannel` | `adTitle` | `โฆษณา` | ชื่อแอด · null = ว่าง |
| ถัดไป | `adId` | `รหัสโฆษณา` | รหัสแอด · null = ว่าง |

เหตุผลที่ไม่ทำ fallback "ชื่อว่าง → ใส่รหัส" ในคอลัมน์ "โฆษณา": ไฟล์เป็นข้อมูล ไม่ใช่หน้าจอ การเอารหัสไปใส่ซ้ำสองคอลัมน์จะทำให้กรอง/pivot สับสน (กฎ fallback เป็นของ UI)
- `ExportOrder` เพิ่ม `adTitle`/`adId`; `buildExportRow` ใส่ `adTitle: o.adTitle ?? null, adId: o.adId ?? null`; `order-export.service.ts` เพิ่ม select
- ชื่อแอดเป็น **ข้อความที่ผู้ใช้ตั้งเอง** `guardFormula` (CSV) ป้องกันอยู่แล้ว เพราะ kind = `text` ผ่าน `esc(guardFormula(...))`
- ต้องอัปเดตเทสที่นับ/เรียงคอลัมน์ของ `exportColumns`

---

### 5. รายงานใหม่ `/reports/ads` (เจ้าของร้าน F1)

**ไฟล์ที่จะเกิด:** `src/app/(paces)/seller/(dashboard)/reports/ads/{page.tsx, loading.tsx, components/*}` + เมนู + ทะเบียน capability.
- เมนู: `src/lib/seller-menu.ts` กลุ่ม ANALYTICS ต่อจาก `/reports/products` (บรรทัด 82): `{ url: '/reports/ads', slug: 'seller:reports-ads', label: 'ยอดขายตามโฆษณา', icon: 'speakerphone' }`. **เห็นทุก vertical** (ไม่ใส่ในกรอง `applyVerticalMenu`) เพราะร้านบริการยิงแอด Messenger ได้เหมือนกัน
- `src/lib/route-capabilities.ts`: `'…/reports/ads/page.tsx': { page: 'F1', status: 'DECLARED' }` ตามแถวของ products บรรทัด 114
- ต้องแก้เทส `getSellerPageTitle` ด้วย (คอมเมนต์ใน products บอกว่ามีด่าน [blocker] ผูกกับชื่อหน้า)
- ใช้ `gatePage(session, 'F1')` + `NoPermissionCard capability="F1" detail={FINANCE_NO_PERMISSION_DETAIL}` เหมือน products
- คำว่า "คำสั่งซื้อ" ในหน้านี้ผันจาก `resolveOrderVocab(shop.vertical).noun` (บทเรียน clarify 2026-08-27 ของ agents report: ร้านบริการเรียก "การเข้ารับบริการ") ไม่ hardcode

#### Wireframe เดสก์ท็อป ≥1280 (1440)

```
รายงาน › ยอดขายตามโฆษณา
┌ ตัวกรอง (card) ──────────────────────────────────────────────────────────┐
│ [30 วันล่าสุด ▾] [14 ต.ค.–12 พ.ย. 69]            [(brand-facebook) ทุกเพจ ▾] [⬇ ส่งออก] │
└──────────────────────────────────────────────────────────────────────────┘
┌ สรุป (card, พระเอกของหน้า) ───────────────────────────────────────────────┐
│ ยอดขายจากโฆษณา            │ ████████████████░░░░░░░░░░░░░░░░░░░░░░ │
│ ฿482,300  (text-xl 700)   │  จากโฆษณา ฿482,300 · 118 ใบ   ไม่ได้มาจากโฆษณา ฿1,017,700 · 301 ใบ │
│ 32% ของยอดขายช่วงนี้       │  นับคำสั่งซื้อที่ไม่ถูกยกเลิก — เหมือนรายงานยอดขายรายสินค้า       │
└──────────────────────────────────────────────────────────────────────────┘
┌ ตาราง (card) ─────────────────────────────────────────────────────────────┐
│ โฆษณา              แชทจากโฆษณา  คำสั่งซื้อ  อัตราปิดการขาย  ยอดขาย▼  เฉลี่ยต่อใบ  ยกเลิก/คืน │
│ [รูป] โปรล้อแม็ก 11.11   212        48        23%        ฿182,000   ฿3,792       3     │
│       รหัส 1202…0431                                                          │
│ [📣] ไฟหน้า LED          160        31        19%        ฿96,400    ฿3,110       0     │
│ [รูป] ล้อแม็กลดล้างสต็อก  88         0          0%        ฿0         —            0     │
│ ┄ pagination 20/หน้า ┄                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```
(`[📣]` ในภาพคือ tile ไอคอน `speakerphone` เมื่อไม่มีรูป — ใน UI จริงไม่มี emoji)

- ขอบกว้างเต็ม container (1440 ไม่มีคอลัมน์ว่างเพราะไม่แบ่ง 70/30)

#### แท็บเล็ต ~768–1279

เหมือนเดสก์ท็อปแต่ตารางเหลือ 5 คอลัมน์: **โฆษณา · แชทจากโฆษณา · คำสั่งซื้อ · อัตราปิดการขาย · ยอดขาย**
- "ยอดเฉลี่ยต่อใบ" กับ "ยกเลิก/คืน" ลงเป็นบรรทัดรอง (`text-2xs text-default-500`) ใต้ยอดขายและใต้คำสั่งซื้อตามลำดับ (`xl:hidden`) และเป็นคอลัมน์เต็มเมื่อ ≥1280 (`hidden xl:table-cell`)
- ตัวกรองห่อบรรทัด

#### มือถือ ~390 (<768)

```
รายงาน
┌ ตัวกรอง ─────────────────┐
│ [30 วันล่าสุด ▾]          │
│ [ทุกเพจ ▾]   [⬇ ส่งออก]  │
└──────────────────────────┘
┌ สรุป ─────────────────────┐
│ ยอดขายจากโฆษณา            │
│ ฿482,300                  │
│ 32% ของยอดขายช่วงนี้       │
│ ███████░░░░░░░░░░          │
│ ● จากโฆษณา ฿482,300·118 ใบ │
│ ○ ไม่ได้มาจากโฆษณา ฿1,017,700·301 ใบ │
└──────────────────────────┘
เรียงตาม: ยอดขาย ▾
┌ [รูป] โปรล้อแม็ก 11.11…  ฿182,000 ┐   (ทั้งการ์ดเป็น <button> เปิดชีต)
│        แชท 212 · คำสั่งซื้อ 48 · ปิดการขาย 23% │
│        ยกเลิก/คืน 3   (แสดงเมื่อ > 0 เท่านั้น)   │
└──────────────────────────────────────┘
```
- tap target: การ์ดทั้งใบ ≥44px. ปุ่มส่งออก/DateRange/FilterDropdown ผ่านกฎ 44px มือถือใน `safepay-overrides.css` อยู่แล้ว
- ตัวเลือกเรียง: copy ท่า `ListControlDropdown.tsx` ของ products (hs-dropdown)

#### ส่วนประกอบ

- **แถบกรอง** — copy `reports/agents/components/ReportFilters.tsx`. ใช้ `DateRangeControl` + `FilterDropdown` (ตัวกรองเพจ = ชนิด hs-dropdown ตาม HR6(ข); ต้นทาง `theme/…/ui/dropdowns/page.tsx`). ค่าอยู่ใน URL `?from=&to=&shopChannelId=` (ลิงก์แชร์ได้ ปุ่มย้อนกลับพากลับ). แสดงเฉพาะเมื่อร้านมีเพจ >1 (`channels.length > 1`). มี banner "ดูย้อนหลังได้ครั้งละไม่เกิน N วัน — ระบบปรับวันเริ่มต้นให้แล้ว" และ "กำลังคำนวณใหม่…" ตามต้นแบบ
- **ปุ่มส่งออก** — `<a href="/api/reports/ads/export?from&to&shopChannelId" download>` ใช้ markup ปุ่มของ `OrdersExport.tsx` บรรทัด 43-50 (`btn border border-default-300 text-default-700 hover:bg-default-100` + `Icon download`) **ไม่มีโมดัลเลือกขอบเขต** เพราะรายงานส่งออก "สิ่งที่เห็นบนจอ" เสมอ. xlsx อย่างเดียว (Open Q5). หัวคอลัมน์ไฟล์ = หัวตารางทั้ง 7 + 2 แถวสรุปท้ายไฟล์ (จากโฆษณา / ไม่ได้มาจากโฆษณา). แถวที่ชื่อแอดว่างใส่รหัสในคอลัมน์ "โฆษณา" ให้เหมือนหน้าจอ
- **การ์ดสรุป** — การ์ดเดียว ไม่ใช่การ์ดตัวเลข 4 ใบ. แถบสัดส่วน 2 ส่วนต่อจาก `theme/…/ui/progress/page.tsx` ตัว "Multiple Bars" (บรรทัด 110-125: `bg-default-100 flex h-4 w-full overflow-hidden rounded` + ลูก `role="progressbar"`): ส่วน "จากโฆษณา" = `bg-primary`, ส่วนที่เหลือ = `bg-default-300`. ความกว้างส่วนต้องเป็น `style={{ width: '32%' }}` (ค่าไดนามิก ธีมเองก็ทำแบบนี้) พร้อมคอมเมนต์บรรทัดเดียว. ไม่ใช้กราฟ ApexChart (sibling ที่ตรงกับหน้านี้ไม่ได้ต้องการ และ HR10 ไม่บังคับ)
- **ตาราง** — copy `reports/products/components/ProductSalesTable.tsx` (`useReactTable` + `DataTable` + `TablePagination` pageSize 20 + `'use no memo'`). เรียงเริ่มต้น `ยอดขาย` มาก→น้อย เรียงได้ตาม: ยอดขาย / คำสั่งซื้อ / แชทจากโฆษณา / อัตราปิดการขาย. คอลัมน์โฆษณา: รูป 40px (`rounded-md object-cover`) หรือ tile `bg-default-100` + `speakerphone` (เหมือนแบนเนอร์แชท) · ชื่อ `font-medium` truncate `title=ชื่อเต็ม` · บรรทัดรอง `รหัสโฆษณา {adId}` (`text-2xs text-default-500 break-all`) เฉพาะตอนมีชื่อ. ตัวเลขทุกคอลัมน์ `tabular-nums text-end`
- **รูปแอด** — Order ไม่ได้เก็บรูป (BRD: รหัส/ชื่อ/เวลาคลิกเท่านั้น). ดึง `photoFileId` ล่าสุดของ `adId` นั้นจาก `ConversationAdReferral` แบบ best-effort ถ้าไม่เจอ (ห้องถูกลบ → cascade ลบ referral) ใช้ tile ไอคอน. URL `/api/files/{id}?variant=thumb` ตาม `docs/conventions/image-thumbnails.md`
- **ชีตคำสั่งซื้อของแอด** (กดแถวตาราง/การ์ดมือถือ) — คอมโพเนนต์ใหม่ `AdOrdersSheet`, ยืมเปลือกจาก `ProductDetailSheet.tsx` (`useLockBodyScroll`, `useDialogFocus`, popstate ปิดชีตแทนออกจากหน้า, `pushedRef`) โดย **เนื้อหาใหม่ทั้งหมด**. มือถือ <1024 = เต็มจอ (`fixed inset-0 bg-card`); เดสก์ท็อป ≥1024 = แผงชิดขวา (`lg:start-auto lg:w-full lg:max-w-xl`) อิง `theme/…/ui/offcanvas/page.tsx`. ไม่ใช่ alert ปิดกั้น จึงไม่เข้า HR8 (Sweet Alerts). เนื้อหา: หัว (รูป+ชื่อ+ปุ่มปิด) → บรรทัดสรุป "แชท 212 · {noun} 48 · ฿182,000" → รายการสูงสุด 50 ใบล่าสุด แต่ละแถว `[เลข DP… (ลิงก์ text-primary → /orders/{token})] [ชื่อลูกค้า] [วันที่ formatDateTime] [ป้ายสถานะ] [฿ยอด]`. ใบที่ยกเลิกแสดงจาง + ป้าย "ยกเลิก". เกิน 50 แสดง "แสดง 50 ใบล่าสุด — ดูครบทั้งหมดได้ในไฟล์ส่งออก". โหลดแบบ lazy ผ่าน API ใหม่ (ต้องเพิ่มใน SRS): loading = skeleton 5 แถว, error = `SellerErrorState` แบบย่อ + ปุ่ม "ลองอีกครั้ง"

#### ข้อความ (ไทย)

| ที่ | ข้อความ |
|---|---|
| หัวหน้า | ยอดขายตามโฆษณา · รายงาน |
| สรุปหลัก | ยอดขายจากโฆษณา ฿{n} · {p}% ของยอดขายช่วงนี้ |
| คำอธิบายใต้แถบ | นับ{noun}ที่ไม่ถูกยกเลิก — ตัวเลขเดียวกับรายงานยอดขายรายสินค้า |
| legend | จากโฆษณา · ไม่ได้มาจากโฆษณา |
| หัวคอลัมน์ | โฆษณา · แชทจากโฆษณา · {noun} · อัตราปิดการขาย · ยอดขาย · ยอดเฉลี่ยต่อใบ · ยกเลิก/คืน |
| tooltip อัตรา | {noun}ในช่วง ÷ แชทที่กดโฆษณาในช่วง — ลูกค้าที่กดก่อนช่วงนี้แล้วสั่งในช่วงนี้ นับที่{noun} ไม่นับที่แชท |
| อัตรา แชท=0 | — |
| ว่างทั้งร้าน (ไม่เคยมีข้อมูล) | **ยังไม่มีข้อมูลโฆษณา** / ข้อมูลนี้มาจากลูกค้าที่กดโฆษณาแล้วทักแชท Messenger เข้ามา เมื่อมีลูกค้าทักจากโฆษณา รายงานจะเริ่มแสดงที่นี่เอง / [ไปที่กล่องข้อความ] → `/inbox` |
| ว่างในช่วง | ไม่มีแชทหรือ{noun}จากโฆษณาในช่วงนี้ / ลองเลือกช่วงวันที่ให้กว้างขึ้น |
| error | โหลดรายงานไม่สำเร็จ — ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว ข้อมูลของคุณยังอยู่ครบ ลองใหม่อีกครั้งได้เลย (ข้อความเดียวกับ products/agents) |
| ไม่มีสิทธิ์ | ใช้ `NoPermissionCard` + `FINANCE_NO_PERMISSION_DETAIL` |
| ไม่มีร้าน | ยังไม่มีร้านค้า / ต้องสร้างร้านก่อนจึงจะดูรายงานได้ |
| ส่งออก | ส่งออก · toast สำเร็จ/ล้มเหลวด้วย `pacesToast` |

**i18n 00047 (th+en):** เพิ่มก้อน `adAttribution` ใน `th.ts`/`en.ts` (นอก `inbox:`): `chipLabel` "โฆษณา: {name}", `fromAd` "จากโฆษณา: {name}", `cameFromAd` "มาจากโฆษณา: {name}", `clickedAt` "ลูกค้ากดโฆษณาเมื่อ {date}", `adIdFallback` "รหัสโฆษณา {adId}" (**มีอยู่แล้วที่ `inbox.contextBar.adIdFallback`** ให้ import ค่าเดิมแทนสร้างซ้ำถ้า dictionary รองรับ ไม่งั้นย้ายออกมาแล้วให้ทั้งสองจุดอ่านตัวเดียว), กับคีย์ของรายงานทั้งหมดในตาราง. en: "Ad: {name}", "From ad: {name}", "From ad: {name}", "Ad clicked {date}", "Ad ID {adId}", "Ad sales", "Sales by ad", "Chats from ad", "Close rate", "Not from an ad". กับดักตาม memory: ค่าคงที่ระดับ module และ prop default ไทยใน component ที่ใช้ร่วม (OrderCardView) ต้องไม่ลืม wire `useT`

---

### Theme Source Mapping

| ส่วน | Base (theme / in-repo ที่ copy มาจาก theme) | หมายเหตุ adapt |
|---|---|---|
| ชิป `/orders` เดสก์ท็อป + แถวมือถือ | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx` → `…/orders/components/OrdersTable.tsx`, `OrderCard.tsx` (ใน repo) | ใช้ `.badge` ที่ Paces มี + `bg-default-100`. ไม่มีของใหม่ |
| บรรทัดในการ์ดแชท | `orders/components/OrderCardView.tsx` ตัวเอง (บรรทัด 141-148 เป็นรูปแบบ `text-2xs` + `Icon`) | ไม่ใช่ component ใหม่ |
| แถวหน้ารายละเอียด | `orders/[token]/components/OrderSummary.tsx` (card-header ของธีม) | บรรทัด `<p>` ใหม่ ต่อจากบรรทัดวันที่ |
| คอลัมน์ส่งออก | `src/lib/order-export.ts` | pure TS ไม่มี UI |
| โครงหน้ารายงาน | `theme/…/apps/ecommerce/(orders)/orders/page.tsx` ผ่าน `reports/products/page.tsx` + `reports/agents/page.tsx` | `PageBreadcrumb`, `hideTitleBelowLg` |
| แถบกรอง/ช่วงวันที่ | `reports/agents/components/ReportFilters.tsx` + `_shared/DateRangeControl.tsx` + `components/safepay/FilterDropdown.tsx` (ต้นทาง `theme/…/ui/dropdowns/page.tsx`) | HR6(ข): เป็นตัวกรอง/เมนู ไม่ใช่ form field จึงใช้ hs-dropdown ถูกชนิด |
| ตาราง | `reports/products/components/ProductSalesTable.tsx` → `products/components/ProductsTable.tsx` → `theme/…/apps/ecommerce/(products)/products/components/ProductsListing.tsx` | ตัดช่องติ๊ก/DayStrip/PatternBadge ทิ้ง |
| รายการมือถือ | `reports/products/components/ProductMobileList.tsx` | ตัดแถบรายเดือนทิ้ง ใช้ข้อความ 2 บรรทัด |
| ตัวเรียงมือถือ | `reports/products/components/ListControlDropdown.tsx` | |
| แถบสัดส่วน | `theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx` (`MultipleBar` บรรทัด 110-125) | ส่วนละ 1 สี |
| ชีตรายละเอียด | เปลือก: `reports/products/components/ProductDetailSheet.tsx`; ต้นแบบแผงขวา: `theme/…/ui/offcanvas/page.tsx` | เนื้อหาใหม่ |
| ปุ่มส่งออก | `orders/components/OrdersExport.tsx` บรรทัด 43-50 | ปุ่มลิงก์ดาวน์โหลด ไม่มีโมดัล |
| empty/error/no-permission | `_shared/SellerEmptyState`, `SellerErrorState`, `NoPermissionCard` | ใช้ของเดิมทั้งหมด |
| toast | `@/lib/paces-toast` (`pacesToast`) | `react-toastify` ห้าม |
| ไอคอน (tabler, via `@iconify/react`/`Icon` wrapper) | `speakerphone` (ใช้ในธีม `dashboard/ecommerce/components/data.ts`), `download`, `calendar`, `message-circle`, `brand-facebook`, `info-circle`, `alert-triangle` | `speakerphone` ไม่อยู่ใน gallery `(admin)/icons/tabler/page.tsx` ตรง ๆ (ใน gallery มี `ad-2` แทน) แต่ธีมเองใช้ `speakerphone` และ repo ใช้อยู่แล้ว — ดู Open Q1 |

---

### User flow

1. **รายการ/มือถือ**: เห็นชิปโฆษณาในแถวหัว → ชี้เมาส์เห็นชื่อเต็ม · มือถือแตะการ์ด → หน้ารายละเอียด เห็นแถว "มาจากโฆษณา" ชื่อเต็ม + เวลากด
2. **แชท**: เปิดห้อง → การ์ดคำสั่งซื้อมีบรรทัด "จากโฆษณา" ใต้หัวน้ำเงิน (ห้องที่มีแบนเนอร์ด้านบนอยู่แล้ว ไม่ซ้อนกัน เพราะแบนเนอร์คือโฆษณาล่าสุดของห้อง ส่วนบรรทัดบนการ์ดคือโฆษณา ณ วันสร้างใบ)
3. **รายงาน**: เมนูรายงาน → "ยอดขายตามโฆษณา" → เห็นสัดส่วนก่อน (พระเอก) → ไล่ตารางดูแอดที่แชทเยอะแต่ปิดไม่ได้ → กดแถว → ชีตรายการคำสั่งซื้อ → กดเลข DP → หน้ารายละเอียด (ปุ่มย้อนกลับปิดชีต ไม่ออกจากรายงาน) → ส่งออก xlsx

### Edge states

- ชื่อแอดยาวมาก/มีวรรคหาย → `truncate`/`line-clamp-2` + `break-words`; รหัส `break-all`
- ชื่อแอดว่าง → รหัสโฆษณา. ทั้งชื่อและรหัสว่างแต่มีแถว → ไม่ render
- ตัวเลข 0 และหลักล้าน: `formatBaht`/`formatNumberNoSymbol` + `tabular-nums`; ร้านเท่านั้น 0 ใบ ยังโชว์ "0%" และแถบสัดส่วน 0 ได้
- อัตราปิดการขาย: แชท=0 → "—" (ห้ามหาร 0); คำสั่งซื้อ > แชท (กดก่อนช่วง) → แสดงค่าจริงพร้อม tooltip อธิบาย
- แอดที่มีแชทแต่ 0 คำสั่งซื้อ: ต้องอยู่ในตาราง (BRD) ใช้ข้อความธรรมดา **ไม่ใส่แดง** (ไม่ใช่ความล้มเหลวของระบบ)
- แอด 1 รหัสแต่ชื่อเปลี่ยนระหว่างช่วง → จัดกลุ่มตามรหัส แสดงชื่อล่าสุด
- รายงานช้า/pending → "กำลังคำนวณใหม่…" + `loading.tsx` skeleton (copy `products/loading.tsx`)
- error/no-permission/no-shop ตามตารางข้อความ

---

### Impeccable compliance

- **Mode: Operate** (scanability + consistency + เสียงของแบรนด์อยู่ในรายละเอียด ไม่ใช่การแสดงออก)
- **One Voice:** accent น้ำเงิน `bg-primary` ปรากฏเฉพาะ ① ส่วน "จากโฆษณา" ของแถบสัดส่วน ② ลิงก์เลข DP ในชีต ③ ลิงก์เดิมที่มีอยู่. ชิป/บรรทัดโฆษณาทุกจุดเป็นกลาง (default-100/700). **พระเอกของหน้ารายงาน = การ์ดสัดส่วน** (`text-xl` น้ำหนัก 700 ตาม Strong step) ตารางเป็นตัวทำงาน ไม่แข่งน้ำหนักกัน
- **Verified-Means-Green:** ไม่มีสีเขียวในฟีเจอร์นี้เลย — "จากโฆษณา" ไม่ใช่สถานะยืนยัน อัตราปิดการขายสูงไม่ใช่ "ผ่าน". ป้ายสถานะในชีตใช้ `resolveOrderStatusBadge` เดิม (เขียวเฉพาะที่ระบบยืนยันแล้วอยู่แล้ว)
- **Sentence-case / ไม่มี ALL CAPS:** ข้อความไทยล้วน
- **เงา:** ไม่เพิ่มเงาใหม่. ชีตใช้ backdrop ตัวเดียวกับ `IShipImportModal`
- **น้ำเสียงข้อความ:** ว่าง = บอกว่าข้อมูลมาจากไหนและจะมาเองเมื่อไร (ไม่ "ไม่พบข้อมูล"), error = บอกว่าข้อมูลยังอยู่ครบ + ให้ลองใหม่, ไม่ไฮป์
- **ธีมกับ Impeccable ขัดกันตรงไหน:** ไม่มีจุดขัด ที่เลือกตัดสิน: ① ใช้ `speakerphone` ซึ่งไม่อยู่ใน gallery แต่ธีมใช้เองและ repo ใช้อยู่ — ดู Open Q1 ② แถบสัดส่วนต้องใช้ `style={{width}}` (ค่าไดนามิก ธีมเองก็ทำ) — ต้องมีคอมเมนต์บรรทัดเดียวกัน ไม่งั้น grep HR7 อาจจับ ③ `line-clamp-2`/`max-w-xs` เป็น utility มาตรฐาน ไม่ใช่ arbitrary
- **จุดเสี่ยง critique:** การ์ดสรุปอาจถูกอ่านเป็น "hero-metric template" ผมลดความเสี่ยงโดยเลือกการ์ดเดียวที่ตัวเลขมีประโยคกำกับและแถบสัดส่วน ไม่ใช่การ์ดตัวเลขใหญ่ซ้อนหลายใบ

### Anti-slop self-check

1. **เฉพาะ Deep:** "แชทจากโฆษณา → คำสั่งซื้อ → ปิดการขาย" ผูกกับ Click-to-Messenger และคำสั่งซื้อที่ผูกห้องแชท, `speakerphone` ใช้ซ้ำกับแบนเนอร์แชทเดิม, `{noun}` ผันตามประเภทกิจการ — เอาไปใช้กับสินค้าอื่นไม่ได้
2. **พระเอก 1 อย่าง:** รายงาน = การ์ดสัดส่วน; รายการ/แชท/รายละเอียด = ไม่มีอะไรแย่งน้ำหนักเพราะเป็นข้อความ 1 บรรทัดสีกลาง
3. **ตัดของซ้ำ/คงที่:** ไม่ทำการ์ดตัวเลข 4 ใบ (ซ้ำกับแถวตาราง), ไม่ทำคอลัมน์ "เพจ" (ตัวกรองบอกอยู่แล้ว), ไม่ทำ chip บนการ์ดที่ไม่มีแอด, ไม่ใส่ชื่อแอดในข้อความถึงลูกค้า
4. **State ครบ:** ว่างทั้งร้าน / ว่างในช่วง / ไม่มีสิทธิ์ / ไม่มีร้าน / error / loading / pending / ชื่อยาว / ชื่อว่าง / 0 / หลักล้าน / แชท=0 / คำสั่งซื้อ > แชท / เกิน 50 ใบในชีต
5. **Copy ตรงความจริง:** ปุ่ม "ส่งออก" ทำสิ่งนั้นจริง; "ดูครบทั้งหมดได้ในไฟล์ส่งออก" ตรงกับที่ปุ่มมีในสถานะนั้น; ข้อความไม่แนะนำปุ่มที่ไม่มี
6. **คำเดียวกัน = ของเดียวกัน:** "โฆษณา" = แอดที่ลูกค้ากด; "แชทจากโฆษณา" = ห้องที่คลิกในช่วง; "{noun}" ผันจาก vocab; รหัสแอด = `adId` ทุกจุด
7. **สี:** ไม่มีเขียว/แดงในฟีเจอร์ (0 คำสั่งซื้อ ไม่ใช่ความล้มเหลว); แอดเดียวกันโทนเทาเหมือนกันทุกที่
8. **มือถือ:** การ์ดรายการทั้งใบเป็น `<button>` สูง >44px; ปุ่มกรอง/ส่งออกอยู่ใต้กฎ 44px ใน `safepay-overrides.css`; ไม่มีปุ่มหลักลอย
9. **1440:** ตารางเต็มกว้างแล้วขยายเป็น 7 คอลัมน์ ไม่มี 70/30 ที่ฝั่งแคบมีของ

---

### Open questions

1. **ไอคอน `speakerphone`**: ไม่อยู่ใน gallery `icons/tabler/page.tsx` (มี `ad-2` แทน) แต่ธีมใช้ `speakerphone` เองและ repo ใช้อยู่แล้ว ผมเลือกให้เหมือนแบนเนอร์แชท Controller ต้องการ `ad-2` แทนไหม
2. **ช่าง (`TechnicianOrderDetail`)** เห็นแถวโฆษณาไหม? PRD บอก "ทุกคนที่เห็นคำสั่งซื้อ" ผมตั้งให้เห็น แต่ถ้ามองว่าเป็นข้อมูลการตลาด ควรซ่อน
3. **อัตราปิดการขายเกิน 100%** (คำสั่งซื้อในช่วง นับตามวันสั่ง ส่วนแชทนับตามวันคลิก): แสดงค่าจริง + tooltip ตามสเปก หรือจำกัดที่ 100%
4. **เพดานช่วงวันที่ของรายงานนี้** (`MAX_RANGE_DAYS` ของ agents เป็นของมัน) ใช้ค่าเดียวกันหรือกำหนดใหม่
5. **ส่งออกรายงาน** xlsx อย่างเดียว หรือมี CSV ด้วยเหมือน 00086. **และรหัสแอดยาว ~18 หลัก ถ้าเป็น CSV Excel จะแสดงเป็น `1.2E+17`** (xlsx เก็บเป็นข้อความได้ปลอดภัย) ทั้งไฟล์ 00086 และไฟล์รายงานควรตัดสินเรื่องนี้ร่วมกัน
6. **API ใหม่ 2 ตัว** (รายการคำสั่งซื้อของแอดในชีต + ส่งออก) ต้องเพิ่มใน SRS/validation/capability F1
7. **รูปแอดในรายงาน** ใช้ `ConversationAdReferral.photoFileId` best-effort. ห้องที่ถูกลบจะเหลือแต่ tile ไอคอน ยอมรับไหม (Order ไม่เก็บ `photoFileId`)

**Theme Source:** `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx` (+ `ui/progress/page.tsx`, `ui/offcanvas/page.tsx`, `ui/dropdowns/page.tsx`) **ป้ายถัดไป:** `stage:build`

**สิ่งที่ข้ามและความเสี่ยง:**
- ข้ามการเปิดไฟล์แอป `deep-seller-app` (อยู่คนละรีโป) ตำแหน่งแก้ฝั่งแอปมาจาก manifest ไม่ใช่การอ่านโค้ดแอป
- ข้ามการยืนยัน icon ในชุด gallery ครบทุกตัว (ตรวจเฉพาะ `ad-2`, `speakerphone` ผ่านการใช้งานในธีม)
- ไม่ได้อ่าน `.impeccable/design.json`, PRODUCT.md, SKILL.md และ playbook Impeccable
- ความเสี่ยงที่ต้องรู้: เส้นทาง server ของแชทมีผู้เรียกฝั่งผู้ซื้อ ถ้าลืม neutralize `adTitle`/`adId` ที่ต้นทาง ชื่อแคมเปญของร้านจะหลุดไปหาลูกค้าผ่าน payload ของแอป Deep.

ไฟล์ที่เกี่ยวข้อง (ทั้งหมดอ่านอย่างเดียว):
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(chat)/_components/OrderCardView.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/orders/components/OrderCard.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/lib/order-export.ts`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/lib/native-chat-sync/manifest.ts`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/lib/seller-menu.ts`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/reports/products/page.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/reports/agents/components/ReportFilters.tsx`

---

## คำตัดสินของ Controller ต่อ Open questions (2026-11-14)

| # | คำตัดสิน |
|---|---|
| 1 | ใช้ `speakerphone` — ตรงกับแบนเนอร์โฆษณาในแชทที่มีอยู่ |
| 2 | ช่างเห็นแถวโฆษณาด้วย (PRD: ทุกคนที่เห็นคำสั่งซื้อ) |
| 3 | แสดงอัตราจริง (เกิน 100% ได้) + tooltip อธิบาย |
| 4 | ใช้เพดานช่วงวันที่เดียวกับรายงานแอดมิน (`MAX_RANGE_DAYS`) |
| 5 | รายงานส่งออก xlsx อย่างเดียว · ไฟล์ 00086 แบบ CSV: รหัสโฆษณาต้องกันไม่ให้ Excel แปลงเป็น 1.2E+17 |
| 6 | API ใหม่ 2 ตัว (รายการคำสั่งซื้อของแอด · ส่งออก) = F1 + ลง SRS |
| 7 | รูปแอดแบบ best-effort ยอมรับ — ห้องถูกลบ = tile ไอคอน |
| — | 🛑 server ต้อง neutralize `adTitle`/`adId` ที่ต้นทางสำหรับผู้เรียกฝั่งผู้ซื้อ (ไม่ใช่แค่ซ่อนใน component) |

## มติ user หลังดู mockup (2026-11-14)

| # | มติ | ผลต่อข้อมูล |
|---|---|---|
| U1 | การ์ดคำสั่งซื้อในแชท: แอดเป็น **แถบบนหัวสีฟ้า** (เหนือหัว) พร้อม **รูปแอด** + "จากโฆษณา" + ชื่อ — แทนบรรทัดใต้หัว | ต้องเก็บรูปแอดลงคำสั่งซื้อ |
| U2 | รายการคำสั่งซื้อ: ชิปมี **รูปแอด + ชื่อ** (มือถือ: แถวมีรูป + "จากโฆษณา" + ชื่อ) | ต้องเก็บรูปแอดลงคำสั่งซื้อ |
| ⇒ | เพิ่ม `adPhotoFileId` เป็นภาพนิ่งในคำสั่งซื้อ (คัดลอกจาก `ConversationAdReferral.photoFileId` ตอนบันทึกแอด) · ไม่มีรูป = tile ไอคอน `speakerphone` | BRD FR-001 เพิ่ม "รูปแอด" ในค่าที่บันทึก |
