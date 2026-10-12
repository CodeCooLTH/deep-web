'use client'

/**
 * ปุ่มพิมพ์/บันทึก PDF ใบเสร็จฝั่งลูกค้า — `window.print()` (feature 00073 FR-013)
 * Base: src/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/PrintButton.tsx (ท่าเดียวกัน แต่เป็นปุ่ม MUI ของฝั่งลูกค้า)
 */
import Button from '@mui/material/Button'
import { Icon } from '@iconify/react'

export default function PrintReceiptButton() {
  return (
    <Button
      variant='contained'
      color='primary'
      onClick={() => window.print()}
      startIcon={<Icon icon='tabler-printer' fontSize={18} />}
      sx={{ minHeight: 44, fontWeight: 600 }}
    >
      พิมพ์ / บันทึก PDF
    </Button>
  )
}
