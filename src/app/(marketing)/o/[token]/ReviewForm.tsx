'use client'

/**
 * ReviewForm — post-order review (1-5 stars + optional comment)
 *
 * Base:
 *   - theme/vuexy/typescript-version/full-version/src/views/apps/invoice/preview/PreviewCard.tsx
 *     (Card/CardContent shell + sm:!p-* spacing)
 *   - MUI Rating primitive (Vuexy uses it throughout, e.g. front-pages/pricing/Plans.tsx,
 *     apps/ecommerce/manage-reviews — no dedicated template page for a review form)
 *
 * Business logic preserved from previous implementation:
 *   - 1-5 star required, 500-char optional comment
 *   - POST /api/orders/[token]/review -> on success reload so server page re-renders
 *     the thank-you card.
 */

import { useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
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
    <Card>
      <CardContent className='flex flex-col gap-6 !p-5 sm:!p-10'>
        <div className='flex flex-col gap-1'>
          <Typography variant='h5'>รีวิวร้านค้านี้</Typography>
          <Typography color='text.secondary'>
            ประสบการณ์การซื้อครั้งนี้เป็นอย่างไร ช่วยแชร์เพื่อให้ชุมชน Deep น่าเชื่อถือยิ่งขึ้น
          </Typography>
        </div>

        <form onSubmit={onSubmit} noValidate autoComplete='off' className='flex flex-col gap-6'>
          <div className='flex flex-col items-center gap-2'>
            <Rating
              name='order-review-rating'
              value={rating}
              onChange={(_e, v) => setRating(v ?? 0)}
              size='large'
              className='!text-5xl sm:!text-4xl'
            />
            <Typography color='text.disabled' className='text-xs'>
              {rating ? `${rating}/5` : 'แตะเพื่อให้คะแนน'}
            </Typography>
          </div>

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

          <Button type='submit' variant='contained' fullWidth disabled={loading || !rating}>
            {loading ? 'กำลังส่ง…' : 'ส่งรีวิว'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
