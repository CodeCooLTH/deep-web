'use client'

/**
 * FollowBotRoomProvider — ข้อมูลบอทติดตามของ "ห้องที่เปิดอยู่" ยิง GET follow-bot ครั้งเดียวแล้วแจกให้
 * ชิปหัวห้อง (ChatThread) · แผงข้อมูลลูกค้าบน desktop (CustomerPanel) · ชีตมือถือ (อยู่ใต้ ChatThread) — 00095 S-8b UX §4.1
 *
 * ทำไมเป็น Provider ไม่ใช่ hook ต่อ component: ชิปกับแผงอยู่คนละกิ่งของต้นไม้ (page.tsx วางเป็นพี่น้องกัน)
 * ถ้าต่างคนต่าง fetch จะยิง 2-3 รอบต่อห้อง และตัวเลขสองที่อาจไม่ตรงกันชั่วขณะ
 * (pattern เดียวกับ ThreadShopProvider ใน DraftOrderProvider.tsx ที่ครอบสองฝั่งไว้แล้ว)
 *
 * `enabled=false` (DEEP · ร้านไม่ผ่านด่านนำร่อง · ไม่ใช่ร้านออนไลน์ — page.tsx ตัดสิน) = ไม่ยิงเลย — ไม่เสียคำขอต่อทุกห้องของทุกร้าน
 * หยุดบอท: ยืนยัน (Swal) → optimistic ซ่อน run → ล้ม = เด้งกลับ + toast (AC-FB-88) · ที่เดียวสำหรับชิปและแผง
 *
 * Base: pattern state/context จาก ./DraftOrderProvider.tsx (ThreadShopProvider) · โหลด/ล้ม/รีเฟรชเงียบ จาก inbox/[conversationId]/components/FollowUpPanel.tsx
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { FINAL_ACTION_KEY, createDebounced, createLatestGate, runOf } from '@/lib/follow-bot-room'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { ConversationPanel, PanelRun } from '@/services/sales-follow-bot.service'

export type FollowBotRoomStatus = 'idle' | 'loading' | 'error' | 'ready'

export interface FollowBotRoomValue {
  status: FollowBotRoomStatus
  /** null = ไม่มีบอทตามห้องนี้ (หรือยังไม่โหลด/ปิดไว้) — ชิปและแผงไม่ render อะไร */
  run: PanelRun | null
  stopping: boolean
  /** โหลดใหม่ — silent=true ไม่ขึ้น skeleton/ไม่ทำแผงว่างเมื่อล้ม */
  reload: (silent?: boolean) => Promise<void>
  /** รีเฟรชเงียบแบบ debounce 800ms — ให้ ChatThread เรียกเมื่อข้อความล่าสุดเปลี่ยน */
  reloadSoon: () => void
  /** ยืนยัน + หยุดบอท — สำเร็จ/ล้มมี toast ในตัว */
  stop: () => Promise<void>
}

const NONE: FollowBotRoomValue = {
  status: 'idle',
  run: null,
  stopping: false,
  reload: async () => {},
  reloadSoon: () => {},
  stop: async () => {},
}
const Ctx = createContext<FollowBotRoomValue>(NONE)

/** นอก Provider = ไม่มีบอท (ปลอดภัยกับหน้าที่ใช้ CustomerPanel โดยไม่ผ่านห้องแชท) */
export const useFollowBotRoom = (): FollowBotRoomValue => useContext(Ctx)

export default function FollowBotRoomProvider({
  conversationId,
  enabled,
  children,
}: {
  conversationId: string
  enabled: boolean
  children: ReactNode
}) {
  const t = useT().autoNotify
  // เก็บคู่ (ห้อง, panel) — สลับห้องแล้ว render แรกยังไม่เห็น run ของห้องก่อน (effect ล้างช้ากว่า render หนึ่งจังหวะ)
  const [held, setHeld] = useState<{ room: string; panel: ConversationPanel | null }>({ room: conversationId, panel: null })
  const panel = held.room === conversationId ? held.panel : null
  const setPanel = useCallback((p: ConversationPanel | null) => setHeld({ room: conversationId, panel: p }), [conversationId])
  const [status, setStatus] = useState<FollowBotRoomStatus>(enabled ? 'loading' : 'idle')
  const [stopping, setStopping] = useState(false)
  // ตัวกันคำตอบเก่า: ทุกคำขอเอา token ใหม่ ตอบมาแล้วไม่ใช่ล่าสุด = ทิ้ง — ครอบทั้ง "สองรอบตอบกลับลำดับ" และ
  // "คำตอบห้องเก่ามาช้า" (สลับห้อง = ยิงใหม่ = token เก่าตกรุ่น) จึงไม่ต้องเขียน ref ใน render
  const [gate] = useState(createLatestGate)
  // อ่านตอนกดหยุดเท่านั้น (เขียนใน effect ไม่ใช่ render)
  const panelRef = useRef<ConversationPanel | null>(null)
  useEffect(() => {
    panelRef.current = panel
  }, [panel])

  const url = `/api/chat/conversations/${encodeURIComponent(conversationId)}/follow-bot`

  const reload = useCallback(
    async (silent = false) => {
      if (!enabled) return
      const token = gate.next()
      if (!silent) setStatus('loading')
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as ConversationPanel
        if (!gate.isLatest(token)) return
        setPanel(json)
        setStatus('ready')
      } catch {
        // รีเฟรชเงียบที่ล้ม = คงข้อมูลเดิม · โหลดครั้งแรกล้ม = แผงขึ้นแถว error + ลองใหม่
        if (gate.isLatest(token) && !silent) setStatus('error')
      }
    },
    [enabled, url, gate, setPanel],
  )

  // ข้อความใหม่ถี่ ๆ (บอทส่งหลายชิ้นติดกัน) = ยิงครั้งเดียวหลังเงียบ 800ms
  const debounced = useMemo(() => createDebounced(() => void reload(true), 800), [reload])
  useEffect(() => () => debounced.cancel(), [debounced])

  // เปลี่ยนห้อง/เปิด-ปิดด่าน = ล้างของเก่าก่อนโหลดใหม่ (ไม่ให้ run ของห้องก่อนค้างบนห้องนี้)
  useEffect(() => {
    setPanel(null)
    setStopping(false)
    setStatus(enabled ? 'loading' : 'idle')
    if (enabled) void reload(false)
    else gate.next() // ปิดด่าน = คำตอบที่ยังลอยอยู่ต้องตกรุ่น
  }, [conversationId, enabled, reload, setPanel, gate])

  // กลับมาที่แท็บ = ข้อมูลอาจเก่า (บอทส่งไปแล้ว/ลูกค้าตอบ) — เหมือน useChatMemory
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, reload])

  const stop = useCallback(async () => {
    // BR-FA-12: run ที่ครบรอบแล้วรอ action ท้ายสุด = "ยกเลิก" action (endpoint/ข้อความอีกชุด) ไม่ใช่หยุดบอท
    const pending = runOf(panelRef.current)?.finalPending ?? null
    const ok = await pacesConfirm(
      pending
        ? {
            title: fmt(t.followBotFinalCancelTitle, { action: t[FINAL_ACTION_KEY[pending.kind]] }),
            text: t.followBotFinalCancelText,
            icon: 'warning',
            confirmButtonText: t.followBotFinalCancel,
            cancelButtonText: t.followBotFinalCancelKeep,
            confirmSemantic: 'primary',
          }
        : {
            title: t.followBotStopTitle,
            text: t.followBotStopText,
            icon: 'warning',
            confirmButtonText: t.followBotStop,
            cancelButtonText: t.followBotStopKeep,
            confirmSemantic: 'primary',
          },
    )
    if (!ok) return
    const before = panelRef.current
    // token ของการหยุด: คำตอบ reload เก่าที่ยังลอยอยู่ห้ามทับสถานะ optimistic
    const token = gate.next()
    setStopping(true)
    // optimistic: แถวหายทันที (AC-FB-88) · ล้ม = คืนของเดิม (เฉพาะเมื่อยังเป็นห้อง/รอบล่าสุด)
    setPanel({ available: true, run: null })
    try {
      const res = await fetch(`${url}/${pending ? 'cancel-final' : 'stop'}`, { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      pacesToast.chat.success(pending ? t.followBotFinalCancelled : t.followBotStopped)
      void reload(true)
    } catch {
      if (gate.isLatest(token)) setPanel(before)
      pacesToast.chat.error(pending ? t.followBotFinalCancelFailed : t.followBotStopFailed)
    } finally {
      setStopping(false) // ห้องอื่นรีเซ็ตเองใน effect สลับห้อง จึงไม่ต้องเช็คห้อง
    }
  }, [t, url, reload, gate, setPanel])

  const run = runOf(panel)
  const value = useMemo<FollowBotRoomValue>(
    () => ({ status, run, stopping, reload, reloadSoon: debounced.call, stop }),
    [status, run, stopping, reload, debounced, stop],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
