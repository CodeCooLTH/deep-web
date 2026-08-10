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

/**
 * accent hex เฉพาะของแต่ละ tier (5 ค่าต่างกันจริง) — เพิ่มควบคู่ getTierColor() เดิม ไม่แทนที่
 * ทำไม: getTierColor() คืน 'warning' ให้ทั้ง Deep Gold (B+) และ Deep Classic (C,D) เพราะ TierChipColor
 * มีแค่ 4 ค่า (MUI chip palette) — ไม่พอแยก 5 tier ให้ต่างกันจริงตอนวาด accent (เช่น trust gauge)
 * ค่าทุกตัว derive จาก .impeccable/design.json tonalRamp (Impeccable remediation S-B7):
 *   Star=primary canonical, Diamond=signal-cyan canonical, Gold=warning-amber canonical,
 *   Silver=ink tonalRamp[3], Classic=warning-amber tonalRamp[2] (เข้มกว่า Gold เพื่อแยกออกจากกัน)
 */
export function getTierAccentColor(trustScore: number): string {
  switch (letterFromScore(trustScore)) {
    case 'A+':
      return '#7367F0' // Deep Star
    case 'A':
      return '#00BAD1' // Deep Diamond
    case 'B+':
      return '#FF9F43' // Deep Gold
    case 'B':
      return '#7a7689' // Deep Silver
    case 'C':
      return '#b36700' // Deep Classic 40-59 — มีประวัติจริงแล้ว (แต่คะแนนยังต่ำ)
    default:
      return '#9b98a8' // Deep Classic 0-39 (D) — เทาม่วง = ยังไม่มีข้อมูลเพียงพอ (P0-2: แยกภาพจาก C)
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
 *
 * S-B9 (Impeccable remediation Phase B): sync ทุกค่ากับ ramp ที่ user อนุมัติแล้ว (mockup/spec) — เดิมยังเป็น
 * Tailwind hex เก่าทั้งชุดทั้งที่ mockup sync ไปแล้ว ทุกค่า derive จาก .impeccable/design.json tonalRamp:
 *   Classic → warning-amber tonalRamp dark/mid/light (#5c3300/#b36700/#FF9F43 — ตรงกับ getTierAccentColor Classic #b36700)
 *   Silver  → ink tonalRamp dark/mid/light (#454155/#7a7689/#bdbbc7 — ตรงกับ getTierAccentColor Silver #7a7689)
 *   Gold    → warning-amber canonical dark/main/light (#e08400/#FF9F43/#ffd1a3 — ตรงกับ getTierAccentColor Gold #FF9F43)
 *   Diamond → signal-cyan canonical dark/main/light (#009eb2/#00BAD1/#8ee5ee — ตรงกับ getTierAccentColor Diamond #00BAD1)
 *   Star    → primary tonalRamp ขั้น main/+1/+3 (#7367F0/#9389f4/#d9d4fb)
 *
 * P0-2 (Impeccable critique — "ยังไม่มีประวัติ" ต้องไม่หน้าตาเหมือนรางวัล): C แยกจาก D แล้ว —
 *   C (40-59, มีประวัติจริง) → อำพันจางกว่า Gold (#b36700/#e08400/#ffd1a3)
 *   D (0-39, ยังไม่มีข้อมูลเพียงพอ) → เทาม่วง (#9b98a8/#bdbbc7/#dedce4) ไม่ใช้โทนทองอีกต่อไป
 *   ชื่อ tier ("Deep Classic") ยังใช้ร่วมกันตาม SSOT — แก้แค่ decoration ไม่แตะ mapping ชื่อ
 */
export function getTierGradient(trustScore: number): string {
  switch (letterFromScore(trustScore)) {
    // 🛑 Deep Star เจือจางลง 1 ขั้นบน primary tonalRamp เมื่อ 2026-08-10 (user เคาะ) —
    // เดิม #5a4ee0/#7367F0/#b3acf8 (ขั้น -1/main/+2) ตอนนี้ #7367F0/#9389f4/#d9d4fb (main/+1/+3)
    //
    // เหตุผล: นี่เป็น tier **เดียว** ที่ไล่สีปกใช้ #7367F0 ซึ่งเป็น primary ของทั้งระบบ ตอนที่ปก
    // ยังสูง 104px มันเป็นแถบบางพอที่จะไม่กินโควตา One Voice (ม่วง ≤10% ตาม DESIGN.md) แต่พอ
    // ยกปกเป็น 132px ในรอบเดียวกัน พื้นที่ม่วงโตขึ้น ~27% บนหน้าที่มีม่วงอยู่แล้วอีก 3 จุด
    // (ปุ่มแชท / แท็บ active / ป้ายปักหมุด) — และ DESIGN.md มี "ไล่สีม่วง gradient ตกแต่ง"
    // อยู่ในรายการ Don't ตรงตัว
    //
    // ทุกค่ายังเป็นขั้นจริงบน `primary.tonalRamp` ใน .impeccable/design.json ไม่ใช่สีที่ผสมเอง
    // และ **เฉดเดิมทั้งหมด** ปรับแค่ความเข้ม ตาม docs/conventions/contrast-fix-keeps-hue.md
    //
    // แลกมาด้วย: Star จะดูเบากว่า Gold/Diamond ที่ยังอิ่มตัวเต็ม ซึ่งขัดความรู้สึก "รางวัล" ของ
    // tier สูงสุดอยู่บ้าง — user รับข้อแลกเปลี่ยนนี้แล้ว (ปัจจุบันยังไม่มีร้านไหนในฐานถึงเกณฑ์ 90)
    case 'A+': // Deep Star — ม่วง (primary tonalRamp, เจือจาง)
      return 'linear-gradient(135deg, #7367F0 0%, #9389f4 45%, #d9d4fb 100%)'
    case 'A': // Deep Diamond — ฟ้า (signal-cyan canonical)
      return 'linear-gradient(135deg, #009eb2 0%, #00BAD1 45%, #8ee5ee 100%)'
    case 'B+': // Deep Gold — ทอง (warning-amber canonical)
      return 'linear-gradient(135deg, #e08400 0%, #FF9F43 45%, #ffd1a3 100%)'
    case 'B': // Deep Silver — เทาเงิน (ink tonalRamp)
      return 'linear-gradient(135deg, #454155 0%, #7a7689 45%, #bdbbc7 100%)'
    case 'C': // Deep Classic 40-59 — อำพันจางกว่า Gold (มีประวัติจริงแล้ว)
      return 'linear-gradient(135deg, #b36700 0%, #e08400 55%, #ffd1a3 100%)'
    default: // Deep Classic 0-39 (D) — เทาม่วง = ยังไม่มีข้อมูล (P0-2: แยกภาพจาก C)
      return 'linear-gradient(135deg, #9b98a8 0%, #bdbbc7 55%, #dedce4 100%)'
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
