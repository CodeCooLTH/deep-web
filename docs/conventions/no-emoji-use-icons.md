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

- grep หา emoji (colorful pictograph) ในไฟล์ UI ที่แตะ — ต้องคืน 0 ก่อน merge:
  ```
  grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' <ไฟล์ที่แตะ>
  ```
  ถ้าเจอใน string/JSX ที่ render เป็น UI (ไม่ใช่ code comment / ข้อมูลจาก DB) → **block**
- ตรวจว่า badge/label ที่ "ควรมี icon" ได้ถาม user + ใช้ icon จริง ไม่ใช่ emoji
- **carve-out ที่ไม่ block** (2026-07-02): (ก) **code comment** ที่ใช้ marker เช่น `⚠🛑🔒🔑` ไม่ใช่ UI; (ข) **typographic dingbat สีเดียว** `★ ☆ ✓ ✗ ✕ ♡ ▾ ▸` (ดาวเรตติ้ง/สถานะ/close/chevron) render คงที่ทุก OS — ไม่ใช่ emoji สี (จะแปลงเป็น icon = งาน stylistic แยก user เคาะ); (ค) **badge ที่ icon มาจาก data** (`badge.icon` ใน DB) — เป็น design decision ของ badge system แยก

## หมายเหตุ / หนี้ที่รู้อยู่

- Mockup `docs/mockups/auction/buyer-auction-concept1-flow.html` (ระหว่างออกแบบ) เคยใช้ emoji 👑/🔥 ชั่วคราวสำหรับป้าย "ผู้นำ" — build จริงแทนด้วย icon แล้ว (crown/gavel)
- **deferred (user เคาะ "ไม่เอา" 2026-07-02):** `BadgeIcon` fallback `🏅` (data-driven `badge.icon`) + typographic dingbat `★☆✓✗♡` — ยังไม่แปลงเป็น icon set; ถ้าจะทำต้อง user เคาะ scope
- **บทเรียน:** theme copy (Vuexy/Paces) มักพา emoji ติดมา (welcome copy 👋🚀💬, product badge 📦💻🛠️) — หลัง copy theme file ต้อง grep emoji เก็บทันที (ดู retro `docs/retro/2026-07-02-buyer-auction-redesign-seller-mobile-polish.md`)
