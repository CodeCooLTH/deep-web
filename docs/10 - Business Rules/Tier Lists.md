# Tier Lists — Trust Tier (Single Source of Truth)

> **เอกสารนี้คือแหล่งความจริงเดียว (SSOT) ของระบบ Tier ทั้งหมดในแพลตฟอร์ม Deep/SafePay.**
> ⚠️ **เมื่อใดก็ตามที่ทำงาน/พูดถึง "Tier" (trust tier, tier name, tier cover, tier color, mapping) — ต้องอ่านเอกสารฉบับนี้ก่อนเสมอ** แล้วยึดตามนี้ ห้ามตั้ง mapping/ชื่อ tier เองที่อื่น.
> อัปเดตล่าสุด: 2026-05-23

---

## ภาพรวม
ระบบ tier มี **2 ชั้น**:
1. **Trust Score (0–100)** → **Letter Grade (6 ระดับ)** — คำนวณใน `getTrustLevel()`
2. **Letter Grade** → **Tier แสดงผล (5 tier)** — map ใน `getTierCover()` (รวบ D,C เป็น Classic)

> ทำไม 6→5: cover art มี 5 แบบ (Classic/Silver/Gold/Diamond/Star); ระดับล่างสุด D และ C ใช้ Classic ร่วมกัน (entry tier).

---

## ตารางหลัก (canonical mapping)

| Trust Score | Letter Grade | Tier (display) | Dots | Cover asset |
|---|---|---|---|---|
| 90–100 | A+ | **Deep Star** | ●●●●● (5) | `public/images/tier_covers/tier_cover_5_star.png` |
| 80–89 | A | **Deep Diamond** | ●●●●○ (4) | `tier_cover_4_diamond.png` |
| 70–79 | B+ | **Deep Gold** | ●●●○○ (3) | `tier_cover_3_gold.png` |
| 60–69 | B | **Deep Silver** | ●●○○○ (2) | `tier_cover_2_silver.png` |
| 40–59 | C | **Deep Classic** | ●○○○○ (1) | `tier_cover_1_classic.png` |
| 0–39 | D | **Deep Classic** | ○○○○○ (0–1) | `tier_cover_1_classic.png` |

- **Letter grade thresholds** (จาก `getTrustLevel(score)`): A+≥90 · A≥80 · B+≥70 · B≥60 · C≥40 · D<40
- **ชื่อ tier มี prefix "Deep"** เสมอ (Deep Classic / Deep Silver / Deep Gold / Deep Diamond / Deep Star) — baked อยู่ในรูป cover แล้ว
- Cover art: 1800×420px, banner เต็มใบ (มีชื่อ tier + dots + ลายในรูป)

## สี chip (เมื่อแสดง tier เป็น chip โดยไม่ใช้รูป — เช่น order page)
อิงสีหลักของแต่ละ cover:
| Tier | โทนสี | MUI chip color (แนะนำ) |
|---|---|---|
| Deep Classic | ส้ม/อำพัน | `warning` |
| Deep Silver | เทาเงิน | `default` / `secondary` |
| Deep Gold | ทอง | `warning` (หรือ custom gold) |
| Deep Diamond | ฟ้า | `info` |
| Deep Star | ม่วง | `secondary` / `primary` |

---

## Implementation (จุดที่ map จริง — แก้ที่นี่เท่านั้น)
- **Score → Letter:** `src/services/trust-score.service.ts` → `getTrustLevel(score): "A+"|"A"|"B+"|"B"|"C"|"D"`
- **Letter → Tier cover:** `src/views/pages/user-profile/UserProfileHeader.tsx` → `getTierCover(trustLevel): string` (คืน path รูป)
- **ใช้ที่:**
  - `/u/[username]` (public profile) — banner ใช้รูป cover เต็มใบ (ชื่อ+dots baked)
  - `/o/[token]` (order confirm) — chip tier ชื่อ + สี (ไม่ใช้รูป) ใช้ mapping เดียวกัน

> **กฎ:** ถ้าจะแสดง tier ที่หน้าใหม่ → import/ใช้ helper เดิม หรือยึด mapping ตารางนี้ **ห้าม hardcode mapping ใหม่** (เคยมี drift: order page เคยใช้ A+/A/B... สั้น, profile เคยใช้ Starter/Bronze/Platinum — รวมเป็น 5-tier นี้แล้ว 2026-05-23).

## ประวัติ
- 2026-05-23: รวมเป็น 5-tier scheme (Classic/Silver/Gold/Diamond/Star) + cover art; เลิกใช้ชื่อ 6-tier "Deep Starter/Bronze/Platinum" (เคยอยู่ใน UserProfileHeader gradient) และ letter-only ของ order page.
- **2026-07-04: banner เลิกใช้รูป cover PNG → เปลี่ยนเป็น CSS gradient ต่อ tier** (`getTierGradient()` ใน `src/lib/trust-tier.ts`) และ **เลิก render dot indicator** — ตาราง "Cover asset" กับคอลัมน์ "Dots" ด้านบนจึงเป็นบันทึกเชิงประวัติ ไม่ใช่สิ่งที่โค้ดใช้จริงแล้ว (เอกสารกับโค้ดเคยไม่ตรงกันอยู่ช่วงหนึ่ง — พบตอน Impeccable audit 2026-07-22)
- **2026-08-10: ไล่สีของ Deep Star เจือจางลง 1 ขั้นบน `primary.tonalRamp`** — `#5a4ee0/#7367F0/#b3acf8` → `#7367F0/#9389f4/#d9d4fb` (ยังเป็นขั้นจริงบน ramp ทุกค่า และคงเฉดเดิม ปรับแค่ความเข้ม). เหตุผล: รอบเดียวกันยกความสูงปกจาก 104px → 132px (ไล่สี) / 144–224px (มีรูป) ทำให้ Star ซึ่งเป็น tier **เดียว** ที่ใช้ `#7367F0` (primary ของทั้งระบบ) มีพื้นที่ม่วงโตขึ้น ~27% บนหน้าที่มีม่วงอยู่แล้วอีก 3 จุด (ปุ่มแชท/แท็บ active/ป้ายปักหมุด) → ดัน One Voice (ม่วง ≤10%) เกินเพดาน และ DESIGN.md มี "ไล่สีม่วง gradient ตกแต่ง" อยู่ในรายการ Don't ตรงตัว. **แลกมาด้วย** Star ดูเบากว่า Gold/Diamond ที่ยังอิ่มตัวเต็ม ซึ่งขัดความรู้สึก "รางวัล" ของ tier สูงสุดอยู่บ้าง — user รับข้อแลกเปลี่ยนแล้ว. ล็อกด้วยเทส `[blocker]` ใน `trust-tier.test.ts` (ห้ามกลับไปใช้ขั้นเข้ม) เพราะ hex ที่เข้มกว่ายัง "ถูก" ตามชนิดข้อมูลทุกประการ ผิดแค่ *ปริมาณสีบนหน้าจอ* ซึ่งไม่มี gate ไหนวัดได้
- **2026-07-22 (Impeccable critique P0-2): แยก gradient/accent ของ C กับ D ออกจากกัน — ชื่อ tier ยังเป็น "Deep Classic" ร่วมกันเหมือนเดิม ไม่เปลี่ยน mapping**
  - เหตุผล: คะแนน 0-39 (D) เคยได้ gradient ส้ม/ทองชุดเดียวกับ C ซึ่ง**อิ่มตัวกว่า Deep Gold ด้วยซ้ำ** คนทั่วไปอ่านว่า "ทอง = ดี" → บัญชีที่ยังไม่มีประวัติเลยหน้าตาเหมือนร้านที่พิสูจน์ตัวแล้ว ขัด Design Principle 1 ของ `PRODUCT.md`
  - C (40-59) → อำพันจางกว่า Gold ชัดเจน · D (0-39) → เทาม่วงจาก ink ramp (สื่อ "ยังไม่มีข้อมูล" ไม่ใช่ "รางวัล")
  - **นี่คือ presentation layer ไม่ใช่การเปลี่ยน tier mapping** — ชื่อ/threshold/การรวม D,C เป็น Classic คงเดิมทุกอย่างตามตารางหลัก
  - เพิ่มอีกชั้น: หน้า public profile จะ override เป็น gradient เทาเสมอเมื่อร้าน**ยังมีออเดอร์จบไม่ถึง 3 รายการ** (`completionRate === null`) โดยไม่สนใจ tier จริง — เพราะ trust score ถูกดันด้วยรีวิวได้ แต่ออเดอร์จบจริงปลอมยากกว่ามาก. logic นี้อยู่ที่ `ProfileBanner` ไม่ได้อยู่ใน tier mapping
