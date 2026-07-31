'use client'

/**
 * AppointmentCard — การ์ดนัดหมาย + ปุ่มยืนยัน/ขอเลื่อน บนหน้าออเดอร์สาธารณะ
 * (feature 00024, FR-RSV-05/06/07)
 *
 * Base: src/app/(marketing)/o/[token]/OrderDetailMobile.tsx (การ์ด "รายการสินค้า"/"ขั้นตอน"
 *   ในไฟล์เดียวกัน — MUI Card + overline label + Chip สถานะ) ซึ่ง chase ต่อไปที่
 *   theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/details/OrderDetailsCard.tsx
 *   dialog ขอเลื่อน: pattern เดียวกับ dialog ยกเลิกออเดอร์ใน OrderDetailMobile.tsx
 *
 * Design Spec: safepay-ux ส่วน D (2026-07-31)
 *
 * IMPORTANT: ไฟล์นี้เป็นของ feature 00024 — ไม่แตะกลไก "ด่าน" ของ feature 00015
 * (resolveOrderAccess / discriminator / ClaimOtpPrompt / PhoneVerifyPrompt) การ์ดนี้ถูก
 * render หลังผ่าน grant แล้วเท่านั้น และออเดอร์ที่ไม่มีนัดจะไม่ render ไฟล์นี้เลย (DOM เหมือนเดิม)
 *
 * IMPORTANT: โหมด B1 — ลูกค้า "เลือกวันเองไม่ได้" ทำได้แค่ยืนยันกับขอเลื่อน ห้ามใส่ date picker
 * IMPORTANT: ขอเลื่อนแล้ว "เวลาเดิมยังถูกกันไว้" จนกว่าร้านจะตัดสิน (BR-RSV-27) copy ต้องสื่อชัด
 */

import { useState } from 'react'

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'
import { APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from '@/lib/appointments'
import { formatDateTH, formatDateTimeTH, formatTimeHM } from '@/lib/format-date'

export type PublicAppointment = {
  resourceName: string
  startIso: string
  endIso: string
  status: AppointmentStatus
  buyerConfirmedAt: string | null
  rescheduleNote: string | null
}

type Props = {
  token: string
  appointment: PublicAppointment
  /** ออเดอร์ถูกยกเลิกทั้งใบ → การ์ดยังแสดงเป็นประวัติ แต่ไม่มีปุ่มใด ๆ */
  orderCancelled: boolean
}

const MAX_NOTE = 500

/**
 * สีของสถานะนัด
 *
 * Verified-Means-Green: เขียวเฉพาะที่ยืนยันแล้วจริง (ลูกค้ายืนยัน / ให้บริการแล้ว)
 * "นัดแล้ว" กับ "ขอเลื่อน" ยังไม่นิ่ง → warning ไม่ใช่เขียว เพื่อไม่ให้สัญญาณ trust เฟ้อ
 * "ไม่มาตามนัด" = error เพราะเป็นผลลบจริง
 */
const STATUS_COLOR: Record<AppointmentStatus, 'warning' | 'success' | 'error'> = {
  SCHEDULED: 'warning',
  CONFIRMED_BY_BUYER: 'success',
  RESCHEDULE_REQUESTED: 'warning',
  COMPLETED: 'success',
  NO_SHOW: 'error',
}

/** ข้อความ error ที่ผู้ใช้อ่านรู้เรื่อง — ใช้ message จาก server ถ้ามี ไม่งั้น map จาก code */
function errorMessage(data: unknown, fallback: string): string {
  const d = data as { message?: string; error?: string } | null
  if (d?.message) return d.message
  switch (d?.error) {
    case 'APPOINTMENT_NOT_FOUND':
      return 'ไม่พบข้อมูลนัดหมายนี้'
    case 'APPOINTMENT_TERMINAL':
      return 'นัดนี้จบไปแล้ว แก้ไขไม่ได้'
    case 'APPOINTMENT_PAST':
      return 'เลยเวลานัดไปแล้ว'
    default:
      return d?.error ?? fallback
  }
}

export default function AppointmentCard({ token, appointment, orderCancelled }: Props) {
  const [state, setState] = useState(appointment)
  const [confirming, setConfirming] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const start = new Date(state.startIso)
  const end = new Date(state.endIso)
  // นัดข้ามวัน (เช่น 22:00–01:00) ต้องเห็นวันที่ทั้งสองฝั่ง ไม่งั้นอ่านแล้วเข้าใจผิด
  const crossesDay = formatDateTH(start) !== formatDateTH(end)

  const showConfirm = !orderCancelled && state.status === 'SCHEDULED'
  /**
   * "ขอเลื่อนนัด" ยังกดได้หลังยืนยันไปแล้ว (user ตัดสิน 2026-07-31: ถอนได้ถ้าจำเป็น
   * และต้องเป็นลูกค้าขอเอง) — กดยืนยันพลาดด้วยนิ้วโป้งบนมือถือแล้วติดกับ ต้องโทรหาร้าน
   * ขัดกับ user story ที่ว่า "ไม่ต้องโทร"
   *
   * ไม่ต้องแตะ backend: requestAppointmentReschedule() บล็อกแค่สถานะที่จบแล้ว
   * (COMPLETED/NO_SHOW) กับเลยเวลานัด — CONFIRMED_BY_BUYER ผ่านอยู่แล้ว
   *
   * ตั้งใจไม่ทำเป็น "ถอนการยืนยัน" ที่ย้อนสถานะกลับเป็น SCHEDULED เงียบ ๆ เพราะร้าน
   * จะไม่รู้ว่าลูกค้าเปลี่ยนใจ — ส่งเป็นคำขอให้ร้านเห็นดีกว่า
   */
  const showReschedule =
    !orderCancelled &&
    (state.status === 'SCHEDULED' || state.status === 'CONFIRMED_BY_BUYER')

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const res = await fetch(`/api/orders/${token}/appointment/confirm`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(errorMessage(data, 'ยืนยันนัดไม่สำเร็จ กรุณาลองอีกครั้ง'))
        return
      }
      setState((prev) => ({
        ...prev,
        status: (data.appointmentStatus as AppointmentStatus) ?? 'CONFIRMED_BY_BUYER',
        buyerConfirmedAt: data.buyerConfirmedAt ?? prev.buyerConfirmedAt,
      }))
      toast.success('ยืนยันนัดแล้ว ร้านค้าจะได้รับแจ้ง')
    } catch {
      toast.error('ยืนยันนัดไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setConfirming(false)
    }
  }

  const handleReschedule = async () => {
    setSending(true)
    try {
      const res = await fetch(`/api/orders/${token}/appointment/reschedule-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // ตั้งใจไม่ปิด dialog ตอน error — ข้อความที่ผู้ใช้พิมพ์ไว้ต้องไม่หายเมื่อกดลองใหม่
        toast.error(errorMessage(data, 'ส่งคำขอเลื่อนไม่สำเร็จ กรุณาลองอีกครั้ง'))
        return
      }
      setState((prev) => ({
        ...prev,
        status: (data.appointmentStatus as AppointmentStatus) ?? 'RESCHEDULE_REQUESTED',
        rescheduleNote: note.trim() || prev.rescheduleNote,
      }))
      setDialogOpen(false)
      toast.success('ส่งคำขอเลื่อนนัดแล้ว ร้านค้าจะได้รับแจ้งทันที')
    } catch {
      toast.error('ส่งคำขอเลื่อนไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Card sx={{ opacity: orderCancelled ? 0.6 : 1 }}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <Typography variant="subtitle2" color="text.secondary">
              นัดหมาย
            </Typography>
            <Chip
              size="small"
              variant="tonal"
              color={STATUS_COLOR[state.status]}
              label={APPOINTMENT_STATUS_LABEL[state.status]}
            />
          </div>

          <div>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {formatDateTH(start)}
            </Typography>
            <Typography variant="body1" color="text.primary">
              {crossesDay
                ? `${formatTimeHM(start)} – ${formatDateTH(end)} ${formatTimeHM(end)} น.`
                : `${formatTimeHM(start)} – ${formatTimeHM(end)} น.`}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={state.resourceName}
            >
              {state.resourceName}
            </Typography>
          </div>

          {/* ── ปุ่ม/ข้อความตามสถานะ ── */}
          {orderCancelled ? (
            <Typography variant="body2" color="text.secondary">
              คำสั่งซื้อนี้ถูกยกเลิกแล้ว นัดหมายนี้จึงไม่มีผลอีกต่อไป
            </Typography>
          ) : showConfirm || showReschedule ? (
            <div className="flex flex-col gap-2">
              {/* ยืนยันแล้ว → ไม่มีปุ่มยืนยันอีก แต่บอกให้เห็นว่ายืนยันไปเมื่อไร */}
              {state.status === 'CONFIRMED_BY_BUYER' && (
                <Typography variant="body2" color="success.main">
                  คุณยืนยันนัดนี้แล้ว
                  {state.buyerConfirmedAt
                    ? ` เมื่อ ${formatDateTimeTH(state.buyerConfirmedAt)}`
                    : ''}
                </Typography>
              )}
              {showConfirm && (
                <Button
                  fullWidth
                  variant="tonal"
                  color="primary"
                  disabled={confirming}
                  onClick={handleConfirm}
                  sx={{ minHeight: 44 }}
                >
                  {confirming ? 'กำลังยืนยัน...' : 'ยืนยันนัด'}
                </Button>
              )}
              {showReschedule && (
                <Button
                  fullWidth
                  variant="outlined"
                  color="secondary"
                  onClick={() => setDialogOpen(true)}
                  sx={{ minHeight: 44 }}
                >
                  {state.status === 'CONFIRMED_BY_BUYER' ? 'มาไม่ได้ ขอเลื่อนนัด' : 'ขอเลื่อนนัด'}
                </Button>
              )}
            </div>
          ) : state.status === 'RESCHEDULE_REQUESTED' ? (
            <div className="flex flex-col gap-1">
              <Typography variant="body2" color="text.secondary">
                ส่งคำขอเลื่อนนัดแล้ว รอร้านค้าตอบกลับ — เวลานัดเดิมด้านบนยังถูกกันไว้ให้คุณอยู่
              </Typography>
              {state.rescheduleNote && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  หมายเหตุที่คุณส่ง: {state.rescheduleNote}
                </Typography>
              )}
            </div>
          ) : state.status === 'COMPLETED' ? (
            <Typography variant="body2" color="text.secondary">
              นัดหมายนี้เสร็จสิ้นแล้ว
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              ระบบบันทึกว่าไม่ได้มาตามเวลานัดนี้ หากคิดว่าไม่ถูกต้อง ติดต่อร้านค้าเพื่อตรวจสอบได้โดยตรง
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog ขอเลื่อนนัด ── */}
      <Dialog open={dialogOpen} onClose={() => !sending && setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogContent className="flex flex-col gap-4">
          <div>
            <Typography variant="h6">ขอเลื่อนนัด</Typography>
            <Typography variant="body2" color="text.secondary" className="mt-1">
              แจ้งร้านค้าว่าคุณอยากเลื่อนนัดนี้ — เวลานัดเดิมจะยังถูกกันไว้จนกว่าร้านจะตอบกลับ
            </Typography>
          </div>
          <CustomTextField
            fullWidth
            multiline
            minRows={3}
            maxRows={6}
            label="หมายเหตุ (ไม่บังคับ)"
            placeholder="เช่น ติดธุระ ขอเป็นวันศุกร์เช้าแทนได้ไหม"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            helperText={`${note.length}/${MAX_NOTE}`}
          />
        </DialogContent>
        <DialogActions>
          <Button color="secondary" disabled={sending} onClick={() => setDialogOpen(false)}>
            ไม่ส่งคำขอ
          </Button>
          <Button variant="contained" disabled={sending} onClick={handleReschedule}>
            {sending ? 'กำลังส่ง...' : 'ส่งคำขอเลื่อน'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
