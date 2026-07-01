'use client'

/**
 * AuctionDetailClient — root client wrapper ของหน้า public auction detail `/a/[id]` (feature 00004)
 *
 * ถือ realtime state (currentPrice/bidCount/endTimeMs/status/antiSnipeCount/bidHistory) เริ่มจาก
 * SSR props (`PublicAuctionDTO & { bidHistory }`) แล้ว subscribe Supabase Realtime broadcast channel
 * `auction:{id}` เฉพาะตอน status==='live' (draft/scheduled/ended/unsold/cancelled = static ไม่ subscribe)
 *
 * Base (logic pattern เท่านั้น — ย้ายมาใช้ Vuexy/MUI + react-toastify ของฝั่ง buyer แทน Paces primitive):
 *   src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionConsoleClient.tsx
 *   (holder pattern: subscribe broadcast → merge payload → re-fetch bidHistory ผ่าน REST endpoint
 *   เดิม (ที่นี่ใช้ `/api/app/auctions/[id]` public — ไม่ใช่ seller endpoint) → router.refresh()
 *   เมื่อ auction จบ/ขายไม่ออก/ยกเลิก เพื่อให้ RSC คำนวณ isWinner ใหม่)
 * Layout frame: src/app/(marketing)/o/[token]/MobileFrame.tsx (reuse ตรง — mobile full-bleed /
 *   desktop centered "จอมือถือ" กลางจอเทา ใช้ pattern เดียวกับหน้า public order เดิม)
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import type { PublicAuctionDTO, BidDTO } from '@/services/auction.service'
import type { SellerTrust } from '@/services/app-shop.service'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

import MobileFrame from '../../o/[token]/MobileFrame'
import AuctionHero from './AuctionHero'
import AuctionPriceChart from './AuctionPriceChart'
import AuctionLiveState from './AuctionLiveState'
import AuctionBidHistory from './AuctionBidHistory'
import AuctionResultCard from './AuctionResultCard'
import AuctionBidPanel from './AuctionBidPanel'

type AuctionData = PublicAuctionDTO & { bidHistory: BidDTO[] }

type Props = {
  auction: AuctionData
  seller: SellerTrust | null
  /** true เฉพาะเมื่อ session user ปัจจุบัน = ผู้ชนะ (คำนวณที่ page.tsx จาก Order.buyerUserId) */
  isWinner: boolean
  /** สถานะ watch เริ่มต้น (จาก WatchList ใน DB ตอน SSR — login แล้วเท่านั้นถึงจะมีค่า true) */
  initialWatching: boolean
}

/** shape ของ payload ที่ trigger `auction_realtime_broadcast()` ส่งมา (เหมือน seller console — 00002 API.md §6) */
type AuctionRealtimeUpdate = {
  id: string
  currentPrice: number
  bidCount: number
  endTimeMs: number
  status: PublicAuctionDTO['status']
  antiSnipeCount: number
  hasReserve: boolean
}

type ConnectionState = 'live' | 'reconnecting'

export default function AuctionDetailClient({ auction, seller, isWinner, initialWatching }: Props) {
  const router = useRouter()

  const [currentPrice, setCurrentPrice] = useState(auction.currentPrice)
  const [bidCount, setBidCount] = useState(auction.bidCount)
  const [endTimeMs, setEndTimeMs] = useState(auction.endTimeMs)
  const [status, setStatus] = useState(auction.status)
  const [antiSnipeCount, setAntiSnipeCount] = useState(auction.antiSnipeCount)
  const [bidHistory, setBidHistory] = useState(auction.bidHistory)
  // subscribe เฉพาะตอน live เท่านั้น — ก่อน SUBSCRIBED ครั้งแรกถือว่า "กำลังเชื่อมต่อ"
  const [connectionState, setConnectionState] = useState<ConnectionState>('reconnecting')

  // เก็บค่า antiSnipeCount ล่าสุดไว้เทียบตอนได้ broadcast ใหม่ (เทียบ "ก่อนหน้า" ไม่ใช่ state ที่อาจยังไม่ commit)
  const antiSnipeCountRef = useRef(auction.antiSnipeCount)

  // re-sync ทุกครั้งที่ page.tsx (RSC) ส่ง auction prop ใหม่มา (router.refresh()) — กัน state ค้าง
  useEffect(() => {
    setCurrentPrice(auction.currentPrice)
    setBidCount(auction.bidCount)
    setEndTimeMs(auction.endTimeMs)
    setStatus(auction.status)
    setAntiSnipeCount(auction.antiSnipeCount)
    setBidHistory(auction.bidHistory)
    antiSnipeCountRef.current = auction.antiSnipeCount
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ต้องการ trigger เมื่อ auction object เปลี่ยน (RSC re-render) เท่านั้น
  }, [auction])

  // Supabase Realtime broadcast — subscribe เฉพาะตอน status เป็น 'live'
  useEffect(() => {
    if (status !== 'live') return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`auction:${auction.id}`)
      .on('broadcast', { event: 'update' }, (message) => {
        const payload = message.payload as AuctionRealtimeUpdate

        setCurrentPrice(payload.currentPrice)
        setBidCount(payload.bidCount)
        setEndTimeMs(payload.endTimeMs)
        setStatus(payload.status)
        setAntiSnipeCount(payload.antiSnipeCount)

        if (payload.antiSnipeCount > antiSnipeCountRef.current) {
          toast.info('ต่อเวลาประมูลอัตโนมัติ')
        }
        antiSnipeCountRef.current = payload.antiSnipeCount

        // broadcast payload ไม่มี bidHistory (sanitized) → re-fetch public endpoint เดิมเพื่ออัปเดต
        // bid feed + sparkline chart ให้ตรงกับราคา/จำนวนบิดล่าสุด
        fetch(`/api/app/auctions/${auction.id}`)
          .then((res) => (res.ok ? (res.json() as Promise<AuctionData>) : null))
          .then((dto) => {
            if (dto) setBidHistory(dto.bidHistory)
          })
          .catch(() => {
            // เงียบ — bidHistory จะได้ค่าล่าสุดตอน broadcast ครั้งถัดไปหรือ router.refresh()
          })

        // ประมูลจบ/ขายไม่ออก/ยกเลิกจาก broadcast (คนอื่นเปิด request trigger lazy-settle) →
        // refresh RSC เพื่อดึง isWinner ใหม่ (คำนวณฝั่ง server จาก Order.buyerUserId)
        if (payload.status === 'ended' || payload.status === 'unsold' || payload.status === 'cancelled') {
          router.refresh()
        }
      })
      .subscribe((subStatus) => {
        if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') setConnectionState('reconnecting')
        if (subStatus === 'SUBSCRIBED') setConnectionState('live')
      })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe ตาม auction.id+status เท่านั้น (ไม่ resubscribe ทุกครั้งที่ currentPrice/bidCount เปลี่ยน)
  }, [auction.id, status])

  const isLive = status === 'live'
  const isTerminal = status === 'ended' || status === 'unsold' || status === 'cancelled'

  return (
    <MobileFrame bg="#F3F5F8">
      <AuctionHero title={auction.title} imageUrl={auction.imageUrl} status={status} />

      <Box sx={{ px: '16px', py: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <AuctionPriceChart bidHistory={bidHistory} />

        <AuctionLiveState
          status={status}
          endTimeMs={endTimeMs}
          startTimeMs={auction.startTimeMs}
          antiSnipeCount={antiSnipeCount}
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
            bgcolor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 2px rgba(15,23,42,.06)',
          }}
        >
          <Typography sx={{ fontSize: 12, color: '#64748B' }}>
            เริ่ม <Box component="b" sx={{ color: '#0F172A' }}>฿{auction.startPrice.toLocaleString()}</Box>
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#64748B' }}>
            ขั้นบิด <Box component="b" sx={{ color: '#0F172A' }}>฿{auction.bidIncrement.toLocaleString()}</Box>
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#64748B' }}>
            ขั้นต่ำ <Box component="b" sx={{ color: '#0F172A' }}>{auction.hasReserve ? 'มี' : 'ไม่มี'}</Box>
          </Typography>
          {seller && (
            <Typography sx={{ fontSize: 12, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              ผู้ขาย <Box component="b" sx={{ color: '#0F172A' }}>{seller.name}</Box>
              {seller.verified && (
                <Icon icon="tabler-rosette-discount-check-filled" style={{ color: '#2563EB', fontSize: 14 }} />
              )}
            </Typography>
          )}
        </Box>

        {isLive && (
          <AuctionBidPanel
            auctionId={auction.id}
            currentPrice={currentPrice}
            bidIncrement={auction.bidIncrement}
            buyNowPrice={auction.buyNowPrice}
            initialWatching={initialWatching}
            onBidSuccess={(next) => {
              setCurrentPrice(next.currentPrice)
              setBidCount(next.bidCount)
              setEndTimeMs(next.endTimeMs)
              setAntiSnipeCount(next.antiSnipeCount)
              setStatus(next.status)
              // ซื้อทันที/บิดที่ trigger settle ทำให้ status พลิกเป็น terminal ทันที — refresh RSC
              // เพื่อคำนวณ isWinner ใหม่จาก session (buy-now ของ user นี้เอง = isWinner ต้องเป็น true)
              if (next.status !== 'live') router.refresh()
            }}
          />
        )}

        {/* status ไม่ live: ended/unsold/cancelled → การ์ดสรุปผล (AuctionResultCard ไม่รองรับ 'scheduled'/'draft'
            ในสัญญา prop เดิม — 2 สถานะนี้ปล่อยให้ AuctionLiveState สื่อสารพอ ไม่มี panel ใด ๆ ต่อท้าย) */}
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
          bidHistory={bidHistory}
          bidCount={bidCount}
          connectionState={isLive ? connectionState : undefined}
        />
      </Box>
    </MobileFrame>
  )
}
