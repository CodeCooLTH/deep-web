# Implementation Plan — Order Card Redesign (Seller /orders)

- **Spec:** `docs/superpowers/specs/2026-07-06-seller-order-card-redesign-design.{html,md}` (user-approved)
- **UX Design Spec:** safepay-ux (theme-source mapping) — dispatched 2026-07-06
- **Base branch:** main

## Tasks (sequential, single developer = Controller; independent reviewer after)

| # | Task | ไฟล์ | หมายเหตุ |
|---|------|------|----------|
| 1 | ติดตั้ง `qrcode.react@4.2.0` | `package.json` | export `QRCodeSVG` |
| 2 | เพิ่ม `formatRelativeDayTime()` | `src/lib/format-date.ts` | วันนี้/เมื่อวาน/D MMM/ข้ามปี — reuse THAI_MONTHS_ABBR; ห้ามแตะ fn เดิม |
| 3 | `QrCodeButton.tsx` (ใหม่) | `orders/components/` | self-contained state (เหมือน OrderCardMenu) — trigger `btn btn-icon` + render `OrderQrSheet` |
| 4 | `OrderQrSheet.tsx` (ใหม่) | `orders/components/` | responsive: bottom-sheet(<lg)/modal(lg); QRCodeSVG size=160 + สรุปออเดอร์ + reuse `CopyLinkButton showPreview`; React-state (ไม่ใช้ Preline) |
| 5 | ขยาย `SendSmsButton` iconOnly ให้รองรับ `emphasis='primary'` | `orders/[token]/components/SendSmsButton.tsx` | ปุ่ม SMS icon-only แต่สีน้ำเงินทึบ (ปุ่มหลัก) |
| 6 | `OrderActions.tsx` เพิ่ม QR ทั้ง 2 variant | `orders/components/OrderActions.tsx` | card: `[SMS][QR][copy][⋮]` icon-only · table: แทรก QR ในกลุ่มก่อน copy |
| 7 | rewrite `OrderCard.tsx` | `orders/components/OrderCard.tsx` | header(name L / #ID+badge R stack) · meta(channel logo+label · payment) · `border-s-4 border-{semantic}` · ตัด type label · footer total+relative time · `.badge rounded-full` |
| 8 | tsc = 0 | — | `node node_modules/typescript/lib/tsc.js --noEmit` |
| 9 | safepay-reviewer 8-gate | — | independent |
| 10 | QA (Chrome DevTools) | — | user รัน dev server (:4000) — carry |

## Key decisions (locked)
- แถบสีซ้าย = `border-s-4` (4px native Tailwind, ตรง mockup) + `border-s-{semantic}`
- channel logo สีจริง (FB/LINE) จาก `src/assets/images/logos/*.svg` เป็น `<img className="size-3.5">` + onError → tabler mono; STOREFRONT/TIKTOK/OTHER = tabler mono (`SALES_CHANNEL_ICONS`) เดิม
- QR icon = `tabler:qrcode` (กลืนกลุ่มปุ่ม tabler)
- QR/link เข้ารหัส `resolveBuyerBaseUrl()/o/{shortCode||publicToken}`
- เบอร์โทรออกจากหน้าการ์ด (อยู่ order detail)
- SMS ซ่อนเมื่อ terminal (CONFIRMED/CANCELLED); QR/copy โชว์ทุกสถานะ

## Hard Rules touched
- HR1/8 theme-copy + ux gate ✓ · HR3 Base: line ทุก commit UI · HR7 arbitrary (border-s-4 = native ไม่ต้อง comment; safe-area/z-80 = precedent) · HR9 pacesToast (reuse CopyLinkButton) · HR12 channel logo = brand asset จาก data (carve-out)
