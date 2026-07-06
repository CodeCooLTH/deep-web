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

/** ช่วงคะแนนของแต่ละ tier label (สำหรับ query filter ตามเลเวล) — threshold ตรงกับ letterFromScore SSOT.
 * Star ≥90 · Diamond 80-89 · Gold 70-79 · Silver 60-69 · Classic <60 (C+D). null = ไม่ตรง tier ใด */
export function getTierScoreRange(tierLabel: string): { gte: number; lt?: number } | null {
  switch (tierLabel) {
    case 'Deep Star':
      return { gte: 90 }
    case 'Deep Diamond':
      return { gte: 80, lt: 90 }
    case 'Deep Gold':
      return { gte: 70, lt: 80 }
    case 'Deep Silver':
      return { gte: 60, lt: 70 }
    case 'Deep Classic':
      return { gte: 0, lt: 60 }
    default:
      return null
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

/**
 * cover เป็น CSS gradient ต่อ tier (แทนรูป baked) — ใช้ที่ /u/[username] redesign (2026-07-04)
 * โทนสีอิงตาราง "สี chip" ใน Tier Lists.md: Classic=ส้ม/อำพัน · Silver=เทาเงิน · Gold=ทอง · Diamond=ฟ้า · Star=ม่วง (Vuexy primary #7367F0)
 * คืนค่าเป็น CSS background(-image) value พร้อมใช้ตรง — ใส่ 3-stop ให้มีมิติ ไม่แบนราบ
 */
export function getTierGradient(trustScore: number): string {
  switch (letterFromScore(trustScore)) {
    case 'A+': // Deep Star — ม่วง (Vuexy primary)
      return 'linear-gradient(135deg, #6558E8 0%, #7367F0 45%, #A79DF5 100%)'
    case 'A': // Deep Diamond — ฟ้า
      return 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 45%, #7DD3FC 100%)'
    case 'B+': // Deep Gold — ทอง
      return 'linear-gradient(135deg, #B45309 0%, #F59E0B 45%, #FCD34D 100%)'
    case 'B': // Deep Silver — เทาเงิน
      return 'linear-gradient(135deg, #475569 0%, #94A3B8 45%, #E2E8F0 100%)'
    default: // Deep Classic (C, D) — ส้ม/อำพัน
      return 'linear-gradient(135deg, #C2410C 0%, #F97316 45%, #FDBA74 100%)'
  }
}

/**
 * ระยะห่างจาก tier ถัดไป — threshold ต้องตรงกับ letterFromScore()/getTrustLevel() ด้านบน (60/70/80/90)
 * null = อยู่ tier สูงสุดแล้ว (Deep Star, score >= 90)
 * หมายเหตุ: ข้าม threshold 40 (C→B ไม่ใช่ boundary เปลี่ยนชื่อ tier — C กับ D ต่างเป็น "Deep Classic" เหมือนกัน)
 */
export function getNextTierInfo(
  trustScore: number
): { pointsToNext: number; nextTierLabel: string } | null {
  const thresholds: { min: number; label: string }[] = [
    { min: 60, label: 'Deep Silver' },
    { min: 70, label: 'Deep Gold' },
    { min: 80, label: 'Deep Diamond' },
    { min: 90, label: 'Deep Star' },
  ]
  for (const t of thresholds) {
    if (trustScore < t.min) {
      return { pointsToNext: t.min - trustScore, nextTierLabel: t.label }
    }
  }
  return null // ถึง Deep Star แล้ว — tier สูงสุด
}
