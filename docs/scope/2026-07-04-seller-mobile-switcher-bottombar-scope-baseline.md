# Scope Baseline — Seller Mobile: Account Switcher + Bottom Bar Trim

สถานะ: ACTIVE
อ้างอิง: user request (mobile) 2026-07-04 — "มือถือเปลี่ยน business account ยังไง" (ตอบ: ทำไม่ได้เลย, switcher เป็น desktop-only) + "bottom bar ลดเหลือ 4 เมนู". เกี่ยวเนื่อง feat 00008 FB account switcher ([[project_fb_account_switcher_resume]])

## Goal
มือถือ seller: (1) เพิ่ม entry point สลับ business account (แตะ avatar/ชื่อ บนการ์ด hero → bottom sheet, reuse logic feat 00008); (2) ลด bottom nav จาก 5 tab → 4 tab (ตัด "สินค้า") — ไม่แตะ switch-context endpoint/security

## In-Scope
| ID | รายการ | Acceptance | สถานะ |
|----|--------|-----------|-------|
| S-1 | CompactHero avatar+ชื่อ กดได้ → เปิด bottom sheet account switcher (มือถือ) — รายการ ร้านส่วนตัว+ธุรกิจที่เป็นสมาชิก, ติ๊ก active, แตะสลับ (reuse `/api/business/context` + `handleSwitch` จาก UserDropdownDetailed); ถ้าไม่มี business membership → ไม่เปิด sheet (หรือโชว์แค่ร้านตัวเอง) | มือถือ: แตะ avatar/ชื่อ ที่ dashboard → sheet เปิด แสดงทุกบัญชี, แตะร้านอื่น → session.activeShopId เปลี่ยน + refresh + toast; ไม่มี business → กดไม่มี sheet (หรือ sheet ร้านเดียว) | DONE (281cf73) |
| S-2 | `SellerBottomNav.tsx` ตัด tab "สินค้า"(/products) → grid-cols-6→5 (2 tab ซ้าย + FAB + 2 tab ขวา: หน้าหลัก·คำสั่งซื้อ·[+]·แชท·ร้านค้า); คง badge (pending/unread) + tap target ≥44px | มือถือ: bottom bar เหลือ 4 tab + FAB; ไม่มี "สินค้า"; badge orders/chat ยังทำงาน; /products ยังเข้าได้จากเมนูลัด dashboard | DONE (281cf73) |
| S-3 | Compliance — safepay-ux Design Spec ก่อนโค้ด, Base: line ชี้ theme (bottom-sheet Paces primitive + CompactHero/SellerBottomNav/UserDropdownDetailed), Paces primitive เท่านั้น, ไม่มี emoji, tap target ≥44px, มือถือ scope (`lg:hidden`) | grep react-toastify/emoji/arbitrary/ม่วง บนไฟล์ที่แตะ = 0; commit มี Base: | DONE (281cf73) |

## Out-of-Scope
| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | แก้ switch-context / context endpoint / security (membership verify) | reuse เดิม 100% (ไม่แตะ) |
| OOS-2 | เพิ่ม account switcher บน desktop / แก้ UserDropdownDetailed | desktop มีอยู่แล้ว |
| OOS-3 | ย้าย/ลบ /products page เอง (แค่เอาออกจาก bottom nav) | products ยังเข้าได้จากเมนูลัด |
| OOS-4 | เปลี่ยน FAB speed-dial actions | คงเดิม |

## Assumptions
- Logic สลับบัญชี (`/api/business/context` list + `/api/business/switch-context` + `session.update({activeShopId})`) มีอยู่แล้ว (feat 00008) — reuse ตรง
- `AccountAvatar` (fallback รูปแตก) reuse
- Paces มี bottom-sheet/offcanvas/drawer primitive (`hs-overlay`) — safepay-ux หา theme source ให้
- มือถือ = breakpoint `lg` (<1024px) ตาม shell เดิม (`seller-mobile-shell`)

## Change Log
| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-04 | baseline สร้าง | user request mobile switcher + bottom bar 4 เมนู | - |
