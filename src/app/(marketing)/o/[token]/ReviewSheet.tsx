'use client'

/**
 * ReviewSheet — แผ่นให้คะแนนที่ขึ้นทันทีหลังผู้ซื้อยืนยันรับ (แบบ Grab — user สั่ง 2026-10-04, แนวทาง 5)
 *
 * มือถือ (<sm) = แผ่นชิดล่าง · เดสก์ท็อป = dialog กลางจอ — ใช้ MUI `Dialog` ตัวเดียวทั้งสองจอ
 * เพราะ Dialog เป็นเจ้าของ scroll-lock + focus trap + aria-modal + Esc เอง
 * 🛑 ห้ามเรียก `useLockBodyScroll` คู่กับแผ่นนี้ (ล็อกสองเจ้าของ = body ค้างเลื่อนไม่ได้ — feedback_scroll_lock_single_owner)
 *
 * ปิดได้ 3 ทาง: "ไว้ทีหลัง" · Esc · แตะฉากหลัง (เฉพาะตอนยังไม่ได้กรอกอะไร — กันแตะพลาดแล้วงานหาย)
 * ระหว่างกำลังส่ง ปิดไม่ได้ทุกทาง (กันปิดกลางการส่ง)
 * ไม่ผูก history — กด Back ออกจากหน้าตามปกติ การยืนยันรับถูกบันทึกไปแล้ว
 *
 * Base: src/app/(marketing)/o/[token]/OrderDetailMobile.tsx (Dialog ยืนยันรับ — theme components/dialogs)
 *   + src/app/(marketing)/a/[id]/AuctionDetailSheet.tsx (แผ่นชิดล่าง: มุมบนโค้ง + header) — มุม 12px ตาม DESIGN.md
 */
import { useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'

import ReviewForm from './ReviewForm'
import { VERIFIED_BG, VERIFIED_INK } from './TrustPill'

type Props = {
  open: boolean
  onClose: () => void
  token: string
  shopName: string
  /** โลโก้ร้าน (ผ่าน toFileUrl แล้ว) · null = ใช้อักษรแรกของชื่อร้าน */
  shopAvatar: string | null
  /** หัวผลการยืนยัน — ผันคำชุดเดียวกับ ctaLabel ของปุ่มที่เพิ่งกด (ส่งมาจากผู้เรียก ห้ามต่อสตริงเอง) */
  headline: string
}

export default function ReviewSheet({ open, onClose, token, shopName, shopAvatar, headline }: Props) {
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (busy) return
    setDirty(false)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => {
        if (busy) return
        if (reason === 'backdropClick' && dirty) return
        close()
      }}
      aria-labelledby='review-sheet-title'
      sx={{
        '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } },
        '& .MuiDialog-paper': {
          m: { xs: 0, sm: 4 },
          width: '100%',
          maxWidth: { xs: '100%', sm: 444 },
          borderRadius: { xs: '12px 12px 0 0', sm: '12px' },
          maxHeight: 'calc(100dvh - 24px)',
        },
      }}
    >
      <Box
        sx={{
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          px: { xs: 5, sm: 6 },
          pt: 3,
          // 🛑 แผ่นชิดขอบล่างจอ = ต้องรับ safe-area เอง (marketing layout ตั้ง viewportFit:'cover' แล้ว)
          pb: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        {/* ที่จับ — บอกว่าเป็นแผ่นชิดล่าง (มือถือเท่านั้น) */}
        <Box
          aria-hidden
          sx={{ display: { xs: 'block', sm: 'none' }, width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 3 }}
        />

        {/* หัวผล — เขียวได้ตรงนี้เพราะการยืนยันรับคือหลักฐานจริงที่ผู้ซื้อกดเอง (Verified-Means-Green)
            เขียวอยู่ที่แผ่นกลมของไอคอนเท่านั้น ตัวหนังสือเป็นหมึกปกติ (#28C76F บนขาว 2.21:1 ตก AA) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: VERIFIED_BG, display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <Icon icon='tabler-check' fontSize={22} style={{ color: VERIFIED_INK }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography id='review-sheet-title' variant='h6' sx={{ fontWeight: 700 }}>
              {headline}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              บันทึกลงประวัติของร้านเรียบร้อย
            </Typography>
          </Box>
        </Box>

        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 4 }} />

        {/* ร้านเด่นกว่าคำถาม (user สั่ง 2026-10-04 "ชื่อร้านและ logo ร้านเด่นกว่านี้") —
            คำถามเป็นบรรทัดเล็กนำ ชื่อร้านตัวหนาคู่โลโก้ เห็นทันทีว่ากำลังให้คะแนนร้านไหน */}
        <Typography variant='body2' color='text.secondary' sx={{ fontWeight: 600 }}>
          ให้คะแนนร้านนี้
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 2, mb: 3 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              bgcolor: 'background.paper',
              boxShadow: 'var(--mui-customShadows-sm)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              color: 'text.secondary',
            }}
          >
            {shopAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shopAvatar} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              shopName.slice(0, 1)
            )}
          </Box>
          {/* ชื่อร้านจริงยาวได้ ~38 ตัวอักษร — ตัด 2 บรรทัด ไม่ดันความกว้างแผ่น */}
          <Typography
            sx={{
              fontSize: '1.125rem',
              fontWeight: 700,
              lineHeight: 1.35,
              minWidth: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {shopName}
          </Typography>
        </Box>

        <ReviewForm
          token={token}
          variant='sheet'
          onSubmitted={close}
          onDirtyChange={setDirty}
          onBusyChange={setBusy}
        />

        <Button fullWidth color='secondary' onClick={close} disabled={busy} sx={{ mt: 1, minHeight: 44 }}>
          ไว้ทีหลัง
        </Button>
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', textAlign: 'center' }}>
          เขียนได้ทีหลังที่การ์ด &ldquo;รีวิวร้านค้า&rdquo; ในหน้านี้
        </Typography>
      </Box>
    </Dialog>
  )
}
