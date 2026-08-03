# Design Spec: การ์ด "เมนูลัด" + `ShortcutEditSheet` (แก้ไขเมนูลัดที่ตั้งค่าเองได้)

> Feature 00027 — `docs/20 - Features/00027 - Customizable Shortcuts/{PRD,SRS,SDS,API}.md`
> Route: `src/app/(paces)/seller/(dashboard)/dashboard/**` (Paces, มือถือเท่านั้น — `lg:hidden`)
> Mode: **Operate** (ดูเหตุผลใน Impeccable compliance)

---

## หน้า: การ์ดเมนูลัด (Command Center) + โหมดแก้ไข (`/dashboard`, มือถือ)

### User stories ที่ครอบ

- Owner/staff เห็นเมนูลัดที่ตรงกับสิทธิ์ตัวเอง ณ ร้านที่กำลังดูอยู่ (PRD §2.1–2.3)
- ผู้ใช้ใหม่เห็น default ที่ใช้งานได้ทันทีโดยไม่ต้องตั้งค่า (PRD §2.4, §3.5)
- ผู้ใช้กด "แก้ไข" บนการ์ดเดิม → ปักหมุด/ถอดได้ทันทีไม่ต้องออกจาก `/dashboard` (PRD §3.4)
- รายการที่หมดสิทธิ์ภายหลัง (entitlement drift) ไม่กลายเป็น dead tile — ซ่อนจากการ์ด, โชว์สถานะในโหมดแก้ไข, ถอดได้เสมอ (PRD §3.6)
- ผู้ใช้กดรีเซ็ตกลับ default ได้เมื่อรู้สึกตั้งค่าจนงง (PRD §3.8)

---

### Layout (ASCII wireframe)

**Mobile (≤767px) — การ์ดปกติ มี tile:**

```
┌ 390px ───────────────────────────────┐
│  [card]                              │
│  ┌─────────────────────────────────┐ │
│  │ ▦ เมนูลัด            ✎ แก้ไข   │ │ ← card-header
│  ├─────────────────────────────────┤ │
│  │  ◒        ◑        ◓       ◒   │ │
│  │ รายงาน   รีวิว   ความสำเร็จ สินค้า│ │ ← 4 col grid, static
│  │                                 │ │   (แถวที่ 2 มีกี่ตัวก็เท่านั้น
│  │  ◑        ◓        ◒          │ │    ไม่ auto-fill ไม่มี placeholder)
│  │ ลูกค้า   ตั้งค่า   ประมูล(●2)   │ │
│  └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

**Mobile — empty state (`tiles.length === 0`):**

```
┌ 390px ───────────────────────────────┐
│  ┌─────────────────────────────────┐ │
│  │ ▦ เมนูลัด            ✎ แก้ไข   │ │
│  ├─────────────────────────────────┤ │
│  │                                 │ │
│  │           ▦ (จาง)               │ │
│  │        ยังไม่มีเมนูลัด           │ │
│  │  เลือกเมนูที่ใช้บ่อยเพื่อเข้าถึง   │ │
│  │         ได้เร็วขึ้น              │ │
│  │                                 │ │
│  │       ( ตั้งเมนูลัด )            │ │
│  │                                 │ │
│  └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

**Mobile — `ShortcutEditSheet` (full-screen, เปิดจากปุ่ม "แก้ไข" หรือ "ตั้งเมนูลัด"):**

```
┌ 390px ───────────────────────────────┐
│ ‹  แก้ไขเมนูลัด                5/8  │ ← header, back ซ้าย, count ขวา
├───────────────────────────────────────┤
│ ปักหมุดอยู่                            │
│ ┌─────────────────────────────────┐   │
│ │ ◒ ภาพรวมยอดขาย              ✕ │   │ ← usable, tint primary/8
│ │ ◑ คำสั่งซื้อ                  ✕ │   │
│ │ ◓ ลูกค้า                     ✕ │   │
│ │ ⚠ ค่าใช้จ่าย  [ใช้ไม่ได้แล้ว]  ✕ │   │ ← unavailable, tint warning/8
│ │   สิทธิ์เข้าถึงเมนูนี้หมดแล้ว     │   │   (ถอดได้เสมอ แม้เหลือช่องเดียว)
│ └─────────────────────────────────┘   │
│                                       │
│ เลือกเพิ่ม                            │
│ ┌─────────────────────────────────┐   │
│ │ ◑ รีวิว                       + │   │
│ │ ◓ ความสำเร็จ                  + │   │
│ │ ▦ จัดการสต็อก [เลือกแพ็กเกจ]   + │   │ ← badge จาก catalog item
│ │ …                               │   │
│ └─────────────────────────────────┘   │
│                                       │
│           ↻ รีเซ็ตเป็นค่าเริ่มต้น      │
│         (safe-area-inset-bottom)     │
└───────────────────────────────────────┘
```

**Tablet (768–1023px) — เนื้อหาเดียวกัน จำกัดความกว้าง:**

```
┌ 834px (iPad) ─────────────────────────────────────┐
│         การ์ดเมนูลัด/empty-state เหมือน mobile         │
│         (การ์ดกว้างเต็ม container ของ Command Center)   │
│                                                     │
│  ShortcutEditSheet: header เต็มจอ, body               │
│  mx-auto w-full max-w-lg (Base: SalesChartSheet)       │
│  — กันแถวยาวเป็นเส้นเดียวข้ามจอกว้าง                     │
└─────────────────────────────────────────────────────┘
```

**Desktop (≥lg, เช่น 1440px) — ไม่มี widget นี้เลย:**

```
┌ 1440px ─────────────────────────────────────────────┐
│  CommandCenter ทั้งก้อนคือ <div className="lg:hidden">  │
│  → ไม่ render อะไรเลยบนเดสก์ท็อป                        │
│  เดสก์ท็อปใช้ UserCard/StatisticCard/AchievementLevel/  │
│  SalesReport/RecentOrder แทน (ของเดิม ไม่แตะ)            │
│  → Out of scope รอบนี้ (PRD §3.9, §5)                   │
└───────────────────────────────────────────────────────┘
```

---

### Section breakdown (prose)

**1. การ์ดปกติ (`CarouselGrid.tsx` แก้)**

- `card-header` เดิม (`▦ เมนูลัด`) คงไว้ทั้งหมด — เพิ่มปุ่ม "แก้ไข" เป็น sibling ฝั่งขวา `.card-header` (Preline `.card-header` เป็น `flex justify-between` อยู่แล้ว — ไม่ต้องเพิ่ม wrapper)
- ปุ่ม "แก้ไข" = text+icon button style เดียวกับ `ActivityTimeline.tsx` "ดูทั้งหมด ›" (icon `pencil` + ข้อความ `text-primary text-sm font-medium`) แต่เป็น `<button onClick>` ไม่ใช่ `<Link>` (เปิด sheet, ไม่ navigate)
- **⚠️ tap target:** ต้องเติม `min-h-11 py-2.5 -my-2.5` (หรือเทียบเท่า) บนตัว `<button>` เอง ไม่ใช่พึ่ง padding ของ `.card-header` — บราวเซอร์นับ hit-area จาก box ของ element ที่ interactive เท่านั้น (`.card-header` เองไม่ clickable) ใช้ negative margin หักลบไม่ให้ความสูงการ์ดโป่งขึ้นสายตา (pattern เดียวกับปุ่มปิดใน `ExpenseCategoryFilterSheet`)
- grid 4×2 เดิมไม่เปลี่ยน — `tiles.length` เท่าไหร่ก็ render เท่านั้น (ไม่เติมของหลอกให้ครบ 8, ตาม PRD §3.6) แถวสุดท้ายเว้นว่างได้ปกติ ไม่ต้องมี placeholder
- ตัด pagination/dots/`IntersectionObserver` ทั้งหมด (SDS D-07 — cap 8 = ≤1 หน้าเสมอ)
- `CarouselGrid` ถือ `tiles` เป็น `useState(initialTiles)` (ไม่ใช่ derive ตรงจาก prop เฉย ๆ) — เพราะ `ShortcutEditSheet` ต้อง callback อัปเดตการ์ดแบบ live หลัง mutation สำเร็จแต่ละครั้ง (ดู "State ที่ต้อง lift" ด้านล่าง) ไม่ต้องรอปิด sheet หรือ full page reload

**2. Empty state ของการ์ด (`tiles.length === 0`)**

- เกิดได้จริงตามที่ Controller ระบุ: ถอด "unavailable" ตัวสุดท้ายออก → `pinnedSlugs: []` → tiles ว่าง (SDS §8 ยืนยันเจตนา — ไม่ใช่บั๊ก)
- แทนที่ grid ด้วย `SellerEmptyState` (compact mode, อยู่ใน `card-body` เดิม) — icon+title+description ใช้ตรง ๆ
- ปุ่ม action **ต้องปรับ element จาก `<Link href>` เป็น `<button onClick>`** เพราะเปิด sheet ไม่ใช่ navigate — คัดลอกเฉพาะ className (`btn bg-primary hover:bg-primary-hover text-white rounded-full px-6 mt-5 text-sm font-medium`) ไม่ใช่ custom component ใหม่ (ระบุเป็น adaptation ใน Theme Source Mapping)
- ไม่ต้องแก้ `SellerEmptyState.tsx` เอง — parent (`CarouselGrid`) render ปุ่มเองแยกจาก component นี้เมื่อ `compact=true` (component คืนแค่ icon/title/description กลับมา ไม่มี action wrapper ให้ hijack)

**3. `ShortcutEditSheet.tsx` (ใหม่ — full-screen sheet)**

- Shell: **Base = `SalesChartSheet.tsx`** (`fixed inset-0 z-80 flex flex-col bg-card`, header back-chevron ซ้าย+title, body `mx-auto w-full max-w-lg` บนจอกว้าง, Escape ปิด, `role="dialog"`) — เลือกใช้ full-screen แทน rounded-top sheet (แบบ `ExpenseCategoryFilterSheet`) เพราะเนื้อหายาว (catalog ได้ถึง ~24 รายการ + pinned 8) ต้องการพื้นที่สกรอลล์เต็มจอ ไม่ใช่ quick-pick แบบสั้น
- Header: back-chevron ซ้าย (`onClose`) + title "แก้ไขเมนูลัด" + ตัวนับ `n/8` ขวา (plain text `text-sm text-default-500`; เปลี่ยนเป็น `text-warning-ink font-semibold` เมื่อ `n === 8` — สื่อ "เต็มแล้ว" แบบไม่ตกใจ ไม่ใช่ badge ตกแต่ง)
  - **`n` = `pinnedSlugs.length` รวม unavailable** (ตาม API §4.1 — unavailable กิน slot ของ cap 8 ด้วย) ผู้ใช้เห็นได้ตรง ๆ จากแถว "ใช้ไม่ได้แล้ว" ที่ยังอยู่ในลิสต์ "ปักหมุดอยู่" ว่าทำไมนับเต็มทั้งที่การ์ดโชว์ tile น้อยกว่า — ไม่ต้องมี copy อธิบายเพิ่ม เพราะ layout เองสื่อสารตรงนี้ให้แล้ว
- Body สกรอลล์ 2 sections:

  **"ปักหมุดอยู่"** = `pinnedSlugs` เรียงตาม SSOT order ที่ API คืนมาแล้ว (usable ก่อน, unavailable ท้ายสุด — ไม่ต้อง sort เองฝั่ง client)
  - แถว usable: **ทั้งแถวคือปุ่มเดียว** (Base: `FilterRow` ใน `ExpenseCategoryFilterSheet.tsx` — `min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5`) พื้น `bg-primary/8`, icon สีตาม `ICON_COLOR` map เดิมจาก `CarouselGrid.tsx`, label `text-dark font-medium`, ไอคอน `x` ท้ายแถว `text-default-500` = ถอด
  - **ช่องสุดท้ายที่ยัง "usable"** (นับเฉพาะ usable ตาม SRS TFR-006/MIN_REQUIRED — ดู "กฎ MIN_REQUIRED" ด้านล่าง): แถวทั้งแถว disabled (`opacity-50 cursor-not-allowed aria-disabled`, ไอคอน `x` เป็น `text-default-300`) + บรรทัดเล็กใต้แถว `text-2xs text-default-400`: "ต้องมีเมนูลัดอย่างน้อย 1 รายการ" — ป้องกัน error ล่วงหน้าแทนรอ 409 กลับมา
  - แถว unavailable: พื้น `bg-warning/8`, icon (จาก `describeAnySlug`, ไม่มี color field ในข้อมูล → ใช้ `text-default-400` เป็นกลาง), label `text-default-700`, badge เล็ก "ใช้ไม่ได้แล้ว" (`bg-warning/15 text-warning-ink text-2xs`, icon `tabler:alert-triangle` — precedent: `ReviewActions.tsx`/`TopUpReviewActions.tsx`) ต่อท้าย label, บรรทัดเล็กอธิบายเหตุ `text-2xs text-default-400`: "สิทธิ์เข้าถึงเมนูนี้หมดแล้ว" (บอกเหตุ ไม่กล่าวหา), ไอคอน `x` ท้ายแถว **enabled เสมอ** ไม่ว่าจะเหลือกี่รายการ (กฎที่ Controller เพิ่งเคาะ — unavailable ถอดได้เสมอแม้เป็นตัวสุดท้าย)
  - ถ้า `pinnedSlugs.length === 0` (พึ่งเปิดจาก empty-state การ์ด หรือถอดจนหมด): ข้อความแทนที่ list `text-sm text-default-500 py-3`: "ยังไม่ได้ปักหมุดเมนูลัดไว้เลย เลือกจากด้านล่างได้เลย"

  **"เลือกเพิ่ม"** = `catalog` ที่ไม่อยู่ใน `pinnedSlugs`
  - แถวปกติ: พื้นโปร่ง/`border border-default-100`, icon สีตาม catalog item, label `text-dark`, badge จาก `item.badge` ถ้ามี (render ตรงตาม pattern `Sidenav/components/AppMenu.tsx` — `<span className={cn('badge text-white', item.badge.className)}>{item.badge.text}</span>`) ไอคอน `plus` ท้ายแถว `text-primary` = เพิ่ม
  - เมื่อ `n === 8`: ทุกแถวในกลุ่มนี้ disabled (`opacity-50 cursor-not-allowed aria-disabled`, ไอคอน `plus` → `text-default-300`) + บรรทัด helper เหนือกลุ่ม `text-xs text-default-500`: "ปักครบ 8 รายการแล้ว ถอดออกก่อนเพื่อเพิ่มรายการใหม่"
  - ถ้าเลือกครบทุกอย่างในแคตตาล็อกแล้ว (catalog ⊆ pinnedSlugs, เหลือ 0 แถว): `text-sm text-default-500 py-3`: "เลือกครบทุกเมนูที่คุณมีสิทธิ์ใช้แล้ว"

- Footer (ไม่ sticky-fixed แยก — อยู่ท้ายเนื้อหาที่สกรอลล์ได้ ตาม pattern `SalesChartSheet`): ปุ่ม "รีเซ็ตเป็นค่าเริ่มต้น" — **ไม่ใช่ปุ่มเด่นของหน้า** (พระเอกคือ list toggle ด้านบน) → text-button เล็ก กึ่งกลาง `inline-flex items-center gap-1.5 min-h-11 py-2 text-sm font-medium text-default-700` + icon `refresh`, ไม่ใช่ปุ่มเต็มความกว้าง/สีทึบ
- `padding-bottom: calc(1rem + env(safe-area-inset-bottom))` ที่ scroll container (Base: `ExpenseCategoryFilterSheet`/`ProductPickerSheet` — carve-out safe-area, HR7 arbitrary ยอมรับแล้ว)

**4. State ที่ต้อง lift (สำคัญ — ไม่มีใน SDS ชัดเจน ต้องระบุที่นี่)**

`ShortcutEditSheet` รับ `initialState: ShortcutState` (จาก `GET` แรกที่เปิด sheet) และ callback `onSync: (tiles: ShortcutCatalogItem[]) => void`. ทุกครั้งที่ `pin`/`unpin`/`reset` สำเร็จ (response 200) → เรียก `onSync(computeTilesFromResponse(...))` ทันที **ไม่ต้องรอปิด sheet** — `CarouselGrid` อัปเดต `tiles` state ของตัวเองจาก callback นี้ ทำให้การ์ดหลัง sheet ปิดตรงกับที่แก้ไว้เสมอโดยไม่ต้อง full page reload (SSR คำนวณสดอยู่แล้วก็จริง แต่ user experience ต้องไม่รอ reload ถ้าไม่จำเป็น)

**5. Loading / pending / error states**

- **เปิด sheet ครั้งแรก (GET pending):** skeleton 4 แถว `h-14 rounded-lg bg-default-100 animate-pulse` ไม่โชว์ header count จนกว่าจะโหลดเสร็จ (Base: `SalesChartSheet.tsx` loading block)
- **GET ล้มเหลว:** แทนที่ body ด้วย error block เดียวกับ `SalesChartSheet` (`text-sm text-default-700` "โหลดเมนูลัดไม่สำเร็จ" + ปุ่ม `btn btn-sm border-default-300` "ลองใหม่")
- **ระหว่าง pin/unpin แถวใดแถวหนึ่ง:** แถวนั้นเข้า pending state — ไอคอนท้ายแถว (`x`/`plus`) ถูกแทนด้วย spinner เล็ก (`animate-spin` + icon `loader-2` หรือเทียบเท่า), ปุ่ม/แถวนั้น disabled ชั่วคราวกันแตะซ้ำ **แถวไม่ขยับข้ามกลุ่มจนกว่า response กลับมา** (ไม่ optimistic-move ล่วงหน้า — กัน UI กระโดดสองรอบถ้า error) เมื่อ response กลับมา sync ทั้งสอง section ใหม่จาก `pinnedSlugs`/`unavailable` ที่ได้จริง
- **409 `CAP_EXCEEDED`** (ปกติไม่ควรเกิดเพราะ disable ไว้ล่วงหน้าแล้ว แต่ race กันหลาย tab ได้): `pacesToast.error(response.error)` top-right (Hard Rule 9) — ข้อความจาก response ตรง ๆ ("ปักหมุดครบ 8 รายการแล้ว กรุณาถอดรายการเดิมก่อนเพิ่มใหม่")
- **409 `MIN_REQUIRED`**: `pacesToast.error(response.error)` top-right ("ต้องมีเมนูลัดอย่างน้อย 1 รายการเสมอ") — เช่นกันควรถูกกันไว้ล่วงหน้าด้วย disabled state แล้ว, toast เป็น fallback เท่านั้น
- **403 `SLUG_NOT_IN_CATALOG`** (สิทธิ์เปลี่ยนกลางอากาศ เช่น ถูกลด role ระหว่างเปิด sheet ค้างไว้): `pacesToast.error(response.error)` top-right **+ refetch `GET` ทั้งชุดทันที** เพื่อ resync catalog ที่ stale (ไม่ปล่อยให้ client เชื่อ catalog เก่าต่อ)
- **401/404/500**: `pacesToast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')` top-right + ปิด sheet อัตโนมัติ (ปัญหาระดับ session/shop ไม่ใช่เรื่องที่แก้ในหน้านี้ได้)
- **Reset:** ปุ่ม → `pacesConfirm.warning('รีเซ็ตเมนูลัดกลับเป็นค่าเริ่มต้น?', 'รายการที่ปักหมุดไว้ตอนนี้จะถูกแทนที่ด้วยค่าเริ่มต้นทั้งหมด')` (Hard Rule 8, Base: `src/lib/paces-swal.ts`) → ถ้ายืนยัน เรียก `POST reset` → สำเร็จ `pacesToast.success('รีเซ็ตเมนูลัดเรียบร้อย')` + sync list ใหม่

**6. `CommandCenter.tsx`**

- แก้แค่ data wiring (ไม่ใช่ visual): เลิก `import { SHORTCUT_TILES }` + `.map()` local — รับ `catalog`/`pinnedSlugs`/`unavailable` (หรือ `ShortcutState` ทั้งก้อน) จาก `data` prop ที่ page.tsx ส่งมาจาก `resolveShortcutState()` แล้วส่งต่อให้ `CarouselGrid` ตรง ๆ
- **ต้องรักษาพฤติกรรม D#13 เดิมไว้** (badge จำนวน live auction บน tile "การประมูล") — ของเดิม map จาก `data.liveAuctionCount` เข้า tile ที่ `href === '/auctions'`/`slug === 'seller:auctions'`; ต้อง apply บน tiles ชุดใหม่ (dynamic) แบบเดียวกัน ไม่ใช่แค่ทิ้งไปเพราะย้าย static array

---

### Theme Source Mapping

| Section | Theme/precedent source | Component | หมายเหตุ adapt |
|---|---|---|---|
| การ์ดปกติ (grid, card-header) | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx` (เดิมของ `CarouselGrid.tsx`) | `.card` `.card-header` `.card-title` | คงของเดิมทั้งหมด — ตัดแค่ pagination logic |
| ปุ่ม "แก้ไข" บน card-header | ในรีโป: `src/app/(paces)/seller/(dashboard)/dashboard/components/ActivityTimeline.tsx` (บรรทัดปุ่ม "ดูทั้งหมด ›") | text+icon button | เปลี่ยน `<Link href>` → `<button onClick>`, เติม `min-h-11` เอง (ไม่มีใน source เดิมเพราะเดิมเป็น text link ธรรมดา) |
| Empty state การ์ด | ในรีโป: `src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx` | `SellerEmptyState` compact | ใช้ icon/title/description ตรง; render ปุ่ม action เองแยกนอก component (className เดียวกับปุ่ม action ของ `SellerEmptyState` แต่เป็น `<button onClick>`) |
| Sheet shell (full-screen, header, safe-area) | ในรีโป: `src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx` | `fixed inset-0 z-80 flex flex-col bg-card` + header back-chevron | ตัด segmented control (รายวัน/รายเดือน) ที่ไม่เกี่ยวกับ feature นี้ |
| แถว toggle (ปักหมุด/เลือกเพิ่ม) | ในรีโป: `src/app/(paces)/seller/(dashboard)/expenses/components/ExpenseCategoryFilterSheet.tsx` (`FilterRow`) | `min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5` | เปลี่ยนจาก single-select (radio-like `aria-pressed`) เป็น multi add/remove (`x`/`plus` แทน `check`), เพิ่ม badge unavailable/catalog |
| Badge เมนูล็อก/แคตตาล็อก | ในรีโป: `src/layouts/components/Sidenav/components/AppMenu.tsx` (`item.badge.className`) | `<span className={cn('badge text-white', item.badge.className)}>` | ใช้ตรง — API คืน `badge.className`/`text` มาแล้ว ไม่ต้อง map สีเอง |
| Badge "ใช้ไม่ได้แล้ว" | ในรีโป: `src/app/(paces)/admin/(dashboard)/verifications/[id]/ReviewActions.tsx`, `topups/[id]/TopUpReviewActions.tsx` (`Icon icon="tabler:alert-triangle" className="text-warning ..."`) | icon+badge warning | ห่อเป็น `badge bg-warning/15 text-warning-ink` |
| Sweet Alert confirm (reset) | `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` ผ่าน helper ในรีโป `src/lib/paces-swal.ts` (`pacesConfirm.warning`) | — | ใช้ helper ตรง ๆ ไม่ต้องเรียก `Swal` เอง (Hard Rule 8) |
| Toast (error/success) | `theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx` ผ่าน helper ในรีโป `src/lib/paces-toast.ts` (`pacesToast.error/success`) | — | placement `top-right` (default) — เป็น action toast ไม่ใช่ chat (Hard Rule 9) |
| Skeleton loading (แถว) | ในรีโป: `src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx` (`animate-pulse rounded-lg bg-default-100`) | — | ปรับสัดส่วนเป็น `h-14` แถวลิสต์แทนสี่เหลี่ยมกราฟ |
| Icon set | `theme/paces/Admin/TS/src/app/(admin)/icons/tabler/page.tsx` (gallery — ต้อง verify ก่อน commit) | `@iconify/react` ผ่าน `Icon` wrapper (`src/components/wrappers/Icon.tsx`) | icons ที่ใช้: `pencil`, `x`, `plus`, `tabler:alert-triangle`, `refresh`, `layout-grid` (คงเดิม), empty-state icon แนะนำ `layout-grid-off` — **ต้อง verify ใน gallery ก่อน commit** (ยึด pattern "-off" ที่มีอยู่จริงแล้วในโค้ด เช่น `chart-bar-off`, `receipt-off`) ถ้าไม่มีจริงให้ fallback `apps-off`/default `inbox` |

---

### User flow

1. เปิด `/dashboard` มือถือ → RSC เรียก `resolveShortcutState()` → `CommandCenter` → `CarouselGrid(tiles)` render grid ปกติ (หรือ empty-state ถ้า `tiles.length === 0`)
2. กด "แก้ไข" (หรือ "ตั้งเมนูลัด" จาก empty-state) → `ShortcutEditSheet` เปิดเต็มจอ → `GET /api/shops/current/shortcuts` โหลด skeleton ระหว่างรอ
3. เห็น 2 กลุ่ม: ปักหมุดอยู่ (รวม unavailable ท้ายลิสต์) / เลือกเพิ่ม
4. แตะแถวใน "เลือกเพิ่ม" → pending → `POST .../{slug}/pin` → สำเร็จ → แถวย้ายไปกลุ่ม "ปักหมุดอยู่" อัตโนมัติ (จาก response), การ์ดข้างหลัง sync ผ่าน `onSync`
5. แตะ `x` ในแถว "ปักหมุดอยู่" → pending → `POST .../{slug}/unpin` → สำเร็จ → แถวย้ายไปกลุ่ม "เลือกเพิ่ม" (หรือหายไปเลยถ้าเป็น unavailable ที่ไม่อยู่ใน catalog แล้ว)
6. ถ้าถอดจนเหลือ 0 → กลับไปที่การ์ด (ปิด sheet เอง หรือผู้ใช้กดปิด) → การ์ดโชว์ empty-state
7. กด "รีเซ็ตเป็นค่าเริ่มต้น" → Sweet Alert ยืนยัน → ยืนยัน → `POST reset` → list ทั้งชุด sync เป็น default ใหม่ (สดตามสิทธิ์ปัจจุบัน) → toast สำเร็จ
8. กด back (‹) หรือ Escape → ปิด sheet → กลับ `/dashboard` เห็นการ์ดที่อัปเดตแล้ว (ไม่ reload)

---

### Content outline (ภาษาไทย)

| จุด | ข้อความ |
|---|---|
| ปุ่มบนการ์ด | "แก้ไข" |
| Empty state — title | "ยังไม่มีเมนูลัด" |
| Empty state — description | "เลือกเมนูที่ใช้บ่อยเพื่อเข้าถึงได้เร็วขึ้น" |
| Empty state — ปุ่ม | "ตั้งเมนูลัด" |
| Sheet title | "แก้ไขเมนูลัด" |
| Section 1 header | "ปักหมุดอยู่" |
| Section 1 — ว่างเปล่า | "ยังไม่ได้ปักหมุดเมนูลัดไว้เลย เลือกจากด้านล่างได้เลย" |
| Section 1 — disable ช่องสุดท้าย (usable) | "ต้องมีเมนูลัดอย่างน้อย 1 รายการ" |
| Badge unavailable | "ใช้ไม่ได้แล้ว" |
| คำอธิบาย unavailable | "สิทธิ์เข้าถึงเมนูนี้หมดแล้ว" |
| Section 2 header | "เลือกเพิ่ม" |
| Section 2 — เต็มโควตา | "ปักครบ 8 รายการแล้ว ถอดออกก่อนเพื่อเพิ่มรายการใหม่" |
| Section 2 — เลือกครบ | "เลือกครบทุกเมนูที่คุณมีสิทธิ์ใช้แล้ว" |
| ปุ่มรีเซ็ต | "รีเซ็ตเป็นค่าเริ่มต้น" |
| Sweet Alert — title | "รีเซ็ตเมนูลัดกลับเป็นค่าเริ่มต้น?" |
| Sweet Alert — text | "รายการที่ปักหมุดไว้ตอนนี้จะถูกแทนที่ด้วยค่าเริ่มต้นทั้งหมด" |
| Sweet Alert — ปุ่มยืนยัน/ยกเลิก | ค่า default ของ `pacesConfirm` ("ยืนยัน"/"ยกเลิก") |
| Toast — รีเซ็ตสำเร็จ | "รีเซ็ตเมนูลัดเรียบร้อย" |
| Toast — error 409/403 | ใช้ `response.error` จาก API ตรง ๆ (มีข้อความไทยระดับธุรกิจอยู่แล้วใน API.md §5) |
| Toast — error ทั่วไป (401/404/500) | "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" |
| GET error | "โหลดเมนูลัดไม่สำเร็จ" + ปุ่ม "ลองใหม่" |
| `aria-label` back | "กลับ" |

---

### Edge states ที่ต้องออกแบบ

- **Empty catalog ทั้งชุด** (ทฤษฎีล้วน — ปัจจุบันทุก persona มีอย่างน้อย `seller:sales`/`seller:orders`/`seller:customers` เห็นเสมอตาม PRD §4.3) — Section "เลือกเพิ่ม" แสดง "เลือกครบทุกเมนูที่คุณมีสิทธิ์ใช้แล้ว" ครอบคลุมเคสนี้โดยไม่ต้องแยก state ใหม่
- **Empty tiles บนการ์ด** (ถอดจนหมด/entitlement drift พร้อมกัน) → SellerEmptyState + ปุ่ม "ตั้งเมนูลัด" (ดูข้างต้น)
- **Loading** — sheet เปิดครั้งแรก: skeleton 4 แถว; per-row mutation: spinner แทนไอคอน + disable แถวนั้น
- **Error** — GET ล้มเหลว: retry block; mutation ล้มเหลว: toast + revert สถานะ (ไม่ขยับแถว, เพราะไม่ optimistic-move ล่วงหน้าอยู่แล้ว)
- **ข้อความยาวผิดปกติ** — label เมนูภาษาไทยยาวสุดในแคตตาล็อกปัจจุบันคือ "ChatBot ผู้ช่วยอัตโนมัติ" ระดับ 2 คำ ไม่ยาวเกิน แต่ป้องกันล่วงหน้า: label ใน row ใช้ `truncate` + `flex-1 min-w-0` กัน badge/ไอคอนท้ายแถวถูกดันหลุดจอ
- **ตัวเลข 0 และเต็ม** — `n/8`: 0 ไม่เกิดจริง (MIN=1 กันไว้) แต่ empty-state ของการ์ดคือทางที่ `n` เท่ากับ usable=0 ได้ (unavailable ยังนับรวมได้); 8/8 → สี warning-ink ที่ตัวนับ + helper text ในกลุ่ม "เลือกเพิ่ม"
- **ไม่มีสิทธิ์ (no-permission)** — ไม่มี route ตรงสำหรับหน้านี้ (ไม่ใช่หน้าแยก) แต่ API 401/404 กลางอากาศ (เช่น session หมดอายุระหว่างเปิด sheet ค้าง) → toast + ปิด sheet อัตโนมัติตามที่ระบุใน "Loading/pending/error states"

---

### Impeccable compliance

- **Mode: Operate** — นี่คือ product surface ที่ผู้ใช้กำลังทำงาน (ตั้งค่าเมนูลัดของตัวเอง) ไม่ใช่หน้าจอที่ต้อง persuade/แสดงแบรนด์ (`operate.md`): ความคุ้นเคย/ความสม่ำเสมอสำคัญกว่าความสร้างสรรค์ — เหตุผลที่ทุก component ในสเปกนี้ล้วนเป็น "คัดลอกแล้วปรับ" จาก pattern ที่มีอยู่แล้วในหน้า dashboard/expenses เดียวกัน (FilterRow, SalesChartSheet shell, pacesConfirm/pacesToast) ไม่ใช่ของใหม่ — ผู้ใช้ที่คุ้นกับ `ExpenseCategoryFilterSheet`/`SalesChartSheet` อยู่แล้วต้องรู้สึกว่า sheet นี้ "เดาทางได้" ทันที (`operate.md` "product slop test")
- **One Voice Rule** — จุดที่ใช้ primary (น้ำเงิน Paces `#236dc9`, ไม่ใช่ม่วง Vuexy): (1) icon `layout-grid` ที่ card-header (ของเดิม ไม่แตะ), (2) ปุ่ม "แก้ไข" text-link, (3) icon `plus` ท้ายแถว "เลือกเพิ่ม" (การกระทำที่เชื้อเชิญ), (4) badge count `n/8` ตอนไม่เต็ม เป็น neutral ไม่ใช่ primary จริง ๆ (แก้แล้วในสเปกเป็น `text-default-500`) — รวมกันแล้วยังเป็นสัดส่วนเล็กของจอ ไม่มีจุดไหนใช้ primary เป็นพื้นทึบขนาดใหญ่ (พื้นแถว pinned ใช้ `bg-primary/8` ซึ่งเป็น tint บางมาก ไม่ใช่สีทึบ) — **พระเอกของหน้านี้คือ list ของ toggle rows เอง ไม่ใช่สี** ลำดับชั้นมาจาก grouping (ปักหมุดอยู่/เลือกเพิ่ม) + tint (primary/8 vs warning/8 vs plain) ไม่ใช่จาก primary เข้ม
- **Verified-Means-Green Rule** — ไม่มีจุดไหนในสเปกนี้ใช้เขียว `#28C76F` เลย โดยตั้งใจ: สถานะ "ปักหมุดอยู่แล้ว" ไม่ใช่ "ยืนยันแล้ว/สำเร็จ" ในความหมายของ trust — ใช้ primary tint แทนเพื่อไม่ให้สับสนกับความหมาย verified ของแพลตฟอร์ม (ถ้าใช้เขียวจะเป็นการเฟ้อสัญญาณ trust ผิดที่); "ใช้ไม่ได้แล้ว" ใช้ warning ไม่ใช่ error/danger เพราะเป็นสถานะที่คาดการณ์ได้และแก้คืนได้เอง (ต่อแพ็กเกจ/คืนสิทธิ์) ไม่ใช่ความล้มเหลว
- **Sentence-Case Rule** — ทุก copy ในตาราง Content outline เป็นประโยคปกติ ไม่มี ALL CAPS/eyebrow ตัวพิมพ์ใหญ่
- **Ink-Tinted Shadow Rule** — `.card` ของการ์ดปกติใช้เงา token เดิม (sm ตอนพัก); sheet full-screen ไม่มีเงาลอย (แทนที่ด้วย `bg-card` เต็มจอ, backdrop คือทั้งจอ) ไม่มีจุดไหนเพิ่ม custom shadow
- **Anti-slop (`narrative.donts`)** — ไม่มี gradient/hero-metric/eyebrow ตัวพิมพ์ใหญ่จิ๋ว/gradient text/การ์ดซ้อนการ์ด/border ตกแต่ง >1px ตลอดทั้งสเปก; แถว toggle ใช้พื้น tint บาง (`/8`, `/15`) ไม่ใช่ border สีสด
- **น้ำเสียงข้อความ** — "สิทธิ์เข้าถึงเมนูนี้หมดแล้ว" บอกเหตุตรง ๆ ไม่กล่าวหาผู้ใช้ ("คุณไม่มีสิทธิ์"); "ต้องมีเมนูลัดอย่างน้อย 1 รายการ" อธิบายกฎล่วงหน้าแทนรอ error; ไม่มีคำไฮป์ ("เยี่ยมมาก!") แม้แต่ใน toast สำเร็จ ("รีเซ็ตเมนูลัดเรียบร้อย" เป็นกลาง)
- **จุดที่ theme ขัดกับ Impeccable + การตัดสิน:**
  1. **Empty-state action button และปุ่ม "แก้ไข"** ต้องเปลี่ยนจาก `<Link href>` (theme เดิม/`SellerEmptyState` เดิม) เป็น `<button onClick>` เพราะเปิด client sheet ไม่ใช่ navigate — เป็นการปรับ element tag ไม่ใช่ปรับ visual (className เดิมทั้งหมด) จึงไม่ถือว่าขัด Hard Rule 1 (theme ให้ markup/สไตล์ ไม่ใช่ HTML tag ตายตัว)
  2. **Icon `layout-grid-off` ยังไม่ verify 100%** ว่ามีจริงในชุด tabler ที่ Paces bundle — อ้างอิงจาก pattern "-off" ที่มีอยู่แล้วจริงในโค้ด (`chart-bar-off`, `receipt-off`, `search-off` ฯลฯ) แต่ไม่ใช่การยืนยันโดยตรง ระบุ fallback ไว้แล้ว (`apps-off` หรือ default `inbox`) — developer ต้อง verify ผ่าน icons gallery ก่อน commit ตาม Hard Rule 7 (ไม่ปล่อยให้เดาเงียบ ๆ)
  3. **`min-h-11` บนปุ่ม text-link "แก้ไข"** ไม่ใช่ pattern เดิมของ `ActivityTimeline.tsx` ("ดูทั้งหมด" ไม่มี explicit sizing เพราะสูงพอจาก `card-header` padding อยู่แล้วในบริบทนั้น) — ที่นี่ต้องเพิ่ม negative-margin trick เพราะ Hard Rule ของ PRODUCT.md (tap target ≥44px) มาก่อนความสวยงามที่ตามมาเฉย ๆ จาก layout ของการ์ด — เขียนไว้ชัดในสเปกกันนักพัฒนาลืม

---

### Design decisions + rationale

1. **Full-screen sheet แทน rounded-top sheet** — เนื้อหายาว (catalog สูงสุด ~24 + pinned สูงสุด 8) ต้องการพื้นที่สกรอลล์เต็ม ไม่เหมาะกับ quick-pick แบบสั้นของ `ExpenseCategoryFilterSheet` (7 หมวดคงที่)
2. **แถวทั้งแถวคือ tap target เดียว** (ไม่ใช่แค่ไอคอน `x`/`plus` เล็ก ๆ) — ยกจาก `FilterRow` ตรง ๆ ซึ่งแก้ปัญหา ≥44px ไปตั้งแต่ต้นโดยไม่ต้องคิดใหม่
3. **ไม่ optimistic-move แถวข้ามกลุ่มก่อน response** — SDS อนุญาต optimistic UI แต่เตือนว่าต้อง sync ด้วย response จริงเสมอ; เลือก "pending in-place" แทน "ย้ายแล้วอาจย้ายกลับ" เพราะการย้ายกลับ (revert) จะดู jarring กว่าการรอ spinner สั้น ๆ ในที่เดิม
4. **`n/8` นับรวม unavailable** — ต้อง sync ตรงกับ business rule จริงใน `pinShortcut` (`current.length >= MAX_SHORTCUTS` นับทุก slug ที่ persist ไม่ใช่แค่ที่ render) มิฉะนั้น UI จะโกหกว่ายังเพิ่มได้ทั้งที่ server จะ 409 ทันที (ตรง memory `feedback_ui_complete_state_must_mirror_validation`)
5. **Reset button เล็ก/ไม่เด่น** — ตาม frontend-design "ตัดของที่ไม่ได้ทำงานทิ้ง"/"ลำดับชั้นชัดขาด": รีเซ็ตเป็น escape hatch ที่ใช้ไม่บ่อย (PRD KPI เองก็แค่ track baseline) ไม่ควรแย่งความสนใจจาก list ที่เป็นงานหลักของหน้านี้

---

### Anti-slop self-check

1. **เฉพาะกับ Deep จริงไหม** — ใช่: การนับ `n/8` รวม unavailable, กฎ "unavailable ถอดได้เสมอแม้เหลือตัวเดียวแต่ usable ถอดไม่ได้ถ้าเหลือตัวเดียว" (กฎที่ Controller เพิ่งเคาะ) เป็นตรรกะเฉพาะของฟีเจอร์นี้ ไม่ใช่ toggle-list ทั่วไปที่ copy ไปใช้กับสินค้าอื่นได้ตรง ๆ — ต้องเข้าใจ business rule ก่อนถึงจะ implement UI ถูก
2. **มีจุดเด่น 1 จุดต่อหน้าจอไหม** — การ์ดปกติ: grid ของ tile คือพระเอก (ปุ่ม "แก้ไข" เล็ก/ไม่แข่ง); sheet: list ของ toggle rows คือพระเอก (reset button จงใจทำให้เล็ก, count เป็น plain text ไม่ badge)
3. **element ไหนตัดทิ้ง** — ตัด pagination/dots/`IntersectionObserver` ทั้งหมดจาก `CarouselGrid` เดิม (ค่าคงที่เสมอเพราะ cap 8 ≤ 1 หน้า — ไม่มีประโยชน์อีกแล้ว), ตัด `ShortcutGrid.tsx` (dead code ยืนยันแล้วใน SDS D-08)
4. **State ครบไหม** — empty (การ์ด+catalog หมด+pinned หมด), loading (skeleton เปิดครั้งแรก+pending ต่อแถว), error (GET fail+409×2+403+401/404/500), ข้อความยาว (truncate label), ตัวเลข 0/เต็ม (n=usable กันไว้ที่ 1 minimum, n=8 มี helper) — ครบตามที่ไล่ใน "Edge states"
5. **copy ตรงกับที่ระบบทำได้จริงไหม** — "ต้องมีเมนูลัดอย่างน้อย 1 รายการ" ปรากฏเฉพาะตอนที่ปุ่มนั้น disabled จริง (ไม่ใช่ error ลอย ๆ); ปุ่ม "แก้ไข"/"ตั้งเมนูลัด" ทำสิ่งเดียวกัน (เปิด sheet เดียวกัน) ไม่มีปุ่มไหนสัญญาเกินจริง
6. **คำเดียวกันหมายถึงของเดียวกันไหม** — "ปักหมุด" ใช้สม่ำเสมอทั้งสเปก (ไม่ปนกับ "บันทึก"/"เลือก"); "ใช้ไม่ได้แล้ว" ใช้คำเดียวกับที่ PRD §3.6 ใช้ตรง ๆ ไม่ตั้งคำใหม่
7. **สีสื่อความหมายถูกไหม** — เขียวไม่ถูกใช้เลยในสเปกนี้ (ตรวจแล้วในหัวข้อ Impeccable compliance); "ใช้ไม่ได้แล้ว" = warning เสมอทุกจุด (badge ในลิสต์เดียวกับที่จะปรากฏถ้ามีที่อื่นในอนาคต); primary ใช้เฉพาะ action ("+", ปุ่มแก้ไข) ไม่ใช้กับสถานะ passive
8. **แตะได้จริงบนมือถือไหม** — ทุก row ≥44px (ทั้งแถวคือ tap target), ปุ่ม "แก้ไข"/back/reset ระบุ `min-h-11` ชัดเจน, ปุ่มหลัก (toggle rows) อยู่กลางจอในโซนนิ้วโป้งเสมอ (ไม่มี action ลอยมุมบนที่ต้องเอื้อม ยกเว้น back/count ซึ่งเป็น secondary)
9. **จอกว้าง 1440 คอลัมน์ไหนว่างเปล่า** — ไม่เกิดปัญหานี้เพราะทั้งการ์ดและ sheet **ไม่ render บนเดสก์ท็อปเลย** (`lg:hidden`) — ไม่มีคอลัมน์ 70/30 ให้พูดถึงในฟีเจอร์นี้ (ตาม scope PRD §3.9)

---

### Open questions (ให้ Controller/developer)

1. **Icon `layout-grid-off`** สำหรับ empty-state ยังไม่ยืนยัน 100% ว่ามีจริงในชุด tabler — developer ต้องเปิด icons gallery เช็คก่อน หรือ Controller อนุมัติ fallback `apps-off`/`inbox` ไว้ล่วงหน้า?
2. **Icon spinner ระหว่าง pending** — ระบุ `loader-2`/`loader` (tabler มี spin animation icon มาตรฐาน) แต่ยังไม่ verify ชื่อเป๊ะเช่นกัน — ขอให้ developer เช็คกับ pattern ที่มีอยู่แล้วในโปรเจกต์ (เช่น loading spinner ใน `ExpenseFormModal.tsx` submit state) แทนเดาใหม่
3. **จำนวนแถว skeleton (4 แถว)** เป็นค่าประมาณ ไม่ผูกกับข้อมูลจริง — OK สำหรับ dev ปรับเป็น 5-6 ถ้าดูดีกว่าบนจอจริงหรือไม่ต้องถาม user เพิ่ม?