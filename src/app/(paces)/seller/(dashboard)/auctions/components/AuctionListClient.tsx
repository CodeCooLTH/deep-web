'use client'

/**
 * AuctionListClient — chip filter (7 สถานะ) + search + orchestrate mobile/desktop views
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx
 *   (chip filter pattern + handleStatusTab router.push + client-side filter pipeline)
 * ต่าง OrdersList: chip filter แสดง "ทั้ง mobile+desktop" แถวเดียว (ไม่ยุบเป็น dropdown บน desktop
 * — corrections จาก Controller); ปุ่ม "สร้างประมูล" มือถือ อยู่แถว search (เหมือน products/components/
 * ProductsListing.tsx mobile toolbar) แทนอยู่ในแถว header ของ layout (layout ไม่ได้ owned)
 *
 * fetch pattern: page.tsx ดึงประมูลทั้งหมดของร้าน (ไม่ filter status ที่ server — เหมือน
 * orders/page.tsx ที่ fetch getOrdersByShop ทั้งหมดแล้วให้ client filter) เพราะ stat strip
 * (AuctionStatStrip) ต้องเห็นภาพรวมทุกสถานะพร้อมกัน ไม่ใช่แค่ filter ปัจจุบัน — chip click
 * ยัง router.push `?status=` เพื่อ URL sync/bookmark ได้เหมือนเดิม แต่ filter จริงทำที่ client
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/utils/helpers'
import type { SellerAuctionListItemDTO } from '@/services/auction.service'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { STATUS_TABS, type AuctionStatus } from './data'
import AuctionRow from './AuctionRow'
import AuctionDataTable from './AuctionDataTable'

type Props = {
  auctions: SellerAuctionListItemDTO[]
  activeStatus: 'all' | AuctionStatus
}

export default function AuctionListClient({ auctions, activeStatus }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [localStatus, setLocalStatus] = useState<'all' | AuctionStatus>(activeStatus)
  const [search, setSearch] = useState('')

  const handleStatusTab = (value: 'all' | AuctionStatus) => {
    setLocalStatus(value)
    if (value === 'all') router.push(pathname, { scroll: false })
    else router.push(`${pathname}?status=${value}`, { scroll: false })
  }

  const filtered = useMemo(() => {
    let list = auctions
    if (localStatus !== 'all') list = list.filter((a) => a.status === localStatus)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter((a) => a.title.toLowerCase().includes(q))
    }
    return list
  }, [auctions, localStatus, search])

  // ─── publish/cancel — POST ไป seller auctions API แล้ว pacesToast + router.refresh() ───
  const handlePublishRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/seller/auctions/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'publishNow' }),
      })
      if (res.ok) {
        pacesToast.success('เผยแพร่ประมูลแล้ว')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(typeof data?.error === 'string' ? data.error : 'เผยแพร่ประมูลไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  const handleCancelRequest = async (id: string) => {
    const auction = auctions.find((a) => a.id === id)
    const label = auction ? `ประมูล "${auction.title}"` : 'ประมูลนี้'
    const ok = await pacesConfirm.danger('ยกเลิกประมูลนี้?', `${label} จะถูกปิด · ย้อนกลับไม่ได้`, {
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/seller/auctions/${id}/cancel`, { method: 'POST' })
      if (res.ok) {
        pacesToast.success('ยกเลิกประมูลแล้ว')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(typeof data?.error === 'string' ? data.error : 'ยกเลิกประมูลไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <>
      {/* chip filter — ใช้ร่วมกันทั้ง mobile + desktop (ไม่ยุบเป็น dropdown) */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {STATUS_TABS.map((tab) => {
          const active = localStatus === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleStatusTab(tab.value)}
              className={cn(
                'badge shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-primary text-white' : 'bg-default-100 text-default-500',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ─── Tablet/Desktop (≥md): DataTable ─── */}
      <div className="hidden md:block">
        <AuctionDataTable
          auctions={filtered}
          onPublishRequest={handlePublishRequest}
          onCancelRequest={handleCancelRequest}
        />
      </div>

      {/* ─── Mobile (<md): search + create + flat row list ─── */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Icon
              icon="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-default-400"
            />
            <input
              type="text"
              className="form-input w-full !pl-9"
              placeholder="ค้นหาชื่อประมูล..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link
            href="/auctions/new"
            className="btn btn-sm min-h-11 shrink-0 bg-primary text-white hover:bg-primary-hover"
          >
            <Icon icon="plus" className="size-4" />
            สร้าง
          </Link>
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <div className="card-body">
              <SellerEmptyState
                compact
                icon="gavel"
                title={auctions.length === 0 ? 'ยังไม่มีรายการประมูล' : 'ไม่มีประมูลในตัวกรองนี้'}
                action={auctions.length === 0 ? { label: '+ สร้างรายการแรก', href: '/auctions/new' } : undefined}
              />
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="divide-y divide-default-100">
              {filtered.map((auction) => (
                <AuctionRow
                  key={auction.id}
                  auction={auction}
                  onPublishRequest={handlePublishRequest}
                  onCancelRequest={handleCancelRequest}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
