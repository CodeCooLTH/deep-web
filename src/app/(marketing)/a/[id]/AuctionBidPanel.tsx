'use client'

/**
 * AuctionBidPanel — แถบเสนอราคาแบบ one-tap / ซื้อทันที (feature 00004, Concept 1 redesign 2026-07-02
 *   + feat 00007 item 1 block-self-outbid + item 4 price flash)
 *
 * เดิมมี quick-multiplier chips (+increment×1/×2/×4) + custom-amount TextField — ตัดออกทั้งหมดตาม
 * resolved decision #1 (mockup ล็อกแล้ว): บิด = 1 แตะ ยิงที่ currentPrice+bidIncrement ตรง ๆ เสมอ
 * เพิ่ม: ลิงก์ pull-up "ดูรายละเอียดสินค้า" (เปิด AuctionDetailSheet ที่ parent), แถบราคา+นับถอยหลัง
 * (ย้าย countdown มาจาก AuctionHero.tsx เดิมที่ตัด HUD ออกแล้ว) — ปุ่มติดตาม (watching) ยกขึ้นไปเป็น
 * controlled prop จาก AuctionDetailClient (ใช้ร่วมกับหัวใจใน AuctionActionRail ต้องเป็น state เดียวกัน)
 *
 * feat 00007 item 1: youAreHighestBidder → disable ปุ่มเสนอราคา + label "คุณเป็นผู้เสนอราคาสูงสุด" (buy-now ยังกดได้)
 * feat 00007 item 4: price flash animation ที่ตัวเลขราคา (ย้ายมาจาก hero HUD เดิม เพราะราคาอยู่แถบนี้แล้ว)
 *
 * Base (logic pattern — fetch→toast→optimistic): src/app/(paces)/seller/(dashboard)/auctions/[id]/components/useAuctionActions.ts
 * Visual ref (asset เท่านั้น): docs/mockups/auction/buyer-auction-concept1-flow.html .barwrap/.prow/.go
 *
 * ไม่ login → กด action ใด ๆ → router.push('/auth/sign-in?callbackUrl=/a/{id}') ทันที
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import type { PublicAuctionDTO } from '@/services/auction.service'
// feature 00015 FR-OCL-10: บัญชี FB ที่ยังไม่มีเบอร์ → backend คืน 403 PHONE_NOT_VERIFIED ก่อนวางบิด/ซื้อทันที
import BidPhoneVerifyDialog from './BidPhoneVerifyDialog'

type Props = {
  auctionId: string
  currentPrice: number
  bidIncrement: number
  buyNowPrice: number | null
  bidCount: number
  endTimeMs: number
  antiSnipeCount: number
  watching: boolean
  watchLoading: boolean
  onToggleWatch: () => void
  /** true = ยังไม่มี sheet/modal ไหนเปิดอยู่ — โชว์ลิงก์ pull-up (mockup: หายไปตอน sheet เปิด) */
  showDetailLink: boolean
  onOpenDetailSheet: () => void
  /** feat 00007 item 1: viewer เป็นผู้เสนอสูงสุด → disable ปุ่มเสนอราคา (buy-now ยังกดได้) */
  youAreHighestBidder?: boolean
  /** parent (AuctionDetailClient) อัปเดต local state จาก DTO ที่ได้กลับมาหลังบิด/ซื้อทันทีสำเร็จ */
  onBidSuccess: (auction: PublicAuctionDTO) => void
}

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export default function AuctionBidPanel({
  auctionId,
  currentPrice,
  bidIncrement,
  buyNowPrice,
  bidCount,
  endTimeMs,
  antiSnipeCount,
  watching,
  watchLoading,
  onToggleWatch,
  showDetailLink,
  onOpenDetailSheet,
  youAreHighestBidder = false,
  onBidSuccess,
}: Props) {
  const { status: sessionStatus } = useSession()
  const router = useRouter()

  const minNext = currentPrice + bidIncrement
  const [bidding, setBidding] = useState(false)

  const [buyNowOpen, setBuyNowOpen] = useState(false)
  const [buyNowLoading, setBuyNowLoading] = useState(false)

  // feature 00015 FR-OCL-10: modal ยืนยันเบอร์โทร + จำ action เดิมไว้ auto-retry หลังตั้งเบอร์สำเร็จ
  const [phoneVerifyOpen, setPhoneVerifyOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'bid' | 'buyNow' | null>(null)

  // countdown ticking (ย้ายมาจาก AuctionHero.tsx เดิม — แสดงเป็น timepill ในแถบราคาแทน HUD บนรูป)
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const remainMs = endTimeMs - now
  const isUnderHour = remainMs > 0 && remainMs < 60 * 60 * 1000

  // feat 00007 item 4: flash ราคาเมื่อเปลี่ยน (skip mount แรก)
  const [priceFlash, setPriceFlash] = useState(false)
  const prevPriceRef = useRef(currentPrice)
  useEffect(() => {
    if (prevPriceRef.current !== currentPrice) {
      setPriceFlash(true)
      const t = setTimeout(() => setPriceFlash(false), 550)
      prevPriceRef.current = currentPrice
      return () => clearTimeout(t)
    }
  }, [currentPrice])

  /** ยังไม่ login → เด้ง sign-in ทันที (callbackUrl พากลับมาหน้านี้หลัง login สำเร็จ) — คืน true = ถูกเด้งแล้ว */
  function requireLogin(): boolean {
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(`/a/${auctionId}`)}`)
      return true
    }
    return false
  }

  async function handleBid() {
    if (requireLogin()) return
    if (youAreHighestBidder) return // feat 00007 item 1: กันบิดซ้ำตัวเอง (defense-in-depth คู่กับ disable)
    setBidding(true)
    try {
      const res = await fetch(`/api/auctions/${auctionId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: minNext }),
      })
      const data = await res.json()
      if (!res.ok) {
        // feature 00015 FR-OCL-10: ยังไม่มีเบอร์ verified — เปิด modal ตั้งเบอร์ก่อน toast error ทั่วไป
        if (res.status === 403 && data.code === 'PHONE_NOT_VERIFIED') {
          setPendingAction('bid')
          setPhoneVerifyOpen(true)
          return
        }
        toast.error(data.error ?? 'เสนอราคาไม่สำเร็จ')
        if (res.status === 409) {
          // ราคาขยับไปแล้วจากคนอื่น (race) — sync ราคาล่าสุดจาก public endpoint กัน UI ค้างเลขเก่า (feat 00007 item 2)
          fetch(`/api/app/auctions/${auctionId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((fresh) => {
              if (fresh) onBidSuccess(fresh as PublicAuctionDTO)
            })
            .catch(() => {})
        }
        return
      }
      toast.success('เสนอราคาสำเร็จ')
      onBidSuccess(data as PublicAuctionDTO)
    } catch {
      toast.error('เสนอราคาไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBidding(false)
    }
  }

  async function handleBuyNow() {
    setBuyNowLoading(true)
    try {
      const res = await fetch(`/api/auctions/${auctionId}/buy-now`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        // feature 00015 FR-OCL-10: ยังไม่มีเบอร์ verified — ปิด dialog ยืนยันซื้อทันที แล้วเปิด modal ตั้งเบอร์แทน
        if (res.status === 403 && data.code === 'PHONE_NOT_VERIFIED') {
          setBuyNowOpen(false)
          setPendingAction('buyNow')
          setPhoneVerifyOpen(true)
          return
        }
        toast.error(data.error ?? 'ซื้อทันทีไม่สำเร็จ')
        return
      }
      toast.success('ซื้อทันทีสำเร็จ!')
      onBidSuccess(data.auction as PublicAuctionDTO)
      setBuyNowOpen(false)
    } catch {
      toast.error('ซื้อทันทีไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBuyNowLoading(false)
    }
  }

  // feature 00015 FR-OCL-10: ตั้งเบอร์สำเร็จแล้ว → auto-retry action เดิม (บิด/ซื้อทันที)
  function handleVerified() {
    setPhoneVerifyOpen(false)
    const action = pendingAction
    setPendingAction(null)
    if (action === 'bid') handleBid()
    else if (action === 'buyNow') handleBuyNow()
  }

  return (
    <>
      <Box
        sx={{
          position: { xs: 'sticky', sm: 'static' },
          bottom: { xs: 0, sm: 'auto' },
          zIndex: { xs: 5, sm: 'auto' },
          bgcolor: 'background.paper',
          borderTop: { xs: '1px solid', sm: 'none' },
          borderTopColor: 'divider',
          borderRadius: { xs: '14px 14px 0 0', sm: '14px' },
          boxShadow: {
            xs: '0 -4px 16px rgba(47,43,61,.08)',
            sm: (theme) => theme.customShadows.xs,
          },
          px: { xs: '14px', sm: '20px' },
          pt: { xs: '10px', sm: '18px' },
          pb: { xs: '12px', sm: '18px' },
        }}
      >
        {/* pull-up link → เปิด AuctionDetailSheet — หายไปตอนมี sheet/modal เปิดอยู่ (mockup screen 2/3) */}
        {showDetailLink && (
          <Box
            component="button"
            type="button"
            onClick={onOpenDetailSheet}
            sx={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              border: 'none',
              background: 'none',
              pb: '9px',
              mb: '9px',
              borderBottom: '1px solid',
              borderBottomColor: 'divider',
              color: 'primary.main',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            <Icon icon="tabler-chevron-up" fontSize={15} />
            ดูรายละเอียดสินค้า
          </Box>
        )}

        {/* แถวราคา — ราคาปัจจุบัน+จำนวนบิด+ขั้นบิด ซ้าย, countdown pill(+anti-snipe) ขวา */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '9px', gap: '10px' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>ราคาปัจจุบัน · {bidCount} บิด</Typography>
            <Typography
              sx={{
                fontWeight: 900,
                color: 'primary.main',
                letterSpacing: '-.5px',
                fontSize: 25,
                fontVariantNumeric: 'tabular-nums',
                transformOrigin: 'left center',
                // feat 00007 item 4: flash เมื่อราคาเปลี่ยน
                animation: priceFlash ? 'auctionPriceFlash .55s ease-out' : 'none',
                '@keyframes auctionPriceFlash': {
                  '0%': { transform: 'scale(1)' },
                  '30%': { transform: 'scale(1.12)', color: 'success.main' },
                  '100%': { transform: 'scale(1)' },
                },
              }}
            >
              ฿{currentPrice.toLocaleString()}
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>เพิ่มครั้งละ ฿{bidIncrement.toLocaleString()}</Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>เหลือเวลา</Typography>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                bgcolor: 'primary.lightOpacity',
                color: isUnderHour ? 'error.main' : 'primary.dark',
                fontWeight: 800,
                borderRadius: '9px',
                px: '9px',
                py: '5px',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 14,
              }}
            >
              {formatRemain(remainMs)}
            </Box>
            {antiSnipeCount > 0 && (
              <Typography sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', mt: '3px', color: 'warning.main', fontSize: 10, fontWeight: 700 }}>
                <Icon icon="tabler-flame" fontSize={12} /> ต่อเวลา {antiSnipeCount} ครั้ง
              </Typography>
            )}
          </Box>
        </Box>

        {/* ปุ่มติดตาม (♡, controlled จาก parent — ใช้ state เดียวกับหัวใจใน rail) + บิด one-tap + ซื้อทันที */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
          <IconButton
            onClick={onToggleWatch}
            disabled={watchLoading}
            aria-label="ติดตามการประมูล"
            sx={{
              width: 48,
              height: 50,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '13px',
              color: watching ? 'error.main' : 'text.disabled',
              flexShrink: 0,
            }}
          >
            <Icon icon={watching ? 'tabler-heart-filled' : 'tabler-heart'} fontSize={21} />
          </IconButton>

          <Button
            onClick={handleBid}
            disabled={bidding || youAreHighestBidder}
            variant="contained"
            color="primary"
            sx={{
              flex: '1 1 auto',
              minWidth: 0,
              height: 50,
              borderRadius: '13px',
              textTransform: 'none',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              lineHeight: 1.15,
              '&.Mui-disabled': youAreHighestBidder ? { bgcolor: 'action.disabledBackground', color: 'text.disabled' } : undefined,
            }}
          >
            {youAreHighestBidder ? (
              // feat 00007 item 1: เป็นผู้นำอยู่ → บล็อก self-outbid
              <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, color: 'inherit' }}>
                คุณเป็นผู้เสนอราคาสูงสุด
              </Typography>
            ) : (
              <>
                <Typography component="span" sx={{ fontSize: 16, fontWeight: 800, color: 'inherit' }}>
                  {bidding ? 'กำลังส่ง...' : `บิดเลย ฿${minNext.toLocaleString()}`}
                </Typography>
                {!bidding && (
                  <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 500, color: 'inherit', opacity: 0.82 }}>
                    แตะเพื่อยืนยัน
                  </Typography>
                )}
              </>
            )}
          </Button>

          {buyNowPrice != null && (
            <Button
              onClick={() => {
                if (requireLogin()) return
                setBuyNowOpen(true)
              }}
              variant="tonal"
              color="warning"
              sx={{
                width: 86,
                flexShrink: 0,
                height: 50,
                borderRadius: '13px',
                textTransform: 'none',
                fontWeight: 800,
                px: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1.12,
                gap: '1px',
              }}
            >
              <Typography component="span" sx={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'inherit' }}>
                <Icon icon="tabler-bolt" fontSize={13} /> ซื้อทันที
              </Typography>
              <Typography component="span" sx={{ fontSize: 13, color: 'inherit' }}>
                ฿{buyNowPrice.toLocaleString()}
              </Typography>
            </Button>
          )}
        </Box>
      </Box>

      <Dialog open={buyNowOpen} onClose={() => (buyNowLoading ? undefined : setBuyNowOpen(false))}>
        <DialogTitle>ยืนยันซื้อทันที</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
            ซื้อสินค้านี้ทันทีในราคา ฿{buyNowPrice?.toLocaleString()} — การประมูลจะปิดทันทีและถือเป็นที่สิ้นสุด
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBuyNowOpen(false)} disabled={buyNowLoading}>
            ยกเลิก
          </Button>
          <Button onClick={handleBuyNow} disabled={buyNowLoading} variant="contained" color="primary">
            {buyNowLoading ? 'กำลังซื้อ...' : 'ยืนยันซื้อทันที'}
          </Button>
        </DialogActions>
      </Dialog>

      <BidPhoneVerifyDialog
        open={phoneVerifyOpen}
        onClose={() => setPhoneVerifyOpen(false)}
        onVerified={handleVerified}
      />
    </>
  )
}
