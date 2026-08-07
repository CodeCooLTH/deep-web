'use client'

/**
 * CanvasFrame — คอลัมน์กลาง "จัดหน้าร้าน" ของตัวจัดหน้าร้าน (feature 00035)
 * Task 7 วางโครง (iframe จริง + ส่ง DEEP_BUILDER_DRAFT_STATE) — Task 8 เติม 2 เรื่องที่ทิ้งไว้:
 *   1) รับ DEEP_BUILDER_BLOCK_RECTS จาก Canvas (BuilderPreviewBridge.tsx) แล้ววาด overlay ทับ
 *      ตำแหน่งบล็อกจริงใน iframe — กรอบไฮไลต์ + ป้ายชื่อบล็อก + โทรบาร์ลอย (จับลาก/ขึ้น/ลง/⋮ นำออก)
 *   2) ลากสลับลำดับ "บล็อกเหนือแถบแท็บ" ภายใน overlay นี้เอง — host-DOM ล้วน ไม่แตะ iframe จนกว่าจะ
 *      ปล่อยมือ (ยิง DEEP_BUILDER_DRAFT_STATE ใหม่ผ่าน useEffect ที่ผูกกับ draft อยู่แล้ว แค่ตอน
 *      handleDragEnd อัปเดต draft ไม่ใช่ทุก dragover)
 *
 * ทำไม overlay ไม่ต้องคำนวณ offset จาก iframe เอง (ไม่มี hostRect + iframe.clientLeft/Top):
 * wrapper (position:relative) ห่อ <iframe> พอดีตัว (iframe = 100% ของ content box ของ wrapper
 * ไม่มี padding คั่น, border/rounded/shadow ย้ายมาไว้ที่ wrapper แทน) — ตามสเปก CSS origin ของ
 * absolute children คือ "padding edge" ของ ancestor ซึ่งตรงกับจุดเริ่มต้นของ iframe เป๊ะไม่ว่า
 * wrapper จะมี border หนาแค่ไหน (border อยู่นอก padding edge) — ผลคือ rect.top/rect.left จาก
 * bridge (viewport-relative ของ "หน้าใน iframe") ใช้เป็น top/left ของ overlay ได้ตรง ๆ
 *
 * sync ตำแหน่งใหม่เมื่อ iframe scroll/resize: Bridge (BuilderPreviewBridge.tsx, นอกโฟลเดอร์นี้ —
 * ล็อกแล้ว ห้ามแตะ) เป็นคนส่ง BLOCK_RECTS ใหม่มาเองทุกครั้งที่ scroll/resize/เนื้อหาเปลี่ยน
 * (ResizeObserver) ฝั่งนี้แค่ setState ตามที่ได้รับ ไม่คำนวณเดา (สั่งตรงจาก Controller) — ส่วน resize
 * ของ wrapper เอง (host ปรับขนาดจอ) ก็ทำให้ iframe รีโฟลว์เป็นวิวพอร์ตใหม่ ซึ่ง trigger `resize`
 * event ข้างในตัว iframe เองตามสเปก embedded browsing context อยู่แล้ว — ไม่ต้องมี listener ฝั่ง
 * host เพิ่ม
 *
 * origin validation: isAllowedOrigin() ตัวเดียวกับฝั่ง Canvas — event.source ต้องตรงกับ
 * iframeRef.current.contentWindow ด้วย (กันข้อความจาก window อื่นที่บังเอิญ origin ผ่าน allow-list)
 *
 * scope ที่ตัดสินใจเอง (Task 8): onReorderTabs รับไว้ตาม prop contract (types.ts ล็อกไว้) แต่ยัง
 * "ไม่เรียกใช้" ในไฟล์นี้ — แถบแท็บใน PageBlocksSection/ProfileTabs.tsx ไม่มี data-block-key เลย
 * (bridge ที่ล็อกแล้วไม่ได้วัดตำแหน่งแท็บให้) จึงไม่มี rect ให้วาด overlay ลากได้จริงโดยไม่เดาตำแหน่ง
 * — สลับลำดับแท็บทำได้ที่ LibraryPanel.tsx เท่านั้น (ตรงตาม dispatch ข้อ 2(ข)) ส่วนหัวโปรไฟล์และแถบ
 * แท็บก็ไม่มี rect เช่นกัน จึงไม่มี overlay ให้เผลอใส่ที่จับลาก/ปุ่มลำดับ/ปุ่มลบ — เป็นไปตาม guardrail
 * "หัวโปรไฟล์ตรึงบนสุด ไม่มีที่จับลาก ไม่มีปุ่มลำดับ ไม่มีปุ่มลบ" โดยธรรมชาติของสถาปัตยกรรมนี้เอง
 *
 * ไม่มี isDropDisabled/สถานะ "ปฏิเสธ" ของ mockup §3 การ์ดแรก: droppableId เดียวใน DragDropContext
 * นี้ (ไม่มี cross-column drag ตามที่เคาะไว้ในสเปก "วิธีเพิ่มบล็อกคือปุ่มบวก ไม่ใช่ลากข้ามคอลัมน์")
 * ทำให้ไม่มีบล็อกจากที่อื่นมาลากเข้ามาให้ต้องปฏิเสธเลยโดยสถาปัตยกรรม
 *
 * Base ของกลไกลาก (HR1): theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx
 *   (DragDropContext + Droppable + Draggable, @hello-pangea/dnd) — ต่างจาก Board.tsx ตรงที่ที่นี่ผูก
 *   dragHandleProps กับปุ่มจับลากเล็ก ๆ ในโทรบาร์แยกจากตัวบล็อก (ไม่ผูกทั้งการ์ดเป็น handle แบบ
 *   Board.tsx) เพราะปุ่มลูกศร/⋮ ต้องกดได้โดยไม่โดน drag hijack (mockup หัวข้อ 1 ".mk-tool")
 *   ระยะทางลากหลายช่องต่อครั้ง: DropResult ให้แค่ index ปลายทาง ไม่ใช่ array ใหม่ทั้งก้อน — ใช้
 *   moveToIndex() (lib/draft.ts) ซึ่งวนเรียก moveArrayItem() ทีละสเต็ปแทน splice ตรง ๆ (พิสูจน์แล้ว
 *   ว่าผลลัพธ์เดียวกัน) ให้ตรรกะสลับตำแหน่งเดินทางเดียวกับปุ่มลูกศรเสมอ
 *
 * Base ของ markup: docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html หัวข้อ 1
 *   (.mk-chrome กรอบไฮไลต์ / .mk-tag ป้ายชื่อบล็อกมุมซ้ายบน / .mk-tool โทรบาร์มุมขวาบน) และหัวข้อ 3
 *   (.mk-ghost ระหว่างลาก — เอียง + เงา)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'

import Icon from '@/components/wrappers/Icon'
import { isAllowedOrigin } from '@/lib/csrf-origin'
import { pacesConfirm } from '@/lib/paces-swal'

import { draftToMessagePayload, moveArrayItem, moveToIndex } from '../lib/draft'
import type {
  BuilderDraftBlock,
  CanvasFrameProps,
  DeepBuilderBlockRect,
  DeepBuilderBlockRectsMessage,
  DeepBuilderDraftStateMessage,
} from '../types'

// ป้ายชื่อบล็อกบน overlay (.mk-tag) — "เหรียญตราเด่น" มาจากกลุ่ม 1 ของ LibraryPanel.tsx เดิมเพื่อให้ผู้ขายอ่านคำเดียวกันทั้ง 2 คอลัมน์
const BLOCK_LABEL: Record<BuilderDraftBlock['type'], string> = {
  BADGE_HIGHLIGHT: 'เหรียญตราเด่น',
  FACEBOOK_POST: 'โพสต์จากเพจ Facebook',
}

function blockRemoveLabel(block: BuilderDraftBlock): string {
  if (block.type === 'BADGE_HIGHLIGHT') return 'เหรียญตราเด่น'
  return block.post.message?.trim() ? block.post.message.slice(0, 30) : 'โพสต์จากเพจ Facebook'
}

export default function CanvasFrame({
  src,
  draft,
  onReorderBlocks,
  // ดู comment บนไฟล์ (scope ที่ตัดสินใจเอง) — ไม่มี rect ของแถบแท็บให้วาด overlay ลากในคอลัมน์นี้
  onReorderTabs: _onReorderTabs,
  onRemoveBlock,
}: CanvasFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [blockRects, setBlockRects] = useState<DeepBuilderBlockRect[]>([])

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

  // Task 8 — รับตำแหน่งบล็อกจริงกลับจาก Canvas (BuilderPreviewBridge.tsx) เพื่อวาด overlay ทับ
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // origin ไม่ผ่าน allow-list -> เมินเงียบ ไม่ throw ไม่ log payload (SDS §4.1)
      if (!isAllowedOrigin(event.origin)) return
      // ต้องมาจาก iframe ของเราจริง ๆ ไม่ใช่ window อื่นที่บังเอิญ origin ผ่าน allow-list เดียวกัน
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as { type?: unknown }
      if (data?.type !== 'DEEP_BUILDER_BLOCK_RECTS') return
      setBlockRects((event.data as DeepBuilderBlockRectsMessage).payload.blocks)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const rectByKey = useMemo(() => new Map(blockRects.map((r) => [r.key, r] as const)), [blockRects])

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination } = result
      if (!destination || destination.index === source.index) return
      onReorderBlocks(moveToIndex(draft.blocks, source.index, destination.index))
    },
    [draft.blocks, onReorderBlocks],
  )

  const handleRemove = useCallback(
    async (block: BuilderDraftBlock) => {
      const confirmed = await pacesConfirm.danger(
        `นำ "${blockRemoveLabel(block)}" ออกจากหน้าร้าน?`,
        'ลูกค้าจะไม่เห็นส่วนนี้อีก จนกว่าจะเพิ่มกลับมา',
        { confirmButtonText: 'นำออก' },
      )
      if (!confirmed) return
      onRemoveBlock(block.key)
    },
    [onRemoveBlock],
  )

  return (
    // [สำคัญ] h-full จำเป็น — .card ของ Paces เป็น height:fit-content ชนะ items-stretch ทำให้การ์ดนี้
    // สูงเท่าเนื้อหา (230px วัดจริงบน prod) แล้ว h-full ของ wrapper iframe ข้างในยุบตาม เหลือ 150px
    // หน้าร้านเลยไม่ขึ้น ดู feedback_paces_card_hfit_vs_hfull
    <div className="card h-full flex min-h-0 flex-1 flex-col">
      <div className="card-header flex items-center py-3">
        <h4 className="card-title flex-1 text-sm">จัดหน้าร้าน</h4>
        <span className="text-default-400 text-2xs">ลากเพื่อสลับลำดับ</span>
      </div>
      <div className="bg-default-100 flex min-h-0 flex-1 justify-center overflow-auto p-4">
        {/* wrapper เดียวที่ต้องมี position:relative — border/rounded/shadow ย้ายมาจาก <iframe> เดิม
            (Task 7) มาไว้ที่นี่แทน เพื่อให้ padding edge ของ wrapper ตรงกับขอบจริงของ iframe พอดี
            (ดู comment หัวไฟล์) */}
        <div className="border-default-300 relative h-full w-full max-w-[420px] overflow-hidden rounded-xl border bg-white shadow"> {/* HR7 carve-out: ล็อกความกว้างจอมือถือจำลองในกรอบ canvas ตามสัดส่วนอุปกรณ์จริงใน mockup (ยกมาจาก Task 7) — Paces ไม่มี token */}
          <iframe
            ref={iframeRef}
            src={src}
            // iframe ยังโหลดไม่เสร็จตอน Host ส่งครั้งแรก (ก่อน onLoad) → ส่งซ้ำตอน onLoad เป็น
            // "final source of truth" ครั้งแรกเสมอ กัน race ตอน mount (TFR-008 edge case)
            onLoad={sendDraftState}
            title="ตัวอย่างหน้าร้าน — กำลังแก้ไข"
            className="h-full w-full border-0"
          />

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="canvas-blocks">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="pointer-events-none absolute inset-0"
                >
                  {draft.blocks.map((block, index) => {
                    const rect = rectByKey.get(block.key)
                    // ยังไม่มี rect กลับมา (iframe โหลดไม่เสร็จ/บล็อกไม่เหลือเนื้อหาให้ render จริง
                    // ดู PageBlocksSection.tsx early-return) — ไม่วาด overlay ลอยเปล่าไม่มีที่ยึด
                    if (!rect) return null
                    const label = BLOCK_LABEL[block.type]
                    return (
                      <Draggable draggableId={block.key} index={index} key={block.key}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className="pointer-events-auto absolute"
                            style={{
                              top: rect.top,
                              left: rect.left,
                              width: rect.width,
                              height: rect.height,
                              // สเปรดทับท้าย — ระหว่างลาก @hello-pangea/dnd override top/left/transform
                              // เองด้วย position:fixed (ดู comment หัวไฟล์) ต้องมาทีหลังเสมอ
                              ...dragProvided.draggableProps.style,
                            }}
                          >
                            {/* chrome — กรอบไฮไลต์ (mockup .mk-chrome); เข้มขึ้นตอน hover ด้วย CSS
                                ล้วน ไม่ต้องมี state — ตอนลาก (.mk-ghost) เอียงเล็กน้อย + เงาหมึกเข้ม
                                ตาม design.json (--shadow-paces-lg คือ shadow-lg ของ Paces) */}
                            <div
                              aria-hidden="true"
                              className={
                                dragSnapshot.isDragging
                                  ? 'border-primary bg-primary/5 pointer-events-none absolute inset-0 rounded border-2 shadow-lg'
                                  : 'border-primary/25 hover:border-primary/45 hover:bg-primary/5 pointer-events-none absolute inset-0 rounded border-2 transition-colors'
                              }
                              style={
                                dragSnapshot.isDragging
                                  ? { transform: 'rotate(-1.2deg)' } /* HR7 carve-out: หมุนเล็กน้อยตอนลาก — Paces ไม่มี token หมุน (mockup §3 .mk-ghost) */
                                  : undefined
                              }
                            />
                            {/* tag — ป้ายชื่อบล็อกมุมซ้ายบน */}
                            <span className="badge bg-primary pointer-events-none absolute left-0 top-0 z-10 inline-flex items-center gap-1 rounded-none rounded-ee-md text-2xs text-white">
                              {dragSnapshot.isDragging && (
                                <Icon icon="grip-vertical" className="text-sm" aria-hidden="true" />
                              )}
                              {dragSnapshot.isDragging ? 'กำลังลาก' : label}
                            </span>
                            {/* โทรบาร์ลอย — จับลาก / ขึ้น / ลง / ⋮ นำออก
                                ทางหลักเสมอ ไม่ใช่ทางสำรองที่ซ่อนอยู่หลัง hover (item 3) — เพื่อผู้ใช้
                                digital-literacy ต่ำ (Product Principle 3) จึงแสดงตลอด ไม่ gate ด้วย hover */}
                            <div className="border-default-300 pointer-events-auto absolute right-1 top-1 z-10 flex gap-0.5 rounded-md border bg-white p-0.5 shadow">
                              <button
                                type="button"
                                {...dragProvided.dragHandleProps}
                                aria-label={`ลาก ${label} เพื่อสลับลำดับ`}
                                className="btn btn-icon btn-sm text-primary cursor-grab"
                              >
                                <Icon icon="grip-vertical" className="text-sm" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onReorderBlocks(moveArrayItem(draft.blocks, index, -1))}
                                disabled={index === 0}
                                aria-label={`ย้าย ${label} ขึ้น`}
                                className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
                              >
                                <Icon icon="chevron-up" className="text-sm" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onReorderBlocks(moveArrayItem(draft.blocks, index, 1))}
                                disabled={index === draft.blocks.length - 1}
                                aria-label={`ย้าย ${label} ลง`}
                                className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
                              >
                                <Icon icon="chevron-down" className="text-sm" aria-hidden="true" />
                              </button>
                              <BlockOverflowMenu label={label} onRemove={() => void handleRemove(block)} />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    )
                  })}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    </div>
  )
}

/**
 * BlockOverflowMenu — ⋮ นำบล็อกออก (เมนูเดียว ไม่มีตัวเลือกอื่น)
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductCardMenu.tsx (custom React
 * dropdown + click-outside — ห้าม hs-dropdown ในคอลัมน์ที่ scroll เอง ดู
 * docs/conventions/scroll-container-clips-popovers.md) ย่อเหลือ 1 รายการ ไม่มี Link/toggle อื่น
 *
 * QA note: เมนูนี้เปิดชิดขอบขวาบนของบล็อก — บล็อกใบแรก/ใบสุดท้ายในคอลัมน์ที่ scroll (overflow-auto)
 * อาจโดนขอบคอลัมน์ตัดบางส่วน (จุดที่ static check มองไม่เห็น ต้องดูด้วยตา — ระบุไว้ใน "ส่งกลับ")
 */
function BlockOverflowMenu({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`ตัวเลือกเพิ่มเติมของ ${label}`}
        className="btn btn-icon btn-sm text-default-500"
      >
        <Icon icon="dots-vertical" className="text-sm" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="border-default-300 bg-card absolute right-0 top-full z-30 mt-1 min-w-36 overflow-hidden rounded border shadow-lg"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="space-y-0.5 p-1">
            <button
              type="button"
              className="dropdown-item text-danger hover:bg-danger/10 text-sm"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onRemove()
              }}
            >
              <Icon icon="trash" className="size-4" aria-hidden="true" />
              นำออก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
