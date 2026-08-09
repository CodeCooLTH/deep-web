---
title: "UX Design Spec — ตอบกลับคอมเมนต์ (00038)"
owner: shinobu22
status: approved
created: 2026-08-08
tags: [ux, design-spec, feature, 00038, paces, seller]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]"]
---

> **โมดูล:** 00038-CommentReply
> **ประเภทเอกสาร:** UX Design Spec (Hard Rule 8 gate)
> **ผู้จัดทำ:** `safepay-ux`
> **วันที่:** 2026-08-08
> **Mode:** Operate
> **ขอบเขต:** 3 หน้าจอ — หน้าตั้งค่า `/settings/comment-reply` · ปุ่ม "ทักแชท" ในแท็บความคิดเห็น · สถานะ 3 ชั้น + แท็บกรอง

เอกสารอ้างอิงที่อ่านครบก่อนออกแบบ: `DESIGN.md` → `PRODUCT.md` → `.impeccable/design.json` → Impeccable playbook (`shape` / `operate` / `craft-floor` / `clarify`) → `docs/system/ui-guideline/{README,seller/page-sourcing}.md` → `paces-component-reference.md` → mockup HTML + design spec + PRD + BRD + API ของ 00038 → โค้ดจริง (`CommentsClient.tsx`, `CommentsFilterPanel.tsx`, `ChannelBadge.tsx`, `PageFilterDropdown.tsx`, `AutoReplyTag.tsx`, `AiSettingForm.tsx`, `AutoReplyListing.tsx`, `ChannelsClient.tsx`, `SellerEmptyState.tsx`, `paces-swal.ts`, `seller-menu.ts`)

---

## หน้า 1: ตั้งค่าตอบกลับคอมเมนต์ (`/settings/comment-reply`)

**ครอบ:** FR-CR-01..04 · BR-CR-01..07 · AC-CR-01..06

### 1.1 Wireframe

**Mobile (390px)**
```
┌──────────────────────────────┐
│ ‹ ตั้งค่า / ตอบกลับคอมเมนต์    │ PageBreadcrumb
├──────────────────────────────┤
│ ┌────────────────────────────┐│
│ │[av fb] ธนภัทร์ อะไหล่...    ││ card-header (avatar+overlay+ชื่อ,
│ │      Facebook Page          ││ badge ล้นแล้ว wrap บรรทัดใหม่)
│ │      [เชื่อมต่ออยู่]          ││
│ ├────────────────────────────┤│
│ │ ตอบใต้คอมเมนต์      [ ON ] ││ sw-row 1
│ │ ระบบจะตอบข้อความนี้...      ││
│ │ ┌──────────────────────┐   ││
│ │ │ ขอบคุณที่สนใจครับ...  │   ││ form-textarea
│ │ └──────────────────────┘   ││
│ │ 42/1000    i คนอื่นเห็นด้วย ││
│ │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈││ dashed divider
│ │ ทักแชทส่วนตัวต่อ    [ ON ] ││ sw-row 2
│ │ ┌──────────────────────┐   ││
│ │ │ สวัสดีครับ พอดี...    │   ││
│ │ └──────────────────────┘   ││
│ │ i ครั้งเดียว/คอมเมนต์ 7 วัน ││
│ ├────────────────────────────┤│
│ │        [ บันทึก (เต็มแถว) ] ││ footer — มือถือปุ่มเดียวเต็มความกว้าง
│ └────────────────────────────┘│
│ ┌────────────────────────────┐│
│ │[av ig] BT Premium [เร็วๆนี้]││ การ์ด IG (เฉพาะร้านที่เชื่อม IG จริง)
│ │ คอมเมนต์ IG ต้องขอสิทธิ์...  ││ disabled ทั้งใบ
│ └────────────────────────────┘│
│ ┌────────────────────────────┐│
│ │ ประวัติการตอบอัตโนมัติ       ││
│ │ [เพจ: ทุกเพจ v]              ││ FilterDropdown (เห็นเมื่อ >1 เพจ)
│ │ 08 ส.ค. 13:23 · สุพจน์ เหลา  ││ การ์ดแถวละรายการ (ไม่ใช้ table)
│ │ [ส่งแล้ว] [ส่งแล้ว·เปิดห้อง]  ││
│ │ ─────────────────────────── ││
│ │ [ โหลดเพิ่ม ]                ││
│ └────────────────────────────┘│
└──────────────────────────────┘
```

**Tablet (768px)** — โครงเดียวกับมือถือ การ์ดกว้างขึ้น ปุ่ม footer ชิดขวาไม่เต็มแถว ประวัติเปลี่ยนเป็น `.table` จริง (ซ่อนคอลัมน์ "โพสต์")
```
┌────────────────────────────────────────────────┐
│ ตั้งค่า / ตอบกลับคอมเมนต์                         │
├────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐│
│ │[av fb] ธนภัทร์ อะไหล่มอเตอร์ไซค์  [เชื่อมต่ออยู่]││
│ ├──────────────────────────────────────────────┤│
│ │ ตอบใต้คอมเมนต์                         [ ON ]││
│ │ [textarea]                                    ││
│ │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈││
│ │ ทักแชทส่วนตัวต่อ                        [ ON ]││
│ │ [textarea]                                    ││
│ ├──────────────────────────────────────────────┤│
│ │                              [ยกเลิก] [บันทึก]││
│ └──────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────┐│
│ │ ประวัติการตอบอัตโนมัติ           [เพจ: ทุกเพจ v]││
│ │ ┌─────────┬───────────┬─────────┬───────────┐││
│ │ │ เวลา    │ ผู้คอมเมนต์│ใต้คอมเมนต์│ ทักแชท    │││
│ │ ├─────────┼───────────┼─────────┼───────────┤││
│ │ │08 ส.ค.  │สุพจน์ เหลา│[ส่งแล้ว] │[ส่งแล้ว]   │││
│ │ └─────────┴───────────┴─────────┴───────────┘││
│ │                                  [ โหลดเพิ่ม ]││
│ └──────────────────────────────────────────────┘│
└────────────────────────────────────────────────┘
```

**Desktop (≥1280px)** — เหมือน tablet + คอลัมน์ "โพสต์" กลับมา · `max-w-2xl` บนบล็อกสวิตช์กันไม่ให้ textarea กว้างจนอ่านยาก
```
┌──────────────────────────────────────────────────────────────────┐
│ ตั้งค่า / ตอบกลับคอมเมนต์                                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │[av fb] ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง      [เชื่อมต่ออยู่]   │ │
│ │        Facebook Page                                           │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ ตอบใต้คอมเมนต์                                         [ ON ] │ │
│ │ ระบบจะตอบข้อความนี้ใต้คอมเมนต์ระดับบนของลูกค้าโดยอัตโนมัติ      │ │
│ │ [ textarea max-w-2xl ]                        42/1000 ตัวอักษร │ │
│ │ i คนอื่นที่เข้ามาดูโพสต์จะเห็นข้อความนี้                        │ │
│ │┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │ │
│ │ ทักแชทส่วนตัวต่อ                                        [ ON ] │ │
│ │ [ textarea ]                                                   │ │
│ │ i Facebook ให้ทักได้ครั้งเดียวต่อคอมเมนต์ ภายใน 7 วัน          │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │                                            [ยกเลิก]  [บันทึก] │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │[av ig] BT Premium · Instagram                     [เร็ว ๆ นี้] │ │
│ │ คอมเมนต์บน Instagram ต้องขอสิทธิ์เพิ่มจาก Meta ก่อน...          │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ประวัติการตอบอัตโนมัติ                       [เพจ: ทุกเพจ v]   │ │
│ │┌────────┬──────────┬──────────────────┬─────────┬───────────┐│ │
│ ││เวลา    │ผู้คอมเมนต์│โพสต์              │ใต้คอมเมนต์│ทักแชท    ││ │
│ │├────────┼──────────┼──────────────────┼─────────┼───────────┤│ │
│ ││08 ส.ค. │สุพจน์ เหลา│โรงงานล้างสต๊อก... │[ส่งแล้ว] │[ส่งแล้ว]  ││ │
│ ││        │           │                  │          │เปิดห้อง   ││ │
│ │└────────┴──────────┴──────────────────┴─────────┴───────────┘│ │
│ │                                                 [ โหลดเพิ่ม ] │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 พฤติกรรม

**การ์ดต่อเพจ (Facebook, แก้ไขได้)** — RSC `page.tsx` resolve active shop → ดึง `channels` (provider `MESSENGER`, `status <> 'DISCONNECTED'` ตาม API §4.1) → render `<CommentReplyCard>` (client) 1 ใบต่อเพจ เรียงตามลำดับเดียวกับหน้าจัดการช่องทาง

แต่ละการ์ดถือ state ของตัวเองแยกกัน — **ไม่มี form state รวมทั้งหน้า** เพราะ PATCH ยิงทีละเพจ (API §4.2 รับ `shopChannelId` เดี่ยว) และ `AC-CR-04` บังคับว่าแก้เพจ A ต้องไม่กระทบเพจ B

สวิตช์ A (`commentPublicReplyEnabled`) กับ B (`commentPrivateReplyEnabled`) เป็นอิสระต่อกันสมบูรณ์ — คนละ label คนละ textarea คนละ hint คั่นด้วย `border-t border-dashed border-default-300` (ไม่ใช่กรอบ box แยกแบบ `AiSettingForm.tsx` เพราะที่นี่มี 2 บล็อกใหญ่ ไม่ใช่ 3 สวิตช์เล็กเรียงเป็นรายการ)

Textarea `disabled` เมื่อสวิตช์ตัวนั้นปิด — ยังไม่เคยตั้งข้อความ (`text === null`) แสดง placeholder สีจาง · เคยตั้งไว้แล้วแต่ปิดสวิตช์ ยังแสดงข้อความเดิมสีจาง **ไม่ล้างทิ้ง** (ร้านอาจปิดชั่วคราวแล้วเปิดกลับ)

**BR-CR-05 (เปิดสวิตช์ต้องมีข้อความ)** — validate ตอนกด "บันทึก": สวิตช์ ON แต่ textarea ว่างหลัง trim → `is-invalid` + ข้อความแดงใต้ช่อง + ไม่ยิง PATCH (ซ้ำชั้นกับ server 400 `VALIDATION_ERROR`)

**แถบเตือน TOKEN_INVALID (FR-CR-04 / AC-CR-05)** — badge เปลี่ยนเป็น "โทเคนหมดอายุ" สีแดง + banner เต็มความกว้างบนสุดของ card-body พร้อมปุ่ม "เชื่อมต่อใหม่" · สวิตช์และ textarea ทั้งใบ `disabled` · **ไม่มี footer** (ไม่มีอะไรให้บันทึกจนกว่าจะเชื่อมใหม่)

**การ์ด Instagram** — render เฉพาะร้านที่มีเพจ IG เชื่อมอยู่จริง เป็น static disabled card ไม่มี state ไม่มี fetch · ร้านที่ไม่มี IG ไม่เห็นการ์ดนี้เลย

**ประวัติการตอบอัตโนมัติ** — การ์ดแยกท้ายหน้า อ่านผ่าน `GET /api/shops/comment-reply/logs` (cursor, `take=20`) · ปุ่ม "โหลดเพิ่ม" แทน infinite-scroll (เป็นการ์ดรอง ไม่ใช่ list หลักของหน้า) · `FilterDropdown` เลือกเพจแสดงเฉพาะเมื่อร้านมี >1 เพจ

### 1.3 Theme Source Mapping

| Section | Base (ไฟล์ที่ยกมา) | Component | หมายเหตุ adapt |
|---|---|---|---|
| PageBreadcrumb | `src/app/(paces)/seller/(dashboard)/settings/auto-reply/page.tsx:43-46` | `PageBreadcrumb` | trail: ตั้งค่า → ตอบกลับคอมเมนต์ |
| โครงการ์ด `.card`/`.card-header`/`.card-body`/`.card-footer` | `paces-component-reference.md` §7 + ตัวอย่างจริง `AiSettingForm.tsx:100-282` | native div + Paces class | เส้นประของ `.card-header` มากับธีมอยู่แล้ว |
| Avatar เพจ + provider overlay | `inbox/components/PageFilterDropdown.tsx` (`PageAvatar`) + `inbox/components/ChannelBadge.tsx` (`ChannelBadgeOverlay`) | `PageAvatar` + `ChannelBadgeOverlay` | **เลือกคู่นี้แทน markup ของ `ChannelsClient.tsx`** เพราะหน้านี้อยู่กลุ่มเมนู CHAT เดียวกับ `/inbox` — ใช้ avatar ตัวเดียวกับที่ผู้ใช้เห็นในแท็บข้อความ/ความคิดเห็น (sibling-surface-parity) · ต้อง extend prop `size='lg'` (`size-10`) **พร้อมคอมเมนต์กำกับที่จุดขยาย** |
| Badge สถานะเพจ | `settings/channels/ChannelsClient.tsx:272-283` | `<span className="badge …">` | `bg-success/15 text-success` / `bg-danger/15 text-danger` |
| สวิตช์ + label + description | `settings/ai/AiSettingForm.tsx:157-217` (Base เดิม: `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx:71`) | `form-switch` | **adapt:** ตัด wrapper `border rounded-lg p-3` ต่อสวิตช์ทิ้ง ใช้ `border-t border-dashed border-default-300 pt-6 mt-6` คั่น 2 บล็อกแทน (ตาม mockup ที่ user เคาะ) |
| Textarea + ตัวนับตัวอักษร | `settings/ai/AiSettingForm.tsx:118-140` | `form-textarea` | `REPLY_MAX = 1000` ตรงกับ API §4.2 |
| Hint ใต้ textarea | `AiSettingForm.tsx` description pattern | `text-default-500 text-2xs inline-flex items-center gap-1` + icon `info-circle` | ไม่ใช้ banner เต็มแถว — เป็นข้อความรอง ไม่ใช่ gate |
| Banner TOKEN_INVALID | `ChannelsClient.tsx:232-237` | `bg-danger/15 text-danger` block | + ปุ่ม "เชื่อมต่อใหม่" ยกจาก `ChannelsClient.tsx:289-296` |
| ปุ่มบันทึก / ยกเลิก | `AiSettingForm.tsx:263-280` | `btn` | บันทึก = `bg-primary text-white hover:bg-primary-hover` + spinner `loader-2 animate-spin` · ยกเลิก = `bg-light text-default-700 hover:bg-light-hover` (neutral ไม่ใช่ primary) |
| การ์ด Instagram (coming soon) | `AiSettingForm.tsx:145-155` (upgrade-gate banner) | switch ที่ `disabled` ตายตัว | badge `bg-default-200 text-default-700` |
| ตารางประวัติ (tablet/desktop) | `paces-component-reference.md` §5 + `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx` | `.table-wrapper` + `.table` | **ไม่ใช้ TanStack `DataTable`** — เป็น read-only cursor list |
| ประวัติ (การ์ดมือถือ) | `AutoReplyListing.tsx:432-467` (`flex items-center gap-3 px-4 py-3.5`) | native div | แถวละการ์ด ไม่ใช่ table แนวนอน |
| Badge สถานะ log | `paces-component-reference.md` §6 | `badge` | ส่งแล้ว = `bg-success/15 text-success` · ข้าม = `bg-default-200 text-default-700` (**neutral ไม่ใช่ warning** — เป็นการข้ามที่ตั้งใจ ไม่ใช่ปัญหา) · ไม่สำเร็จ = `bg-danger/15 text-danger` |
| ลิงก์ "เปิดห้อง" | `CommentsClient.tsx:1583-1585` (ปุ่ม "ตอบ") | `<Link className="hover:underline font-medium">` | `/inbox/{conversationId}` |
| ตัวกรองเพจในประวัติ | `src/components/safepay/FilterDropdown.tsx` | `FilterDropdown` | แสดงเมื่อ `channels.length > 1` |
| Empty (ยังไม่เชื่อมเพจ) | `seller/(dashboard)/_shared/SellerEmptyState.tsx` | `SellerEmptyState` full-page | `icon="brand-facebook"` action → `/settings/channels` |
| Empty (ยังไม่มีประวัติ) | เดียวกัน | `SellerEmptyState compact` | `icon="history"` |
| เมนู sidebar | `src/lib/seller-menu.ts:113-115` | menu item object | `{ url:'/settings/comment-reply', slug:'seller:settings-comment-reply', label:'ตอบกลับคอมเมนต์', icon:'message-reply' }` — 🛑 **ห้ามใส่ slug นี้ใน `*_ONLY_SLUGS` ใด ๆ** (ไม่อยู่ใน array = เห็นทุก vertical โดยอัตโนมัติ ซึ่งตรงกับเจตนา) |

### 1.4 ข้อความ UI (ภาษาไทย — หยิบไปใช้ได้เลย)

- เมนู / หัวข้อ: `ตอบกลับคอมเมนต์` · Breadcrumb: `ตั้งค่า / ตอบกลับคอมเมนต์`
- Badge เพจ: `เชื่อมต่ออยู่` · `โทเคนหมดอายุ` · `เร็ว ๆ นี้`
- สวิตช์ A: `ตอบใต้คอมเมนต์` / คำอธิบาย `ระบบจะตอบข้อความนี้ใต้คอมเมนต์ระดับบนของลูกค้าโดยอัตโนมัติ` / hint `คนอื่นที่เข้ามาดูโพสต์จะเห็นข้อความนี้ — หลีกเลี่ยงข้อความที่ดูเป็นสแปม`
- สวิตช์ B: `ทักแชทส่วนตัวต่อ` / คำอธิบาย `หลังตอบใต้คอมเมนต์แล้ว ระบบจะเปิดห้องแชทกับคนนั้นให้ทันที` / hint `Facebook ให้ทักได้ครั้งเดียวต่อคอมเมนต์ และภายใน 7 วัน · คุยต่อได้เมื่อลูกค้าตอบกลับ`
- Placeholder (ยังไม่เคยตั้ง): `เปิดสวิตช์เพื่อตั้งข้อความ`
- Error: `กรอกข้อความก่อนเปิดใช้งาน` · `ยาวเกิน 1,000 ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก`
- ปุ่ม: `ยกเลิก` · `บันทึก` · `กำลังบันทึก...`
- Toast: `บันทึกการตั้งค่าแล้ว` · `บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง` · `เพจนี้เชื่อมต่อไม่อยู่แล้ว — เชื่อมต่อใหม่ก่อนเปิดใช้งาน` (409)
- Banner: `โทเคนของเพจนี้หมดอายุ ต้องเชื่อมต่อใหม่ก่อนถึงจะตั้งค่าได้` / ปุ่ม `เชื่อมต่อใหม่`
- การ์ด IG: `Instagram · ยังไม่รองรับในรอบนี้` / `คอมเมนต์บน Instagram ต้องขอสิทธิ์เพิ่มจาก Meta ก่อน แล้วให้คุณกดเชื่อมบัญชี IG ใหม่อีกครั้ง`
- ประวัติ: หัวข้อ `ประวัติการตอบอัตโนมัติ` · คอลัมน์ `เวลา` `ผู้คอมเมนต์` `โพสต์` `ตอบใต้คอมเมนต์` `ทักแชท` · badge `ส่งแล้ว` `ข้าม` `ไม่สำเร็จ` · `ไม่ทราบชื่อ` · `(ไม่มีข้อความ)` · ลิงก์ `เปิดห้อง` · ปุ่ม `โหลดเพิ่ม`
- Empty (ไม่มีเพจ): `ยังไม่ได้เชื่อมเพจ Facebook` / `เชื่อมเพจก่อนถึงจะตั้งค่าการตอบกลับคอมเมนต์ได้` / ปุ่ม `เชื่อมเพจ Facebook`
- Empty (ไม่มีประวัติ): `ยังไม่มีการตอบกลับเกิดขึ้น` / `เมื่อระบบตอบหรือข้ามคอมเมนต์ จะบันทึกไว้ที่นี่`

### 1.5 Edge states

- ยังไม่เชื่อมเพจเลย → ทั้งหน้าเป็น `SellerEmptyState` เต็มจอ
- ทุกเพจ TOKEN_INVALID → ทุกการ์ดขึ้น banner แดง สวิตช์ล็อกทั้งหมด
- กำลังบันทึก → ปุ่ม disabled + spinner · สวิตช์/textarea **ของการ์ดนั้นเท่านั้น** disabled ชั่วคราว
- โหลดประวัติหน้าแรก → RSC โหลดพร้อมหน้า ไม่มี spinner (Operate mode: โหลดเข้างานทันที ไม่มี choreography)
- โหลดเพิ่ม → spinner ในปุ่มเดียวกัน ไม่ทับตาราง
- `fromName` เป็น null → `ไม่ทราบชื่อ` สีเทา ไม่ใช่ค่าว่าง
- ข้อความโพสต์ยาวผิดปกติ → `truncate` + `title` เต็มข้อความ
- textarea ว่างขณะสวิตช์ ON → ปุ่มบันทึก **กดได้** (validate ตอนกด ไม่ disable ล่วงหน้า เพราะต้องให้เห็น error ชัดกว่าปุ่มเทาเฉย ๆ)
- ตัวนับ 1000/1000 → `text-danger font-semibold`

---

## หน้า 2: ปุ่ม "ทักแชท" 4 สถานะ (แท็บความคิดเห็น)

**ครอบ:** FR-CR-09..11 · BR-CR-15..19 · AC-CR-17..23

### 2.1 Wireframe

**Desktop — คอลัมน์คอมเมนต์ฝั่งขวาของ `/inbox/comments`**
```
 [ส] สุพจน์ เหลา                                        <- bubble เดิม
     สวยๆครับ
     13:23   ตอบ   [ ทักแชท ]  คงเหลือ 6 วัน 22 ชม. 42 น.    AVAILABLE

 [K] Keng Kiattisak
     ใส่ดรีมได้ไหมคับ
     11:22 [คนตอบแล้ว] ตอบ  [ทักแล้ว · 11:24] เปิดห้องแชท     SENT
       └ [bubble เพจ  ธนภัทร์...  ผู้ดูแลเพจ] ...

 [ป] ปรีชา เชียงสอน
     สนใจ
     07 ส.ค. 22:04 [บอทตอบแล้ว] ตอบ  [ กำลังส่ง... ]          SENDING
       └ [bubble เพจ  ธนภัทร์...  ตอบอัตโนมัติ] ...

 [ว] วิชัย ทองมา
     ราคาเท่าไหร่ครับ
     28 ก.ค. 09:10  ตอบ  [หมดเวลาทักแชท]  เกิน 7 วันแล้ว      EXPIRED
```

**Mobile (390px)** — action row ตกบรรทัดใหม่ตามปกติของ flex row นี้ (**ไม่ใช่** `.card-header` จึงไม่ต้อง `flex-nowrap`)
```
 [ส] สุพจน์ เหลา
     สวยๆครับ
     13:23  ตอบ
     [ ทักแชท ]  6 วัน 22 ชม.

 [ป] ปรีชา เชียงสอน
     สนใจ  [บอทตอบแล้ว]
     22:04  ตอบ
     [ทักแล้ว · 22:04]  เปิดห้องแชท
```

**Tablet (768px)** — เหมือน desktop เมื่อกว้างพอ · ต่ำกว่า `lg` พฤติกรรมเหมือนมือถือ (list column เป็น `lg:w-96` ตามโครงเดิมของไฟล์)

**โมดัลยืนยันก่อนส่ง (ทุก breakpoint — Swal responsive มาตรฐาน)**
```
┌─────────────────────────────────────┐
│  ทักแชทถึง สุพจน์ เหลา                 │
│  ─────────────────────────────────  │
│  ข้อความนี้ส่งถึงเฉพาะ สุพจน์ เหลา      │
│  เป็นการส่วนตัว คนอื่นที่ดูโพสต์จะไม่เห็น │
│  ส่งได้ครั้งเดียว กดพลาดแล้วแก้ไม่ได้    │
│  และคุยต่อได้เมื่อเขาตอบกลับเข้ามา       │
│  ┌───────────────────────────────┐  │
│  │ สวัสดีครับ พอดีเห็นคอมเมนต์...  │  │
│  └───────────────────────────────┘  │
│                  [ยกเลิก] [ส่งข้อความ]│
└─────────────────────────────────────┘
```

### 2.2 พฤติกรรม

สถานะปุ่ม derive จาก 2 สัญญาณ — `privateReplyWindow(c.createdTime)` (มีอยู่แล้ว) + สัญญาณใหม่ "เคยทักคอมเมนต์นี้สำเร็จหรือยัง" ซึ่งต้องมาจาก **แถว log ของ `commentId` นี้เอง ไม่ใช่คีย์คน+โพสต์** (คนละกฎกับ AUTO)

```ts
function resolvePrivateReplyState(c: CommentItem, sendingId: string | null):
  'SENT' | 'SENDING' | 'EXPIRED' | 'AVAILABLE' {
  if (c.privateReplySentAt) return 'SENT'
  if (sendingId === c.id) return 'SENDING'
  if (privateReplyWindow(c.createdTime).expired) return 'EXPIRED'
  return 'AVAILABLE'
}
```

**Data contract ที่ `CommentsClient` ต้องได้รับเพิ่ม:**
```ts
type CommentItem += {
  privateReplySentAt: string | null         // CommentReplyLog.createdAt ที่ privateReplyStatus='SENT' (trigger ใดก็ได้)
  privateReplyConversationId: string | null // conversationId ของแถวเดียวกัน
}
```

**ปุ่มไม่ผูกกับสวิตช์อัตโนมัติ (D-6 / BR-CR-15)** — render เสมอไม่ว่าเพจเปิดสวิตช์ B หรือไม่ · หายไปเฉพาะกรณีเดิม (`c.isFromPage || c.isDeleted`)

**กดปุ่ม (AVAILABLE) → เปิด Swal ก่อนเสมอ (FR-CR-10)** ไม่ยิง API ทันที · prefill จาก `channel.commentPrivateReplyText` ถ้ามี · กดยืนยันจึงยิง `POST /api/chat/comments/{commentId}/private-reply`

**Error mapping (API §5):**

| HTTP / code | Toast | ผลต่อปุ่ม |
|---|---|---|
| 200 | `pacesToast.success('ส่งข้อความสำเร็จ — เกิดห้องแชทใหม่แล้ว')` | → SENT ทันที (optimistic ไม่รีเฟรชหน้า, AC-CR-19) |
| 409 `ALREADY_SENT` | `pacesToast.info('คอมเมนต์นี้ถูกทักไปแล้ว')` | → SENT (refetch แถวนั้นเพื่อได้ `conversationId` จริง) |
| 409 `WINDOW_EXPIRED` | `pacesToast.error('เกิน 7 วันแล้ว ทักแชทไม่ได้อีก')` | → EXPIRED |
| 409 `CHANNEL_NOT_ACTIVE` | `pacesToast.error('เพจนี้เชื่อมต่อไม่อยู่แล้ว ต้องเชื่อมต่อใหม่ก่อน')` | กลับ AVAILABLE |
| 502 `UPSTREAM_ERROR` | `pacesToast.error('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')` | กลับ AVAILABLE (สิทธิ์ยังไม่ถูกใช้จริง) |
| 400 `VALIDATION_ERROR` | fallback `pacesToast.error('พิมพ์ข้อความก่อนส่ง')` | กลับ AVAILABLE (ปกติถูกกันที่ `inputValidator` แล้ว) |

### 2.3 Theme Source Mapping

| Section | Base | Component | หมายเหตุ adapt |
|---|---|---|---|
| แถว action ในคอมเมนต์ | `inbox/comments/CommentsClient.tsx:1582-1606` (**แก้ไฟล์เดิม ไม่ใช่ copy ใหม่**) | native `<button>` | เปลี่ยน `<span>ทักแชท (…)</span>` (คอมเมนต์เดิมบอกว่า "จงใจไม่ทำให้ดูกดได้") เป็นปุ่มจริง 4 สถานะ — **ลบคอมเมนต์นั้นทิ้งด้วย ไม่งั้นกลายเป็นคอมเมนต์ที่โกหก** |
| ปุ่ม AVAILABLE | `paces-component-reference.md` §1 (outline) | `btn btn-sm border-default-300 text-default-800 hover:border-default-400 border inline-flex items-center gap-1` | icon `message-reply` (ตัวเดียวกับเมนู — การกระทำเดียวกันใช้ไอคอนเดียวกัน) |
| Countdown ข้างปุ่ม | `CommentsClient.tsx:1604` | `<span className="text-danger-ink font-semibold">` | **ไม่แตะ** ของเดิมถูกอยู่แล้ว |
| ปุ่ม SENDING | spinner จาก `ChannelsClient.tsx:304-306` | `btn btn-sm bg-default-200 text-default-500 cursor-not-allowed` | label `กำลังส่ง...` |
| ปุ่ม SENT + ลิงก์ | `AutoReplyListing.tsx` disabled-btn pattern + ลิงก์แบบ "ตอบ" | `btn btn-sm border-default-300 text-default-400 border cursor-not-allowed` + `<Link className="hover:underline font-medium">` | label `ทักแล้ว · {formatTimeHM(sentAt)}` |
| ปุ่ม EXPIRED | เหมือน SENDING แต่ไม่มี spinner | `btn btn-sm bg-default-200 text-default-400 cursor-not-allowed` | + `<span className="text-default-500 text-xs">เกิน 7 วันแล้ว Facebook ไม่ให้ทักส่วนตัวอีก</span>` |
| โมดัลยืนยัน | `src/lib/paces-swal.ts` + `ChannelsClient.tsx:155-168` (Base เดิม: `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx`) | `Swal.fire({ html, input:'textarea', inputValue, inputValidator, buttonsStyling:false, customClass })` | **ขยายการใช้ Swal ด้วย `input:'textarea'`** — sweetalert2 รองรับ `html` + `input` พร้อมกัน จึงยังอยู่ในกรอบ HR8 ไม่ต้องประดิษฐ์ modal เอง · ปุ่มใช้ `CONFIRM_BTN.primary` / `CANCEL_BTN` จาก `paces-swal.ts` |
| ป้าย "ตอบอัตโนมัติ" บนบับเบิลเพจ | `CommentsClient.tsx:1556-1561` (ป้าย "ผู้ดูแลเพจ" เดิม — inline text + icon ไม่ใช่ badge pill) | `<span className="text-warning-ink inline-flex items-center gap-0.5 text-2xs font-medium">` | branch: `c.isAutoReply ? (icon 'robot' + 'ตอบอัตโนมัติ') : (icon 'pencil' + 'ผู้ดูแลเพจ')` — **ไม่ใช้ `AutoReplyTag.tsx` เต็มรูป** เพราะมี trace popup ที่ไม่มีข้อมูลรองรับ (ข้อความคงที่ ไม่มีกลุ่มคำให้กาง) |

### 2.4 ข้อความ UI

- ปุ่ม: `ทักแชท` · `กำลังส่ง...` · `ทักแล้ว · {เวลา}` (+ ลิงก์ `เปิดห้องแชท`) · `หมดเวลาทักแชท` (+ `เกิน 7 วันแล้ว Facebook ไม่ให้ทักส่วนตัวอีก`)
- Swal title: `ทักแชทถึง {ชื่อผู้คอมเมนต์}` (ไม่มีชื่อ → `ทักแชทส่วนตัว`)
- 🛑 Swal คำเตือน (**เขียนใหม่ทั้งหมด ห้ามยกคำเตือน "คอมเมนต์นี้เป็นสาธารณะ" มาใช้ซ้ำ — FR-CR-10**):
  `ข้อความนี้ส่งถึงเฉพาะ {ชื่อ} เป็นการส่วนตัว คนอื่นที่ดูโพสต์จะไม่เห็น — ส่งได้ครั้งเดียว กดพลาดแล้วแก้ไม่ได้ และคุยต่อได้เมื่อเขาตอบกลับเข้ามา`
- Swal placeholder: `พิมพ์ข้อความส่วนตัว...` · ปุ่ม `ส่งข้อความ` / `ยกเลิก` · validation `พิมพ์ข้อความก่อนส่ง` / `ยาวเกิน 1,000 ตัวอักษร`
- Toast: ตามตาราง §2.2
- ป้ายบับเบิลบอท: `ตอบอัตโนมัติ`

### 2.5 Edge states

- ปุ่มไม่ render เลยเมื่อ `c.isFromPage` หรือ `c.isDeleted` (เหมือนพฤติกรรมเดิมของ countdown)
- สวิตช์อัตโนมัติปิดอยู่ → ปุ่มยังใช้ได้ปกติทุกสถานะ (D-6)
- API ตอบช้า → SENDING ค้างจนได้ response จริง ไม่มี optimistic timeout
- กด Escape / คลิกนอก Swal → เหมือนกด "ยกเลิก" ไม่ส่ง
- ข้อความว่างหลัง trim → `inputValidator` บล็อกที่ Swal ไม่ปิด modal
- **race: บอททักไปแล้วก่อนผู้ใช้กด** → ปุ่มขึ้น AVAILABLE ตอนโหลดหน้า กดแล้วได้ 409 `ALREADY_SENT` → toast **info** (ไม่ใช่ error แดง เพราะไม่ใช่ความผิดของผู้ใช้) แล้ว sync เป็น SENT

---

## หน้า 3: สถานะ 3 ชั้น + แท็บกรอง

**ครอบ:** FR-CR-12..13 · BR-CR-20..21 · AC-CR-24..29

### 3.1 Wireframe

**Desktop — หัวคอลัมน์รายการโพสต์ (แทนแท็บ 2 ตัวเดิม)**
```
┌ card-header (sticky) ─────────────────────────────┐
│ [ทั้งหมด][Deep][Messenger][Instagram]  [ตัวกรอง v] │  <- เดิม ไม่แตะ
│ ─────────────────────────────────────────────────  │
│ ทั้งหมด   ยังไม่ตอบ(9)   บอทตอบแล้ว(26)  คนตอบแล้ว(7)│  <- ใหม่ 4 แท็บ
│ ▔▔▔▔▔▔                                              │     underline เดิม
└─────────────────────────────────────────────────────┘
 [รูป] โรงงานล้างสต๊อก...      [ยังไม่ตอบ][ทักแชทได้อีก 6 วัน]
 [รูป] โช๊คหลังบรรทุกหนัก...    [บอทตอบแล้ว]
 [รูป] สินค้าอื่น                                  <- คนตอบครบแล้ว = ไม่มี badge
```

**Mobile (390px)** — เลื่อนแนวนอนในหัวสติกกี้
```
┌ sticky header ────────────────────────┐
│ [ทั้งหมด][Deep][Messenger][IG][ตัวกรอง v]│
│┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈│
│ ทั้งหมด│ยังไม่ตอบ(9)│บอทตอบ(26)│คนตอบ(7)│  <- overflow-x-auto
│ ▔▔▔▔                                    │
└────────────────────────────────────────┘
```

**Tablet (768px)** — เหมือน desktop เมื่อกว้างพอ (list column `lg:w-96`) · ต่ำกว่า `lg` เหมือนมือถือ

### 3.2 พฤติกรรม

**แทนแท็บ underline 2 ตัวเดิม (`CommentsClient.tsx:900-932`) ด้วย 4 ตัว** — ใช้โครง `-mb-px border-b-2 px-0 py-1.5` เดิมเป๊ะ

> 🛑 **ไม่ใช้ pill/chip แบบที่ mockup HTML วาด** — โค้ดจริงของหน้านี้มี underline-tab อยู่แล้ว และ Hard Rule 6 บอกว่า layout/integration ต้องตามธีมปัจจุบัน ไม่ใช่ asset ดิบของ mockup · สิ่งที่เอามาจาก mockup คือ **เจตนา** (4 สถานะ + ตัวเลขต้อง sync) ซึ่งนำมาใช้ครบ

**สี badge ตัวเลขต่อแท็บ:**
- ยังไม่ตอบ → `bg-danger` (ยังไม่มีใครแตะ)
- บอทตอบแล้ว → `bg-warning` (งานกลาง — บอทตอบแต่ยังไม่มีคนยืนยัน **ไม่ใช้เขียว** ตาม Verified-Means-Green)
- คนตอบแล้ว → `bg-success` (จบงานจริง — เขียวถูกต้องตามกฎเพราะเป็นสถานะยืนยันแล้ว)

**เปลี่ยน data contract ของ `CommentShowFilter`** — `unanswered`/`done` (boolean คู่ที่ overlap กันได้) ใน `CommentsFilterPanel.tsx` ถูกแทนด้วย single-select `postStatus: 'ALL' | 'UNANSWERED' | 'BOT' | 'HUMAN'` ผูกกับแท็บโดยตรง — **ตัวแปรตัวเดียวคุมทั้งแท็บและ query** ตาม BR-CR-S4 ("ตัวเลขทุกที่บนจอนี้ต้องมาจากการคำนวณชุดเดียวกัน") · `shopComments` toggle ยังอยู่ใน popover "ตัวกรอง" เหมือนเดิม (คนละแกน)

**Badge บนแถวโพสต์** — ตัดสินจาก `p.postStatus` (ตัวที่แย่ที่สุดชนะ, BR-CR-S2): `UNANSWERED` แสดง badge เดิมทั้งคู่ (ไม่แตะ) · `BOT_ANSWERED` แสดง badge ใหม่สีเหลืองที่ตำแหน่งเดียวกัน · `HUMAN_ANSWERED` **ไม่แสดง badge อะไรเลย** — โพสต์ที่จบงานแล้วไม่ควรมีป้ายค้างทุกแถวตลอดไป

### 3.3 Theme Source Mapping

| Section | Base | Component | หมายเหตุ |
|---|---|---|---|
| แถบแท็บสถานะ (ขยาย 2 → 4) | `CommentsClient.tsx:893-933` (แก้ไฟล์เดิม) | native `<button role="tab">` | ขยาย array คงคลาสเดิมทั้งหมด |
| ตัวนับบนแท็บ | `CommentsClient.tsx:924-927` | `<span className="bg-{semantic} text-2xs … rounded-full">` | ขยาย semantic ตามตาราง §3.2 |
| Badge แถวโพสต์ "บอทตอบแล้ว" | `CommentsClient.tsx:1048-1052` (badge "ยังไม่ตอบ" เดิม) | `badge bg-warning/15 text-warning-ink text-2xs inline-flex items-center gap-1` | icon `robot` |
| `CommentsFilterPanel` — ตัดส่วนที่ทับกับแท็บใหม่ | `inbox/comments/CommentsFilterPanel.tsx:142-158` | ลบ `Chip` 2 ตัวแรก เหลือ `shopComments` + รายการเพจ | ลด control ซ้ำที่อาจ drift กับแท็บ |

### 3.4 ข้อความ UI

- แท็บ: `ทั้งหมด` · `ยังไม่ตอบ` · `บอทตอบแล้ว` · `คนตอบแล้ว`
- Badge แถวโพสต์: `ยังไม่ตอบ` (แดง, เดิม) · `บอทตอบแล้ว` (เหลือง, ใหม่) · ไม่มี badge สำหรับคนตอบแล้ว
- Empty ตามแท็บ: `ไม่พบความคิดเห็นตามตัวกรอง` (ใช้ข้อความเดิมที่มีอยู่แล้ว)

### 3.5 Edge states

- ทุกโพสต์อยู่แท็บเดียว → แท็บอื่นแสดง 0 และ **ซ่อน badge ตัวเลข** (pattern เดิม: แสดงเมื่อ count > 0)
- ตัวเลขเกิน 99 → `99+` (pattern เดิม)
- โหมดรวมหลายร้าน (`unified=true`, feature 00037) → ตัวนับต้องรวมทุกร้านใน `shopIds` ใช้ symbol เดียวกับที่มีอยู่ ไม่คำนวณแยก

---

### Impeccable compliance

**Mode: Operate** — ทั้ง 3 หน้าจอเป็น seller console (dashboard/ฟอร์ม/ตาราง ระหว่างทำงาน) ไม่ใช่ brand-facing · ตาม `operate.md`: scanability / consistency / native expectation ชนะการแสดงออก แบรนด์อยู่ในรายละเอียดที่แม่นยำ ไม่ใช่ hero/gradient · ทุก component ยืมจากของที่มีอยู่แล้วในกลุ่มเมนู CHAT เดียวกัน เพื่อให้ "เครื่องมือหายไปในงาน" (PRODUCT.md principle #4)

- **One Voice Rule** — primary `#236dc9` ปรากฏเฉพาะปุ่มบันทึก / ปุ่มเชื่อมต่อ / ป้ายเพจที่เลือก / border แท็บ active · ปุ่มรองทั้งหมด (ยกเลิก, ทักแล้ว, หมดเวลา) เป็น neutral
- **Verified-Means-Green** — เขียวใช้เฉพาะ badge "เชื่อมต่ออยู่" และแท็บ "คนตอบแล้ว" · 🛑 **"บอทตอบแล้ว" ตั้งใจใช้เหลืองไม่ใช่เขียว** เพราะเป็นสถานะกลางที่ยังไม่มีมนุษย์ยืนยัน แม้ฟังดู positive — นี่คือจุดที่พลาดบ่อยที่สุดของกฎนี้
- **Sentence case** — ทุก label/ปุ่ม/badge เป็นประโยคไทยปกติ ไม่มี ALL CAPS
- **Ink-Tinted Shadow** — ไม่มี custom shadow เลย ใช้ `.card`/`btn` default ของ Paces
- **Dashed Card-Header** — การ์ดตั้งค่าใช้เส้นประคั่นสวิตช์ A/B (ต่อยอดลายเซ็นเดิม)
- **anti-slop** — ไม่มี gradient ตกแต่ง ไม่มี hero-metric ไม่มี eyebrow ตัวเล็ก ไม่มีการ์ดซ้อนการ์ด
- **น้ำเสียง** — error บอกทางออกเสมอ (`กรอกข้อความก่อนเปิดใช้งาน` ไม่ใช่ `invalid input`) · คำเตือนกล่องทักแชทอธิบายเหตุผล+ผลที่ตามมา ไม่ใช่คำสั่งห้ามลอย ๆ · toast ไม่มีคำไฮป์
- **พระเอก 1 อย่างต่อหน้า** — หน้า 1 = การ์ดตั้งค่า (ประวัติถอยไปท้ายหน้า ตารางเรียบ) · หน้า 2 = ปุ่ม "ทักแชท" ในบริบทแถวเดิม ยังเป็น `btn-sm` เท่าปุ่ม "ตอบ" ข้าง ๆ (เป็น action เสริม ไม่ใช่ primary ของทั้งหน้า) · หน้า 3 = แท็บสถานะเป็นพระเอกของหัวคอลัมน์

**จุดที่ theme/mockup ขัดกับ Impeccable และตัดสินอย่างไร:**
1. mockup วาด "ชิป pill" แต่โค้ดจริงมี underline-tab อยู่แล้ว → **เลือก underline-tab ของจริง** ตาม HR6 (layout ตามธีมปัจจุบัน) เอาเฉพาะเจตนาจาก mockup
2. mockup วาดสวิตช์คั่นด้วยเส้นประแทน bordered-box ต่อสวิตช์แบบ `AiSettingForm` → **เลือกตาม mockup** เพราะมี 2 สวิตช์ใหญ่ ไม่ใช่ 3 รายการเล็ก — เป็นการเลือก base ที่เหมาะกับจำนวน element ไม่ใช่แก้ตามใจ
3. โมดัลต้องมี textarea แก้ได้ → **ขยาย Swal ด้วย `input:'textarea'`** แทนประดิษฐ์ controlled sheet เอง (แม้มี precedent ที่ `KeywordEditorClient.tsx`) เพราะเนื้อหา (คำเตือน + ฟิลด์เดียว) พอดีกับความสามารถของ Swal ไม่ต้องหนีออกจากกรอบ HR8

---

### Design decisions

1. **แยก "แสดง" ออกจาก "กรอง"** — status เป็น single-select (3 สถานะ mutually exclusive โดยธรรมชาติ) แทน boolean คู่เดิมที่ overlap ได้และเสี่ยงบั๊ก "ตัวเลข 7 กับ 8" ที่เคยเกิดในหน้าพี่น้อง
2. **ใช้ `PageAvatar` + `ChannelBadgeOverlay`** แทน markup ของ `ChannelsClient.tsx` — ให้ตัวตนแบรนด์ Facebook ทุกที่ในกลุ่ม CHAT เป็นภาพเดียวกัน
3. **ประวัติใช้ `.table` เรียบ + "โหลดเพิ่ม"** ไม่ใช่ TanStack DataTable — read-only cursor list ไม่ต้อง sort/filter ซับซ้อน
4. **ป้ายบอทใช้ inline-text pattern เดิม ไม่ใช่ `AutoReplyTag.tsx`** — ไม่มี trace data ให้กาง (ข้อความคงที่ ไม่มีกลุ่มคำแบบ 00023) popup ที่กดแล้วว่างเปล่าแย่กว่าไม่มี popup
5. **`HUMAN_ANSWERED` ไม่มี badge** — ตัดสัญญาณที่ไม่ให้ข้อมูลใหม่ทิ้ง

---

### ข้อที่ Controller ตัดสินแล้ว (จาก Open Questions ของ ux)

| # | คำถาม | คำตัดสิน |
|---|---|---|
| 1 | field `privateReplySentAt` / `privateReplyConversationId` บน `CommentItem` | **ทำ** — ขยาย `getPostComments()` ให้ join `CommentReplyLog` ที่ `commentId` (อยู่ในแผน Task 8 อยู่แล้ว) · อัปเดต `API.md` ตามในรอบเดียวกัน |
| 2 | `ChannelOption` ต้องพ่วง `commentPrivateReplyText` สำหรับ prefill | **ทำ** — เพิ่ม field และส่งจาก RSC page ที่รวบรวม channels |
| 3 | `connectedAt` ไม่มีใน API §4.1 (mockup วาด "เชื่อมเมื่อ 12 มิ.ย. 2569") | **ตัดบรรทัดนั้นออก** เหลือ subtitle แค่ `Facebook Page` — ไม่ขอเพิ่ม field เข้า API ที่ freeze แล้วเพื่อข้อความประดับ |
| 4 | ยืนยันไอคอน `message-reply` | **ยืนยันแล้ว** — `tabler:message-reply` มีจริง (ตรวจกับ `api.iconify.design` 2026-08-08) |
| 5 | shape ของ `postStatus` / `statusCounts` | **ยืนยันตามที่ ux ออกแบบ** — service คืน `{ all, unanswered, botAnswered, humanAnswered }` คำนวณจาก `deriveCommentState()`/`derivePostState()` ที่แผน Task 9 กำหนดไว้แล้ว · ⚠️ ฟังก์ชันจริงชื่อ **`countUnansweredForShops`** (พหูพจน์ รับ `shopIds[]`) เปลี่ยนไปตั้งแต่ feature 00037 — ห้ามย้อนเป็นเอกพจน์ |

---

# ฉบับแก้ครั้งที่ 2 — 2026-08-09 (หน้าตั้งค่า: ประวัติการตอบ)

> **เหตุที่แก้:** user ทักหลังขึ้น prod — *"ทำไม UI มันไม่เหมือนหน้า `/settings/auto-reply` เลย ทั้งความสวยงาม การใช้ PACES Theme การทำ Modal"*
>
> 🛑 **ต้นเหตุคือสเปกฉบับแรกเอง** — §1.3 เขียนว่า *"ไม่ใช้ TanStack `DataTable` (over-kill สำหรับ read-only cursor list)"* เหตุผลฟังขึ้นทางเทคนิค แต่ผลลัพธ์คือหน้าที่ดูเป็นคนละคุณภาพกับหน้าข้าง ๆ — ตรงกับที่ `docs/conventions/sibling-surface-parity.md` เตือน: **ธีมบอกว่า "ปุ่มหน้าตายังไง" หน้าพี่น้องบอกว่า "หน้านี้ควรมีอะไรบ้าง"**

## สิ่งที่ **ไม่** เปลี่ยน

**การ์ดตั้งค่าต่อเพจ (สวิตช์ + textarea) ถูกอยู่แล้ว** — ยก pattern จาก `AiSettingForm.tsx:157-282` มาถูกต้อง (label→description→`form-switch`, `form-textarea`+ตัวนับ, ปุ่ม primary) · ที่ต่างจาก `AiSettingForm` มี 2 จุดและมีเหตุผลรองรับทั้งคู่: card-header เป็นรูปเพจ+ชื่อ+badge (เพราะมี N การ์ด ต้องบอกว่าใบนี้คือเพจไหน) และคั่นสวิตช์ด้วยเส้นประ (มี 2 บล็อกใหญ่ ไม่ใช่ 3 รายการเล็ก)

## สิ่งที่เปลี่ยน — 5 จุด

| # | เดิม | ใหม่ | เหตุผล |
|---|---|---|---|
| 1 | `<table>` ประกอบมือ | **`DataTable`** (TanStack `manualPagination: true`, ปิด sort/columnFilter ทั้งหมด) | ได้ `thead-sm uppercase bg-light/25` · `table-hover` · mobileCard switch ฟรี โดยไม่ต้องโหลดข้อมูลทั้งหมดเข้า memory |
| 2 | ปุ่ม "โหลดเพิ่ม" (accumulate) | **`TablePagination`** เลขหน้าใน `card-footer` + "แสดง X–Y จาก N รายการ" | 🛑 **ต้องแก้ API เพิ่ม `total`** |
| 3 | ตาราง↔การ์ดสลับที่ `md` (768) | **สลับที่ `lg` (1024)** ตามค่าจริงของ `DataTable` | ใช้ component เดียวกันแล้ว behavior ต่างกันเอง = สร้างความไม่สม่ำเสมอแบบใหม่ · แลกกับแท็บเล็ตไม่เห็นตารางจริง (ยอมรับแล้ว) |
| 4 | mobileCard ไม่มีบรรทัดโพสต์เลย | **เพิ่มบรรทัดโพสต์** (truncate) + chevron แตะดูรายละเอียด | ช่องว่างเนื้อหาจริงที่เจอระหว่างตรวจ ไม่ใช่คอสเมติก |
| 5 | ไม่มี modal เลย · skip reason อยู่ใน `title` เท่านั้น | **`pacesAlert` "ดูรายละเอียด"** (เวลา/ผู้คอมเมนต์/โพสต์/สถานะ+เหตุผลเต็ม) | `title` แตะไม่ได้บนทัชสกรีน ซึ่งเป็นอุปกรณ์หลักตาม PRODUCT.md |

**ไม่เพิ่มช่องค้นหา** ทั้งที่หน้าพี่น้องมี — เพราะค้นได้แค่หน้าที่โหลดมา จะ "โกหก" ผู้ใช้ว่าค้นได้ทั้งประวัติ (anti-slop: copy ต้องบอกสิ่งที่ระบบทำได้จริง)

## Theme Source Mapping (ฉบับแก้)

| Section | Base (ไฟล์ + บรรทัด) | Component | adapt |
|---|---|---|---|
| Toolbar ใน `card-header` | `settings/auto-reply/AutoReplyListing.tsx:376-423` | native div + `FilterDropdown` + `ChoiceSelect` | ตัดช่องค้นหา + ปุ่มสร้างออก (หน้านี้ไม่มี action สร้าง) |
| Page-size selector | `AutoReplyListing.tsx:405-413` | `ChoiceSelect` | options `[5,10,15,20]` · `hidden lg:block` เหมือนพี่น้อง |
| Column defs | `AutoReplyListing.tsx:175-260` | `createColumnHelper<LogRow>()` | 5 คอลัมน์ + 1 action · ทุกคอลัมน์ `enableSorting: false` (log เรียงตามเวลาเสมอ ไม่มีมิติให้ sort) · `โพสต์` = `hidden xl:table-cell` |
| `useReactTable` | `AutoReplyListing.tsx:262-278` | `useReactTable` | **ตัด** `getSortedRowModel`/`getFilteredRowModel`/`getPaginationRowModel`/`globalFilterFn` (manual mode — data = หน้าปัจจุบันเท่านั้น) |
| ตาราง + mobileCard switch | `src/components/table/DataTable.tsx:55-145` | `DataTable` | breakpoint `lg` ตาม default |
| Footer pagination | `AutoReplyListing.tsx:470-487` + `src/components/table/TablePagination.tsx` | `TablePagination` | `pageCount = Math.ceil(total/pageSize)` คำนวณเอง (manual mode) |
| Mobile row | `AutoReplyListing.tsx:432-467` | native `<button>` | ทั้งแถวเป็นปุ่ม (แตะได้) + `chevron-right` ท้ายแถว + เพิ่มบรรทัดโพสต์ |
| ปุ่ม "รายละเอียด" (desktop) | `AutoReplyListing.tsx:237-243` | native `<button className="btn btn-icon btn-sm border-default-300 …">` | icon `info-circle` |
| Modal รายละเอียด | `src/lib/paces-swal.ts:101-115` | `pacesAlert` | 🛑 ดูข้อควรระวังด้านล่าง |

## 🛑 ข้อควรระวังด้านความปลอดภัย

`commenterName` / `postMessage` เป็นข้อความจากผู้ใช้ Facebook ภายนอก — `pacesAlert` set เนื้อหาผ่าน `innerHTML` **ต้อง escape (`&` `<` `>` `"` `'`) ก่อน interpolate ทุกครั้ง** ไม่งั้นเปิดช่อง XSS ที่มาจากคอมเมนต์ลูกค้า · label/wrapper ที่ developer เขียนเองเป็น static string ปลอดภัยอยู่แล้ว

(คลาสเดียวกับที่ Task 8 เลือกใช้ Swal `text` แทน `html` สำหรับชื่อคนคอมเมนต์)

## API ที่ต้องแก้

**`GET /api/shops/comment-reply/logs`** — เพิ่ม field `total`:
```ts
const [rows, total] = await Promise.all([
  prisma.commentReplyLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: {...} }),
  prisma.commentReplyLog.count({ where }),
])
```
`cursor`/`take`/`shopChannelId` **ไม่เปลี่ยน** (cursor เป็น skip offset อยู่แล้ว ใช้เป็น `pageIndex * pageSize` ได้ตรง ๆ) · **ถอด `hasMore` ทิ้ง** — มีหน้าเดียวที่เรียก endpoint นี้ ไม่ต้องเก็บไว้เพื่อ back-compat
**`page.tsx`** (RSC) ต้องเพิ่ม `count()` คู่กัน ให้หน้าแรกมี `total` ตั้งแต่ SSR

## Edge states

- **0 log** → `SellerEmptyState compact` เดิม · ซ่อน toolbar+pagination ทั้งคู่
- **1 หน้าพอดี** → footer ยังโชว์ "แสดง 1–N จาก N รายการ" ปุ่ม prev/next disabled (เหมือนพี่น้อง ไม่ซ่อน footer)
- **`postMessage` null** → ตารางโชว์ `(ไม่มีข้อความ)` · **mobileCard ไม่โชว์บรรทัดนั้นเลย** (พื้นที่จำกัด อย่ากินที่ด้วยข้อความว่าง) · modal โชว์ `(ไม่มีข้อความ)`
- **เปลี่ยน filter หรือ page-size** → reset `pageIndex = 0` เสมอ
- **เปลี่ยนหน้าแล้ว fetch ล้ม** → toast error + **คงหน้าเดิมไว้** ไม่ล้างตารางเป็นเปล่า
- **กำลังโหลดหน้าใหม่** → dim ตาราง (`opacity-50 pointer-events-none`) + spinner

### Impeccable compliance

**Mode: Operate** — เลือก **Consistency over surprise** ตรง ๆ ในข้อ 3 (ยอมเสียตารางบนแท็บเล็ตเพื่อให้ behavior ตรงกับทุกหน้าที่ใช้ `DataTable`)

- **One Voice** — primary เพิ่มเฉพาะ `TablePagination` active page + `FilterDropdown` ตอน active ไม่มีจุดใหม่เกินจำเป็น
- **Verified-Means-Green** — ไม่แตะ badge สถานะ log เดิม
- **anti-slop** — ไม่มี gradient/hero/การ์ดซ้อนการ์ด · `DataTable` ไม่เพิ่ม wrapper card ซ้อน
- **Sentence case** — CSS `uppercase` บน header เป็น no-op กับอักษรไทย ไม่ขัดกฎ
