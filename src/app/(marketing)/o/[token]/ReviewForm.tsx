'use client'

/**
 * ReviewForm — post-order review (1-5 stars + optional comment)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   - flat (ไม่มี Card ของตัวเอง) — render ภายใน review card ของ OrderDetailMobile V1
 *     (เลิก card-in-card + ลบหัวข้อซ้ำ; invite "สินค้าถึงมือคุณแล้ว" อยู่ที่ wrapper แล้ว)
 *   - MUI Rating primitive + CustomTextField + ink CTA #0F172A เหมือน CTA อื่นใน V1 (ให้เข้าชุดกัน)
 *
 * Business logic preserved:
 *   - 1-5 star required, 500-char optional comment
 *   - POST /api/orders/[token]/review -> success router.refresh() ให้ server re-render thank-you card
 */

import { useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Rating from '@mui/material/Rating'
import Typography from '@mui/material/Typography'

import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'

type Props = { token: string }

export default function ReviewForm({ token }: Props) {
  const router = useRouter()
  const [rating, setRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!rating) {
      toast.error('กรุณาให้คะแนน 1-5 ดาว')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${token}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'ส่งรีวิวไม่สำเร็จ')
        return
      }
      toast.success('ขอบคุณสำหรับรีวิว!')
      // router.refresh() invalidate RSC cache ให้ server page re-render thank-you card
      // โดยไม่ทำ full reload — ตาม convention #25 SMS-wallet retro
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    // flat — ไม่มี Card ของตัวเอง (อยู่ใน review card ของ OrderDetailMobile แล้ว)
    <form onSubmit={onSubmit} noValidate autoComplete='off'>
      {/* stars จัดกลาง */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', mb: '16px' }}>
        <Rating
          name='order-review-rating'
          value={rating}
          onChange={(_e, v) => setRating(v ?? 0)}
          size='large'
          sx={{ fontSize: '2.25rem' }}
        />
        <Typography sx={{ fontSize: 12, color: '#94A3B8' }}>
          {rating ? `${rating}/5` : 'แตะเพื่อให้คะแนน'}
        </Typography>
      </Box>

      <CustomTextField
        fullWidth
        multiline
        minRows={3}
        maxRows={6}
        label='ความคิดเห็น (ไม่บังคับ)'
        placeholder='แชร์ประสบการณ์ของคุณ…'
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 500))}
        helperText={`${comment.length}/500`}
      />

      {/* ink CTA #0F172A — เข้าชุดกับ CTA อื่นใน V1 (เลิกปุ่มม่วง default) */}
      <Button
        type='submit'
        fullWidth
        disabled={loading || !rating}
        sx={{
          mt: '16px',
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
        {loading ? 'กำลังส่ง…' : 'ส่งรีวิว'}
      </Button>
    </form>
  )
}
