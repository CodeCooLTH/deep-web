# Facebook Chat UI — Phase 1 (หน้าตา) Implementation Plan

**Goal:** ทำหน้าแชท seller ให้เป็น 3 คอลัมน์ตาม Design Spec — ใช้งานได้จริงกับข้อมูลที่มีอยู่แล้ว
โดยยังไม่แตะ DB (ไม่มี migration ใน phase นี้)

**Spec:** `docs/superpowers/specs/2026-07-22-facebook-chat-ui-design.md` (อ่านทั้งไฟล์ + ภาคผนวก A)
**Feature docs:** `docs/20 - Features/00018 - Facebook Chat Integration/`

## Global Constraints

- 🛑 **Hard Rule 8:** Design Spec ออกแล้ว — implement ตามนั้น ห้ามออกแบบเพิ่มเอง
  จุดที่สเปกไม่ครอบ → ถาม Controller ห้ามเดา
- 🛑 **Hard Rule 7:** Paces primitive เท่านั้น ห้าม arbitrary Tailwind (`text-[]`/`bg-[]`/`shadow-[]`)
  ยกเว้นที่สเปกระบุไว้ชัดพร้อมเหตุผล (scoped CSS var ของ rail width)
- 🛑 **Hard Rule 1/3:** ทุกไฟล์ UI ต้องมี `Base:` ชี้ theme file ที่ copy มา — ทั้งใน commit และคอมเมนต์หัวไฟล์
- 🛑 **Hard Rule 12:** ห้าม emoji ใช้ tabler icon ตามชื่อที่สเปกระบุ
- 🛑 **Hard Rule 9:** toast ใน `(paces)/**` ใช้ `pacesToast` เท่านั้น; dialog ยืนยันใช้ Sweet Alerts
- **ห้าม migration / ห้าม `prisma migrate` ใด ๆ ใน phase นี้**
- สี: Paces `#236dc9` — ห้ามม่วง Vuexy ห้ามเขียวแบบ 12Tees
- type-check: `node node_modules/typescript/lib/tsc.js --noEmit` (ห้าม `npx tsc`)
- test: `npx vitest run` — baseline fail = 94 (pre-existing) ห้ามเพิ่ม
- ห้าม `git add`/`commit`/`push` — Controller จัดการ

## นอก scope phase นี้

- แท็ก / Note (ต้อง migration — Phase 3)
- ปักหมุด / ซ่อน / ปิดงาน แบบใช้งานได้จริง (ต้อง service+API — Phase 2)
  → phase นี้ **ไม่ต้อง render ปุ่มเหล่านี้เลย** (ห้ามทำปุ่มที่กดแล้วไม่เกิดอะไร)
- tab "ใบเสนอราคา" (OQ-FBC-02 ยังไม่ปิด)
- ส่งรูปออกช่องทางนอก (backend ยังไม่รองรับ)

---

## T1 — Backend: filter/ค้นหา + API ของช่องทาง

**Files**
- Modify: `src/services/chat.service.ts` (`listConversationsForShop` รับ filter)
- Modify: `src/app/api/chat/conversations/route.ts` (query params ใหม่)
- Modify: `src/lib/validations.ts` (schema ของ query)
- Create: `src/app/api/channels/route.ts` (GET list channel ของร้าน)
- Create: `src/app/api/channels/[id]/route.ts` (DELETE = disconnect)
- Test: `src/services/__tests__/chat-service-filters.test.ts`

**Produces**
- `listConversationsForShop(shopId, { cursor, take, channel?, shopChannelId?, q? })`
- `GET /api/channels` → `ChannelView[]` (ใช้ `listChannels` ที่มีอยู่แล้ว)
- `DELETE /api/channels/{id}` → ใช้ `disconnectChannel(id, shopId)` ที่มีอยู่แล้ว (ownership อยู่ใน WHERE)

**หมายเหตุ**
- `q` ค้นหาจาก `lastMessagePreview` + ชื่อ `externalContact.name` (case-insensitive)
- ทุก query ต้อง filter `shopId` เสมอ
- `GET /api/channels` ห้ามคืน `accessTokenEnc` (service กันไว้แล้วด้วย select allow-list — อย่าไปแก้)
- route ใหม่ต้องมี `cache-control: private, no-store` + `force-dynamic` (บทเรียน auth API cache)

---

## T2 — Chat Rail + สลับเมนูซ้าย (desktop)

**Files**
- Modify: `src/app/(paces)/seller/(dashboard)/layout.tsx` (ตรวจ pathname → ส่ง override)
- Modify: `src/layouts/VerticalLayout.tsx`, `src/layouts/components/Sidenav/index.tsx` (รับ prop ใหม่)
- Create: `src/app/(paces)/seller/(dashboard)/inbox/components/ChatRail.tsx`
- Modify: `src/assets/css/safepay-overrides.css` (scoped `--sidenav-width` 320px)

**ตามสเปก §กลไกหลัก:** rail แทนที่ `AppMenu` ในตำแหน่ง `<aside>` เดิม, ซ่อน `OnHoverToggle`,
มีปุ่ม "กลับเมนูหลัก" บนสุดเสมอ, desktop ≥1024px เท่านั้น (จอเล็กใช้ drill-down เดิม ไม่แตะ)

---

## T3 — รายการสนทนา: badge ช่องทาง + ตัวกรอง + ค้นหา

**Files**
- Modify: `src/app/(paces)/seller/(dashboard)/inbox/page.tsx`
- Modify: `src/app/(paces)/seller/(dashboard)/inbox/components/InboxList.tsx`
- Create: `src/app/(paces)/seller/(dashboard)/inbox/components/ChannelBadge.tsx`

**ตามสเปก:** channel tabs (React state ไม่ใช่ `data-hs-tab`), FilterDropdown ของเพจ,
active-filter chip, avatar overlay badge, fallback ชื่อ "ผู้ติดต่อ", avatar เป็นตัวอักษรแรก
(`ExternalContact.avatarUrl` เป็น null เสมอ — Meta ไม่ให้)

---

## T4 — เธรด: แบนเนอร์ 24h + composer + สถานะส่งไม่สำเร็จ

**Files**
- Modify: `src/app/(paces)/seller/(dashboard)/inbox/[conversationId]/page.tsx`
- Modify: `src/app/(paces)/seller/(dashboard)/inbox/[conversationId]/components/ChatThread.tsx`

**ตามสเปก:** แบนเนอร์ 3 ระดับ (>4ชม./≤4ชม./หมดแล้ว), composer disabled เมื่อ window ปิด,
ปุ่มแนบรูป disabled ถาวรบนช่องทางนอก + caption, badge ใต้ bubble เมื่อ `deliveryStatus='FAILED'`,
banner แทนเมื่อ `ShopChannel.status='TOKEN_INVALID'`, channel badge ที่ header

**ต้องระวัง:** ข้อความยาวต้องมี `max-w` ตาม primitive; sticker ควรเล็กกว่ารูปปกติ (ดูภาคผนวก A-3)

---

## T5 — แผงขวา: ข้อมูลลูกค้า + CTA ตามประเภทกิจการ

**Files**
- Create: `src/app/(paces)/seller/(dashboard)/inbox/[conversationId]/components/CustomerPanel.tsx`
- Create: `.../components/CustomerPanelSheet.tsx` (จอเล็ก — Base `OrderQrSheet.tsx`)
- Modify: `.../[conversationId]/page.tsx` (อ่าน `Shop.vertical` ที่ server ส่งลงเป็น prop)

**ตามภาคผนวก A-1:**
- `vertical === 'LODGING'` → ปุ่ม **"เปิดการจอง"**, tab ที่ 2 = **"การจอง"**
- อื่น ๆ (รวมค่าที่ไม่รู้จัก) → ปุ่ม **"สร้างออเดอร์"**, tab ที่ 2 = **"ออเดอร์"**
- CTA เปิด**หน้าเดิม**พร้อม prefill (ผลตัดสิน user) — ส่งชื่อ/เบอร์/conversationId ผ่าน query param
- tab แท็ก/Note **ไม่ต้องทำใน phase นี้** (ไม่มี DB) — ไม่ต้อง render tab ทั้งสอง

---

## T6 — หน้า `/settings/channels`

**Files**
- Create: `src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx`
- Create: `.../settings/channels/ChannelsClient.tsx`

**ตามสเปก §หน้าตั้งค่าช่องทางแชท:** ปุ่มเชื่อมต้องเป็น `<a href="/api/channels/facebook/connect">`
(endpoint ตอบ 302 — ห้าม fetch), แถวต่อ 1 `ShopChannel`, badge สถานะ 3 แบบ,
ปุ่มถอด → Sweet Alerts confirm → `DELETE /api/channels/{id}`,
อ่าน `?status=` จาก callback แล้ว `pacesToast` + `router.replace`

> หน้านี้แก้ 404 ที่เจอตอน connect สำเร็จด้วย

---

## ปิดงาน phase

1. `tsc --noEmit` = 0, `vitest run` fail = 94 เท่าเดิม
2. grep gate: emoji = 0, `react-toastify` ใน `(paces)/` = 0, arbitrary value ในไฟล์ที่แตะ = 0
3. `safepay-reviewer` + Impeccable CLI (`/impeccable critique`, `/impeccable clarify`) ตาม Hard Rule 8
4. Controller commit + push + deploy
