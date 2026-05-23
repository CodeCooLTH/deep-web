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
