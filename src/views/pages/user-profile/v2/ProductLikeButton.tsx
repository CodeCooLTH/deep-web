'use client'

import { useState, useTransition } from 'react'

import Box from '@mui/material/Box'
import { Icon } from '@iconify/react'

/**
 * ปุ่มถูกใจบนการ์ดสินค้า (CR 2026-08-11)
 * docs/20 - Features/00035 - Shop Page Builder/EXTENSIONS-2026-08-11-product-likes.md
 *
 * 🛑 การ์ดทั้งใบเป็นลิงก์ไปหน้าสินค้า ปุ่มนี้จึงต้อง `preventDefault + stopPropagation`
 * ไม่งั้นกดหัวใจแล้วเด้งออกจากหน้าไปด้วย
 *
 * 🛑 optimistic: สลับสถานะทันทีแล้วค่อย sync กับ response — ปุ่ม gimmick ที่ต้องรอ round-trip
 * ก่อนเห็นผลจะรู้สึกเหมือนกดไม่ติดแล้วคนจะกดรัว · ถ้าคำขอล้ม **ย้อนสถานะกลับ** ไม่ปล่อยให้
 * หัวใจค้างทึบทั้งที่ยังไม่ถูกบันทึก (ยอดปลอมบนหน้าที่ขายความน่าเชื่อถือคือสิ่งที่ต้องเลี่ยงที่สุด)
 */
export default function ProductLikeButton({
  productId,
  initialCount,
  initialLiked,
}: {
  productId: string
  initialCount: number
  initialLiked: boolean
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [, startTransition] = useTransition()

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const prev = { liked, count }
    setLiked(!liked)
    setCount((c) => Math.max(0, c + (liked ? -1 : 1))) // BR-LIKE-02 — ห้ามติดลบ

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/${productId}/like`, { method: 'POST' })
        if (!res.ok) throw new Error('failed')
        const data = (await res.json()) as { liked: boolean; likeCount: number }
        setLiked(data.liked)
        setCount(data.likeCount)
      } catch {
        setLiked(prev.liked)
        setCount(prev.count)
      }
    })
  }

  return (
    <Box
      component='button'
      type='button'
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? 'ยกเลิกถูกใจสินค้านี้' : 'ถูกใจสินค้านี้'}
      sx={{
        position: 'absolute',
        top: 6,
        insetInlineEnd: 6,
        zIndex: 2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        border: 0,
        borderRadius: '999px',
        cursor: 'pointer',
        // พื้นดำโปร่งเพราะปุ่มลอยบนรูปสินค้าที่สว่าง/มืดไม่แน่นอน — ตัวเดียวกับที่ scrim ของไทล์ใช้
        bgcolor: 'rgb(0 0 0 / .38)',
        color: 'common.white',
        fontFamily: 'inherit',
        fontSize: '11px',
        fontWeight: 700,
        lineHeight: 1,
        p: count > 0 ? '5px 8px 5px 6px' : '5px',
        // พื้นที่แตะ 44px โดยไม่ขยายกล่องที่ตาเห็น (แพตเทิร์นเดียวกับปุ่มเล็กในหัวโปรไฟล์)
        '&::after': { content: '""', position: 'absolute', inset: '-11px' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Icon
        icon={liked ? 'tabler:heart-filled' : 'tabler:heart'}
        fontSize={15}
        style={{ color: liked ? '#FF4C51' : undefined }}
      />
      {/* BR-LIKE-06 — ยอด 0 ไม่แสดงตัวเลข "ถูกใจ 0" บนสินค้าที่เพิ่งลงอ่านแย่กว่าไม่บอกอะไร */}
      {count > 0 && <span className='tabular-nums'>{count.toLocaleString('th-TH')}</span>}
    </Box>
  )
}
