'use client'

/**
 * BookingGuestView — หน้าฝั่งผู้จอง สำหรับ Order ที่ type = 'BOOKING' (feature 00017 P2)
 *
 * Base: src/app/(marketing)/o/[token]/OrderDetailMobile.tsx
 *   (ส่วนอัปโหลดสลิป + โครงการ์ด MUI + สีสถานะ) — ตัดส่วนที่ไม่เกี่ยวกับการจองออก
 *   (รายการสินค้า, ที่อยู่จัดส่ง, tracking, ปุ่มยืนยันรับของ, รีวิว)
 *
 * ทำไมแยกไฟล์แทนแก้ OrderDetailMobile (972 บรรทัด): flow การจองต่างจากออเดอร์สินค้า
 * แทบทั้งหมด — ไม่มีของจัดส่ง ผู้จองยืนยันเองไม่ได้ และจบด้วยใบจองแทนการรับของ
 * การยัดเงื่อนไขเข้าไฟล์เดิมจะทำให้ทั้งสอง flow อ่านยากขึ้นทั้งคู่
 *
 * IMPORTANT: ผู้จองยืนยันการจองเองไม่ได้ (TFR-006) — หน้านี้จึงไม่มีปุ่มยืนยันใด ๆ
 * มีแต่ "แนบสลิป" แล้วรอเจ้าของตรวจ
 */

import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import { Icon } from '@iconify/react'
import { formatDateTH } from '@/lib/format-date'
import { uploadFileId } from '@/lib/upload-client'
import PublicProfileFooter from '@/views/pages/user-profile/v2/PublicProfileFooter'
import BrandHomeLink from './BrandHomeLink'

export type BookingGuestData = {
  token: string
  shortCode: string | null
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  shopName: string
  roomName: string
  guestName: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  totalAmount: number
  depositAmount: number
  slipFileId: string | null
  cancelReason: string | null
}

const baht = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

export default function BookingGuestView({ booking }: { booking: BookingGuestData }) {
  const [slipFileId, setSlipFileId] = useState(booking.slipFileId)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remaining = booking.totalAmount - booking.depositAmount
  const needsDeposit = booking.depositAmount > 0
  const isConfirmed = booking.status === 'CONFIRMED'
  const isCancelled = booking.status === 'CANCELLED'

  async function uploadSlip(file: File) {
    setUploading(true)
    setError(null)
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      // สลิปที่ถ่ายจากมือถือเกิน 4.5MB ได้ง่าย ๆ (ดู upload-policy.ts)
      const fileId = await uploadFileId(file, 'DOCUMENT')

      // ใช้ endpoint แนบสลิปเดิมของออเดอร์ — ไม่มี endpoint ใหม่ฝั่งผู้จอง
      const res = await fetch(`/api/orders/${booking.token}/slip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('attach')
      const data = (await res.json()) as { slipFileId: string }
      setSlipFileId(data.slipFileId)
    } catch {
      setError('แนบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      {/* 🛑 ทางออกเดียวของจอนี้ — จอใบจองไม่มีลิงก์ออกไปไหนเลยแม้แต่จุดเดียว และเคยพึ่ง
          header ของ `FrontLayout` ที่ถูกถอดออกในคอมมิตเดียวกันนี้ (จอนี้ไม่อยู่ในตาราง
          ตรวจของสเปกซึ่งไล่แค่ 3 จอ auth — เจอตอนไล่ทุกไฟล์ที่อยู่ใต้ layout เดิม) */}
      <Box sx={{ display: 'flex', mb: 1, ml: '-10px' }}>
        <BrandHomeLink />
      </Box>

      {/* ── สถานะ ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Typography variant='h5' sx={{ fontWeight: 600 }}>
          {isConfirmed ? 'ใบจอง' : 'รายละเอียดการจอง'}
        </Typography>
        <Chip
          size='small'
          label={isConfirmed ? 'ยืนยันแล้ว' : isCancelled ? 'ยกเลิกแล้ว' : 'รอยืนยัน'}
          // Verified-Means-Green: เขียวเฉพาะ "ยืนยันแล้ว" — รอยืนยันใช้ warning
          color={isConfirmed ? 'success' : isCancelled ? 'default' : 'warning'}
        />
      </Box>

      {isCancelled && (
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2, mb: 2 }}>
          <Typography variant='body2' color='text.secondary'>
            การจองนี้ถูกยกเลิกแล้ว หากต้องการจองใหม่ กรุณาติดต่อ {booking.shopName} โดยตรง
          </Typography>
        </Box>
      )}

      {/* ── รายละเอียดการเข้าพัก ── */}
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 2.5, boxShadow: 1, mb: 2 }}>
        <Typography variant='subtitle2' color='text.secondary'>
          {booking.shopName}
        </Typography>
        <Typography variant='h6' sx={{ fontWeight: 600, mb: 2 }}>
          {booking.roomName}
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box>
            <Typography variant='caption' color='text.secondary'>
              เข้าพัก
            </Typography>
            <Typography>{booking.checkIn ? formatDateTH(new Date(booking.checkIn)) : '—'}</Typography>
          </Box>
          <Box>
            <Typography variant='caption' color='text.secondary'>
              เช็คเอาท์
            </Typography>
            <Typography>{booking.checkOut ? formatDateTH(new Date(booking.checkOut)) : '—'}</Typography>
          </Box>
          <Box>
            <Typography variant='caption' color='text.secondary'>
              จำนวนคืน
            </Typography>
            <Typography>{booking.nights ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant='caption' color='text.secondary'>
              ผู้เข้าพัก
            </Typography>
            <Typography>{booking.guestName ?? '—'}</Typography>
          </Box>
        </Box>
      </Box>

      {/* ── ยอดเงิน ── */}
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 2.5, boxShadow: 1, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography color='text.secondary'>ยอดรวม</Typography>
          <Typography>฿{baht(booking.totalAmount)}</Typography>
        </Box>
        {needsDeposit && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography color='text.secondary'>
                {isConfirmed ? 'มัดจำที่ชำระแล้ว' : 'มัดจำที่ต้องโอน'}
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>฿{baht(booking.depositAmount)}</Typography>
            </Box>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>ชำระวันเข้าพัก</Typography>
              <Typography sx={{ fontWeight: 600 }}>฿{baht(remaining)}</Typography>
            </Box>
          </>
        )}
        {!needsDeposit && (
          <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
            ที่พักนี้ไม่เก็บมัดจำ ชำระเต็มจำนวนวันเข้าพัก
          </Typography>
        )}
      </Box>

      {/* ── แนบสลิป (เฉพาะเมื่อมีมัดจำ และยังไม่ยืนยัน/ยกเลิก) ── */}
      {needsDeposit && !isConfirmed && !isCancelled && (
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 2.5, boxShadow: 1, mb: 2 }}>
          <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 0.5 }}>
            โอนมัดจำแล้วแนบสลิป
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            โอนเข้าบัญชีของ {booking.shopName} ตามที่ตกลงกัน แล้วแนบสลิปที่นี่
            เจ้าของที่พักจะตรวจแล้วยืนยันการจองให้
          </Typography>

          {slipFileId ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Icon icon='tabler:circle-check' width={20} style={{ color: 'var(--mui-palette-success-main)' }} />
              <Typography variant='body2'>
                แนบสลิปแล้ว รอเจ้าของที่พักตรวจสอบ
              </Typography>
            </Box>
          ) : null}

          <Button
            component='label'
            variant={slipFileId ? 'outlined' : 'contained'}
            disabled={uploading}
            sx={{ mt: slipFileId ? 1.5 : 0, minHeight: 44 }}
          >
            {uploading ? 'กำลังอัปโหลด' : slipFileId ? 'แนบสลิปใหม่' : 'แนบสลิป'}
            <input
              type='file'
              accept='image/*'
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadSlip(f)
              }}
            />
          </Button>

          {error && (
            <Typography variant='body2' color='error' sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </Box>
      )}

      {/* ── ใบจอง (เฉพาะยืนยันแล้ว) ── */}
      {isConfirmed && (
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 2,
            p: 2.5,
            boxShadow: 1,
            border: 1,
            borderColor: 'success.main',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Icon icon='tabler:rosette-discount-check-filled' width={22} style={{ color: 'var(--mui-palette-success-main)' }} />
            <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
              ยืนยันการจองแล้ว
            </Typography>
          </Box>
          <Typography variant='body2' color='text.secondary'>
            แสดงหน้านี้ตอนเช็คอินที่ {booking.shopName}
          </Typography>
          {booking.shortCode && (
            <Typography sx={{ mt: 1.5, fontWeight: 600, letterSpacing: 1 }}>
              รหัสอ้างอิง {booking.shortCode}
            </Typography>
          )}
        </Box>
      )}

      {/* ท้ายหน้าชุดเดียวกับหน้าโปรไฟล์ร้านสาธารณะ — ดูเหตุผลที่ `PublicProfileFooter` */}
      <PublicProfileFooter />
    </Box>
  )
}
