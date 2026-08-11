/**
 * TrustPill — ป้ายเล็กบนหน้าออเดอร์ `/o/[token]` ใช้ร่วมทั้งจอ guest และจอหลังล็อกอิน
 *
 * 🛑 ทำไมไม่ใช้ MUI `Chip variant='tonal'`: tonal ของธีมนี้ให้ text = `{semantic}.main` บนพื้น
 * `{semantic}` จาง ซึ่งวัดได้ 1.83–3.51:1 ทุกสี = ตก AA ทั้งชุด และป้ายพวกนี้แบก "ระดับการยืนยัน"
 * กับ "tier" ซึ่งเป็นสาระของจอนี้ทั้งจอ ไม่ใช่ของประดับที่อ่านไม่ออกก็ได้
 *
 * ย้ายออกมาจาก `GuestOrderView.tsx` (เดิมประกาศไว้ในไฟล์นั้นไฟล์เดียว) เพราะจอหลังล็อกอิน
 * ใช้ `Chip` อยู่ ⇒ ป้ายชุดเดียวกันของออเดอร์ใบเดียวกันมี 2 หน้าตา ห่างกันไม่กี่วินาที
 *
 * 🛑 สีของโทน verify มาจาก `VERIFY_BADGE_PALETTE` (SSOT) ไม่ประกาศซ้ำ — ต้นฉบับใน
 * `GuestOrderView` เคยเขียนค่าเดียวกันซ้ำเองทั้ง 3 โทน ทั้งที่ไฟล์ SSOT บอกเหตุผลไว้เองว่า
 * "ถ้าปล่อยให้แต่ละที่แปลโทนเป็นสีเอง มันจะเลื่อนออกจากกันทันทีที่มีคนแก้ข้างเดียว" (HR16)
 *
 * Base: src/app/(marketing)/o/[token]/GuestOrderView.tsx (TrustPill เดิม)
 */
import Box from '@mui/material/Box'

import { Icon } from '@iconify/react'

import { VERIFY_BADGE_PALETTE, type VerifyBadgeTone } from '@/lib/verify-badge'

/**
 * Verified Ink — เขียวเข้มสำหรับ "ตัวหนังสือ" บนพื้นเขียวจาง
 *
 * 🛑 ห้ามใช้ `success.main` (#28C76F) เป็นสีตัวอักษร: บนพื้นจางได้ ~1.9–2.2:1 ซึ่งตก AA ไปไกล
 * ค่านี้คือเฉดเดียวกันแค่เข้มขึ้น (ไม่เปลี่ยนฮิว — docs/conventions/contrast-fix-keeps-hue.md)
 * อ่านจาก SSOT ของป้ายยืนยัน ไม่ประกาศเลขซ้ำ
 */
export const VERIFIED_INK = VERIFY_BADGE_PALETTE.green.fg

/** พื้นคู่ของ `VERIFIED_INK` — อ่านจาก SSOT เดียวกัน ไม่เขียนค่า rgba ซ้ำที่หน้าจอ
 *  (audit 2026-08-11 พบว่า GuestOrderView hardcode `rgba(40,199,111,0.15)` ไว้ทั้งที่ import
 *  `VERIFIED_INK` จาก palette ตัวเดียวกันนี้มาใช้อยู่แล้วในบรรทัดข้าง ๆ กัน) */
export const VERIFIED_BG = VERIFY_BADGE_PALETTE.green.bg

export default function TrustPill({
  tone,
  label,
  icon,
  tierColor,
}: {
  /** `'tier'` = ป้ายที่สีมาจาก palette ของธีม (ระดับ tier / สถานะออเดอร์) ส่งผ่าน `tierColor` */
  tone: VerifyBadgeTone | 'tier'
  label: string
  icon?: string
  tierColor?: string
}) {
  const palette = tone === 'tier' ? { bg: 'action.hover', fg: 'text.primary' } : VERIFY_BADGE_PALETTE[tone]

  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.375,
        borderRadius: 999,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        bgcolor: palette.bg,
        color: tone === 'tier' && tierColor ? `${tierColor}.dark` : palette.fg,
      }}
    >
      {icon && <Icon icon={icon} fontSize={14} />}
      {label}
    </Box>
  )
}
