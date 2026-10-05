# Design Spec — หน้าจัดข้อความรายงาน (ทิศทาง A) และการ์ด "ข้อความที่ส่งเข้ากลุ่ม"

**Route หลัก:** `/business/line-reports/[groupId]/template`
**ไฟล์:** `src/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/page.tsx`
**การ์ดในหน้าตั้งค่า:** `src/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/MessageCard.tsx` ใช้ใน `GroupDetailClient.tsx` แทน `MetricsCard` + `PreviewCard`
**Surface:** Paces seller · **Mode: Operate** · feature 00070 EXT · FR-LGS-EXT-04, 09, 11, 12, 14 + §6 edge

**อ่านแล้วตามลำดับ:**
- `.impeccable/design.json`, `DESIGN.md` (ไม่ได้เปิด `PRODUCT.md` ในรอบนี้ — ดึงบริบทผู้ใช้จาก DESIGN.md และสเปกทิศทาง)
- impeccable `operate.md`, `craft-floor.md`, `clarify.md` (v4.1.1)
- EXT §3–§6 + FR-04/05/09/11/12/13/14, สเปกทิศทาง (ท้ายไฟล์: มติ A, บล็อกกราฟ, audit กฎความโปร่ง 10 ข้อ), mockup ฟังก์ชัน `renderA`/`blockRowA`/`textToolsA`/`palette`/`gauge`
- โค้ดจริง: `GroupDetailClient`, `DetailActionBar`, `PreviewCard`, `MetricsCard`, `ScheduleCard`, `HistoryCard`, `GroupMenu`, `Rows`, `FlexBubbleView`, `flex-preview-tokens`
- builder หน้าร้าน: `BuilderClient`, `LibraryPanel`, `CanvasFrame`, `BuilderToolbar`, `DraftDirtyBar`, `lib/draft.ts`, `useUnsavedChangesGuard`
- shell: `(fullscreen)/layout.tsx`, `FullscreenPageHeader`, `FullscreenBackButton`
- helper/สัญญา: `paces-swal.ts`, `paces-toast.ts` + `PacesToastItem`, `template.ts`, `availability.ts`, `validations.ts`, `preview-sample.ts`, `settings-guards.ts`
- convention: `seller-action-placement.md`, `paces-component-reference.md`

`frontend-design` SKILL ไม่ได้เปิดในรอบนี้ (สเปกก่อนหน้าบันทึกว่าไม่มีใน worktree)

---

## 0. สิ่งที่พบจากโค้ดที่กระทบการออกแบบ (อ่านก่อน)

1. **`pacesToast` ไม่มีปุ่ม action**
   - AC-EXT-11-9 ต้องการ toast "เอาออกแล้ว + ย้อนกลับ" แต่ `PacesToastOptions` มีแค่ `duration` กับ `placement`
   - **มี theme match สำหรับ toast + ปุ่ม:** `theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx` บรรทัด ~135 (custom toast มี `btn btn-sm bg-primary ...`)
   - **ข้อเสนอหลัก:** ขยาย `pacesToast` เพิ่ม `action?: { label; onClick }` ใน 3 ไฟล์: `src/lib/paces-toast.ts`, `PacesToastContainer.tsx`, `PacesToastItem.tsx`
   - **ทางสำรองถ้าไม่อนุมัติ:** `pacesToast.info('เอาออกแล้ว: ยอดขาย · เพิ่มกลับได้จากคลัง')` ไม่มีปุ่ม (Open Q1)
2. **`FullscreenPageHeader` ซ่อนของบนมือถือ**
   - `toolbarExtra` เป็น `hidden lg:flex` และปุ่ม Save เป็น `hidden lg:inline-flex` (ออกแบบให้มือถือใช้ sticky bottom save)
   - หน้านี้ไม่มี bottom bar และ "ส่งทดสอบ" กับ "บันทึก" ต้องเห็นบนมือถือ
   - **ทางออกที่ไม่แก้ shared:** ไม่ส่ง `saveFormId`, ใส่ปุ่มทั้งหมดเองผ่าน `toolbarExtra` (≥lg) และ `belowContent` (<lg, `lg:hidden`) ตามที่ `BuilderToolbar` ทำกับ `DraftDirtyBar`
3. **breakpoint ของ Paces**
   - `md`=768, `lg`=1024, `xl`=1280 ส่วนจอ "1180" อยู่ช่วง `lg`
   - 3 คอลัมน์จึงเริ่มที่ `lg:` ไม่ใช่ `xl:` (builder หน้าร้านใช้ `xl:` เพราะ 3 คอลัมน์กว้างกว่า)
4. **`flex-preview-tokens` / `FlexBubbleView` ยังไม่รองรับ** `span` (`text.contents`), box ที่มี `backgroundColor`/`height`/`width` เป็น %, `cornerRadius` — งาน T11d ต้องเสร็จก่อนหน้านี้พรีวิวได้ครบ
5. **ขัดกันระหว่าง EXT AC กับ audit** (ตัดสินแล้ว ดู Impeccable compliance)
   - AC-EXT-11-3 บอกให้คลังโชว์ "ใช้ครบแล้ว"
   - audit กฎ 5 (หลังจาก user บ่นว่าแน่น) บอกให้ซ่อนบล็อกที่ใส่แล้ว
   - สเปกนี้ **ซ่อน** บล็อกที่ใส่แล้ว คงไว้เฉพาะบล็อกที่ใช้ไม่ได้เพราะเงื่อนไขกลุ่ม

---

## 1. User stories ที่ครอบ

US-EXT-1 (จัดลำดับบล็อก) · 2 (ข้อความของตัวเอง + ตัวหนา/ขนาด/สี/เฉพาะคำ) · 3 (โทเคน) · 4 (พรีวิวสดด้วยกรณียาวสุด) · 5 (กราฟ) · 6 (คืนแบบมาตรฐาน) · 7 (มือถือใช้ปุ่มขึ้น/ลง) · 8 (แยกต่อกลุ่ม) · 9 (บรรทัดที่คำนวณไม่ได้ไม่โผล่เป็น "-")

---

## 2. Layout

### 2.1 หน้าจัดข้อความ — 1180 (`lg`; เนื้อหากว้าง ~1116px, ไม่มี sidebar ไม่มี bottom nav)

grid 12 คอลัมน์: คลัง `col-span-3` · ข้อความ `col-span-5` · ตัวอย่าง `col-span-4` · ช่องห่าง `gap-7` (28px)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│[←] จัดข้อความรายงาน      (ยังไม่บันทึก · บันทึกก่อนส่งทดสอบ)  [⋯] [ส่งทดสอบ] [บันทึกเทมเพลต] │ sticky z-30
│    ทีมบริหารและบัญชี BT Premium Auto…                                                    │  (ปุ่มซ้าย→ขวา: ⋯ → secondary → PRIMARY)
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [แบนเนอร์ — เฉพาะเมื่อมี: แพ็กเกจหยุด / บอทถูกนำออก / มีการแก้จากที่อื่น]                    │
│                                                                                         │
│ ข้อมูล                  ข้อความ                          ตัวอย่างในกลุ่ม LINE [รายวัน|รายเดือน]│
│ จำนวนบริการ      [+]   ┌────────────────────────────┐    ┌ bg-light rounded-lg p-4 ─────┐ │
│ ยกเลิก           [+]   │🔒 หัวรายงาน   [รายงานยอด…]  │    │ ◉ Deep รายงานยอด            │ │
│ รายร้าน          [+]   ├────────────────────────────┤    │ ┌ bubble max-w-xs ─────────┐ │ │
│ ยอดสะสมรอบนี้    [+]   │⋮⋮ จำนวนบริการ        ⌄    │    │ │ รายงานยอดรายวัน          │ │ │
│  ใช้ได้เมื่อเปิดรายงาน…  ├────────────────────────────┤    │ │ 5 ต.ค. 2569 · ข้อมูล ณ…  │ │ │
│ กำไร             [+]   │⋮⋮▌ยอดขาย + ยังไม่นับ ⌃ ⌄ ✕ │    │ │ ──────────────────────── │ │ │
│                        │   ยอดนับแล้ว · ยังไม่นับ    │    │ │ บริการ              128 │ │ │
│ กราฟ                   ├────────────────────────────┤    │ │ ยอดขาย (นับแล้ว)        │ │ │
│ แนวโน้ม 7 วันล่าสุด [+] │⋮⋮ ข้อความ "ขอบคุณทุก…" ⌄   │    │ │  ฿18,902,340            │ │ │
│ เทียบรายร้าน      [+]   │⋮⋮ เส้นคั่น           ⌄    │    │ │ …                        │ │ │
│  ใช้ได้เมื่อกลุ่มรวมมากกว่า 1 ร้าน                      │    │ │ ไม่รวมร้าน X (ถูกล็อก)   │ │ │
│                        ├────────────────────────────┤    │ │ [        เปิด Deep      ]│ │ │
│ ข้อความของคุณ          │🔒 หมายเหตุอัตโนมัติ         │    │ └──────────────────────────┘ │ │
│ ข้อความ          [+]   ├────────────────────────────┤    │ ตัวอย่างด้วยชื่อร้านยาวและ…   │ │
│ เส้นคั่น         [+]   │ ปุ่มเปิด Deep · แสดง   ⌄   │    └──────────────────────────────┘ │
│                        └────────────────────────────┘                                    │
│                        ความยาวข้อความ ▓▓▓▓▓░░░░ 62%                                      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
 แต่ละคอลัมน์เลื่อนในตัวเอง (overflow-y-auto) · คอลัมน์พรีวิวไม่ต้อง sticky เพราะ shell สูงคงที่
```

### 2.2 768 (`md`) — สองคอลัมน์ + แถบคลังแนวนอน, เลื่อนทั้งหน้า

grid 12: ข้อความ `col-span-7` · ตัวอย่าง `col-span-5` เนื้อหากว้าง ~704px (padding `md:p-8`) พรีวิวได้ ~270px

```
┌───────────────────────────────────────────────────────────────┐
│[←] จัดข้อความรายงาน                               ⋮ (ดูข้อ 2.3)│ header + แถว action (belowContent)
│ [ผืนงาน|ตัวอย่าง] ← ซ่อนที่ ≥md      [⋯] [ส่งทดสอบ|บันทึก]    │
├───────────────────────────────────────────────────────────────┤
│ เพิ่มได้ →  [+ จำนวนบริการ][+ ยกเลิก][+ รายร้าน]… (เลื่อนแนวนอน)│  ชิปสูง 44px · ไม่มีลาก
│ ข้อความ                           │ ตัวอย่างในกลุ่ม LINE [วัน|เดือน]│
│ ┌───────────────────────────────┐ │ ┌ bg-light p-4 ────────────┐ │
│ │🔒 หัวรายงาน                    │ │ │ bubble                   │ │
│ │⋮⋮ จำนวนบริการ            ⌄    │ │ │  …                       │ │
│ │…                              │ │ └──────────────────────────┘ │
│ └───────────────────────────────┘ │                              │
│ ความยาวข้อความ ▓▓▓░░ 62%          │                              │
└───────────────────────────────────────────────────────────────┘
```

ที่ 768 ใช้ action bar แบบ 2.3 (แถวที่สองใน header) เพราะ `toolbarExtra` ของ shared header โผล่ที่ `lg` เท่านั้น seg "ผืนงาน|ตัวอย่าง" `md:hidden`

### 2.3 375 (<md) — ตัวสลับ ผืนงาน | ตัวอย่าง · ไม่มี bottom nav

```
┌─────────────────────────────────────┐
│[←] จัดข้อความรายงาน                  │ ┐ sticky z-30
│    ทีมบริหารและบัญชี BT Premium…     │ │ (header ~76px)
│ [ ผืนงาน | ตัวอย่าง ]   [⋯] [บันทึก] │ │ แถว action ~60px: seg flex-1 · ⋯ 44 · primary เดียว
├─────────────────────────────────────┘ ┘
│ เพิ่มได้ → [+จำนวนบริการ][+ยกเลิก]…   │  แถบเลื่อนแนวนอน ชิปสูง 44px
│ ┌─────────────────────────────────┐ │
│ │🔒 หัวรายงาน  [รายงานยอดรายวัน  ] │ │
│ ├─────────────────────────────────┤ │
│ │⋮⋮ จำนวนบริการ              ⌄    │ │  แถวปิด = บรรทัดเดียว สูง 48px
│ │⋮⋮ ยอดขาย + ยังไม่นับ   ⌃ ⌄ ✕    │ │  แถวเปิด: ย้ายขึ้น/ลง/เอาออก 44px
│ │   [textarea …………………………]      │ │
│ │ เหลือ 38   [+ ข้อมูล][จัดรูปแบบ] │ │
│ ├─────────────────────────────────┤ │
│ │🔒 หมายเหตุอัตโนมัติ              │ │
│ │ ปุ่มเปิด Deep · แสดง        ⌄   │ │
│ └─────────────────────────────────┘ │
│ ความยาวข้อความ ▓▓▓▓░░ 62%           │
└─────────────────────────────────────┘
 กดแท็บ "ตัวอย่าง" → ผืนงานซ่อน, เห็น [รายวัน|รายเดือน] + bubble + caption
```

- ปุ่ม primary ใน action row **มีช่องเดียวและเปลี่ยนตามสถานะ**
  - clean: "ส่งทดสอบ"
  - dirty: "บันทึก"
- ที่ 375 "ส่งทดสอบ" ตอน dirty ย้ายไปอยู่ใน `⋯` ในสถานะ disabled พร้อมเหตุผล (ข้อ 3.3)

### 2.4 การ์ดในหน้าตั้งค่า (`GroupDetailClient`)

ลำดับบนมือถือ: ร้าน → เวลา → **การ์ดข้อความ** → คำสั่ง → ประวัติ (เดิม ร้าน → เวลา → ตัวเลข → พรีวิว → คำสั่ง → ประวัติ)
บน `lg:` การ์ดอยู่คอลัมน์ขวาบนสุด (ตำแหน่งเดิมของ `PreviewCard`, `lg:sticky lg:top-36` เดิม) เหนือ "พิมพ์ในกลุ่มได้เลย"

```
┌ ข้อความที่ส่งเข้ากลุ่ม ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌[จัดข้อความ]┐  card-header เส้นประ
│ (ใช้แบบมาตรฐานอยู่)            [รายวัน|รายเดือน]       │  chip neutral / "จัดเองแล้ว" = info
│ ┌ FlexBubbleView (composer เดียวกัน, ข้อมูลตัวอย่าง) ┐ │
│ │ …                                                   │ │
│ └─────────────────────────────────────────────────────┘ │
│ ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก            │
└───────────────────────────────────────────────────────┘
```

ปุ่ม "จัดข้อความ" เป็น `Link` ไป `/business/line-reports/${id}/template`
- สไตล์ outline: `btn border-primary text-primary hover:bg-primary hover:text-white min-h-11 lg:min-h-0`
- **ไม่ใช่ primary** เพราะ primary ของหน้านั้นคือ "ส่งทดสอบ" ใน `DetailActionBar`
- แพ็กเกจหยุด/บอทถูกนำออก (`!canEdit`): ป้ายปุ่มเป็น "ดูข้อความที่ตั้งไว้"

---

## 3. Section breakdown

### 3.1 โครงหน้า (`page.tsx` + `TemplateBuilderClient`)

**`page.tsx` (RSC)**
- guard เดียวกับ `[groupId]/page.tsx`: `resolveReportAccess` → ANON redirect / NOT_OWNER notFound / `getGroupDetail` throw `GROUP_NOT_FOUND` → notFound
- ส่ง `initialGroup`, `serverNowIso` (ห้าม `new Date()` ฝั่ง client), `reportableShops`, `shell`, `lockReason`
- สถานะ group ≠ ACTIVE/INACTIVE (PENDING) → `redirect` ไปหน้าตั้งค่า เพราะยังไม่มีอะไรให้จัด

**`TemplateBuilderClient`** ห่อด้วย `<form id={TEMPLATE_FORM_ID}>` ตามแบบ `BuilderClient` (HR: copy shell)
- `lg:h-[calc(100dvh-4rem)] lg:flex lg:flex-col lg:overflow-hidden` พร้อมคอมเมนต์ carve-out HR7 แบบเดียวกับ `BuilderClient.tsx` บรรทัด ~278 (หัก padding บน+ล่างของ `(fullscreen)/layout.tsx`)
- <lg เลื่อนทั้งหน้า (ไม่ใช้ความสูงคงที่)
- workspace `lg:flex lg:min-h-0 lg:flex-1 lg:gap-7`
- คอลัมน์ `lg:min-h-0 lg:overflow-y-auto`
- **ห้ามใส่ padding ข้างให้ workspace** (Symmetric Gutter: layout ให้ `p-4 md:p-8` แล้ว)
- `DragDropContext` เดียวครอบคลัง+ผืนงาน (ต้องเป็น ancestor ร่วม)

**State**
- `useReducer` ก้อนเดียว (pure reducer แยกไฟล์ `lib/reducer.ts`)
  - `draft: TemplateV1`
  - `markupById: Record<id,string>` (ข้อความดิบที่ผู้ใช้พิมพ์)
  - `openId: string | null`
  - `previewKind`
  - `view: 'canvas'|'preview'` (มือถือ)
  - `saving`, `stale`, `profitConfirmed`
- `saved: { template, version }` เทียบ dirty ด้วย `JSON.stringify` (id คงที่หลังบันทึก)
- hook ทั้งหมดอยู่ก่อน JSX ไม่มี early return (read-only ใช้ JSX สลับ ตาม `feedback_hook_below_early_return`)
- ค่าที่ hook คืน (เช่น `useReducer`/`useRouter`) อย่าใส่ทั้งก้อนใน deps

### 3.2 Header + action bar (`TemplateActionBar`)

component เดียว render สองที่ ที่ `toolbarExtra` (≥lg) และ `belowContent` (<lg, `lg:hidden`) ใช้ props เดียวกันจาก `getPrimaryAction(state)` (pure, อยู่ใน `lib/primary-action.ts`)

- title = "จัดข้อความรายงาน", subtitle = ชื่อกลุ่ม (truncate), `backHref=/business/line-reports/${id}`, `isDirty`
- ปุ่มย้อน = `FullscreenBackButton` เดิม (มี Swal "ออกจากหน้านี้โดยไม่บันทึก?" ในตัว)
- `useUnsavedChangesGuard(isDirty)` import จาก builder (ครอบ `beforeunload` + popstate)
- **ไม่ส่ง `saveFormId`** ให้ `FullscreenPageHeader` (กันปุ่ม Save ซ้ำ)

**ลำดับปุ่มบนเดสก์ท็อป** (`seller-action-placement` §2: `⋯ → secondary → PRIMARY` primary ขวาสุดเสมอ):
`(chip ยังไม่บันทึก)` `[⋯]` `[ยกเลิกการแก้ — เฉพาะ dirty]` `[ส่งทดสอบ]` `[บันทึกเทมเพลต]`

| สถานะ | บันทึกเทมเพลต | ส่งทดสอบ |
|---|---|---|
| clean + แก้ได้ | `btn border-default-300 ... border` disabled (ตำแหน่งคงที่ ไม่กระโดด) | **primary** (`canTest` ตาม presenter; ปิดแล้วแสดง `testBlockedReason`) |
| dirty + valid | **primary** | outline disabled · `title` "บันทึกเทมเพลตก่อน จึงส่งทดสอบได้" |
| dirty + invalid | primary disabled · `aria-describedby` ชี้เหตุผลแรก | outline disabled |
| saving | primary disabled + `loader-2` animate-spin "กำลังบันทึก…" | disabled |
| stale (409) | disabled · เหตุ "มีการแก้จากที่อื่น โหลดฉบับล่าสุดก่อน" | disabled |
| อ่านอย่างเดียว (paused/บอทหลุด) | **ซ่อน** | disabled + `testBlockedReason` ของ presenter (ไม่ชวนบันทึก) |

**ไม่เคยมี primary สองปุ่มพร้อมกัน** — `getPrimaryAction()` คืน `primary: 'test'|'save'|'none'` ค่าเดียวและมีเทส

**chip "ยังไม่บันทึก"** (เดสก์ท็อป ≥lg เท่านั้น ข้างปุ่ม): `badge bg-warning/15 text-warning-ink` ข้อความ "ยังไม่บันทึก · บันทึกก่อนส่งทดสอบ" แสดงเฉพาะ dirty (ไม่มีบรรทัดตัวนับ "เหลือ 3 จาก 5 ครั้ง" ค้างตลอดตามกฎ audit ข้อ 9)

**บน <lg (แถว `belowContent`)**
- `[seg ผืนงาน|ตัวอย่าง flex-1] [⋯] [primary ช่องเดียว]`
- `md:hidden` เฉพาะ seg
- ที่ 768–1023 แถวนี้ยังอยู่ แต่ seg หาย

**เมนู `⋯`** (React-controlled ตาม `GroupMenu.tsx`: `useState` + click-outside + Esc) — เป็น action menu ไม่ใช่ field จึง HR6(b)
- รายการเดสก์ท็อป: "คืนเป็นแบบมาตรฐาน" (`refresh`)
  - disabled เมื่อ `template===null && !dirty`
  - sub-text "ใช้แบบมาตรฐานอยู่แล้ว"
- เพิ่มบน <lg:
  - "ส่งทดสอบ" (`send`) เมื่อ dirty = disabled พร้อม sub-text "บันทึกเทมเพลตก่อน"
  - "ยกเลิกการแก้" เมื่อ dirty
- รายการ `min-h-11`, destructive-ish อยู่ล่างสุดหลัง `dropdown-divider`
- ส่งทดสอบ: POST `/api/line-report/groups/${id}/test` เหมือน `sendTest` ใน `GroupDetailClient` + ผล `skipped[]` (ข้อ 6.4)

### 3.3 คลัง (`LibraryPanel`)

**แถวไม่มีกรอบ ไม่ห่อ `.card`** (audit กฎ 5, ไม่ซ้อนการ์ด) ที่ `lg:` = คอลัมน์ซ้าย · ที่ <lg = แถบชิปเลื่อนแนวนอน (ฉบับ markup สอง ชุดสลับด้วย `hidden lg:block` / `lg:hidden`, **ไม่ใช้ JS ตรวจ viewport**)

- หัวกลุ่ม `text-xs font-semibold text-default-700` (หัวข้อใช้งานจริง ไม่ใช่ eyebrow, ไม่ ALL CAPS), ห่างกลุ่ม 20px (`mt-5`) ภายในกลุ่มชิด

| กลุ่ม | รายการ | แหล่งตัดสินใช้ได้ |
|---|---|---|
| ข้อมูล | จำนวน{คำ} · ยอดขาย (นับแล้ว) และยังไม่นับ · ยกเลิก · รายร้าน · ยอดสะสมรอบนี้ · กำไร | `libraryAvailability(type, draft, ctx)` |
| กราฟ | แนวโน้ม 7 วันล่าสุด · เทียบรายร้าน | เดียวกัน |
| ข้อความของคุณ | ข้อความ (≤6) · เส้นคั่น (≤8) | เดียวกัน |

**ชื่อ `{คำ}`** ผันด้วย `orderWordFor(group.shops).word` (ตามที่ `GroupDetailClient` ทำ) ไม่ฮาร์ดโค้ด "ออเดอร์"

**แถว (lg)**: `[icon text-default-500] [ชื่อ text-sm, break-words] [＋ btn-icon min-h-11 min-w-11 rounded-full]`
- ลากได้ทั้งแถว (cursor-grab) ไม่มี grip แยก
- ＋ เป็นทางหลักเท่ากับการลาก: เรียก handler `addBlock(type)` ตัวเดียวกับ `onDragEnd`

**บล็อกที่ใส่แล้ว (ชนิดเดียว ≤1) = ซ่อนจากคลัง** (ต่างจาก EXT AC-11-3 ดู Impeccable compliance)

**เมื่อ `libraryAvailability` ให้ `ok:false` จากเงื่อนไขกลุ่ม → แสดงแถวแบบ disabled + เหตุผลใต้ชื่อ**
- `text-xs text-default-700` (ไม่ใช้ `text-default-400` ตก contrast)
- ไม่มีปุ่ม ＋ ไม่ draggable (`isDragDisabled`) · `aria-disabled="true"`
- เหตุผลจาก `REASON.*` ใน `availability.ts` (ไม่เขียนข้อความใหม่):
  - ยอดสะสมรอบ → "ใช้ได้เมื่อเปิดรายงานรายเดือน"
  - เทียบรายร้าน → "ใช้ได้เมื่อกลุ่มรวมมากกว่า 1 ร้าน"
- ข้อความ/เส้นคั่นครบเพดาน → "ใช้ครบ 6 บล็อกแล้ว" / "ใช้ครบ 8 บล็อกแล้ว"
- `BLOCKS_FULL` (ครบ 20): **ข้อความบรรทัดเดียวบนสุดของคลัง** "ครบ 20 บล็อกแล้ว เอาบล็อกออกก่อนจึงเพิ่มได้" แถวที่เหลือ disabled ไม่ซ้ำเหตุผลทุกแถว
- ขายดี 3 อันดับ ไม่ใช่รายการในคลัง (เป็นตัวเลือกในบล็อกรายร้าน ข้อ 3.4)
- กลุ่มว่างหมด → "ใส่ครบแล้ว"

**กำไรเข้าคลัง→ผืนงาน** (ลากหรือ ＋): เรียก `confirmProfitExposure()` ก่อนเสมอ ยกเลิก = ไม่ลง

### 3.4 ผืนงาน (`CanvasList` + `BlockRow`)

**ผืนงานเป็น "รายการเดียว"**: กรอบเดียว `rounded-lg border border-default-300` เส้นคั่นแถว `border-default-200` 1px · **ห้ามกรอบต่อบล็อก ห้ามห่อคอลัมน์ด้วย `.card`**

หัวคอลัมน์: ข้อความธรรมดา `text-sm font-semibold text-default-900` "ข้อความ" (ไม่ใช่ card-header)

**โครงลำดับในผืนงาน (บนลงล่าง)**
1. **แถวล็อก "หัวรายงาน"** (นอก Droppable) — ไอคอน `lock`, พื้น `bg-light`, ช่อง `ชื่อรายงาน` (`form-input`, ≤60, placeholder = ชื่อมาตรฐานจาก `titleOf`) · helper "ใช้เป็นชื่อของข้อความแรกในแต่ละรอบ · เว้นว่างเพื่อใช้ชื่อมาตรฐาน" · `title=` "ตรึงบนสุด · ต้องมีเสมอ เพื่อให้คนในกลุ่มรู้ว่าตัวเลขเป็นของช่วงไหน ณ เวลาใด"
2. **`Droppable id="canvas-blocks"`** — บล็อกใน `template.blocks` ทีละแถว (`index` ของ dnd = index ใน `blocks` ตรง ๆ)
3. **แถวล็อก "หมายเหตุอัตโนมัติ"** — sub "ระบบใส่ให้เมื่อมีร้านที่ไม่ถูกรวมหรือข้อมูลไม่ครบ · เอาออกไม่ได้" · `title=` "เอาออกไม่ได้ เพื่อไม่ให้ตัวเลขดูครบทั้งที่ไม่ครบ"
4. **แถว "ปุ่มเปิด Deep"** (ไม่อยู่ใน `blocks` แต่อยู่ใน `template.button`) — ลากไม่ได้ ไม่มี grip · closed: ``"เปิด Deep" · แสดง`` หรือ `ซ่อนอยู่` · เปิดแล้วเห็น `form-checkbox` "แสดงปุ่มนี้" + `form-input` ป้ายปุ่ม (≤20, ตัวนับ) + helper "ปุ่มนี้เปิดหน้า Deep ของคุณเสมอ แก้ได้เฉพาะข้อความบนปุ่ม"
5. **เกจความยาว** (ข้อ 3.6)

**แถวบล็อก (`BlockRow`)**

*แถวปิด (ค่าเริ่ม, สูง `min-h-12`):*
`[grip-vertical 44px, touch-none] [<button aria-expanded> ชื่อบล็อก + บรรทัดสรุป truncate+title] [chevron-down]`

*แถวเปิด:* เพิ่มปุ่ม `chevron-up` `chevron-down` `x` (เอาออก) ขนาด `min-h-11 min-w-11` ที่ขวา + เนื้อหา body ด้านล่าง

- **เปิดได้ทีละแถว** (`openId`) เปิดอันใหม่ = ปิดอันเดิม · เพิ่มบล็อกใหม่ = เปิดอันนั้นทันที + `scrollIntoView({block:'nearest'})`
- ปุ่มขึ้น/ลง/เอาออก **แสดงเฉพาะแถวเปิด** แต่ลากด้วย grip ได้ทุกแถวตลอดเวลา
- `aria-label` มีชื่อบล็อก: "ย้ายยอดขายขึ้น" "เอายอดขายออก"
- ปุ่มขึ้นของแถวแรก/ลงของแถวสุดท้าย `disabled`
- ลากที่ grip เท่านั้น (`dragHandleProps` ผูกที่ grip) กันแย่งการเลื่อนหน้าบนมือถือ

**บรรทัดสรุปแถวปิด (ค่าสถิตต่อชนิด, ห้ามคำนวณตัวเลขที่นี่ — HR16):**

| ชนิด | สรุป | ไอคอนนำ |
|---|---|---|
| orders | "จำนวน{คำ}รวมทุกร้าน" | `list-numbers` |
| sales | "ยอดนับแล้ว · ยังไม่นับ ติดกัน" | `cash` |
| cancelled | "ใบที่เปิดในช่วงนี้แล้วถูกยกเลิก" | `ban` |
| shops | "แยกรายร้าน" + `· ขายดี 3 อันดับ` / `· กำไรต่อร้าน` ตามตัวเลือกที่เปิด | `building-store` |
| cycle | "ยอดนับแล้วสะสมตั้งแต่วันตัดรอบ" | `history` |
| profit | "กำไรรวมทุกร้าน" | `coin` |
| text | markup แรก ~40 ตัวอักษร (โทเคนแสดงเป็น `{ป้าย}`) | `message-2` |
| separator | "เส้นคั่น" | `minus` |
| chart_trend | "7 วันล่าสุด · วัดจาก…" | `chart-line` |
| chart_compare | "เรียงร้านมาก→น้อย · วัดจาก…" | `chart-bar` |

**Warning บนแถว** (`blockWarning(b, ctx)` จาก `availability.ts`): แทนบรรทัดสรุปด้วย `alert-triangle` + `text-warning-ink` "ไม่ถูกส่งตอนนี้ (ใช้ได้เมื่อเปิดรายงานรายเดือน)" ไม่ลบเงียบ (FR-11-4)

**Body ต่อชนิด (แสดงเมื่อเปิดเท่านั้น)**

- **orders / sales / cancelled / cycle / separator**: ไม่มี body
- **profit**: แถบ `bg-warning/15 text-warning-ink` role=status "ทุกคนในกลุ่ม LINE จะเห็นตัวเลขกำไร รวมถึงคนที่ไม่ได้มีสิทธิ์ดูการเงินในร้าน" (ข้อความเดียวกับ `MetricsCard`)
- **shops**: `CheckRow` 2 ตัว (ใช้ `Rows.tsx` เดิม)
  - "ขายดี 3 อันดับต่อร้าน" — ปิดเมื่อ `top3Availability` ไม่ ok พร้อม `sub` เหตุผล
  - "กำไรต่อร้าน" — ติ๊กเปิดต้องผ่าน `confirmProfitExposure`
- **chart_trend / chart_compare**: seg `radiogroup` "วัดจาก" (ยอดขาย (นับแล้ว) | จำนวน{คำ}) ใช้ class SEG ของ `PreviewCard.tsx` + บรรทัดเดียว "~X KB · ถ้าข้อความยาวเกิน ระบบตัดกราฟก่อนตัวเลขหลัก" (ตัวเลข KB โผล่เฉพาะที่นี่)
- **text** — ดูข้อ 3.5

**Drag & drop** — ข้อ 4

**สถานะลาก**: แถวที่ลาก `border-primary shadow-lg` + `bg-primary/5` (ตาม `CanvasFrame.tsx`) · Droppable เมื่อ `isDraggingOver` `bg-primary/5` (ไม่ใช้แถบสีซ้าย)

**ผืนงานว่าง (`blocks=[]` หรือไม่มีตัวเลขเลย)**: ตรงกลางโซน Droppable ข้อความ `text-default-700 text-sm` "ยังไม่มีข้อมูลในข้อความ เพิ่มอย่างน้อย 1 รายการจากคลัง" (<lg: "…จากแถบด้านบน") + `METRIC_REQUIRED_HELPER` เมื่อ `deriveFlags` ทั้ง 5 เป็น false

### 3.5 บล็อกข้อความอิสระ (body ของ `text`)

```
┌ ข้อความ ──────────────────────────────── ⌃ ⌄ ✕ ┐
│ [textarea form-textarea rows=3 ………………………]     │
│ เหลือ 38                [+ ข้อมูล] [จัดรูปแบบ]    │  ปุ่มสองตัว aria-expanded
│ (เมื่อกด + ข้อมูล)  ชิปโทเคน 10 ตัว (inline)       │
│ (เมื่อกด จัดรูปแบบ) ทั้งบรรทัด: [หนา] [เล็ก|ปกติ|ใหญ่] [ปกติ|รอง|เน้น] │
│                     คำที่เลือก:  [หนา] [เน้นสี]    │
└──────────────────────────────────────────────────┘
```

- **ช่องพิมพ์** = `form-textarea` ธรรมดา (**ไม่ contentEditable**) · โทเคนแสดงเป็น `{ป้าย}` ตัวอักษรธรรมดา ห้ามใส่ `maxLength` (กันตัดกลางการพิมพ์ IME ไทย) ตัวนับ "เหลือ N ตัวอักษร" วัดด้วย `authoredLength` ใน `template.ts`
- **ซ่อนชิปและแถบจัดรูปแบบจนกด** (audit กฎ 3) เปิดทีละตัว ค่าเริ่ม = ช่องพิมพ์ + นับ + ปุ่มสองตัว
- **ชิปโทเคน** = `<button>` ใช้ class `bg-primary/10 text-primary rounded-full text-sm font-medium` เหมือน chip เวลาใน `ScheduleCard.tsx` · `min-h-11 lg:min-h-8` · แทรกที่เคอร์เซอร์ผ่านฟังก์ชัน pure `insertAtSelection(src, start, end, label)` · เดสก์ท็อปลากชิปไปวางบน textarea ได้ด้วย HTML5 drag native (`draggable`, `dataTransfer.setData('text/plain', label)`) — ไม่พึ่งการลากบนมือถือ
  - `{ยอดสะสมรอบ}` disabled + `title` เมื่อ `!monthlyEnabled` (เหตุ `REASON.CYCLE_NEEDS_MONTHLY`)
  - `{กำไร}` กดแล้วเรียก `confirmProfitExposure()` ก่อนแทรก
- **จัดรูปแบบ — ทั้งบรรทัด**
  - "หนา" = ปุ่ม `aria-pressed` (ไม่ใช้ icon ไม่เดาชื่อ) pressed = `bg-primary/15 text-primary-ink`
  - ขนาด 3 ช่อง seg · สี 3 ช่อง seg
  - swatch เป็น dot `size-3 rounded-full` (ink=`bg-default-900`, รอง=`bg-default-700`, เน้น=`bg-primary`) ก่อนป้าย
  - **ไม่มีเขียว/แดง/ขีดเส้นใต้/ลิงก์/ตัวเอียง/emoji picker**
  - tooltip ขนาด "ใหญ่" = "ใหญ่ = เท่าหัวรายงาน ใหญ่กว่านี้ไม่ได้ เพื่อให้ยอดขายยังเด่นที่สุด"
  - ใต้ seg สี helper บรรทัดเดียว (ไม่ซ้ำทุกบล็อก ใส่ที่ `title` ของ seg + ย่อหน้าท้ายแถบจัดรูปแบบหนึ่งบรรทัด): "ไม่มีสีเขียวและแดง เพราะในรายงานนี้เขียวหมายถึงยืนยันแล้ว แดงหมายถึงดึงข้อมูลไม่สำเร็จ"
  - สี "รอง" ติดป้าย "(ค่อนข้างจาง)" ตามสเปกเดิม
- **จัดรูปแบบ — คำที่เลือก**: "หนา" / "เน้นสี" ห่อ selection ด้วย `**…**` / `^^…^^` ผ่าน `wrapSelection(src, start, end, marker)` (pure, อยู่ใน `lib/markup-edit.ts`) · selection ว่าง → `pacesToast.info('เลือกคำในช่องพิมพ์ก่อน แล้วค่อยกด')`
- **การตรวจ**
  - parse ด้วย `parseMarkup` ทุกครั้งที่พิมพ์ · ok → อัปเดต `runs` · ไม่ ok → เก็บ runs ล่าสุดที่ถูกไว้ให้พรีวิว, textarea `is-invalid`, ข้อความจาก `parseMarkup().message` ใต้ช่อง (`text-danger-ink text-xs`) และ**ปุ่มบันทึกปิด**
  - **แสดง error เมื่อ blur หรือกดบันทึกเท่านั้น** (บล็อกที่เพิ่งเพิ่มและยังว่างไม่แดงทันที — แสดงแค่ hint "พิมพ์ข้อความก่อนบันทึก")
  - helper ใต้ช่องเมื่อมีโทเคน `cycle_sales`/`profit` ในข้อความ: "ถ้าคำนวณไม่ได้ในรอบนั้น บรรทัดนี้จะไม่ถูกส่ง และบันทึกในประวัติ"
  - ข้อความที่ใช้ `{ยอดสะสมรอบ}` ตอนปิดรายเดือน → warning บนแถว (`blockWarning` ไม่ครอบข้อความ → ใช้ `usedTokens` เทียบ `monthlyEnabled` ที่ฝั่ง UI ด้วย `contextAvailability('cycle', ctx)`)
  - `{กำไร}` ที่พิมพ์เองด้วยมือโดยยังไม่ยืนยัน: แถบ inline บนบล็อก "ตัวแปร {กำไร} ใช้ได้หลังเปิดแสดงกำไรแล้ว" + ปุ่ม "เปิดและยืนยัน" (เรียก Swal เดิม) · ปุ่มบันทึกปิดจนกว่าจะยืนยันหรือเอาโทเคนออก
- **ปุ่มช่วยเลือกตำแหน่ง**: ใช้ `ref` ของ textarea อ่าน `selectionStart/End` ตอนกดปุ่ม ไม่เก็บ selection ใน state (กัน re-render วน)

### 3.6 เกจความยาว (`SizeGauge`)

- บรรทัดเดียว: "ความยาวข้อความ" + แถบ + `62%` (`tabular-nums`)
- แถบ = `bg-default-100 h-1.5 w-full overflow-hidden rounded` + `role="meter"` (เหมือน `role="progressbar"` ใน `QuotaUsageCard.tsx`) พร้อม `aria-valuenow/min/max` + `aria-label="ความยาวข้อความ"` · ความกว้างไส้ใน `style={{width}}` ค่าตามข้อมูล (precedent `QuotaUsageCard.tsx` บรรทัด 85–88) ต้องมีคอมเมนต์กำกับ
- สถานะจากฟังก์ชัน pure `gaugeState(bytes)` (ไม่ฝังใน JSX — `ui-boolean-needs-a-testable-home`)
  - ปกติ ≤80%: ไส้ `bg-default-400` (neutral ไม่ใช่ primary, ไม่ใช่เขียว)
  - >80%: ไส้ `bg-warning` + บรรทัดใต้ "ใกล้เต็มที่ LINE รับได้ ถ้าเกิน ระบบจะตัดขายดี 3 อันดับก่อน" (มีกราฟ → "ขายดี 3 อันดับ → กราฟ → ย่อรายร้าน")
  - >100%: ไส้ `bg-danger` + "ข้อความยาวเกินที่ LINE รับได้ ลดข้อความหรือเอาบล็อกออก แล้วบันทึกอีกครั้ง" · ปุ่มบันทึกปิด
- วัดด้วย `measureTemplate()` ตัวเดียวกับ server (ระดับ 3, fixture กรณีเลวร้ายสุด, ไบต์ UTF-8 ของทั้ง message) — เรียกใน `useMemo` ที่ deps = `draft` เท่านั้น ห้ามให้ผลวัดเปลี่ยน `draft` (`measurement-must-not-decide`)

### 3.7 พรีวิว (`PreviewPanel`)

- หัวคอลัมน์ข้อความธรรมดา "ตัวอย่างในกลุ่ม LINE" + seg `radiogroup` รายวัน | รายเดือน (class SEG เดียวกับ `PreviewCard.tsx`; `previewState()` ปิดรายเดือนเมื่อ `monthlyEnabled=false`) — **ย้ายจากหัว "ข้อความ" ใน mockup มาอยู่ที่หัวพรีวิว** เพราะมันเปลี่ยนเฉพาะพรีวิว
- พื้น `bg-light rounded-lg p-4` ( `FlexBubbleView` เดิมมี `bg-light mb-0 rounded-lg p-3` อยู่แล้ว — ปรับ padding เป็น `p-4` ผ่าน prop/wrapper)
- ผลิตจาก `buildSummaryReportFlex` **ตัวเดียวกับที่ส่งจริง** ด้วย `template: draft` (กรองบล็อกข้อความที่ markup ผิด/ว่างออกก่อนส่งเข้า composer กัน throw) + ข้อมูลจาก `preview-sample.ts`
- **ข้อมูลตัวอย่าง = กรณียาวสุดจริง** (AC-EXT-11-10): ชื่อร้านแรก 50 ตัวอักษร · ฿18,902,340 · ร้านที่ 0 ใบ · ร้านล็อก + ร้านล้ม **โดยโครงสร้างกลุ่ม (จำนวนร้าน, vertical, สถานะ) ตามกลุ่มจริง** เพื่อให้คำ {คำ} และ availability ของพรีวิวตรงกับกลุ่มนี้ (ต่างจาก AC ที่เขียน "ผสม vertical" ดู Open Q5)
- caption ถาวร (บรรทัดเดียว): "ตัวอย่างด้วยชื่อร้านยาวและยอดหลักล้าน · การตัดบรรทัดในกลุ่มอาจต่างเล็กน้อย" ใช้ prop `caption` ของ `FlexBubbleView`
- เมื่อ composer ข้ามบล็อก (`diagnostics.dropped/skipped`): ไม่แสดงรายการแยกในพรีวิว — เหตุผลอยู่ที่ warning บนแถวผืนงานแล้ว
- **ไฮไลต์ข้ามคอลัมน์ (ไม่บังคับ, ต้องการ `sectionMap` จาก composer — Open Q2)**: ถ้ามี `sectionMap` ส่วนที่ตรงกับแถวที่เปิด/ชี้ได้ `bg-primary/5` + ขอบ 1px `border-primary` (ห้ามแถบสีซ้าย 3px) ถ้าไม่มีก็ไม่ทำ ไม่กระทบ AC ใด
- **mini bubble ในการ์ดหน้าตั้งค่า**: ไม่ใส่ highlight / ไม่ใส่ seg ซ้ำหากไม่จำเป็น — ใช้ seg เดียวกัน (เป็นการเปลี่ยน kind ของพรีวิว)

---

## 4. DnD — ไลบรารีและ pattern

**ไลบรารี:** `@hello-pangea/dnd` ^18.0.1 (`package.json` บรรทัด 41, ติดตั้งแล้ว) — **ไม่ใช้** `react-sortablejs` (ไม่ต้องข้ามคอลัมน์จึงไม่จำเป็น และ AC-EXT-11-2 สั่ง `@hello-pangea/dnd` + pattern `public-profile/builder`)

**ไฟล์ตัวอย่างที่ต้องดู/คัดลอก pattern**
- `src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/BuilderClient.tsx` — `DragDropContext` เดียว + `handleDragEnd` แยก source/destination
- `.../CanvasFrame.tsx` — `Droppable` ปลายทาง + `Draggable` ต่อบล็อก + `dragHandleProps` ผูกปุ่มจับ
- `.../LibraryPanel.tsx` — `Droppable ... isDropDisabled` เป็นต้นทาง + ปุ่ม ＋ คู่กับการลาก
- `.../lib/draft.ts` — `moveArrayItem` (ปุ่มขึ้น/ลง) และ `moveToIndex` (ผล drag) **ใช้ตัวเดียวกันทั้งสองทาง** ไม่เขียนสลับตำแหน่งใหม่
- theme ต้นแบบ: `theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx`

**Droppable ids:** `library-blocks` (`isDropDisabled`, เฉพาะ markup `lg:`) · `canvas-blocks`
**`draggableId`:** คลัง `lib-<type>` · ผืนงาน = `block.id`

**`onDragEnd`**
- `source=canvas` → `destination=canvas`: `moveToIndex` (ไม่ย้ายถ้า index เท่าเดิม)
- `source=library` → `destination=canvas`: `addBlock(type, destination.index)` ผ่าน handler เดียวกับ ＋ (profit → `confirmProfitExposure` ก่อน)
- ปล่อยนอกพื้นที่/กลับคลัง: ไม่ทำอะไร

**ทางเลือกคีย์บอร์ด / ไม่ลาก** (บังคับทุกที่)
- **คีย์บอร์ดของไลบรารี:** Space ยก · ลูกศรย้าย · Space วาง · Esc ยกเลิก (ฟรีจาก `@hello-pangea/dnd`)
- **ประกาศ a11y ภาษาไทย** ผ่าน responder `onDragStart/onDragUpdate/onDragEnd` + `provided.announce(...)`:
  - "ยกยอดขายแล้ว ตำแหน่งที่ 3 จาก 7"
  - "ย้ายยอดขายไปตำแหน่งที่ 2"
  - "วางยอดขายที่ตำแหน่งที่ 2" / "ยกเลิกการย้าย"
  - ตั้ง `dragHandleUsageInstructions` เป็นไทย: "กด Space เพื่อยก ใช้ลูกศรเพื่อย้าย กด Space อีกครั้งเพื่อวาง กด Esc เพื่อยกเลิก"
- **ปุ่มขึ้น/ลง** ≥44px ในแถวที่เปิด · **ปุ่ม ＋** ในคลังต่อท้าย
- เพิ่ม/ลบ/ย้ายประกาศผ่าน `aria-live="polite"` region (sr-only) เดียวของหน้า — **ไม่ toast ตอนเพิ่ม** (ตัดสินใจ ข้อ 8)
- บนมือถือ/แท็บเล็ต (<lg): คลังเป็นแถบเลื่อน ไม่มีการลากจากแถบ (ลากกับเลื่อนชนกัน) แตะ ＋ เท่านั้น · สลับลำดับลากที่ grip เท่านั้น

---

## 5. Theme Source Mapping

> ฐาน theme: `theme/paces/Admin/TS/src/app/(admin)/…` · "ในรีโป" = ไฟล์ที่ผ่าน theme-copy แล้ว ใช้เป็นแม่แบบ/นำกลับมาใช้

| Section | ไฟล์ที่ต้อง copy / ใช้ซ้ำ | Component | หมายเหตุ adapt |
|---|---|---|---|
| Route shell fullscreen | ในรีโป `src/app/(paces)/seller/(fullscreen)/layout.tsx` + `_shared/FullscreenPageHeader.tsx` + `_shared/FullscreenBackButton.tsx` · theme `apps/ecommerce/(products)/product-add/page.tsx` | header sticky + back | ไม่ส่ง `saveFormId`; ใช้ `toolbarExtra` (≥lg) + `belowContent` (<lg) |
| Orchestrator + shell ความสูง + guard | ในรีโป `(fullscreen)/public-profile/builder/components/BuilderClient.tsx` · `.../hooks/useUnsavedChangesGuard.ts` · theme `apps/crm/pipeline/components/Board.tsx` | `DragDropContext` + form shell | เปลี่ยน `xl:` เป็น `lg:`; คอมเมนต์ carve-out HR7 ของ `h-[calc(100dvh-4rem)]` |
| คลัง | ในรีโป `.../builder/components/LibraryPanel.tsx` · theme `plugins/sortable/components/SortableWithIconAndLabels.tsx` (โครงแถว) | `Droppable isDropDisabled` + ปุ่ม ＋ | ตัดการ์ดห่อ (`.card`) ทิ้ง ใช้แถวไม่มีกรอบ; ชิปแนวนอนสำหรับ <lg |
| ผืนงาน + แถวบล็อก + reorder | ในรีโป `.../builder/components/CanvasFrame.tsx` · `.../builder/lib/draft.ts` (`moveArrayItem`, `moveToIndex`) · theme `plugins/sortable/components/NestedListWithHandle.tsx` (handle) | `Droppable` + `Draggable` | ต่างจาก CanvasFrame: ปุ่มย้าย/เอาออกแสดงเฉพาะแถวเปิด; ไม่มีป้ายชื่อบล็อกมุมซ้ายบน |
| เมนู `⋯` | ในรีโป `_components/detail/GroupMenu.tsx` · theme `ui/dropdowns/page.tsx` (`.dropdown-item`) | React-controlled action menu | **HR6(b) action-menu ไม่ใช่ form-select**; หน้านี้**ไม่มี dropdown/select ที่ผูกค่า** (ใช้ seg + checkbox ทั้งหมด จึงไม่ใช้ `InputTextfieldType.tsx` ในฐานะ select) |
| Action bar | ในรีโป `_components/detail/DetailActionBar.tsx` · `docs/conventions/seller-action-placement.md` · theme `ui/buttons/page.tsx` | ปุ่ม `btn` | คลาสที่ยืนยัน: `btn bg-primary text-white hover:bg-primary-hover` (primary), `btn border-default-300 text-default-700 hover:bg-default-100 border` (outline/secondary) — **ห้าม** `btn-primary`/`btn-soft-*`/`.btn-group`/`btn-sm`(เตี้ย 30px) |
| ช่องพิมพ์ + ฟิลด์ | theme `form/elements/components/InputTextfieldType.tsx` (`form-input`, `form-textarea`) | textarea/input | `is-invalid` สำหรับ error; **ห้ามตั้ง `w-*`/`h-*` ทับ `.form-input`** (unlayered CSS ชนะ utility) |
| checkbox/switch ในบล็อก | theme `form/elements/components/ChecksRadioSwitches.tsx` · ในรีโป `_components/detail/Rows.tsx` (`CheckRow`/`SwitchRow`) | `form-checkbox` | ใช้ `CheckRow` ตรง ๆ (label ครอบทั้งแถว `min-h-11`) |
| seg ("วัดจาก", ขนาด, สี, รายวัน/รายเดือน) | ในรีโป `_components/detail/PreviewCard.tsx` (`SEG`, `role="radiogroup"`) | seg | ไม่ใช้ `.btn-group` |
| ปุ่ม toggle ตัวหนา | theme `ui/buttons/page.tsx` + `aria-pressed` | `btn` ป้ายตัวหนังสือ | **ไม่พบ theme match สำหรับ rich-text toolbar — closest primitive = `ui/buttons` + seg**; ไม่ใช้ icon (ไม่เดาชื่อ) |
| ชิปโทเคน | theme `ui/badges/page.tsx` · ในรีโป chip เวลาใน `ScheduleCard.tsx` (`bg-primary/10 text-primary rounded-full`) | badge ที่เป็นปุ่ม | `<button>` + `min-h-11 lg:min-h-8` |
| เกจความยาว | theme `ui/progress/page.tsx` · ในรีโป `business/components/QuotaUsageCard.tsx` (บรรทัด 78–89) | progress bar | `role="meter"`; ไส้เป็น `bg-default-400` ปกติ / `bg-warning` / `bg-danger`; `style={{width}}` มีคอมเมนต์ |
| พรีวิว | ในรีโป `_components/FlexBubbleView.tsx` · `_components/detail/PreviewCard.tsx` · `lib/line-report/flex-preview-tokens.ts` | พรีวิว Flex | **ไม่พบ theme match สำหรับ renderer Flex — closest = `ui/cards/page.tsx`**; ต้องเพิ่มรองรับ `span`+กราฟ (T11d); ความสูง/ความกว้างแท่งเป็น `style` ตามข้อมูล + คอมเมนต์ carve-out |
| แบนเนอร์ (แพ็กเกจหยุด/บอทหลุด/stale) | ในรีโป `_components/detail/GroupBanner.tsx` + `presenter.bannerFor` · theme `ui/alerts/page.tsx` | alert | stale = markup `bg-warning/15 text-warning-ink rounded-lg px-3 py-2 text-sm` + `role="alert"` (แบบ `MetricsCard.tsx` บรรทัด 73) |
| Confirm / blocking | theme `plugins/sweet-alerts/components/SweetAlerts.tsx` ผ่าน `src/lib/paces-swal.ts` | `pacesConfirm.warning`, `pacesConfirmAsync` | HR8 — ข้อ 6 |
| Toast | `src/lib/paces-toast.ts` · theme `ui/notifications/page.tsx` (บรรทัด ~135 toast มีปุ่ม) | `pacesToast.*` | HR9; ต้องขยาย `action` (Open Q1) |
| การ์ดหน้าตั้งค่า | theme `ui/cards/page.tsx` · ในรีโป `PreviewCard.tsx` (โครง card + seg) · `MetricsCard.tsx` (ที่ถูกแทน) | `.card` | card-header เส้นประตามเดิม (Dashed Card-Header Rule) |
| ประวัติ — บรรทัด "ข้าม …" | ในรีโป `_components/detail/HistoryCard.tsx` (ตาราง + แถวมือถือ) | ต่อยอดคอลัมน์ "สาเหตุ" | ต่อท้าย `reasonLabel` ด้วยข้อความ "ข้าม: …" จาก `summary` (FR-12-4) |
| Pure logic (โฮมของ boolean) | ใหม่ใน `template/lib/`: `primary-action.ts` · `reducer.ts` · `gauge-state.ts` · `markup-edit.ts` (`insertAtSelection`, `wrapSelection`) · `confirm-profit.ts` (`confirmProfitExposure`) | pure + เทส | ใช้ `availability.ts`, `settings-guards.ts` (`METRIC_*`, `isLastMetric`) เดิม |

**บรรทัด `Base:` สำหรับ commit**
```
Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/BuilderClient.tsx
Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/LibraryPanel.tsx
Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/CanvasFrame.tsx
Base: src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sortable/components/SortableWithIconAndLabels.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
```
(การ์ดอย่างเดียว ใช้เฉพาะ `ui/cards/page.tsx` + `PreviewCard.tsx`)

### Icon (tabler ผ่าน `@/components/wrappers/Icon` — ชื่อเปล่า = tabler)

ทุกชื่อมีการใช้จริงใน `src/` และ/หรือ `theme/paces/.../src` (gallery `icons/tabler/page.tsx` โหลดแบบ dynamic grep ไม่ได้ จึงยืนยันด้วยตัวอย่างใช้งาน):

`grip-vertical` · `chevron-up` · `chevron-down` · `chevron-left` · `dots-vertical` · `plus` · `x` · `lock` · `alert-triangle` · `info-circle` · `send` · `device-floppy` · `loader-2` · `refresh` (ใช้เป็น `tabler:refresh` ใน iship) · `arrow-back-up` (theme `widgets/statistics` + `CustomerPanel`) · `list-numbers` · `cash` · `ban` · `building-store` · `history` · `coin` · `message-2` · `minus` · `chart-line` · `chart-bar` (theme `dashboard/analytics`) · `circle-check` · `external-link` · `brand-line` · `arrow-left` (ปุ่มกลับเดิม)

ไม่ใช้ emoji (HR12) · ไม่มี icon ตัวใหม่ที่ไม่ผ่านการยืนยัน (ปุ่มตัวหนาใช้ตัวหนังสือ)

### Class ที่ใช้ได้จริง / ห้าม (HR7)

- **ใช้:** `btn` · `btn-icon` · `bg-primary/10|/15` · `text-primary-ink` · `bg-warning/15 text-warning-ink` · `bg-info/15 text-info-ink` · `bg-light` · `bg-default-100` · `border-default-200/300` · `rounded-lg` · `size-3|11` · `gap-7` · `grid-cols-12 col-span-3|5|4|7` · `min-h-11 lg:min-h-0` · `touch-none` · `tabular-nums` · `form-input|textarea|checkbox|switch` · `is-invalid`
- **ไม่ใช้:** `btn-primary` · `btn-soft-*` · `.btn-group` · `btn-sm` · `font-mono` · `text-[..]` · hex · `bg-[...]` · `rounded-[..]` · `#7367F0`
- **carve-out ที่ต้องมีคอมเมนต์บรรทัดเดียวกัน (3 จุด):**
  1. `lg:h-[calc(100dvh-4rem)]` ของ shell (คัดลอกถ้อยคำจาก `BuilderClient.tsx`)
  2. `style={{width}}` ของเกจ (precedent `QuotaUsageCard.tsx`)
  3. `style` ความสูง/ความกว้างแท่งกราฟในพรีวิว (ค่าตามข้อมูล ไม่ใช่ design token)

---

## 6. User flow

### 6.1 เข้าหน้า
กด "จัดข้อความ" ในการ์ด → หน้าเต็มจอ แสดง `effectiveTemplate` (แบบมาตรฐานที่สร้างจากเลย์เอาต์เดิมเมื่อ `template=null`) **เป็นเทมเพลตจริงที่แก้ได้ ไม่ใช่หน้าว่าง** · ไม่ dirty · ส่งทดสอบเป็น primary

### 6.2 เพิ่ม/ย้าย/เอาออก
- **เพิ่ม:** ลากจากคลัง (≥lg) หรือกด ＋ → ต่อท้าย (≥lg ลากวางตรงตำแหน่งได้) → แถวเปิดทันที · dirty
- **ย้าย:** ลาก grip หรือกดขึ้น/ลงในแถวที่เปิด
- **เอาออก:** กด ✕ ในแถวเปิด → **ไม่มี Swal** → บล็อกกลับคลัง → `pacesToast` "เอาออกแล้ว: ยอดขาย" + ปุ่ม "ย้อนกลับ" (วางกลับที่ index เดิม) → ถ้ายังไม่ย้อนกลับ ยังเพิ่มใหม่ได้จากคลัง

### 6.3 เปิดกำไร (3 ทางเข้า ใช้ `confirmProfitExposure(prevDerived, nextDerived, alreadyConfirmed)` ตัวเดียว)
1. ลาก/＋ บล็อกกำไร
2. ติ๊ก "กำไรต่อร้าน"
3. แทรกโทเคน `{กำไร}` จากชิป

→ ถ้า `showProfit` จะเปลี่ยน false→true ในเทมเพลตนี้ และยังไม่ยืนยันในเซสชันหน้านี้ → Swal ก่อน · ยืนยัน = ลง + `profitConfirmed=true` · ยกเลิก = ไม่ลง
ถ้าพิมพ์ `{กำไร}` เอง ใช้แถบ inline (ข้อ 3.5) · ตอนบันทึกส่ง `confirmProfit: true` เมื่อ `profitConfirmed`
เมื่อเทมเพลตมีกำไรอยู่ (บันทึกแล้วหรือฉบับร่าง): แถบเตือนถาวรในบล็อกกำไร (ข้อ 3.4) + รายการในพรีวิว

### 6.4 ส่งทดสอบ
POST `/test` ใช้เทมเพลตที่**บันทึกแล้ว** · ผล:
- สำเร็จ → `pacesToast.success('ส่งตัวอย่างเข้ากลุ่มแล้ว ดูได้ในกลุ่ม LINE')`
- ถ้า `skipped.length>0` ต่อด้วย `pacesToast.warning('ส่งแล้ว แต่ข้าม {กำไร} (ร้านในกลุ่มคิดกำไรคนละกติกา) ดูเหตุผลในประวัติของกลุ่ม', { duration: 8000 })` (หลายรายการ → "ข้าม N รายการ ดูเหตุผลในประวัติของกลุ่ม")
- ผิดพลาดตาม `res.ok`/`data.message` ตามที่ `sendTest` เดิมทำ · `BOT_NOT_IN_GROUP`/`PACKAGE_REQUIRED` → `router.refresh()`
- ใช้ `Server-Timing`/ผลนับโควตาตามเดิม ไม่ซ้ำตรรกะ

### 6.5 บันทึก
กด "บันทึกเทมเพลต" → `PUT …/template` `{ template, expectedVersion, confirmProfit? }` → สำเร็จ: `dirty=false`, `saved`/`version` อัปเดต, `pacesToast.info('บันทึกแล้ว รายงานรอบถัดไปจะใช้แบบนี้')` (neutral ไม่ใช่เขียว) · ถ้า response มี `warnings` (`MAY_TRIM_CHARTS`) ไปแสดงที่เกจ (ข้อ 3.6) ไม่ใช่ toast ซ้ำ
ล้ม: `pacesToast.error('บันทึกเทมเพลตไม่สำเร็จ ข้อความที่แก้ยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง')` · ฉบับร่างค้างไม่ revert

| error | พฤติกรรม |
|---|---|
| `TEMPLATE_INVALID` + `rule` + `blockId` | เปิดแถวนั้น + แสดง error ใต้ฟิลด์ (ใช้ `validateTemplate` ฝั่ง client จับก่อนแล้ว นี่คือตาข่ายชั้นสอง) |
| `TEMPLATE_TOO_LARGE` | เกจ >100% + ข้อความ "ข้อความยาวเกินที่ LINE รับได้ ลดข้อความหรือเอาบล็อกออก แล้วบันทึกอีกครั้ง" |
| `INVALID_SETTINGS:METRIC_REQUIRED` | `METRIC_REQUIRED_HELPER` ใต้เกจ |
| `PROFIT_CONFIRM_REQUIRED` | เรียกยืนยันกำไรซ้ำแล้วลองบันทึกอีกครั้ง |
| `PACKAGE_REQUIRED` | `router.refresh()` → หน้ากลายเป็นอ่านอย่างเดียว |
| `TEMPLATE_STALE` (409) | ดูข้อ 6.6 |

### 6.6 Stale (สองแท็บ/สองเครื่อง, E-14)
แถบ `role="alert"` สีเตือนเหนือกริด: "มีการแก้เทมเพลตของกลุ่มนี้จากที่อื่น ฉบับร่างของคุณยังอยู่ในหน้านี้" + ปุ่ม "โหลดฉบับล่าสุด" → Swal `pacesConfirm.warning('ทิ้งฉบับร่างและโหลดฉบับล่าสุด?', 'การแก้ในหน้านี้จะหาย และใช้เทมเพลตที่บันทึกจากที่อื่นแทน', { confirmButtonText: 'โหลดฉบับล่าสุด', cancelButtonText: 'อยู่ต่อ' })` · บันทึก/ส่งทดสอบ disabled จนกว่าจะโหลดใหม่ **ไม่ทิ้งฉบับร่างเงียบ ๆ**

### 6.7 คืนเป็นแบบมาตรฐาน (`⋯`)
`pacesConfirmAsync`: title "คืนเป็นแบบมาตรฐาน?" · text "บล็อกและข้อความที่คุณจัดไว้จะถูกแทนที่ด้วยแบบมาตรฐาน ข้อความที่ส่งเข้ากลุ่มไปแล้วไม่เปลี่ยน" · ปุ่ม "คืนเป็นแบบมาตรฐาน" / "ปิด" · `run` = `DELETE …/template` · `errorText` "คืนเป็นแบบมาตรฐานไม่สำเร็จ ลองอีกครั้ง" (เหมาะกับรอบ 0.5–2 วิ — มีสปินเนอร์บนปุ่มและกันกดซ้ำในตัว) → สำเร็จ: โหลดค่ามาตรฐาน, `dirty=false`, `pacesToast.info('คืนเป็นแบบมาตรฐานแล้ว')`

### 6.8 ออกจากหน้า
dirty + (ปุ่มย้อน) → Swal จาก `FullscreenBackButton` เดิม · ปิดแท็บ/รีเฟรช → `beforeunload` · ย้อนด้วยปุ่มเบราว์เซอร์ → `useUnsavedChangesGuard` ดันกลับ + `pacesToast.info` บอกทาง

---

## 7. Content outline (ภาษาไทย)

**คำศัพท์เดียวทั้งหน้า:** "บล็อก" = หน่วยหนึ่งในข้อความ · "ตัวแปร" = ข้อมูลในประโยค `{…}` · "เทมเพลต" = ชุดบล็อกทั้งก้อนของกลุ่ม · **"ผืนงาน" ไม่ใช้ในข้อความที่ผู้ใช้เห็น** (ใช้ "ข้อความ" เป็นชื่อคอลัมน์ ตามสเปกเดิมที่ใช้ "ผืนงาน" เป็นศัพท์ภายใน) · ห้ามคำว่า "ออเดอร์" ใช้ {คำ} ผันตามประเภทร้านหรือ "รายการ"

**หัวและปุ่ม**
- title: "จัดข้อความรายงาน" · คอลัมน์: "ข้อมูล" / "กราฟ" / "ข้อความของคุณ" (กลุ่มคลัง), "ข้อความ", "ตัวอย่างในกลุ่ม LINE"
- ปุ่ม: "บันทึกเทมเพลต" · "ส่งทดสอบ" · "ยกเลิกการแก้" · "คืนเป็นแบบมาตรฐาน" · "เพิ่มข้อความ" · "เพิ่มเส้นคั่น" · "+ ข้อมูล" · "จัดรูปแบบ" · "เอาออก" · "ย้ายขึ้น" · "ย้ายลง" · "โหลดฉบับล่าสุด" · "เปิดและยืนยัน"
- กำลังบันทึก: "กำลังบันทึก…"
- chip สถานะ (เดสก์ท็อป): "ยังไม่บันทึก · บันทึกก่อนส่งทดสอบ"

**ชื่อบล็อกในคลัง:** จำนวน{คำ} · ยอดขาย (นับแล้ว) และยังไม่นับ · ยกเลิก · รายร้าน · ยอดสะสมรอบนี้ · กำไร · แนวโน้ม 7 วันล่าสุด · เทียบรายร้าน · ข้อความ · เส้นคั่น (ใน `ข้อความของคุณ`: "ข้อความ" ใช้ปุ่ม "เพิ่มข้อความ" บนมือถือเป็น `aria-label`)

**ตัวเลือกในบล็อก:** "ขายดี 3 อันดับต่อร้าน" · "กำไรต่อร้าน" · "แสดงปุ่มนี้" · ป้าย "ป้ายปุ่ม" · "วัดจาก" → "ยอดขาย (นับแล้ว)" / "จำนวน{คำ}"

**Placeholder / helper**
- ข้อความ: "พิมพ์ข้อความถึงทีม เช่น สรุปยอดของ {ชื่อร้าน} วันนี้" · ตัวนับ "เหลือ 38 ตัวอักษร" (ล้น → "เกิน 4 ตัวอักษร" `text-danger-ink`)
- ชื่อรายงาน: placeholder = ชื่อมาตรฐาน · helper "ใช้เป็นชื่อของข้อความแรกในแต่ละรอบ · เว้นว่างเพื่อใช้ชื่อมาตรฐาน"
- ป้ายปุ่ม: "ปุ่มนี้เปิดหน้า Deep ของคุณเสมอ แก้ได้เฉพาะข้อความบนปุ่ม"
- ว่าง: "พิมพ์ข้อความก่อนบันทึก"

**Error / เหตุผลที่ใช้ไม่ได้ (บอกทางออก)**
- ผืนงานไม่มีตัวเลข: "ยังไม่มีข้อมูลในข้อความ เพิ่มอย่างน้อย 1 รายการ" + `ต้องแสดงตัวเลขอย่างน้อย 1 รายการ`
- markup: `ปิดเครื่องหมาย ** ให้ครบ` / `ปิดเครื่องหมาย ^^ ให้ครบ` / `ไม่รู้จักตัวแปร {…}` (จาก `parseMarkup().message`)
- ยาวเกิน: "ข้อความยาวเกินที่ LINE รับได้ ลดข้อความหรือเอาบล็อกออก แล้วบันทึกอีกครั้ง"
- ตัวแปรเกินเงื่อนไข: "{ยอดสะสมรอบ} ส่งได้เฉพาะรายงานรายวันที่ไม่ใช่รอบ 24:00 ในรายงานรายเดือนบรรทัดนี้จะไม่ถูกส่ง"
- {กำไร} ยังไม่ยืนยัน: "ตัวแปร {กำไร} ใช้ได้หลังเปิดแสดงกำไรแล้ว กดเพื่อเปิดและยืนยัน"
- {กำไร} ส่งไม่ได้ (ถ้ามีข้อมูลระดับกลุ่ม): "ร้านในกลุ่มคิดกำไรคนละกติกา จึงไม่มีกำไรรวม บรรทัดนี้จะไม่ถูกส่ง ใช้บล็อก “รายร้าน” เพื่อแสดงกำไรแยกร้านแทน"
- บันทึกไม่สำเร็จ: "บันทึกเทมเพลตไม่สำเร็จ ข้อความที่แก้ยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง"
- stale: "มีการแก้เทมเพลตของกลุ่มนี้จากที่อื่น ฉบับร่างของคุณยังอยู่ในหน้านี้"
- warning บนแถว: "ไม่ถูกส่งตอนนี้ (…เหตุผลจาก `REASON.*`…)"

**Swal (4 จุดเท่านั้น)**
- กำไร: "แสดงกำไรในกลุ่ม LINE?" / "ทุกคนในกลุ่มนี้จะเห็นตัวเลขกำไรของร้านที่เลือก ปิดได้ทุกเมื่อ" / "แสดงกำไร" "ยกเลิก"
- คืนมาตรฐาน: ข้อ 6.7
- ออกจากหน้า: ใช้ถ้อยคำเดิมของ `FullscreenBackButton` — "ออกจากหน้านี้โดยไม่บันทึก?" / "การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไปทั้งหมด" / "ออกจากหน้านี้" (ต่างจากถ้อยคำ AC-11-6 เล็กน้อย Open Q9)
- stale: ข้อ 6.6

**Toast (`pacesToast`)**
- "เอาออกแล้ว: ยอดขาย" + "ย้อนกลับ" · "บันทึกแล้ว รายงานรอบถัดไปจะใช้แบบนี้" (info) · "ส่งตัวอย่างเข้ากลุ่มแล้ว ดูได้ในกลุ่ม LINE" (success) · "เลือกคำในช่องพิมพ์ก่อน แล้วค่อยกด" (info)

**ประกาศ a11y (sr-only live region):** "เพิ่มแล้ว: ยอดขาย" · ประกาศลากในข้อ 4

**การ์ดในหน้าตั้งค่า**
- หัว: "ข้อความที่ส่งเข้ากลุ่ม" · ปุ่ม "จัดข้อความ" (อ่านอย่างเดียว: "ดูข้อความที่ตั้งไว้")
- chip: "ใช้แบบมาตรฐานอยู่" / "จัดเองแล้ว"
- caption ใต้ bubble: "ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก" (ข้อความเดิมของ `FlexBubbleView`)
- ประวัติ: บรรทัดสาเหตุต่อท้าย "ข้าม: {กำไร}" (จาก `summary`)

---

## 8. Edge states ที่ต้องออกแบบ

| สถานะ | การออกแบบ |
|---|---|
| **ค่าตั้งต้น (`template=null`)** | แสดงแบบมาตรฐานเป็นเทมเพลตจริงที่แก้ได้ · ไม่ dirty · `⋯` "คืนเป็นแบบมาตรฐาน" disabled |
| **Loading** | `(fullscreen)/loading.tsx` ที่มีอยู่ (ตรวจว่าเป็น skeleton) + พิจารณา `template/loading.tsx` skeleton 3 คอลัมน์ `animate-pulse` สูงเท่าจริง ไม่มี spinner กลางหน้า · ปุ่มบันทึก: spinner + "กำลังบันทึก…" |
| **Error บันทึก** | toast error + ฉบับร่างอยู่ ปุ่มกดซ้ำได้ (ข้อ 6.5) |
| **Stale 409** | ข้อ 6.6 |
| **แพ็กเกจหยุด / บอทถูกนำออก** | แบนเนอร์เดิมจาก `bannerFor` (ผ่าน `GroupBanner`, `onRebind` → `/business/line-reports/${id}?rebind=1`) · ผืนงานอ่านอย่างเดียว: ไม่มี grip/ปุ่มย้าย/ＣJ, ช่องพิมพ์ `readOnly`, คลัง**ถูกถอดทั้งคอลัมน์**ที่ `lg` (ผืนงาน `col-span-7` + ตัวอย่าง `col-span-5` ไม่เหลือคอลัมน์ว่าง) · บันทึก ซ่อน · ส่งทดสอบ disabled + `testBlockedReason` · **ไม่ชวนบันทึก** |
| **ชื่อร้านยาว (E-1)** | พรีวิวใช้ fixture ชื่อ 50 ตัวอักษร · แถว UI `truncate` + `title=` เป็นชุด (`truncate` มาพร้อม `min-w-0` ของ flex parent — `flex-header-truncation`) · ข้อความอิสระ `break-words` |
| **ตัวเลข 0 และหลักล้าน (E-2)** | `tabular-nums` · fixture `฿0`/`฿18,902,340` · เกจตัวเลข `0%`…`100%+` |
| **เนื้อหาข้อความยาวสุด (E-13)** | ข้อความอิสระ 6×120 ตัวอักษรไทย + span → เกจขยับถึง ~>80% ได้ · ล้น → บันทึกไม่ได้ · แถวปิดแสดงสรุป truncate |
| **ผสม vertical (E-4)** | คลังและพรีวิวใช้ `orderWordFor(group.shops)` → "รายการ" · ขายดี 3 อันดับ disabled เมื่อทุกร้านเป็นบ้านพัก (`top3Availability`) |
| **กลุ่ม 1 ร้าน (E-5)** | "เทียบรายร้าน" ในคลังเป็น disabled + "ใช้ได้เมื่อกลุ่มรวมมากกว่า 1 ร้าน" · ถ้ามีอยู่ในเทมเพลต → warning บนแถว ไม่ลบ |
| **ปิดรายเดือนทีหลัง (E-8)** | บล็อก `cycle`/โทเคน {ยอดสะสมรอบ} อยู่ + warning "ไม่ถูกส่งตอนนี้ (ใช้ได้เมื่อเปิดรายงานรายเดือน)" |
| **เปลี่ยนร้านในกลุ่มตอนมีเทมเพลต (E-16)** | key คงเดิม · ป้าย {คำ} ผันตามร้านใหม่เองในคลัง/พรีวิว · `blockWarning` ขึ้นถ้าบล็อกไม่พร้อม |
| **กราฟอย่างเดียวไม่มีตัวเลข (E-17)** | บันทึกปิด + `METRIC_REQUIRED_HELPER` |
| **markup/ตัวแปรผิด (E-18)** | error ใต้ช่อง · ปุ่มบันทึกปิด · พรีวิวใช้ runs ล่าสุดที่ถูก |
| **ทุกบรรทัดของข้อความถูกตัด (E-19)** | พรีวิวยังมีหัว + ตัวเลข ไม่ใช่หน้าว่าง (composer รับประกัน) |
| **บล็อก 20 / ข้อความ 6 / เส้นคั่น 8 เต็ม** | ข้อ 3.3 |
| **ไม่มีตัวเลขเลย + กราฟอย่างเดียว** | ข้อ 3.4 ผืนงานว่าง |
| **dirty แล้วออก / รีเฟรช** | ข้อ 6.8 |
| **มือถือ: คีย์บอร์ดขึ้น** | textarea อยู่ใน scroll container ของ `main` · `scroll-pb-24` ของ layout กันของใต้ไปหลบ · **ห้าม** ใช้ `position: fixed` ของตัวเองบนหน้านี้ (iOS ไม่หดตาม visual viewport) |
| **การ์ด: template ใหม่ถูกบันทึกจากหน้าอื่น** | ข้อมูลมาจาก `router.refresh()`/RSC (หน้าตั้งค่า `key={group.id:status}`) |
| **การ์ด: รายเดือนปิด** | seg "รายเดือน" ปิดตาม `previewState` เดิม |

---

## 9. Impeccable compliance

- **Mode: Operate** (หลังบ้านผู้ขาย) ตัดสินด้วย consistency กับ `public-profile/builder` + `GroupDetailClient` และการสแกนอ่านง่าย ไม่ใช่การแสดงออก (ตาม `operate.md`: "แบรนด์อยู่ในรายละเอียดที่แม่นยำ")
- **พระเอกของหน้า = พรีวิวบับเบิล** (พื้น `bg-light` เป็นมวลภาพเดียวที่ต่างจากพื้นขาว) และในบับเบิล = "ยอดขาย (นับแล้ว)" ตัวเดียวที่หนา · ผืนงานเป็นรายการเรียบ · คลังไม่มีกรอบ (เงียบที่สุด)
- **One Voice — จุดที่ใช้ accent (`bg-primary`/`text-primary`) ทั้งหมด:**
  1. ปุ่ม primary 1 ตัวต่อหน้า (บันทึกเทมเพลต หรือ ส่งทดสอบ — **ไม่เคยพร้อมกัน**)
  2. ชิปตัวแปร (`bg-primary/10 text-primary`) และปุ่มตัวหนาตอน pressed (`bg-primary/15 text-primary-ink`)
  3. ขอบ/พื้นของแถวที่ถูกลาก และโซนวางที่ `isDraggingOver` (`border-primary`, `bg-primary/5`)
  4. dot สี "เน้น" ใน seg และแท่งอันดับ 1 ในกราฟ (สี accent ของ LINE = `#236dc9`)
  5. ปุ่ม "จัดข้อความ" ในการ์ด (outline เท่านั้น)
  6. ปุ่มใน preview bubble (ภาพแทนปุ่ม LINE ที่มีอยู่แล้ว)
  - **ไม่มีพื้นน้ำเงินเต็มบล็อก ไม่มีม่วง `#7367F0`** · seg ที่เลือกใช้ `bg-card text-default-900 shadow-sm` ตาม `PreviewCard` ไม่ใช่ primary
- **Verified-Means-Green:** ไม่มีเขียวใหม่เลย · "บันทึกแล้ว" = `pacesToast.info` (neutral) ตามมติ addendum · ตัวเลือกสีข้อความ**ตัดเขียวและแดงออก** (เขียว = ยืนยันแล้ว, แดง = ดึงข้อมูลไม่สำเร็จ ในรายงานนี้) · "ยังไม่บันทึก", ตัวแปรกำไร, บล็อกที่ไม่ถูกส่ง, เกจ >80% = warning · เกจ >100% และ error ฟิลด์ = danger (ล้มจริง) · ส่งทดสอบสำเร็จใช้ `pacesToast.success` ตาม `sendTest` เดิม (เป็นผลของการกระทำ ไม่ใช่การยืนยันตัวตนร้าน) · กราฟใช้ accent + เทาอ่อนเท่านั้น
- **Sentence-case / ไทย:** ไม่มี ALL CAPS · ไม่มี eyebrow เหนือหัว (หัวกลุ่มคลังเป็นป้ายกลุ่มที่ทำหน้าที่จริง) · ไม่มีเลขหัวข้อ
- **Ink-tinted shadow:** ใช้ `shadow`/`shadow-lg` ของธีมเท่านั้น (ตอนลาก/เมนู) · ไม่มี `#000`
- **น้ำเสียง:** ปุ่มบอกผลลัพธ์ ("บันทึกเทมเพลต", "คืนเป็นแบบมาตรฐาน") · error บอกทางออก · เหตุผลที่ใช้ไม่ได้อธิบายเหตุ ไม่ใช้ "ไม่สามารถ…ได้" · ไม่ไฮป์ · ไม่แนะนำให้ทำสิ่งที่ปุ่มในสถานะนั้นไม่มี (แพ็กเกจหยุดไม่ชวนบันทึก)
- **อ้างตัวเลข/ศัพท์:** "ยอดขาย (นับแล้ว)" ห้ามย่อ (HR16, BR-LGS-23)

**จุดที่ theme ขัดกับ Impeccable / กฎข้ออื่น และการตัดสิน (Controller ควรเพ่งตอน critique):**

1. **Operate เตือน "modal as first thought" vs HR8 บังคับ Swal** → ใช้ Swal เฉพาะ 4 จุดที่ต้องตัดสินใจจริง (เปิดกำไร, คืนมาตรฐาน, ออกจากหน้า, ทิ้งฉบับร่างตอน stale) · การเอาบล็อกออก/ย้ายใช้ toast + ย้อนกลับ ไม่ใช่ modal
2. **EXT AC-11-3 ("ใช้ครบแล้ว") vs audit กฎ 5 (ซ่อนที่ใส่แล้ว)** → ใช้ audit (ใหม่กว่า, มาจากฟีดแบ็ก user "แน่น") คงเหตุผล `USED_UP` ไว้ใน `availability.ts` เพื่อ a11y/เทส แต่ไม่แสดง · ต้องให้ Controller รับทราบเพราะ AC เดิมต้องแก้ข้อความ
3. **เพิ่มบล็อกไม่มี toast** (ต่างจากรายการ copy "เพิ่มแล้ว: ยอดขาย") → ใช้ live region sr-only + เปิดแถวใหม่เป็นผลตอบกลับ · ลด toast ที่ถูกกดผ่าน (audit "แน่น")
4. **`pacesToast` ไม่มี action** → ข้อ 0.1 / Open Q1
5. **dynamic `style` 2 จุดที่ไม่ใช่ token** (ความกว้างเกจ, ความสูง/กว้างแท่งกราฟในพรีวิว) + `lg:h-[calc(100dvh-4rem)]` → ทั้งสามต้องมีคอมเมนต์บรรทัดเดียวกันตาม HR7; precedent `QuotaUsageCard.tsx` และ `BuilderClient.tsx`
6. **Slate (`#808390`) ตก contrast บนขาว** แต่ Flex ส่งสีนี้จริง → สี "รอง" ในตัวเลือกติดป้าย "ค่อนข้างจาง"; UI ของเราใช้ `text-default-700` เสมอ ไม่ใช่ slate
7. **`FullscreenPageHeader` บนมือถือ:** แถว action `belowContent` ทำให้ส่วน sticky สูง ~136px (~20% ของ 667px) — ค่อนข้างหนักสำหรับ Operate แต่จำเป็นเพราะ "ส่งทดสอบ/บันทึก" ต้องอยู่ในโซนนิ้วโป้งแบบ sticky (Open Q3)
8. **บันทึกด้วยปุ่ม ไม่ autosave** (ต่างจากส่วนอื่นของหน้าตั้งค่า) — มติ D-EXT-9/BR-LGS-29 ที่อนุมัติแล้ว
9. **seg รายวัน|รายเดือน ย้ายจากหัว "ข้อความ" ใน mockup ไปหัว "ตัวอย่าง"** เพราะเปลี่ยนเฉพาะพรีวิว

---

## 10. Design decisions + rationale

1. **ผืนงาน = รายการเดียว ไม่ใช่กองการ์ด** — audit ชี้ว่าการ์ดซ้อนการ์ดและทุกบล็อกกางพร้อมกันคือต้นเหตุของความแน่น
2. **เปิดทีละแถว, ปุ่มจัดการเฉพาะแถวเปิด** — แถวปิด 48px บรรทัดเดียวสแกนง่าย (เมื่อ ≥8 บล็อก ความสูงรวมไม่ท่วม)
3. **รวมสถานะ primary ไว้ที่ `getPrimaryAction()` จุดเดียว** — กัน "primary สองปุ่ม" ที่พังบ่อยใน action bar (`orders/new`) และเป็นโฮมของ boolean ที่เทสจับได้
4. **ตรวจ error ตอน blur/กดบันทึก ไม่ใช่ตอนพิมพ์** — บล็อกใหม่ที่ยังว่างไม่ควรแดงทันที
5. **ยืนยันกำไรที่ทางเข้า ไม่ใช่ตอนกดบันทึก** (ยกเว้นพิมพ์ `{กำไร}` เอง) — ตรง AC-11-8 "ยกเลิก = ไม่ลง" และกันฉบับร่างค้างสถานะ "กำไรเปิดแต่ยังไม่ยืนยัน"
6. **พรีวิวไม่ sticky ที่ md** — shell สูงคงที่ใช้เฉพาะ `lg` (ตามบทเรียน builder: ความสูงคำนวณต่อ breakpoint ยาก) ที่ md ผืนงานกับพรีวิวสูงใกล้กัน จึงยอมรับ
7. **คลัง <lg ไม่มีการลาก** — ลากกับเลื่อนชนกัน; ＋ ต่อท้าย; สลับลำดับด้วย grip/ปุ่มขึ้น-ลงในผืนงาน
8. **มือถือ primary ช่องเดียวที่เปลี่ยนตามสถานะ** — ลดความแน่นของ sticky; ส่งทดสอบตอน dirty ไปอยู่ใน `⋯` (disabled + เหตุผล) ยังไม่หายจากระบบ
9. **การ์ดในหน้าตั้งค่า = พรีวิว + ทางเข้า ไม่ใช่ฟอร์ม** — ไม่ซ้ำข้อมูลของ `MetricsCard` (ตัดการ์ดที่ข้อมูลซ้ำ)
10. **`moveToIndex`/`moveArrayItem` นำกลับมาใช้ ไม่เขียนใหม่** — กัน logic สลับตำแหน่งเดินคนละทาง (ตามคอมเมนต์ใน `draft.ts`)

---

## 11. Anti-slop self-check

1. **เฉพาะ Deep ไหม:** ใช่ — แถวล็อกพร้อมเหตุผลตาม BR-LGS-08/24, คลังที่ disabled ตามข้อมูลกลุ่ม (รายเดือน/จำนวนร้าน/บ้านพัก) ด้วย `availability.ts`, ขั้นยืนยันกำไรเพราะ "ทุกคนในกลุ่ม LINE เห็น", เกจที่มาจากเพดาน LINE 30KB และ fixture ชื่อร้าน 50 ตัวอักษร/฿18,902,340, ตัดเขียว/แดงออกจากสีข้อความเพราะความหมายในรายงาน, ชื่อ "ยอดขาย (นับแล้ว)" ที่ห้ามย่อ · เอาไปใช้กับสินค้าอื่นไม่ได้โดยไม่รื้อ
2. **พระเอกหนึ่งอย่างต่อจอ:** ≥lg = พรีวิวบนพื้น `bg-light` (+ primary ปุ่มเดียว) · มือถือแท็บ "ผืนงาน" = รายการเรียบ + primary ปุ่มเดียว; แท็บ "ตัวอย่าง" = bubble · การ์ดหน้าตั้งค่า = bubble ตัวเดียว (ไม่แบ่งน้ำหนักกับตัวเลือก)
3. **ตัดของซ้ำ/คงที่:**
   - ตัด `MetricsCard` (ซ้ำกับบล็อกในคลัง) และ `PreviewCard` (ซ้ำกับการ์ดใหม่)
   - ตัดบล็อกที่ใส่แล้วออกจากคลัง ไม่แสดง "เพิ่มแล้ว"
   - ตัดตัวนับ "เหลือ 3 จาก 5 ครั้ง" ที่คงที่ตลอด · ตัด KB ออกยกเว้นในบล็อกกราฟ
   - ตัดแถบ dirty แยก (ใช้ chip เดียว)
   - ตัด toast "เพิ่มแล้ว"
4. **State ครบ:** ตาราง §8 — ค่าตั้งต้น, loading, error/บันทึกล้ม, stale, แพ็กเกจหยุด, ชื่อ 50 ตัว, 0 และหลักล้าน, ข้อความยาวสุด, ผสม vertical, 1 ร้าน, ปิดรายเดือนทีหลัง, บล็อกเต็ม 20, markup ผิด
5. **Copy ตรงความสามารถจริง:** ปุ่มบอกผลลัพธ์ ("บันทึกเทมเพลต", "คืนเป็นแบบมาตรฐาน") · "ส่งทดสอบ" disabled บอกเหตุ ("บันทึกเทมเพลตก่อน…") · โหมดอ่านอย่างเดียวไม่ชวนบันทึก · error ทุกข้อมีทางออก · ไม่ใช้ "ไม่สามารถ…ได้" · "ใช้ได้เมื่อ…" บอกเงื่อนไขที่แก้ได้
6. **คำเดียวกันของเดียวกัน:** บล็อก/ตัวแปร/เทมเพลต นิยามใน §7 · ศัพท์ธุรกิจตาม SSOT · **จุดที่ยังต้องเช็ก:** โทเคน `orders_count` ใน `template.ts` = `{จำนวนรายการ}` (ต้นฉบับพิมพ์ใช้ป้ายคงที่) แต่คลัง/พรีวิวแสดงตามร้าน — ระบุใน tray ด้วย `title` "แสดงเป็น{คำ}ของร้านในข้อความจริง"
7. **สีสื่อความหมาย:** ไม่มีเขียวใหม่ · แดงเฉพาะล้มจริง (error ฟิลด์ที่ผิด/เกจ >100%) · warning = ยังไม่บันทึก/กำไร/ไม่ถูกส่ง · "รอ" เสมอ warning/neutral · สถานะเดียวกันสีเดียวกัน (ดู §9)
8. **มือถือแตะได้จริง:** grip / ปุ่มย้าย / เอาออก / ＋ / ชิป / ปุ่ม action / seg ≥44px (`min-h-11 min-w-11` ของ Paces) · ลากที่ grip เท่านั้น · ปุ่มหลักอยู่ใน sticky bar ขวาสุด (โซนนิ้วโป้ง)
9. **จอ 1440:** 3 คอลัมน์ ≈ คลัง 322 / ข้อความ 537 / ตัวอย่าง 430 — **คอลัมน์คลังจะสั้นที่สุด (และว่างด้านล่าง) เมื่อบล็อกถูกใส่หมด** · ตั้งใจ: ความว่างนั้นเป็นสัญญาณ "ใส่ครบแล้ว" ไม่ได้ดันเนื้อหาจริงไปฝั่งแคบ เนื้อหาหลัก (ผืนงาน+พรีวิว) อยู่ฝั่งกว้าง

---

## 12. Open questions (ให้ Controller / developer)

1. **ขยาย `pacesToast` ให้มีปุ่ม action** (3 ไฟล์ ฐาน `ui/notifications/page.tsx` บรรทัด ~135) หรือยอมใช้ toast ไม่มีปุ่ม "ย้อนกลับ"? สเปกนี้ออกแบบตามตัวแรก; ถ้าไม่อนุมัติ → AC-EXT-11-9 ต้องแก้เป็น "toast + เพิ่มกลับจากคลัง"
2. **ไฮไลต์ข้ามคอลัมน์ (บล็อก↔พรีวิว)** ต้องให้ composer คืน `sectionMap` (blockId → ตำแหน่งโหนด) ผ่านช่องข้างเคียงเดียวกับ `diagnostics` (ไม่ใส่ key ลง JSON ที่ส่ง LINE) — ทำใน EXT นี้ไหม หรือเลื่อนเป็นรอบหลัง (สเปกไม่ผูกกับ AC ใด)
3. **มือถือ sticky สูง ~136px:** ยอมรับ หรือต้องการเพิ่ม prop `mobileActions` ให้ `FullscreenPageHeader` (แก้ shared component เล็กน้อย) เพื่อรวมปุ่มไว้แถวเดียวกับชื่อหน้า (~76px)
4. **Stale 409:** มีเฉพาะ "โหลดฉบับล่าสุด" (ทิ้งฉบับร่าง) · ต้องการ "บันทึกทับ" (ต้องมีการ re-fetch version ก่อน + Swal danger) ด้วยไหม
5. **พรีวิวใช้ "ผสม vertical" ตาม AC หรือใช้โครงกลุ่มจริง:** สเปกนี้ใช้ **โครงกลุ่มจริง (จำนวนร้าน/vertical/สถานะ) + ข้อมูลเลวร้ายสุด** เพื่อไม่ให้คำ {คำ}/availability ของพรีวิวขัดกับคลัง — ต้องแก้ข้อความ AC-11-10 หรือไม่
6. **นำ `moveToIndex`/`moveArrayItem` ไปไว้ที่กลาง (`src/lib/...`)** หรือ import จาก `public-profile/builder/lib/draft.ts` ตรง ๆ (แนะนำ: import ก่อน ไม่คัดลอก)
7. **`HistoryCard` บรรทัด "ข้าม …"** ต้องการฟิลด์จาก DTO (`summary`) ที่ `getGroupDetail` ยังไม่ select — อยู่ใน T-service ไหน (AC-EXT-05-2/12-4)
8. **ลบ `MetricsCard`/`PreviewCard`** หลังหยุดใช้: **ต้องถามผู้ใช้ก่อนลบไฟล์** (`feedback_ask_before_any_delete`) — ปล่อยไฟล์ค้างจนได้คำตอบ
9. **ถ้อยคำ Swal ออกจากหน้า:** ใช้ของ `FullscreenBackButton` ตรง ๆ (ต่างจาก AC-11-6 เล็กน้อย) หรือเพิ่ม prop ให้กำหนดข้อความเอง
10. **`pacesToast.success` ของส่งทดสอบ** ตรงกับ `sendTest` เดิมในหน้าตั้งค่า (teal check) ไม่ขัดมติ "บันทึกแล้ว = neutral" เพราะเป็นผลส่งจริง — ยืนยันว่าต้องการให้เหมือนกัน

---

## 13. ข้อห้าม/กับดักที่ developer ต้องระวัง

1. **ชื่อไฟล์:** ห้ามสร้าง `template.tsx` ใน `src/app` (ชื่อสงวนของ Next — ทำหน้าพังทั้งหน้า) · โฟลเดอร์ `template/` + `page.tsx` ใช้ได้ · พารามิเตอร์ต้องเป็น `[groupId]` เท่ากับ `(dashboard)/…/[groupId]` ทุกชั้น (ชื่อ slug ไม่ตรง = API ตายทั้งระบบ build ยัง exit 0)
2. **Scroll lock:** หน้านี้ไม่มี overlay ที่ประกอบเอง (ชิปโทเคนและแถบจัดรูปแบบเป็น inline ไม่ใช่ popover/ชีต) จึง**ไม่ต้องใส่ `useLockBodyScroll`** · Swal จัดการเอง — **อย่าใส่ซ้ำ** (`feedback_scroll_lock_single_owner`) · ถ้ามีใครเปลี่ยนเป็น bottom sheet ต้องผ่าน ux ใหม่
3. **Popover โดน overflow ตัด:** เมนู `⋯` อยู่ใน header sticky (ไม่ใช่ scroll container) เปิดลง `top-full z-30` เหมือน `GroupMenu` · **ห้ามใช้ `hs-dropdown`/popover ภายในคอลัมน์ที่ `overflow-y-auto`** · ห้ามเพิ่มเมนูต่อแถวบล็อก (ทุกอย่างอยู่ในแถวเปิดแล้ว)
4. **ห้าม ancestor ของ Droppable มี `transform`/`filter`/`backdrop-blur`/`will-change`** (ทำให้ `position: fixed` ของรายการที่ลากอิงกรอบผิดและแถวที่ลากหลุดตำแหน่ง) — เลี่ยง `active:scale-*` / `transition-transform` บน wrapper คอลัมน์
5. **Safe-area / iOS:** `(fullscreen)/layout.tsx` เว้น inset ให้แล้วที่เปลือกชั้นเดียว **ห้ามใส่ `env(safe-area-inset-*)` ซ้ำในหน้านี้** · **ห้าม `position: fixed` ของตัวเอง**ในหน้านี้ (ปุ่ม/แถบ action อยู่ใน sticky header เท่านั้น) · `viewport-fit=cover` ตั้งไว้แล้วที่ layout
6. **Fullscreen ซ่อน nav:** route นี้ไม่มี bottom nav/FAB — **ไม่ต้องหาที่ใหม่ให้ action** เพราะหน้านี้ไม่มี action ที่เคยพึ่ง FAB · แต่ทางเข้าคือการ์ดในหน้าตั้งค่า (dashboard shell) ต้องแน่ใจว่าปุ่มกลับไปที่ `/business/line-reports/${id}` ไม่ใช่ `/seller/...` (seller nav ใช้ path สั้น)
7. **ห้าม `font-mono`:** รวมทั้งช่อง textarea, ชิปโทเคน, ตัวนับ — Anuphan ตก fallback ทั้งบรรทัด ใช้ `tabular-nums` สำหรับเปอร์เซ็นต์/ไบต์
8. **`.form-input`/`_forms.css` unlayered:** ห้ามคุมความกว้าง/ความสูงด้วย `w-*`/`h-*` บน `.form-input`/`.form-textarea` (ไม่มีผล) — ต้องการกว้างคุมใช้ `.input-group w-*` · ห้ามแทรก element ใน `.input-icon-group`
9. **ห้ามประกาศ component ในตัว render** (`BlockRow` และ body ต่อชนิดต้องเป็นระดับ module — มิฉะนั้น remount ทุกการพิมพ์ ทำให้ textarea เสีย focus/IME ไทยขาด) · **ห้ามมี hook ใต้ early return** (สถานะอ่านอย่างเดียวสลับด้วย JSX ท้ายฟังก์ชัน)
10. **ค่าที่ hook คืนทั้งก้อนห้ามใส่ใน deps:** เช่น `router` ทั้งก้อน · `dispatch` ของ `useReducer` เสถียรอยู่แล้ว · การวัดเกจ (`measureTemplate`) ต้องไม่เปลี่ยน `draft` (กันวนไม่หยุด)
11. **`FlexBubbleView`/composer:** ห้ามฮาร์ดโค้ดสี hex ใหม่ที่ `(paces)` — ผ่าน `flexColorClass` ใน `flex-preview-tokens.ts` เท่านั้น (เพิ่มสีเทาอ่อนของกราฟ `GRID_GRAY` ใน `FLEX_COLORS` + map) · `style` ของแท่งกราฟต้องมีคอมเมนต์
12. **HR2 (`rsc-mui-nav`):** ไม่เกี่ยว (Paces ไม่ใช้ MUI) แต่ถ้าใช้ `Link` ในการ์ด ใช้ `next/link` ตามที่ `DetailActionBar` ทำ
13. **toast/Swal:** `pacesToast`/`pacesConfirm` เท่านั้น (`rg "from ['\"]react-toastify" "src/app/(paces)/"` ต้อง 0) · ห้าม `window.confirm/alert`
14. **จุดควรมีเทสแยก (โฮมของ boolean):** `getPrimaryAction`, `gaugeState`, `reorder`/`canAdd` (ผ่าน `libraryAvailability`), `insertAtSelection`/`wrapSelection`, `confirmProfitExposure`, reducer ที่ลบ/ย้อนกลับ
15. **Tap target:** ใช้ `min-h-11 lg:min-h-0` กับสิ่งที่ประกอบเอง · `.btn`/`.btn-icon` ได้ 44px บนมือถือจาก `safepay-overrides.css` อยู่แล้วแต่ precedent ในรีโปเขียนซ้ำ ให้ทำตามเพื่อ grep ไม่ฟ้อง
16. **Playwright 3 viewport:** 375 / 768 / 1180 รวมย้ายบล็อกด้วยคีย์บอร์ดอย่างเดียว และ dirty → กดย้อน → เห็น Swal

---

**ไฟล์ที่อ่านเป็นฐานของสเปกนี้ (ทางเต็ม):**
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/docs/20 - Features/00070 - LINE Group Summary Report/EXTENSIONS-2026-10-05-message-template-and-charts.md`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/docs/superpowers/specs/2026-10-05-line-report-message-builder-design.md`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/docs/superpowers/specs/2026-10-05-line-report-message-builder-mockup.html`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/BuilderClient.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/business/line-reports/[groupId]/GroupDetailClient.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/lib/line-report/template.ts`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/lib/line-report/availability.ts`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/lib/paces-toast.ts`
---

## มติ Controller ต่อ Open questions (2026-10-05)

1. ขยาย `pacesToast` ให้มี `action` (3 ไฟล์) — ทำ
2. ไฮไลต์ข้ามคอลัมน์ (`sectionMap`) — เลื่อนไปรอบหลัง
3. sticky มือถือ ~136px — ยอมรับ ไม่แก้ shared header
4. Stale — มีเฉพาะ "โหลดฉบับล่าสุด"
5. พรีวิวใช้โครงกลุ่มจริง + ข้อมูลเลวร้ายสุด — ใช้ (แก้ถ้อยคำ AC-11-10 ตอน sync docs)
6. import `moveToIndex`/`moveArrayItem` จาก `public-profile/builder/lib/draft.ts` ตรง ๆ
7. `summary` ใน deliveries — ทำใน T7 (service)
8. ไม่ลบ `MetricsCard`/`PreviewCard` จนกว่า user ตอบ
9. ใช้ถ้อยคำ `FullscreenBackButton` เดิม
10. ส่งทดสอบสำเร็จ = `pacesToast.success` เหมือนเดิม
