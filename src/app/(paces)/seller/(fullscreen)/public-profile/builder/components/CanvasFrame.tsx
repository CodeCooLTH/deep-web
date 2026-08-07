'use client'

/**
 * CanvasFrame — คอลัมน์กลาง "จัดหน้าร้าน" ของตัวจัดหน้าร้าน (feature 00035)
 *
 * รื้อจาก iframe (Vuexy canvas ข้าม subdomain + postMessage) เป็น Paces-native ทั้งหมด (2026-08-07,
 * user เคาะ) — เหตุผล: บั๊ก prod ยืนยันซ้ำ 2 ครั้งว่า BuilderPreviewBridge ไม่ mount เลยเพราะ
 * canManagePage ตัดสินจาก session ของ deepthailand.app แต่ builder อยู่ seller.deepthailand.app
 * (session แยกตาม subdomain) — DEEP_BUILDER_BLOCK_RECTS ไม่เคยถูกส่งกลับมาสักครั้ง คอลัมน์กลาง
 * เลยค้างไม่อัปเดตตลอด แลกกับ canvas เป็น "ภาพแทน" ไม่ใช่หน้าจริง 100% (ยอมรับตาม dispatch)
 *
 * ลากข้ามคอลัมน์ทำได้จริงแล้ว (เหตุผลทั้งหมดของการรื้อ) เพราะ library กับ canvas อยู่ document
 * เดียวกันแล้ว — ไม่ต้องคำนวณ rect จาก postMessage อีกต่อไป บล็อกอยู่ใน normal DOM flow จริง ๆ
 * DragDropContext อยู่ที่ BuilderClient.tsx (ancestor ร่วมกับ LibraryPanel) — ไฟล์นี้แค่ประกาศ
 * Droppable "canvas-blocks" (ปลายทางลาก ทั้งสลับลำดับในตัวเองและรับจากคลัง) + Draggable ต่อบล็อก
 *
 * แถบแท็บลากสลับลำดับได้ในคอลัมน์นี้ด้วย (mockup หัวข้อ 1) — ใช้ react-sortablejs ตัวเดียวกับที่
 * LibraryPanel.tsx ใช้ (คนละ lib กับ @hello-pangea/dnd โดยตั้งใจ — ไม่ข้ามคอลัมน์ ไม่ต้องอยู่ใน
 * DragDropContext เดียวกัน) เรียก onReorderTabs ตัวเดียวกัน sync ทิศทางเดียวกับ library panel
 *
 * Base ของกลไกลากบล็อก (HR1): theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx
 *   (DragDropContext + Droppable + Draggable, @hello-pangea/dnd — ลากข้าม Droppable) — ต่างจาก
 *   Board.tsx ตรงที่ที่นี่ผูก dragHandleProps กับปุ่มจับลากเล็ก ๆ ในโทลบาร์แยกจากตัวบล็อก (ไม่ผูก
 *   ทั้งการ์ดเป็น handle แบบ Board.tsx) เพราะปุ่มลูกศร/⋮ ต้องกดได้โดยไม่โดน drag hijack
 * Base ของ markup: docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html หัวข้อ 1
 *   (หัวโปรไฟล์ตรึง .mk-tag กุญแจ / บล็อก .mk-tag ป้ายชื่อ+.mk-tool โทลบาร์ / แถบแท็บลากสลับลำดับได้ /
 *   เนื้อหาแท็บที่เลือก opacity-70) — mockup วาดบล็อกเป็นภาพแทนของ iframe เพราะตอนเขียน mockup
 *   ยังไม่เคาะเลิก iframe (ดู mockup หัวข้อ 5 ข้อ 1) วันนี้ (รอบสอง) user เคาะเลิก iframe แล้ว —
 *   implement บล็อกเป็น Paces-native จริงตามที่ mockup วาดไว้เป็นภาพแทน
 *
 * รอบสอง (2026-08-07, "canvas ต้องตรงกับหน้าจริง") — หัวโปรไฟล์เดิมวาดแค่ชื่อร้าน+avatar+สถิติ 3
 * ช่องผิด (ออเดอร์สำเร็จ/อัตราสำเร็จ/รีวิว) ไม่ตรงกับ ProfileHero.tsx ของหน้าร้านจริงเลย (user เทียบ
 * ภาพหน้าจอ /u/tanapathardware แล้วทักว่าไม่เหมือน) — วาดใหม่ทั้งหมดให้ตรงโครง ProfileHero.tsx:
 * ป้ายระดับความน่าเชื่อถือ (ตัวเลข+ชื่อ tier) / บรรทัดรอง (@handle · category · เปิดร้านตั้งแต่ X) /
 * เหรียญความสำเร็จ (ชิปไอคอน+ชื่อ) / สถิติ 3 ช่องที่ผันตาม vertical (ออเดอร์-ลูกค้า-ซื้อซ้ำ) / อัตรา
 * ความสำเร็จตัวใหญ่ — ดูรายงาน task สำหรับ mapping field แต่ละตัว. ไม่ import ProfileHero.tsx ตรง ๆ
 * (HR1 — ไฟล์นั้นพึ่ง MUI/`--mui-palette-*` ที่ไม่มีในหน้า Paces จะได้สีหายเงียบ ๆ) วาดด้วย Paces
 * primitive คนละชุด token แทน — คงคอลัมน์พรีวิว (ขวา) ไม่ไหวอีกต่อไปเพราะซ้ำกับ canvas นี้เกือบหมด
 * จึงถูกลบทิ้ง (ดู BuilderClient.tsx) ประโยค "ลิงก์ที่แชร์จะยังเป็นเวอร์ชันที่บันทึกแล้ว" ย้ายมาไว้
 * ใต้ canvas แทน (critique ชี้ว่าเป็นประโยคที่ลดความกังวลได้มากที่สุดในหน้า — เก็บไว้ไม่ทิ้ง)
 */
import { useEffect, useRef, useState } from 'react'

import { Draggable, Droppable } from '@hello-pangea/dnd'
import { ReactSortable, type Sortable } from 'react-sortablejs'

import Icon from '@/components/wrappers/Icon'
import { badgeIconName } from '@/lib/badge-icons'
import { pacesConfirm } from '@/lib/paces-swal'
import type { ProfileTabKey } from '@/lib/profile-tab-keys'

import { moveArrayItem } from '../lib/draft'
import { PROFILE_TAB_LABEL_TH, type BuilderDraftBlock, type CanvasFrameProps } from '../types'

const BLOCK_LABEL: Record<BuilderDraftBlock['type'], string> = {
  BADGE_HIGHLIGHT: 'เหรียญตราเด่น',
  FACEBOOK_POST: 'โพสต์จากเพจ Facebook',
}

/** จำนวนเหรียญความสำเร็จที่โชว์เป็นชิป ที่เหลือยุบเป็นตัวนับ "+N" — ตรงกับ MAX_BADGE_ICONS ของ
 *  ProfileHero.tsx (SSOT ที่ต้อง sync ด้วยมือ ดู comment หัวไฟล์) */
const MAX_HERO_BADGE_ICONS = 5

/** คำเรียกตัวเลขตามประเภทกิจการ — คัดลอกจาก ProfileHero.tsx::STAT_LABELS ตรง ๆ (เปลี่ยนแค่คำ ไม่
 *  เปลี่ยนวิธีนับ) ไม่ import ตรงเพราะไฟล์นั้นเป็น 'use client' ที่พึ่ง MUI (HR1) — sync ด้วยมือ */
const HERO_STAT_LABELS = {
  general: {
    orders: 'ออเดอร์',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
    rateCaption: 'อัตราความสำเร็จจากออเดอร์ทั้งหมดบน Deep',
  },
  lodging: {
    orders: 'การเข้าพัก',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
    rateCaption: 'อัตราความสำเร็จจากการเข้าพักทั้งหมดบน Deep',
  },
  serviceQueue: {
    orders: 'นัดหมาย',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
    rateCaption: 'อัตราความสำเร็จจากนัดหมายทั้งหมดบน Deep',
  },
} as const

function blockRemoveLabel(block: BuilderDraftBlock): string {
  if (block.type === 'BADGE_HIGHLIGHT') return 'เหรียญตราเด่น'
  return block.post.message?.trim() ? block.post.message.slice(0, 30) : 'โพสต์จากเพจ Facebook'
}

const tabSortableOptions: Partial<Sortable.Options> = {
  handle: '.sort-handle',
  ghostClass: 'sortable-item-ghost',
  animation: 150,
  fallbackOnBody: true,
  swapThreshold: 0.65,
}

export default function CanvasFrame({ draft, header, onReorderBlocks, onReorderTabs, onRemoveBlock }: CanvasFrameProps) {
  const handleRemove = async (block: BuilderDraftBlock) => {
    const confirmed = await pacesConfirm.danger(
      `นำ "${blockRemoveLabel(block)}" ออกจากหน้าร้าน?`,
      'ลูกค้าจะไม่เห็นส่วนนี้อีก จนกว่าจะเพิ่มกลับมา',
      { confirmButtonText: 'นำออก' },
    )
    if (!confirmed) return
    onRemoveBlock(block.key)
  }

  const tabItems = draft.tabOrder.map((key) => ({ id: key }))
  const firstTabKey = draft.tabOrder[0]

  // ── หัวโปรไฟล์ — mapping เดียวกับ ProfileHero.tsx (SSOT ที่ต้อง sync ด้วยมือ ดู comment หัวไฟล์) ──
  const heroStatLabel = header.isLodging
    ? HERO_STAT_LABELS.lodging
    : header.isServiceQueue
      ? HERO_STAT_LABELS.serviceQueue
      : HERO_STAT_LABELS.general
  // แสดงครบสามค่าเสมอ ไม่มีข้อมูลให้เป็น 0 (เหมือน ProfileHero.tsx — สามค่านี้เป็นโครงหลักของหน้า
  // ซ่อนบางช่องทำให้ layout ขยับไปมาระหว่างร้าน)
  const heroStats = [
    { value: header.completedOrders ?? 0, label: heroStatLabel.orders },
    { value: header.customerCount ?? 0, label: heroStatLabel.customers },
    { value: header.repeatCustomerCount ?? 0, label: heroStatLabel.repeat },
  ]
  const shownHeroBadges = header.badges.slice(0, MAX_HERO_BADGE_ICONS)
  const restHeroBadgeCount = header.totalBadgeCount - shownHeroBadges.length
  const heroSubtitle = [
    `@${header.username}`,
    header.category,
    header.memberSince ? `เปิดร้านตั้งแต่ ${header.memberSince}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    // [สำคัญ] h-full — .card ของ Paces เป็น height:fit-content ชนะ items-stretch (ดู feedback_paces_card_hfit_vs_hfull)
    <div className="card h-full flex min-h-0 flex-1 flex-col">
      <div className="card-header flex items-center py-3">
        <h4 className="card-title flex-1 text-sm">จัดหน้าร้าน</h4>
        <span className="text-default-400 text-xs">ลากเพื่อสลับลำดับ</span>
      </div>
      <div className="bg-default-100 flex min-h-0 flex-1 flex-col items-center gap-2 overflow-auto p-4">
        {/* [สำคัญ] เดิมมี max-w-[420px] เพื่อจำลองความกว้างมือถือ ซึ่งเป็นเหตุผลของยุคที่ canvas เป็น
            iframe ของหน้าร้านจริง (หน้าร้านเป็น mobile-first max-width 640px) พอเลิก iframe แล้ววาดเอง
            ข้อจำกัดนั้นไม่เหลือเหตุผล และทำให้ canvas เล็กกว่าคอลัมน์พรีวิวทั้งที่แสดงของเดียวกัน
            (user ทัก 2026-08-07) — ให้เต็มความกว้างคอลัมน์แทน */}
        <div className="border-default-300 h-fit w-full overflow-hidden rounded-xl border bg-white shadow">

          {/* ตรึง: หัวโปรไฟล์ — ไม่มีที่จับลาก ไม่มีปุ่มลบ (guardrail) */}
          <div className="border-default-200 relative border-b">
            {/* ปก: รูปจริงถ้าร้านอัปโหลด ไม่งั้นไล่สีตามระดับความน่าเชื่อถือ — เดียวกับ ProfileHero.tsx
                (เดิม hardcode gradient primary→info ทุกร้าน ไม่ตรงกับหน้าจริงที่ผันตาม tier) */}
            <div className="relative h-20 overflow-hidden" style={{ background: header.tierGradient }}>
              {header.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- ภาพปกร้านจาก storage ภายนอก ไม่ผ่าน next/image config
                <img src={header.coverImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
              )}
            </div>

            <div className="px-3.5 pb-3.5 text-center">
              {/* avatar วงกลมคร่อมรอยต่อปก/เนื้อหา — เดียวกับ ProfileHero.tsx (rounded-full ไม่ใช่ rounded-xl
                  แบบเดิม — วงกลมคือรูปแบบจริงของหน้าร้านสาธารณะ) */}
              <div className="border-default-200 mx-auto -mt-7 flex size-14 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white shadow">
                {header.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- โลโก้ร้านจาก storage ภายนอก ไม่ผ่าน next/image config
                  <img src={header.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Icon icon="building-store" className="text-default-400 text-2xl" aria-hidden="true" />
                )}
              </div>
              <div className="text-default-900 mt-1.5 flex items-center justify-center gap-1 text-sm font-bold">
                {header.shopName}
                {header.isVerified && <Icon icon="rosette-discount-check" className="text-success text-base" aria-hidden="true" />}
              </div>

              {/* ป้ายระดับความน่าเชื่อถือ — ตัวเลข trustScore + ชื่อ tier เดียวกับ ProfileHero.tsx
                  (เดิม canvas ไม่มีส่วนนี้เลย — user ทักว่าหายไปเทียบกับหน้าจริง) */}
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
                <span className="bg-default-800 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-extrabold text-white">
                  {header.trustScore}
                </span>
                <span className="bg-default-100 text-default-600 inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold">
                  {header.tierLabel}
                </span>
              </div>

              {/* บรรทัดรอง — @handle · หมวดหมู่ · เปิดร้านตั้งแต่ X เดียวกับ ProfileHero.tsx */}
              {heroSubtitle && <div className="text-default-400 mt-1 text-xs">{heroSubtitle}</div>}
            </div>

            {/* เหรียญความสำเร็จของร้าน — แถวชิปใต้ชื่อร้าน คนละอันกับบล็อก "เหรียญตราเด่น" ที่ผู้ขาย
                เลือกเพิ่มเองด้านล่าง (แถวนี้ render เสมอเมื่อมีเหรียญ ไม่ต้องจัดผ่าน builder) —
                เดียวกับ ProfileHero.tsx (เดิม canvas ไม่มีส่วนนี้เลย) */}
            {shownHeroBadges.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-1.5 px-3.5 pb-3.5 list-none m-0">
                {shownHeroBadges.map((b) => (
                  <li key={b.id}>
                    <span className="bg-default-100 text-default-700 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                      <Icon icon={badgeIconName(b.nameEN, b.icon)} className="text-sm opacity-70" aria-hidden="true" />
                      {b.name}
                    </span>
                  </li>
                ))}
                {restHeroBadgeCount > 0 && (
                  <li>
                    <span className="bg-default-100 text-default-400 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium">
                      {`+${restHeroBadgeCount}`}
                    </span>
                  </li>
                )}
              </ul>
            )}

            {/* สถิติ 3 ช่อง — ผันคำตาม vertical (ออเดอร์/การเข้าพัก/นัดหมาย) เดียวกับ ProfileHero.tsx
                (เดิม canvas เขียน "ออเดอร์สำเร็จ/อัตราสำเร็จ/รีวิว" คงที่ ผิดทั้ง label และตัวเลขที่นับ) */}
            <div className="border-default-200 flex justify-around gap-2 border-t px-3.5 py-3">
              {heroStats.map((s) => (
                <div key={s.label} className="min-w-18 text-center">
                  <div className="text-default-900 text-lg font-extrabold tabular-nums leading-tight">{s.value}</div>
                  <div className="text-default-400 text-xs">{s.label}</div>
                </div>
              ))}
            </div>

            {/* อัตราความสำเร็จ — ตัวเลขใหญ่สุดในหัวโปรไฟล์ เดียวกับ ProfileHero.tsx (ใช้ token `text-success`
                ของ Paces แทนเลข hex เฉพาะที่ ProfileHero.tsx pin ไว้เพื่อ contrast บน Vuexy — TD-009
                ไม่ต้อง pixel-perfect กับ Vuexy ใช้ token ของธีมตัวเองแทน) */}
            {header.completionRate != null && (
              <div className="border-default-200 flex items-baseline gap-2 border-t px-3.5 py-3">
                <span className="text-success text-2xl font-extrabold tabular-nums leading-none">{`${header.completionRate}%`}</span>
                <span className="text-default-500 text-xs">{heroStatLabel.rateCaption}</span>
              </div>
            )}

            <span className="badge bg-default-600 pointer-events-none absolute left-0 top-0 inline-flex items-center gap-1 rounded-none rounded-ee-md text-xs text-white">
              <Icon icon="lock" className="text-sm" aria-hidden="true" /> หัวโปรไฟล์ · ตรึงบนสุด
            </span>
          </div>

          {/* บล็อกเหนือแถบแท็บ — ลากสลับลำดับได้ / ลากจากคลังมาวางได้ */}
          <Droppable droppableId="canvas-blocks">
            {(dropProvided, dropSnapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={dropSnapshot.isDraggingOver ? 'bg-primary/5 border-primary/40 border-b border-dashed' : ''}
              >
                {draft.blocks.length === 0 && !dropSnapshot.isDraggingOver && (
                  <p className="text-default-400 border-default-200 border-b p-3.5 text-center text-xs">
                    ยังไม่มีบล็อกเหนือแถบแท็บ — กดปุ่มบวกหรือลากจากคลังมาวางที่นี่
                  </p>
                )}
                {draft.blocks.map((block, index) => {
                  const label = BLOCK_LABEL[block.type]
                  return (
                    <Draggable draggableId={block.key} index={index} key={block.key}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={
                            'border-default-200 relative border-b transition-colors' +
                            (dragSnapshot.isDragging ? ' border-primary bg-primary/5 shadow-lg' : ' hover:border-primary/40 hover:bg-primary/5')
                          }
                        >
                          {block.type === 'BADGE_HIGHLIGHT' ? (
                            <div className="p-3.5 pt-6">
                              <div className="text-default-900 mb-2 flex items-center text-xs font-semibold">เหรียญตราของร้าน</div>
                              <div className="flex flex-wrap gap-1.5">
                                {block.badges.map((b) => (
                                  <span key={b.id} className="bg-default-100 text-default-600 flex items-center gap-1 rounded-full py-0.5 pe-2 ps-0.5 text-xs">
                                    <span className="bg-primary flex size-4.5 items-center justify-center rounded-full text-white"> {/* HR7 carve-out: 4.5 = ระหว่าง size token 4/5 ตาม mockup */}
                                      <Icon icon="award" className="text-xs" aria-hidden="true" />
                                    </span>
                                    {b.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 p-3.5 pt-6">
                              {block.post.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- รูปโพสต์จาก storage/Meta CDN ภายนอก ไม่ผ่าน next/image config
                                <img src={block.post.imageUrl} alt="" className="bg-default-200 aspect-square w-16 shrink-0 rounded-md object-cover" />
                              ) : (
                                <div className="bg-default-200 text-default-400 flex aspect-square w-16 shrink-0 items-center justify-center rounded-md">
                                  <Icon icon="photo" className="text-lg" aria-hidden="true" />
                                </div>
                              )}
                              <p className="text-default-700 line-clamp-3 text-xs">{block.post.message ?? '(ไม่มีข้อความ)'}</p>
                            </div>
                          )}

                          {/* tag — ป้ายชื่อบล็อกมุมซ้ายบน */}
                          <span className="badge bg-primary pointer-events-none absolute left-0 top-0 z-10 inline-flex items-center gap-1 rounded-none rounded-ee-md text-xs text-white">
                            {dragSnapshot.isDragging && <Icon icon="grip-vertical" className="text-sm" aria-hidden="true" />}
                            {dragSnapshot.isDragging ? 'กำลังลาก' : label}
                          </span>

                          {/* โทลบาร์ลอย — ทางหลักเสมอ ไม่ gate ด้วย hover (Product Principle 3) */}
                          <div className="border-default-300 absolute right-1 top-1 z-10 flex gap-0.5 rounded-md border bg-white p-0.5 shadow">
                            <button
                              type="button"
                              {...dragProvided.dragHandleProps}
                              aria-label={`ลาก ${label} เพื่อสลับลำดับ`}
                              className="btn btn-icon text-primary min-h-11 min-w-11 cursor-grab"
                            >
                              <Icon icon="grip-vertical" className="text-sm" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onReorderBlocks(moveArrayItem(draft.blocks, index, -1))}
                              disabled={index === 0}
                              aria-label={`ย้าย ${label} ขึ้น`}
                              className="btn btn-icon text-default-500 min-h-11 min-w-11 disabled:opacity-30"
                            >
                              <Icon icon="chevron-up" className="text-sm" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onReorderBlocks(moveArrayItem(draft.blocks, index, 1))}
                              disabled={index === draft.blocks.length - 1}
                              aria-label={`ย้าย ${label} ลง`}
                              className="btn btn-icon text-default-500 min-h-11 min-w-11 disabled:opacity-30"
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

          {/* แถบแท็บ — ลากสลับลำดับได้ ปิดไม่ได้ (sync ทิศทางเดียวกับ LibraryPanel ผ่าน onReorderTabs) */}
          {tabItems.length > 0 && (
            <div className="bg-default-50 border-default-200 border-b px-3 py-3.5">
              <ReactSortable
                list={tabItems}
                setList={(next: { id: ProfileTabKey }[]) => onReorderTabs(next.map((item) => item.id))}
                tag="div"
                className="flex flex-wrap items-center gap-1"
                {...tabSortableOptions}
              >
                {draft.tabOrder.map((key, i) => (
                  <span
                    key={key}
                    className={
                      i === 0
                        ? 'badge bg-primary inline-flex items-center gap-1 rounded-full text-xs text-white'
                        : 'bg-white text-default-600 border-default-300 badge inline-flex items-center gap-1 rounded-full border text-xs'
                    }
                  >
                    {/* [สำคัญ] gutter ลบด้วย -my-* ชดเชย padding ของ badge เอง เพื่อขยาย tap target ของ
                        grip เป็น ≥44px โดยไม่ทำให้ badge เองสูงขึ้นตามสายตา (audit: กริปลาก 16×16 เดิม) */}
                    <span className="sort-handle -my-2 -ms-1 inline-flex min-h-11 min-w-11 cursor-grab items-center justify-center">
                      <Icon icon="grip-vertical" className="text-sm" aria-hidden="true" />
                    </span>
                    {PROFILE_TAB_LABEL_TH[key]}
                  </span>
                ))}
              </ReactSortable>
            </div>
          )}

          {/* เนื้อหาของแท็บที่เลือก — ภาพแทน อ่านอย่างเดียว (ตัวจริงอยู่ที่หน้าร้าน แก้เนื้อหาที่หน้านั้น) */}
          {firstTabKey && (
            <div className="relative">
              <div className="p-3.5 opacity-70">
                <div className="text-default-900 mb-2 text-xs font-semibold">{PROFILE_TAB_LABEL_TH[firstTabKey]}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-default-200 aspect-[4/3] rounded-md" />
                  <div className="bg-default-200 aspect-[4/3] rounded-md" />
                </div>
              </div>
              <span className="badge bg-default-400 pointer-events-none absolute left-0 top-0 rounded-none rounded-ee-md text-xs text-white">
                เนื้อหาของแท็บที่เลือก · แก้ที่หน้า{PROFILE_TAB_LABEL_TH[firstTabKey]}
              </span>
            </div>
          )}
        </div>

        {/* ย้ายมาจากคอลัมน์ "พรีวิว" ที่ถูกลบ (BuilderClient.tsx) — critique ชี้ว่าเป็นประโยคที่
            ลดความกังวลของผู้ขายได้มากที่สุดในหน้านี้ เก็บไว้ใต้ canvas แทนที่จะทิ้งไปพร้อมคอลัมน์เดิม */}
        <p className="text-default-400 max-w-md text-center text-xs">
          แสดงการจัดเรียงล่าสุดของคุณ
          <br />
          ลิงก์ที่แชร์จะยังเป็นเวอร์ชันที่บันทึกแล้ว
        </p>
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
        className="btn btn-icon text-default-500 min-h-11 min-w-11"
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
