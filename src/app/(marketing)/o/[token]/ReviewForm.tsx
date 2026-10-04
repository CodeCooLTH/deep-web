'use client'

/**
 * ReviewForm — เขียน/แก้ไขรีวิว (1-5 ดาว + ความเห็น + รูปแนบ ≤4)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   (MUI Rating + CustomTextField primitive) — flat ไม่มี Card ของตัวเอง เพราะอยู่ในการ์ดของ
 *   OrderDetailMobile อยู่แล้ว
 * Base: theme/vuexy/.../views/apps/ecommerce/products/add/ProductImage.tsx
 *   (กริดรูปย่อ + ปุ่มลบมุมขวาบน) — ตัด react-dropzone ทิ้ง ใช้ hidden input + ref
 *   ตามแพตเทิร์นที่โปรเจกต์นี้ใช้อยู่แล้ว (OrderDetailMobile/BookingGuestView)
 *
 * feature 00041 เพิ่ม: โหมดแก้ไข (BR-BOE-17) + รูปแนบ (BR-BOE-19/20)
 *
 * 🛑 ล้าง hardcode hex ที่ค้างอยู่ (#0F172A/#94A3B8/#CBD5E1/13px) — ไฟล์แม่ล้างเป็น MUI token
 * ไปแล้วตั้งแต่รอบก่อน เหลือไฟล์นี้ที่ยังฝังสีดิบไว้ ซึ่งแปลว่ามันไม่ตามธีม/ไม่ตาม dark mode
 * และไม่ผูกกับ Impeccable palette เลย
 */

import { useRef, useState, type FormEvent } from 'react'

import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Rating from '@mui/material/Rating'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'

import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'
import { uploadFileId } from '@/lib/upload-client'

/** BR-BOE-19 — เพดานจำนวนรูปต่อรีวิว (ขนาดต่อไฟล์บังคับที่ /api/uploads/commit ด้วยขนาดจริง) */
const MAX_IMAGES = 4

/**
 * คำกำกับดาว 1–5 (แนวทาง 5 ที่ user เลือก 2026-10-04) — อ่านความหมายได้โดยไม่ต้องเดาว่าทิศไหนดี
 * ช่วยกลุ่มผู้สูงวัย/digital-literacy ต่ำ (PRODUCT.md) · ใช้ทั้งป้ายใต้ดาวและชื่อที่ screen reader อ่าน
 *
 * 🛑 ต้องสมดุลรอบจุดกลาง (3 = "พอใช้") — ชุดเดิม "แย่·พอใช้·ดี·ดีมาก·ยอดเยี่ยม" ทำให้ 3 ดาวแปลว่า "ดี"
 * คะแนนเอียงขึ้นเพราะคำ ไม่ใช่เพราะร้าน แล้วไหลเข้า Trust Score (audit คำ 2026-10-04)
 */
export const STAR_LABELS = ['แย่มาก', 'แย่', 'พอใช้', 'ดี', 'ดีมาก'] as const

type Props = {
  token: string
  /** 'edit' = แก้ของเดิม (PATCH) · 'create' = เขียนใหม่ (POST) */
  mode?: 'create' | 'edit'
  initial?: { rating: number; comment: string | null; images: string[] }
  onCancel?: () => void
  /**
   * 'card' = ฟอร์มในการ์ดรีวิวของหน้า (เดิม) · 'sheet' = ในแผ่นให้คะแนนหลังยืนยันรับ (แบบ Grab)
   * sheet: ดาวมีคำกำกับ · ช่องความเห็น/รูปกางหลังเลือกดาว · error แสดงในแผ่น ไม่ใช่ toast
   */
  variant?: 'card' | 'sheet'
  /** เรียกหลังส่งสำเร็จ (ก่อน router.refresh) — แผ่นใช้ปิดตัวเอง */
  onSubmitted?: () => void
  /** แจ้งผู้เรียกว่าเริ่มกรอกแล้วหรือยัง — แผ่นใช้ตัดสินว่าแตะฉากหลังปิดได้ไหม (กันงานหาย) */
  onDirtyChange?: (dirty: boolean) => void
  /** แจ้งว่ากำลังส่ง — แผ่นใช้ล็อกปุ่ม "ไว้ทีหลัง" ระหว่างส่ง */
  onBusyChange?: (busy: boolean) => void
}

export default function ReviewForm({
  token,
  mode = 'create',
  initial,
  onCancel,
  variant = 'card',
  onSubmitted,
  onDirtyChange,
  onBusyChange,
}: Props) {
  const isSheet = variant === 'sheet'
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rating, setRating] = useState<number>(initial?.rating ?? 0)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [images, setImages] = useState<string[]>(initial?.images ?? [])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  // error ในแผ่น (sheet) — แสดงใต้ปุ่มส่ง ค่าที่กรอกยังอยู่ (ไม่ใช้ toast ซ้อนบนแผ่น)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const touch = (next: { rating?: number; comment?: string; images?: string[] }) =>
    onDirtyChange?.(
      Boolean((next.rating ?? rating) || (next.comment ?? comment).trim() || (next.images ?? images).length),
    )

  const handlePickFiles = async (files: FileList) => {
    // ตัดตั้งแต่ต้นทางไม่ให้เกินเพดาน — ผู้ใช้เลือกรวดเดียว 10 รูปแล้วค่อยบอกว่าเกิน = เสียเวลาอัปโหลดฟรี
    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      toast.error(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูป`)
      return
    }
    const picked = Array.from(files).slice(0, room)
    setUploading(true)
    try {
      for (const file of picked) {
        // direct upload — ห้ามส่งไฟล์ผ่าน body ของ API route (ตัน 4.5MB ของ Vercel)
        // ข้อความ error ที่ uploadFileId โยนมาเป็นภาษาไทยพร้อมโชว์อยู่แล้ว ไม่ต้องแปลซ้ำ
        const fileId = await uploadFileId(file, 'IMAGE')
        setImages((prev) => {
          const next = prev.length >= MAX_IMAGES ? prev : [...prev, fileId]
          touch({ images: next })
          return next
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'แนบรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!rating) {
      toast.error('กรุณาให้คะแนน 1-5 ดาว')
      return
    }
    setLoading(true)
    onBusyChange?.(true)
    setSheetError(null)
    const fail = (msg: string) => (isSheet ? setSheetError(msg) : toast.error(msg))
    try {
      const res = await fetch(`/api/orders/${token}/review`, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined, images }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        fail(
          data?.error ||
            (mode === 'edit' ? 'แก้ไขรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' : 'ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'),
        )
        return
      }
      // บอกผลที่เกิดขึ้นจริง ไม่ใช่คำขอบคุณลอย ๆ — คำเดียวกันทั้งการ์ดและแผ่น (HR16)
      toast.success(mode === 'edit' ? 'แก้ไขรีวิวแล้ว' : 'ส่งรีวิวแล้ว · แก้ไขหรือลบได้ภายใน 24 ชม.')
      onSubmitted?.()
      onCancel?.()
      // invalidate RSC cache ให้ server re-render การ์ดรีวิวใหม่โดยไม่ต้อง full reload
      router.refresh()
    } catch {
      // เดิมไม่มี catch — เน็ตหลุดแล้วปุ่มกลับมากดได้เฉย ๆ โดยไม่มีข้อความใดเลย
      fail('ส่งรีวิวไม่สำเร็จ กรุณาตรวจสัญญาณแล้วลองใหม่')
    } finally {
      setLoading(false)
      onBusyChange?.(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate autoComplete='off'>
      {isSheet ? (
        <LabeledStars
          value={rating}
          disabled={loading}
          onChange={(v) => {
            setRating(v)
            touch({ rating: v })
          }}
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, mb: 2 }}>
          {/* ไม่ override fontSize — 2.25rem ที่โค้ดเดิมฝังไว้ไม่มีอยู่ใน type ramp ของ DESIGN.md
              และไม่มีเหตุผลกำกับ (impeccable hook จับได้ตอนเขียนไฟล์นี้ใหม่) · size='large'
              ของ MUI มีสเกลของตัวเองที่ผูกกับธีมอยู่แล้ว การใส่เลขทับคือการหลุดออกจากระบบเปล่า ๆ */}
          <Rating
            name='order-review-rating'
            value={rating}
            onChange={(_e, v) => setRating(v ?? 0)}
            size='large'
            getLabelText={(v) => `${v} ดาว · ${STAR_LABELS[v - 1] ?? ''}`}
          />
          <Typography variant='caption' color='text.secondary'>
            {rating ? `${rating}/5 · ${STAR_LABELS[rating - 1]}` : 'แตะเพื่อให้คะแนน'}
          </Typography>
        </Box>
      )}

      {/* sheet: ช่องความเห็น/รูป/ปุ่มส่งกางหลังเลือกดาว — กรณีส่วนใหญ่จบใน 2 แตะ (ดาว → ส่ง) */}
      <Collapse in={!isSheet || rating > 0} unmountOnExit={false}>

      <CustomTextField
        fullWidth
        multiline
        minRows={3}
        maxRows={6}
        label='ความคิดเห็น (ไม่บังคับ)'
        placeholder='แชร์ประสบการณ์ของคุณ…'
        value={comment}
        onChange={(e) => {
          const v = e.target.value.slice(0, 500)
          setComment(v)
          touch({ comment: v })
        }}
        helperText={`${comment.length}/500`}
      />

      {/* ── รูปแนบ ── */}
      <Box sx={{ mt: 2 }}>
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 0.75 }}>
          แนบรูป (ไม่บังคับ, สูงสุด {MAX_IMAGES} รูป)
        </Typography>
        <input
          ref={fileInputRef}
          type='file'
          accept='image/*'
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = e.target.files
            if (files?.length) void handlePickFiles(files)
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {images.map((fileId) => (
            <Box key={fileId} sx={{ position: 'relative' }}>
              <Box
                component='img'
                src={`/api/files/${fileId}`}
                alt=''
                sx={{ width: 56, height: 56, borderRadius: 2, objectFit: 'cover', display: 'block' }}
              />
              <IconButton
                size='small'
                aria-label='ลบรูปนี้'
                onClick={() =>
                  setImages((prev) => {
                    const next = prev.filter((id) => id !== fileId)
                    touch({ images: next })
                    return next
                  })
                }
                sx={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  bgcolor: 'text.primary',
                  color: 'background.paper',
                  '&:hover': { bgcolor: 'text.secondary' },
                }}
              >
                <Icon icon='tabler-x' fontSize={12} />
              </IconButton>
            </Box>
          ))}
          {images.length < MAX_IMAGES && (
            <Box
              component='button'
              type='button'
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label='เพิ่มรูป'
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                border: '1.5px dashed',
                borderColor: 'divider',
                bgcolor: 'transparent',
                color: 'text.disabled',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon icon={uploading ? 'tabler-loader-2' : 'tabler-plus'} fontSize={18} />
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        {mode === 'edit' && onCancel && (
          <Button fullWidth variant='tonal' color='secondary' onClick={onCancel} disabled={loading}>
            ยกเลิก
          </Button>
        )}
        <Button type='submit' fullWidth variant='contained' disabled={loading || uploading || !rating}>
          {loading ? 'กำลังบันทึก…' : mode === 'edit' ? 'บันทึกการแก้ไข' : 'ส่งรีวิว'}
        </Button>
      </Box>

      {/* 🛑 ประกาศหน้าต่างแก้ไข "ตรงจุดที่ตัดสินใจ" ไม่ใช่รอให้ไปเจอในการ์ดหลังโพสต์
          ตัวนับถอยหลังที่มีอยู่แสดงเฉพาะในการ์ดรีวิวที่โพสต์แล้ว = บอกเฉพาะคนที่รู้อยู่แล้ว
          คนที่เขียนรีวิวเสร็จแล้วปิดแท็บไปจะไม่มีทางรู้ว่าเคยมีหน้าต่างนี้อยู่ */}
      {sheetError && (
        <Typography role='alert' variant='body2' color='error' sx={{ textAlign: 'center', mt: 1.5 }}>
          {sheetError}
        </Typography>
      )}

      {mode === 'create' && (
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          แก้ไขหรือลบรีวิวได้ภายใน 24 ชั่วโมงหลังส่ง
        </Typography>
      )}
      </Collapse>
    </form>
  )
}

/**
 * ดาว 5 ดวงพร้อมคำกำกับใต้แต่ละดวง (แผ่นให้คะแนน) — radio group จริง: ลูกศรซ้าย/ขวาเลื่อนได้
 * hit area ต่อดวง ≥44px (ทั้งคอลัมน์ดาว+คำเป็นปุ่มเดียว) · ดาวใช้สี warning เดียวกับการ์ดรีวิวเดิม
 * Base: ReviewForm (MUI Rating ใน UserProfileHeader.tsx) — ใช้ ButtonBase แทนเพราะ Rating ใส่คำใต้ดาวไม่ได้
 */
function LabeledStars({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const move = (dir: 1 | -1) => onChange(Math.min(5, Math.max(1, (value || (dir === 1 ? 0 : 6)) + dir)))

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        role='radiogroup'
        aria-label='ให้คะแนนร้านนี้'
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), move(1))
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), move(-1))
        }}
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}
      >
        {STAR_LABELS.map((label, i) => {
          const n = i + 1
          const on = n <= value
          return (
            <ButtonBase
              key={label}
              role='radio'
              aria-checked={value === n}
              aria-label={`${n} ดาว · ${label}`}
              tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(n)}
              sx={{ flexDirection: 'column', gap: 0.5, minHeight: 64, borderRadius: 2, py: 0.5 }}
            >
              <Icon
                icon='tabler-star-filled'
                aria-hidden
                style={{
                  fontSize: 36 /* แผ่นให้คะแนน: ดาวคือพระเอกของแผ่น (ใหญ่กว่า Rating size=large ที่ใช้ในการ์ด) */,
                  color: on ? 'var(--mui-palette-warning-main)' : 'var(--mui-palette-action-disabled)',
                  transition: 'color 120ms ease-out',
                }}
              />
              <Typography variant='caption' color={value === n ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: value === n ? 600 : 400 }}>
                {label}
              </Typography>
            </ButtonBase>
          )
        })}
      </Box>
      <Typography aria-live='polite' variant='h5' sx={{ textAlign: 'center', mt: 1.5, minHeight: 32 }}>
        {value ? STAR_LABELS[value - 1] : ''}
      </Typography>
      {!value && (
        <Typography variant='body2' color='text.secondary' sx={{ textAlign: 'center', mt: -3 }}>
          แตะดาวเพื่อให้คะแนน
        </Typography>
      )}
    </Box>
  )
}
