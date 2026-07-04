# Scope Baseline — 00013 Pin Products

> **วันที่:** 2026-07-04 · **Owner sign-off:** user (design + PRD/BRD อนุมัติ 2026-07-04) · **Controller:** main session
> **Docs:** `docs/20 - Features/00013 - Pin Products/{PRD,BRD,SRS,SDS,DATABASE,API,Tests}.md`

## Goal
Seller ปักหมุดสินค้าเด่นให้โผล่โซน "สินค้าปักหมุด" บนโปรไฟล์ร้านสาธารณะ (`/u/[username]` + `/b/[slug]`) — paid slot system (1 ฟรี + ซื้อ ฿99/slot ถาวรผ่าน SellerWallet) แทน interim "3 ชิ้นแรก"

## S-id (in scope)
| S-id | ขอบเขต | Acceptance สรุป |
|------|--------|-----------------|
| **S-1** | `Shop.pinSlots Int @default(1)` + backfill ร้านเดิม | ทุกร้าน pinSlots ≥ 1 |
| **S-2** | ซื้อ pin slot ฿99 ถาวร (wallet DEDUCT reason=PIN_SLOT) | หัก atomic, ไม่ refund/downgrade |
| **S-3** | Toggle pin/unpin ในหน้า seller products list | ownership guard + slot cap atomic |
| **S-4** | Slot-full guard + inline buy-slot dialog (atomic ซื้อ+ปักหมุด ขั้นตอนเดียว) | dialog→confirm→deduct+slot+pin |
| **S-5** | Re-pin/swap ฟรีไม่จำกัด | ไม่มี WalletTransaction จากการสลับ |
| **S-6** | Render โซนบน `/u/` + `/b/` เรียง pinnedAt desc (แทน interim) | ไม่ fallback สินค้าทั่วไป |
| **S-7** | ซ่อนโซนเมื่อ pinned = 0 | ไม่ render empty state; ไม่กระทบ tabs |
| **S-8** | Auto-unpin เมื่อ isActive true→false (ปิด/ลบ) | ล้าง pinnedAt ธุรกรรมเดียว, pinSlots คงเดิม, ไม่มี WalletTransaction |
| **S-9** | Admin label สำหรับ reason=PIN_SLOT | ไม่ relabel transaction เก่า |

## Data (additive — ปลอดภัย shared prod DB)
- `Shop.pinSlots Int @default(1)` (backfill=1, CHECK ผ่าน NOT VALID+VALIDATE)
- `Product.pinnedAt DateTime?` + index `@@index([shopId, pinnedAt])`
- `WalletTransaction.reason` ค่าใหม่ `"PIN_SLOT"` (ไม่มี DDL)
- **Invariant** count(pinnedAt≠null ต่อร้าน) ≤ Shop.pinSlots → enforce ที่ service layer (DB ไม่ enforce cross-row)

## Out of scope (OOS)
- **OOS-1** manual reorder (เรียง pinnedAt desc เท่านั้น) — Phase 2
- **OOS-2** refund/downgrade slot — Phase 2
- **OOS-3** cross-shop pin (ปักหมุดเฉพาะสินค้าร้านตัวเอง)
- **OOS-4** pin ใน buyer app `/api/app/*`
- **OOS-5** analytics ของสินค้าปักหมุด (view/click/conversion) — Phase 2
- **OOS-6** bulk pin/unpin (toggle ทีละชิ้น)
- **OOS-7** free trial / ส่วนลดซื้อ slot

## Migration policy (shared prod DB — สำคัญ)
- ห้าม `migrate dev` (reset ลบ DB); ใช้ hand-written migration + `migrate deploy -e .env.local` (ดู `docs/conventions/prisma-shared-db-drift.md`)
- **ขอ user ยืนยันก่อน apply** (touch prod DB); vercel.json build รัน `migrate deploy` → push main = apply prod อัตโนมัติ → migration ต้องถูก 100% ก่อน merge

## Verification gates
- tsc 0 · reviewer 8-gate · security review (paid feature — wallet deduct atomic, ownership guard) · QA (Playwright/Chrome DevTools บน dev — user รัน server)
- **Regression:** หน้าโปรไฟล์ redesign (commit 7d5d247) ต้องไม่เพี้ยนนอกจากเปลี่ยนแหล่งข้อมูลโซนปักหมุด

## Docs sync ปลายทาง
- `docs/PRD.md` feature overview + เพิ่ม Pin Products
- `docs/superpowers/specs/2026-07-04-profile-redesign-design.md` — อัปเดต "pinned interim" → "wired จริง (feature 00013)"
