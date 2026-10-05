'use client'

/**
 * ShopInfoCard — การ์ด "หลักฐานของร้าน" ของหน้าออเดอร์ผู้ซื้อ `/o/[token]` (feature 00068 · TFR-002 · D-1)
 *
 * ตอบคำถามเดียว: "ร้านนี้มีตัวตนและประวัติจริงไหม" — เรียงแบบสลิปเดียวกับจอเปลี่ยนผ่าน `SmsAutoEnter`
 * (ป้ายซ้าย · เส้นจุดนำสายตา · ค่าขวา) ผู้ซื้อจึงเห็นภาษาเดียวกันตั้งแต่ลิงก์ SMS
 *
 * 🛑 แถวที่ไม่มีข้อมูลไม่แสดง ไม่มีเลข 0 (D-11/BR-BOP-14) · "ออเดอร์สำเร็จ" ซ่อนเมื่อไม่ > 0
 * 🛑 พิล "ร้านใหม่ · ยังไม่มีประวัติเพียงพอ" ตัดสินด้วย `isNewShop` จาก payload (SSOT เดียวกับที่เคยคุมปก)
 *    ไม่ใช่ `completedOrders == null` — ตัวนั้นไม่จับกรณี 0 · โทน neutral เท่านั้น (ร้านใหม่ไม่ใช่ความผิดปกติ ห้ามเขียว/แดง)
 * 🛑 คำของป้ายตรง SSOT: ป้ายยืนยันจาก `verify-badge.ts` · ชื่อ tier จาก `getTierLabel` (`Tier Lists.md`)
 *    ห้ามตั้ง mapping tier เองที่นี่ · แถว "ชั้นความน่าเชื่อถือ" เป็นป้ายแถวที่ UX ตั้งเอง (Q10 รอ user ยืนยัน)
 * 🛑 ตัวเลขทั้งหมดเป็นของ "ร้าน" ไม่ใช่ PII ผู้ซื้อ · ช่องทางส่งมา 5 คีย์เท่านั้น (AC-BOP-03-4)
 *
 * presentational ล้วน — ข้อมูลทั้งหมดมาจาก shell ผ่าน props · ใช้ซ้ำ ShopChannels / TrustPill /
 * BrandHomeLink / shouldShowOrderOrigin ของเดิม ไม่เขียนตรรกะซ้ำ (HR16)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx (โครงโปรไฟล์ร้าน — ข้อมูลร้านใต้หัว)
 *   + src/app/(marketing)/o/[token]/SmsAutoEnter.tsx (dl เส้นจุด) + ShopEvidence.tsx (ShopChannels)
 */
import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import NextLink from 'next/link'
import { Icon } from '@iconify/react'

import { buildShopSummaryLine } from '@/lib/buyer-order-summary'
import { getChannelLabel } from '@/lib/chat-channel'
import { shouldShowOrderOrigin } from '@/lib/order-display'
import { getTierColor, getTierLabel } from '@/lib/trust-tier'
import { resolveVerifyBadge } from '@/lib/verify-badge'
import { isRenderableChannel } from '@/views/pages/user-profile/v2/OfficialChannels'

import BrandHomeLink from './BrandHomeLink'
import { cardBodySx } from './card-padding'
import { ShopChannels, type ShopEvidenceData } from './ShopEvidence'
import TrustPill from './TrustPill'

type Props = {
  username: string
  /** คะแนนความน่าเชื่อถือ → ชื่อ tier ผ่าน `getTierLabel` */
  trustScore: number
  maxVerifyLevel: number
  /** payload `isNewShop` — ร้านยังไม่มีออเดอร์จบสักใบ */
  isNewShop: boolean
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  channels: ShopEvidenceData['channels']
  /** เพจที่ออเดอร์ใบนี้เกิดขึ้น (feature 00050) — null = ไม่ทราบ */
  originPage: { channel: string; pageName: string | null; pageAvatarUrl: string | null } | null
}

/**
 * แถวสลิป: ไอคอน + ป้าย · เส้นจุดนำสายตา · ค่า — ประกาศระดับ module ไม่ใช่ในตัว render
 * (ประกาศใน render = identity ใหม่ทุกรอบ ลูกถูก unmount/mount ซ้ำ)
 */
function Row({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', fontSize: '0.9375rem' }}>
      <Icon icon={icon} fontSize={18} aria-hidden='true' style={{ color: 'var(--mui-palette-text-secondary)', marginRight: 8, flexShrink: 0 }} />
      <Box component='dt'>{label}</Box>
      <Box aria-hidden='true' sx={{ flex: 1, borderBottom: '1.5px dotted', borderColor: 'divider', mx: 2, mb: '5px' }} />
      <Box component='dd' sx={{ m: 0, textAlign: 'right' }}>
        {children}
      </Box>
    </Box>
  )
}

export default function ShopInfoCard({
  username,
  trustScore,
  maxVerifyLevel,
  isNewShop,
  completedOrders,
  avgRating,
  reviewCount,
  channels,
  originPage,
}: Props) {
  const verifyBadge = resolveVerifyBadge(maxVerifyLevel)
  // เงื่อนไข "มีค่าให้พูด" ใช้ฟังก์ชันเดียวกับบรรทัดย่อบนหัว (D-11) — ไม่เขียน `> 0` ซ้ำที่นี่
  // ส่งทีละช่องให้ฟังก์ชันตัดสิน: ไม่ null = ช่องนั้นผ่านเกณฑ์
  const hasOrders = buildShopSummaryLine({ avgRating: null, completedOrders }) !== null
  const hasRating = buildShopSummaryLine({ avgRating, completedOrders: null }) !== null

  const origin = originPage ? { provider: originPage.channel, name: originPage.pageName } : null
  const renderable = channels.filter((c) => isRenderableChannel(c.provider))
  // นับเฉพาะช่องทางที่แถบวาดได้จริง — ตัวที่ไม่รู้จักถูกทิ้งเงียบ ไม่งั้นชื่อเพจจะซ้ำสองบรรทัด
  const showOrigin = originPage != null && shouldShowOrderOrigin(origin, renderable.map((c) => ({ provider: c.provider, name: c.name })))

  return (
    <Card component='section' aria-labelledby='shop-info-title' sx={{ ...cardBodySx, borderRadius: '12px 12px 0 0' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pb: 2, borderBottom: '1.5px dashed', borderColor: 'divider' }}>
        {/* ตราที่รับรอง อยู่บนสิ่งที่มันรับรอง · พื้นที่แตะ 44 มาจาก CoverPill */}
        <BrandHomeLink />
        <Typography id='shop-info-title' component='h2' variant='caption' color='text.secondary'>
          หลักฐานของร้าน
        </Typography>
      </Box>

      {isNewShop && (
        <Box sx={{ pt: 3 }}>
          <TrustPill tone='neutral' label='ร้านใหม่ · ยังไม่มีประวัติเพียงพอ' />
        </Box>
      )}

      <Box component='dl' sx={{ m: 0, pt: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {verifyBadge && (
          <Row icon={verifyBadge.icon} label={verifyBadge.label}>
            <TrustPill tone={verifyBadge.tone} label={`ระดับ ${maxVerifyLevel}`} />
          </Row>
        )}
        {hasOrders && completedOrders != null && (
          <Row icon='tabler-circle-check' label='ออเดอร์สำเร็จ'>
            <b>{completedOrders.toLocaleString('th-TH')} ครั้ง</b>
          </Row>
        )}
        {hasRating && avgRating != null && (
          <Row icon='tabler-star' label='คะแนนรีวิว'>
            <b>{avgRating.toFixed(1)}</b>
            <Box component='span' sx={{ color: 'text.secondary' }}>
              {' '}
              · {reviewCount.toLocaleString('th-TH')} รีวิว
            </Box>
          </Row>
        )}
        <Row icon='tabler-shield-check' label='ชั้นความน่าเชื่อถือ'>
          <TrustPill tone='tier' tierColor={getTierColor(trustScore)} label={getTierLabel(trustScore)} />
        </Row>
        <Row icon='tabler-at' label='ชื่อผู้ใช้'>
          @{username}
        </Row>
      </Box>

      {channels.length > 0 && (
        <Box sx={{ pt: 3 }}>
          <ShopChannels channels={channels} originChannel={origin} variant='rows' />
        </Box>
      )}

      {showOrigin && originPage && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 2 }}>
          {originPage.pageAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (OAuth/CDN)
            <img src={originPage.pageAvatarUrl} alt='' width={20} height={20} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <Icon icon='tabler-message-circle' fontSize={16} aria-hidden='true' style={{ color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
          )}
          <Typography variant='caption' color='text.secondary' sx={{ minWidth: 0 }} noWrap>
            จากการคุยที่ {originPage.pageName ?? getChannelLabel(originPage.channel)}
          </Typography>
        </Box>
      )}

      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', pt: 3 }}>
        ตัวเลขจากระบบ Deep ร้านแก้เองไม่ได้
      </Typography>

      <Button
        component={NextLink}
        href={`/u/${username}`}
        variant='outlined'
        color='primary'
        fullWidth
        /* ลูกศรท้ายปุ่ม = ภาษาของ "ไปที่อื่น" (กดแล้วออกจากหน้าออเดอร์) */
        endIcon={<Icon icon='tabler-chevron-right' fontSize={16} />}
        sx={{ mt: 3, minHeight: 44 }}
      >
        ดูโปรไฟล์ร้าน
      </Button>
    </Card>
  )
}
