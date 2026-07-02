'use client'

/**
 * useAuctionActions — mutation ร่วมของ Control Console (`ConsoleHead` action cluster +
 * `AuctionControlPanel` danger-zone ใช้ตัวเดียวกัน กันเขียน below-reserve retry ซ้ำ 2 ที่)
 *
 * Base logic: src/app/(paces)/seller/(dashboard)/auctions/components/AuctionListClient.tsx
 *   (handlePublishRequest/handleCancelRequest — fetch → pacesToast → router.refresh() pattern)
 * เพิ่ม endEarly() ใหม่ (ไม่มีใน list) — below-reserve double-confirm ตาม
 * `BelowReserveConfirmError` (mapAuctionError → 409 {error, code, currentPrice, hasReserve})
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

type ApiResult = { ok: boolean; status: number; data: any }

async function postJson(path: string, body?: unknown): Promise<ApiResult> {
  const res = await fetch(path, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export function useAuctionActions(auctionId: string) {
  const router = useRouter()
  const [endingEarly, setEndingEarly] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [publishing, setPublishing] = useState(false)

  /** จบประมูลก่อนเวลา — confirm รอบแรก → 409 BELOW_RESERVE_CONFIRM_REQUIRED → confirm รอบ 2 → retry */
  const endEarly = async () => {
    const ok = await pacesConfirm.danger('จบประมูลก่อนเวลา?', 'ปิดรับการเสนอราคาทันที · ย้อนกลับไม่ได้', {
      confirmButtonText: 'ยืนยันจบประมูล',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    setEndingEarly(true)
    try {
      let result = await postJson(`/api/seller/auctions/${auctionId}/end-early`, {})

      if (!result.ok && result.status === 409 && result.data?.code === 'BELOW_RESERVE_CONFIRM_REQUIRED') {
        const priceLabel = `฿${Number(result.data.currentPrice ?? 0).toLocaleString('th-TH')}`
        const confirmBelow = await pacesConfirm.warning(
          'ราคายังไม่ถึง reserve ที่ตั้งไว้',
          `ราคาปัจจุบัน ${priceLabel} — ยืนยันจบประมูลที่ราคานี้ (ถือว่า "ขายไม่ออก")?`,
          { confirmButtonText: 'ยืนยันจบที่ราคานี้', cancelButtonText: 'ไม่ใช่ตอนนี้' },
        )
        if (!confirmBelow) return
        result = await postJson(`/api/seller/auctions/${auctionId}/end-early`, { confirmBelowReserve: true })
      }

      if (result.ok) {
        pacesToast.success(
          result.data?.status === 'ended' ? 'จบประมูลแล้ว — มีผู้ชนะ' : 'จบประมูลแล้ว — ขายไม่ออก',
        )
        router.refresh()
      } else {
        pacesToast.error(typeof result.data?.error === 'string' ? result.data.error : 'จบประมูลไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setEndingEarly(false)
    }
  }

  /** ยกเลิกประมูล — confirm → POST /cancel */
  const cancel = async () => {
    const ok = await pacesConfirm.danger('ยกเลิกประมูลนี้?', 'ประมูลจะถูกปิด · ย้อนกลับไม่ได้', {
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    setCancelling(true)
    try {
      const result = await postJson(`/api/seller/auctions/${auctionId}/cancel`)
      if (result.ok) {
        pacesToast.success('ยกเลิกประมูลแล้ว')
        router.refresh()
      } else {
        pacesToast.error(typeof result.data?.error === 'string' ? result.data.error : 'ยกเลิกประมูลไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setCancelling(false)
    }
  }

  /** เผยแพร่ทันที (draft → live) — ไม่มี confirm (action สร้างสรรค์ ไม่ทำลาย) */
  const publish = async () => {
    setPublishing(true)
    try {
      const result = await postJson(`/api/seller/auctions/${auctionId}/publish`, { mode: 'publishNow' })
      if (result.ok) {
        pacesToast.success('เผยแพร่ประมูลแล้ว')
        router.refresh()
      } else {
        pacesToast.error(typeof result.data?.error === 'string' ? result.data.error : 'เผยแพร่ประมูลไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setPublishing(false)
    }
  }

  /** แชร์ลิงก์ประมูลสาธารณะ (buyer /a/{id}) — copy clipboard (ย้ายจาก ConsoleHead ให้ action bar ใช้ร่วม) */
  const share = async () => {
    const base = (process.env.NEXT_PUBLIC_BUYER_URL ?? '').trim().replace(/\/$/, '')
    const url = `${base}/a/${auctionId}`
    try {
      await navigator.clipboard.writeText(url)
      pacesToast.success('คัดลอกลิงก์ประมูลแล้ว')
    } catch {
      pacesToast.error('คัดลอกลิงก์ไม่สำเร็จ')
    }
  }

  return { endEarly, endingEarly, cancel, cancelling, publish, publishing, share }
}
