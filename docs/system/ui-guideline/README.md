# UI Guideline — SafePay / Deep

> ศูนย์รวมข้อกำหนดการทำ UI ทุกฝั่งของระบบ. เอกสารนี้คือ **entry point** — อ่านที่นี่ก่อนเสมอ แล้วค่อยลงลึกตาม role ที่กำลังทำ.

## 🛑 เมื่อไหร่ที่ต้องอ่านเอกสารชุดนี้ (RULE — บังคับ)

**ทุกครั้งก่อนจะ `Write`/`Edit` ไฟล์ UI ใด ๆ** (page / component / layout ใน `src/app/**`, `src/views/**`, `src/components/**`) คุณ **ต้อง** อ่าน:

1. `README.md` นี้ (universal rule + checklist + workflow ด้านล่าง) — เสมอ
2. เอกสาร role ที่ตรงกับ route ที่กำลังทำ — เลือก 1 จาก:
   - `customer/page-sourcing.md` — buyer + landing + public (`src/app/(marketing)/**`, Vuexy)
   - `seller/page-sourcing.md` — `src/app/(paces)/seller/**` (Paces)
   - `admin/page-sourcing.md` — `src/app/(paces)/admin/**` (Paces)
3. `../../conventions/rsc-mui-navigation.md` — ถ้าหน้านั้นมี link/navigation (Hard Rule 2)

ถ้ายังไม่ได้อ่าน 1+2 ในเทิร์นปัจจุบัน → **หยุด อ่านก่อน ห้าม Write**. นี่คือ Hard Rule 1+3 ของโปรเจกต์ (ดู `CLAUDE.md`) — enforce ผ่าน skill `ui-theme-sourcing` ที่ trigger อัตโนมัติ.

> ไม่ใช้กับงาน backend-only — ดูหัวข้อ "เมื่อ convention นี้ไม่ applies" ท้ายเอกสาร.

---

## The rule (one line)

**Before any `Write` to a page/component/layout file, you MUST `Read` a specific theme source file and `cp` it as the starting point.**

ถ้าระบุ path ของ theme file ที่จะ copy ไม่ได้แบบเจาะจง = ยังหาไม่พอ ห้ามเขียน. "Inspired by Vuexy/Paces" หรือ "follows the pattern" ไม่นับว่า compliant.

Background: `docs/retro/2026-04-18-p1-retrospective.md` (Problem 1) — การ compose จาก MUI/Preline primitives ทำให้ต้อง rework buyer ทั้งฝั่ง.

## Theme mapping (route group → theme)

Theme ของแต่ละ route ตัดสินจาก route group:

| Route pattern | Theme | Theme source root | เอกสาร role |
|---|---|---|---|
| `src/app/(marketing)/**` (buyer + landing + public) | **Vuexy** | `theme/vuexy/typescript-version/full-version/src/` | [`customer/page-sourcing.md`](./customer/page-sourcing.md) |
| `src/app/(paces)/seller/**` | **Paces** | `theme/paces/Admin/TS/src/` | [`seller/page-sourcing.md`](./seller/page-sourcing.md) |
| `src/app/(paces)/admin/**` | **Paces** | `theme/paces/Admin/TS/src/` | [`admin/page-sourcing.md`](./admin/page-sourcing.md) |

## Required pre-write checklist

ก่อนเขียนไฟล์ UI ใหม่ (หรือ rewrite ของเดิม) ต้องตอบ 3 ข้อนี้ **ใน response text เอง** ก่อนเรียก `Write`:

1. **Target route:** `src/app/.../<path>/page.tsx`
2. **Theme source I will copy:** `theme/<vuexy|paces>/.../<path>/<file>.tsx` (จากเอกสาร role)
3. **Read status:** เปิด theme source นั้นด้วย `Read` ในเทิร์นนี้แล้ว? ✅ / ❌

ถ้า 3 = ❌ → หยุด ไป `Read` ก่อน. ถ้า 2 กำกวม ("something like…") → หยุด research ด้วย Glob/Grep จนระบุไฟล์เดียวได้.

## Copy workflow (what "copy" actually means)

```
1. Identify theme source path     (เอกสาร role / Glob / Grep)
2. Read that file with Read tool  (บังคับ — verify ว่าเห็นแล้ว)
3. Copy to target location        (Bash cp OR Write after Read)
4. Edit content inline            (Edit tool สำหรับ content swaps)
5. Strip unused deps              (Edit ลบ imports/widgets)
6. Verify render                  (type-check + browser via Chrome MCP)
```

What "copy" does NOT mean:
- "I remember the pattern and wrote it from memory" ❌
- "I used the same MUI components" ❌
- "It looks similar" ❌
- "I stripped the deps to a minimal version" ❌ (stripping คือ step 5 ไม่ใช่ step 0)

## Dependency handling

Theme templates มักimport helper ที่ยังไม่มีใน `src/` (`getDictionary`, i18n utils, settings hooks, customizer). อย่าข้ามการ copy เพราะ dep พวกนี้.

เลือก 1 จาก:

1. **Copy the dep too.** ถ้า dep เป็น building block ที่มีประโยชน์ (เช่น `useSettings`, `CustomChip`) → copy เข้า `src/@core/…` หรือ `src/utils/…`
2. **Stub it.** ถ้า dep เป็น demo-only (เช่น `getDictionary` คืน string อังกฤษ) → แทนด้วย constant object ภาษาไทยหรือ stub ง่าย ๆ
3. **Strip it.** ถ้า dep ไม่เพิ่มอะไร (เช่น i18n `lang` path prefix) → ลบ prop แล้ว hardcode ไทย

เลือกตัวที่ invasive น้อยสุด. ระบุการตัดสินใจใน commit message.

## Commit message rule (Hard Rule 3)

ทุก commit ที่ add/modify ไฟล์ใน `src/app/**`, `src/views/**`, `src/components/**` (UI ไม่ trivial) **ต้อง** อ้าง theme source path ใน message body:

```
feat(buyer): /dashboard using Vuexy ecommerce widgets

Base: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/apps/ecommerce/dashboard/page.tsx
Widgets adapted: Congratulations (→ welcome), StatisticsCard, Orders, Transactions.
Dropped: InvoiceListTable (not applicable to buyer).
```

ไม่มี `Base:` ใน commit ที่แตะ UI = convention violation → revert/amend ก่อน merge.

## เมื่อ convention นี้ไม่ applies

- Backend-only code (`src/app/api/**`, `src/services/**`, `src/lib/**`) — ไม่มี UI ไม่ต้อง source
- tsx utility trivial ที่ไม่ใช่ page/component ที่มองเห็น (เช่น `mui-link.tsx` wrapper)
- Domain components ใน `src/components/safepay/**` ที่ไม่มี theme equivalent ตรง — แต่ก็ยังต้อง copy theme primitive ที่ใกล้สุด (card, chip, badge) เป็น base

## โครงเอกสาร

```
docs/system/ui-guideline/
├── README.md            ← อยู่นี่ (universal rule + workflow + RULE บังคับอ่าน)
├── customer/
│   └── page-sourcing.md ← Vuexy buyer/landing/public mapping
├── seller/
│   └── page-sourcing.md ← Paces seller mapping + Paces structural notes
└── admin/
    └── page-sourcing.md ← Paces admin mapping
```

แต่ละ folder เพิ่มเอกสารย่อยได้ (เช่น `seller/forms.md`, `customer/auth.md`) — แต่ทุกไฟล์ต้องลิงก์กลับมา README นี้ และ README ต้องลิสต์ไว้ในโครงเอกสารด้านบน.
