'use client'

/**
 * AuctionConsoleClient — root client wrapper ของ Control Console (`/seller/auctions/[id]`)
 *
 * ถือ state ของ auction (currentPrice/bidCount/endTimeMs/status/antiSnipeCount/bidHistory)
 * เริ่มจาก SSR props (`SellerAuctionDTO`) — Batch E#11 ยังไม่ subscribe realtime, แค่เตรียม
 * state + setter ให้ Batch #12 (Supabase Realtime `channel('auction:'+id).on('broadcast', ...)`)
 * เรียก setter เหล่านี้ต่อได้ทันทีโดยไม่ต้องแก้โครงสร้างไฟล์นี้
 *
 * sync effect: `router.refresh()` (จาก AuctionCountdown ครบเวลา หรือ handler เผยแพร่/ยกเลิก/
 * จบก่อนเวลาใน sub-component) ทำให้ page.tsx (RSC) re-fetch + ส่ง `auction` prop object ใหม่มา —
 * useEffect ผูกกับ `auction` (object reference เปลี่ยนทุกครั้งที่ RSC re-render) เพื่อ re-sync
 * local state ให้ตรงข้อมูลล่าสุดเสมอ (มิเช่นนั้น client state จะค้างค่าตอน mount ครั้งแรก)
 *
 * Base: RSC→client boundary pattern เดียวกับ order-details (holder ถือ props แล้ว fan-out
 * เข้า sub-component ล้วน primitive) — ไฟล์นี้เป็นไฟล์ orchestration ใหม่ (ไม่มี theme file ตรงตัว
 * เพราะ Paces demo ไม่มี "auction console" — ประกอบจาก .card/grid primitive ล้วนตาม UI-DESIGN-SPEC §8.3)
 */

import { useEffect, useState } from 'react'
import type { SellerAuctionDTO } from '@/services/auction.service'
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

export default function AuctionConsoleClient({ auction }: Props) {
  const [currentPrice, setCurrentPrice] = useState(auction.currentPrice)
  const [bidCount, setBidCount] = useState(auction.bidCount)
  const [endTimeMs, setEndTimeMs] = useState(auction.endTimeMs)
  const [status, setStatus] = useState(auction.status)
  const [antiSnipeCount, setAntiSnipeCount] = useState(auction.antiSnipeCount)
  const [bidHistory, setBidHistory] = useState(auction.bidHistory)

  // re-sync ทุกครั้งที่ page.tsx (RSC) ส่ง auction prop ใหม่มา (router.refresh()) — กัน state ค้าง
  useEffect(() => {
    setCurrentPrice(auction.currentPrice)
    setBidCount(auction.bidCount)
    setEndTimeMs(auction.endTimeMs)
    setStatus(auction.status)
    setAntiSnipeCount(auction.antiSnipeCount)
    setBidHistory(auction.bidHistory)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ต้องการ trigger เมื่อ auction object เปลี่ยน (RSC re-render) เท่านั้น
  }, [auction])

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
          <AuctionBidFeed bidHistory={bidHistory} bidCount={bidCount} />
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
