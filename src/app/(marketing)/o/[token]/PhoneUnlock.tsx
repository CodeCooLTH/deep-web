'use client'

/**
 * Lock screen สำหรับหน้า /o/[token] — buyer ต้องกรอกเบอร์ที่ตรงกับ order
 * ก่อนจะเห็น order detail
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/TwoStepsV1.tsx
 *       (shape เดียวกัน — AuthIllustrationWrapper + Card + Logo + heading +
 *        masked hint + single input + verify button) แต่เปลี่ยน OTPInput
 *        เป็น CustomTextField เบอร์โทร
 *       Trust Preview Strip เพิ่มเหนือ form — compose จาก Box+Avatar+Typography+Chip
 *       (FR-UX-1 — anti-scam: buyer เห็นร้าน+tier ก่อนกรอกเบอร์)
 *
 * UX ใหม่ 2026-04-18 — buyer พิสูจน์ตัวตนด้วย "การรู้เบอร์" แทน OTP full flow
 * UX 2026-05-23 — เพิ่ม Trust Preview Strip (T3) + แก้ heading ลบ emoji
 */
import { useState, type FormEvent } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import CustomTextField from '@core/components/mui/TextField'
import Logo from '@components/layout/shared/Logo'

import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'
import { currentYear, META_DATA } from '@/config/constants'
import { getTierLabel, getTierColor } from '@/lib/trust-tier'

type ShopPreview = {
  shopName: string
  trustScore: number
  maxVerifyLevel: number
  /** username สำรองไว้ใช้ในอนาคต (ยังไม่ render ใน strip — ตาม frozen contract T3) */
  username: string
}

type Props = {
  /** Short order token hint (e.g. "#546cf3c0") */
  orderHint: string
  /** เรียกเมื่อ user กรอกเบอร์ถูก — รับ phone string ที่ผ่าน API แล้ว */
  onUnlock: (phone: string) => void | Promise<void>
  /** ข้อมูลร้านสำหรับ Trust Preview Strip — buyer เห็นร้านก่อนกรอกเบอร์ (anti-scam) */
  shop?: ShopPreview
}

/** Trust Preview Strip — แสดงชื่อร้าน tier chip verified chip และคะแนน
 * เป็น strip แนวนอนบาง ๆ ไม่ใช่ Card เต็ม (mobile-first กระชับ)
 */
function TrustPreviewStrip({ shop }: { shop: ShopPreview }) {
  const tierLabel = getTierLabel(shop.trustScore)
  const tierColor = getTierColor(shop.trustScore)

  // ตัวอักษรแรกของชื่อร้านสำหรับ Avatar placeholder
  const avatarLetter = shop.shopName.charAt(0).toUpperCase()

  return (
    <Box
      className='flex flex-col gap-3 mbe-6'
      sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}
    >
      {/* ป้ายกำกับให้ buyer รู้ว่านี่คือร้านที่ส่ง order มา */}
      <Typography variant='caption' color='text.disabled' className='text-center block'>
        คำสั่งซื้อจากร้าน
      </Typography>

      {/* strip หลัก: Avatar + ชื่อร้าน + chip tier + chip verified + คะแนน */}
      <Box className='flex items-center gap-3 flex-wrap'>
        {/* Avatar ตัวอักษรแรกของชื่อร้าน — ขนาด 40px ตามสเปก */}
        <Avatar
          sx={{ width: 40, height: 40, fontSize: '1rem', fontWeight: 600, flexShrink: 0 }}
          aria-label={`Avatar ของร้าน ${shop.shopName}`}
        >
          {avatarLetter}
        </Avatar>

        <Box className='flex flex-col gap-1 flex-1 min-w-0'>
          {/* ชื่อร้าน */}
          <Typography
            variant='body1'
            className='truncate'
            sx={{ fontWeight: 600 }}
            title={shop.shopName}
          >
            {shop.shopName}
          </Typography>

          {/* chip tier + chip verified — แนวนอน wrap ได้บนจอเล็ก */}
          <Box className='flex items-center gap-2 flex-wrap'>
            {/* Tier chip: ชื่อ tier (Deep Gold ฯลฯ) + สีตาม SSOT */}
            <Chip
              label={tierLabel}
              color={tierColor}
              size='small'
              sx={{ height: 22, fontSize: '0.7rem', fontWeight: 500 }}
            />

            {/* Verified chip: แสดงเมื่อ maxVerifyLevel≥1 — ยืนยันตัวตนขั้นต่ำแล้ว */}
            {shop.maxVerifyLevel >= 1 && (
              <Chip
                icon={<Icon icon='tabler-shield-check' width={14} />}
                label='ยืนยันแล้ว'
                color='info'
                size='small'
                sx={{ height: 22, fontSize: '0.7rem', fontWeight: 500 }}
              />
            )}
          </Box>
        </Box>

        {/* Trust Score ตัวเลขเล็กขวาสุด */}
        <Box className='flex flex-col items-center flex-shrink-0'>
          <Typography variant='h6' sx={{ fontWeight: 700, lineHeight: 1 }}>
            {shop.trustScore}
          </Typography>
          <Typography variant='caption' color='text.disabled' sx={{ lineHeight: 1.2 }}>
            คะแนน
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default function PhoneUnlock({ orderHint, onUnlock, shop }: Props) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!/^0[0-9]{9}$/.test(phone)) {
      setError('เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
      return
    }

    setLoading(true)
    try {
      await onUnlock(phone)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เบอร์นี้ไม่ตรงกับคำสั่งซื้อ'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='flex min-bs-[100dvh] flex-col justify-start sm:justify-center items-start sm:items-center overflow-y-auto p-4 sm:p-6 pt-10 sm:pt-0'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='!p-6 sm:!p-12'>
            <div className='flex justify-center mbe-6'>
              <Logo />
            </div>

            {/* Trust Preview Strip — แสดงเมื่อมีข้อมูลร้าน (FR-UX-1 anti-scam) */}
            {shop && (
              <>
                <TrustPreviewStrip shop={shop} />
                <Divider className='mbe-6' />
              </>
            )}

            {/* heading: ลบ emoji ออกตาม NFR + spec FR-UX-1 */}
            <div className='flex flex-col gap-1 mbe-6'>
              <Typography variant='h4'>ยืนยันตัวตนเพื่อดูคำสั่งซื้อ</Typography>
              <Typography>
                กรอกเบอร์โทรที่ใช้ติดต่อกับร้านนี้
              </Typography>
            </div>

            <form onSubmit={handleSubmit} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <CustomTextField
                autoFocus
                fullWidth
                label='เบอร์โทรศัพท์'
                placeholder='08xxxxxxxx'
                type='tel'
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                slotProps={{
                  htmlInput: { inputMode: 'numeric', autoComplete: 'tel', maxLength: 10 },
                }}
                error={!!error}
                helperText={error ?? `สำหรับคำสั่งซื้อ ${orderHint}`}
              />
              <Button
                type='submit'
                fullWidth
                variant='contained'
                disabled={loading || phone.length !== 10}
                startIcon={loading ? <CircularProgress size={18} color='inherit' /> : undefined}
              >
                {loading ? 'กำลังตรวจสอบ…' : 'เข้าดูคำสั่งซื้อ'}
              </Button>
            </form>

            <Typography className='mt-7 text-center text-sm' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
