# ห้ามใช้ emoji ใน UI — ใช้ icon เท่านั้น (+ icon ที่ไม่ระบุต้องถาม user)

> **SSOT ของกฎนี้.** อัปเดต: 2026-07-02 (จาก user directive ระหว่างออกแบบ Buyer Auction redesign)

## กฎ

1. **ห้ามใช้ emoji ทุกจุดใน UI** (ทุก surface / subdomain / theme — buyer Vuexy + seller/admin Paces).
   - ห้ามฝัง emoji ในข้อความ, badge, chip, ปุ่ม, label, comment/bid bubble, empty state, toast ฯลฯ
   - รวมถึง emoji ที่ "ดูเหมือนไอคอน" เช่น 👑 (crown/ผู้นำ), 🔥, ⭐, 💬, 📦, ✅, ⚡ — ต้องแทนด้วย icon จริง
   - เหตุผล: emoji render ต่างกันแต่ละ OS/แพลตฟอร์ม, ไม่คุมสี/ขนาด/น้ำหนักได้, หลุดจาก design system (ธีม/สีแบรนด์)

2. **ที่ที่ควรมี icon แต่ "ยังไม่กำหนด" ว่าจะใช้ icon ตัวไหน → ต้องถาม user เสมอ ก่อน implement**
   - ห้ามเดา/เลือก icon เองเมื่อ mockup หรือ spec ไม่ได้ระบุชื่อ icon ที่ชัดเจน
   - เช่น "ป้ายผู้นำการประมูล" ควรมี icon แต่ยังไม่ระบุ → ถาม user ว่าจะใช้ตัวไหน (crown? trophy? star?) ก่อน

## ใช้ icon อะไร / ยังไง

- **buyer / (marketing)** = Vuexy → `@iconify/react` (tabler เป็น default) ผ่าน pattern ของ theme
- **seller / admin / (paces)** = Paces → wrapper `@/components/wrappers/Icon` (bare name = `tabler:*`; namespaced เช่น `solar:*` ส่งตรง) — ดู Hard Rule 1/8
- ต้องคุมสีผ่าน token/`currentColor` ไม่ hardcode (ดู Hard Rule 7 / anuphan-font)

## Reviewer gate

- grep หา emoji ในไฟล์ที่แตะ (UI): ถ้าเจอ emoji ใน string/JSX ที่ไม่ใช่ข้อมูลจาก user → **block ก่อน merge**
- ตรวจว่า badge/label ที่ "ควรมี icon" ได้ถาม user + ใช้ icon จริง ไม่ใช่ emoji

## หมายเหตุ / หนี้ที่รู้อยู่

- Mockup `docs/mockups/auction/buyer-auction-concept1-flow.html` (ระหว่างออกแบบ) เคยใช้ emoji 👑/🔥 ชั่วคราวสำหรับป้าย "ผู้นำ" — **ตอน build จริงต้องถาม user เลือก icon แล้วแทน** (ห้ามคง emoji)
