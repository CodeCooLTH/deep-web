'use client'

/**
 * PayoutAccountCard — บล็อกบัญชีรับเงิน + QR พร้อมเพย์ บนหน้าออเดอร์ของผู้ซื้อ (feature 00062,
 * UX-Design-Spec §B7) — ใช้ร่วมทั้งจอ guest (`GuestOrderView.tsx`) และจอหลังล็อกอิน
 * (`OrderDetailMobile.tsx`) เหตุผลเดียวกับที่ `TrustPill`/`ParcelTimeline` แยกไฟล์: ป้าย/บล็อก
 * ของออเดอร์ใบเดียวกันต้องหน้าตาเหมือนกันทั้งสองจอ ไม่ใช่แก้สองที่ให้ตรงกันเอง (HR16,
 * docs/conventions/sibling-surface-parity.md)
 *
 * 🛑 เป็น `'use client'` เพราะต้องใช้ clipboard + canvas (บันทึกรูป QR) — ใช้ได้จากทั้ง
 * server component (`GuestOrderView.tsx`) และ client component (`OrderDetailMobile.tsx`) ตัวเอง
 * แพตเทิร์นเดียวกับ `ParcelTimeline`/`AuthPingLink` ในโฟลเดอร์เดียวกัน
 *
 * ## ทำไมใช้ `QRCodeCanvas` ไม่ใช่ `QRCodeSVG`
 * UX-Design-Spec §B7 Open Question 5 ทิ้งไว้ว่า `QRCodeSVG` export เป็น PNG ตรง ๆ ไม่ได้ ต้องผ่าน
 * canvas — `qrcode.react` (dependency เดียวกับที่ `OrderQrSheet.tsx` ฝั่ง Paces ใช้) มี
 * `QRCodeCanvas` ให้อยู่แล้วซึ่ง forward ref เป็น `HTMLCanvasElement` ตรง ๆ → `canvas.toDataURL()`
 * ได้ PNG ทันทีไม่ต้องแปลงเพิ่ม เลือกใช้ตัวนี้แทนเพื่อให้ปุ่ม "บันทึกรูป QR" ทำงานได้จริง
 * (ไลบรารีเดียวกัน สเปกเดียวกัน ต่างแค่ output element)
 *
 * ## Fail-closed ตาม TFR-011 (SRS §…): payload สร้างไม่ได้ = ไม่แสดง QR เลย
 * `buildPromptPayPayload()` คืน `null` เมื่อ input ผิดรูปแบบ — คอมเมนต์ของไฟล์นั้นเขียนกำกับไว้เอง
 * ว่าห้าม throw แทน `null` เพราะที่นี่ใช้ `null` เป็นสัญญาณ "ไม่แสดง QR" ตรง ๆ ไม่ต้องดัก error
 *
 * Base:
 *   - โครงการ์ด MUI: `./OrderDetailMobile.tsx` การ์ด "Payment method" เดิม (`<Card><Box px/py.../>`)
 *   - QR rendering: `theme/paces/Admin/TS/src/app/(admin)/../orders/components/OrderQrSheet.tsx`
 *     (ใช้ qrcode.react กล่องขาวมีขอบ) — ปรับ wrapper เป็น MUI `Box`/`Card` ตามที่ Theme Source
 *     Mapping ของ UX-Design-Spec §B7 ระบุ (ห้าม div ดิบของ Paces ในฝั่ง Vuexy)
 *   - ปุ่มคัดลอก: `./OrderDetailMobile.tsx` `handleCopyTracking` pattern (copy state 2 วิ)
 */

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { QRCodeCanvas } from 'qrcode.react'

import { findThaiBank, type PayoutSnapshot } from '@/lib/shop-payout'
import { buildPromptPayPayload } from '@/lib/promptpay-qr'
import { ORDER_STATUS_TONE_TO_MUI, type PaymentBadge } from '@/lib/order-display'
import TrustPill from './TrustPill'

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
})

type Props = {
  totalAmount: number
  payoutSnapshot: PayoutSnapshot | null
  /** ป้ายสถานะการชำระเงิน — จาก `getPaymentBadge()` SSOT เดียวกับฝั่งร้าน (UX-Design-Spec §B8) */
  paymentBadge: PaymentBadge
  /**
   * impeccable critique P0-2 (2026-08-29) — Order.status ('PENDING'|'SHIPPED'|'CONFIRMED'|
   * 'CANCELLED'|'RETURNED') เดิมการ์ดนี้ไม่รู้จักสถานะออเดอร์เลย จึงเชิญให้สแกน QR โอนซ้ำได้
   * แม้ร้านยืนยันรับเงิน/ปิดงาน/**ยกเลิก**แล้ว — ดู `isSettled`/`isCancelled` ด้านล่าง
   */
  status: string
  /** Order.paymentConfirmedAt (ISO) — null = ร้านยังไม่กดยืนยันรับเงิน */
  paymentConfirmedAt: string | null
  /**
   * ปุ่ม "ติดต่อร้านค้า" ที่ผู้เรียกประกอบเอง — ปลายทางต่างกันตามว่าล็อกอินหรือยัง
   * (guest → ลิงก์ไป sign-in ผ่าน `AuthPingLink`, หลังล็อกอิน → ลิงก์ `/messages/[shopId]` ตรง ๆ)
   * ไม่ใช่ธุรกิจของการ์ดนี้ว่าจะพาไปไหน — รับมาเป็น element สำเร็จรูป
   */
  contactShopAction: ReactNode
}

export default function PayoutAccountCard({
  totalAmount,
  payoutSnapshot,
  paymentBadge,
  status,
  paymentConfirmedAt,
  contactShopAction,
}: Props) {
  /**
   * impeccable critique P0-2 (2026-08-29) — ออเดอร์ที่ร้านยืนยันรับเงิน/ปิดงาน/ยกเลิกแล้ว
   * ต้องถอด QR ที่สแกนจ่ายได้จริงออกทั้งบล็อก ไม่ใช่แค่ลดขนาด — โอนซ้ำ/โอนเข้าออเดอร์ที่ยกเลิก
   * แล้ว = เงินหาย ระบบไม่มีกลไกตามคืน (กลุ่มผู้สูงวัยที่ PRODUCT.md ผูกไว้พลาดง่ายเป็นพิเศษ
   * เพราะ QR กลางจอ + ตัวเลขใหญ่ ชนะป้ายเล็กมุมขวาบนเสมอ)
   * `paymentConfirmedAt` ไม่ว่าง ครอบเคสที่ร้านกด "ได้รับเงินแล้ว" ตอน SHIPPED ซึ่ง status ยัง
   * ไม่ใช่ CONFIRMED — เป็น OR ไม่ใช่ AND เพราะพลาดฝั่งไหนก็โชว์ QR ผิด
   */
  const isCancelled = status === 'CANCELLED'
  const isSettled = status === 'CONFIRMED' || isCancelled || Boolean(paymentConfirmedAt)
  // state สำหรับ copy icon (เปลี่ยน icon → tabler-check 2 วิ) — pattern เดียวกับ handleCopyTracking
  const [copied, setCopied] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const handleCopyAccount = async (accountNo: string) => {
    try {
      await navigator.clipboard.writeText(accountNo)
      setCopied(true)
      toast.success('คัดลอกเลขบัญชีแล้ว')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ — กดค้างที่เลขบัญชีเพื่อคัดลอกเองได้')
    }
  }

  const handleSaveQr = () => {
    const canvas = qrCanvasRef.current
    if (!canvas) return
    try {
      const link = document.createElement('a')
      link.download = 'promptpay-qr.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      toast.error('บันทึกรูป QR ไม่สำเร็จ — ลองแคปหน้าจอแทนได้')
    }
  }

  const bankLabel = payoutSnapshot?.bankCode ? findThaiBank(payoutSnapshot.bankCode)?.nameTh ?? 'เลขบัญชี' : 'เลขบัญชี'

  // 🛑 ยอดใน QR ต้องคำนวณจาก totalAmount ปัจจุบันเสมอ (live-read) — ไม่ cache payload เก่า
  // (TFR-011: ออเดอร์ถูกแก้ยอดทีหลัง QR ต้องเปลี่ยนตามทันที ต่างจากบัญชีที่ freeze ตอนสร้าง)
  const qrPayload = payoutSnapshot?.promptPayId
    ? buildPromptPayPayload({ promptPayId: payoutSnapshot.promptPayId, amount: totalAmount })
    : null

  return (
    <Card>
      <Box sx={{ px: 1.75, py: 1.75 }}>
        {/* ── header: icon + title (h2 semantics เดียวกับ SectionTitle) + badge (B8) ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Icon
            icon='tabler-building-bank'
            fontSize={18}
            style={{ color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }}
          />
          <Typography
            component='h2'
            sx={{ m: 0, fontSize: '0.9375rem', fontWeight: 500, color: 'text.primary', lineHeight: 1.5 }}
          >
            ช่องทางชำระเงิน
          </Typography>
          {paymentBadge && (
            <Box sx={{ ml: 'auto', flexShrink: 0 }}>
              <TrustPill
                tone='tier'
                tierColor={ORDER_STATUS_TONE_TO_MUI[paymentBadge.tone]}
                label={paymentBadge.label}
              />
            </Box>
          )}
        </Box>

        {/* ── ยอดที่ต้องโอน/ยอดที่ชำระ — Strong (700) ไม่ใช่ Metric เพราะมีป้ายกำกับ อ่านเป็นประโยค
            impeccable critique P0-2: หัวข้อต้องผันตาม isSettled ไม่งั้น "ต้องโอน" ค้างอยู่แม้จ่ายแล้ว ── */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
          <Typography variant='body2' color='text.secondary'>
            {isSettled ? 'ยอดที่ชำระ' : 'ยอดที่ต้องโอน'}
          </Typography>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>{baht.format(totalAmount)}</Typography>
        </Box>

        {/* ── ยกเลิกแล้ว — เตือนห้ามโอนตรง ๆ ไม่ใช่แค่ถอด QR เงียบ ๆ (P0-2) ── */}
        {isCancelled && (
          <Box sx={{ bgcolor: 'error.lightOpacity', borderRadius: 2, px: 1.5, py: 1.25, mt: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Icon
                icon='tabler-alert-triangle'
                style={{ fontSize: 17, marginTop: 2, color: 'var(--mui-palette-error-main)', flexShrink: 0 }}
              />
              <Typography variant='body2' sx={{ fontWeight: 600, color: 'error.main' }}>
                ออเดอร์นี้ถูกยกเลิกแล้ว — ห้ามโอนเงิน
              </Typography>
            </Box>
          </Box>
        )}

        {/* ── ร้านยังไม่ได้ตั้งบัญชี — fail-loud ห้ามเงียบ (UX-Design-Spec §B7 Edge states) ── */}
        {!payoutSnapshot && (
          <Box sx={{ bgcolor: 'warning.lightOpacity', borderRadius: 2, px: 1.5, py: 1.25, mt: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Icon
                icon='tabler-alert-triangle'
                style={{ fontSize: 17, marginTop: 2, color: 'var(--mui-palette-warning-main)', flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant='body2' sx={{ fontWeight: 600, color: 'warning.main' }}>
                  ร้านยังไม่ได้แจ้งเลขบัญชี
                </Typography>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.25 }}>
                  ทักแชทกับร้านเพื่อสอบถามวิธีโอนเงินได้เลย
                </Typography>
              </Box>
            </Box>
            <Box sx={{ mt: 1.5 }}>{contactShopAction}</Box>
          </Box>
        )}

        {/* ── บัญชีธนาคาร (เมื่อร้านตั้งไว้) ── */}
        {payoutSnapshot?.accountNo && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }} noWrap>
                  {bankLabel}
                </Typography>
                {/* 1.125rem = ขั้น Title ตาม DESIGN.md ramp (เดียวกับแถวยอดที่ต้องโอนด้านบน —
                    UX-Design-Spec §B7 ระบุว่า "เลขบัญชี (ใหญ่)"); tabular-nums ที่อนุญาต
                    (Hard Rule 5 exception) letterSpacing ตามที่สเปกระบุ */}
                <Typography
                  sx={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '.05em',
                    maxWidth: '100%',
                  }}
                  noWrap
                >
                  {payoutSnapshot.accountNo}
                </Typography>
              </Box>
              {/* 🛑 ห้าม size='small' — ปุ่มคัดลอก tracking เดิมเป็น small ต่ำกว่า 44px ตาม
                  PRODUCT.md (UX-Design-Spec §B7) */}
              {typeof navigator !== 'undefined' && navigator?.clipboard && (
                <Button
                  variant='tonal'
                  color='info'
                  onClick={() => handleCopyAccount(payoutSnapshot.accountNo!)}
                  aria-label='คัดลอกเลขบัญชี'
                  sx={{ flexShrink: 0, minHeight: 44, minWidth: 0 }}
                >
                  {copied ? <Icon icon='tabler-check' fontSize={16} /> : 'คัดลอก'}
                </Button>
              )}
            </Box>

            {payoutSnapshot.accountName && (
              <Box sx={{ minWidth: 0, mt: 1 }}>
                <Typography variant='caption' color='text.secondary'>
                  ชื่อบัญชี
                </Typography>
                <Typography variant='body2' sx={{ fontWeight: 600, maxWidth: '100%' }} noWrap>
                  {payoutSnapshot.accountName}
                </Typography>
              </Box>
            )}

            {/* ── "บัญชีนี้ผูกกับออเดอร์นี้ตั้งแต่สร้าง" (safepay-ux 2026-08-29) ─────────────
                ที่มา: /impeccable critique ชี้ว่ากลไกกันมิจฉาชีพที่แข็งที่สุดของฟีเจอร์นี้
                (`Order.payoutSnapshot` freeze ตั้งแต่ createOrder — หน้านี้อ่านจาก snapshot เสมอ
                ไม่เคย live-read จากร้าน) **มีอยู่จริงแต่ไม่เคยพูดออกมาสักคำ** ⇒ ผู้ซื้อเห็นแค่
                "เลขบัญชีลอย ๆ ในเว็บ" ซึ่งหน้าตาเหมือนกับที่มิจฉาชีพส่งมาในแชท
                = Product Principle 1 (show, don't tell) ที่ทำจริงแต่ไม่แสดง

                🛑 คำนี้ผ่าน ux แล้วและ **จงใจไม่ใช้คำว่า "ล็อก"/"ปลอดภัย"/"ยืนยันแล้ว"**:
                คำพวกนั้นถูกอ่านเป็น "Deep รับประกันว่าปลอดภัย" ได้ ซึ่งระบบทำไม่ได้ (เราไม่ได้ตรวจ
                ว่าบัญชีเป็นของร้านจริง ไม่มี escrow) — เข้าใจผิดแบบนั้นแย่กว่าไม่พูดเลย
                พูดแค่ *พฤติกรรมของระบบ* แล้วให้ผู้อ่านสรุปเองว่า "ถ้ามีคนบอกให้โอนบัญชีอื่น
                แปลว่าผิดปกติ" — ไม่ต้องใช้โทนเตือนภัย (PRODUCT.md: credibility ที่อบอุ่น)

                🛑 icon เป็น `lock` ไม่ใช่ `shield-*` แม้ไฟล์พี่น้องจะใช้โล่: โล่สื่อ "ได้รับการ
                ปกป้อง/ตรวจแล้ว" ซึ่งเกินจริง · สี neutral ล้วน ไม่ใช้เขียว (Verified-Means-Green
                — บัญชีนี้ไม่ได้ถูกยืนยันโดยใคร) และไม่ใช้ฟ้า (จะกลายเป็น badge เชิงบวกที่ไป
                แข่งกับ Verified chip จริงบนหน้าเดียวกัน)

                ไม่แสดงเมื่อ `isSettled` — จ่าย/ปิด/ยกเลิกแล้วไม่มีใครต้องโอนอีก ── */}
            {!isSettled && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 1.5 }}>
                <Icon
                  icon='tabler-lock'
                  fontSize={15}
                  style={{ marginTop: 2, flexShrink: 0, color: 'var(--mui-palette-text-secondary)' }}
                />
                <Typography variant='caption' color='text.secondary'>
                  บัญชีนี้ผูกกับออเดอร์นี้ตั้งแต่สร้าง ต่อให้ร้านเปลี่ยนบัญชีทีหลัง ที่นี่จะไม่เปลี่ยนตาม
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* ── QR พร้อมเพย์ — เฉพาะเมื่อ payload encode สำเร็จ (fail-closed, TFR-011) ──
            ตั้งบัญชีธนาคารแต่ไม่ตั้งพร้อมเพย์/เบอร์ผิดรูปแบบ = ไม่มี block นี้เลย ไม่ใช่กล่องว่าง
            impeccable critique P0-2: `!isSettled` ต้องมาก่อนเสมอ — ออเดอร์ที่ชำระ/ปิดงาน/ยกเลิก
            แล้วต้องไม่มี QR ที่สแกนจ่ายได้จริงให้เห็นเลย ไม่ใช่แค่ป้ายเล็กมุมบนบอกสถานะ */}
        {!isSettled && qrPayload && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25 }}>
              {/* พื้นขาวเสมอ (#fff ตรง ไม่ใช่ background.paper) — ต้องขาวจริงเพื่อสแกนติดแม้ dark
                  mode, pattern เดียวกับ OrderQrSheet.tsx ฝั่ง Paces (bg-white) */}
              <Box
                sx={{
                  /* 🛑 2 (12px) ไม่ใช่ 3 (18px) — ทุกกล่องบนหน้านี้ใช้ 12px เป็นค่าเดียว
                     (มีเทส `[blocker]` `public-order-radius-scale` บังคับไว้) · การ์ดใบนี้มาจาก
                     feature 00062 บน main ซึ่งตั้งค่าเองก่อนที่ชุดรัศมีของหน้าจะถูกรวมเป็นชุดเดียว
                     ⇒ ปรับตอน merge ไม่ใช่ผ่อนเกณฑ์ให้ค่าใหม่ */
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: '#fff',
                  p: 2,
                  display: 'inline-flex',
                }}
              >
                <QRCodeCanvas ref={qrCanvasRef} value={qrPayload} size={160} />
              </Box>
              <Typography variant='caption' color='text.secondary' sx={{ textAlign: 'center', px: 1 }}>
                สแกนแล้วยอด {baht.format(totalAmount)} จะขึ้นให้เอง — ไม่ต้องพิมพ์เลขบัญชีหรือยอดเงินเอง
              </Typography>
              <Button
                variant='tonal'
                color='secondary'
                onClick={handleSaveQr}
                startIcon={<Icon icon='tabler-download' fontSize={18} />}
                sx={{ minHeight: 44 }}
              >
                บันทึกรูป QR
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Card>
  )
}
