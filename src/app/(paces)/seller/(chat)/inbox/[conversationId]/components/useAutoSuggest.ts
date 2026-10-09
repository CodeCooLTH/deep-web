'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AutoSuggestGetResponse,
  AutoSuggestPatchBody,
  AutoSuggestPostBody,
  AutoSuggestState,
} from '@/lib/ai-suggest-auto-types'
import {
  AUTO_SUGGEST_DEBOUNCE_MS,
  AUTO_SUGGEST_POLL_INTERVAL_MS,
  isResultCurrent,
  nextStep,
  shouldRequest,
} from '@/lib/auto-suggest-machine'

/**
 * คำแนะนำอัตโนมัติ (Typhoon) — hook นี้ "ทำตาม" auto-suggest-machine เท่านั้น ไม่ตัดสินเอง
 * enabled=false ต้องไม่มี fetch/timer/listener เลย (ร้าน Gemini ต้องเหมือนเดิม 100%)
 * ล้มเหลว = state null เงียบ; เฉพาะ regenerate/sendFeedback ที่ throw ให้ผู้เรียกแสดง toast
 */

const base = (id: string) => `/api/chat/conversations/${id}/ai-suggest/auto`

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })

async function call<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal,
    cache: 'no-store',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) throw new Error(`ai-suggest/auto ${res.status}`)
  return (await res.json()) as T
}

type Args = {
  enabled: boolean
  conversationId: string
  latestBuyerMessageId: string | null
  latestMessageIsBuyer: boolean
}

export function useAutoSuggest({ enabled, conversationId, latestBuyerMessageId, latestMessageIsBuyer }: Args) {
  const [state, setState] = useState<AutoSuggestState | null>(null)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  // anchor ที่ขอจนจบแล้ว (key รวม conversation) — กัน visibility สลับแล้วยิง POST ซ้ำ
  const handledRef = useRef<string | null>(null)
  // ห้องที่เคยขอแล้ว — ครั้งแรกของห้อง = AUTO_OPEN, หลังจากนั้น = AUTO_NEW_MESSAGE
  const openedRef = useRef<string | null>(null)
  // regenerate ใช้ค่าล่าสุดผ่าน ref เพื่อไม่ให้ callback เปลี่ยนตัวทุกข้อความ
  const liveRef = useRef({ conversationId, anchor: latestBuyerMessageId, isBuyer: latestMessageIsBuyer, state })
  liveRef.current = { conversationId, anchor: latestBuyerMessageId, isBuyer: latestMessageIsBuyer, state }
  const regenAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) return
    const onVis = () => setVisible(document.visibilityState === 'visible')
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled])

  /** รอ THINKING จนจบ (หรือยอมแพ้) — ใช้ร่วมกับ auto flow และ regenerate */
  const settle = useCallback(
    async (
      conv: string,
      first: AutoSuggestState,
      source: 'GET' | 'POST',
      anchor: string,
      signal: AbortSignal,
    ): Promise<AutoSuggestState | null> => {
      let cur = first
      let src = source
      let pollStart: number | null = null
      for (;;) {
        const step = nextStep(src, cur, pollStart === null ? 0 : Date.now() - pollStart)
        if (step === 'done') return cur
        if (step === 'giveup') return null
        if (step === 'post') {
          const body: AutoSuggestPostBody = { anchorMessageId: anchor, manual: false, trigger: 'AUTO_OPEN' }
          cur = await call<AutoSuggestState>(base(conv), { method: 'POST', body: JSON.stringify(body) }, signal)
          src = 'POST'
        } else {
          if (pollStart === null) pollStart = Date.now()
          await wait(AUTO_SUGGEST_POLL_INTERVAL_MS, signal)
          cur = await call<AutoSuggestGetResponse>(base(conv), { method: 'GET' }, signal)
          src = 'GET'
        }
        if (!isResultCurrent(cur, anchor, true)) return null
      }
    },
    [],
  )

  // anchor/ห้องเปลี่ยน → ผลเก่าต้องไม่ค้าง (แยก effect เพื่อไม่ล้างผลตอนแค่สลับแท็บ; render กรองซ้ำด้วย isResultCurrent)
  useEffect(() => {
    setState(null)
  }, [conversationId, latestBuyerMessageId])

  useEffect(() => {
    const key = latestBuyerMessageId ? `${conversationId}:${latestBuyerMessageId}` : null
    if (
      !shouldRequest({
        enabled,
        visible,
        latestMessageIsBuyer,
        anchorId: key,
        handledAnchorId: handledRef.current,
      }) ||
      !latestBuyerMessageId
    ) {
      return
    }
    const anchor = latestBuyerMessageId
    const isOpen = openedRef.current !== conversationId
    const ac = new AbortController()
    ;(async () => {
      try {
        // เปิดห้อง: GET เลย (อ่านของเดิมก่อน); ข้อความใหม่: debounce กัน A แล้ว B ติดกัน
        if (!isOpen) await wait(AUTO_SUGGEST_DEBOUNCE_MS, ac.signal)
        const got = await call<AutoSuggestGetResponse>(base(conversationId), { method: 'GET' }, ac.signal)
        if (!isResultCurrent(got, anchor, true)) return
        let result: AutoSuggestState | null
        if (got.status === 'NONE' && got.reason === 'NO_RUN') {
          const body: AutoSuggestPostBody = {
            anchorMessageId: anchor,
            manual: false,
            trigger: isOpen ? 'AUTO_OPEN' : 'AUTO_NEW_MESSAGE',
          }
          const posted = await call<AutoSuggestState>(
            base(conversationId),
            { method: 'POST', body: JSON.stringify(body) },
            ac.signal,
          )
          result = isResultCurrent(posted, anchor, true)
            ? await settle(conversationId, posted, 'POST', anchor, ac.signal)
            : null
        } else {
          result = await settle(conversationId, got, 'GET', anchor, ac.signal)
        }
        handledRef.current = key
        if (result && !ac.signal.aborted) setState(result)
      } catch {
        // abort หรือ network/HTTP ล้ม → เงียบ (state คง null)
      }
    })()
    return () => ac.abort() // anchor เปลี่ยน/ซ่อนแท็บ/unmount → ตัด timer + fetch ที่ค้าง
  }, [enabled, visible, conversationId, latestBuyerMessageId, latestMessageIsBuyer, settle])

  // "เปิดห้อง" = render แรกของห้องนี้เท่านั้น ต้องตั้งหลัง effect ขอผลข้างบนเสมอ (ลำดับ effect = ลำดับประกาศ)
  // ถ้าตั้งตอนจบ flow แทน: เปิดห้องที่ข้อความล่าสุดเป็นของร้าน (ไม่มี flow) แล้วลูกค้าส่งตามมา
  // จะถูกนับเป็น AUTO_OPEN และข้าม debounce
  useEffect(() => {
    openedRef.current = conversationId
  }, [conversationId])

  useEffect(() => () => regenAbortRef.current?.abort(), [])

  const regenerate = useCallback(async () => {
    const { conversationId: conv, anchor, isBuyer, state: prev } = liveRef.current
    if (!anchor || !isBuyer) return
    regenAbortRef.current?.abort()
    const ac = new AbortController()
    regenAbortRef.current = ac
    setState({ status: 'THINKING', anchorMessageId: anchor, attempt: (prev && 'attempt' in prev ? prev.attempt : 0) ?? 0 })
    try {
      const body: AutoSuggestPostBody = { anchorMessageId: anchor, manual: true }
      const posted = await call<AutoSuggestState>(base(conv), { method: 'POST', body: JSON.stringify(body) }, ac.signal)
      const next = await settle(conv, posted, 'POST', anchor, ac.signal)
      const live = liveRef.current
      if (ac.signal.aborted || live.anchor !== anchor) return
      if (!next || next.status === 'NONE') throw new Error('regenerate failed')
      setState(next)
    } catch (e) {
      // ถูกแทนที่ด้วยการกดซ้ำ/unmount = ไม่ใช่ความผิดพลาด ห้ามให้ผู้เรียกขึ้น toast
      if (ac.signal.aborted) return
      // ล้ม → คืนคำแนะนำเดิม (UX: คำแนะนำเดิมยังอยู่ + toast) แล้วให้ผู้เรียกแสดงเตือน
      if (liveRef.current.anchor === anchor) setState(prev)
      throw e
    }
  }, [settle])

  const sendFeedback = useCallback(async (body: AutoSuggestPatchBody) => {
    await call<{ ok: true }>(base(liveRef.current.conversationId), { method: 'PATCH', body: JSON.stringify(body) })
    setState((s) =>
      s && s.status === 'READY' && s.anchorMessageId === body.anchorMessageId && s.attempt === body.attempt
        ? { ...s, feedback: body.feedback }
        : s,
    )
  }, [])

  // กรองตอน render: ผลของ anchor เก่า/ร้านตอบไปแล้ว ต้องไม่โผล่แม้ effect ยังไม่ทันล้าง
  const current = state && isResultCurrent(state, latestBuyerMessageId, latestMessageIsBuyer) ? state : null
  return useMemo(() => ({ state: current, regenerate, sendFeedback }), [current, regenerate, sendFeedback])
}
