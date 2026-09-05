'use client'

/**
 * AutoOrderResultCard — การ์ดผลลัพธ์ของตัวสร้างออเดอร์อัตโนมัติในเธรดแชท (00061 หน้า B)
 *
 * SSOT: docs/20 - Features/00061 .../UX-Design-Spec.md §หน้า B
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🛑 การ์ดนี้ต้อง "ไม่เหมือนบับเบิลข้อความ" ในระดับที่เหลือบตาแล้วแยกออกทันที
 *
 * บับเบิลของร้าน = `bg-primary` ชิดขวา มี avatar + สถานะส่ง — ไวยากรณ์ภาพที่ผู้ขายอ่านว่า
 * "สิ่งที่ฉันพิมพ์ไปหาลูกค้า" มาตลอดทั้งระบบ. การ์ดนี้ **เต็มความกว้าง ไม่ชิดข้าง** ซึ่งเป็น
 * สิ่งเดียวที่แยกออกได้จากระยะไกลบนมือถือ **โดยไม่ต้องอ่านตัวหนังสือเลย** — ตรงกับความเสี่ยง
 * จริงที่ BR-ACO-21a ยืนยันแล้ว (ระบบนับข้อความฝั่งร้านทุกชนิดเป็น "การตอบ")
 *
 * `CALL` (ChatThread.tsx) แก้ปัญหาใกล้เคียงกันมาแล้วด้วยพื้น `bg-default-100` + ไม่มี avatar
 * แต่ยังชิดขวาเพราะมันมีทิศทาง (สายเข้า/สายออก) — การ์ดนี้ไม่มีทิศทางแบบนั้นเลย
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { formatTimeHM } from '@/lib/format-date'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { DRAFT_REASON_LABEL } from '@/lib/auto-order-reason-label'
import { computeItemsTotal } from '@/lib/auto-order-reasons'
import {
  resolveAutoOrderCardState,
  autoOrderCardAccent,
  describeTotalMismatch,
  describeMissingAddressParts,
  sortCardReasons,
  type DraftRawItem,
} from '@/lib/auto-order-card'
import { sendOrderToChat } from '@/app/(paces)/seller/(chat)/_components/sendOrderToChat'

export type AutoOrderCardData = {
  token: string
  orderNo: string | null
  status: string
  totalAmount: string
  draftReasons: string[]
  draftRawItems: unknown
  draftStatedTotal: string | null
  discount: string | null
  isDryRun: boolean
  supersedesOrderId: string | null
  buyerContact: string | null
  shippingAddress: unknown
  vertical: string | null
  items: { name: string; qty: number }[]
}

type Props = {
  conversationId: string
  createdAt: string | Date
  card: AutoOrderCardData | null
  /** ลูกค้าได้รับสรุปใบนี้ไปแล้วหรือยัง — derive จากข้อความ `type=ORDER` ที่มีอยู่ในเธรด */
  alreadySentAt: string | null
}

const BTN_PRIMARY = 'btn btn-sm bg-primary text-white hover:bg-primary-hover flex-1 min-h-11 gap-1.5 disabled:opacity-60'
const BTN_GHOST = 'btn btn-sm bg-light text-default-700 hover:bg-light-hover flex-1 min-h-11 gap-1.5 disabled:opacity-60'

export default function AutoOrderResultCard({ conversationId, createdAt, card, alreadySentAt }: Props) {
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(alreadySentAt)
  /**
   * ผลของปุ่มที่เพิ่งกด — ทับค่าที่มาจาก server จนกว่าจะโหลดเธรดรอบถัดไป
   *
   * 🛑 ต้องมี state นี้เพราะการกดปุ่มบนการ์ดแก้ **แถว `Order`** ไม่ใช่ `ChatMessage` ⇒
   * trigger realtime ของแชท (ซึ่งผูกกับการ insert ข้อความ) ไม่ยิงเลย ⇒ ถ้าไม่ทับค่าเอง
   * ผู้ขายจะกด "ทิ้งร่าง" แล้วเห็นการ์ดเดิมค้างอยู่ทุกประการ ซึ่งอ่านว่า "ปุ่มเสีย"
   * (ไม่ใช้ `router.refresh()` เพราะข้อความมาจาก client hook ไม่ใช่ RSC — refresh ไม่แตะมัน)
   */
  const [override, setOverride] = useState<{ status: string; draftReasons: string[] } | null>(null)

  const effective = card ? { ...card, ...(override ?? {}) } : null
  const state = resolveAutoOrderCardState({
    order: effective
      ? { status: effective.status, draftReasons: effective.draftReasons, isDryRun: effective.isDryRun }
      : null,
  })
  const vocab = resolveOrderVocab(effective?.vertical ?? '')

  async function callAction(path: 'retry' | 'discard') {
    if (!card || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${card.token}/auto-order/${path}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(data?.error ?? 'ทำรายการไม่สำเร็จ')
        return
      }
      if (path === 'discard') {
        setOverride({ status: 'CANCELLED', draftReasons: [] })
        pacesToast.success('ทิ้งร่างแล้ว')
        return
      }
      // retry — API คืน outcome ตรง ๆ ⇒ ทับสถานะจากผลจริง ไม่ใช่เดา
      if (data.outcome === 'ORDER_CREATED') {
        setOverride({ status: 'PENDING', draftReasons: [] })
        pacesToast.success('อ่านใหม่แล้ว — สร้างคำสั่งซื้อได้')
      } else {
        setOverride({ status: 'DRAFTED', draftReasons: (data.reasons as string[]) ?? [] })
        pacesToast.info('อ่านใหม่แล้ว — ยังมีข้อมูลที่ต้องแก้')
      }
    } catch {
      pacesToast.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    const ok = await pacesConfirm.danger(
      'ทิ้งร่างนี้?',
      'ร่างจะหายไปจากรายการถาวร ข้อความที่คุณพิมพ์ในแชทยังอยู่เหมือนเดิม',
      { confirmButtonText: 'ทิ้งร่างนี้' },
    )
    if (!ok) return
    await callAction('discard')
  }

  async function send() {
    if (!card || busy) return
    setBusy(true)
    try {
      const ok = await sendOrderToChat({ conversationId, orderToken: card.token, noun: vocab.noun })
      if (ok) setSentAt(new Date().toISOString())
    } finally {
      setBusy(false)
    }
  }

  return (
    // 🛑 `mt-1` (4px) เหนือ / `mb-5` (20px) ใต้ — ระยะไม่สมมาตรโดยตั้งใจ: บนแคบพอให้สายตาอ่านว่า
    // "นี่คือผลของบรรทัดบน" · ล่างเท่าปกติเพื่อไม่ให้ข้อความถัดไปดูเป็นส่วนหนึ่งของการ์ดนี้
    <div className="mt-1 mb-5">
      <div
        role={state === 'READING' ? 'status' : undefined}
        aria-live={state === 'READING' ? 'polite' : undefined}
        className={`border-default-200 bg-card overflow-hidden rounded-lg border border-s-[3px] ${autoOrderCardAccent(state)}`}
      >
        {/* แถบ meta — เหมือนกันทุกสถานะ = ตัวตัดขาดจากบับเบิลข้อความอย่างถาวร */}
        <div className="bg-default-50 border-default-200 flex items-center gap-2 border-b border-dashed px-3 py-1.5">
          <Icon icon="robot" className="text-default-500 shrink-0 text-sm" aria-hidden="true" />
          <span className="text-default-500 text-2xs font-medium">
            เห็นเฉพาะคุณ{effective?.isDryRun ? ' · โหมดทดสอบ' : ''}
          </span>
          <span className="text-default-400 ms-auto shrink-0 text-2xs">{formatTimeHM(createdAt)}</span>
        </div>

        <div className="px-3.5 py-3">
          {state === 'READING' && (
            <div className="flex items-center gap-2">
              <Icon icon="loader-2" className="text-default-500 size-4 shrink-0 animate-spin" aria-hidden="true" />
              <span className="min-w-0">
                <span className="text-default-900 block text-sm font-semibold">กำลังอ่าน...</span>
                {/* 🛑 บรรทัดที่สองจำเป็น: "กำลังอ่าน" อย่างเดียวไม่บอกว่าต้องรอนานแค่ไหน
                    ผู้ขายที่ไม่รู้ว่า "ไม่กี่วินาที" คือค่าปกติจะคิดว่าค้างแล้ว **พิมพ์ซ้ำ**
                    ซึ่งไปชนกับกติกาการดักข้อความซ้ำพอดี แล้วข้อความที่สองจะถูกกลืนเงียบ ๆ */}
                <span className="text-default-500 block text-xs">ปกติเสร็จภายในไม่กี่วินาที</span>
              </span>
            </div>
          )}

          {state === 'CREATED' && effective && (
            <>
              <div className="flex items-start gap-2">
                <span className="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full">
                  <Icon icon="receipt-2" className="text-xs" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-default-900 text-sm font-semibold">
                      {effective.supersedesOrderId ? 'สร้างใบใหม่แทนใบก่อนหน้า' : `สร้าง${vocab.noun}แล้ว`}
                    </span>
                    {/* ยอดเงินอยู่มุมขวาคงที่เสมอ — เป็นสิ่งที่ร้านเช็คก่อนอย่างอื่น */}
                    <span className="text-primary shrink-0 text-sm font-bold tabular-nums">
                      ฿{Number(effective.totalAmount).toLocaleString('th-TH')}
                    </span>
                  </div>
                  <p className="text-default-500 mb-0 text-xs tabular-nums">
                    {effective.orderNo ?? '—'} · {effective.items.length} รายการ
                  </p>
                  {effective.items.length > 0 && (
                    <p
                      className="text-default-500 mb-0 truncate text-xs"
                      title={effective.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                    >
                      {effective.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* 🛑 "สร้างคำสั่งซื้อแล้ว" (เกิดในระบบเรา) กับ "ลูกค้าได้รับสรุปแล้ว" (ข้อความออกไปจริง)
                  เป็นคนละเหตุการณ์ที่ผู้ขายปนกันได้ง่ายมาก — v1 ไม่ส่งอัตโนมัติ ⇒ ต้องมีแถบค้างไว้
                  จนกว่าจะกดส่งจริง และต้องอ้างชื่อปุ่มตรง ๆ ไม่ใช่บอกลอย ๆ ว่า "ยังไม่ได้ส่ง" */}
              {sentAt ? (
                <p className="text-default-500 mt-2.5 mb-0 flex items-center gap-1.5 text-xs">
                  <Icon icon="check" className="size-3.5 shrink-0" aria-hidden="true" />
                  ส่งสรุปให้ลูกค้าแล้ว · {formatTimeHM(sentAt)}
                </p>
              ) : (
                <p className="bg-warning/15 text-warning-ink mt-2.5 mb-0 flex items-start gap-1.5 rounded p-2 text-xs">
                  <Icon icon="send-off" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    ลูกค้ายังไม่เห็นสรุปนี้ — กด &ldquo;ส่งเข้าแชท&rdquo; ด้านล่างเพื่อส่งให้ลูกค้า
                  </span>
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <Link href={`/orders/${effective.token}`} className={BTN_GHOST}>
                  {vocab.viewLabel}
                </Link>
                {/* ไม่ disable ถาวรหลังส่งแล้ว — ร้านอาจต้องส่งซ้ำจริง */}
                <button type="button" className={sentAt ? BTN_GHOST : BTN_PRIMARY} disabled={busy} onClick={send}>
                  <Icon icon={busy ? 'loader-2' : 'send'} className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {sentAt ? 'ส่งอีกครั้ง' : 'ส่งเข้าแชท'}
                </button>
              </div>
            </>
          )}

          {state === 'DRAFT' && effective && (
            <>
              <p className="text-default-900 mb-2 text-sm font-semibold">
                ยังสร้างไม่ได้ — ต้องแก้ {effective.draftReasons.length} อย่าง
              </p>
              <ul className="mb-0 list-none space-y-1 ps-0">
                {sortCardReasons(effective.draftReasons).map((r) => (
                  <li key={r} className="text-default-700 flex items-start gap-2 py-1 text-xs">
                    <Icon icon="alert-triangle" className="text-warning-ink mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">{reasonText(r, effective)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-default-200 mt-3 flex gap-2 border-t border-dashed pt-3">
                {/* เปิดฟอร์มที่กรอกไว้ให้แล้ว = ทางที่จบงานได้แน่นอน (มนุษย์เติมสิ่งที่ระบบอ่านไม่ออก) */}
                <Link href={`/orders/${effective.token}`} className={BTN_PRIMARY}>
                  แก้ไข{vocab.noun}
                </Link>
                <button type="button" className={BTN_GHOST} disabled={busy} onClick={discard}>
                  ทิ้งร่างนี้
                </button>
              </div>
            </>
          )}

          {state === 'SYSTEM_FAILED' && effective && (
            <>
              <div className="flex items-start gap-2">
                <Icon icon="alert-triangle" className="text-default-500 mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-default-900 mb-0.5 text-sm font-semibold">ประมวลผลข้อความนี้ไม่สำเร็จ</p>
                  {/* 🛑 ประโยคที่ 2 มีไว้ตัดความกังวลว่าต้องไปแก้เทมเพลตหรือเปล่า —
                      น้ำเสียง: อธิบายเหตุ ไม่กล่าวหา */}
                  <p className="text-default-600 mb-0 text-xs">
                    ระบบมีปัญหาชั่วคราวตอนอ่านข้อความนี้ ไม่เกี่ยวกับสิ่งที่คุณพิมพ์
                  </p>
                </div>
              </div>
              <div className="border-default-200 mt-3 flex gap-2 border-t border-dashed pt-3">
                {/* ไม่มีปุ่มเปิดฟอร์ม — ไม่มีอะไรถูกแกะไว้ให้กรอกต่อเลย */}
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busy}
                  onClick={() => callAction('retry')}
                >
                  <Icon icon={busy ? 'loader-2' : 'refresh'} className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                  ลองอ่านอีกครั้ง
                </button>
                <button type="button" className={BTN_GHOST} disabled={busy} onClick={discard}>
                  ทิ้งร่างนี้
                </button>
              </div>
            </>
          )}

          {state === 'DISCARDED' && (
            <p className="text-default-500 mb-0 flex items-center gap-2 text-xs">
              <Icon icon="trash" className="size-3.5 shrink-0" aria-hidden="true" />
              ร่างนี้ถูกทิ้งไปแล้ว — ข้อความที่คุณพิมพ์ยังอยู่ในแชทเหมือนเดิม
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ข้อความของเหตุผลแต่ละข้อ — บางข้อพ่วงค่าจริงได้ บางข้อไม่ได้
 *
 * 🛑 กติกา: ค่าที่ยาว **คงที่** (ตัวเลข/ศัพท์ปิด) ใส่ได้ · ค่าที่ผู้ใช้พิมพ์เองยาวไม่จำกัด
 * (ชื่อสินค้า) **ไม่ใส่** — เพราะทำให้ความสูงของการ์ดคาดเดาไม่ได้บนจอ 320px
 */
function reasonText(reason: string, card: AutoOrderCardData): string {
  const base = DRAFT_REASON_LABEL[reason as keyof typeof DRAFT_REASON_LABEL] ?? reason

  if (reason === 'INVALID_PHONE' && card.buyerContact) {
    return `เบอร์ไม่ถูกต้อง (${card.buyerContact})`
  }
  if (reason === 'ADDRESS_INCOMPLETE') {
    const addr = card.shippingAddress as { line1?: string; province?: string; postcode?: string } | null
    return `ที่อยู่ไม่ครบ${describeMissingAddressParts(addr)}`
  }
  if (reason === 'TOTAL_MISMATCH' && card.draftStatedTotal) {
    const raw = (card.draftRawItems as DraftRawItem[] | null) ?? []
    const computed = computeItemsTotal({
      items: raw.map((i) => ({ qty: i.qty, price: i.price })),
      discount: card.discount ? Number(card.discount) : null,
    })
    const m = describeTotalMismatch(Number(card.draftStatedTotal), computed)
    return `${m.headline} ${m.detail}`
  }
  return base
}
