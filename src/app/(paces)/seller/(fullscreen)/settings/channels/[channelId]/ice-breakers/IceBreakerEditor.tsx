'use client'

/**
 * IceBreakerEditor — หน้าจัดการ "คำถามแนะนำก่อนเริ่มแชท" (Ice Breakers ของ Messenger/Instagram)
 * (2026-08-27)
 *
 * Base (โครงหน้าเต็มจอ/header/แถบปุ่มติดล่างบนมือถือ):
 *   src/app/(paces)/seller/(fullscreen)/settings/channels/line/[channelId]/rich-menu/RichMenuEditor.tsx
 *   (feature 00045) — ปุ่มเดียว (ไม่มี activate/deactivate แยก เพราะ Ice Breakers ไม่มีแนวคิด "ร่าง"
 *   — บันทึกแล้วยิงไป Meta ทันทีใน saveIceBreakers() เดียว) วางใน toolbarExtra (desktop) +
 *   แถบปุ่มติดล่าง fixed (มือถือ) ท่าเดียวกัน
 * Base (การ์ดรายการ + ตัวนับตัวอักษร + ปุ่มลบ/เพิ่ม): QuickMessageManager.tsx (ช่อง input/textarea
 *   + ตัวนับ bodyLen/BODY_MAX + ปุ่มลบรูป + ปุ่ม "เพิ่มข้อความ") — ก็อปรูปแบบ ไม่ก็อปโค้ด (โดเมนคนละ
 *   เรื่อง: ที่นี่เป็นชุดคำถาม-คำตอบตายตัว ≤4 ข้อ ไม่มีรูป ไม่มีตาราง/ค้นหา/หมวด)
 *
 * 🛑 ไม่มีสถานะ "ร่าง" — ปุ่มเดียวคือ "บันทึกการเปลี่ยนแปลง" กดแล้วยิงไป Meta ทันที (Meta ไม่มี
 * แนวคิด draft ที่แยกจาก live สำหรับ ice breakers)
 *
 * 🛑 กติกาทั้งชุด (จำนวน/ความยาว/ซ้ำ/ว่าง) มาจาก `validateIceBreakers()` เท่านั้น — ห้ามเขียนซ้ำ
 * ที่นี่ (HR16) เพราะเป็นตัวเดียวกับที่ server ใช้ตัดสินก่อนยิง Meta จริง
 */

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
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

let keySeq = 0
function nextKey(): string {
  keySeq += 1
  return `ib-${keySeq}`
}

function toRows(items: { question: string; answer: string }[]): DraftRow[] {
  return items.map((it) => ({ key: nextKey(), question: it.question, answer: it.answer }))
}

function sameSet(a: DraftRow[], b: { question: string; answer: string }[]): boolean {
  if (a.length !== b.length) return false
  return a.every((row, i) => row.question === b[i].question && row.answer === b[i].answer)
}

export default function IceBreakerEditor(props: {
  channelId: string
  channelName: string
  tokenInvalid: boolean
  initialItems: { question: string; answer: string }[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<DraftRow[]>(() => toRows(props.initialItems))
  // baseline ไว้เทียบว่ามีอะไรเปลี่ยนไหม — อัปเดตเป็นชุดล่าสุดหลังบันทึกสำเร็จ (ไม่ใช่ prop เดิม)
  const [saved, setSaved] = useState(props.initialItems)
  const [saving, setSaving] = useState(false)

  const validation = useMemo(
    () => validateIceBreakers(rows.map((r) => ({ question: r.question, answer: r.answer }))),
    [rows],
  )
  const isDirty = !sameSet(rows, saved)
  const canSave = validation.ok && !props.tokenInvalid && !saving

  const updateRow = useCallback((key: string, patch: Partial<Pick<DraftRow, 'question' | 'answer'>>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }, [])

  function addRow() {
    if (rows.length >= ICE_BREAKER_MAX) return
    setRows((prev) => [...prev, { key: nextKey(), question: '', answer: '' }])
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
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
    if (props.tokenInvalid) return
    setSaving(true)
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
      pacesToast.success(
        validation.items.length === 0 ? 'ลบคำถามแนะนำทั้งหมดแล้ว' : 'บันทึกคำถามแนะนำแล้ว',
      )
      setSaved(validation.items)
      router.refresh()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ — เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  const actionButtons = (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={!canSave}
      className="btn bg-primary text-white hover:bg-primary-hover min-h-11 inline-flex items-center gap-1.5 disabled:opacity-50 sm:min-h-0"
    >
      <Icon icon={saving ? 'loader-2' : 'device-floppy'} className={`text-base ${saving ? 'animate-spin' : ''}`} aria-hidden="true" />
      {saving ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}
    </button>
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
      <div className="mx-auto max-w-3xl pb-28 lg:pb-8">
        {/*
          ต้องบอก **เงื่อนไขการมองเห็น** ให้ครบทั้งสองข้อ ไม่ใช่แค่ว่าฟีเจอร์ทำอะไร —
          เงื่อนไขทั้งสองเป็นของ Meta เราเปลี่ยนไม่ได้ และมันคือสาเหตุที่ผู้ขายจะเปิดดูเองแล้ว
          "ไม่เห็นอะไรเลย" (ทดสอบจากคอม หรือทดสอบจากเธรดที่เคยคุยกันแล้ว) แล้วแจ้งว่าระบบพัง
          ทั้งที่ทุกอย่างทำงานถูกต้อง
        */}
        <div className="bg-info/15 text-info-ink mt-4 rounded-lg px-4 py-3 text-sm">
          <p className="mb-1">
            คำถามเหล่านี้จะแสดงเป็นปุ่มให้ลูกค้าแตะได้ก่อนพิมพ์ข้อความแรก — พอลูกค้าแตะปุ่มใดปุ่มหนึ่ง
            ระบบจะส่งคำตอบที่คุณเขียนไว้ให้ลูกค้าทันทีโดยอัตโนมัติ
          </p>
          <p className="mb-0">
            ลูกค้าจะเห็นเฉพาะตอนเปิดแชทกับคุณ<strong>เป็นครั้งแรก</strong> (คนที่เคยทักมาแล้วจะไม่เห็น)
            และเห็นเฉพาะ<strong>บนมือถือ</strong>เท่านั้น — เป็นเงื่อนไขของ Messenger/Instagram
            ที่เปลี่ยนไม่ได้ · การกดบันทึกมีผลทันที ไม่มีขั้นตอนตรวจสอบก่อน
          </p>
        </div>

        {props.tokenInvalid && (
          <div className="bg-danger/15 text-danger-ink mt-3 rounded-lg px-4 py-3 text-sm">
            การเชื่อมต่อช่องทางนี้มีปัญหา — แก้ไขข้อความได้ แต่บันทึกไม่ได้จนกว่าจะเชื่อมต่อใหม่
          </div>
        )}

        {!validation.ok && (
          <div className="bg-danger/15 text-danger-ink mt-3 flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>{validation.error}</span>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {rows.length === 0 ? (
            <div className="border-default-200 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
              <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-lg">
                <Icon icon="message-plus" className="text-2xl" aria-hidden="true" />
              </span>
              <span className="text-default-800 text-sm font-semibold">ยังไม่มีคำถามแนะนำ</span>
              <span className="text-default-700 max-w-xs text-xs">
                เพิ่มคำถามที่ลูกค้ามักถาม เช่น &ldquo;มีสินค้าไหม&rdquo; หรือ &ldquo;ส่งของยังไง&rdquo;
                ลูกค้าจะแตะถามได้ทันทีตั้งแต่ข้อความแรก
              </span>
            </div>
          ) : (
            rows.map((row, i) => {
              const questionLen = Array.from(row.question).length
              const answerLen = Array.from(row.answer).length
              const questionOver = questionLen > ICE_BREAKER_QUESTION_MAX
              const answerOver = answerLen > ICE_BREAKER_ANSWER_MAX
              const questionEmpty = row.question.trim() === ''
              const answerEmpty = row.answer.trim() === ''
              return (
                <div key={row.key} className="card">
                  <div className="border-default-200 flex items-center justify-between gap-2 border-b px-4 py-2.5">
                    <span className="text-default-800 text-sm font-semibold">คำถามที่ {i + 1}</span>
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
                        onClick={() => removeRow(row.key)}
                        aria-label={`ลบคำถามที่ ${i + 1}`}
                        className="btn btn-icon text-danger hover:bg-danger/15 min-h-11 sm:min-h-0"
                      >
                        <Icon icon="trash" className="size-4.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <label className="form-label" htmlFor={`ib-q-${row.key}`}>
                      คำถาม
                    </label>
                    <input
                      id={`ib-q-${row.key}`}
                      className={`form-input ${questionEmpty || questionOver ? 'is-invalid' : ''}`}
                      placeholder="เช่น มีสินค้าไหม"
                      value={row.question}
                      maxLength={ICE_BREAKER_QUESTION_MAX}
                      onChange={(e) => updateRow(row.key, { question: e.target.value })}
                      aria-describedby={`ib-q-count-${row.key}`}
                    />
                    <p
                      id={`ib-q-count-${row.key}`}
                      className={`mt-1 mb-0 text-end text-2xs tabular-nums ${questionOver ? 'text-danger-ink' : 'text-default-400'}`}
                    >
                      {questionLen} / {ICE_BREAKER_QUESTION_MAX}
                    </p>

                    <label className="form-label mt-3" htmlFor={`ib-a-${row.key}`}>
                      คำตอบ
                    </label>
                    <textarea
                      id={`ib-a-${row.key}`}
                      className={`form-input min-h-24 ${answerEmpty || answerOver ? 'is-invalid' : ''}`}
                      placeholder="ข้อความที่จะส่งให้ลูกค้าทันทีเมื่อแตะคำถามนี้"
                      value={row.answer}
                      maxLength={ICE_BREAKER_ANSWER_MAX}
                      onChange={(e) => updateRow(row.key, { answer: e.target.value })}
                      aria-describedby={`ib-a-count-${row.key}`}
                    />
                    <p
                      id={`ib-a-count-${row.key}`}
                      className={`mt-1 mb-0 text-end text-2xs tabular-nums ${answerOver ? 'text-danger-ink' : 'text-default-400'}`}
                    >
                      {answerLen} / {ICE_BREAKER_ANSWER_MAX}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= ICE_BREAKER_MAX}
          className="btn bg-light text-default-700 mt-4 min-h-11 w-full disabled:opacity-40"
        >
          <Icon icon="plus" className="text-base" aria-hidden="true" />
          เพิ่มคำถาม
        </button>
        {rows.length >= ICE_BREAKER_MAX && (
          <p className="text-default-400 mt-2 mb-0 text-center text-xs">
            ตั้งได้สูงสุด {ICE_BREAKER_MAX} ข้อ (เพดานของ Meta)
          </p>
        )}
      </div>

      {/* แถบปุ่มติดล่างบนมือถือ — โซนนิ้วโป้ง; เดสก์ท็อปปุ่มอยู่ใน header แทน (ท่าเดียวกับ RichMenuEditor) */}
      <div className="border-default-200 bg-card fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"> {/* carve-out: safe-area ไม่มี token (docs/conventions/ios-safe-area.md) */}
        {actionButtons}
      </div>
    </>
  )
}
