---
name: ui-theme-sourcing
description: Use BEFORE any Write/Edit ของ page/component/layout ใน src/app/**, src/views/**, src/components/** (SafePay/Deep) — รวมถึงเมื่อ user ขอ "สร้าง/ทำ/แก้หน้า X", "เพิ่ม component", หรือ build UI ใด ๆ. Enforce theme-copy (no UI from scratch) + Base: commit line. ครอบทั้ง buyer Vuexy และ seller/admin Paces.
---

# UI Theme Sourcing — Hard Rule 1 + 3

ทุกหน้า/component/layout ต้องเริ่มจาก **copy ไฟล์ theme ที่ระบุเจาะจง** แล้วปรับ content. "inspired by" / "ใช้ component เดียวกัน" / "คล้าย ๆ" = ไม่ผ่าน.

## Pre-write checklist (ตอบใน response ก่อน Write ทุกครั้ง)
1. Target route: `src/app/.../page.tsx`
2. Theme source ผม copy: `theme/<vuexy|paces>/.../file.tsx`
3. ผม Read theme source นั้น turn นี้แล้ว: ✅ / ❌

ถ้า 3 = ❌ → หยุด Read ก่อน. ถ้า 2 กำกวม → หยุด research ด้วย Glob/Grep จน name file เดียวได้.

## Theme mapping
| Route | Theme | Source root |
|---|---|---|
| `src/app/(marketing)/**` (buyer+landing+public `/u/[username]`,`/o/[token]`) | Vuexy | `theme/vuexy/typescript-version/full-version/src/` |
| `src/app/(paces)/seller/**` | Paces | `theme/paces/Admin/TS/src/` |
| `src/app/(paces)/admin/**` | Paces | `theme/paces/Admin/TS/src/` |

## Copy workflow
1. ระบุ theme path 2. `Read` theme 3. cp/Write→target 4. `Edit` swap content ไทย 5. strip dep ไม่ใช้ (copy dep / stub / strip — least invasive) 6. type-check + browser QA

## Commit rule (Hard Rule 3)
commit ที่แตะ UI ต้องมี body:
```
Base: theme/<vuexy|paces>/.../<file>.tsx
Widgets adapted: ...
Dropped: ...
```
`Base:` ต้องชี้ `theme/...` — ห้ามชี้ `src/...` (retro 2026-05-10 task 12 พังเพราะข้อนี้).

## ไม่ applies
backend (`src/app/api/**`,`src/services/**`,`src/lib/**`), trivial tsx utility (เช่น mui-link wrapper).

## Deep reference (อ่านเมื่อต้องการ page-type→theme file mapping เต็ม + dependency handling)
`docs/conventions/ui-page-sourcing.md` — มีตาราง SafePay page → Vuexy/Paces source ครบทุกหน้า.
