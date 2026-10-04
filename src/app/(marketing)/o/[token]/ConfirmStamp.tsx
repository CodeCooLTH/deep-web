/**
 * ConfirmStamp — ตราประทับบนคำสั่งซื้อที่ปิดแล้ว (แนวทาง 5 "สลิป" ที่ user อนุมัติ 2026-10-04)
 *
 * 🛑 คำบนตราต้องตรงกับคนที่ปิดใบจริง — ผู้กดเอง = "ได้รับแล้ว"/"รับบริการแล้ว" ·
 * COD เคลียร์/ระบบปิดเอง/ใบเก่าที่ไม่รู้ = "สำเร็จ" (ผู้เรียกเป็นคนเลือกคำ) ไม่มีวันที่ = ไม่แสดงวันที่
 * สีเขียวได้เพราะเป็นสถานะที่ยืนยันแล้วจริง (Verified-Means-Green) · หมึกใช้ VERIFIED_INK (ผ่าน AA)
 * ตกแต่งล้วน (ข้อมูลเดียวกันอยู่ที่ป้ายสถานะของหน้าแล้ว) แต่คงไว้ให้ screen reader อ่านได้เป็นข้อความ
 *
 * Base: ม็อกอัพ docs/superpowers/specs/2026-10-04-sms-link-v5-detailed-mockup.html (.stamp)
 */
import Box from '@mui/material/Box'

import { formatDateTH } from '@/lib/format-date'
import { VERIFIED_INK } from './TrustPill'

export default function ConfirmStamp({ label, atIso }: { label: string; atIso: string | null }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 5, pt: 1, pb: 4 }}>
      <Box
        sx={{
          transform: 'rotate(-8deg)',
          border: '3px solid',
          borderColor: VERIFIED_INK,
          borderRadius: '10px',
          px: 3,
          py: 1,
          color: VERIFIED_INK,
          textAlign: 'center',
          boxShadow: `inset 0 0 0 2px var(--mui-palette-background-paper), inset 0 0 0 4px ${VERIFIED_INK}`,
          lineHeight: 1.2,
        }}
      >
        <Box component='span' sx={{ display: 'block', fontSize: '1.125rem', fontWeight: 700 }}>
          {label}
        </Box>
        {atIso && (
          <Box component='span' sx={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
            {formatDateTH(atIso)}
          </Box>
        )}
      </Box>
    </Box>
  )
}
