# UX Design Spec — AI Command Center

> **โมดูล:** 00049 - AI Command Center
> **หน้า:** `admin.deepthailand.app/command-center` (admin only)
> **วันที่:** 2026-08-16 · **เจ้าของ:** `safepay-ux` (HR8 mandatory gate)
> **อ้างอิง:** `docs/superpowers/specs/2026-08-16-ai-command-center-design.md` §7
> **สถานะ:** ผ่าน ux gate แล้ว · Controller เคาะคำถามค้าง 5 ข้อแล้ว (§9) · รอ implement

---

## 1. User stories ที่ครอบ

- รู้**ทันทีที่เปิดหน้า**ว่ามีใบงานกี่ใบที่รอตัดสินใจ โดยไม่ต้องนับเอง
- เห็นว่าใบงานแต่ละใบ**ค้างอยู่ขั้นไหนมานานแค่ไหน**
- กด **"เคาะพร้อมขึ้น"** ได้จากจอเดียว โดยรู้ว่ากดแล้วจะเกิดอะไรขึ้นจริง
- ตีกลับ/หยุดงานพร้อมให้เหตุผลที่ติดไปกับใบงาน
- รู้**ทันทีที่ระบบพัง** ไม่ใช่เห็นจอว่างแล้วเดาเอง

---

## 2. Layout

### 2.1 Desktop ≥1280px

```
┌ Sidebar ┬──────────────────────────────────────────────────────────────┐
│         │  ระบบ / สายพานงาน AI                    [+ สั่งงานใหม่]     │ ← PageBreadcrumb + action
│         │ ┌──────────────────────────────────────────────────────┐    │
│         │ │ [●] Hermes: ทำงานล่าสุด 3 นาทีที่แล้ว  รอเคาะ 3 → ดู│    │ ← แถบสถานะ (เลข text-3xl)
│         │ └──────────────────────────────────────────────────────┘    │
│         │ ┌──────────────────────────────────────────────────────┐    │
│         │ │ [ค้นหาหัวข้อ…]          รีเฟรชล่าสุด 12 วินาทีที่แล้ว│    │ ← card-header
│         │ ├──────┬─────┬──────┬─────┬────┬──────┬────────────────┤    │
│         │ │วางแผน│ UX  │เขียน │รีวิว│ QA │เอกสาร│▌รอเคาะ (3)    │    │
│         │ │ (2)  │ (1) │ (1)  │ (0) │(1) │ (1)  │▌               │    │
│         │ │planner│ux  │developer│reviewer│qa│docs│▌             │    │ ← subtitle ชื่อ agent
│         │ ├──────┼─────┼──────┼─────┼────┼──────┼────────────────┤    │
│         │ │┌────┐│┌───┐│┌────┐│     │┌──┐│┌────┐│▌┌────────────┐│    │
│         │ ││#41 │││#39│││#40 ││ไม่มี││#38│││#37 ││▌│#35 แก้บั๊ก ⋮││    │
│         │ ││🕐14น││🕐2ชม││🕐45น││ใบงาน││🕐6ชม││🕐1ชม││▌│ค้าง 2 ชม.  ││    │
│         │ │└────┘│└───┘│└────┘│     │└──┘│└────┘│▌│[เคาะพร้อมขึ้น]││   │
│         │ └──────┴─────┴──────┴─────┴────┴──────┴────────────────┘    │
│         │      ←─── เลื่อนแนวนอน (คอลัมน์ 1-6 ~250px · รอเคาะ ~290px) ───→
└─────────┴──────────────────────────────────────────────────────────────┘
```

`▌` = `border-s-3 border-primary` (ข้อยกเว้นที่ขึ้นทะเบียนแล้วสำหรับ `(paces)/**` ตาม DESIGN.md)
ใช้เฉพาะคอลัมน์/การ์ด "รอเคาะ" — คอลัมน์อื่นเป็น `.card` เปล่า ไม่มีแถบสี

### 2.2 Tablet 768–1023px

sidebar ยังเป็น off-canvas (breakpoint คือ `lg`=1024) เนื้อที่กว้างขึ้นแต่ยังไม่พอ 7 คอลัมน์
(7×250 = 1750px > 1023px) ⇒ **ใช้ board เดียวกับเดสก์ท็อปเป๊ะ ๆ** ไม่แยก breakpoint พิเศษ
เห็นพร้อมกัน ~3 คอลัมน์ เลื่อนดูที่เหลือ — kanban เลื่อนแนวนอนเป็นแพตเทิร์นที่ผู้ใช้กลุ่มนี้
คุ้นอยู่แล้ว (Trello/Linear/GitHub Projects)

### 2.3 Mobile 320–767px — 7 คอลัมน์เคียงกัน**เป็นไปไม่ได้จริง**

**เลขจริงที่ 320px:** `main { px-5 }` = 20px สองข้าง (`src/assets/css/structure/_layout.css:12`;
admin ไม่มี `.seller-mobile-shell` override 16px แบบ seller) ⇒ เนื้อที่ใช้ได้ = **280px**

ป้ายไทย + ตัวนับ ("วางแผน 2") กว้างเฉลี่ย ~95–110px/ป้าย × 7 + gap 8px × 6 = **~700–770px**
⇒ เกินที่มีไป **2.5 เท่า** ไม่ใช่แค่ "ดูแน่น"

**ทางแก้:** แถบแท็บ pill เลื่อนแนวนอน (`overflow-x-auto snap-x`) เห็น ~2.5 แท็บใน 280px
\+ รายการการ์ดแนวตั้งเต็มความกว้างใต้แท็บที่เลือก — เป็น stage-switcher ที่คงความหมาย
"คอลัมน์" ไว้ (1 แท็บ = 1 คอลัมน์เต็มจอ) **แท็บ "รอเคาะ" ถูกเลือกเป็นค่าเริ่มต้น** และ auto-scroll เข้าจอ

```
┌────────────────────────────────────┐
│ ☰  สายพานงาน AI            [+]    │
│ ┌──────────────────────────────┐   │
│ │ [●] Hermes: 3 นาทีที่แล้ว    │   │
│ │        รอเคาะ  3      → ดู   │   │ ← text-3xl font-bold
│ └──────────────────────────────┘   │
│ [วางแผน 2][UX 1][เขียน 1]→ scroll │
│  …(สุดทาง)…      [▌รอเคาะ 3]      │ ← default selected
├────────────────────────────────────┤
│ ┌──────────────────────────────┐   │
│ │▌ #35 แก้บั๊กหน้าแรก…     ⋮  │   │
│ │  ค้างขั้นนี้ 2 ชม.           │   │
│ │  [   เคาะ "พร้อมขึ้น"    ]  │   │ ← เต็มกว้าง ≥44px
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

---

## 3. Section breakdown

**1. แถบสถานะบน** — `.card` บาง คงตำแหน่งเดียวกันทั้ง 3 breakpoint (ต้องเด่นที่สุดตาม requirement)
- **ชีพจร Hermes** — ข้อความเรียบ `text-default-700` + จุด `size-2 rounded-full`
  ถ้ามี GitHub issue "ขาดการติดต่อ" เปิดอยู่ (อ่านจาก GitHub ตรง ไม่คำนวณอายุเองที่ frontend
  ตาม D-8) → ทั้งแถบเป็น banner แดงเต็มความกว้าง
- **ตัวเลข "รอเคาะ"** — `text-3xl font-bold tabular-nums text-primary-ink` ใหญ่สุดในหน้า
  \+ ลิงก์ "→ ดู" เลื่อนบอร์ด/สลับแท็บไปคอลัมน์รอเคาะ
  🛑 **เลขนี้กับเลขในหัวคอลัมน์ต้องมาจาก symbol เดียวกัน** ห้ามคำนวณ 2 ที่ (`sibling-surface-parity`)

**2. Toolbar** — `.card-header`: ช่องค้นหา (client-side filter) + "รีเฟรชล่าสุด {relative}" ชิดขวา
**ไม่มีปุ่ม refresh แมนนวล** เพราะซ้ำกับ auto-poll ที่ทำงานอยู่แล้ว

**3. บอร์ด 7 คอลัมน์** — เรียง**ตามสายพานจริง** (รอเคาะขวาสุด ไม่ใช่ซ้ายสุด) ดูเหตุผล §7.1

**4. การ์ด** — โครงเดียวกันทุกคอลัมน์ ต่างแค่ปุ่ม
- หัวข้อ (ลิงก์เปิด GitHub แท็บใหม่, `line-clamp-2`) · badge Issue/PR + `#NN`
- เวลาที่ค้างขั้นนี้ — **สีเป็น `text-warning-ink` เฉพาะเมื่อเกิน 24 ชม.** (ดู §7.3)
- `⋮` เมนู (ตีกลับ / หยุด / เปิดใน GitHub) — ทุกคอลัมน์
- **เฉพาะคอลัมน์รอเคาะ:** ปุ่ม "เคาะ 'พร้อมขึ้น'" เต็มความกว้าง แยกจาก `⋮`
- **ไม่พิมพ์ชื่อขั้น/agent ซ้ำบนการ์ด** (คงที่ตามคอลัมน์อยู่แล้ว)

**5. สั่งงานใหม่** — ปุ่มที่ `action` slot ของ `PageBreadcrumb` → modal 2 ช่อง

---

## 4. Theme Source Mapping

| Section | Theme source | Component | adapt |
|---|---|---|---|
| บอร์ด 7 คอลัมน์ | `theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx` | `Board` | **ถอด `@hello-pangea/dnd` ทั้งชุด** — เราไม่ลากการ์ด สถานะเปลี่ยนจาก label เท่านั้น; เหลือ `flex overflow-x-auto` + `.map()` + `SimpleBar` |
| การ์ด | `…/pipeline/components/TaskItem.tsx` | `TaskItem` | ตัด avatar + `Image` ทั้งหมด (ไม่มีในข้อมูลเรา + HR6 ห้ามตัวละคร); ตัด messages/tasks counter |
| `⋮` เมนู | `src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx` | custom React dropdown | 🛑 **ห้าม `hs-dropdown` ดิบ** — `paces-component-reference.md §3`: Preline พังใน list ที่ re-render และบอร์ดนี้ poll ทุก 15–30 วิ |
| Toolbar | `…/pipeline/components/PipelinePage.tsx` | `.card > .card-header > Board` | ตัด filter dropdown Stage/Closing Date ทิ้ง |
| หัวหน้า + ปุ่มสร้าง | `src/components/PageBreadcrumb.tsx` | `PageBreadcrumb` | ใช้ตรง ๆ (มี `action` slot แล้ว) |
| แถบสถานะบน | `theme/paces/…/dashboard/ecommerce/components/StatisticCard.tsx` (structure) + precedent `ProductReviews.tsx:289` | การ์ดบาง custom | ไม่ใช้ `CountUp` (§7.2); `text-3xl font-bold tabular-nums` |
| Modal สั่งงานใหม่ | `src/lib/paces-swal.ts` → `pacesEditTextFields` | สร้างพี่น้อง `pacesCreateTask` recipe เดิม | `h-11` ตรง ๆ ไม่พึ่ง `.form-input` (คำเตือน `paces-swal.ts:180`) |
| Confirm อนุมัติ | `src/lib/paces-swal.ts` → `pacesConfirm.question` | ใช้ตรง ๆ | — |
| Confirm ตีกลับ (+เหตุผลอิสระ) | `pacesConfirmWithReason` (input เป็น `select`) | **สร้าง `pacesConfirmWithText`** recipe เดิมแต่ `input:'textarea'` | ✅ Controller เคาะแล้ว (§9.2) |
| Confirm หยุด | `pacesConfirm.danger` | ใช้ตรง ๆ | — |
| Banner error เต็มกว้าง | ประกอบจาก primitive `bg-{semantic}/10 border border-{semantic}/30 rounded-lg p-3` + Icon | pattern ใหม่ | ✅ Controller เคาะแล้ว (§9.3) |
| แท็บ pill มือถือ | ไม่มีใน theme | ประกอบจาก `.badge`-style pill + `overflow-x-auto snap-x` | ✅ Controller เคาะแล้ว (§9.3) |
| SimpleBar ในคอลัมน์ | `@/components/wrappers/SimpleBar` | `SimpleBar` | 🛑 **ใช้ `h-160` fixed เหมือน theme เป๊ะ ไม่ใช่ `flex-1 min-h-0`** — เลี่ยงบั๊ก `scroll-container-clips-popovers.md` โดยตรง |

**Icon (tabler):** ยืนยันมีจริงในโค้ดฐานแล้ว — `dots-vertical` `search` `plus` `check` `x` `inbox`
`photo` `alert-triangle` · **ยังไม่พบการใช้ในโค้ดฐาน developer ต้องยืนยัน slug ก่อน copy** —
`cpu` `cloud-off` `git-pull-request` `circle-dot` `external-link` `arrow-back-up` `clock`
`refresh` `circle-check`

---

## 5. User flow

1. เปิดหน้า → เห็นแถบสถานะบนก่อน → เห็นเลข "รอเคาะ" ทันที
2. (มือถือ) แท็บ "รอเคาะ" ถูกเลือกอัตโนมัติตั้งแต่โหลด
3. กด "→ ดู" (เดสก์ท็อป/แท็บเล็ต) → บอร์ด smooth-scroll ไปคอลัมน์รอเคาะ
4. กด "เคาะพร้อมขึ้น" → Swal ยืนยัน (บอกชัดว่าจะขึ้น prod เมื่อด่านผ่านครบ) → API route ของเรา
   → ติดป้าย → `pacesToast.success` → **การ์ดหายในรอบ poll ถัดไป ไม่ optimistic update**
   (D-8: poll คือความจริง)
5. `⋮` → ตีกลับ → Swal กรอกเหตุผล (บังคับ) → เปลี่ยนป้าย + comment → toast
6. "+ สั่งงานใหม่" → Swal 2 ช่อง → สร้าง issue `stage:plan` → toast

---

## 6. Content outline (ภาษาไทย)

| จุด | ข้อความ |
|---|---|
| หัวเรื่อง | "สายพานงาน AI" |
| ปุ่มสร้าง | "สั่งงานใหม่" |
| Modal ช่อง 1 | "หัวข้องาน" · ph. "เช่น แก้บั๊กหน้าแรกโหลดช้า" |
| Modal ช่อง 2 | "รายละเอียด / สิ่งที่ต้องทำ" · ph. "อธิบายปัญหาหรือสิ่งที่ต้องการให้ AI ทำ ยิ่งละเอียดยิ่งช่วยให้ผลลัพธ์ตรงเป้า" |
| ปุ่มยืนยันสร้าง | "สร้างใบงาน" |
| Heartbeat ปกติ | "เครื่อง Hermes: ทำงานล่าสุด {relative}" |
| Heartbeat ขาด (banner) | "เครื่อง Hermes ไม่ส่งสัญญาณมา {relative} — งานที่ค้างอยู่ในสายพานจะไม่ขยับจนกว่าจะกลับมาออนไลน์" |
| ตัวเลขรอเคาะ = 0 | ไอคอน `circle-check` + "ไม่มีใบงานรอคุณตัดสินใจตอนนี้" (**ไม่โชว์เลข 0 ตัวใหญ่**) |
| ค้นหา | ph. "ค้นหาหัวข้อ…" |
| หัวคอลัมน์ | "วางแผน" "ออกแบบ UX" "เขียน" "รีวิว" "QA" "เอกสาร" "รอเคาะ" + `({count})` + subtitle `text-2xs text-default-400` ชื่อ agent |
| การ์ด — เวลา | "ค้างขั้นนี้ {duration}" (>24 ชม. → `text-warning-ink` + `alert-triangle`) |
| ปุ่มอนุมัติ | `เคาะ "พร้อมขึ้น"` |
| Swal อนุมัติ — title | `ยืนยันติดป้าย "พร้อมขึ้น"?` |
| Swal อนุมัติ — text | "PR นี้จะขึ้น prod อัตโนมัติเมื่อด่านตรวจสอบผ่านครบ (ปกติภายในไม่กี่นาที) — ยกเลิกทีหลังได้ถ้าด่านยังไม่ผ่าน" |
| `⋮` | "ตีกลับไปแก้" · "หยุดใบงานนี้" · "เปิดใน GitHub" |
| Swal ตีกลับ — ph. | "อธิบายสิ่งที่ต้องแก้ก่อนส่งกลับ" · validation "กรุณาระบุเหตุผลก่อนตีกลับ" |
| Swal หยุด — text | "ป้ายขั้นงานจะถูกถอดออก งานนี้จะไม่ถูกเครื่อง Hermes หยิบไปทำต่อ — กลับมาสั่งใหม่ได้ทีหลัง" |
| Toast | "ติดป้ายแล้ว — รอด่านตรวจสอบก่อนขึ้น prod" · "ตีกลับแล้ว" · "หยุดใบงานแล้ว" · "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง" |
| Empty คอลัมน์ | "ไม่มีใบงานในขั้นนี้" (`text-default-400 text-sm` ไม่มีไอคอนใหญ่) |

---

## 7. Edge states

| สถานะ | ระดับ | การแสดงผล |
|---|---|---|
| **อ่าน GitHub ไม่ได้** | **บล็อกทั้งหน้า** | banner แดงเต็มกว้าง + `cloud-off` + "อ่านข้อมูลจาก GitHub ไม่สำเร็จตอนนี้ — ระบบจะลองใหม่อัตโนมัติ" · **บอร์ดไม่ render เลย** (จอว่างโดยไม่บอกเหตุ = ถูกเข้าใจว่า "ไม่มีงาน") |
| **โควตา API หมด** | **ลดระดับ ไม่บล็อก** | banner เหลือง "โควตาเรียก GitHub หมดชั่วคราว — ข้อมูลด้านล่างเป็นของ {relative} จะลองใหม่อัตโนมัติ" (`partial-data-must-be-labeled-or-filled.md`) · ถ้าเป็นโหลดครั้งแรกไม่มีข้อมูลเก่า → พฤติกรรมเดียวกับข้อบน |
| **Hermes ขาดการติดต่อ** | ไม่บล็อก | แถบสถานะบนเป็น banner แดง คงเลข "รอเคาะ" ไว้ (ยังกดอนุมัติได้ ไม่เกี่ยวกับ Hermes) |
| **รอเคาะ = 0** | สถานะดี | `circle-check` + ข้อความ ไม่มี alarm |
| **คอลัมน์ว่าง** | ปกติ | ข้อความเรียบกลางคอลัมน์ ไม่มีภาพประกอบใหญ่ |
| **หัวข้อยาวผิดปกติ** | ต้องไม่ดันเลย์เอาต์ | `line-clamp-2` + **ชุดครบ `min-w-0` ที่กล่อง flex + `max-w-full` ที่ลูก** (`flex-header-truncation.md`) |
| **PR 40+ ใบ** | ต้อง scan ได้ | SimpleBar เลื่อนแนวตั้งในคอลัมน์ (fixed height) ไม่ยืดทั้งหน้า |
| **loading ครั้งแรก** | ไม่ใช่จอว่าง | skeleton `bg-default-100 animate-pulse` 2–3 ใบ/คอลัมน์ ตาม `TopUpQueueTable.tsx` |
| **ไม่มีสิทธิ์แอดมิน** | มี guard แล้ว | `(dashboard)/layout.tsx` — ไม่ต้องเช็คซ้ำ |

---

## 8. Impeccable compliance

**Mode: Operate** — admin ops tool ตรงนิยาม `operate.md` ("anything where the user is in a task")
ใช้เกณฑ์ earned familiarity ไม่ใช่ brand-expression ของ buyer/Vuexy · restrained color เป็น floor

- **One Voice** — primary ปรากฏ 4 จุด: เลข "รอเคาะ" · accent คอลัมน์/การ์ดรอเคาะ · ปุ่มเคาะ ·
  ปุ่มสั่งงานใหม่ รวมยังต่ำกว่า ~10% ทุก breakpoint (คอลัมน์ 1–6 เป็นกลางล้วน)
- **Verified-Means-Green** — เขียวใช้จุดเดียว: `circle-check` ตอนรอเคาะ=0 (ข้อเท็จจริงที่นับได้)
  · error 3 ระดับเป็น danger/warning · **ไม่มีจุดไหนใช้เขียวกับสถานะ "รอ"/"กำลังทำ"**
- **Anti-slop** — ไม่มี gradient · การ์ดไม่เท่ากันหมด (รอเคาะต่างชัด) · ไม่มี eyebrow จิ๋ว ·
  ไม่มี border ตกแต่งเกิน 1px (ยกเว้น `border-s-3` ที่ขึ้นทะเบียนแล้ว)
- **น้ำเสียง** — error บอกเหตุ+ทางออกเสมอ · confirm บอกผลจริง ไม่ใช่คำสั่งเปล่า

**จุดที่ theme ขัดกับ Impeccable และการตัดสิน:**
1. DESIGN.md scale "Metric" 32px/800 ไม่มี token ใน Paces (§8 สูงสุด `text-lg`=18px)
   → **ใช้ `text-3xl font-bold tabular-nums`** (Tailwind มาตรฐานที่ theme ไม่ purge · มี precedent
   จริงใน `TopUpQueueTable.tsx`/`BadgeFormDialog.tsx`/`ProductReviews.tsx`) — `font-bold` 700
   สอดคล้อง "Strong step" ที่ห้าม 800 กับข้อความอยู่แล้ว จึงไม่ขัดกันจริง
2. craft-floor แบน hero-metric เป็นค่าเริ่มต้น → **brief เขียนเองว่าเลขรอเคาะต้องเด่นที่สุด**
   = กรณีที่ brief earn ลวดลายนี้กลับมาได้ตามข้อยกเว้นที่ craft-floor เขียนไว้เอง ใช้จุดเดียว

---

## 9. คำถามค้าง — Controller เคาะแล้ว (2026-08-16)

| # | คำถามจาก ux | มติ |
|---|---|---|
| 1 | breadcrumb group: ใต้ "ธุรกิจ" หรือกลุ่มใหม่? | **กลุ่มใหม่ "ระบบ"** — เป็นเครื่องมือ ops ภายใน ไม่ใช่ข้อมูลธุรกิจแบบ topups/orders การเอาไปปนจะทำให้เมนูธุรกิจอ่านผิดความหมาย |
| 2 | สร้าง `pacesConfirmWithText` ใหม่ไหม? | **สร้าง** — recipe เดียวกับ `pacesConfirmWithReason` แต่ `input:'textarea'` · เหตุผลตีกลับเป็นข้อความอิสระ ไม่ใช่ list คงที่ · วางไว้ติดกับตัวเดิมในไฟล์เดียวกัน |
| 3 | banner error + แท็บ pill = pattern ใหม่ รับได้ไหม? | **รับได้** — ประกอบจาก primitive สี semantic ตาม `paces-component-reference.md §6` ไม่ใช่ arbitrary value · 🛑 ถ้าต้องใช้ arbitrary จริงต้องเขียน comment กำกับบรรทัดเดียวกับ class (HR7) |
| 4 | toast "PR #NN ขึ้น prod แล้ว" เมื่อการ์ดหาย | **ไม่ทำในรอบนี้** (YAGNI) — ต้อง diff poll 2 รอบเพื่อเดาว่าหายเพราะ merge หรือเพราะอย่างอื่น ซึ่งเป็นการเดา · บันทึกเป็น carry |
| 5 | heartbeat: ต้องอ่าน 2 อย่าง (ค่าดิบ + สถานะ issue) | **API route เดียวคืนทั้งคู่** — ไม่แยก 2 call · ค่าดิบใช้โชว์ relative time ปกติ · สถานะ issue เป็นตัว trigger banner (ไม่คำนวณอายุเองที่ frontend ตาม D-8) |

---

## 10. ไฟล์ที่ developer ต้องอ่านก่อนเขียนบรรทัดแรก

**Route:** `src/app/(paces)/admin/(dashboard)/command-center/page.tsx`
\+ เพิ่มรายการใน `src/app/(paces)/admin/(dashboard)/_admin-menu.ts` (กลุ่ม "ระบบ")

**Theme source ที่ต้อง copy:**
- `theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx`
- `theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/TaskItem.tsx`
- `theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/PipelinePage.tsx`

**Precedent ในโปรเจกต์ (บังคับใช้แล้ว ไม่ใช่ theme ดิบ):**
- `src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx` — custom `⋮` dropdown
- `src/lib/paces-swal.ts` — Sweet Alert ทุกตัวของหน้านี้
- `src/components/PageBreadcrumb.tsx` — action slot
- `src/app/(paces)/admin/(dashboard)/topups/components/TopUpQueueTable.tsx` — skeleton / error state
- `src/lib/relative-time-th.ts` — ⚠️ ต้องแยกฟังก์ชัน duration แบบ**ไม่มีคำว่า "ที่แล้ว"** สำหรับ "ค้างขั้นนี้"
- `docs/system/ui-guideline/paces-component-reference.md`
