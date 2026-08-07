'use client'

/**
 * CanvasFrame — คอลัมน์กลาง "จัดหน้าร้าน" ของตัวจัดหน้าร้าน (feature 00035, Task 7)
 *
 * [สำคัญ] เวอร์ชันนี้เป็น "โครง" — render <iframe> จริงของหน้าร้าน (ผ่าน builderDraft=1) และ
 * ส่ง DEEP_BUILDER_DRAFT_STATE เข้าไปทุกครั้งที่ draft เปลี่ยน/iframe โหลดเสร็จ (TFR-008) ครบตาม
 * สัญญา postMessage ที่ล็อกไว้แล้ว — **ยังไม่ implement** overlay layer (วาดกรอบ/⋮ menu จาก
 * DEEP_BUILDER_BLOCK_RECTS ที่ Canvas ตอบกลับ) และ drag-reorder ของบล็อกเหนือแถบแท็บ/แถบแท็บเอง
 * (SDS build order ข้อ 8 — Task 8 "ต้องมี Bridge เสร็จก่อน — เป็นฝั่งส่ง/รับ message คู่กัน + drag
 * logic") onReorderBlocks/onReorderTabs/onRemoveBlock รับมาตาม prop contract ไว้แล้ว รอ Task 8 เรียกใช้
 *
 * Base: docs/superpowers/specs/2026-08-07-00034-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" คอลัมน์ "พื้นที่จัดหน้า" (card-header + กล่อง iframe กึ่งกลาง)
 *   — บล็อก/overlay/ghost/dropline ในภาพ mockup เป็น "ภาพแทน" ของสิ่งที่ canvas จริงจะ render เอง
 *   ผ่าน iframe (mockup §5 ข้อ 1 ระบุไว้ตรง ๆ ว่า "บล็อกใน canvas ของ mockup นี้เป็นภาพแทน ไม่ใช่สิ่งที่
 *   จะ implement ตรง ๆ") — โครง card/card-header ที่นี่คัดลอกมาเป๊ะ ส่วนเนื้อใน canvas ปล่อยให้ iframe
 *   ของหน้าจริงเป็นคน render (TD-001 §6 ของ SDS: canvas ต้องเป็น iframe ไม่ใช่วาดเองด้วย Paces token)
 *
 * origin validation: ใช้ isAllowedOrigin() ตัวเดียวกับฝั่ง Canvas (BuilderPreviewBridge.tsx) — Host
 * เป็นคนตั้ง src เอง จึงคำนวณ targetOrigin จาก src ตรง ๆ ได้ (TFR-008 precondition)
 */
import { useCallback, useEffect, useRef } from 'react'

import { isAllowedOrigin } from '@/lib/csrf-origin'

import { draftToMessagePayload } from '../lib/draft'
import type { CanvasFrameProps, DeepBuilderDraftStateMessage } from '../types'

export default function CanvasFrame({
  src,
  draft,
  // Task 8 จะเรียกใช้ 3 ตัวนี้จริงตอนเติม overlay + drag — รับไว้ตาม prop contract ก่อน (types.ts)
  onReorderBlocks: _onReorderBlocks,
  onReorderTabs: _onReorderTabs,
  onRemoveBlock: _onRemoveBlock,
}: CanvasFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const sendDraftState = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    // Host คำนวณ targetOrigin จาก src เอง (เป็นคนตั้งค่านี้อยู่แล้ว) — ตรวจซ้ำผ่าน isAllowedOrigin()
    // กันตั้ง src ผิดพลาดโดยไม่ได้ตั้งใจ ห้ามส่งด้วย targetOrigin='*' เด็ดขาด (TFR-008)
    let targetOrigin: string
    try {
      targetOrigin = new URL(src).origin
    } catch {
      return
    }
    if (!isAllowedOrigin(targetOrigin)) return
    const message: DeepBuilderDraftStateMessage = {
      type: 'DEEP_BUILDER_DRAFT_STATE',
      payload: draftToMessagePayload(draft),
    }
    win.postMessage(message, targetOrigin)
  }, [src, draft])

  // draft เปลี่ยน (เพิ่ม/ลบ/ลาก/tabOrder) → ส่งซ้ำเสมอ (SDS §4.1)
  useEffect(() => {
    sendDraftState()
  }, [sendDraftState])

  return (
    <div className="card flex min-h-0 flex-1 flex-col">
      <div className="card-header flex items-center py-3">
        <h4 className="card-title flex-1 text-sm">จัดหน้าร้าน</h4>
        <span className="text-default-400 text-2xs">ลากเพื่อสลับลำดับ</span>
      </div>
      <div className="bg-default-100 flex min-h-0 flex-1 justify-center overflow-auto p-4">
        <iframe
          ref={iframeRef}
          src={src}
          // iframe ยังโหลดไม่เสร็จตอน Host ส่งครั้งแรก (ก่อน onLoad) → ส่งซ้ำตอน onLoad เป็น
          // "final source of truth" ครั้งแรกเสมอ กัน race ตอน mount (TFR-008 edge case)
          onLoad={sendDraftState}
          title="ตัวอย่างหน้าร้าน — กำลังแก้ไข"
          className="border-default-300 h-full w-full max-w-[420px] rounded-xl border bg-white shadow" /* HR7 carve-out: ล็อกความกว้างจอมือถือจำลองในกรอบ canvas ตามสัดส่วนอุปกรณ์จริงใน mockup — Paces ไม่มี token */
        />
      </div>
    </div>
  )
}
