'use client'

/**
 * AuctionConsoleClient — root client wrapper ของ Control Console (`/seller/auctions/[id]`)
 *
 * ถือ state ของ auction (currentPrice/bidCount/endTimeMs/status/antiSnipeCount/bidHistory)
 * เริ่มจาก SSR props (`SellerAuctionDTO`) — Batch E#12: subscribe Supabase Realtime broadcast
 * channel `auction:{id}` เฉพาะตอน `status === 'live'` (draft/scheduled/ended/unsold/cancelled
 * = static ไม่ subscribe) ตาม SDS §9.1 + API.md §6
 *
 * sync effect: `router.refresh()` (จาก AuctionCountdown ครบเวลา หรือ handler เผยแพร่/ยกเลิก/
 * จบก่อนเวลาใน sub-component) ทำให้ page.tsx (RSC) re-fetch + ส่ง `auction` prop object ใหม่มา —
 * useEffect ผูกกับ `auction` (object reference เปลี่ยนทุกครั้งที่ RSC re-render) เพื่อ re-sync
 * local state ให้ตรงข้อมูลล่าสุดเสมอ (มิเช่นนั้น client state จะค้างค่าตอน mount ครั้งแรก)
 *
 * realtime broadcast payload (sanitized — ไม่มี reservePrice/expectedPrice) ไม่มี `bidHistory`
 * → ทุกครั้งที่ได้ broadcast จะ re-fetch `GET /api/seller/auctions/{id}` (endpoint เดิม, ไม่สร้างใหม่)
 * เพื่อได้ bidHistory ล่าสุดสำหรับ chart + bid feed
 *
 * Base: RSC→client boundary pattern เดียวกับ order-details (holder ถือ props แล้ว fan-out
 * เข้า sub-component ล้วน primitive) — ไฟล์นี้เป็นไฟล์ orchestration ใหม่ (ไม่มี theme file ตรงตัว
 * เพราะ Paces demo ไม่มี "auction console" — ประกอบจาก .card/grid primitive ล้วนตาม UI-DESIGN-SPEC §8.3)
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SellerAuctionDTO } from '@/services/auction.service'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { pacesToast } from '@/lib/paces-toast'
import ConsoleHead from './ConsoleHead'
import AuctionStatCards from './AuctionStatCards'
import AuctionControlPanel from './AuctionControlPanel'
import AuctionInfoCard from './AuctionInfoCard'
import AuctionResultCard from './AuctionResultCard'
import AuctionPriceChart from './AuctionPriceChart'
import AuctionBidFeed from './AuctionBidFeed'

type Props = {
  auction: SellerAuctionDTO
}

/** shape ของ payload ที่ trigger `auction_realtime_broadcast()` ส่งมา (API.md §6) */
type AuctionRealtimeUpdate = {
  id: string
  currentPrice: number
  bidCount: number
  endTimeMs: number
  status: SellerAuctionDTO['status']
  antiSnipeCount: number
  hasReserve: boolean
}

type ConnectionState = 'live' | 'reconnecting'

export default function AuctionConsoleClient({ auction }: Props) {
  const router = useRouter()
  const [currentPrice, setCurrentPrice] = useState(auction.currentPrice)
  const [bidCount, setBidCount] = useState(auction.bidCount)
  const [endTimeMs, setEndTimeMs] = useState(auction.endTimeMs)
  const [status, setStatus] = useState(auction.status)
  const [antiSnipeCount, setAntiSnipeCount] = useState(auction.antiSnipeCount)
  const [bidHistory, setBidHistory] = useState(auction.bidHistory)
  // subscribe เฉพาะตอน live เท่านั้น → ก่อน SUBSCRIBED ครั้งแรกถือว่า "กำลังเชื่อมต่อ"
  const [connectionState, setConnectionState] = useState<ConnectionState>('reconnecting')

  // เก็บค่า antiSnipeCount ล่าสุดไว้เทียบตอนได้ broadcast ใหม่ (ต้องเทียบ "ก่อนหน้า" ไม่ใช่ state
  // ที่อาจยังไม่ commit ใน closure ของ effect เดียวกัน)
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

  // Supabase Realtime broadcast — subscribe เฉพาะตอน status เป็น 'live' (draft/scheduled/
  // ended/unsold/cancelled = static ไม่มี bid ใหม่ให้ subscribe)
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
          pacesToast.info('+60 วินาที')
        }
        antiSnipeCountRef.current = payload.antiSnipeCount

        // broadcast payload ไม่มี bidHistory (sanitized) → re-fetch endpoint เดิมเพื่ออัปเดต
        // bid feed + chart series ให้ตรงกับราคา/จำนวนบิดล่าสุด
        fetch(`/api/seller/auctions/${auction.id}`)
          .then((res) => (res.ok ? (res.json() as Promise<SellerAuctionDTO>) : null))
          .then((dto) => {
            if (dto) setBidHistory(dto.bidHistory)
          })
          .catch(() => {
            // เงียบ — bidHistory จะได้ค่าล่าสุดตอน broadcast ครั้งถัดไปหรือ router.refresh()
          })

        // ประมูลจบ/ขายไม่ออก/ยกเลิกจาก broadcast (คนอื่นเปิด request trigger lazy-settle) →
        // refresh RSC เพื่อดึง AuctionResultCard (orderId/winner ที่คำนวณฝั่ง server)
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

  const isTerminal = status === 'ended' || status === 'unsold' || status === 'cancelled'

  return (
    <div className="space-y-base">
      <ConsoleHead
        id={auction.id}
        title={auction.title}
        imageUrl={auction.imageUrl}
        status={status}
      />

      <AuctionStatCards
        currentPrice={currentPrice}
        bidCount={bidCount}
        endTimeMs={endTimeMs}
        status={status}
        leaderName={bidHistory[0]?.bidder ?? null}
        expectedPrice={auction.expectedPrice}
      />

      {isTerminal && (
        <AuctionResultCard
          status={status as 'ended' | 'unsold' | 'cancelled'}
          currentPrice={currentPrice}
          hasReserve={auction.hasReserve}
          winnerDisplayName={bidHistory[0]?.bidder ?? null}
          orderId={auction.orderId}
          cancelledAt={auction.cancelledAt}
        />
      )}

      {/* desktop 2-col: ซ้าย col-span-2 (chart + bid feed) / ขวา (control panel + info card) */}
      <div className="grid grid-cols-1 gap-base lg:grid-cols-3">
        <div className="space-y-base lg:col-span-2">
          <AuctionPriceChart bidHistory={bidHistory} expectedPrice={auction.expectedPrice} />
          <AuctionBidFeed
            bidHistory={bidHistory}
            bidCount={bidCount}
            connectionState={status === 'live' ? connectionState : undefined}
          />
        </div>

        <div className="space-y-base">
          <AuctionControlPanel
            id={auction.id}
            status={status}
            bidCount={bidCount}
            bidIncrement={auction.bidIncrement}
            buyNowPrice={auction.buyNowPrice}
            antiSnipeCount={antiSnipeCount}
          />
          <AuctionInfoCard auction={auction} />
        </div>
      </div>
    </div>
  )
}
