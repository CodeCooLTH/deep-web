'use client'

/**
 * ResponsiveSheet — แผงข้อมูลที่เปลี่ยนรูปตามจอ
 *
 *   มือถือ (< md)  → bottom sheet เลื่อนขึ้นจากขอบล่าง (นิ้วโป้งเอื้อมถึง ปิดด้วยการปัดลงได้ตามสัญชาตญาณ)
 *   เดสก์ท็อป (≥ md) → โมดัลกลางจอ
 *
 * 🛑 เดิมใช้ `Drawer anchor='bottom'` ทุกจอ (user ทัก 2026-08-10: "ทำไมมันไม่เป็น modal ตรงกลางจอ
 * ทำไมมันไปเป็น bottom เฉย · พวก bottom มันควรเป็น mobile only ป่าว") — ถูกต้อง: bottom sheet
 * เป็นแพตเทิร์นที่เกิดมาเพราะข้อจำกัดของการถือมือถือมือเดียว บนเดสก์ท็อปที่มีเมาส์และจอกว้าง
 * มันกลายเป็นแผงที่ยึดขอบล่างโดยไม่มีเหตุผล และทิ้งพื้นที่กลางจอว่างเปล่า
 *
 * `md` ที่นี่ = 900px ตามสเกลที่ฝั่ง buyer remap ไว้ (marketing.css) ไม่ใช่ 768 ของ Tailwind มาตรฐาน
 *
 * radius 10px = ขั้นบนสุดของ shape ramp ฝั่ง buyer (DESIGN.md §Shapes 4/6/8/10/full)
 * ไฟล์ต้นแบบ AuctionBidHistoryModal ใช้ 18px ซึ่งไม่อยู่บน ramp — อย่าลอกค่านั้นมา
 */
import type { ReactNode } from 'react'

import Dialog from '@mui/material/Dialog'
import Drawer from '@mui/material/Drawer'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'

type Props = {
  open: boolean
  onClose: () => void
  /** ป้ายให้ screen reader — โมดัลที่ไม่มีชื่อ ผู้ใช้ screen reader จะไม่รู้ว่าเปิดอะไรอยู่ */
  ariaLabel?: string
  ariaLabelledBy?: string
  id?: string
  children: ReactNode
}

export default function ResponsiveSheet({ open, onClose, ariaLabel, ariaLabelledBy, id, children }: Props) {
  // noSsr: ค่านี้ถูกอ่านตอนเปิดแผงเท่านั้น (แผงปิดอยู่ตอน first paint) จึงไม่ต้องกลัว hydration
  // mismatch และการอ่านค่าจริงตั้งแต่ต้นดีกว่าเดา false แล้วสลับรูปให้เห็นตอนเปิด
  const isDesktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true })

  const paper = {
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
  }

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth='xs'
        slotProps={{ paper: { ...paper, sx: { borderRadius: '10px' } } }}
      >
        {children}
      </Dialog>
    )
  }

  return (
    <Drawer
      anchor='bottom'
      open={open}
      onClose={onClose}
      slotProps={{ paper: { ...paper, sx: { borderRadius: '10px 10px 0 0', maxBlockSize: '86dvh' } } }}
    >
      {children}
    </Drawer>
  )
}
