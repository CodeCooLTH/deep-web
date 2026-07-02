'use client'

/**
 * AuctionDetailClient — root client wrapper ของหน้า public auction detail `/a/[id]` (feature 00004)
 * Concept 1 "Live Commerce" redesign 2026-07-02 — docs/superpowers/specs/2026-07-02-buyer-auction-concept1-redesign.md
 *
 * ถือ realtime state (currentPrice/bidCount/endTimeMs/status/antiSnipeCount/bidHistory) เริ่มจาก
 * SSR props (`PublicAuctionDTO & { bidHistory }`) แล้ว subscribe Supabase Realtime broadcast channel
 * `auction:{id}` เฉพาะตอน status==='live' (draft/scheduled/ended/unsold/cancelled = static ไม่ subscribe)
 * — ส่วนนี้คงเดิม 100% ไม่แตะ (redesign ปรับแค่ layer การแสดงผล/composition)
 *
 * ใหม่ (redesign): mobile (xs) = full-viewport flex column [hero flex:1][bottom bar] ไม่มี page scroll,
 * ไม่ใช้ MobileFrame แล้ว; overlay ใหม่บน hero (AuctionSellerHeader/AuctionActionRail/AuctionLiveComment)
 * ใช้ร่วมกันทั้ง mobile และ desktop (isWide); AuctionDetailSheet(รายละเอียด)/AuctionBidHistoryModal
 * (ประวัติบิด lazy-load) เป็น bottom Drawer ที่ mount ครั้งเดียว ใช้ได้ทั้ง 2 breakpoint
 *
 * watch state (ติดตาม) ย้ายขึ้นมาจาก AuctionBidPanel เดิม — ใช้ร่วมกัน 2 จุด (หัวใจใน AuctionActionRail
 * + หัวใจใน AuctionBidPanel) ต้องเป็น state เดียวกัน ไม่งั้นสถานะสวนทางกันระหว่าง 2 ปุ่ม
 *
 * Base (logic pattern เท่านั้น — ย้ายมาใช้ Vuexy/MUI + react-toastify ของฝั่ง buyer แทน Paces primitive):
 *   src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionConsoleClient.tsx
 * Layout frame มือถือเดิม (MobileFrame) เลิกใช้แล้วตาม spec — full-viewport flex column แทน
 *   (pattern flex column อ้างจาก src/app/(marketing)/o/[token]/MobileFrame.tsx เดิม)
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import type { PublicAuctionDTO, BidDTO } from '@/services/auction.service'
import type { SellerTrust } from '@/services/app-shop.service'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useAuctionPresence } from '@/hooks/useAuctionPresence'
import { formatDateTime } from '@/lib/format-date'

import AuctionNavbar from './AuctionNavbar'
import AuctionHero from './AuctionHero'
import AuctionSellerHeader from './AuctionSellerHeader'
import AuctionActionRail from './AuctionActionRail'
import AuctionLiveComment from './AuctionLiveComment'
import AuctionDetailSheet from './AuctionDetailSheet'
import AuctionBidHistoryModal from './AuctionBidHistoryModal'
import AuctionPriceChart from './AuctionPriceChart'
import AuctionLiveState from './AuctionLiveState'
import AuctionBidHistory from './AuctionBidHistory'
import AuctionResultCard from './AuctionResultCard'
import AuctionBidPanel from './AuctionBidPanel'
import WinnerDialog from './WinnerDialog'

type AuctionData = PublicAuctionDTO & { bidHistory: BidDTO[] }

type Props = {
  auction: AuctionData
  seller: SellerTrust | null
  /** true เฉพาะเมื่อ session user ปัจจุบัน = ผู้ชนะ (คำนวณที่ page.tsx จาก Order.buyerUserId) */
  isWinner: boolean
  /** สถานะ watch เริ่มต้น (จาก WatchList ใน DB ตอน SSR — login แล้วเท่านั้นถึงจะมีค่า true) */
  initialWatching: boolean
}

type ConnectionState = 'live' | 'reconnecting'

export default function AuctionDetailClient({ auction, seller, isWinner, initialWatching }: Props) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  // S-A5: จอกว้าง ≥sm แสดง web layout กลางจอ (ไม่มีกรอบมือถือ) — pattern เดียวกับ
  // src/components/layout/front-pages/Header.tsx:16,41
  const isWide = useMediaQuery((theme: Theme) => theme.breakpoints.up('sm'))

  const [currentPrice, setCurrentPrice] = useState(auction.currentPrice)
  const [bidCount, setBidCount] = useState(auction.bidCount)
  const [endTimeMs, setEndTimeMs] = useState(auction.endTimeMs)
  const [status, setStatus] = useState(auction.status)
  const [antiSnipeCount, setAntiSnipeCount] = useState(auction.antiSnipeCount)
  const [bidHistory, setBidHistory] = useState(auction.bidHistory)
  // subscribe เฉพาะตอน live เท่านั้น — ก่อน SUBSCRIBED ครั้งแรกถือว่า "กำลังเชื่อมต่อ"
  const [connectionState, setConnectionState] = useState<ConnectionState>('reconnecting')
  // feat 00007 item 1: viewer เป็นผู้เสนอสูงสุดไหม → disable ปุ่มบิด กัน self-outbid
  const [youAreHighestBidder, setYouAreHighestBidder] = useState(auction.youAreHighestBidder ?? false)
  // feat 00007 item 5: winner dialog (เด้งเมื่อ live→ended มีผู้ชนะ)
  const [winnerOpen, setWinnerOpen] = useState(false)

  // เก็บค่า antiSnipeCount ล่าสุดไว้เทียบตอนได้ broadcast ใหม่ (เทียบ "ก่อนหน้า" ไม่ใช่ state ที่อาจยังไม่ commit)
  const antiSnipeCountRef = useRef(auction.antiSnipeCount)
  // feat 00007 item 4/5: ref เทียบค่าเก่า (skip mount แรก) สำหรับ price-toast + winner trigger
  const prevPriceRef = useRef(auction.currentPrice)
  const prevStatusRef = useRef(auction.status)
  // feat 00007 item 6: throttle refetch ตอน broadcast รัว (auction ร้อน) — trailing debounce
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // overlay UI state ใหม่ (redesign 2026-07-02) — sheet รายละเอียด / modal ประวัติบิด
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [bidHistoryOpen, setBidHistoryOpen] = useState(false)

  // watch state (ย้ายมาจาก AuctionBidPanel เดิม — ใช้ร่วม 2 จุด: หัวใจใน rail + หัวใจในแถบล่าง)
  const [watching, setWatching] = useState(initialWatching)
  const [watchLoading, setWatchLoading] = useState(false)

  // origin สำหรับ absolute share URL — คำนวณหลัง mount เท่านั้น (กัน SSR อ้าง window ไม่ได้)
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])
  const shareUrl = `${origin}/a/${auction.id}`

  // re-sync ทุกครั้งที่ page.tsx (RSC) ส่ง auction prop ใหม่มา (router.refresh()) — กัน state ค้าง
  useEffect(() => {
    setCurrentPrice(auction.currentPrice)
    setBidCount(auction.bidCount)
    setEndTimeMs(auction.endTimeMs)
    setStatus(auction.status)
    setAntiSnipeCount(auction.antiSnipeCount)
    setBidHistory(auction.bidHistory)
    setYouAreHighestBidder(auction.youAreHighestBidder ?? false)
    antiSnipeCountRef.current = auction.antiSnipeCount
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ต้องการ trigger เมื่อ auction object เปลี่ยน (RSC re-render) เท่านั้น
  }, [auction])

  // feat 00007 item 4: ราคาเปลี่ยน → toast "ราคาอัปเดตแล้ว" (เด้งทุกครั้ง รวมตอนบิดเอง; skip mount แรก)
  useEffect(() => {
    if (prevPriceRef.current !== currentPrice) {
      if (currentPrice > prevPriceRef.current) {
        toast.info(`ราคาอัปเดตแล้ว ฿${currentPrice.toLocaleString()}`)
      }
      prevPriceRef.current = currentPrice
    }
  }, [currentPrice])

  // feat 00007 item 5: live→ended + มีผู้ชนะ → เด้ง winner dialog (เฉพาะ transition ระหว่างดู)
  useEffect(() => {
    if (prevStatusRef.current === 'live' && status === 'ended' && bidHistory[0]) {
      setWinnerOpen(true)
    }
    prevStatusRef.current = status
  }, [status, bidHistory])

  // Supabase Realtime broadcast — subscribe เฉพาะตอน status เป็น 'live'
  useEffect(() => {
    if (status !== 'live') return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`auction:${auction.id}`)
      .on('broadcast', { event: 'update' }, () => {
        // 🔒 security fix A (reconciliation): channel เป็น public → payload spoofable
        // (ใครมี anon key ก็ยิง broadcast ปลอมได้) → **ไม่เชื่อ payload** ใช้เป็นแค่ "signal ว่ามีการเปลี่ยน"
        // แล้ว re-fetch authoritative endpoint set ทุก field จาก dto จริงเท่านั้น (ค่าปลอม self-heal)
        // feat 00007 item 6: throttle refetch (trailing ~500ms) กัน broadcast รัวยิง GET ถล่ม (auction ร้อน)
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
        refetchTimerRef.current = setTimeout(() => {
          fetch(`/api/app/auctions/${auction.id}`)
            .then((res) => (res.ok ? (res.json() as Promise<AuctionData>) : null))
            .then((dto) => {
              if (!dto) return
              setCurrentPrice(dto.currentPrice)
              setBidCount(dto.bidCount)
              setEndTimeMs(dto.endTimeMs)
              setStatus(dto.status)
              setBidHistory(dto.bidHistory)
              setYouAreHighestBidder(dto.youAreHighestBidder ?? false) // feat 00007 item 1
              if (dto.antiSnipeCount > antiSnipeCountRef.current) {
                toast.info('ต่อเวลาประมูลอัตโนมัติ')
              }
              setAntiSnipeCount(dto.antiSnipeCount)
              antiSnipeCountRef.current = dto.antiSnipeCount
              // ประมูลจบจาก authoritative → refresh RSC เพื่อดึง isWinner (server-side จาก Order.buyerUserId)
              if (dto.status === 'ended' || dto.status === 'unsold' || dto.status === 'cancelled') {
                router.refresh()
              }
            })
            .catch(() => {
              // เงียบ — จะ sync อีกครั้งตอน broadcast ถัดไปหรือ router.refresh()
            })
        }, 500)
      })
      .subscribe((subStatus) => {
        if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') setConnectionState('reconnecting')
        if (subStatus === 'SUBSCRIBED') setConnectionState('live')
      })

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe ตาม auction.id+status เท่านั้น (ไม่ resubscribe ทุกครั้งที่ currentPrice/bidCount เปลี่ยน)
  }, [auction.id, status])

  const isLive = status === 'live'
  const isTerminal = status === 'ended' || status === 'unsold' || status === 'cancelled'
  // feat 00006: จำนวนผู้ชมกำลังดู (live เท่านั้น) — Supabase Presence channel แยก
  const viewerCount = useAuctionPresence(auction.id, isLive)

  /** ยังไม่ login → เด้ง sign-in ทันที (ย้ายมาจาก AuctionBidPanel เดิม — ใช้ร่วมกับ toggleWatch ที่ยกขึ้นมา) */
  function requireLogin(): boolean {
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(`/a/${auction.id}`)}`)
      return true
    }
    return false
  }

  async function toggleWatch() {
    if (requireLogin()) return
    setWatchLoading(true)
    const next = !watching
    try {
      const res = await fetch(`/api/auctions/${auction.id}/watch`, { method: next ? 'POST' : 'DELETE' })
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

  // AuctionBidPanel (isLive) — ใช้ทั้งมือถือ (sticky bottom bar) และ desktop (in-flow ปกติ, ตัวเดียวกัน)
  const bidPanel = isLive ? (
    <AuctionBidPanel
      auctionId={auction.id}
      currentPrice={currentPrice}
      bidIncrement={auction.bidIncrement}
      buyNowPrice={auction.buyNowPrice}
      bidCount={bidCount}
      endTimeMs={endTimeMs}
      antiSnipeCount={antiSnipeCount}
      watching={watching}
      watchLoading={watchLoading}
      onToggleWatch={toggleWatch}
      showDetailLink={!detailSheetOpen && !bidHistoryOpen}
      onOpenDetailSheet={() => setDetailSheetOpen(true)}
      youAreHighestBidder={youAreHighestBidder}
      onBidSuccess={(next) => {
        setCurrentPrice(next.currentPrice)
        setBidCount(next.bidCount)
        setEndTimeMs(next.endTimeMs)
        setAntiSnipeCount(next.antiSnipeCount)
        setStatus(next.status)
        // feat 00007 item 1: บิดปกติสำเร็จ = กลายเป็นผู้นำ → disable ปุ่มทันที (optimistic; reconcile จาก broadcast ถ้าโดนแซง)
        if (next.status === 'live') setYouAreHighestBidder(true)
        // ซื้อทันที/บิดที่ trigger settle ทำให้ status พลิกเป็น terminal ทันที — refresh RSC
        // เพื่อคำนวณ isWinner ใหม่จาก session (buy-now ของ user นี้เอง = isWinner ต้องเป็น true)
        if (next.status !== 'live') router.refresh()
      }}
    />
  ) : null

  // การ์ดแทนแถบบิดตอน scheduled (มือถือ+desktop bottom bar) — ไม่ใช้ AuctionLiveState component ตรง ๆ
  // (spec: "ไม่อยู่ใน mobile flow") จึงประกอบ markup สั้น ๆ เอง (asset เดียวกัน ไม่ใช่ theme ใหม่)
  const scheduledBar = (
    <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', px: '16px', py: '14px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="tabler-clock-hour-4" style={{ color: 'var(--mui-palette-info-main)', fontSize: 18 }} />
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
          {auction.startTimeMs ? `เริ่มประมูล ${formatDateTime(auction.startTimeMs)}` : 'รอเปิดประมูล'}
        </Typography>
      </Box>
    </Box>
  )

  const resultBar = (
    <Box sx={{ bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', px: '16px', py: '14px' }}>
      <AuctionResultCard
        status={status as 'ended' | 'unsold' | 'cancelled'}
        currentPrice={currentPrice}
        hasReserve={auction.hasReserve}
        winnerDisplayName={bidHistory[0]?.bidder ?? null}
        isWinner={isWinner}
      />
    </Box>
  )

  // แถบล่างสุด (มือถือ = เกาะก้นจอ flex column, desktop = in-flow) — สลับตาม status
  const bottomBar = isLive ? bidPanel : status === 'scheduled' ? scheduledBar : isTerminal ? resultBar : null

  // overlay ชุดใหม่บน AuctionHero — ใช้ร่วมกันทั้ง mobile และ desktop (ต่างแค่ variant ของ AuctionHero เอง)
  // edge states: scheduled → ซ่อน rail + live comment ทั้งคู่ (spec "rail hidden, no live comment")
  const heroOverlay = (
    <>
      <AuctionSellerHeader seller={seller} status={status} />
      {status !== 'scheduled' && (
        <AuctionActionRail
          viewerCount={isLive ? viewerCount : 0}
          watching={watching}
          onToggleWatch={toggleWatch}
          bidCount={bidCount}
          onOpenBidHistory={() => setBidHistoryOpen(true)}
          shareUrl={shareUrl}
          shareTitle={auction.title}
          readOnly={isTerminal}
        />
      )}
      {status !== 'scheduled' && <AuctionLiveComment title={auction.title} latestBid={bidHistory[0] ?? null} />}
    </>
  )

  // Drawer 2 ตัว mount ครั้งเดียว ใช้ร่วมทั้ง 2 breakpoint (MUI Drawer portal ไปที่ document.body อยู่แล้ว)
  const modals = (
    <>
      <AuctionDetailSheet
        open={detailSheetOpen}
        onClose={() => setDetailSheetOpen(false)}
        title={auction.title}
        description={auction.description}
      />
      <AuctionBidHistoryModal
        open={bidHistoryOpen}
        onClose={() => setBidHistoryOpen(false)}
        auctionId={auction.id}
        bidCount={bidCount}
        initialBids={bidHistory}
        latestBid={bidHistory[0] ?? null}
        connectionState={isLive ? connectionState : undefined}
      />
    </>
  )

  return (
    <>
      {/* S-A4: navbar อยู่นอก layout ตั้งใจ — sm+ เท่านั้น (แสดง/ซ่อนคุมเองภายใน) */}
      <AuctionNavbar auctionId={auction.id} />

      {isWide ? (
        // S-A5: ≥sm — web layout กว้าง ~840px กลางจอ (ไม่มีกรอบมือถือ) — เนื้อหาใต้ hero คงเดิมทุกอย่าง
        // (spec: "below-hero sections may remain as-is on desktop only") ต่างแค่ hero มี overlay ใหม่ทับ
        <Box sx={{ bgcolor: 'background.default', minHeight: '100dvh' }}>
          <Box
            sx={{
              maxWidth: 840,
              mx: 'auto',
              px: { sm: '24px', md: '32px' },
              py: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                borderRadius: '14px',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: (theme) => theme.customShadows.xs,
              }}
            >
              <AuctionHero imageUrl={auction.imageUrl} images={auction.images} variant="desktop">
                {heroOverlay}
              </AuctionHero>
            </Box>

            <AuctionPriceChart bidHistory={bidHistory} />

            <AuctionLiveState
              status={status}
              endTimeMs={endTimeMs}
              startTimeMs={auction.startTimeMs}
              antiSnipeCount={antiSnipeCount}
              heroHasCountdown={isLive}
            />

            {/* meta-strip — ราคาเริ่ม/ขั้นบิด/มีขั้นต่ำไหม/ผู้ขาย trust ย่อ (visual ref: mockup .meta-strip, asset เท่านั้น) */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: '16px',
                rowGap: '6px',
                px: '14px',
                py: '10px',
                bgcolor: 'background.paper',
                borderRadius: '12px',
                boxShadow: (theme) => theme.customShadows.xs,
              }}
            >
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                เริ่ม <Box component="b" sx={{ color: 'text.primary' }}>฿{auction.startPrice.toLocaleString()}</Box>
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                ขั้นบิด <Box component="b" sx={{ color: 'text.primary' }}>฿{auction.bidIncrement.toLocaleString()}</Box>
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                ขั้นต่ำ <Box component="b" sx={{ color: 'text.primary' }}>{auction.hasReserve ? 'มี' : 'ไม่มี'}</Box>
              </Typography>
              {seller && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  ผู้ขาย <Box component="b" sx={{ color: 'text.primary' }}>{seller.name}</Box>
                  {seller.verified && (
                    <Icon icon="tabler-rosette-discount-check-filled" style={{ color: 'var(--mui-palette-primary-main)', fontSize: 14 }} />
                  )}
                </Typography>
              )}
            </Box>

            {bidPanel}

            {isTerminal && (
              <AuctionResultCard
                status={status as 'ended' | 'unsold' | 'cancelled'}
                currentPrice={currentPrice}
                hasReserve={auction.hasReserve}
                winnerDisplayName={bidHistory[0]?.bidder ?? null}
                isWinner={isWinner}
              />
            )}

            <AuctionBidHistory
              auctionId={auction.id}
              bidHistory={bidHistory}
              bidCount={bidCount}
              connectionState={isLive ? connectionState : undefined}
            />
          </Box>
        </Box>
      ) : (
        // xs (<600) — full-viewport flex column ไม่มี page scroll (spec redesign 2026-07-02) —
        // เลิกใช้ MobileFrame แล้ว: hero flex:1 เต็มพื้นที่เหนือแถบล่าง, ไม่ render chart/live-state/
        // meta-strip/inline-history บน mobile default flow (ย้ายรายละเอียด → AuctionDetailSheet,
        // ประวัติบิด → AuctionBidHistoryModal แทน)
        <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
          <AuctionHero imageUrl={auction.imageUrl} images={auction.images} variant="mobile">
            {heroOverlay}
          </AuctionHero>

          {bottomBar}
        </Box>
      )}

      {modals}

      {/* feat 00007 item 5: winner announcement (เด้งเมื่อ live→ended มีผู้ชนะ, ค้างจนกดปิด) */}
      {bidHistory[0] && (
        <WinnerDialog
          open={winnerOpen}
          onClose={() => setWinnerOpen(false)}
          isWinner={isWinner}
          winnerName={bidHistory[0].bidder}
          winnerLevel={bidHistory[0].level}
          winnerAvatar={bidHistory[0].avatar}
          finalPrice={currentPrice}
        />
      )}
    </>
  )
}
