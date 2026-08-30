'use client'

import { useTransition } from 'react'

import Box from '@mui/material/Box'
import { Icon } from '@iconify/react'

/**
 * ปุ่มถูกใจสินค้า (CR 2026-08-11)
 * docs/20 - Features/00035 - Shop Page Builder/EXTENSIONS-2026-08-11-product-likes.md
 *
 * 🛑 **controlled เต็มตัว — สถานะอยู่ที่ผู้เรียก ไม่ใช่ในปุ่ม** (เปลี่ยนจาก uncontrolled 2026-08-11
 * รอบ lightbox) เหตุผล: ปุ่มนี้โผล่ **สองที่ต่อสินค้าหนึ่งชิ้น** คือบนไทล์ในกริดกับในแผงของ
 * lightbox ถ้าต่างคนต่างถือ state ผู้ใช้กดหัวใจในแผงแล้วปิดกลับมา ไทล์จะโชว์เลขเก่าค้างไว้
 * จนกว่าจะรีโหลดหน้า — ยอดปลอมบนหน้าที่ขายความน่าเชื่อถือคือสิ่งที่ต้องเลี่ยงที่สุด
 *
 * 🛑 บนไทล์ การ์ดทั้งใบเป็นปุ่ม (เปิด lightbox) ปุ่มนี้จึงต้อง `preventDefault + stopPropagation`
 * ไม่งั้นกดหัวใจแล้ว lightbox เด้งขึ้นมาด้วย
 *
 * 🛑 optimistic: สลับสถานะทันทีแล้วค่อย sync กับ response — ปุ่ม gimmick ที่ต้องรอ round-trip
 * ก่อนเห็นผลจะรู้สึกเหมือนกดไม่ติดแล้วคนจะกดรัว · ถ้าคำขอล้ม **ย้อนสถานะกลับ**
 */
export default function ProductLikeButton({
  productId,
  liked,
  count,
  onChange,
  variant = 'overlay',
}: {
  productId: string
  liked: boolean
  count: number
  onChange: (next: { liked: boolean; count: number }) => void
  /** `overlay` = ลอยบนรูปในกริด (พื้นดำโปร่ง) · `inline` = อยู่ในแผงบนพื้น paper */
  variant?: 'overlay' | 'inline'
}) {
  const [, startTransition] = useTransition()

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const prev = { liked, count }
    // BR-LIKE-02 — ห้ามติดลบ
    const optimistic = { liked: !liked, count: Math.max(0, count + (liked ? -1 : 1)) }
    onChange(optimistic)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/${productId}/like`, { method: 'POST' })
        if (!res.ok) throw new Error('failed')
        const data = (await res.json()) as { liked: boolean; likeCount: number }
        onChange({ liked: data.liked, count: data.likeCount })
      } catch {
        onChange(prev)
      }
    })
  }

  const isOverlay = variant === 'overlay'

  return (
    <Box
      component='button'
      type='button'
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? 'ยกเลิกถูกใจสินค้านี้' : 'ถูกใจสินค้านี้'}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        border: 0,
        borderRadius: '9999px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: 700,
        lineHeight: 1,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        ...(isOverlay
          ? {
              position: 'absolute',
              top: 6,
              insetInlineEnd: 6,
              zIndex: 2,
              // พื้นดำโปร่งเพราะปุ่มลอยบนรูปสินค้าที่สว่าง/มืดไม่แน่นอน — ตัวเดียวกับที่ scrim ของไทล์ใช้
              bgcolor: 'rgb(0 0 0 / .38)',
              color: 'common.white',
              fontSize: '11px',
              p: count > 0 ? '5px 8px 5px 6px' : '5px',
              // พื้นที่แตะ 44px โดยไม่ขยายกล่องที่ตาเห็น (แพตเทิร์นเดียวกับปุ่มเล็กในหัวโปรไฟล์)
              '&::after': { content: '""', position: 'absolute', inset: '-11px' },
            }
          : {
              position: 'relative',
              bgcolor: 'action.hover',
              color: 'text.secondary',
              fontSize: '0.8125rem',
              p: '7px 12px',
              minBlockSize: 34,
            }),
      }}
    >
      <Icon
        icon={liked ? 'tabler:heart-filled' : 'tabler:heart'}
        fontSize={isOverlay ? 15 : 17}
        style={{ color: liked ? '#FF4C51' : undefined }}
      />
      {/* BR-LIKE-06 — ยอด 0 ไม่แสดงตัวเลข "ถูกใจ 0" บนสินค้าที่เพิ่งลงอ่านแย่กว่าไม่บอกอะไร */}
      {count > 0 && <span className='tabular-nums'>{count.toLocaleString('th-TH')}</span>}
    </Box>
  )
}
