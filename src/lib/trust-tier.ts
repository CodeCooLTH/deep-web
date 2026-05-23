// Trust tier display helper (client-safe, pure)
// SSOT: docs/10 - Business Rules/Tier Lists.md — ห้ามตั้ง mapping/ชื่อ tier เองที่อื่น
// score → letter grade → 5-tier display (D,C→Classic · B→Silver · B+→Gold · A→Diamond · A+→Star)
//
// หมายเหตุ: threshold ต้องตรงกับ getTrustLevel() ใน src/services/trust-score.service.ts
// (service เป็น server module ที่ import prisma — client component import ตรงไม่ได้ จึง inline ที่นี่)
// ถ้าแก้ threshold: แก้ทั้ง 2 ที่ + อัปเดต Tier Lists.md

export type TrustLetter = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D'
export type TierChipColor = 'warning' | 'default' | 'info' | 'secondary'

function letterFromScore(score: number): TrustLetter {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

/** ชื่อ tier แสดงผล (มี prefix "Deep") ตาม Tier Lists SSOT */
export function getTierLabel(trustScore: number): string {
  switch (letterFromScore(trustScore)) {
    case 'A+':
      return 'Deep Star'
    case 'A':
      return 'Deep Diamond'
    case 'B+':
      return 'Deep Gold'
    case 'B':
      return 'Deep Silver'
    default:
      return 'Deep Classic' // C, D = entry tier
  }
}

/** MUI chip color ตามโทนสีของแต่ละ tier (Tier Lists SSOT) */
export function getTierColor(trustScore: number): TierChipColor {
  switch (letterFromScore(trustScore)) {
    case 'A+':
      return 'secondary' // ม่วง = Deep Star
    case 'A':
      return 'info' // ฟ้า = Deep Diamond
    case 'B+':
      return 'warning' // ทอง = Deep Gold
    case 'B':
      return 'default' // เทา = Deep Silver
    default:
      return 'warning' // ส้ม = Deep Classic (C, D)
  }
}

/** cover image ต่อ tier (ชื่อ tier + dots baked ในรูป) — SSOT, keyed by score */
// ทำไม: mapping ย้ายมาที่นี่จาก UserProfileHeader.tsx เพื่อให้ Order Detail V1 ใช้ร่วมได้
// D,C → Classic · B → Silver · B+ → Gold · A → Diamond · A+ → Star
export function getTierCover(trustScore: number): string {
  const base = '/images/tier_covers'
  switch (letterFromScore(trustScore)) {
    case 'A+': return `${base}/tier_cover_5_star.png`
    case 'A':  return `${base}/tier_cover_4_diamond.png`
    case 'B+': return `${base}/tier_cover_3_gold.png`
    case 'B':  return `${base}/tier_cover_2_silver.png`
    default:   return `${base}/tier_cover_1_classic.png` // C, D = Classic
  }
}
