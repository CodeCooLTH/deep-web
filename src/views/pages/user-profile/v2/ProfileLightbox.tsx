'use client'

/**
 * ProfileLightbox — เปลือกของ lightbox บนหน้าร้านสาธารณะ (`/u/[username]` + `/b/[slug]`)
 *
 * ที่มา: user 2026-08-11 ส่งภาพ lightbox โพสต์ของ Instagram มา "อยากให้เวลาอยู่บน desktop
 * แล้วเปิดสินค้า หรือคลิปบนปักหมุด แสดงแบบนี้"
 *
 * 🛑 **เปลือกตัวเดียวใช้ทั้งสินค้าและคลิป** — เหตุผลไม่ใช่ "โค้ดสั้นกว่า" แต่เพราะทุกอย่างที่เป็น
 * chrome เหมือนกันหมด (ฉากหลัง · ล็อกไม่ให้หน้าหลังเลื่อน · กักโฟกัส · ปุ่มปิด · ลูกศร · ประวัติ)
 * และกลุ่มนี้คือจุดที่โปรเจกต์นี้พลาดซ้ำมาหลายรอบ (`docs/conventions/overlay-scroll-lock.md`
 * เก็บตกไป 11 ใบเมื่อ 2026-08-07) ก็อปไปสองที่ = วางกับดักสองใบ
 * สินค้ากับคลิปต่างกันแค่ 2 อย่าง: ตัวสื่อ (`mediaSlot`) กับเนื้อในแผง (`panelSlot`)
 *
 * ## จุดที่ตั้งใจให้ต่างจาก IG
 * - **ลูกศร ‹ › และ ✕ แสดงตลอด ไม่ hover-only** — PRODUCT.md ระบุกลุ่มผู้ใช้ digital-literacy ต่ำ
 *   ปุ่มที่ต้องเอาเมาส์ไปวางก่อนถึงจะรู้ว่ามีอยู่ = ปุ่มที่คนกลุ่มนี้ไม่เจอ
 * - **ใบแรก/ใบสุดท้าย ปุ่ม disabled ไม่วนกลับ** — ต่างจาก `ProfileTabs` ที่วน เพราะแท็บคือ
 *   หมวดหมู่ปิด (วนแล้วยังรู้ว่าอยู่ไหน) ส่วนนี่คือฟีดที่มีจุดจบ วนกลับไปใบแรกอ่านเป็นบั๊ก
 * - **ฉากหลัง `rgba(47,43,61,.94)` ไม่ใช่ดำสนิท** — DESIGN.md ระบุว่า Photo-Scrim Exception
 *   (ที่ยอมให้ใช้ดำสนิท) มีขอบเขตเฉพาะตอน "ทับรูปของผู้ใช้" พื้นของโมดัลเป็นผิวของเราเอง
 *   ต้องมาจาก Ink Plum
 *
 * ## จุดตัดสองคอลัมน์ = `md` ของธีม (**900px** ฝั่ง buyer) ไม่ใช่ 768
 * แผงขวาต้องการ ≥380px ถึงจะอ่านออก (ชื่อสินค้า + คำอธิบาย + ราคา + ปุ่ม) ถ้าตัดที่ 768
 * ตัวสื่อจะเหลือ ~388px ซึ่งแคบเกินกว่าจะเรียกว่า "ดูรูปใหญ่" ได้ · `ResponsiveSheet` ใช้จุดเดียวกัน
 *
 * 🛑 **ทุกค่าที่แตกตามจอในไฟล์นี้ต้องใช้คีย์ breakpoint ของธีม (`xs`/`md`) ห้ามเขียน
 * `'@media (min-width:900px)'` เป็นคีย์ในค่าของ property** — `iterateBreakpoints` ของ MUI เทียบ
 * คีย์กับ breakpoint ของธีมเท่านั้น คีย์ที่ไม่ตรงถูกโยนลง output ดิบ ๆ กลายเป็น CSS เสีย
 * โดยไม่มี error ไม่มี warning และ type ก็ผ่าน (`SxProps` รับคีย์อะไรก็ได้)
 * ผมเขียนพลาดแบบนี้ในไฟล์นี้เองรอบแรก ทั้งที่เพิ่งแก้บั๊กเดียวกันบนหน้า order link ไปเมื่อ
 * `61d503a9` วันเดียวกัน — จับได้ด้วยการรัน `styleFunctionSx` กับธีมจริง ไม่ใช่อ่านโค้ดเดา
 *
 * ## บังคับ (docs/conventions/overlay-scroll-lock.md · aria-name-requires-supporting-role.md)
 * - `useLockBodyScroll` + ทุกกล่องที่เลื่อนได้ข้างในต้องมี `overscroll-contain`
 * - `role='dialog'` ต้องคู่กับ `aria-modal='true'` เสมอ (อันนี้ทับทั้งจอจริง ไม่ใช่ popover)
 * - ปิดได้ 4 ทาง: ✕ / Esc / คลิกฉากหลัง / ปุ่ม back ของเบราว์เซอร์ (ทางสุดท้ายผู้เรียกจัดการ
 *   ผ่าน deep link) — **คลิกบนตัวสื่อเองไม่ปิด**
 * - คืนโฟกัสกลับไปที่ไทล์เดิมตอนปิด
 *
 * Base: src/views/pages/user-profile/v2/ResponsiveSheet.tsx (โครง overlay + breakpoint ของ buyer)
 *   + src/app/(paces)/seller/(dashboard)/reviews/components/ReviewImageGallery.tsx (พฤติกรรม ‹ › + ตัวนับ)
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import Box from '@mui/material/Box'

import { Icon } from '@iconify/react'

import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

/** ปุ่มกลมบนฉากหลังมืด — ✕ กับ ‹ › ใช้ทรงเดียวกันทั้งหมด (44×44 ตามเกณฑ์ tap target ของ AA) */
const roundButtonSx = {
  inlineSize: 44,
  blockSize: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: '999px',
  cursor: 'pointer',
  padding: 0,
  bgcolor: 'rgb(255 255 255 / .14)',
  color: 'common.white',
  transition: 'background-color .15s ease',
  '&:hover': { bgcolor: 'rgb(255 255 255 / .26)' },
  '&:disabled': { opacity: 0.32, cursor: 'default', '&:hover': { bgcolor: 'rgb(255 255 255 / .14)' } },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'common.white', outlineOffset: 2 },
} as const

/** element ที่โฟกัสได้จริงในกรอบ — ใช้กักโฟกัสไม่ให้ Tab หลุดออกไปหลังฉาก */
const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'

export type ProfileLightboxProps = {
  open: boolean
  onClose: () => void
  /** ไม่ส่ง = ปุ่มนั้น disabled (อยู่ใบแรก/ใบสุดท้าย) — ไม่วนกลับโดยตั้งใจ */
  onPrev?: () => void
  onNext?: () => void
  /** ลำดับใบปัจจุบัน (เริ่มที่ 1) กับจำนวนทั้งหมด — โชว์เป็นตัวนับให้รู้ว่าเหลืออีกกี่ใบ */
  index: number
  total: number
  /** ชื่อของโมดัลสำหรับ screen reader */
  ariaLabel: string
  mediaSlot: ReactNode
  panelSlot: ReactNode
}

export default function ProfileLightbox({
  open,
  onClose,
  onPrev,
  onNext,
  index,
  total,
  ariaLabel,
  mediaSlot,
  panelSlot,
}: ProfileLightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  /** element ที่โฟกัสอยู่ก่อนเปิด — ต้องคืนโฟกัสกลับไปที่ไทล์เดิมตอนปิด ไม่ใช่ปล่อยไปที่ <body> */
  const returnFocusRef = useRef<Element | null>(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement
    closeRef.current?.focus()

    return () => {
      const el = returnFocusRef.current
      if (el instanceof HTMLElement && document.contains(el)) el.focus()
    }
  }, [open])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }

      /* 🛑 ‹ › = ข้ามใบเท่านั้น ทั้งเมาส์และคีย์บอร์ด ห้ามเปลี่ยนความหมายตามบริบท
         (รูปย่อยของสินค้าใบเดียวกันใช้กลไกคนละตัว — แตะโซนซ้าย/ขวาของรูป + จุดบอกตำแหน่ง
          ที่เป็น <button> จริง ให้ Tab ไปแล้ว Enter ได้ ไม่มายึดปุ่มลูกศรซ้ำ) */
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault()
        onPrev()
        return
      }
      if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault()
        onNext()
        return
      }

      // กักโฟกัส — ไม่มีอันนี้ Tab จะไต่ออกไปที่ลิงก์หลังฉากที่ผู้ใช้มองไม่เห็นแล้ว
      if (e.key !== 'Tab' || !rootRef.current) return
      const nodes = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      )
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose, onPrev, onNext],
  )

  if (!open) return null

  return (
    <Box
      ref={rootRef}
      role='dialog'
      aria-modal='true'
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      // คลิกฉากหลัง = ปิด · คลิกบนตัวสื่อ/แผงไม่ปิด (กล่องข้างในหยุด propagation ให้เอง)
      onClick={onClose}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 'modal',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 0, md: 4 },
        // Ink Plum ไม่ใช่ดำสนิท — พื้นของโมดัลเป็นผิวของเราเอง ไม่เข้าข่าย Photo-Scrim Exception
        bgcolor: 'rgba(47,43,61,.94)',
      }}
    >
      {/* ── ✕ ── มุมขวาบนของ "จอ" ไม่ใช่ของกล่อง เพื่อให้อยู่ที่เดิมเสมอไม่ว่าสื่อจะสูงแค่ไหน */}
      <Box
        component='button'
        type='button'
        ref={closeRef}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label='ปิด'
        sx={{ ...roundButtonSx, position: 'fixed', top: 8, insetInlineEnd: 8, zIndex: 2 }}
      >
        <Icon icon='tabler-x' fontSize={22} />
      </Box>

      {/* ── ตัวนับ ── บอกว่าอยู่ใบที่เท่าไรจากทั้งหมด (ฟีดมีจุดจบ ผู้ใช้ควรรู้ว่าเหลืออีกเท่าไร)
          ซ่อนเมื่อมีใบเดียว — "1 / 1" ไม่ได้บอกอะไรนอกจากกินที่ */}
      {total > 1 && (
        <Box
          sx={{
            position: 'fixed',
            top: 18,
            insetInlineStart: 16,
            zIndex: 2,
            color: 'rgb(255 255 255 / .82)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {`${index} / ${total}`}
        </Box>
      )}

      {/* ── ลูกศร ── ยึดขอบจอเหมือน ✕ ไม่ใช่ขอบรูป: รูปแต่ละใบสูงไม่เท่ากัน ถ้าผูกกับรูป
          ปุ่มจะขยับทุกครั้งที่เปลี่ยนใบ แล้วคนกดรัวจะกดพลาด */}
      <Box
        component='button'
        type='button'
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          onPrev?.()
        }}
        disabled={!onPrev}
        aria-label='ก่อนหน้า'
        sx={{
          ...roundButtonSx,
          position: 'fixed',
          insetInlineStart: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          display: { xs: 'none', md: 'inline-flex' },
        }}
      >
        <Icon icon='tabler-chevron-left' fontSize={24} />
      </Box>
      <Box
        component='button'
        type='button'
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          onNext?.()
        }}
        disabled={!onNext}
        aria-label='ถัดไป'
        sx={{
          ...roundButtonSx,
          position: 'fixed',
          insetInlineEnd: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          display: { xs: 'none', md: 'inline-flex' },
        }}
      >
        <Icon icon='tabler-chevron-right' fontSize={24} />
      </Box>

      {/* ── กล่องเนื้อหา ──
          <900px: ซ้อนแนวตั้ง (สื่อบน แผงล่าง) ทั้งกล่องเลื่อนได้ · ≥900px: สื่อซ้าย แผงขวา 380px */}
      <Box
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          inlineSize: '100%',
          /* 🛑 แก้ 2026-08-11 (user: "Lightbox บน desktop รูปเล็กมากกกก")
             เดิม `blockSize: auto` + `maxBlockSize: 88dvh` — ความสูงจึงถูกกำหนดโดย *เนื้อหา*
             แต่รูปในกล่องสื่อเป็น `position:absolute` ซึ่งไม่มีส่วนร่วมในการคำนวณความสูงเลย
             ⇒ ความสูงจริงตกไปอยู่ที่ `minBlockSize: 420` ของ ProductLightbox เพียงตัวเดียว
             และเพดาน 88dvh **ไม่เคยถูกใช้สักครั้ง** (บนจอ 2560×1290 ได้รูป 740×420 ทั้งที่มีที่ว่าง
             ในแนวตั้งถึง ~1135px) — ไม่มี gate ไหนจับได้ เพราะ CSS ทุกบรรทัดถูกตามชนิด
             แค่ไม่มีใครเป็นคนบอกความสูง

             ให้ความสูงเป็นค่าจริงไปเลย กล่องสื่อจึงยืดเต็มได้ด้วย blockSize:100% ของตัวเอง
             maxInlineSize เดิม 1120 ตายตัวก็แคบไปสำหรับจอใหญ่ — คิดจากที่ว่างจริง: สูง 88dvh
             + แผงขวา 380px ⇒ รูปจัตุรัสต้องการ ~(88dvh + 380) ถึงจะไม่ถูกความกว้างบีบก่อน */
          /* 🛑 เพดาน 920px ไม่ใช่ 88dvh เปล่า ๆ — แผงขวาสูงเท่าเปลือกเสมอ และ CTA "สอบถามสินค้านี้"
             ถูกดันไปติดขอบล่างด้วย `flex:1` ของบล็อกเนื้อหา ถ้าปล่อยให้สูงเต็ม 88dvh บนจอ 1290px
             ปุ่มจะไปอยู่ห่างจากราคาเกือบ 1000px = แก้ "รูปเล็ก" แล้วได้ "ปุ่มลอยไปอยู่คนละโลก" แทน
             ที่ 920px รูปจัตุรัสได้ 920×920 (เดิม 740×420) และแผงยังหน้าตาเหมือนที่ผ่าน ux มา */
          blockSize: { xs: '100%', md: 'min(88dvh, 920px)' },
          maxInlineSize: { md: 'min(1560px, 94vw)' },
          bgcolor: 'background.paper',
          borderRadius: { xs: 0, md: '10px' },
          overflow: 'hidden',
          // มือถือ: ทั้งกล่องเป็นตัวเลื่อน · overscroll-contain กันไม่ให้ลากต่อไปโดนหน้าหลัง
          overflowY: { xs: 'auto', md: 'hidden' },
          overscrollBehavior: 'contain',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            flex: { md: 1 },
            minInlineSize: 0,
            bgcolor: 'common.black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {mediaSlot}
        </Box>

        <Box
          sx={{
            flex: 'none',
            inlineSize: { xs: '100%', md: 380 },
            display: 'flex',
            flexDirection: 'column',
            minBlockSize: 0,
            overflowY: { md: 'auto' },
            overscrollBehavior: 'contain',
            borderInlineStart: { md: '1px solid' },
            borderColor: { md: 'divider' },
          }}
        >
          {panelSlot}
        </Box>
      </Box>
    </Box>
  )
}
