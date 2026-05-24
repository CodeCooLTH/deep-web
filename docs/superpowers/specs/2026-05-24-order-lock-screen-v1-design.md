# Order Lock Screen (`PhoneUnlock`) — V1-consistent Redesign

> **วันที่:** 2026-05-24 · **สถานะ:** design approved (user "ลุยเลย")
> **ขอบเขต:** redesign หน้า lock screen (ก่อนกรอกเบอร์) `/o/[token]` ให้สอดคล้องกับ order detail V1
> **Theme:** buyer = Vuexy (MUI) · mobile-first · Anuphan

---

## 1. Goal

แทน lock screen แบบ Vuexy auth-card เดิม (centered Card + Logo + Trust Preview Strip) ด้วย layout เดียวกับ `OrderDetailMobile` V1 — buyer เห็นหน้าเดียวกันก่อน/หลังปลดล็อก ต่างแค่เนื้อหา (form แทน order content). เพิ่ม trust signal (FR-UX-1 anti-scam) ในภาษา visual เดียวกับ order detail + profile.

## 2. Layout (full V1 header + form — user เลือก)

single scrollable column, `maxWidth 420`, `bgcolor #F3F5F8` — scaffold เดียวกับ `OrderDetailMobile`:

1. **Tier cover banner** (`height 130`, `getTierCover(trustScore)`, cover/center) + frosted back button (`tabler-arrow-left`) → `Link href='/'`. คัดลอก pattern ตรงจาก `OrderDetailMobile.tsx:565-604`.
2. **Hero**: avatar overlap (78px, `mt:-40px`, `border 4px #fff`, shadow) ใช้ `shop.avatar` + letter fallback; verify badge (วงกลม `#1D9BF0` ✓) เมื่อ `maxVerifyLevel >= 1`. คัดลอกจาก `OrderDetailMobile.tsx:606-675`.
3. **Identity**: shop name (link → `/u/${username}`), `@username`, chips row (`✓ ยืนยันแล้ว` เมื่อ verified / `getTierLabel` tier chip สี `getTierColor` / `Trust {score}`). คัดลอกจาก `OrderDetailMobile.tsx:677-758`.
4. **Unlock card** (flat `Card`, `borderRadius 12`, `boxShadow 0 1px 2px`): heading `ยืนยันตัวตนเพื่อดูคำสั่งซื้อ` + sub `กรอกเบอร์โทรที่ใช้ติดต่อกับร้านนี้` + `CustomTextField` เบอร์โทร (tel, numeric, maxLength 10) + **ink CTA** (`#0F172A`) full-width `เข้าดูคำสั่งซื้อ` (loading → `กำลังตรวจสอบ…` + spinner) + helper `สำหรับคำสั่งซื้อ {orderHint}` / error.
5. **Footer**: `ปกป้องการซื้อขายโดย Deep` (`tabler-shield-check` `#818CF8`) กึ่งกลาง muted.

## 3. Data / contract

- `ShopPreview` เพิ่ม `avatar: string | null` (มี `username` อยู่แล้ว — ตอนนี้ render @handle จริง ไม่ใช่ "สำรอง").
- `PublicOrderClient` ส่ง `avatar: order.shop.user.avatar` เพิ่มใน `shop` prop (field มีจาก data layer Phase 2 V1 แล้ว).
- props เดิมคงไว้: `orderHint`, `onUnlock`, `shop`.

## 4. Behavior — preserve exactly (ไม่เปลี่ยน logic)

- phone validation `^0[0-9]{9}$`; `setError`/`loading`; `await onUnlock(phone)`; autofocus; numeric-only `onChange` (`replace(/\D/g,'').slice(0,10)`); submit disabled จน `phone.length === 10`.
- error/helperText ผ่าน `CustomTextField`.

## 5. Reuse / drop

- **Reuse:** `getTierCover/getTierLabel/getTierColor` (trust-tier); banner/avatar/identity/chips คัดลอกจาก `OrderDetailMobile` V1 (ตัวมัน Base'd บน `UserProfileHeader`); `CustomTextField` (Vuexy form field).
- **Drop:** `AuthIllustrationWrapper`, centered auth `Card` scaffold, top `Logo`, `TrustPreviewStrip` เดิม, `Divider`.

## 6. Theme rule

`Base:` ของ commit/JSDoc = `theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx` (ผ่าน `OrderDetailMobile` V1). Anuphan เท่านั้น (ห้าม fontFamily ใหม่). client component → `next/link`/`Button` ใช้ตรงได้.

## 7. Scope / out-of-scope

- **In:** rewrite `PhoneUnlock.tsx`; `ShopPreview.avatar`; `PublicOrderClient` ส่ง avatar.
- **Out:** ไม่แตะ unlock API / flow / validation logic; ไม่แตะ order detail (post-unlock); ไม่เพิ่ม field ใหม่ใน schema.
- **Workflow:** <3 tasks single-concept UI → implement ตรง (ไม่ใช้ agent-team-phase) + reviewer + browser QA.

## 8. Acceptance

- `tsc --noEmit` 0; lock screen render banner/avatar/verify/chips ตรงกับ order detail (เปิด `/o/aa000001-...` ก่อน unlock); กรอกเบอร์ผิด format → error; กรอก `0812345678` → ปลดล็อกเข้า order detail ได้ (behavior เดิม); back button → `/`; Anuphan.
