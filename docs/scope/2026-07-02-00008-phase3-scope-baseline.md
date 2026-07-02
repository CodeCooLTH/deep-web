# Scope Baseline — feat 00008, Phase 3 (Seller UI)

สถานะ: ACTIVE
อ้างอิง: ux Design Spec `docs/superpowers/specs/2026-07-02-00008-business-ui-design-spec.md` · SDS §5 · API.md §4
เอกสารต้นทาง: Design Spec (Hard Rule 8 gate ผ่านแล้ว)

## Goal
สร้าง seller UI (Paces) ให้ owner ใช้ business features ที่ backend+API live บน prod แล้ว: จัดการแพ็กเกจ, สร้างธุรกิจ, สลับ context, เชิญ/ลบแอดมิน, เห็นสถานะ lock. ทุกหน้า theme-copy จาก Paces source ตาม Design Spec (HR1/3/6/7/8/9/12).

## In-Scope
| ID | Surface | Base (theme source) | Acceptance | สถานะ |
|----|---------|---------------------|------------|-------|
| P3-1 | `LockedStateBanner` shared component + seller menu `/business` entry (verify icon) | WalletCard.tsx:42-52 + InventoryGate LOCKED variant; AdvanceWarningBanner CTA | 2 variant (grace countdown / quota no-countdown); reviewer grep: no-emoji/no-arbitrary/pacesToast=0; menu icon มีจริง (iconify verify); tsc 0 | TODO |
| P3-2 | Package matrix page `business/page.tsx` (RSC) + tier cards + banners + quota card | inventory/page.tsx + InventoryGate + paces pages/pricing; SubscribeButton/ReactivateButton | 4 tier cards ปุ่มตาม state matrix; quota progress; Base: line; grep gates 0; tsc 0; render บน dev server (visual QA) | TODO |
| P3-3 | `AccountSwitcher` sidebar component | UserProfileSettings.tsx hs-dropdown + UserDropdownDetailed header | hasBusinessMembership=false→return null; switch→session.update+refresh; grep gates 0; tsc 0 | TODO |
| P3-4 | Create Business page `business/create/page.tsx` | onboarding guard + ShopForm Step-1; products/new-v2 empty-state | gate-before-form (no package/เต็มโควตา→empty-state); 4-field single card; Base: line; grep 0; tsc 0 | TODO |
| P3-5 | Invite management page `business/[shopId]/invites/page.tsx` | paces .table + input-icon-group; SubscribeButton Swal | isShopMember guard; PII mask server-side; 3 cards; grep 0; tsc 0 | TODO |
| P3-6 | Cancel + Downgrade Sweet Alerts (components ใน package page) | SubscribeButton Swal + SweetAlerts.tsx dangerAlert/htmlAlert | cancel confirm+list; downgrade selection modal (keepShopIds ครบเป๊ะ); grep 0; tsc 0 | TODO |

## Out-of-Scope (defer)
- Accept-invite page (`/invites/[id]/accept`) + Admin extension (`admin/topups/[id]`) — **ต้อง ux แยกรอบ** (Design Spec open item #3)
- Locked banner บน product/order pages ของ business context (TFR-017 UI enforcement — Phase ต่อ)
- Tests.md (safepay-qa)

## Assumptions & Dependencies
1. P3-1 (banner) = shared, ต้องเสร็จก่อน P3-2/P3-5 (ใช้ banner)
2. Visual QA ทุก surface ต้องใช้ dev server user (Chrome DevTools MCP `deepth.local:4000`) — Claude ไม่ start server
3. backend+API live prod แล้ว — UI เรียกได้จริง (create-business ทำงาน หลัง Phase 2)
4. AccountSwitcher (P3-3) แตะ layout เดิม (seller sidebar) — high-touch, regression seller nav

## Change Log
| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-02 | baseline สร้าง | Gate 0 Phase 3 UI — user เลือก (1) ทำ UI; ux Design Spec เสร็จ | user |
