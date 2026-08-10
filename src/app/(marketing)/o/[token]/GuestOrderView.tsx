'use client'

/**
 * GuestOrderView — หน้าออเดอร์สำหรับผู้ที่ยังไม่ล็อกอิน (feature 00041, มติ D-1 ของ user)
 *
 * Base: src/app/(marketing)/o/[token]/OrderDetailMobile.tsx
 *   (hero/ProfileBanner + status line + การ์ดรายการสินค้า + โครง MUI ทั้งหมด)
 *   ยกโครงมาแล้วตัดทุกอย่างที่ต้องล็อกอินออก เหลือแค่ "อ่านอย่างเดียว"
 *
 * ทำไมแยกไฟล์แทนใส่เงื่อนไขใน OrderDetailMobile (พันกว่าบรรทัด): ทั้งสองมุมมองต่างกันที่
 * **ชุดข้อมูลที่รับเข้ามา** ไม่ใช่แค่ปุ่มที่ซ่อน — guest รับ GuestOrderData ที่ mask แล้วและ
 * ไม่มีสลิป/ชื่อผู้ซื้อ/ลิงก์เข้าถึงอยู่ในนั้นเลย การยัดเข้าไฟล์เดียวจะทำให้ต้องมี field
 * optional เต็มไปหมดแล้วเผลอ render ของที่ guest ไม่ควรเห็นได้ง่ายมาก
 *
 * 🛑 ทุกปุ่มที่ผูกตัวตนที่นี่เป็น "ลิงก์ไปหน้า login" ไม่ใช่ปุ่มที่ยิง API — ห้ามมี mutation
 * ใด ๆ จากมุมมองนี้ (BR-BOE-06/07; ต่อให้มี server ก็ปฏิเสธอยู่แล้ว แต่ UI ต้องไม่หลอกให้กด)
 */

import Link from 'next/link'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import { Icon } from '@iconify/react'

import { ProfileBanner } from '@/views/pages/user-profile/UserProfileHeader'
import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { formatOrderNo } from '@/lib/order-no'
import { formatDateTimeTH } from '@/lib/format-date'
import { ORDER_STATUS_TONE_TO_MUI } from '@/lib/order-display'
import { deriveShippingStage, resolveOrderStatusBadge, ORDER_STAGE_META } from '@/lib/order-stage'
import type { GuestOrderData } from './guest-order-data'

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** 4 จุดของ timeline พัสดุ — ลำดับเดียวกับ MiniShipmentTimeline ฝั่งร้าน (BR-BOE-12) */
const PARCEL_STEPS = [
  { key: 'PARCEL_CREATED', label: 'สร้างพัสดุ' },
  { key: 'LABEL_PRINTED', label: 'รับเข้าระบบแล้ว' },
  { key: 'SHIPPING', label: 'กำลังจัดส่ง' },
  { key: 'DELIVERED', label: 'จัดส่งสำเร็จ' },
] as const

function ParcelTimeline({ stage }: { stage: string }) {
  const problem = stage === 'PARCEL_PROBLEM'
  const idx = PARCEL_STEPS.findIndex((s) => s.key === stage)
  // stage ที่ไม่อยู่ในแถบนี้ (ORDERED/COMPLETED/CANCELLED) → ยังไม่เริ่มเดิน ไม่ใช่ error
  const current = idx === -1 ? (problem ? 2 : 0) : idx

  return (
    <Box>
      {problem && (
        <Typography
          variant='caption'
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.main', fontWeight: 700, mb: 1 }}
        >
          <Icon icon='tabler-alert-triangle' fontSize={15} />
          {ORDER_STAGE_META.PARCEL_PROBLEM.label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        {PARCEL_STEPS.map((step, i) => {
          const done = i < current
          const isCurrent = i === current && !problem
          return (
            <Box key={step.key} sx={{ flex: 1, textAlign: 'center', position: 'relative' }}>
              {i > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    left: '-50%',
                    width: '100%',
                    height: 2,
                    // Verified-Means-Green: เขียวเฉพาะช่วงที่ "ผ่านไปแล้วจริง"
                    bgcolor: i <= current && !problem ? 'success.main' : 'divider',
                  }}
                />
              )}
              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  mx: 'auto',
                  mb: 0.75,
                  bgcolor: problem && i === current ? 'error.main' : done ? 'success.main' : isCurrent ? 'primary.main' : 'divider',
                  boxShadow: isCurrent ? (theme) => `0 0 0 4px ${theme.palette.primary.main}22` : 'none',
                }}
              />
              <Typography
                variant='caption'
                sx={{
                  display: 'block',
                  lineHeight: 1.35,
                  fontSize: '0.66rem',
                  fontWeight: isCurrent || done ? 700 : 400,
                  color: isCurrent ? 'primary.main' : done ? 'success.dark' : 'text.disabled',
                }}
              >
                {step.label}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export default function GuestOrderView({ order }: { order: GuestOrderData }) {
  const loginHref = `/auth/sign-in?callbackUrl=${encodeURIComponent(`/o/${order.publicToken}`)}`
  const badge = resolveOrderStatusBadge(order.status)
  const tierLabel = getTierLabel(order.shop.user.trustScore)
  const tierColor = getTierColor(order.shop.user.trustScore)

  const stage = deriveShippingStage({
    status: order.status,
    carrierStatus: order.carrierStatus,
    hasShipment: !!order.shipmentTracking,
    paymentMethod: order.paymentMethod,
    codReceivedAt: null,
  })

  const isClosed = order.status === 'CONFIRMED' || order.status === 'CANCELLED'
  const ctaLabel = isClosed ? 'เข้าสู่ระบบเพื่อดูรายละเอียดคำสั่งซื้อ' : 'เข้าสู่ระบบเพื่อยืนยันรับสินค้า'

  /**
   * ยิงบันทึกว่า "เริ่ม auth flow จากลิงก์ออเดอร์" แบบ fire-and-forget ก่อนเปลี่ยนหน้า
   * ไม่ await และไม่สนใจผลลัพธ์ — endpoint คืน 204 เสมอ (ครึ่งแรกของ Login Completion Rate)
   */
  const pingAuthFlow = (method: 'facebook' | 'phone_otp' | 'other') => {
    void fetch(`/api/orders/${order.publicToken}/auth-flow/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method }),
      keepalive: true, // ต้องส่งให้จบแม้หน้ากำลังจะถูกเปลี่ยน
    }).catch(() => {})
  }

  // HR2: ห้าม component={Link} ดิบ — ใช้ LinkButton wrapper ของโปรเจกต์
  const LoginLink = ({ children, ...rest }: Omit<React.ComponentProps<typeof LinkButton>, 'href'>) => (
    <LinkButton href={loginHref} onClick={() => pingAuthFlow('other')} {...rest}>
      {children}
    </LinkButton>
  )

  return (
    <Box sx={{ pb: 14 }}>
      <Box sx={{ maxWidth: { xs: '100%', 'min-[768px]': 720 }, mx: 'auto' }}>
        {/* ── Hero — ยกจาก OrderDetailMobile ── */}
        <ProfileBanner data={{ trustScore: order.shop.user.trustScore }} bannerHeight={104} />
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, pb: 2, textAlign: 'center' }}>
          <Box
            sx={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              border: '4px solid',
              borderColor: 'background.paper',
              bgcolor: 'action.hover',
              mx: 'auto',
              mt: '-42px',
              display: 'grid',
              placeItems: 'center',
              fontSize: 26,
              fontWeight: 800,
              color: 'text.disabled',
              overflow: 'hidden',
            }}
          >
            {order.shop.user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={order.shop.user.avatar} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              order.shop.shopName.slice(0, 1)
            )}
          </Box>

          <Typography
            component={Link}
            href={`/u/${order.shop.user.username}`}
            variant='h6'
            sx={{ display: 'block', textDecoration: 'none', color: 'text.primary', fontWeight: 800, mt: 1 }}
          >
            {order.shop.shopName}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            @{order.shop.user.username}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap' }}>
            {order.maxVerifyLevel >= 1 && (
              <Chip
                size='small'
                variant='tonal'
                color='success'
                icon={<Icon icon='tabler-rosette-discount-check-filled' fontSize={14} />}
                label='ยืนยันแล้ว'
              />
            )}
            <Chip size='small' variant='tonal' color={tierColor} label={tierLabel} />
          </Box>
        </Box>

        {/* ── สถานะ ── */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip size='small' variant='tonal' color={ORDER_STATUS_TONE_TO_MUI[badge.tone]} label={badge.label} />
          <Typography variant='caption' color='text.disabled' sx={{ ml: 'auto' }}>
            {formatOrderNo(order.publicToken, order.createdAtIso)} · {formatDateTimeTH(order.createdAtIso)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, px: 1.5, pt: 1.5 }}>
          {/* ── การจัดส่ง + timeline พัสดุ ── */}
          {order.shipmentTracking && (
            <Card>
              <CardContent>
                <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1 }}>
                  การจัดส่ง
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1 }}>
                  <Typography variant='body2' color='text.secondary'>
                    {order.shipmentTracking.provider}
                  </Typography>
                  <Typography variant='body2' sx={{ fontWeight: 700 }}>
                    {order.shipmentTracking.trackingNo}
                  </Typography>
                </Box>
                <ParcelTimeline stage={stage} />
              </CardContent>
            </Card>
          )}

          {/* ── รายการสินค้า ── */}
          <Card>
            <CardContent>
              <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1 }}>
                รายการสินค้า
              </Typography>
              {order.items.map((it) => (
                <Box key={it.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1 }}>
                  <Box
                    sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: 'action.hover', flex: 'none', overflow: 'hidden' }}
                  >
                    {it.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.imageUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                      {it.name}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      x{it.qty}
                    </Typography>
                  </Box>
                  <Typography variant='body2' sx={{ fontWeight: 600, ml: 'auto', whiteSpace: 'nowrap' }}>
                    {baht.format(it.price * it.qty)}
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant='body2' color='text.secondary'>
                  ยอดรวม
                </Typography>
                <Typography variant='h6' sx={{ fontWeight: 800 }}>
                  {baht.format(order.totalAmount)}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* ── ข้อมูลผู้รับ (mask แล้วที่ server) ── */}
          {(order.maskedPhone || order.maskedShippingAddress) && (
            <Card>
              <CardContent>
                <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1 }}>
                  ข้อมูลผู้รับ
                </Typography>
                {/* ไม่มีเบอร์ → ไม่ render แถวนี้เลย ไม่ใช่แสดงคำว่า "ไม่ระบุ" */}
                {order.maskedPhone && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
                    <Typography variant='body2' color='text.secondary'>
                      เบอร์ผู้รับ
                    </Typography>
                    <Typography variant='body2' sx={{ fontWeight: 600, letterSpacing: '.05em' }}>
                      {order.maskedPhone}
                    </Typography>
                  </Box>
                )}
                {order.maskedShippingAddress && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
                    <Typography variant='body2' color='text.secondary' sx={{ flex: 'none' }}>
                      ที่อยู่จัดส่ง
                    </Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant='body2' sx={{ fontWeight: 600 }}>
                        จ.{order.maskedShippingAddress.province}
                      </Typography>
                      <Typography variant='caption' color='text.secondary' sx={{ letterSpacing: '.05em' }}>
                        {order.maskedShippingAddress.line1} {order.maskedShippingAddress.subdistrict}{' '}
                        {order.maskedShippingAddress.district} {order.maskedShippingAddress.postcode}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── ความช่วยเหลือ — ปุ่มพาไป login ทั้งคู่ (BR-BOE-16/13) ──
              "ติดต่อร้านค้า" แสดงทุกสถานะ · "ยังไม่ได้รับสินค้า" ซ่อนเมื่อออเดอร์ปิดจบแล้ว
              (ไม่ทิ้งปุ่มเทา disabled ไว้ — ไม่มีเหตุผลทางธุรกิจให้แจ้งปัญหาอีก) */}
          <Card>
            <CardContent>
              <Typography variant='overline' color='text.disabled' sx={{ display: 'block', mb: 1 }}>
                ต้องการความช่วยเหลือ?
              </Typography>
              <LoginLink
                fullWidth
                variant='outlined'
                color='secondary'
                startIcon={<Icon icon='tabler-headset' fontSize={18} />}
              >
                ติดต่อร้านค้า
              </LoginLink>
              {!isClosed && (
                <Box sx={{ mt: 1.25 }}>
                  <LoginLink variant='text' color='secondary' size='small'>
                    ยังไม่ได้รับสินค้า?
                  </LoginLink>
                  <Typography variant='caption' color='text.disabled' sx={{ display: 'block' }}>
                    แจ้งร้านค้าว่าคำสั่งซื้อนี้มีปัญหา
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          <Typography variant='caption' color='text.disabled' sx={{ textAlign: 'center', py: 1 }}>
            ปกป้องการซื้อขายโดย Deep
          </Typography>
        </Box>
      </Box>

      {/* ── CTA ล่างจอ — จุดเดียวที่พาไป login เป็นหลัก ── */}
      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          px: 2,
          py: 1.5,
          zIndex: 10,
        }}
      >
        <Box sx={{ maxWidth: { xs: '100%', 'min-[768px]': 720 }, mx: 'auto' }}>
          <LinkButton href={loginHref} onClick={() => pingAuthFlow('other')} fullWidth variant='contained' size='large'>
            {ctaLabel}
          </LinkButton>
          <Typography variant='caption' color='text.disabled' sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}>
            ต้องเข้าสู่ระบบก่อนยืนยัน แนบสลิป เขียนรีวิว หรือแจ้งปัญหา
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
