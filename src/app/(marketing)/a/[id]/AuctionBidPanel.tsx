'use client'

/**
 * AuctionBidPanel — แถบเสนอราคา / ซื้อทันที / ติดตาม (feature 00004, buyer web, sticky bottom)
 *
 * Base (logic pattern — fetch→toast→optimistic, ปรับจาก Paces button primitive เป็น MUI/Vuexy):
 *   src/app/(paces)/seller/(dashboard)/auctions/[id]/components/useAuctionActions.ts
 * Visual ref (asset เท่านั้น ไม่ copy layout ดิบ): docs/mockups/auction/seller-auction-v1.html
 *   .bidbar (มือถือ L852-859) — qbid chips (+increment×1/×2/×4) + custom (kb) + bid-go หลัก + buynow
 *
 * ไม่ login → กด action ใด ๆ → router.push('/auth/sign-in?callbackUrl=/a/{id}') ทันที (ไม่มี inline error
 * — sign-in page พา callbackUrl กลับมาหน้านี้เองหลัง login สำเร็จ ตาม pattern safe-callback-url เดิม)
 * login → เรียก session routes /api/auctions/[id]/{bid,buy-now,watch} → optimistic + react-toastify
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import type { PublicAuctionDTO } from '@/services/auction.service'

type Props = {
  auctionId: string
  currentPrice: number
  bidIncrement: number
  buyNowPrice: number | null
  initialWatching: boolean
  /** parent (AuctionDetailClient) อัปเดต local state จาก DTO ที่ได้กลับมาหลังบิด/ซื้อทันทีสำเร็จ */
  onBidSuccess: (auction: PublicAuctionDTO) => void
}

const QUICK_MULTIPLIERS = [1, 2, 4] as const

export default function AuctionBidPanel({
  auctionId,
  currentPrice,
  bidIncrement,
  buyNowPrice,
  initialWatching,
  onBidSuccess,
}: Props) {
  const { status: sessionStatus } = useSession()
  const router = useRouter()

  const minNext = currentPrice + bidIncrement
  const [selected, setSelected] = useState<number>(minNext)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [bidding, setBidding] = useState(false)

  const [watching, setWatching] = useState(initialWatching)
  const [watchLoading, setWatchLoading] = useState(false)

  const [buyNowOpen, setBuyNowOpen] = useState(false)
  const [buyNowLoading, setBuyNowLoading] = useState(false)

  // currentPrice ขยับ (realtime broadcast/บิดสำเร็จ) → reset ตัวเลือก quick-bid กลับไปที่ minNext ใหม่
  useEffect(() => {
    setSelected(minNext)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจ sync แค่ตอน currentPrice/bidIncrement เปลี่ยน
  }, [currentPrice, bidIncrement])

  const amount = customOpen && customValue ? Number(customValue) : selected

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
    if (!amount || Number.isNaN(amount) || amount < minNext) {
      toast.error(`ต้องเสนอราคาอย่างน้อย ฿${minNext.toLocaleString()}`)
      return
    }
    setBidding(true)
    try {
      const res = await fetch(`/api/auctions/${auctionId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'เสนอราคาไม่สำเร็จ')
        if (res.status === 409) {
          // ราคาขยับไปแล้วจากคนอื่น (race) — sync ราคาล่าสุดจาก public endpoint กัน UI ค้างเลขเก่า
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
      setCustomOpen(false)
      setCustomValue('')
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

  async function toggleWatch() {
    if (requireLogin()) return
    setWatchLoading(true)
    const next = !watching
    try {
      const res = await fetch(`/api/auctions/${auctionId}/watch`, { method: next ? 'POST' : 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error('ทำรายการไม่สำเร็จ')
        return
      }
      setWatching(!!data.watching)
      toast.success(data.watching ? 'ติดตามการประมูลนี้แล้ว' : 'เลิกติดตามแล้ว')
    } catch {
      toast.error('ทำรายการไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setWatchLoading(false)
    }
  }

  return (
    <>
      <Box
        sx={{
          // xs: sticky bottom bar (เดิม) — sm+: การ์ด in-flow ปกติ เหมือนการ์ดพี่น้อง (meta-strip/
          // AuctionPriceChart/AuctionBidHistory) ตาม pattern responsive-breakpoint จาก AuctionNavbar (S-A4)
          position: { xs: 'sticky', sm: 'static' },
          bottom: { xs: 0, sm: 'auto' },
          zIndex: { xs: 5, sm: 'auto' },
          bgcolor: '#fff',
          borderTop: { xs: '1px solid #EEF2F7', sm: 'none' },
          borderRadius: { xs: '14px 14px 0 0', sm: '14px' },
          boxShadow: { xs: '0 -4px 16px rgba(15,23,42,.08)', sm: '0 1px 2px rgba(15,23,42,.06)' },
          px: { xs: '14px', sm: '20px' },
          pt: { xs: '10px', sm: '18px' },
          pb: { xs: '12px', sm: '18px' },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: '8px', sm: '10px' },
        }}
      >
        {/* quick-bid chips (+increment×1/×2/×4) + toggle custom input */}
        <Box sx={{ display: 'flex', gap: '6px' }}>
          {QUICK_MULTIPLIERS.map((n) => {
            const amt = currentPrice + bidIncrement * n
            const isSelected = !customOpen && selected === amt
            return (
              <Box
                key={n}
                onClick={() => {
                  setSelected(amt)
                  setCustomOpen(false)
                }}
                sx={{
                  flex: 1,
                  textAlign: 'center',
                  py: '7px',
                  borderRadius: '9px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  bgcolor: isSelected ? '#0F172A' : '#F1F5F9',
                  color: isSelected ? '#fff' : '#334155',
                }}
              >
                +฿{(bidIncrement * n).toLocaleString()}
              </Box>
            )
          })}
          <IconButton
            onClick={() => setCustomOpen((v) => !v)}
            aria-label="ระบุราคาเอง"
            sx={{
              width: 34,
              height: 34,
              borderRadius: '9px',
              bgcolor: customOpen ? '#0F172A' : '#F1F5F9',
              color: customOpen ? '#fff' : '#334155',
            }}
          >
            <Icon icon="tabler-pencil" fontSize={16} />
          </IconButton>
        </Box>

        {customOpen && (
          <TextField
            size="small"
            type="number"
            placeholder={`ระบุราคา (อย่างน้อย ฿${minNext.toLocaleString()})`}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            fullWidth
          />
        )}

        {/* ปุ่มติดตาม (♡) + เสนอราคา + ซื้อทันที — xs/sm: wrap (ซื้อทันทีตกแถวเต็มความกว้างของตัวเอง
            ตาม T4), md+: nowrap รวมแถวเดียว (ตาม D6) */}
        <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'stretch', gap: '8px' }}>
          <IconButton
            onClick={toggleWatch}
            disabled={watchLoading}
            aria-label="ติดตามการประมูล"
            sx={{
              width: 44,
              height: 44,
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              color: watching ? '#DC2626' : '#94A3B8',
              flexShrink: 0,
            }}
          >
            <Icon icon={watching ? 'tabler-heart-filled' : 'tabler-heart'} fontSize={20} />
          </IconButton>

          <Button
            onClick={handleBid}
            disabled={bidding}
            sx={{
              height: 44,
              bgcolor: '#0F172A',
              color: '#fff',
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 700,
              flexDirection: 'column',
              lineHeight: 1.25,
              '&:hover': { bgcolor: '#1E293B' },
              '&.Mui-disabled': { bgcolor: '#0F172A', opacity: 0.6, color: '#fff' },
              flex: '1 1 auto',
              minWidth: 0,
            }}
          >
            <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: 'inherit' }}>
              {bidding ? 'กำลังส่ง...' : `เสนอราคา ฿${(Number.isFinite(amount) ? amount : minNext).toLocaleString()}`}
            </Typography>
            {!customOpen && (
              <Typography component="span" sx={{ fontSize: 10.5, color: 'rgba(255,255,255,.6)', fontWeight: 500 }}>
                ราคาถัดไป (+฿{bidIncrement.toLocaleString()})
              </Typography>
            )}
          </Button>

          {buyNowPrice != null && (
            <Button
              onClick={() => {
                if (requireLogin()) return
                setBuyNowOpen(true)
              }}
              startIcon={<Icon icon="tabler-bolt" fontSize={16} />}
              sx={{
                height: { xs: 40, md: 'auto' },
                bgcolor: '#FEF3E2',
                color: '#B45309',
                borderRadius: '11px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 13,
                '&:hover': { bgcolor: '#FDE9C8' },
                flex: { xs: '1 1 100%', md: '0 0 auto' },
                width: { xs: '100%', md: 'auto' },
                whiteSpace: 'nowrap',
              }}
            >
              ซื้อทันที ฿{buyNowPrice.toLocaleString()}
            </Button>
          )}
        </Box>
      </Box>

      <Dialog open={buyNowOpen} onClose={() => (buyNowLoading ? undefined : setBuyNowOpen(false))}>
        <DialogTitle>ยืนยันซื้อทันที</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: '#334155' }}>
            ซื้อสินค้านี้ทันทีในราคา ฿{buyNowPrice?.toLocaleString()} — การประมูลจะปิดทันทีและถือเป็นที่สิ้นสุด
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBuyNowOpen(false)} disabled={buyNowLoading}>
            ยกเลิก
          </Button>
          <Button onClick={handleBuyNow} disabled={buyNowLoading} variant="contained">
            {buyNowLoading ? 'กำลังซื้อ...' : 'ยืนยันซื้อทันที'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
