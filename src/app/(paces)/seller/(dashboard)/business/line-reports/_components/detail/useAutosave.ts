'use client'

/**
 * useAutosave — บันทึกอัตโนมัติของหน้าตั้งค่ากลุ่ม LINE (00068 · addendum E §4.4)
 *
 * กติกา: patch ที่ยังไม่ส่งรวมเป็นก้อนเดียว (คีย์ซ้ำทับ) · trailing debounce 500ms (PUT ร้าน 800ms แยกคิว) ·
 * ส่งทีละคำขอ (proxy จำกัด mutation 30/นาที/IP และ server ล็อกกลุ่มต่อคำขอ) · `confirmProfit` ไม่ debounce และไปพร้อม `showProfit:true` ·
 * response 200 แทน state ยกเว้นคีย์ที่ยังรอส่ง/กำลังส่ง · ผิดพลาด = revert ไปค่า server ยืนยันล่าสุด + toast
 * ตัดสินใจ pure อยู่ที่ `lib/line-report/autosave.ts` (เทสแล้ว) — ที่นี่เหลือแค่คิว/ตัวจับเวลา
 *
 * 🛑 `return` ของ hook เป็นก้อนใหม่ทุก render — ผู้เรียกห้ามใส่ทั้งก้อนใน deps (hook-return-identity-in-deps) ให้ดึงฟิลด์/ฟังก์ชันเป็นตัวแปรก่อน
 * ฟังก์ชันที่คืนมา (`update`/`updateShops`/`refetch`) คงที่ตลอดอายุคอมโพเนนต์
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesToast } from '@/lib/paces-toast'
import { classifyFailure, coalescePatch, isEmptyPatch, overlaySettings, saveStatusOf, type SaveStatus, type SettingsPatch } from '@/lib/line-report/autosave'
import type { GroupDetailDto } from '@/services/line-report-group.service'

const LIST_HREF = '/business/line-reports'
const SETTINGS_DEBOUNCE_MS = 500
const SHOPS_DEBOUNCE_MS = 800
const SAVED_VISIBLE_MS = 2000

type Result = { ok: boolean; status: number; data: any }
async function call(url: string, method: 'GET' | 'PATCH' | 'PUT', body?: unknown): Promise<Result> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, status: 0, data: {} }
  }
}

type Flight = { patch?: SettingsPatch; shops?: string[] }
type Timer = ReturnType<typeof setTimeout> | undefined

export function useAutosave(initial: GroupDetailDto) {
  const router = useRouter()
  const id = initial.id
  const [server, setServer] = useState(initial)
  const [pending, setPending] = useState<SettingsPatch>({})
  const [pendingShops, setPendingShops] = useState<string[] | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const pendingRef = useRef<SettingsPatch>({})
  const pendingShopsRef = useRef<string[] | null>(null)
  const flightRef = useRef(false)
  const inflightP = useRef<Promise<unknown> | null>(null)
  const due = useRef({ settings: false, shops: false })
  const timers = useRef<{ settings: Timer; shops: Timer; saved: Timer }>({ settings: undefined, shops: undefined, saved: undefined })
  const alive = useRef(true)

  // router.refresh() ของหน้าแม่ (เช่นแพ็กเกจหมดระหว่างแก้) ส่ง DTO ใหม่มา → ใช้เป็นค่า server ยืนยันล่าสุด
  useEffect(() => {
    setServer(initial)
  }, [initial])

  const abandonQueue = useCallback(() => {
    pendingRef.current = {}
    pendingShopsRef.current = null
    due.current = { settings: false, shops: false }
    clearTimeout(timers.current.settings)
    clearTimeout(timers.current.shops)
    setPending({})
    setPendingShops(null)
  }, [])

  const drain = useCallback(async () => {
    if (flightRef.current) return // ไม่ส่งขนาน — จบคำขอที่ค้างแล้วจะเรียก drain ซ้ำเอง
    let patch: SettingsPatch | undefined
    let shops: string[] | undefined
    if (due.current.settings && !isEmptyPatch(pendingRef.current)) {
      patch = pendingRef.current
      pendingRef.current = {}
      due.current.settings = false
      setPending({})
    } else if (due.current.shops && pendingShopsRef.current) {
      shops = pendingShopsRef.current
      pendingShopsRef.current = null
      due.current.shops = false
      setPendingShops(null)
    } else return

    flightRef.current = true
    setFlight({ patch, shops })
    const p = patch ? call(`/api/line-report/groups/${id}`, 'PATCH', patch) : call(`/api/line-report/groups/${id}/shops`, 'PUT', { shopIds: shops })
    inflightP.current = p
    const r = await p
    inflightP.current = null
    flightRef.current = false
    if (!alive.current) return
    setFlight(null)

    if (r.ok) {
      if (patch) setServer(r.data.group as GroupDetailDto)
      else {
        // API §4.4: state มีแค่ OK|LOCKED|DELETED — PURGED แสดงเป็น DELETED
        const next = (r.data.shops as GroupDetailDto['shops']).map((s) => ({ ...s, state: (s.state as string) === 'PURGED' ? ('DELETED' as const) : s.state }))
        setServer((s) => ({ ...s, shops: next }))
      }
      if (isEmptyPatch(pendingRef.current) && !pendingShopsRef.current) {
        setJustSaved(true)
        clearTimeout(timers.current.saved)
        timers.current.saved = setTimeout(() => setJustSaved(false), SAVED_VISIBLE_MS)
      }
    } else {
      const f = classifyFailure(r.status, r.data)
      abandonQueue() // ค่าที่รอส่งต่อยอดจากค่าที่ล้ม → ถอยทั้งหมดไปค่า server ยืนยัน
      setJustSaved(false)
      pacesToast.error(f.toast)
      if (f.effect === 'LIST') router.push(LIST_HREF)
      else if (f.effect === 'REFRESH') router.refresh()
      return
    }
    void drain()
  }, [id, router, abandonQueue])

  const arm = useCallback(
    (kind: 'settings' | 'shops', ms: number) => {
      setJustSaved(false)
      clearTimeout(timers.current[kind])
      timers.current[kind] = setTimeout(() => {
        due.current[kind] = true
        void drain()
      }, ms)
    },
    [drain],
  )

  const update = useCallback(
    (patch: SettingsPatch, opts?: { immediate?: boolean }) => {
      pendingRef.current = coalescePatch(pendingRef.current, patch)
      setPending(pendingRef.current)
      if (opts?.immediate) {
        clearTimeout(timers.current.settings)
        setJustSaved(false)
        due.current.settings = true
        void drain()
      } else arm('settings', SETTINGS_DEBOUNCE_MS)
    },
    [arm, drain],
  )

  const updateShops = useCallback(
    (ids: string[]) => {
      pendingShopsRef.current = ids
      setPendingShops(ids)
      arm('shops', SHOPS_DEBOUNCE_MS)
    },
    [arm],
  )

  /** GET detail ใหม่ (หลังส่งทดสอบ: test/deliveries เปลี่ยน) — ไม่ทับ state ถ้าล้ม */
  const refetch = useCallback(async (): Promise<boolean> => {
    const r = await call(`/api/line-report/groups/${id}`, 'GET')
    if (r.ok && alive.current) setServer(r.data.group as GroupDetailDto)
    return r.ok
  }, [id])

  // ออกจากหน้าตอนยังมีของรอส่ง = ส่งทิ้งไว้ (กันค่าที่เพิ่งกดหาย) · ไม่แตะ state แล้ว
  useEffect(() => {
    alive.current = true
    const t = timers.current
    return () => {
      alive.current = false
      clearTimeout(t.settings)
      clearTimeout(t.shops)
      clearTimeout(t.saved)
      // ไม่ยิงขนานกับคำขอที่ค้างอยู่ (server ล็อกกลุ่มต่อคำขอ) — ต่อท้าย flight แล้วค่อยส่ง: PATCH ก่อน แล้ว PUT
      const patch = pendingRef.current
      const shops = pendingShopsRef.current
      const tail = inflightP.current ?? Promise.resolve()
      void tail.then(async () => {
        if (!isEmptyPatch(patch)) await call(`/api/line-report/groups/${id}`, 'PATCH', patch)
        if (shops) await call(`/api/line-report/groups/${id}/shops`, 'PUT', { shopIds: shops })
      })
    }
  }, [id])

  const group = useMemo<GroupDetailDto>(
    () => ({ ...server, settings: overlaySettings(overlaySettings(server.settings, flight?.patch ?? {}), pending) }),
    [server, flight, pending],
  )
  const shopIds = useMemo(() => pendingShops ?? flight?.shops ?? server.shops.map((s) => s.shopId), [pendingShops, flight, server.shops])
  const status: SaveStatus = saveStatusOf({ dirty: !isEmptyPatch(pending) || pendingShops !== null, inflight: flight !== null, justSaved })

  return { group, shopIds, status, update, updateShops, refetch }
}
