'use client'

/**
 * Lock screen สำหรับหน้า /o/[token] — buyer ต้องกรอกเบอร์ที่ตรงกับ order
 * ก่อนจะเห็น order detail
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   - banner (tier cover + frosted back) + overlap avatar + verify badge + centered identity + trust chips
 *     คัดลอก pattern ตรงจาก OrderDetailMobile.tsx V1 (ตัวมัน Base'd บน UserProfileHeader)
 *     เพื่อให้ lock screen = หน้าเดียวกับ order detail (ต่างแค่ form แทน order content)
 * Widgets adapted: unlock form card (CustomTextField เบอร์ + ink CTA) + footer "ปกป้องการซื้อขายโดย Deep"
 * Dropped: AuthIllustrationWrapper + centered auth Card scaffold + top Logo + TrustPreviewStrip เดิม (V1 header แทน)
 *
 * Redesign 2026-05-24 — V1 Profile-consistent (user: "ให้สอดคล้องกับ order details")
 * คงฟังก์ชัน/flow เดิม: phone validation ^0[0-9]{9}$, loading/error, onUnlock(phone)
 */
import { useState, type FormEvent } from 'react'

import Link from 'next/link'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import CustomTextField from '@core/components/mui/TextField'

import { getTierLabel, getTierColor, getTierCover } from '@/lib/trust-tier'

type ShopPreview = {
  shopName: string
  trustScore: number
  maxVerifyLevel: number
  username: string
  /** raw avatar URL — แสดงใน V1 header (เหมือน order detail); null = letter fallback */
  avatar: string | null
}

type Props = {
  /** Short order token hint (e.g. "#546cf3c0") */
  orderHint: string
  /** เรียกเมื่อ user กรอกเบอร์ถูก — รับ phone string ที่ผ่าน API แล้ว */
  onUnlock: (phone: string) => void | Promise<void>
  /** ข้อมูลร้านสำหรับ V1 header — buyer เห็นร้านก่อนกรอกเบอร์ (FR-UX-1 anti-scam) */
  shop?: ShopPreview
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

  // tier helpers (SSOT) — คำนวณเมื่อมีข้อมูลร้าน
  const tierLabel = shop ? getTierLabel(shop.trustScore) : ''
  const tierColor = shop ? getTierColor(shop.trustScore) : 'default'
  const tierCover = shop ? getTierCover(shop.trustScore) : ''
  const avatarLetter = shop ? shop.shopName.slice(0, 1) : ''

  return (
    // พื้นหลังเทาอ่อน — Profile-consistent flat column (scaffold เดียวกับ OrderDetailMobile)
    <Box sx={{ minHeight: '100dvh', bgcolor: '#F3F5F8', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          pb: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: 420,
          mx: 'auto',
          width: '100%',
        }}
      >
        {/* ── V1 header (banner + avatar + identity + chips) — เฉพาะเมื่อมีข้อมูลร้าน ── */}
        {shop && (
          <>
            {/* 1. Tier cover banner + frosted back — pattern จาก ProfileBanner */}
            <Box
              sx={{
                height: 130,
                position: 'relative',
                overflow: 'hidden',
                backgroundImage: `url(${tierCover})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                bgcolor: '#E2E8F0',
              }}
            >
              {/* client component → Link ตรงได้ (ไม่ผิด Hard Rule 2) */}
              <Link href='/' style={{ textDecoration: 'none' }}>
                <IconButton
                  aria-label='กลับหน้าหลัก'
                  title='กลับหน้าหลัก'
                  sx={{
                    position: 'absolute',
                    top: 13,
                    left: 13,
                    zIndex: 3,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    bgcolor: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.6)',
                    boxShadow: '0 2px 6px rgba(0,0,0,.12)',
                    color: '#0F172A',
                    '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
                  }}
                >
                  <Icon icon='tabler-arrow-left' fontSize={18} />
                </IconButton>
              </Link>
            </Box>

            {/* 2. Hero: avatar overlap + identity — pattern จาก ProfileLeftPanel */}
            <Box sx={{ bgcolor: '#fff', mt: '-40px', pt: 0, pb: '12px', textAlign: 'center' }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative', mt: '-40px', mb: '8px' }}>
                <Box sx={{ position: 'relative', width: 78, height: 78 }}>
                  <Avatar
                    src={shop.avatar ?? undefined}
                    alt={shop.shopName}
                    sx={{
                      width: 78,
                      height: 78,
                      borderRadius: '50%',
                      border: '4px solid #fff',
                      boxShadow: '0 6px 14px rgba(15,23,42,.16)',
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      bgcolor: '#E2E8F0',
                      color: '#475569',
                    }}
                  >
                    {avatarLetter}
                  </Avatar>
                  {/* verify badge — แสดงเมื่อ maxVerifyLevel >= 1 */}
                  {shop.maxVerifyLevel >= 1 && (
                    <Box
                      component='span'
                      title='ยืนยันแล้ว'
                      sx={{
                        position: 'absolute',
                        bottom: 1,
                        right: 1,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: '#1D9BF0',
                        color: 'white',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '11px',
                        fontWeight: 900,
                        border: '3px solid white',
                        boxShadow: '0 1px 4px rgba(29,155,240,.4)',
                      }}
                    >
                      ✓
                    </Box>
                  )}
                </Box>
              </Box>

              {/* shop name → /u/[username] */}
              <Link href={`/u/${shop.username}`} style={{ textDecoration: 'none' }}>
                <Typography
                  component='span'
                  sx={{
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: '#0F172A',
                    lineHeight: 1.2,
                    display: 'block',
                  }}
                >
                  {shop.shopName}
                </Typography>
              </Link>

              {/* @handle */}
              <Typography sx={{ fontSize: 12, color: '#64748B', mt: '2px' }}>@{shop.username}</Typography>

              {/* chips: verified / tier / Trust score */}
              <Box sx={{ display: 'flex', gap: '5px', justifyContent: 'center', mt: '7px', flexWrap: 'wrap', px: 2 }}>
                {shop.maxVerifyLevel >= 1 && (
                  <Chip
                    size='small'
                    label='✓ ยืนยันแล้ว'
                    sx={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      height: 22,
                      bgcolor: '#E5F4FE',
                      color: '#0C7DC2',
                      borderRadius: 999,
                      '& .MuiChip-label': { px: '9px' },
                    }}
                  />
                )}
                <Chip
                  size='small'
                  color={tierColor}
                  label={tierLabel}
                  sx={{ fontSize: '10.5px', fontWeight: 700, height: 22, borderRadius: 999, '& .MuiChip-label': { px: '9px' } }}
                />
                <Chip
                  size='small'
                  label={`Trust ${shop.trustScore}`}
                  sx={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    height: 22,
                    bgcolor: '#EEF2F7',
                    color: '#334155',
                    borderRadius: 999,
                    '& .MuiChip-label': { px: '9px' },
                  }}
                />
              </Box>
            </Box>
          </>
        )}

        {/* ── Unlock form card (flat — เหมือน card อื่นใน V1) ── */}
        <Box sx={{ px: '10px' }}>
          <Card elevation={0} sx={{ borderRadius: '12px', boxShadow: '0 1px 2px rgba(15,23,42,.06)' }}>
            <Box sx={{ p: '18px' }}>
              <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                ยืนยันตัวตนเพื่อดูคำสั่งซื้อ
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#64748B', mt: '2px', mb: '16px' }}>
                กรอกเบอร์โทรที่ใช้ติดต่อกับร้านนี้
              </Typography>

              <form onSubmit={handleSubmit} noValidate autoComplete='off' className='flex flex-col gap-4'>
                <CustomTextField
                  autoFocus
                  fullWidth
                  label='เบอร์โทรศัพท์'
                  placeholder='08xxxxxxxx'
                  type='tel'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel', maxLength: 10 } }}
                  error={!!error}
                  helperText={error ?? `สำหรับคำสั่งซื้อ ${orderHint}`}
                />
                {/* ink CTA — #0F172A เหมือน CTA ของ order detail V1 */}
                <Button
                  type='submit'
                  fullWidth
                  disabled={loading || phone.length !== 10}
                  startIcon={loading ? <CircularProgress size={18} color='inherit' /> : undefined}
                  sx={{
                    minHeight: 48,
                    bgcolor: '#0F172A',
                    color: '#fff',
                    borderRadius: '13px',
                    fontSize: 14.5,
                    fontWeight: 800,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#1E293B' },
                    '&.Mui-disabled': { bgcolor: '#CBD5E1', color: '#fff' },
                  }}
                >
                  {loading ? 'กำลังตรวจสอบ…' : 'เข้าดูคำสั่งซื้อ'}
                </Button>
              </form>
            </Box>
          </Card>
        </Box>

        {/* ── Footer — ปกป้องการซื้อขายโดย Deep (เหมือน order detail) ── */}
        <Box sx={{ textAlign: 'center', py: '16px', px: '18px' }}>
          <Typography
            sx={{
              fontSize: 10.5,
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <Icon icon='tabler-shield-check' style={{ color: '#818CF8', fontSize: 12 }} />
            ปกป้องการซื้อขายโดย Deep
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
