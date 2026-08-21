'use client'

/**
 * BidPhoneVerifyDialog — modal ยืนยันเบอร์โทรก่อนวางบิด/ซื้อทันที
 * (feature 00015 Order Claim & Forced Login, FR-OCL-10, UX Design Spec Screen 5)
 *
 * เด้งเมื่อ backend คืน 403 { code: 'PHONE_NOT_VERIFIED' } จาก
 * /api/auctions/[id]/{bid,buy-now} — เกิดกับบัญชี Facebook ที่ยังไม่เคยตั้งเบอร์
 * (ต้องมีเบอร์ verified ก่อนวางบิด/ซื้อทันที). สองสเต็ป:
 *   step 1: กรอกเบอร์โทร → ส่ง OTP (POST /api/otp/send)
 *   step 2: กรอก OTP 6 หลัก → ยืนยัน (POST /api/account/set-phone)
 * สำเร็จ → ปิด modal แล้วเรียก onVerified() ให้ parent auto-retry บิด/ซื้อทันทีเดิม
 *
 * Base: theme/vuexy/typescript-version/full-version/src/components/dialogs/two-factor-auth/index.tsx
 *   (Dialog/DialogTitle/DialogContent/DialogActions shell, SMSDialog CustomTextField แถว, ปุ่ม
 *   variant='tonal' color='secondary' ยกเลิก + variant='contained' ยืนยัน)
 *   + theme/vuexy/typescript-version/full-version/src/components/dialogs/DialogCloseButton.tsx
 *   (ปุ่มปิด X มุมขวาบน — inline sx ที่นี่เพราะยังไม่มี shared DialogCloseButton ใน src ปัจจุบัน)
 * Weight ref: src/app/(marketing)/a/[id]/AuctionBidPanel.tsx (buyNowOpen Dialog block เดิม)
 */
import { useState, type ChangeEvent } from 'react'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import CustomTextField from '@core/components/mui/TextField'
import OtpSlots from '@/app/(marketing)/_components/OtpSlots'
import { MOBILE_PHONE_RE, MOBILE_RULE_TEXT } from '@/lib/phone'

// เหมือน phoneSchema ใน src/app/(marketing)/auth/sign-in/SignInCard.tsx
const PHONE_RE = MOBILE_PHONE_RE

type Props = {
  open: boolean
  onClose: () => void
  /** ตั้งเบอร์สำเร็จแล้ว — parent เป็นคนเรียก handleBid()/handleBuyNow() ซ้ำเอง (auto-retry) */
  onVerified: () => void
}

export default function BidPhoneVerifyDialog({ open, onClose, onVerified }: Props) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const busy = sending || verifying

  function reset() {
    setStep('phone')
    setPhone('')
    setPhoneError(null)
    setOtp('')
    setErrorMsg(null)
  }

  function handleClose() {
    if (busy) return
    reset()
    onClose()
  }

  async function handleSendOtp() {
    setPhoneError(null)
    setErrorMsg(null)
    if (!PHONE_RE.test(phone)) {
      setPhoneError(MOBILE_RULE_TEXT)
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      const data = await res.json().catch(() => ({}) as { error?: string })
      if (!res.ok) {
        setErrorMsg(data.error ?? 'ส่งรหัส OTP ไม่สำเร็จ')
        return
      }
      setStep('otp')
    } catch {
      setErrorMsg('ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

  async function handleVerify() {
    setErrorMsg(null)
    if (otp.length !== 6) {
      setErrorMsg('กรุณากรอกรหัส 6 หลัก')
      return
    }
    setVerifying(true)
    try {
      const res = await fetch('/api/account/set-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      })
      const data = await res.json().catch(() => ({}) as { error?: string })
      if (!res.ok) {
        // 409 "เบอร์นี้มีบัญชีแล้ว" / "บัญชีนี้ตั้งเบอร์แล้ว ไม่สามารถเปลี่ยนได้"
        // 401 "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" — ข้อความมาจาก server ตรงตาม spec อยู่แล้ว
        setErrorMsg(data.error ?? 'ยืนยันเบอร์ไม่สำเร็จ')
        return
      }
      reset()
      onClose()
      onVerified()
    } catch {
      setErrorMsg('ยืนยันเบอร์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth sx={{ '& .MuiDialog-paper': { overflow: 'visible' } }}>
      {/* ปุ่มปิด X — Base: DialogCloseButton.tsx (inline เพราะยังไม่มี shared component ใน src) */}
      <Button
        onClick={handleClose}
        disabled={busy}
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          color: 'text.disabled',
          boxShadow: (theme) => theme.customShadows.xs,
          transform: 'translate(9px, -10px)',
          borderRadius: 1,
          bgcolor: 'background.paper',
          minWidth: 0,
          width: 30,
          height: 30,
          p: 0,
        }}
      >
        <Icon icon="tabler-x" fontSize={20} />
      </Button>

      <DialogTitle className="flex flex-col gap-2 sm:pbs-10 sm:pli-10">
        ยืนยันเบอร์โทรก่อนวางบิด
        <Typography component="span" color="text.secondary">
          ต้องมีเบอร์ที่ยืนยันแล้วก่อนวางบิดหรือซื้อทันที
        </Typography>
      </DialogTitle>

      {step === 'phone' ? (
        <>
          <DialogContent className="overflow-visible sm:pli-10">
            <CustomTextField
              fullWidth
              autoFocus
              type="tel"
              label="เบอร์โทรศัพท์"
              placeholder="08xxxxxxxx"
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
              value={phone}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              error={!!phoneError}
              helperText={phoneError}
            />
            {errorMsg && (
              <Typography color="error.main" className="text-center text-sm mt-3">
                {errorMsg}
              </Typography>
            )}
          </DialogContent>
          <DialogActions className="sm:pbe-10 sm:pli-10">
            <Button variant="tonal" color="secondary" onClick={handleClose} disabled={busy}>
              ยกเลิก
            </Button>
            <Button variant="contained" color="primary" onClick={handleSendOtp} disabled={busy}>
              {sending ? 'กำลังส่ง...' : 'ส่งรหัส OTP'}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent className="overflow-visible flex flex-col gap-4 sm:pli-10">
            <Typography>กรอกรหัสความปลอดภัย 6 หลักที่ส่งไปยังเบอร์ของคุณ</Typography>
            <OtpSlots value={otp} onChange={setOtp} />
            {errorMsg && (
              <Typography color="error.main" className="text-center text-sm">
                {errorMsg}
              </Typography>
            )}
          </DialogContent>
          <DialogActions className="sm:pbe-10 sm:pli-10">
            <Button variant="tonal" color="secondary" onClick={handleClose} disabled={busy}>
              ยกเลิก
            </Button>
            <Button variant="contained" color="primary" onClick={handleVerify} disabled={busy}>
              {verifying ? 'กำลังยืนยัน...' : 'ยืนยัน'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
