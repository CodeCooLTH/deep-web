'use client'

/**
 * useCapiLines — ดึงกลุ่มเหตุการณ์ CAPI ของห้อง (feature 00097 · TFR-004)
 *
 * ไม่แตะ store/delta ของข้อความ (TD-001) · ไม่ใช้ router.refresh() (ห้ามใน (chat)/**)
 * รอบดึง: 10 วิ ขณะมีชุดรอ/ลองใหม่ · 60 วิ ปกติ · + เมื่อข้อความท้ายเปลี่ยน + เมื่อกลับมาที่แท็บ
 * enabled=false = ไม่ยิงคำขอเลย · 403/404/visible:false = หยุดถาวรในห้องนี้ · ล้ม = คงค่าเดิม ไม่แสดง error
 * ผลที่มาหลังเปลี่ยนห้อง/ถอดตัว (dead) ถูกทิ้ง
 */
import { useEffect, useRef, useState } from 'react'
import { capiNeedsFastRefresh, type CapiLineGroup } from '@/lib/meta-capi/chat-lines'

export type CapiLinesState = { groups: CapiLineGroup[]; channelId: string | null; pageStopped: boolean }
const EMPTY: CapiLinesState = { groups: [], channelId: null, pageStopped: false }
const FAST_MS = 10_000
const SLOW_MS = 60_000

export function useCapiLines(conversationId: string, enabled: boolean, lastMessageId: string | null): CapiLinesState {
  const [state, setState] = useState<CapiLinesState>(EMPTY)
  const loadRef = useRef<() => void>(() => {})

  useEffect(() => {
    setState(EMPTY)
    loadRef.current = () => {}
    if (!enabled) return
    let dead = false
    let inflight = false
    let fast = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (!dead) timer = setTimeout(load, fast ? FAST_MS : SLOW_MS)
    }
    async function load() {
      clearTimeout(timer)
      // แท็บซ่อน = ไม่ยิง (กลับมาที่แท็บแล้ว visibilitychange ดึงให้)
      if (document.visibilityState === 'hidden' || inflight) return schedule()
      inflight = true
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/capi-events`, { cache: 'no-store' })
        if (dead) return
        if (res.status === 403 || res.status === 404) {
          dead = true
          setState(EMPTY)
          return
        }
        if (res.ok) {
          const j = (await res.json()) as { visible?: boolean; groups?: CapiLineGroup[]; channelId?: string | null; pageStopped?: boolean }
          if (dead) return
          if (j.visible === false || !Array.isArray(j.groups)) {
            dead = true
            setState(EMPTY)
            return
          }
          fast = capiNeedsFastRefresh(j.groups)
          setState({ groups: j.groups, channelId: j.channelId ?? null, pageStopped: !!j.pageStopped })
        }
      } catch {
        // ล้ม = คงค่าเดิม ลองรอบถัดไป
      } finally {
        inflight = false
        schedule()
      }
    }
    loadRef.current = load
    void load()
    const onVis = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      dead = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [conversationId, enabled])

  // ข้อความท้ายเปลี่ยน (เข้า/ส่งใหม่) = มีเหตุการณ์ใหม่ได้ → ดึงทันที (single-flight กันซ้อน)
  useEffect(() => {
    loadRef.current()
  }, [lastMessageId])

  return state
}
