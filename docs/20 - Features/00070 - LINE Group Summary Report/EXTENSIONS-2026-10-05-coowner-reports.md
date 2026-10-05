# ส่วนขยาย 2026-10-05 — เจ้าของร่วมผูกรายงานกลุ่ม LINE ได้

> ต้นเรื่อง: Deep Nattapat เป็นเจ้าของร่วมของร้าน BT สุขสวัสดิ์/ธัญบุรี (ShopMember.role='OWNER') มีแพ็กเกจ Business ของตัวเอง
> แต่หน้า "ผูกกลุ่ม" หาร้านไม่เจอ — ทุก query กรอง `Shop.userId = owner` (เจ้าของหลักเท่านั้น ตาม `bca3b85e`)
> user เลือกทาง "แก้กติกาให้เจ้าของร่วมผูกร้านที่ตัวเองเป็นเจ้าของได้" (= requirement review ตาม HR11) แล้วสั่ง deploy

## BRD — กฎ

| # | กฎ | เหตุผล |
|---|---|---|
| BR-LRC-01 | ร้านที่ผูกรายงานได้ = ร้านที่ผู้ตั้งรายงานเป็น **เจ้าของหลัก (`Shop.userId`) หรือเจ้าของร่วม (`ShopMember.role='OWNER'`)** ∧ ไม่ลบ/purge/ล็อก | เจ้าของร่วมมีสิทธิ์เท่าเจ้าของหลักในแอป (00012 BR-MR-01) เห็นตัวเลขร้านนั้นทั้งหมดอยู่แล้ว ⇒ ส่งเข้ากลุ่มไม่ใช่การรั่ว |
| BR-LRC-02 | ผู้ดูแล (ADMIN) ยังผูกไม่ได้ — เหมือนเดิม | กันตัวเลขร้านคนอื่นเข้ากลุ่ม (เหตุผลเดิมของ 00070) |
| BR-LRC-03 | ด่านแพ็กเกจยังเป็น **แพ็กเกจของผู้ตั้งรายงานเอง** (ไม่เปลี่ยน) · ร้านที่เจ้าของหลักขาดแพ็กเกจจนร้านถูกล็อก = หลุดจากรายงานตามกติกา LOCKED เดิม | ไม่เปิดช่องให้ใช้รายงานฟรีบนแพ็กเกจคนอื่น |
| BR-LRC-04 | ถูกลดเป็นผู้ดูแล/ถูกลบออก/โอนร้าน ⇒ ร้านนั้นหลุดจากรายงานตอนส่งครั้งถัดไป (`NOT_OWNED`) และหน้ากลุ่มแสดง "ไม่พร้อมใช้งาน" | ตรวจสิทธิ์สดทุกรอบส่ง (defense in depth เดิม) |
| BR-LRC-05 | เมนู/ด่าน L1 (`ownsAnyShop`) ไม่เปลี่ยน — ทุกบัญชีมีร้าน PERSONAL ของตัวเองอยู่แล้วจึงผ่าน L1 | ขอบเขตแคบที่สุด |

## SDS
SSOT `ownedShopWhere()` (Prisma where) + `isOwnedBy()` (ฝั่ง JS ของแถวที่อ่านแล้ว) ใน `src/services/line-report-shop.service.ts`
ใช้ครบ 5 จุด: `listReportableShops` · `assertReportableIds` · `resolveSendableShops` · `readGroupShops` · `bindPreconditionsHold` (bind.service)
ร้าน PERSONAL ไม่มีแถว ShopMember ⇒ ต้องคง `userId` ไว้ใน OR

## DATABASE / API
ไม่มี migration · ไม่มี endpoint ใหม่ · response shape เดิม

## Tests
`src/services/__tests__/line-report-coowner.test.ts` `[blocker]` 4 เทส — mutation ย้อนเป็น "เจ้าของหลักเท่านั้น" / เปลี่ยน role เป็น ADMIN ⇒ แดง 3/4
