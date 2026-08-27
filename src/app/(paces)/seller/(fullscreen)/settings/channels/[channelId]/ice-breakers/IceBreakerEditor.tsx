'use client'

/**
 * IceBreakerEditor — หน้าจัดการ "คำถามแนะนำก่อนเริ่มแชท" (Ice Breakers ของ Messenger/Instagram)
 * (2026-08-27, ux Design Spec Surface B)
 *
 * Base (โครงหน้าเต็มจอ/header/แถบปุ่มติดล่างบนมือถือ/แถบ "เลิกทำ" ลอย 10 วิ):
 *   src/app/(paces)/seller/(fullscreen)/settings/channels/line/[channelId]/rich-menu/RichMenuEditor.tsx
 *   (feature 00045) — ไม่มี activate/deactivate แยก เพราะ Ice Breakers ไม่มีแนวคิด "ร่าง" (บันทึกแล้ว
 *   ยิงไป Meta ทันทีใน saveIceBreakers() เดียว) — วางปุ่มใน toolbarExtra (desktop) + แถบปุ่มติดล่าง
 *   fixed (มือถือ) ท่าเดียวกัน; `undo`/`undoTimer` ยกมาทั้งกลไก (RichMenuEditor.tsx บรรทัด ~109-131,
 *   591-606) สำหรับปุ่มลบต่อการ์ด
 * Base (การ์ดรายการ + ตัวนับตัวอักษร): QuickMessageManager.tsx (ช่อง input/textarea + ตัวนับ
 *   bodyLen/BODY_MAX) — ก็อปรูปแบบ ไม่ก็อปโค้ด (โดเมนคนละเรื่อง: ที่นี่เป็นชุดคำถาม-คำตอบตายตัว
 *   ≤4 ข้อ ไม่มีรูป ไม่มีตาราง/ค้นหา/หมวด)
 * Base (เมนู ⋯ "ลบคำถามแนะนำทั้งชุด"): orders/[token]/components/OrderOverflowMenu.tsx — ก็อป
 *   pattern (custom React dropdown + click-outside แทน hs-dropdown เพราะ hs-dropdown ค้าง opacity 0
 *   เมื่อ list re-render) ไม่ import ตรง เพราะไฟล์นั้นผูกกับ type ActionItem ของโดเมนออเดอร์
 *
 * ไม่มีสถานะ "ร่าง" — ปุ่มเดียวคือ "บันทึกการเปลี่ยนแปลง" กดแล้วยิงไป Meta ทันที
 *
 * กติกาทั้งชุด (จำนวน/ความยาว/ซ้ำ/ว่าง) มาจาก `validateIceBreakers()` เท่านั้น — ห้ามเขียนซ้ำ
 * ที่นี่ (HR16) เพราะเป็นตัวเดียวกับที่ server ใช้ตัดสินก่อนยิง Meta จริง
 *
 * มี 2 เส้นทางเขียนที่แยกกันเด็ดขาด ตาม ux spec: (1) รายการคำถาม + ปุ่ม "บันทึกการเปลี่ยนแปลง"
 * — แก้/เพิ่ม/ลบทีละข้อ อย่างน้อย 1 ข้อเสมอ (ลบครบ 0 ข้อ → เติมการ์ดว่าง 1 ใบให้อัตโนมัติ ห้ามส่ง
 * items:[] ผ่านทางนี้) (2) เมนู ⋯ "ลบคำถามแนะนำทั้งชุด" — ยิง PUT items:[] ทันทีหลัง confirm ไม่ผ่าน
 * ปุ่มบันทึก. เหตุผล: ทางแรกบังคับคำถามที่ไม่ครบคู่ไว้เสมอ (validateIceBreakers ปฏิเสธคำถามว่าง)
 * จึงไม่มีทางส่ง items:[] ผ่านทางนั้นได้เลยแม้ตั้งใจ — การล้างทั้งชุดต้องมีทางแยกที่ตั้งใจจริง ๆ
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { META_BUSINESS_SUITE_INBOX_URL } from '@/lib/meta-system-notice'
import type { ExternalIceBreakerState } from '@/lib/ice-breaker'
import { pacesConfirm } from '@/lib/paces-swal'
import {
  ICE_BREAKER_ANSWER_MAX,
  ICE_BREAKER_MAX,
  ICE_BREAKER_QUESTION_MAX,
  validateIceBreakers,
} from '@/lib/ice-breaker'
import FullscreenPageHeader from '../../../../_shared/FullscreenPageHeader'

const BACK_HREF = '/settings/channels'

/** แถวร่างในจอนี้ — มี `key` สังเคราะห์ไว้กัน React remount ตอนย้ายลำดับ (ไม่ใช่ id ของ DB) */
type DraftRow = { key: string; question: string; answer: string }
type SavedItem = { question: string; answer: string }

let keySeq = 0
function nextKey(): string {
  keySeq += 1
  return `ib-${keySeq}`
}

/** ชุดคำถามที่จะแสดงในฟอร์ม — NONE (items ว่าง) แสดงเป็นการ์ดว่าง 1 ใบเสมอ ไม่ใช่ empty-state box */
function rowsFor(items: SavedItem[]): DraftRow[] {
  if (items.length === 0) return [{ key: nextKey(), question: '', answer: '' }]
  return items.map((it) => ({ key: nextKey(), question: it.question, answer: it.answer }))
}

/** แถวที่ "มีเนื้อหาจริง" (ไม่ใช่การ์ดว่างที่ยังไม่ได้แตะ) — ใช้ตัดสิน isDirty ไม่ให้เตือนเปล่า ๆ */
function meaningfulRows(rows: DraftRow[]): DraftRow[] {
  return rows.filter((r) => r.question.trim() !== '' || r.answer.trim() !== '')
}

function serialize(list: { question: string; answer: string }[]): string {
  return list.map((x) => `${x.question.trim()} ${x.answer.trim()}`).join('')
}

export default function IceBreakerEditor(props: {
  channelId: string
  channelName: string
  provider: string
  tokenInvalid: boolean
  initialItems: SavedItem[]
  /** สถานะของ "คำถามที่ Meta ถืออยู่จริง" ณ ตอนโหลดหน้า — คำนวณที่ server */
  externalState: ExternalIceBreakerState
  /** คำถามเดิมที่ไม่ใช่ของเรา (เฉพาะตอน FOREIGN) — ส่งมาเพื่อ **ให้ผู้ขายเห็นด้วยตา** ไม่ใช่แค่บอกว่ามี */
  externalQuestions: string[]
}) {
  const router = useRouter()
  const isInstagram = props.provider === 'INSTAGRAM'
  // ปุ่มบันทึกต้องบอกผลลัพธ์จริง — ตอนที่มีของเดิมของร้านอยู่ การกดปุ่มนี้ไม่ใช่แค่ "บันทึก"
  // แต่คือ "ลบของเขาทิ้งแล้วเอาของเราใส่แทน" ⇒ คำต้องพูดสิ่งนั้น
  const willReplaceForeign = props.externalState === 'FOREIGN'
  const [rows, setRows] = useState<DraftRow[]>(() => rowsFor(props.initialItems))
  // baseline = ชุดที่ยืนยันแล้วว่าอยู่บน Meta จริง (จาก server ตอนโหลด หรือหลังบันทึก/ลบสำเร็จ)
  // ใช้ตัดสินทั้ง isDirty, ข้อความ "สถานะตอนนี้" ใต้พรีวิว, และเงื่อนไขแสดงเมนู ⋯
  const [saved, setSaved] = useState<SavedItem[]>(props.initialItems)
  const [busy, setBusy] = useState<null | 'save' | 'clear'>(null)

  const validation = useMemo(
    () => validateIceBreakers(rows.map((r) => ({ question: r.question, answer: r.answer }))),
    [rows],
  )
  const isDirty = serialize(meaningfulRows(rows)) !== serialize(saved)
  const canSave = validation.ok && !props.tokenInvalid && busy === null
  const hasSavedItems = saved.length > 0
  // แบนเนอร์ error เต็มจอโชว์เฉพาะตอนมีอะไรให้แก้จริง — การ์ดว่างใบแรกที่ยังไม่ได้แตะ (NONE state สด ๆ)
  // ไม่ควรขึ้น error ทันทีที่เปิดหน้า (ผู้ใช้ยังไม่ได้ทำอะไรผิดเลย)
  const showValidationBanner = !validation.ok && (rows.length > 1 || meaningfulRows(rows).length > 0)

  /**
   * แถบ "เลิกทำ" หลังลบคำถาม — ท่าเดียวกับ RichMenuEditor (`dropLayout`/`undo`) เหตุผลเดียวกัน:
   * ผู้ใช้กด dialog/ปุ่มผ่านโดยไม่อ่านครบเป็นเรื่องปกติ และลบคำถามที่เขียนคำตอบไว้ยาว ๆ แล้วตั้งใหม่
   * ไม่ได้ในคลิกเดียว — ค่าเสียหายของการกดพลาดจึงไม่สมมาตรกับความรำคาญของแถบนี้
   */
  const [undo, setUndo] = useState<{ rows: DraftRow[]; message: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dropRows = useCallback(
    (next: DraftRow[], message: string) => {
      setUndo({ rows, message })
      setRows(next)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndo(null), 10000)
    },
    [rows],
  )

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  const updateRow = useCallback((key: string, patch: Partial<Pick<DraftRow, 'question' | 'answer'>>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }, [])

  function addRow() {
    if (rows.length >= ICE_BREAKER_MAX) return
    setRows((prev) => [...prev, { key: nextKey(), question: '', answer: '' }])
  }

  function removeRow(key: string, index: number) {
    const next = rows.filter((r) => r.key !== key)
    // ลบใบสุดท้ายจนเหลือ 0 → เติมการ์ดว่าง 1 ใบกลับให้อัตโนมัติ (NONE ต้องมีการ์ดให้กรอกเสมอ)
    const final = next.length === 0 ? [{ key: nextKey(), question: '', answer: '' }] : next
    dropRows(final, `ลบคำถามที่ ${index + 1} แล้ว`)
  }

  function moveRow(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= rows.length) return
    setRows((prev) => {
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[to]
      next[to] = tmp
      return next
    })
  }

  async function handleSave() {
    if (!validation.ok) {
      pacesToast.error(validation.error)
      return
    }
    if (props.tokenInvalid || busy !== null) return
    setBusy('save')
    try {
      const res = await fetch(`/api/channels/${props.channelId}/ice-breakers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: validation.items }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        // route ส่งข้อความไทยพร้อมแสดงมาแล้ว (400/403/404/409/502) — ใช้ค่านั้นตรง ๆ ห้ามเขียนทับ
        pacesToast.error(body.error ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success('บันทึกคำถามแนะนำแล้ว — มีผลกับลูกค้าที่ยังไม่เคยทักมาทันที (บนมือถือ)')
      setSaved(validation.items)
      setRows(rowsFor(validation.items))
      router.refresh()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ — เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(null)
    }
  }

  /** เส้นทางเดียวที่ส่ง items:[] ได้จริง — แยกจากปุ่มบันทึกโดยตั้งใจ (ดูคอมเมนต์หัวไฟล์) */
  async function handleClearAll() {
    if (busy !== null) return
    const ok = await pacesConfirm.danger(
      'ลบคำถามแนะนำทั้งชุด?',
      'ลูกค้าใหม่จะไม่เห็นคำถามนี้อีก — ตั้งใหม่ได้ทุกเมื่อ',
      { confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' },
    )
    if (!ok) return
    setBusy('clear')
    try {
      const res = await fetch(`/api/channels/${props.channelId}/ice-breakers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        pacesToast.error(body.error ?? 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }
      setSaved([])
      setRows(rowsFor([]))
      setUndo(null)
      pacesToast.success('ลบคำถามแนะนำทั้งชุดแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('ลบไม่สำเร็จ — เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง')
    } finally {
      setBusy(null)
    }
  }

  const actionButtons = (
    <>
      {hasSavedItems && (
        <IceBreakerOverflowMenu disabled={busy !== null} onClearAll={() => void handleClearAll()} />
      )}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={!canSave}
        className="btn bg-primary text-white hover:bg-primary-hover min-h-11 inline-flex items-center gap-1.5 disabled:opacity-50 sm:min-h-0"
      >
        <Icon
          icon={busy === 'save' ? 'loader-2' : 'device-floppy'}
          className={`text-base ${busy === 'save' ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        {busy === 'save'
          ? 'กำลังบันทึก…'
          : willReplaceForeign
            ? 'แทนที่คำถามเดิมและบันทึก'
            : 'บันทึกการเปลี่ยนแปลง'}
      </button>
    </>
  )

  return (
    <>
      <FullscreenPageHeader
        title="คำถามแนะนำก่อนเริ่มแชท"
        subtitle={props.channelName}
        backHref={BACK_HREF}
        isDirty={isDirty}
        toolbarExtra={<span className="hidden items-center gap-2 lg:inline-flex">{actionButtons}</span>}
      />

      {/* pb เผื่อแถบปุ่มติดล่างบนมือถือ ไม่ให้ทับเนื้อหาบรรทัดสุดท้าย */}
      <div className="mx-auto max-w-5xl pb-28 lg:pb-8">
        <div className="bg-info/15 text-info-ink mt-4 rounded-lg px-4 py-3 text-sm">
          <p className="mb-1">
            ลูกค้าเห็นคำถามนี้เฉพาะตอนเปิดแชทเป็นครั้งแรก (ยังไม่เคยส่งข้อความมาก่อน)
            และเฉพาะบนมือถือเท่านั้น — ลูกค้าเดิมที่เคยทักมาแล้วจะไม่เห็น
          </p>
          <p className="mb-0">การกดบันทึกจะมีผลทันที ไม่มีขั้นตอนตรวจสอบก่อน</p>
        </div>

        {props.tokenInvalid && (
          <div className="bg-danger/15 text-danger-ink mt-3 rounded-lg px-4 py-3 text-sm">
            การเชื่อมต่อมีปัญหา แก้คำถามได้ แต่บันทึกไม่ได้จนกว่าจะเชื่อมต่อใหม่
          </div>
        )}

        {/*
          คำถามเดิมที่ไม่ได้มาจาก Deep — เตือน **พร้อมโชว์ของเดิมให้เห็น**
          บอกแค่ว่า "มีของอยู่" ไม่พอ ผู้ขายต้องเทียบเองได้ว่าจะเอาชุดไหน
          ใช้โทน warning ไม่ใช่ danger — นี่คือเรื่องให้ตัดสินใจ ไม่ใช่ความผิดพลาดของใคร
        */}
        {props.externalState === 'FOREIGN' && (
          <div className="bg-warning/15 text-warning-ink mt-3 rounded-lg px-4 py-3 text-sm">
            <p className="mb-2 flex items-start gap-2 font-medium">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              <span>
                {isInstagram
                  ? 'บัญชีนี้มีคำถามที่ตั้งไว้แล้วจากแอป Instagram — ไม่ได้มาจาก Deep'
                  : 'เพจนี้มีคำถามที่ตั้งไว้แล้วจาก Facebook — ไม่ได้มาจาก Deep'}
              </span>
            </p>
            <ul className="mb-2 flex flex-wrap gap-1.5 ps-0" aria-label="คำถามเดิมที่ตั้งไว้อยู่">
              {props.externalQuestions.map((q, i) => (
                <li
                  key={`${q}-${i}`}
                  className="bg-warning/10 border-warning/30 text-warning-ink max-w-full truncate rounded-full border px-3 py-1"
                >
                  {q}
                </li>
              ))}
            </ul>
            <p className="mb-0">
              {isInstagram
                ? 'กดบันทึกจะแทนที่คำถามชุดนี้ทั้งหมด — ยังไม่ทราบแน่ชัดว่าฝั่ง Instagram จะยังแก้ไขคำถามเดิมได้ไหมหลังจากนั้น ถ้ายังไม่อยากเปลี่ยน ปิดหน้านี้ได้เลย ของเดิมจะไม่ถูกแตะต้อง'
                : 'กดบันทึกจะแทนที่คำถามชุดนี้ทั้งหมด และหลังจากนั้นจะแก้ไขคำถามจากฝั่ง Facebook ไม่ได้อีก จนกว่าจะลบคำถามแนะนำทั้งชุดออกจากหน้านี้'}
            </p>
            {!isInstagram && (
              <a
                href={META_BUSINESS_SUITE_INBOX_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm border-warning text-warning-ink hover:bg-warning/10 mt-3 inline-flex min-h-11 items-center gap-1.5 sm:min-h-0"
              >
                <Icon icon="external-link" className="text-sm" aria-hidden="true" />
                จัดการที่ Meta Business Suite แทน
              </a>
            )}
          </div>
        )}

        {/*
          อ่านค่าจาก Meta ไม่สำเร็จ — ต้องบอก ไม่ใช่เงียบ
          "ไม่รู้ว่ามีของเดิมไหม" ต่างจาก "รู้แล้วว่าไม่มี" คนละเรื่อง และอันแรกคือเคสที่
          ผู้ขายอาจทับของตัวเองโดยไม่มีใครเห็น ⇒ ยังให้บันทึกได้ แต่ต้องรู้ตัวก่อน
        */}
        {props.externalState === 'UNKNOWN' && !props.tokenInvalid && (
          <div className="bg-warning/15 text-warning-ink mt-3 flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>
              ตอนนี้ตรวจสอบกับ Facebook/Instagram ไม่ได้ว่ามีคำถามเดิมตั้งอยู่ไหม —
              ถ้าเคยตั้งเองไว้ก่อน การบันทึกที่นี่อาจเขียนทับโดยที่เราไม่รู้ (ยังแก้ไขและบันทึกได้ตามปกติ)
            </span>
          </div>
        )}

        {showValidationBanner && (
          <div className="bg-danger/15 text-danger-ink mt-3 flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>{validation.error}</span>
          </div>
        )}

        {undo && (
          <div className="bg-default-100 mt-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2">
            <span className="text-default-700 text-sm">{undo.message}</span>
            <button
              type="button"
              onClick={() => {
                setRows(undo.rows)
                setUndo(null)
                if (undoTimer.current) clearTimeout(undoTimer.current)
              }}
              className="btn text-primary-ink hover:bg-primary/15 min-h-11 px-3 text-sm font-semibold sm:min-h-0"
            >
              เลิกทำ
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {/* ซ้าย: รายการคำถาม — พระเอกของหน้า */}
          <div>
            {rows.map((row, i) => {
              const questionLen = Array.from(row.question).length
              const answerLen = Array.from(row.answer).length
              const questionOver = questionLen > ICE_BREAKER_QUESTION_MAX
              const answerOver = answerLen > ICE_BREAKER_ANSWER_MAX
              const questionEmpty = row.question.trim() === ''
              const answerEmpty = row.answer.trim() === ''
              // คู่ไม่ครบ = มีแค่ข้างเดียว (การ์ดว่างสนิททั้งคู่ยังไม่ถือว่าผิด — ยังไม่ได้แตะ)
              const pairIncomplete = questionEmpty !== answerEmpty
              const questionInvalid = questionOver || (pairIncomplete && questionEmpty)
              const answerInvalid = answerOver || (pairIncomplete && answerEmpty)

              return (
                <div key={row.key} className="mb-4 last:mb-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-default-700 text-sm font-medium">
                      คำถาม {i + 1} จาก {ICE_BREAKER_MAX}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveRow(i, -1)}
                        aria-label={`ย้ายคำถามที่ ${i + 1} ขึ้น`}
                        className="btn btn-icon text-default-700 hover:bg-light min-h-11 disabled:opacity-40 sm:min-h-0"
                      >
                        <Icon icon="chevron-up" className="size-4.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={i === rows.length - 1}
                        onClick={() => moveRow(i, 1)}
                        aria-label={`ย้ายคำถามที่ ${i + 1} ลง`}
                        className="btn btn-icon text-default-700 hover:bg-light min-h-11 disabled:opacity-40 sm:min-h-0"
                      >
                        <Icon icon="chevron-down" className="size-4.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key, i)}
                        aria-label={`ลบคำถามที่ ${i + 1}`}
                        className="btn btn-icon text-danger hover:bg-danger/15 min-h-11 sm:min-h-0"
                      >
                        <Icon icon="trash" className="size-4.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="card p-4">
                    <label className="form-label" htmlFor={`ib-q-${row.key}`}>
                      คำถามที่ลูกค้าจะเห็น
                    </label>
                    <input
                      id={`ib-q-${row.key}`}
                      className={`form-input ${questionInvalid ? 'is-invalid' : ''}`}
                      placeholder="เช่น มีค่าจัดส่งไหมคะ"
                      value={row.question}
                      maxLength={ICE_BREAKER_QUESTION_MAX}
                      onChange={(e) => updateRow(row.key, { question: e.target.value })}
                      aria-describedby={`ib-q-count-${row.key}`}
                    />
                    <div className="mt-1 flex items-start justify-between gap-2">
                      {pairIncomplete && questionEmpty ? (
                        <p className="text-danger-ink mb-0 text-2xs">ต้องมีทั้งคำถามและคำตอบ</p>
                      ) : (
                        <span />
                      )}
                      <p
                        id={`ib-q-count-${row.key}`}
                        className={`mb-0 shrink-0 text-end text-2xs tabular-nums ${questionOver ? 'text-danger-ink' : 'text-default-400'}`}
                      >
                        {questionLen} / {ICE_BREAKER_QUESTION_MAX}
                      </p>
                    </div>

                    <label className="form-label mt-3" htmlFor={`ib-a-${row.key}`}>
                      คำตอบที่ระบบจะส่งให้อัตโนมัติ
                    </label>
                    <textarea
                      id={`ib-a-${row.key}`}
                      className={`form-input min-h-32 ${answerInvalid ? 'is-invalid' : ''}`}
                      placeholder="เช่น ค่าส่งเริ่มต้น 30 บาท ส่งฟรีเมื่อซื้อครบ 500 บาทค่ะ"
                      value={row.answer}
                      maxLength={ICE_BREAKER_ANSWER_MAX}
                      onChange={(e) => updateRow(row.key, { answer: e.target.value })}
                      aria-describedby={`ib-a-count-${row.key}`}
                    />
                    <div className="mt-1 flex items-start justify-between gap-2">
                      {pairIncomplete && answerEmpty ? (
                        <p className="text-danger-ink mb-0 text-2xs">ต้องมีทั้งคำถามและคำตอบ</p>
                      ) : (
                        <span />
                      )}
                      <p
                        id={`ib-a-count-${row.key}`}
                        className={`mb-0 shrink-0 text-end text-2xs tabular-nums ${answerOver ? 'text-danger-ink' : 'text-default-400'}`}
                      >
                        {answerLen} / {ICE_BREAKER_ANSWER_MAX}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= ICE_BREAKER_MAX}
              className="btn bg-light text-default-700 mt-1 min-h-11 w-full disabled:opacity-40"
            >
              <Icon icon="plus" className="text-base" aria-hidden="true" />
              เพิ่มคำถาม
            </button>
            {rows.length >= ICE_BREAKER_MAX && (
              <p className="text-default-400 mt-2 mb-0 text-center text-xs">
                ตั้งได้สูงสุด {ICE_BREAKER_MAX} คำถาม — เพดานของ Messenger/Instagram
              </p>
            )}
          </div>

          {/* ขวา: พรีวิว + สถานะ — ต้องเบากว่าซ้าย (พื้น muted ไม่มี shadow เด่น ไม่มีปุ่ม) */}
          <div>
            <p className="text-default-800 mb-2 text-sm font-semibold">พรีวิว — ภาพจำลองคร่าว ๆ</p>
            <div className="bg-body-bg border-default-200 flex min-h-24 flex-wrap gap-2 rounded-lg border p-4">
              {rows
                .filter((r) => r.question.trim() !== '')
                .map((r) => (
                  <span
                    key={r.key}
                    className="bg-card border-default-300 text-default-800 rounded-full border px-3 py-2 text-sm"
                  >
                    {r.question.trim()}
                  </span>
                ))}
            </div>
            <p className="text-default-400 mt-2 mb-0 text-xs">
              ไม่ใช่หน้าตาจริงของ Messenger/Instagram — แต่ละอุปกรณ์อาจแสดงผลต่างกัน
            </p>
            <p className="text-default-500 mt-3 mb-0 text-sm">
              สถานะตอนนี้: {hasSavedItems ? 'ลูกค้าเห็นคำถามนี้อยู่' : 'ยังไม่ได้ตั้ง'}
            </p>
          </div>
        </div>
      </div>

      {/* แถบปุ่มติดล่างบนมือถือ — โซนนิ้วโป้ง; เดสก์ท็อปปุ่มอยู่ใน header แทน (ท่าเดียวกับ RichMenuEditor) */}
      <div className="border-default-200 bg-card fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"> {/* carve-out: safe-area ไม่มี token (docs/conventions/ios-safe-area.md) */}
        {actionButtons}
      </div>
    </>
  )
}

/**
 * เมนู ⋯ "ลบคำถามแนะนำทั้งชุด" — ก็อป pattern ของ OrderOverflowMenu.tsx (custom dropdown +
 * click-outside แทน Preline hs-dropdown ซึ่งค้าง opacity 0 เมื่อ list re-render) แต่ประกาศแยก
 * เป็น top-level component ในไฟล์นี้เพราะมี item เดียวเฉพาะฟีเจอร์นี้ ไม่คุ้มดึง type ActionItem
 * ของโดเมนออเดอร์มาใช้ร่วม — ต้องอยู่นอกฟังก์ชัน IceBreakerEditor (ห้ามประกาศ component ในตัว
 * render ของ component อื่น — React unmount ทั้งซับทรีทุก re-render ของแม่)
 */
function IceBreakerOverflowMenu({ onClearAll, disabled }: { onClearAll: () => void; disabled?: boolean }) {
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
        disabled={disabled}
        className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 border disabled:opacity-50 sm:min-h-0"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ตัวเลือกเพิ่มเติม"
        onClick={() => setOpen((p) => !p)}
      >
        <Icon icon="dots-vertical" className="text-lg" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute end-0 top-full z-30 mt-1 min-w-52 overflow-hidden rounded border-default-300 bg-card border shadow-lg"
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
                onClearAll()
              }}
            >
              <Icon icon="trash" className="size-4" aria-hidden="true" />
              ลบคำถามแนะนำทั้งชุด
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
