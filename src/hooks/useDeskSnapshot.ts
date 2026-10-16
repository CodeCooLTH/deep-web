'use client'

// ห่อ poller ของโต๊ะแชท + signal realtime (SDS TD-09) — เปลี่ยนร้าน/ตัวกรอง = ได้ poller ใหม่และสถานะเริ่มใหม่
import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeShopChat } from '@/lib/chat-shop-realtime'
import { createSnapshotPoller, type SnapshotPoller } from '@/lib/chat-desk/poller'
import type { DeskFilters, DeskSnapshot } from '@/lib/chat-desk/types'

export type DeskSnapshotStatus = 'loading' | 'ok' | 'stale' | 'error' | 'forbidden'

type State = {
  key: string
  snapshot: DeskSnapshot | null
  status: DeskSnapshotStatus
  lastUpdatedAt: number | null
}

function buildUrl(shopId: string | null | undefined, f: DeskFilters): string {
  const q = new URLSearchParams()
  if (shopId) q.set('shopId', shopId)
  if (f.platforms.length) q.set('platforms', f.platforms.join(','))
  if (f.pages.length) q.set('pages', f.pages.join(','))
  if (f.admins.length) q.set('admins', f.admins.join(','))
  const s = q.toString()
  return `/api/chat-desk/snapshot${s ? `?${s}` : ''}`
}

export function useDeskSnapshot(shopId: string | null | undefined, filters: DeskFilters) {
  const url = buildUrl(shopId, filters)
  const [state, setState] = useState<State>({ key: url, snapshot: null, status: 'loading', lastUpdatedAt: null })
  const pollerRef = useRef<SnapshotPoller | null>(null)

  useEffect(() => {
    const poller = createSnapshotPoller<DeskSnapshot>({
      fetchSnapshot: (signal) => fetch(url, { signal, cache: 'no-store' }),
      onData: (snapshot) => setState({ key: url, snapshot, status: 'ok', lastUpdatedAt: Date.now() }),
      // ข้อมูลเดิมยังอยู่ = stale · ยังไม่เคยได้เลย = error
      onError: () =>
        setState((s) => {
          const base = s.key === url ? s : { key: url, snapshot: null, status: 'loading' as const, lastUpdatedAt: null }
          return { ...base, status: base.snapshot ? 'stale' : 'error' }
        }),
      // สิทธิ์หายระหว่างใช้ (AC-24): ล้างข้อมูลเก่าทิ้งทั้งหมด
      onForbidden: () => setState({ key: url, snapshot: null, status: 'forbidden', lastUpdatedAt: null }),
      isVisible: () => document.visibilityState === 'visible',
      subscribeVisibility: (cb) => {
        document.addEventListener('visibilitychange', cb)
        return () => document.removeEventListener('visibilitychange', cb)
      },
    })
    pollerRef.current = poller
    poller.start()
    return () => {
      poller.stop()
      pollerRef.current = null
    }
  }, [url])

  const cur = state.key === url ? state : null
  // ไม่ส่ง shopId = ให้ server เลือก → รู้ id จริงเมื่อได้ snapshot แรก
  const realtimeShopId = shopId ?? cur?.snapshot?.shop.id ?? null
  useEffect(() => {
    if (!realtimeShopId) return
    // ลูกค้าทัก (new_message) + ร้านตอบ (shop_reply · 00077 ext) — ทั้งคู่เป็นแค่สัญญาณให้ดึงใหม่ (poller รวมเป็นรอบเดียว)
    const signal = () => pollerRef.current?.signal()
    const offIn = subscribeShopChat(realtimeShopId, signal)
    const offReply = subscribeShopChat(realtimeShopId, signal, 'shop_reply')
    return () => { offIn(); offReply() }
  }, [realtimeShopId])

  const refresh = useCallback(() => pollerRef.current?.refresh(), [])

  return {
    snapshot: cur?.snapshot ?? null,
    status: (cur?.status ?? 'loading') as DeskSnapshotStatus,
    lastUpdatedAt: cur?.lastUpdatedAt ?? null,
    refresh,
  }
}
