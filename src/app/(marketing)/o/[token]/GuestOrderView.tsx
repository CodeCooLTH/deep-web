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
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import { Icon } from '@iconify/react'

import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { resolveVerifyBadge, type VerifyBadgeTone } from '@/lib/verify-badge'
import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { formatOrderNo } from '@/lib/order-no'
import { formatDateTimeTH } from '@/lib/format-date'
import { ORDER_STATUS_TONE_TO_MUI } from '@/lib/order-display'
import { deriveShippingStage, resolveOrderStatusBadge } from '@/lib/order-stage'
import ParcelTimeline from './ParcelTimeline'
import ShopCover from './ShopCover'
import type { GuestOrderData } from './guest-order-data'

/**
 * Verified Ink — เขียวเข้มสำหรับ "ตัวหนังสือ" บนพื้นเขียวจาง
 *
 * 🛑 ห้ามใช้ success.main (#28C76F) เป็นสีตัวอักษร: บนพื้นจางได้ ~1.9–2.2:1 ซึ่งตก AA ไปไกล
 * ค่านี้คือเฉดเดียวกันแค่เข้มขึ้น (ไม่เปลี่ยนฮิว — docs/conventions/contrast-fix-keeps-hue.md)
 */
const VERIFIED_INK = '#18804A'

/**
 * ป้ายเล็กบนหัวโปรไฟล์ร้าน — ประกอบเองแทน MUI Chip variant='tonal'
 *
 * 🛑 ทำไมไม่ใช้ Chip: tonal ของธีมนี้ให้ text = {semantic}.main บนพื้น {semantic} จาง
 * ซึ่งวัดได้ 1.83–3.51:1 ทุกสี = ตก AA ทั้งชุด และป้ายพวกนี้แบก "ระดับการยืนยัน" กับ "tier"
 * ซึ่งเป็นสาระของจอนี้ทั้งจอ ไม่ใช่ของประดับที่อ่านไม่ออกก็ได้
 */
function TrustPill({
  tone,
  label,
  icon,
  tierColor,
}: {
  tone: VerifyBadgeTone | 'tier'
  label: string
  icon?: string
  tierColor?: string
}) {
  const palette =
    tone === 'green'
      ? { bg: 'rgba(40,199,111,0.15)', fg: VERIFIED_INK }
      : tone === 'gold'
        ? { bg: 'rgba(255,159,67,0.15)', fg: '#874C00' }
        : tone === 'neutral'
          ? { bg: 'rgba(47,43,61,0.08)', fg: 'rgba(47,43,61,0.75)' }
          : { bg: 'action.hover', fg: 'text.primary' }

  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.375,
        borderRadius: 999,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        bgcolor: palette.bg,
        color: tone === 'tier' && tierColor ? undefined : palette.fg,
        ...(tone === 'tier' && tierColor ? { color: `${tierColor}.dark` } : {}),
      }}
    >
      {icon && <Icon icon={icon} fontSize={14} />}
      {label}
    </Box>
  )
}

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

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

  const verifyBadge = resolveVerifyBadge(order.maxVerifyLevel)
  const hasStats = order.completedOrders != null || order.avgRating != null

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
        {/* ── Hero — ปกใช้ร่วมกับจอหลังล็อกอิน (ShopCover) ── */}
        {/* 🛑 ส่ง isNewShop แยก ไม่ใช่ completionRate — ร้านที่ยังไม่มีออเดอร์จบต้องไม่ได้
            แบนเนอร์ไล่สีที่หน้าตาเหมือนรางวัล (ดูเหตุผลเต็มที่ prop ของ ShopCover) */}
        <ShopCover trustScore={order.shop.user.trustScore} isNewShop={order.completedOrders == null} />
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
            noWrap
            title={order.shop.shopName}
            sx={{ display: 'block', textDecoration: 'none', color: 'text.primary', fontWeight: 800, mt: 1 }}
          >
            {order.shop.shopName}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            @{order.shop.user.username}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap' }}>
            {/* 🛑 ป้ายบอก "ระดับที่ยืนยันถึง" ไม่ใช่คำว่ายืนยันแล้วลอย ๆ — ร้านที่ทำแค่ OTP
                ไม่ควรได้ป้ายเดียวกับร้านที่จดทะเบียนธุรกิจ บนจอที่ตัดสินว่าเงินจะโอนหรือไม่
                คำ+โทนมาจาก SSOT เดียวกับหน้า sign-in ที่ผู้ซื้อจะเห็นต่อในอีกไม่กี่วินาที */}
            {/* ต่อ "(ระดับ N)" ท้าย label — สำนวนเดียวกับที่ AboutOverview ใช้อยู่แล้ว ไม่ตั้งคำใหม่ (HR16)
                เหตุผล: "ยืนยันเบอร์แล้ว" กับ "จดทะเบียนธุรกิจแล้ว" อ่านเผิน ๆ เป็นน้ำหนักพอกัน
                ทั้งที่คนละชั้นความยากมาก ตัวเลขระดับคือสิ่งที่บอกสเกลให้ผู้ซื้อเทียบได้ */}
            {verifyBadge && (
              <TrustPill
                tone={verifyBadge.tone}
                icon={verifyBadge.icon}
                label={`${verifyBadge.label} (ระดับ ${order.maxVerifyLevel})`}
              />
            )}
            <TrustPill tone='tier' tierColor={tierColor} label={tierLabel} />
          </Box>

          {/* ── หลักฐานของร้าน ── ไหลต่อในบล็อกเดียวกัน ไม่ทำเป็นการ์ดแยก
              เพื่อไม่ให้แข่งความสำคัญกับการ์ดออเดอร์ และไม่เพิ่ม eyebrow เป็นจุดที่ 12 ของหน้า
              (DESIGN.md ระบุ "eyebrow เหนือทุก section" เป็น anti-reference ตรงตัว) */}
          {hasStats && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'stretch',
                gap: 3,
                mt: 2,
                pt: 2,
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              {order.completedOrders != null && (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant='h6' sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                    {order.completedOrders.toLocaleString('th-TH')}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    ออเดอร์สำเร็จ
                  </Typography>
                </Box>
              )}
              {order.completedOrders != null && order.avgRating != null && (
                <Divider orientation='vertical' flexItem />
              )}
              {order.avgRating != null && (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant='h6' sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                    {order.avgRating}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    จาก {order.reviewCount.toLocaleString('th-TH')} รีวิว
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* ช่องทางที่ร้านเชื่อมไว้ — ตอบคำถาม "นี่ร้านเดียวกับที่เพิ่งคุยด้วยไหม"
              ซึ่งเป็นคำถามแรกของคนที่ได้ลิงก์มาจากแชท ไม่ใช่ของประดับ */}
          {order.channels.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              {order.channels.map((ch) => (
                <Box key={`${ch.provider}-${ch.name}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: 1.5,
                      flexShrink: 0,
                      overflow: 'hidden',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                    }}
                  >
                    {ch.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.avatarUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : ch.provider === 'INSTAGRAM' ? (
                      'IG'
                    ) : (
                      'f'
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                      {ch.name}
                    </Typography>
                    {/* text.secondary ไม่ใช่ text.disabled — ชนิดช่องทางเป็นข้อมูลจริง
                        ไม่ใช่สถานะปิดใช้งาน และ disabled อยู่ที่ ~2.3:1 ซึ่งตก AA */}
                    <Typography variant='caption' color='text.secondary'>
                      {ch.provider === 'INSTAGRAM' ? 'Instagram' : 'Facebook Page'}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {/* รีวิวจริงหนึ่งอัน — ข้อความจากคนซื้อจริงน่าเชื่อกว่าค่าเฉลี่ยลอย ๆ
              ไม่มีรีวิวที่เขียนข้อความ → ซ่อนบล็อก ไม่แต่งคำชมเอง */}
          {order.latestReview && (
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.5, mt: 2, textAlign: 'left' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {/* carve-out HR12: typographic dingbat สีเดียว (★) ไม่ใช่ emoji */}
                <Box component='span' sx={{ color: 'warning.dark', fontSize: '0.8125rem', letterSpacing: '0.15em' }}>
                  {'★'.repeat(order.latestReview.rating)}
                </Box>
                <Box
                  component='span'
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: VERIFIED_INK,
                    bgcolor: 'rgba(40,199,111,0.15)',
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.75,
                  }}
                >
                  ซื้อจริง
                </Box>
              </Box>
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {order.latestReview.comment}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── สถานะ ── */}
        <Box sx={{ bgcolor: 'background.paper', px: 2.25, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrustPill tone='tier' tierColor={ORDER_STATUS_TONE_TO_MUI[badge.tone]} label={badge.label} />
          <Typography variant='caption' color='text.secondary' sx={{ ml: 'auto' }}>
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
                <ParcelTimeline stage={stage} hasShipment={!!order.shipmentTracking} />
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
                <Typography variant='overline' color='text.secondary' sx={{ display: 'block', mb: 0.75 }}>
                  ข้อมูลผู้รับ
                </Typography>
                {/* 🛑 จุดไข่ปลาที่ไม่มีคำอธิบาย อ่านได้ว่า "เว็บนี้ปิดบังอะไรอยู่" ไม่ใช่ "กำลังปกป้องฉัน"
                    ซึ่งกลับหัวกับเจตนาพอดี — คนที่เปิดหน้านี้คือคนที่กลัวโดนโกงอยู่แล้ว
                    บอกเหตุผล + บอกทางออกในประโยคเดียว เปลี่ยนสิ่งที่ดูน่าสงสัยที่สุดในหน้า
                    ให้กลายเป็นหลักฐานว่าระบบทำงานอยู่ */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 1.25 }}>
                  <Icon icon='tabler-shield-lock' fontSize={15} style={{ marginTop: 2, flexShrink: 0, color: VERIFIED_INK }} />
                  <Typography variant='caption' color='text.secondary'>
                    ปกป้องข้อมูลของคุณ — แสดงบางส่วนจนกว่าจะเข้าสู่ระบบด้วยเบอร์ที่ใช้สั่งซื้อ
                  </Typography>
                </Box>
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
          pt: 1.5,
          // 🛑 (marketing)/layout.tsx ตั้ง viewportFit:'cover' แล้ว env() จึงคืนค่าจริงบนเส้นทางนี้
          // แถบ fixed ของจอที่ล็อกอินแล้วใส่ไว้ถูก แต่แถบนี้ (จอแรกที่ผู้ซื้อทุกคนเจอ) ไม่มีเลย
          // ⇒ บน iPhone ที่มีแถบ home indicator ปุ่มหลักไปนอนอยู่ใต้แถบนั้น
          pb: 'calc(12px + max(0px, env(safe-area-inset-bottom)))',
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
