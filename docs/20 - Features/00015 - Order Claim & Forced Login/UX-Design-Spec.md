---
title: "UX Design Spec — Order Claim & Forced Login"
owner: shinobu22
status: draft
module: M00015-OrderClaimForcedLogin
version: "1.0"
created: 2026-07-07
tags: [feature, order, login, ux, vuexy, design-spec]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M00015-OrderClaimForcedLogin
> **ประเภทเอกสาร:** UX Design Spec (Hard Rule 8 gate artifact) — buyer/Vuexy `(marketing)`
> **เจ้าของ:** safepay-ux · **สถานะ:** Draft (Controller-approved recommendations inline)

# Design Spec — Feature 00015: Order Claim & Forced Login

Sources read: `.impeccable/design.json`, feature SDS/BRD, current `src/app/(marketing)/o/[token]/{OrderDetailMobile,PublicOrderClient,OrderAccessBlock,MobileFrame}.tsx`, shipped patterns `auth/sign-in/{SignInCard,OAuthErrorToast}.tsx`, `auth/verify-otp/VerifyOtpCard.tsx`, `src/views/apps/ecommerce/orders/list/index.tsx`, `src/views/pages/user-profile/UserProfileHeader.tsx`, `a/[id]/AuctionBidPanel.tsx`, `theme/vuexy/.../ecommerce/orders/details/OrderDetailsCard.tsx`, `theme/vuexy/.../components/dialogs/two-factor-auth/index.tsx`, `src/lib/format-date.ts`.

**Global rule for every screen:** re-skin to MUI **theme palette tokens** (`primary.main`, `success.main`, `warning.main`, `error.main`, `info.main`, `text.primary/secondary/disabled`, `divider`, `background.paper/default`) — never raw hex (`#0F172A`, `#64748B`, `#2563EB`, `#0E9F6E`…) that the current files hardcode. Status-color mapping is **frozen to the SSOT already shipped** in `src/views/apps/ecommerce/orders/list/index.tsx`:

```
PENDING → warning     SHIPPED → info     CONFIRMED → success (green)     CANCELLED → error
```

## Controller resolutions of the Open Questions (apply these)
- **D1 / MobileFrame:** DROP it (recommendation accepted). Plain centered column, `maxWidth 640, mx:'auto'`, `bgcolor:'background.default'`. Delete `MobileFrame.tsx`.
- **Q1 (unlockedPhone footer branch):** retire it — always show the generic confirm sub-text.
- **Q2 (legacy access-block shopUsername link):** do NOT add a prop — keep `OrderAccessBlock` PII-safe/zero-order-data; legacy variant shows "ติดต่อร้านค้า" copy only (no deep link).
- **Q3 (SmsExpiredToast severity):** `toast.warning` (softer; not a failure).
- **Q4 (icon names):** verify tabler names at build; use the listed fallbacks if a name isn't in the on-demand set.
- **Q5 (shared OtpSlots component):** extract a shared `OtpSlots` component (3rd reuse site) — do it in this build.

---

## Firm recommendation (ACCEPTED): DROP `MobileFrame`
Replace with a plain `Box` column (`bgcolor:'background.default'`, `maxWidth:640, mx:'auto'`, normal page scroll — no device chrome). Rationale: only page in the app doing "phone-in-a-box"; sibling public page `/u/[username]` already dropped its equivalent framing (2026-07-04); design.json "Trusted Counter" wants an un-gimmicky surface; deletes a file + `xs/md` duplication; sticky CTA should anchor to viewport, not a fake device.

---

## Screen 1 — Order-detail view (main), replaces `OrderDetailMobile.tsx`

Covers FR-OCL-05/06/07/08 render-on-GRANTED; preserves all existing content (slip + digital-access, review zone, cancel).

```
┌─────────────────────────────────────┐
│ ░░░ gradient tier banner ░░░   (←)   │  getTierGradient(), ~140px
│            ┌───────┐                 │
│            │avatar │●verify          │  overlap -42px, 84px
│            └───────┘                 │
│            ร้านชื่อร้าน               │
│            @username                  │
│      [ยืนยันแล้ว] [Silver] [Trust 72]│  chips: success-tonal / tierColor / neutral
├───────────────────────────────────────┤
│ [●จัดส่งแล้ว]      #a1b2… · 01 ส.ค. 2569 │  Chip variant=tonal color=info
├───────────────────────────────────────┤
│ ขั้นตอน                              │
│  ●────────●────────○                 │  success / info(cur) / disabled
│ สั่งซื้อ   จัดส่ง    ยืนยัน            │
├───────────────────────────────────────┤
│ ┌─ รายการสินค้า ────────────────────┐│
│ │ [img] เสื้อยืด         2×250  500 ││
│ │ ───────────────────────────────── ││
│ │ ยอดย่อย                     1,090 ││
│ │ ส่วนลด                       -90 ││
│ │ VAT 7%                         70 ││
│ │ ยอดรวม                     1,070 ││  ← OrderDetailsCard totals-row pattern
│ └───────────────────────────────────┘│
├───────────────────────────────────────┤
│ ┌[icon] โอนเข้าบัญชี · ธ.กสิกรไทย ──┐│  icon tonal = info (NOT green)
│ ┌[icon] Kerry · TH123456789 [คัดลอก]┐│  icon tonal = info
│ ┌─ รีวิวของคุณ / ให้คะแนนร้าน ──────┐│
│ ┌─ แนบสลิป (empty / done state) ────┐│
│ ┌[icon] ลิงก์เข้าถึง         [เปิด]─┐│  DIGITAL only
│         ปกป้องการซื้อขายโดย Deep      │
├──────────── sticky bottom bar ───────┤
│      [   ยืนยันรับสินค้า   ]          │  Button variant=contained color=primary
│           ยกเลิกคำสั่งซื้อ             │  text Button color=error
└───────────────────────────────────────┘
```

**Prose:** Wrapper `Box bgcolor='background.default'`, column `maxWidth:640, mx:'auto'`, no device frame. Banner+identity = `UserProfileHeader.tsx` `ProfileBanner`+`ProfileIdentityBar` shape; use `getTierGradient(trustScore)` (CSS) NOT `getTierCover()` (image); avatar 84px, overlap `mt:-42px`, verify badge = ✓ dingbat carve-out. Chips: verified `variant='tonal' color='success'` (if `maxVerifyLevel>=1`), tier `tonal getTierColor()`, trust `tonal color='default'`. Status pill `Chip size='small' variant='tonal' color={STATUS_COLOR[status]}` + `STATUS_LABEL` (SSOT map, not hex `getStatusPill()`). Meta `#token · formatDateTimeTH(createdAtIso)`. Timeline bespoke but recolor: done/final→`success.main`, current→`info.main`, upcoming→`divider`/`text.disabled`, cancelled→`error.main`. Items rows keep thumbnail+name+qty×price; totals block borrows `OrderDetailsCard.tsx` `CardContent` totals-row markup (label…value, bold final). Payment icon tonal `info` (transfer) / `warning` (COD) — NOT green. Tracking icon tonal `info`, number `fontFamily:monospace` (Rule 5 exception), copy button `tonal info`. Review: stars `warning.main`/`text.disabled`, "รีวิวแล้ว" `Chip tonal success`; `ReviewForm` child unchanged (dev checks its own hex). Slip empty: dashed box icon tonal `primary`; done: tonal `success`. Digital-access icon tonal `primary`, "เปิด" `tonal primary`, keep `isHttpUrl` guard. Sticky CTA `Button fullWidth variant='contained' color='primary'` (replaces ink `#0F172A`). Cancel = text `Button color='error'`. Cancel dialog already token-correct — keep.

**Theme Source Mapping**

| Section | Vuexy theme file | Component | Adapt |
|---|---|---|---|
| Banner + identity | `theme/vuexy/.../views/pages/user-profile/UserProfileHeader.tsx` (adapted at `src/views/pages/user-profile/UserProfileHeader.tsx`) | `ProfileBanner`+`ProfileIdentityBar` | avatar 84, no chat/follow, banner = trustScore only |
| Items + totals | `theme/vuexy/.../views/apps/ecommerce/orders/details/OrderDetailsCard.tsx` | `Card`/`CardContent` totals rows | drop TanStack table; copy totals-row + item-row markup |
| Status chip | (adapted) `src/views/apps/ecommerce/orders/list/index.tsx` | `Chip variant='tonal'` | reuse `STATUS_COLOR`/`STATUS_LABEL` |
| Cancel dialog / bottom CTA | `theme/vuexy/.../components/dialogs/two-factor-auth/index.tsx` | `Dialog`/`Button variant='contained'` | color primary/error, not hex |
| Timeline/payment/tracking/digital cards | no primitive — bespoke `Box`/`Card` | — | recolor via `theme.palette.*` only |

---

## Screen 2 — `ClaimOtpPrompt` (new)  — covers FR-OCL-06 (`OTP_CLAIM_REQUIRED`)

```
┌─────────────────────────────────────┐
│               [Logo]                  │
│  ยืนยันตัวตนเพื่อเข้าถึงออเดอร์นี้     │
│  ออเดอร์นี้ผูกกับเบอร์ 08x-xxx-1234    │  ← masked, NOT an input
│    [        ส่งรหัส OTP        ]      │  state: initial
├── after send ─────────────────────────┤
│  กรอกรหัสความปลอดภัย 6 หลัก            │
│  [_] [_] [_] [_] [_] [_]              │  OTPInput (input-otp)
│    [           ยืนยัน           ]      │
│  ไม่ได้รับ SMS? ส่งอีกครั้ง             │
└─────────────────────────────────────┘
```

Full-page centered `Card` (`is-[450px]`, in `AuthIllustrationWrapper`). Exact reuse of `VerifyOtpCard.tsx` OTP plumbing (`OTPInput` + Slot/FakeCaret + `src/libs/styles/inputOtp.module.css`), with: (1) phone from **server prop** `targetPhone` (masked `'*'.repeat(len-4)+last4`), never a query param; (2) no editable phone field ever; (3) two states — initial (`POST /api/otp/send {contact:targetPhone}`) → otp-input; submit calls `POST /api/orders/[token]/claim {otp}` (NOT signIn), 200 → `toast.success('ยืนยันสำเร็จ')` + `router.refresh()`; (4) 401 → `Typography color='error.main'` "รหัส OTP ไม่ถูกต้องหรือหมดอายุ". Use the shared `OtpSlots` component (Q5).

**Theme Source Mapping:** shell ← `theme/vuexy/.../views/pages/auth/AuthIllustrationWrapper.tsx` (via `VerifyOtpCard.tsx`); OTP slots ← `theme/vuexy/.../libs/styles/inputOtp.module.css`; buttons ← `two-factor-auth/index.tsx`.

---

## Screen 3 — `OrderAccessBlock` (re-skin, 3 reason variants)

Covers FR-OCL-05-AC-02 (owner-mismatch), FR-OCL-06-AC-05 (phone-mismatch), FR-OCL-06 legacy.

```
┌─────────────────────────────────────┐
│             ┌───────┐                │
│             │ (icon) │               │  CustomAvatar skin='light' variant='rounded' size=64
│             └───────┘                │  color = error | warning | secondary
│   {headline — varies}                 │
│   {body — varies}                     │
│   [   primary action button   ]       │
│         กลับหน้าหลัก                  │
└─────────────────────────────────────┘
```

| Reason | Icon (fallback) | Avatar color | Headline | Body | Action |
|---|---|---|---|---|---|
| `owner-mismatch` | `tabler-user-x` (`tabler-lock-exclamation`) | `error` | ออเดอร์นี้เป็นของบัญชีอื่น | บัญชีที่คุณเข้าสู่ระบบอยู่ไม่ใช่เจ้าของออเดอร์นี้ | ออกจากระบบ แล้วเข้าด้วยบัญชีที่ถูกต้อง → `signOut({callbackUrl: pathname})` |
| `phone-mismatch` | `tabler-phone-x` (`tabler-alert-triangle`) | `warning` | เบอร์ที่ใช้เข้าสู่ระบบไม่ตรงกับออเดอร์นี้ | ออกจากระบบแล้วเข้าด้วยบัญชีหรือเบอร์ที่ใช้สั่งซื้อ | same signOut |
| `legacy` | `tabler-mail-off` (`tabler-help-circle`) | `secondary` | ออเดอร์นี้ไม่มีเบอร์โทรผูกไว้ | เป็นออเดอร์เก่าที่ไม่มีข้อมูลเบอร์ยืนยัน — กรุณาติดต่อร้านค้าโดยตรง | none (per Q2: no shop deep-link) |

Shared: `Button fullWidth variant='contained' color='error'` for the two corrective variants; footer `Typography component={Link} href='/'` "กลับหน้าหลัก" (keep). Keep component PII-safe (zero order data props besides `reason`).

**Theme Source Mapping:** icon avatar ← `@core/components/mui/Avatar.tsx` `CustomAvatar skin='light' variant='rounded' size={64}`; optional `Alert severity icon={false}` ← `two-factor-auth`; centering shell ← sign-in flex-center pattern WITHOUT `AuthIllustrationWrapper` (error state, not a branding moment); button ← `two-factor-auth`.

---

## Screen 4 — Sign-in pre-fill (`SignInCard`) + `SmsExpiredToast`

Covers FR-OCL-03 (SMS pre-fill), TD-003 (sms-expired soft fallback). No new visual component. `SignInCard.tsx`: read `?prefillPhone=` via `useSearchParams()`; if present → `loginMode` defaults `'otp'`, `otpForm.defaultValues.phone = prefillPhone` (field stays editable — pre-fill is not approval). If `prefillPhone` fails `^0[0-9]{9}$` → silently ignore, fall back to password mode. `SmsExpiredToast.tsx` (new) = copy `OAuthErrorToast.tsx`, swap param `error`→`smsExpired`, `toast.warning('ลิงก์หมดอายุ กรุณาเข้าสู่ระบบ')` (Q3).

---

## Screen 5 — Bid Phone-Verify modal (auction, web) — covers FR-OCL-10 (`403 PHONE_NOT_VERIFIED`)

```
┌─────────────────────────────────────┐
│  ยืนยันเบอร์โทรก่อนวางบิด        [x]  │
│  ต้องมีเบอร์ที่ยืนยันแล้วก่อนบิด/ซื้อ  │
│  step 1: [ เบอร์โทรศัพท์        ]     │  CustomTextField type='tel'
│          [     ส่งรหัส OTP     ]      │
│  step 2: [_][_][_][_][_][_]           │  OtpSlots
│          [       ยืนยัน        ]      │
└─────────────────────────────────────┘
   ↓ on success → close dialog, auto-retry original bid/buy-now
```

Reuse the Vuexy `two-factor-auth` dialog pattern (`Dialog`/`DialogTitle`/`DialogContent`/`DialogActions`/`DialogCloseButton`, `tonal secondary` cancel + `contained` submit) — same weight as the `buyNowOpen` dialog in `AuctionBidPanel.tsx`. Step 1: `CustomTextField type='tel'`, yup `^0[0-9]{9}$` → `POST /api/otp/send {contact,type:'PHONE'}`. Step 2: `OtpSlots` → `POST /api/account/set-phone {phone,otp}`. On 200 → close + **auto-retry** original `handleBid()`/`handleBuyNow()`. Errors: 409 → "เบอร์นี้มีบัญชีแล้ว"/"บัญชีนี้ตั้งเบอร์แล้ว"; 401 → "รหัส OTP ไม่ถูกต้องหรือหมดอายุ". Trigger: in `AuctionBidPanel.tsx` fetch-catch, check `data.code === 'PHONE_NOT_VERIFIED'` BEFORE the generic `toast.error`, open this modal.

**Theme Source Mapping:** dialog shell ← `two-factor-auth/index.tsx`; weight ← `AuctionBidPanel.tsx` `buyNowOpen` block; phone field ← `two-factor-auth` `SMSDialog` `CustomTextField` (regex from `SignInCard` `phoneSchema`); OTP ← shared `OtpSlots`.

---

## Screen 6 — Seller order-create field (Paces, minor — NOT new UI)

- `OrderCreateForm.tsx` yup: `buyerContact` → `.required()` + `.matches(/^0[0-9]{9}$/, 'ต้องเป็นเบอร์โทร 10 หลัก ขึ้นต้นด้วย 0')` (mirror `CreateOrderSchema` valibot).
- `CustomerSelectBlock.tsx` copy-only: label `เบอร์โทร / อีเมล`→`เบอร์โทร`; placeholder `พิมพ์เบอร์โทรหรืออีเมล…`→`พิมพ์เบอร์โทร…`; helper `เบอร์/อีเมลสำหรับแจ้งลิงก์ผู้ซื้อ — เบอร์เดิม = จดจำเป็นลูกค้าเดียวกัน`→`เบอร์โทรสำหรับแจ้งลิงก์ผู้ซื้อ — เบอร์เดิม = จดจำเป็นลูกค้าเดียวกัน`; optional `inputMode='numeric'`. No new asterisk convention — rely on existing inline error paragraph.

---

## Design decisions (summary)
- **D1** Drop `MobileFrame` (accepted).
- **D2** Bottom CTA ink `#0F172A` → `variant='contained' color='primary'`.
- **D3** Tier banner `getTierCover()` (image) → `getTierGradient()` (CSS).
- **D4** Payment icon: transfer=info, COD=warning (NOT green — green reserved for verified).
- **D5** Extract shared `OtpSlots` (3rd reuse site: VerifyOtpCard, ClaimOtpPrompt, Bid modal).

## Files this spec drives (→ SDS §8)
- New: `o/[token]/ClaimOtpPrompt.tsx`, `auth/sign-in/SmsExpiredToast.tsx`, shared `OtpSlots` component.
- Re-skin: `o/[token]/{OrderDetailMobile,OrderAccessBlock,PublicOrderClient}.tsx`.
- Delete: `o/[token]/{MobileFrame,PhoneUnlock,AccountPromptCard}.tsx`.
- Modify (copy/logic): `auth/sign-in/SignInCard.tsx`, `a/[id]/AuctionBidPanel.tsx` (+ bid modal), seller `{OrderCreateForm,CustomerSelectBlock}.tsx`.
