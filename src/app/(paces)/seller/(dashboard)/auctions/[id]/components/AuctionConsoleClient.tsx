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
import { cn } from '@/utils/helpers'
import type { SellerAuctionDTO } from '@/services/auction.service'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { pacesToast } from '@/lib/paces-toast'
import ConsoleHead from './ConsoleHead'
import AuctionConsoleActionBar from './AuctionConsoleActionBar'
import AuctionStatCards from './AuctionStatCards'
import AuctionControlPanel from './AuctionControlPanel'
import AuctionInfoCard from './AuctionInfoCard'
import AuctionResultCard from './AuctionResultCard'
import AuctionPriceChart from './AuctionPriceChart'
import AuctionBidVelocity from './AuctionBidVelocity'
import AuctionBidFeed from './AuctionBidFeed'

type Props = {
  auction: SellerAuctionDTO
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
      .on('broadcast', { event: 'update' }, () => {
        // 🔒 security fix A (reconciliation): channel public → payload spoofable (anon key ยิงปลอมได้)
        // → **ไม่เชื่อ payload** ใช้เป็นแค่ signal → re-fetch authoritative set ทุก field จาก dto จริง
        fetch(`/api/seller/auctions/${auction.id}`)
          .then((res) => (res.ok ? (res.json() as Promise<SellerAuctionDTO>) : null))
          .then((dto) => {
            if (!dto) return
            setCurrentPrice(dto.currentPrice)
            setBidCount(dto.bidCount)
            setEndTimeMs(dto.endTimeMs)
            setStatus(dto.status)
            setBidHistory(dto.bidHistory)
            if (dto.antiSnipeCount > antiSnipeCountRef.current) {
              pacesToast.info('+60 วินาที')
            }
            setAntiSnipeCount(dto.antiSnipeCount)
            antiSnipeCountRef.current = dto.antiSnipeCount
            if (dto.status === 'ended' || dto.status === 'unsold' || dto.status === 'cancelled') {
              router.refresh()
            }
          })
          .catch(() => {
            // เงียบ — จะ sync อีกครั้งตอน broadcast ถัดไปหรือ router.refresh()
          })
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
  // velocity แสดงเมื่อมี ≥2 บิด (ตรงกับ guard ใน AuctionBidVelocity) — ใช้จัด grid analytics row
  const hasVelocity = bidHistory.length >= 2

  return (
    // pb บน mobile กัน sticky action bar บังการ์ดล่างสุด (bar สูง ~68px + safe-area); desktop ไม่มี bar
    <div className="space-y-base pb-24 lg:pb-0">
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

      {/* analytics row (mockup .analytics): กราฟราคา (กว้าง) + velocity/อัตราการบิด ข้างกันบน desktop */}
      <div className="grid grid-cols-1 gap-base lg:grid-cols-3">
        <div className={cn(hasVelocity ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <AuctionPriceChart bidHistory={bidHistory} expectedPrice={auction.expectedPrice} />
        </div>
        {hasVelocity && (
          <div className="lg:col-span-1">
            <AuctionBidVelocity bidHistory={bidHistory} bidCount={bidCount} />
          </div>
        )}
      </div>

      {/* monitor + control 2-col: ซ้าย (bid feed) / ขวา (control panel + info card) */}
      <div className="grid grid-cols-1 gap-base lg:grid-cols-3">
        <div className="lg:col-span-2">
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

      {/* mobile sticky action bar (desktop ใช้ cluster ใน ConsoleHead แทน) */}
      <AuctionConsoleActionBar id={auction.id} status={status} />
    </div>
  )
}
