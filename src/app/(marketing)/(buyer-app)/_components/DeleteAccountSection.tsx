'use client'

/**
 * DeleteAccountSection — ปุ่ม "ลบบัญชี" ฝั่งผู้ซื้อ (Vuexy) + Dialog ยืนยัน
 *
 * ทำไมต้องมี: App Store Guideline 5.1.1(v) — แอปที่สมัครบัญชีได้ ต้องให้ผู้ใช้เริ่มลบบัญชี
 * ได้จากในแอป. บัญชี Deep เป็นใบเดียวใช้ทั้งฝั่งซื้อและขาย (Profile-Centric) — ผู้ซื้อที่ไม่เคย
 * เปิดร้านก็ต้องลบได้เหมือนกัน ไม่ใช่บังคับให้ไปกดที่ฝั่ง seller ซึ่งเขาไม่มีสิทธิ์เข้า
 *
 * ตัว logic/endpoint เป็นตัวเดียวกับฝั่งผู้ขายทุกประการ (`/api/account/delete`) ต่างแค่:
 *   - ธีม Vuexy/MUI แทน Paces
 *   - ไม่ต้องถอน push token: token ของแอปผู้ขายผูกกับ WebView ฝั่ง seller เท่านั้น
 *     (ฝั่ง server ลบ PushToken ทุกแถวใน transaction เดียวกับการปิดบัญชีอยู่แล้ว)
 *
 * variant: 'card' = การ์ดเต็ม (หน้า /settings/profile เดสก์ท็อป)
 *          'row'  = แถวเดียวกลืนกับ hub มือถือ (/m/settings/profile)
 *   แยกแค่ "ตัวจุด" ส่วน Dialog ใช้ร่วมกัน — ไม่ก๊อป logic ไปสองที่
 *
 * Base (Dialog shell + CustomTextField + ปุ่ม tonal/contained):
 *   src/app/(marketing)/a/[id]/BidPhoneVerifyDialog.tsx
 *   ซึ่ง chase ต่อไปที่ theme/vuexy/.../src/components/dialogs/two-factor-auth/index.tsx
 * Base (การ์ด error tone): theme/vuexy/.../src/views/pages/account-settings/account/DeleteAccount.tsx
 * Base (แถวมือถือ): src/app/(marketing)/m/settings/profile/page.tsx (MenuRow)
 *
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md §10
 */

import { useEffect, useState } from 'react'

import { signOut } from 'next-auth/react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'
import { ACCOUNT_DELETE_ERROR, type DeletionPreflight } from '@/lib/account-deletion'

const DELETE_ERROR_MESSAGE: Record<string, string> = {
  [ACCOUNT_DELETE_ERROR.CONFIRM_MISMATCH]: 'ชื่อที่พิมพ์ไม่ตรง กรุณาตรวจสอบอีกครั้ง',
  [ACCOUNT_DELETE_ERROR.HAS_BLOCKERS]: 'ยังมีรายการค้างอยู่ — จัดการให้เรียบร้อยก่อนจึงจะลบได้',
  [ACCOUNT_DELETE_ERROR.ALREADY_DELETED]: 'บัญชีนี้ถูกลบไปแล้ว',
  [ACCOUNT_DELETE_ERROR.NOT_FOUND]: 'ไม่พบบัญชี',
}

/** สิ่งที่จะเกิดขึ้น — ข้อความฝั่งผู้ซื้อ (ไม่พูดถึงร้าน/พนักงานซึ่งเขาอาจไม่มี) */
const CONSEQUENCES = [
  'เข้าสู่ระบบไม่ได้อีกทันที ทุกช่องทาง',
  'ประวัติการซื้อและรีวิวจะไม่ผูกกับตัวคุณอีกต่อไป',
  'ร้านค้าของคุณ (ถ้ามี) จะหายจากหน้าค้นหาและลิงก์สาธารณะ',
  'หยุดรับการแจ้งเตือนทุกเครื่องที่เคยเข้าใช้งาน',
]

type Props = {
  variant?: 'card' | 'row'
}

const DeleteAccountSection = ({ variant = 'card' }: Props) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [preflight, setPreflight] = useState<DeletionPreflight | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // โหลด preflight ทุกครั้งที่เปิด (ไม่ cache) — ออเดอร์ค้างเปลี่ยนได้ตลอดเวลา
  useEffect(() => {
    if (!open) return
    let cancelled = false

    setLoading(true)
    setErrorMsg(null)
    fetch('/api/account/delete', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error('preflight failed')

        return (await res.json()) as DeletionPreflight
      })
      .then(data => {
        if (!cancelled) setPreflight(data)
      })
      .catch(() => {
        if (!cancelled) setErrorMsg('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const handleClose = () => {
    if (submitting) return
    setOpen(false)
    setConfirmText('')
    setErrorMsg(null)
  }

  const handleDelete = async () => {
    setSubmitting(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText })
      })

      if (res.ok) {
        toast.success('ลบบัญชีเรียบร้อย')
        // ผู้ซื้อออกไปหน้าแรก (ไม่ใช่หน้า login) — เขาอาจแค่แวะเข้ามาดูสินค้าต่อได้
        signOut({ callbackUrl: '/' })

        return
      }

      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        blockers?: DeletionPreflight['blockers']
      }

      // 409 HAS_BLOCKERS ส่ง blockers ล่าสุดมาด้วย — อัปเดตรายการทันทีโดยไม่ต้องปิดแล้วเปิดใหม่
      if (data.blockers && preflight) {
        setPreflight({ ...preflight, blockers: data.blockers, canDelete: data.blockers.length === 0 })
      }

      setErrorMsg(DELETE_ERROR_MESSAGE[data.error ?? ''] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch {
      setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const blockers = preflight?.blockers ?? []
  const warnings = preflight?.warnings ?? []
  const confirmLabel = preflight?.confirmLabel ?? ''

  // เทียบแบบเดียวกับ server (trim + ไม่สนตัวพิมพ์ใหญ่เล็ก) — ปุ่มต้องไม่ disabled ทั้งที่ server จะรับ
  const canSubmit =
    !!preflight &&
    preflight.canDelete &&
    confirmText.trim().toLocaleLowerCase('th') === confirmLabel.trim().toLocaleLowerCase('th') &&
    !submitting

  const dialog = (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth='sm'>
      <DialogTitle className='flex items-center gap-2'>
        <i className='tabler-alert-triangle text-[var(--mui-palette-error-main)]' />
        ลบบัญชีถาวร
      </DialogTitle>

      <DialogContent className='flex flex-col gap-4'>
        {loading && (
          <div className='flex items-center justify-center gap-2 plb-6'>
            <CircularProgress size={20} />
            <Typography variant='body2'>กำลังตรวจสอบบัญชี</Typography>
          </div>
        )}

        {!loading && preflight && (
          <>
            {/* ตัวบล็อก — มาก่อนทุกอย่าง เพราะเป็นสิ่งที่ผู้ใช้ต้องไปทำต่อ */}
            {blockers.length > 0 && (
              <Alert severity='error' variant='outlined'>
                {blockers.map(b => (
                  <div key={b.code}>
                    <Typography variant='body2'>{b.message}</Typography>
                    {/* 🛑 ห้าม render b.actionHref เป็นลิงก์ที่นี่
                        actionHref เป็น path ของ "แอปผู้ขาย" (`/orders` = คำสั่งซื้อของร้าน)
                        แต่หน้านี้อยู่บนโดเมนหลัก ซึ่ง `/orders` คือออเดอร์ที่ผู้ใช้ "ซื้อ" — คนละหน้ากันคนละเรื่อง
                        กดแล้วจะไปเจอหน้าที่ไม่มีออเดอร์ที่ค้างอยู่เลย แล้วงงว่าทำไมยังลบไม่ได้
                        จึงบอกเป็นข้อความว่าต้องไปจัดการที่ไหนแทน (ลิงก์ข้ามซับโดเมนต้องล็อกอินใหม่อยู่ดี) */}
                    <Typography variant='caption' color='text.secondary' className='mbs-1 block'>
                      จัดการได้ที่ระบบผู้ขาย (seller.deepthailand.app) → เมนูคำสั่งซื้อ
                    </Typography>
                  </div>
                ))}
              </Alert>
            )}

            <div>
              <Typography variant='subtitle2' className='mbe-2'>
                เมื่อลบแล้ว
              </Typography>
              <ul className='flex flex-col gap-2 pis-0 mbe-0' style={{ listStyle: 'none' }}>
                {CONSEQUENCES.map(text => (
                  <li key={text} className='flex items-start gap-2'>
                    <i className='tabler-point text-[var(--mui-palette-text-disabled)]' />
                    <Typography variant='body2' color='text.secondary'>
                      {text}
                    </Typography>
                  </li>
                ))}
              </ul>
            </div>

            {/* คำเตือน — ลบได้ แต่ต้องรู้ว่าจะเสียอะไร (warning ไม่ใช่ error — ไม่ได้ห้าม) */}
            {warnings.length > 0 && (
              <Alert severity='warning' variant='outlined'>
                {warnings.map(w => (
                  <Typography key={w.code} variant='body2'>
                    {w.message}
                  </Typography>
                ))}
              </Alert>
            )}

            <Typography variant='body2' color='text.secondary'>
              ข้อมูลส่วนตัวจะถูกล้างออกจากระบบภายใน 30 วัน ส่วนประวัติคำสั่งซื้อจะถูกเก็บไว้แบบไม่ระบุตัวตนตามกฎหมาย
              เพื่อไม่ให้ประวัติของคู่ค้าเสียหาย
            </Typography>

            {/* ช่องยืนยัน — ซ่อนเมื่อมีตัวบล็อก เพราะพิมพ์ไปก็กดไม่ได้ */}
            {blockers.length === 0 && (
              <CustomTextField
                fullWidth
                label={`พิมพ์ "${confirmLabel}" เพื่อยืนยัน`}
                placeholder={confirmLabel}
                value={confirmText}
                disabled={submitting}
                autoComplete='off'
                onChange={e => setConfirmText(e.target.value)}
              />
            )}
          </>
        )}

        {errorMsg && (
          <Alert severity='error' variant='outlined'>
            {errorMsg}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={handleClose} disabled={submitting}>
          ยกเลิก
        </Button>
        <Button
          variant='contained'
          color='error'
          onClick={handleDelete}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} color='inherit' /> : undefined}
        >
          ลบบัญชีถาวร
        </Button>
      </DialogActions>
    </Dialog>
  )

  // ── แถวเดียว (มือถือ /m) — กลืนกับ MenuRow ของหน้า hub ─────────────────────
  if (variant === 'row') {
    return (
      <>
        <button
          type='button'
          onClick={() => setOpen(true)}
          className='flex items-center gap-3 is-full pli-4 plb-3.5 bg-transparent border-0 cursor-pointer text-start active:bg-[var(--mui-palette-action-hover)] transition-colors'
        >
          <i className='tabler-trash text-[21px] text-[var(--mui-palette-error-main)] shrink-0' />
          <span className='flex-1 text-[14px] text-[var(--mui-palette-error-main)]'>ลบบัญชี</span>
          <i className='tabler-chevron-right text-[18px] text-[var(--mui-palette-text-disabled)] shrink-0' />
        </button>
        {dialog}
      </>
    )
  }

  // ── การ์ดเต็ม (เดสก์ท็อป /settings/profile) ─────────────────────────────────
  return (
    <>
      <Card>
        <CardContent className='flex flex-col gap-4'>
          <Typography variant='h5' color='error.main'>
            ลบบัญชี
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            ลบบัญชีและข้อมูลส่วนตัวของคุณออกจาก Deep อย่างถาวร — ทำแล้วย้อนกลับไม่ได้
          </Typography>
          <div>
            <Button
              variant='outlined'
              color='error'
              startIcon={<i className='tabler-trash' />}
              onClick={() => setOpen(true)}
            >
              ลบบัญชี
            </Button>
          </div>
        </CardContent>
      </Card>
      {dialog}
    </>
  )
}

export default DeleteAccountSection
