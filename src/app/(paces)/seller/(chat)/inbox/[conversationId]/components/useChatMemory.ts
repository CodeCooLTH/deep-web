'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MEMORY_POKE_EVENT } from '@/lib/chat-memory-events'
import type {
  ChatMemoryConflict,
  ChatMemoryDto,
  ChatMemoryGetResponse,
  InterestedProductDto,
  InterestedProductPostBody,
  MemoryRefreshResponse,
} from '@/lib/chat-memory-types'

const POLL_MS = 3000
const POLL_MAX = 6
// RK-6: after() ฝั่ง server อาจ claim ช้ากว่า GET แรกหลัง poke จึงถามซ้ำอีกครั้ง
const POKE_RECHECK_MS = 2000

export type SaveMemoryResult =
  | { ok: true; memory: ChatMemoryDto }
  | { ok: false; conflict: true; current: ChatMemoryConflict['current'] }
  | { ok: false; conflict: false }

export type AddProductsResult = { saved: InterestedProductDto[]; skipped: number; full: boolean; failed: boolean }

export type RefreshResult = { ok: true; status: MemoryRefreshResponse['status']; reason?: MemoryRefreshResponse['reason'] } | { ok: false; busy: boolean }

export function useChatMemory(conversationId: string) {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<ChatMemoryGetResponse | null>(null)
  const loadRef = useRef<(silent: boolean) => Promise<void>>(async () => {})
  const updating = data?.ai.updating === true
  const base = `/api/chat/conversations/${encodeURIComponent(conversationId)}`

  // โหลดตอน mount/เปลี่ยนห้อง + กลับมา visible + poke
  useEffect(() => {
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async (silent: boolean) => {
      try {
        const res = await fetch(`${base}/memory`, { signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as ChatMemoryGetResponse
        if (ctrl.signal.aborted) return
        setData(json)
        setStatus('ready')
      } catch {
        // โหลดเงียบ ๆ ล้มเหลวไม่ทับข้อมูลที่มีอยู่ — แสดง error เฉพาะตอนยังไม่เคยได้ข้อมูล
        if (!ctrl.signal.aborted && !silent) setStatus('error')
      }
    }
    loadRef.current = load
    setStatus('loading')
    setData(null)
    void load(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const onPoke = () => {
      void load(true)
      clearTimeout(timer)
      timer = setTimeout(() => void load(true), POKE_RECHECK_MS)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(MEMORY_POKE_EVENT, onPoke)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(MEMORY_POKE_EVENT, onPoke)
    }
  }, [base])

  // ระหว่าง AI กำลังอัปเดต ถามทุก 3 วิ ไม่เกิน 6 ครั้งต่อรอบ (กันวนไม่รู้จบถ้า server ค้าง)
  useEffect(() => {
    if (!updating) return
    let n = 0
    const id = setInterval(() => {
      n += 1
      void loadRef.current(true)
      if (n >= POLL_MAX) clearInterval(id)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [updating, base])

  const reload = useCallback(() => {
    setStatus('loading')
    return loadRef.current(false)
  }, [])

  const applyMemory = useCallback((memory: ChatMemoryDto | null) => {
    setData((d) => (d ? { ...d, memory } : d))
  }, [])
  const applyProducts = useCallback((products: InterestedProductDto[]) => {
    setData((d) => (d ? { ...d, products } : d))
  }, [])

  const saveMemory = useCallback(
    async (text: string, expectedVersion: number | null): Promise<SaveMemoryResult> => {
      try {
        const res = await fetch(`${base}/memory`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, expectedVersion }),
        })
        if (res.ok) return { ok: true, memory: ((await res.json()) as { memory: ChatMemoryDto }).memory }
        if (res.status === 409) {
          const j = (await res.json().catch(() => null)) as ChatMemoryConflict | null
          return { ok: false, conflict: true, current: j?.current ?? null }
        }
      } catch {}
      return { ok: false, conflict: false }
    },
    [base],
  )

  // ทีละรายการตามลำดับ: DUPLICATE นับเป็น skipped, LIMIT_REACHED หยุดทันที (ที่เหลือไม่ยิงต่อ)
  const addProducts = useCallback(
    async (items: InterestedProductPostBody[]): Promise<AddProductsResult> => {
      const out: AddProductsResult = { saved: [], skipped: 0, full: false, failed: false }
      for (const body of items) {
        try {
          const res = await fetch(`${base}/interested-products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (res.ok) {
            out.saved.push(((await res.json()) as { item: InterestedProductDto }).item)
            continue
          }
          const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code
          if (code === 'DUPLICATE') out.skipped += 1
          else if (code === 'LIMIT_REACHED') {
            out.full = true
            break
          } else out.failed = true
        } catch {
          out.failed = true
        }
      }
      return out
    },
    [base],
  )

  // optimistic อยู่ที่ผู้เรียก (ตัดแถวก่อน แล้ว rollback เมื่อคืน false)
  const removeProduct = useCallback(
    async (rowId: string): Promise<boolean> => {
      try {
        const res = await fetch(`${base}/interested-products/${encodeURIComponent(rowId)}`, { method: 'DELETE' })
        return res.ok
      } catch {
        return false
      }
    },
    [base],
  )

  const refresh = useCallback(async (): Promise<RefreshResult> => {
    try {
      const res = await fetch(`${base}/memory/refresh`, { method: 'POST' })
      if (res.ok) {
        const j = (await res.json()) as MemoryRefreshResponse
        return { ok: true, status: j.status, reason: j.reason }
      }
      return { ok: false, busy: res.status === 429 }
    } catch {
      return { ok: false, busy: false }
    }
  }, [base])

  return useMemo(
    () => ({ status, data, reload, applyMemory, applyProducts, saveMemory, addProducts, removeProduct, refresh }),
    [status, data, reload, applyMemory, applyProducts, saveMemory, addProducts, removeProduct, refresh],
  )
}
