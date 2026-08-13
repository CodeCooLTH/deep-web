<!-- Feature 00048 - Customer File Library -->

---
title: "UX Design Spec — คลังไฟล์ต่อลูกค้า (Customer File Library)"
owner: shinobu22
status: approved
created: 2026-08-13
tags: [ux, design-spec, feature, 00048, chat, inbox, paces]
related: ["[[PRD]]", "[[BRD]]", "[[paces-component-reference]]"]
---

> **โมดูล:** 00048-CustomerFileLibrary
> **ประเภทเอกสาร:** UX Design Spec (Hard Rule 8 gate — ออกโดย `safepay-ux`, กระทบยอดโดย Controller)
> **Mode:** Operate (เครื่องมือปฏิบัติงานของผู้ขาย ไม่ใช่ surface แบรนด์)
> **สถานะ:** ผ่านการเคาะกับ user ครบทุกข้อขัดแย้ง 2026-08-13

# UX Design Spec: คลังไฟล์ต่อลูกค้า

---

## 0. ข้อเท็จจริงจากโค้ดจริงที่ต้องอ่านก่อน (ล้มสมมติฐานเดิม 3 ข้อ)

| # | สมมติฐานเดิม | ความจริงจากโค้ด | ผลต่อการออกแบบ |
|---|---|---|---|
| 1 | "เดสก์ท็อปเปิด popover ของ `MessageActionBubble` ตอน hover" | `useLongPress` (`src/hooks/useLongPress.ts`) รับ **touch เท่านั้น** ไม่มี `onMouseDown`; popover ที่เปิดจากปุ่มหน้ายิ้มบนเดสก์ท็อปเป็น `mode:'reactions'` ซึ่ง `actionTargetActions` คืน `[]` (ChatThread.tsx:1475) ⇒ **ไม่แสดงแถวคำสั่งเลย**; ปุ่มตอบกลับ/คัดลอกบนเดสก์ท็อปเป็นปุ่มไอคอนแยกที่โผล่ตอน hover (ChatThread.tsx:2634-2673) | **มติ Q35 = (ก)** เพิ่ม `SaveToLibraryButton` เข้ากลุ่มปุ่ม hover เดิม ไม่รื้อ popover รีแอ็กชัน |
| 2 | "กดช่องไหนก็เข้า lightbox ตัวเดิม" | `imageSlides` (ChatThread.tsx:1703-1729) สร้างจาก `type==='IMAGE'` + `m.cards[].imageFileId` **เท่านั้น** — ไม่มีสไลด์วิดีโอ; VIDEO ในเธรดเล่นอินไลน์ในบับเบิล | **มติ Q36 = (ข)** วิดีโอเปิดเป็นการ์ดรายละเอียดที่มี `<video controls>` ไม่ต่อ Video plugin |
| 3 | "แผงลูกค้าแตกที่ 768/1024" | จุดเปลี่ยนจริงคือ **1024** (sheet → modal กลางจอ `max-w-sm`) และ **1280** (`xl:block` = คอลัมน์ persistent, `page.tsx`) ⇒ **768 ไม่ใช่จุดเปลี่ยนอะไรเลย** — ที่ 820px ยังเป็น bottom-sheet เหมือน 375px ทุกประการ | wireframe 3 จอยังทำตามที่ขอ แต่จอ 820 มีพฤติกรรมเท่าจอ 375 |

**ข้อกำหนดทางสถาปัตยกรรมที่พบระหว่างอ่านโค้ด (developer ต้องรู้ก่อนเริ่ม):** `imageSlides` ต้องพก field เพิ่มต่อสไลด์ (เช่น `libraryEligible: boolean` + `messageId`) เพราะกฎ "ซ่อน action เมื่อเป็นสติกเกอร์/รูปการ์ด carousel" ต้องมีผลแม้เปิดผ่าน lightbox ซึ่งใช้ชุดสไลด์ร่วมกัน — ปัจจุบันสไลด์เก็บแค่ `src` กับ `download`

---

## 1. Layout (ASCII wireframe)

### Surface 1 — action บนข้อความ (2 กลไก คนละสายโค้ด ผลลัพธ์เดียวกัน)

```
มือถือ/แท็บเล็ต <1024 — กดค้าง → เบลอทั้งเธรด + โคลนบับเบิลลอยขึ้น
┌──────────────────────────────┐
│  ░░░░ เธรดเบลอ (blur-sm) ░░░ │
│      ┌────────────────┐      │  ← โคลนบับเบิลที่กดค้าง
│      │   [ภาพ/ไฟล์]   │      │
│      └────────────────┘      │
│  ┌──────────────────────┐    │
│  │ 😀 ❤️ 👍 😮 😢 🙏  + │    │  ← แถวรีแอ็กชัน (ถ้ามี)
│  ├──────────────────────┤    │
│  │ ↩️     📇      🔖   📋│    │  ← แถวคำสั่ง
│  │ตอบกลับ สั่งซื้อ เก็บ  คัดลอก│    │     "เก็บเข้าคลัง" = item ใหม่
│  └──────────────────────┘    │
└──────────────────────────────┘
ทุกปุ่มในแถวสืบทอด min-h-11 (44px) จาก MessageActionBubble เดิม — ไม่ต้องแก้

เดสก์ท็อป ≥1024 — hover แถวข้อความ → กลุ่มปุ่มไอคอนโผล่ข้างบับเบิล
┌─────────────────────────────────────────┐
│  [รูป/ไฟล์ที่ลูกค้าส่ง]   ↩️ 🔖 😊 📇     │  ← lg:group-hover:flex
└─────────────────────────────────────────┘
   SaveToLibraryButton = ไอคอนวงกลม size-7 (28px) เท่า CopyMessageButton
   ต่างจาก Copy ตรงที่สะท้อน "สถานะจริง" ไม่ใช่ flash ชั่วคราว
```

### Surface 2 — ปุ่มใน Lightbox ของเธรด

```
เต็มจอทุก breakpoint (Lightbox = fixed inset-0 ไม่ตอบสนอง breakpoint ของ Paces)
┌─────────────────────────────────────────┐
│ ✕                      🔖  🔍  ⬇️        │ ← toolbar: เก็บเข้าคลัง(ใหม่)/ซูม/ดาวน์โหลด
│              [ รูปเต็มจอ ]               │
│  ‹                                    ›  │
└─────────────────────────────────────────┘
```
ซ่อนปุ่มนี้เมื่อสไลด์ปัจจุบันเป็นสติกเกอร์ (`isStickerHint`) หรือรูปจากการ์ด Meta/สินค้า
(`onOpenImage` → คีย์ `${id}:${i}`) ⇒ ต้องอ่านจาก `libraryEligible` ของสไลด์นั้น

### Surface 3 — section "คลังไฟล์" (ล่างสุดของแท็บ "ข้อมูลลูกค้า")

```
มือถือ 375px (bottom-sheet) — งบพื้นที่คิดที่ 320px ซึ่งเป็นจอแคบสุดที่รองรับ
┌────────────────────────────────┐ sheet = 320px
│ ▬▬▬  (grip)                    │
│ ข้อมูลลูกค้า              ✕    │
├────────────────────────────────┤ p-4 → เนื้อที่ = 320-32 = 288px
│ [avatar] สมชาย ใจดี            │
│ ข้อมูลลูกค้า | คำสั่งซื้อ | โน้ต │
│ ... (สถิติ / การเชื่อมลูกค้า) ...│
│                                 │
│ คลังไฟล์  [12]                  │  ← section ใหม่ ล่างสุด
│ ┌──────┬──────┬──────┐         │  grid-cols-3 gap-1 (4px)
│ │ img  │ img  │ 📄   │         │  ช่อง = (288-8)/3 = 93.3px
│ ├──────┼──────┼──────┤         │  สูง = 93.3 × 5/4 = 116.7px
│ │ vid ▶│ img  │ img  │         │
│ ├──────┼──────┼──────┤         │
│ │ img  │ลบแล้ว│ img  │         │  รวมสูง 3×116.7 + 2×4 = 358px
│ └──────┴──────┴──────┘         │
│      ดูไฟล์ทั้งหมด (12) ›       │  (โผล่เมื่อ N>9 เท่านั้น)
└────────────────────────────────┘

แท็บเล็ต 820px — เหมือนมือถือทุกประการ (ยังเป็น bottom-sheet)
เนื้อที่ 788px → ช่อง ~260px (ใหญ่ขึ้น แต่ยัง 3 คอลัมน์)

เดสก์ท็อป ≥1280px (คอลัมน์ persistent w-96 = 384px)
เนื้อที่ = 384-32 = 352px → ช่อง (352-8)/3 = 114.7px สูง 143.3px
ที่ 1024–1279px = modal กลางจอ max-w-sm (384px) เนื้อหาเหมือนกันเป๊ะ
```

### Surface 4 — โมดัล "ดูทั้งหมด" + แถบรายละเอียด

```
มือถือ/แท็บเล็ต <1024 — bottom-sheet เต็มจอ ซ้อนบนแผงลูกค้าเดิม (ไม่ navigate)
┌────────────────────────────────┐
│ ▬▬▬                             │
│ คลังไฟล์ · สมชาย ใจดี      ✕   │
├────────────────────────────────┤
│ ┌────┬────┬────┐  grid-cols-3   │
│ │img │img │📄  │                │
│ ├────┼────┼────┤                │
│ │vid │img │img │                │
│ └────┴────┴────┘                │
│      ⟳ กำลังโหลด...  ← sentinel │  (IntersectionObserver หน้าละ 60)
└────────────────────────────────┘

เดสก์ท็อป ≥1024 — modal กลางจอ max-w-3xl (768px) · 4 คอลัมน์ (มติ Q40)
┌──────────────────────────────────────────────┐
│ คลังไฟล์ · สมชาย ใจดี                    ✕   │
├──────────────────────────────────────────────┤
│ ┌──────┬──────┬──────┬──────┐                │  (768-40-3×4)/4 = 176px/ช่อง
│ │ img  │ img  │  📄  │ vid ▶│                │
│ ├──────┼──────┼──────┼──────┤                │
│ │ img  │ img  │ img  │ img  │   ⟳ โหลดต่อ   │
│ └──────┴──────┴──────┴──────┘                │
└──────────────────────────────────────────────┘

กด tile รูป → Lightbox เดิม + แถบรายละเอียดท้ายจอ (มติ Q39 = โทนเข้มต่อเนื่อง)
┌─────────────────────────────────────────┐
│ ✕                      🔖  🔍  ⬇️        │
│              [ รูปเต็มจอ ]               │
│  ‹                                    ›  │
├───────────────────────────────────────────┤ ← render.slideFooter (dark scrim)
│ ส่งโดยสมชาย ใจดี · 08 ส.ค. 2569           │
│ เก็บโดย ร้านค้าดี (คุณ) · 12 ส.ค. 2569    │
│ [แก้ไข] [ดาวน์โหลด] [ดูในแชท] [เอาออกจากคลัง]│
└─────────────────────────────────────────┘

กด tile วิดีโอ/ไฟล์เอกสาร → การ์ดรายละเอียดสไตล์ Paces (พื้นสว่าง ไม่ใช่ lightbox)
┌────────────────────────────────┐
│ 📄 ใบเสนอราคา-สมชาย.pdf    ✕   │
│    1.2 MB                       │
│ ── หรือกรณีวิดีโอ ────────────  │
│ [ <video controls> เล่นในการ์ด ] │
│ ส่งโดยสมชาย ใจดี · 08 ส.ค.       │
│ เก็บโดย ร้านค้าดี (คุณ) · 12 ส.ค.│
│ [เปิดไฟล์] [ดาวน์โหลด]          │
│ [แก้ไข]   [ดูในแชท]             │
│      เอาออกจากคลัง              │
└────────────────────────────────┘
```

---

## 2. Section breakdown

**S1 มือถือ** — เพิ่ม 1 item ใน `actionTargetActions` (ChatThread.tsx:1473-1543) key `'save-to-library'` icon `bookmark-plus` เงื่อนไข: `type` ∈ {IMAGE (และ `!isSticker`), VIDEO, FILE} และไม่ใช่ข้อความ optimistic/ลบแล้ว. สลับเป็น "เอาออกจากคลัง" + `bookmark-filled` เมื่ออยู่ในคลัง (ต้องมี field ใหม่ใน `ChatMessageView`). แตะแล้วเมนูปิดทันทีตาม behavior เดิมของทุก action ในไฟล์นี้ แล้วยิง API เบื้องหลัง จบด้วย `pacesToast`

**S1 เดสก์ท็อป** — `SaveToLibraryButton` ก๊อปโครงจาก `CopyMessageButton` (ไอคอนวงกลม size-7, `lg:group-hover:flex`) ต่างตรงที่เป็น persistent state ไม่ใช่ transient flash. ต้องใส่ **2 จุด**: `actionCluster` (บับเบิลเดี่ยว) และกลุ่มปุ่มของอัลบั้ม (ChatThread.tsx:2426-2438)

**S2** — เพิ่ม custom button เข้า `toolbar` prop ของ `<Lightbox>` (ChatThread.tsx:3764) ควบคู่ `Zoom`/`LightboxDownload` โดยผูกสถานะกับ `messageId` ของสไลด์ที่เปิดอยู่

**S3** — ต่อท้ายสุดของ `tab === 'customer'` panel ใน `CustomerPanelBody` ใต้บล็อก "การเชื่อมกับลูกค้าในระบบ" · พรีวิว 9 ไฟล์ เรียง **เวลาที่ส่งจริง ใหม่→เก่า** (มติ Q23 — ไม่ใช่ `savedAt`) · tile รูป = thumbnail `object-cover` · tile วิดีโอ = เฟรมแรกจริงจาก `<video preload="metadata">` + badge เล่นมุมล่างขวา · tile เอกสาร = ไอคอนล้วน ไม่มีภาพตัวอย่าง

**S4** — React-controlled overlay (sheet <1024 / modal ≥1024 `max-w-3xl`) โครงเดียวกับ `CustomerPanelSheet.tsx` · `useLockBodyScroll` + `overscroll-contain` บังคับ · โหลดเพิ่มด้วย `IntersectionObserver` sentinel หน้าละ 60 (ก๊อป pattern `OrdersList` ในไฟล์เดียวกัน) · ปุ่ม "แก้ไข" เปิด Swal 2 ช่อง (ชื่อไฟล์ + โน้ต) ตาม Hard Rule 8

---

## 3. Theme Source Mapping (สำหรับ `Base:` line ของ commit — HR1/HR3)

| Section | ต้นทาง | Pattern | หมายเหตุ adapt |
|---|---|---|---|
| S1 mobile action item | `ChatThread.tsx:1473-1543` (`actionTargetActions`) | เพิ่ม `MessageAction` 1 รายการ | `MessageActionBubble.tsx` **ไม่ต้องแก้โครงเลย** |
| S1 desktop button | `ChatThread.tsx:175-207` (`CopyMessageButton`) | ก๊อปโครงเป็น `SaveToLibraryButton` | transient-flash → persistent-state |
| S1 desktop จุดแทรก | `ChatThread.tsx:2634-2673` + `2426-2438` | `<div className="flex items-start gap-0.5">` | **ต้องแก้ 2 จุด** (บับเบิลเดี่ยว + อัลบั้ม) |
| S2 lightbox toolbar | `node_modules/yet-another-react-lightbox/dist/plugins/download/index.js` (`addToolbarButton`+`IconButton`+`renderIcon`) | เพิ่มปุ่มที่ 3 ตาม pattern เดิม | ไม่ใช่ Paces primitive — เป็น chrome ของไลบรารีที่ codebase ยอมรับอยู่แล้ว (Zoom/Download ก็ไม่ใช่) |
| S3 tile รูป | `PhotoAlbum.tsx:19-70` (`AlbumCell`) | `<button className="relative block cursor-zoom-in overflow-hidden rounded bg-default-100">` + `<img object-cover>` + error fallback | เปลี่ยน aspect เป็น `aspect-4/5` คงที่ (fraction utility ของ Tailwind 4 ไม่ใช่ arbitrary — precedent `PhotoAlbum.tsx:87`) |
| S3 tile วิดีโอ | ไม่มี theme match ตรง — โครงจาก `AlbumCell` + overlay จาก `PhotoAlbum.tsx:64` (`bg-dark/60` ของ "+N") | `<video preload="metadata">` + badge `player-play-filled` | **carve-out HR1** ระบุเหตุผลไว้ในคอมเมนต์ |
| S3 tile เอกสาร | `ChatThread.tsx:392-399` (`ATTACHMENT_ICON`) | ชิปไอคอนตามชนิดไฟล์ | **แก้คอนทราสต์**: `bg-{semantic}/15 text-{semantic}-ink` (ของเดิม `text-warning` เปล่าตกเกณฑ์) |
| S3 tile ไฟล์หาย | `ChatThread.tsx:320-322` (placeholder ของ `MetaGenericCardCarousel`) | ไอคอนกลางช่อง | เพิ่ม caption `text-2xs` "ไฟล์ถูกลบแล้ว" (ของเดิมมีแต่ไอคอน) |
| S3 หัว section + badge | `CustomerPanel.tsx:766-767` | `badge bg-default-100 text-default-700 text-2xs` | ใช้ class เดิมเป๊ะ |
| S3 empty state | `src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx` | `<SellerEmptyState compact icon="folder" …/>` | ใช้ตรง ๆ |
| S3 ลิงก์ดูทั้งหมด | `dashboard/components/ActivityTimeline.tsx:75-82` | `text-primary text-sm inline-flex items-center gap-0.5` | `<Link>` → `<button onClick>` (เปิดโมดัลในหน้าเดิม) + `justify-center w-full` |
| S4 overlay shell | `CustomerPanelSheet.tsx` (Base: `OrderQrSheet.tsx` → `theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx` + `ui/modals/page.tsx`) | sheet(<1024)/modal(≥1024) | `lg:max-w-sm` → `lg:max-w-3xl` |
| S4 modal header | `theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx:66-75` | `border-b p-5 flex items-center justify-between` | React-controlled ไม่ใช่ `data-hs-overlay` (เหตุผลเดียวกับ CustomerPanelSheet) |
| S4 infinite scroll | `CustomerPanel.tsx:534-563` (`OrdersList`) | `loadMore` + `IntersectionObserver` + sentinel | เปลี่ยน endpoint + page size 60 |
| S4 lightbox detail strip | `render.slideFooter` ของ `yet-another-react-lightbox` | ไม่มี Paces primitive | ใช้ Photo-Scrim Exception ของ Impeccable (มติ Q39) |
| S4 การ์ดรายละเอียด (วิดีโอ/เอกสาร) | `theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx` (standard-modal) | modal เล็กพื้น `bg-card` ปกติ | ต่างจาก strip เพราะไม่ได้อยู่บนพื้นดำของ lightbox |
| S4 แก้ชื่อ/โน้ต | `src/lib/paces-swal.ts` (precedent `pacesConfirmWithReason`) + `CustomerCrmSection.tsx:243` (`form-input min-h-32`) | `Swal.fire` 2 ช่อง | ต้องเขียน helper ใหม่ (ของเดิมรับ input เดียว) |
| toast | `src/lib/paces-toast.ts` | `pacesToast.success/.error` (บนขวา) | **ยกเว้นใน lightbox** — ใช้ icon-swap แทน |

---

## 4. Content outline (คำทั้งหมดอยู่ใน SSOT เดียว `src/lib/customer-file-library.ts`)

| จุด | ข้อความ |
|---|---|
| action ยังไม่เก็บ | "เก็บเข้าคลัง" (icon `bookmark-plus`) |
| action เก็บแล้ว | "เอาออกจากคลัง" (icon `bookmark-filled` — **ไม่ใช่ `bookmark-off` ซึ่งสื่อว่าปิดใช้งาน**) |
| toast สำเร็จ | "เก็บเข้าคลังแล้ว" / "เอาออกจากคลังแล้ว" |
| toast ล้มเหลว | "เก็บเข้าคลังไม่สำเร็จ ลองใหม่อีกครั้ง" / "เอาออกจากคลังไม่สำเร็จ ลองใหม่อีกครั้ง" |
| หัว section | "คลังไฟล์" + badge จำนวน |
| empty state | หัว "ยังไม่มีไฟล์ในคลัง" · รอง "กดค้างที่รูป วิดีโอ หรือไฟล์ในแชท แล้วเลือก \"เก็บเข้าคลัง\"" |
| ลิงก์ดูทั้งหมด | "ดูไฟล์ทั้งหมด ({N})" |
| tile ไฟล์หาย | "ไฟล์ถูกลบแล้ว" |
| aria-label | "รูปจาก {ชื่อ} · {วันที่}" / "วิดีโอจาก {ชื่อ} · {วันที่}" / "{ชื่อไฟล์} จาก {ชื่อ} · {วันที่}" |
| หัวโมดัล | "คลังไฟล์ · {ชื่อลูกค้า}" |
| แถบรายละเอียด | "ส่งโดย {ชื่อ} · {วันที่ส่ง}" / "เก็บโดย {ชื่อผู้เก็บ} · {วันที่เก็บ}" |
| ปุ่มในรายละเอียด | "แก้ไข" / "ดาวน์โหลด" / "ดูในแชท" / "เอาออกจากคลัง" / "เปิดไฟล์" |
| Swal แก้ไข | หัว "แก้ไขไฟล์" · label "ชื่อไฟล์" / "โน้ต" · placeholder "จดไว้ว่าทำไมถึงเก็บไฟล์นี้..." · ปุ่ม "บันทึก" · toast "บันทึกแล้ว" |

> คำว่า **"บันทึก"** ปรากฏจุดเดียวคือปุ่มยืนยันฟอร์มแก้ไข ซึ่งเป็นคนละบริบทกับ "ดาวน์โหลด"/"เก็บเข้าคลัง" — ไม่ชนกันตามที่ HR16 ห้าม

---

## 5. Edge states

| State | S1/S2 (action) | S3 (panel) | S4 (modal) |
|---|---|---|---|
| **empty** | ไม่มี concept | `SellerEmptyState compact icon="folder"` แทนกริด · **ไม่เติมช่องเทาให้ครบ 9** | เปิดไม่ได้ตอน N=0 (ลิงก์ไม่โผล่ที่ N≤9) |
| **loading** | disable ปุ่มชั่วคราวกัน double-tap ไม่ต้องมี spinner | skeleton `bg-default-100 h-40 animate-pulse rounded-lg` (pattern เดียวกับ `crmSlot` CustomerPanel.tsx:656) | sentinel: spinner `border-primary animate-spin` + "กำลังโหลด..." |
| **error** | toast error | "โหลดคลังไฟล์ไม่สำเร็จ" + ปุ่ม "ลองใหม่" (pattern `crmSlot` L657-665) | เหมือน panel |
| **ไฟล์หาย (404)** | ไม่เกี่ยว | tile = ไอคอน + "ไฟล์ถูกลบแล้ว" · **กดเปิด lightbox ไม่ได้** แต่เปิดการ์ดรายละเอียดได้เพื่อเอาออก | การ์ดรายละเอียดตัดปุ่ม เปิดไฟล์/ดาวน์โหลด/ดูในแชท ออก เหลือ metadata + เอาออกจากคลัง |
| **เก็บแล้ว (toggle)** | icon+label สลับ | — | สลับ optimistic + toast (ยกเว้นใน lightbox = icon-swap) |
| **ชื่อยาวผิดปกติ** | label สั้นอยู่แล้ว | section ใหม่ต้องไม่มี fixed-width ที่ดันความกว้างการ์ด (กันซ้ำรอย prod 2026-08-12) | ชื่อไฟล์: `truncate` + `min-w-0` ที่กล่อง + `max-w-full` ที่ลูก ครบชุด · ชื่อเต็มใน `title=` |
| **0 / หลักล้าน** | — | badge = 0 → แสดง empty state ไม่ render badge "0" | "(0)" ไม่มีทางเกิด |

---

## 6. Impeccable compliance

**Mode: Operate** — earned familiarity + ความหนาแน่นข้อมูล + affordance สม่ำเสมอ ชนะการแสดงออก (นี่คือเหตุผลที่ `SaveToLibraryButton` ต้องหน้าตาเหมือน `CopyMessageButton` เป๊ะ และห้ามมี choreography ตอนเปิด/ปิดโมดัล)

- **One Voice** — primary ปรากฏเฉพาะ: ลิงก์ "ดูไฟล์ทั้งหมด" และไอคอน bookmark สถานะ "เก็บแล้ว" · badge เล่นวิดีโอใช้ `bg-dark/60` ไม่ใช่ primary เพื่อไม่กินโควตา
- **พระเอก 1 อย่างต่อจอ** — S3: คลังไฟล์เป็น "ของรอง" อยู่ล่างสุด ไม่แข่งกับสถิติ/การเชื่อมลูกค้า · S4: กริดเป็นพระเอกเดี่ยว · S1/S2: รูป/ข้อความเดิมยังเป็นพระเอก
- **Verified-Means-Green** — **ไม่ใช้เขียวเลยทั้งฟีเจอร์** เพราะไม่มีสถานะ "ยืนยันแล้ว"; "เก็บแล้ว" ใช้ primary ไม่ใช่ success
- **ไม่ใช้ danger กับ "เอาออกจากคลัง"** — ย้อนกลับได้ในคลิกเดียว จึงไม่ใช่สีแดงและไม่ต้อง confirm
- **Sentence case** ทุก label · **Ink-Tinted Shadow** ใช้เงา Paces ปกติ
- **anti-slop** — ไม่มี hero-metric/eyebrow/gradient · tile เป็น `<button>` เปล่า ไม่ใช่ `.card` ซ้อนใน `.card` ของแผง
- **แตะได้จริง** — tile ที่ 320px = ~93×117px (เกิน 44px มาก) · item ใน `MessageActionBubble` สืบทอด `min-h-11` อยู่แล้ว

**จุดที่ยกเว้นโดยตั้งใจ (มติ Q39):** แถบรายละเอียดใน lightbox เป็นตัวหนังสือขาวบนพื้นเข้ม ต่อเนื่องจากปุ่ม Zoom/Download เดิม — เข้าข่าย Photo-Scrim Exception; การ์ด Paces สีขาวลอยกลางจอมืดคือ "การ์ดซ้อนบนพื้นที่ไม่ใช่การ์ด" ซึ่งผิดหลักมากกว่า

---

## 7. Design decisions + rationale

1. **แยกกลไก S1 มือถือ/เดสก์ท็อป** (มติ Q35) — `useLongPress` ไม่รับ mouse และ `point` mode ผูกกับ reactions ไปแล้ว การรื้อให้ปุ่มหน้ายิ้มเปิดเมนูเต็มจะกระทบพฤติกรรมที่ใช้อยู่บน prod โดยไม่ได้ประโยชน์กับผู้ใช้
2. **tile เอกสารไม่มี thumbnail** — PDF/DOC ไม่มีภาพตัวอย่างให้เบราว์เซอร์ render โดยไม่มี server-side thumbnail (นอกขอบเขต) และพฤติกรรมตอนกดต่างกัน จึงต้องต่างด้วยสายตา
3. **tile วิดีโอใช้เฟรมแรกจริง** — `preload="metadata"` ให้เฟรมแรกฟรี ไม่ต้องประมวลผลเพิ่ม; ถ้าใช้ไอคอนเปล่าจะแยกจากเอกสารไม่ออกทั้งที่วิดีโอมองแล้วรู้ทันทีว่าเป็นอะไร
4. **วิดีโอไม่เข้า lightbox** (มติ Q36) — ต้องรื้อโครงสไลด์ทั้งชุดเพื่อรับ slide type ใหม่ แลกกับ "แถบรายละเอียดสวยเท่ารูป" ซึ่งการ์ดรายละเอียดให้ได้เหมือนกัน
5. **ไม่มี toast ในบริบท lightbox** — z-index ของไลบรารีสูงมากและยังไม่ยืนยันว่าต่ำกว่า `PacesToastContainer`; icon-swap เป็น feedback ที่ `CopyMessageButton` ใช้อยู่แล้วในโปรเจกต์นี้
6. **แก้ชื่อ/โน้ตผ่าน Swal** — HR8 บังคับ blocking dialog เป็น Sweet Alert; `pacesConfirmWithReason` มี precedent การใส่ custom input
7. **เรียงตามเวลาที่ส่งจริง** (มติ Q23 ยืนหยัดหลัง ux เสนอกลับเป็น `savedAt`) — ผู้ขายจำว่า "สลิปมาเมื่อวาน" ไม่ใช่ "กดเก็บตอนไหน"; แต่ `savedAt` ถูกบันทึกทุกแถวอยู่แล้ว สลับเกณฑ์ทีหลังได้โดยไม่ต้อง migrate
8. **ไม่มีตัวกรองชนิดไฟล์** — คลังต่อลูกค้า 1 คนไม่เยอะพอที่จะต้องกรอง (ต่างจาก inbox ทั้งร้าน)

---

## 8. ของที่ต้องส่งต่อให้ SDS/DATABASE

- `imageSlides` ต้องพก `libraryEligible` + `messageId` ต่อสไลด์ (§0)
- `ChatMessageView` ต้องมี field บอกว่าไฟล์นั้นอยู่ในคลังแล้วหรือยัง (ไม่งั้น S1/S2 สลับ label ไม่ได้)
- ต้องมี `savedByUserId` + ชื่อผู้เก็บ (แสดง "เก็บโดย X" — BR-CFL-11)
- `savedAt` บันทึกทุกแถวแม้ไม่ได้ใช้เรียงลำดับ (§7 ข้อ 7)
