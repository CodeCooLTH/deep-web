'use client'

/**
 * BuilderPreviewBridge — สะพาน postMessage ฝั่ง Canvas (หน้าร้านสาธารณะ /u,/b) สำหรับ Shop Page Builder
 * (feature 00035, SRS TFR-008, SDS §4.1) mount เฉพาะเมื่อ query param `builderDraft=1` (ดู page.tsx ทั้งสองเส้นทาง)
 *
 * ไม่ใช่ UI ที่มีดีไซน์ของตัวเอง — เป็นตัวสื่อสาร/ตัวห่อ state ล้วน (ไม่มี theme source ให้ copy
 * ตาม Hard Rule 1: ไม่มีมาร์กอัปที่ผู้ใช้เห็น มีแค่ <div> ว่างสำหรับ ref วัดขนาด)
 *
 * หน้าที่:
 *   1) ฟัง `DEEP_BUILDER_DRAFT_STATE` จาก Host (builder ฝั่ง seller.*) — ตรวจ origin ก่อนเสมอ
 *      (reuse isAllowedOrigin() จาก csrf-origin.ts — ห้ามเขียน allow-list ใหม่ซ้ำ, SDS TFR-008)
 *   2) เก็บ override เป็น React Context ให้ ShopProfile.tsx อ่านแทนค่าที่ SSR ส่งมา (ไม่ query ใหม่)
 *   3) วัด getBoundingClientRect() ของแต่ละบล็อกเหนือแถบแท็บ (data-block-key จาก PageBlocksSection)
 *      แล้วตอบกลับด้วย `DEEP_BUILDER_BLOCK_RECTS` — throttle ด้วย requestAnimationFrame ตาม SDS
 *   4) ส่ง rects ใหม่ทุกครั้งที่ resize/scroll/เนื้อหาเปลี่ยน (ResizeObserver) ไม่ใช่ครั้งเดียวตอนโหลด
 *
 * Message contract (ต้องตรงกับฝั่ง Host ที่ CanvasFrame/BuilderClient จะสร้างต่อ — SDS §4.1):
 *   Host -> Canvas: { type: 'DEEP_BUILDER_DRAFT_STATE', payload: { tabOrder: string[], blocks: DraftBlockPayload[] } }
 *   Canvas -> Host: { type: 'DEEP_BUILDER_BLOCK_RECTS', payload: { blocks: BlockRect[], scrollTop, scrollHeight } }
 * targetOrigin ห้ามเป็น '*' ทั้งสองทาง — ฝั่งนี้ตอบกลับด้วย event.origin ที่ผ่าน isAllowedOrigin() แล้วเท่านั้น
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { isAllowedOrigin } from '@/lib/csrf-origin'

import type { PageBlockItem } from './PageBlocksSection'

// ---- shared message shapes (mirror ฝั่ง Host — src/app/(paces)/seller/(fullscreen)/public-profile/builder/types.ts) ----

/** badge/post shape แบบย่อที่ Host ส่งมาใน DRAFT_STATE — ไม่เท่ากับ PageBlockBadge/PageBlockPost เต็มรูป (SDS §4.1) */
type DraftBlockPayload =
  | { key: string; type: 'BADGE_HIGHLIGHT'; badges: Array<{ id: string; name: string; icon: string }> }
  | {
      key: string
      type: 'FACEBOOK_POST'
      post: {
        id: string
        message: string | null
        imageUrl: string | null
        mediaType: string | null
        reactionCount: number | null
        fbCommentCount: number | null
        shareCount: number | null
      }
    }

type DraftStateMessage = {
  type: 'DEEP_BUILDER_DRAFT_STATE'
  payload: { tabOrder: string[]; blocks: DraftBlockPayload[] }
}

type BlockRect = { key: string; top: number; left: number; width: number; height: number }

type BlockRectsMessage = {
  type: 'DEEP_BUILDER_BLOCK_RECTS'
  payload: { blocks: BlockRect[]; scrollTop: number; scrollHeight: number }
}

/** ค่า override ที่ ShopProfile.tsx อ่านแทน data.tabOrder/data.blocks เดิม — null = ยังไม่มี draft เข้ามา/ไม่ได้อยู่โหมด draft */
export type BuilderDraftOverride = { tabOrder: string[]; blocks: PageBlockItem[] } | null

const BuilderDraftContext = createContext<BuilderDraftOverride>(null)

/** ShopProfile.tsx เรียกอ่านค่านี้แทน — ไม่มี Provider ห่อ (โหมดปกติ) จะได้ null เสมอ ไม่กระทบ behavior เดิม */
export function useBuilderDraftOverride(): BuilderDraftOverride {
  return useContext(BuilderDraftContext)
}

/** message payload -> PageBlockItem ที่ ShopProfile/PageBlocksSection render ได้ตรง ๆ (permalink ไม่มีใน draft — เป็น null ไปก่อน) */
function toPageBlockItem(block: DraftBlockPayload, index: number): PageBlockItem {
  if (block.type === 'BADGE_HIGHLIGHT') {
    return {
      id: block.key,
      type: 'BADGE_HIGHLIGHT',
      sortOrder: index,
      badges: block.badges.map((b) => ({ id: b.id, name: b.name, nameEN: '', icon: b.icon, imageUrl: null })),
    }
  }
  return {
    id: block.key,
    type: 'FACEBOOK_POST',
    sortOrder: index,
    post: { ...block.post, permalink: null },
  }
}

export default function BuilderPreviewBridge({
  enabled,
  children,
}: {
  /** true เฉพาะเมื่อ query param builderDraft=1 (page.tsx เช็คก่อนส่งมา) */
  enabled: boolean
  children: ReactNode
}) {
  const [override, setOverride] = useState<BuilderDraftOverride>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // จำ source/origin ของ Host ล่าสุดที่ผ่าน isAllowedOrigin() แล้ว — ใช้ตอบ RECTS แม้ trigger จาก
  // scroll/resize ของ Canvas เอง (ไม่ต้องรอ Host ถามใหม่ — ตาม SDS §4.1 Note)
  const senderRef = useRef<{ source: Window; origin: string } | null>(null)
  const rafRef = useRef<number | null>(null)

  // ส่ง DEEP_BUILDER_BLOCK_RECTS กลับ — throttle 1 ครั้งต่อ animation frame (SDS §4.1: "throttle ที่ requestAnimationFrame เท่านั้น")
  const scheduleSendRects = useCallback(() => {
    if (!enabled) return
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const sender = senderRef.current
      const container = containerRef.current
      if (!sender || !container) return // ยังไม่เคยได้ DRAFT_STATE เลย — ไม่มีที่ให้ตอบกลับ
      const blocks: BlockRect[] = Array.from(
        container.querySelectorAll<HTMLElement>('[data-block-key]'),
      ).map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          key: el.dataset.blockKey ?? '',
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }
      })
      const message: BlockRectsMessage = {
        type: 'DEEP_BUILDER_BLOCK_RECTS',
        payload: { blocks, scrollTop: window.scrollY, scrollHeight: document.documentElement.scrollHeight },
      }
      // ตอบกลับด้วย origin ของ sender ที่ validate แล้วเท่านั้น — ห้าม '*' (SDS TFR-008)
      sender.source.postMessage(message, sender.origin)
    })
  }, [enabled])

  // รับ DEEP_BUILDER_DRAFT_STATE จาก Host
  useEffect(() => {
    if (!enabled) return
    function handleMessage(event: MessageEvent) {
      // origin ไม่ผ่าน allow-list -> ทิ้งเงียบ ไม่ throw ไม่ log payload (อาจเป็น noise จาก extension อื่น — SDS §4.1)
      if (!isAllowedOrigin(event.origin)) return
      if (!event.source || !(event.source as Window).postMessage) return
      const data = event.data as { type?: unknown }
      if (data?.type !== 'DEEP_BUILDER_DRAFT_STATE') return
      const message = event.data as DraftStateMessage
      senderRef.current = { source: event.source as Window, origin: event.origin }
      setOverride({
        tabOrder: message.payload.tabOrder,
        blocks: message.payload.blocks.map(toPageBlockItem),
      })
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [enabled])

  // draft ใหม่เข้ามา -> ตอบ rects ทันที (ไม่ต้องรอ ResizeObserver รอบถัดไป)
  useEffect(() => {
    if (!enabled) return
    if (override == null) return
    scheduleSendRects()
  }, [enabled, override, scheduleSendRects])

  // scroll/resize ของ Canvas เอง -> ต้องส่ง rects ใหม่เสมอ ไม่ใช่แค่ตอนโหลดครั้งแรก
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('scroll', scheduleSendRects, { passive: true })
    window.addEventListener('resize', scheduleSendRects)
    return () => {
      window.removeEventListener('scroll', scheduleSendRects)
      window.removeEventListener('resize', scheduleSendRects)
    }
  }, [enabled, scheduleSendRects])

  // เนื้อหาเปลี่ยน (รูปโหลดเสร็จ/บล็อกถูกเพิ่ม-ลบ ทำให้ความสูงเปลี่ยน) -> ResizeObserver จับแทนการ poll
  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => scheduleSendRects())
    observer.observe(container)
    return () => observer.disconnect()
  }, [enabled, scheduleSendRects])

  if (!enabled) return <>{children}</>

  return (
    <BuilderDraftContext.Provider value={override}>
      <div ref={containerRef}>{children}</div>
    </BuilderDraftContext.Provider>
  )
}
