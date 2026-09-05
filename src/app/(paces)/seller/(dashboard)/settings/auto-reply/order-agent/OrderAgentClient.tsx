'use client'

/**
 * OrderAgentClient — หน้าตั้งค่าสร้างออเดอร์อัตโนมัติ (feature 00061 หน้า A)
 *
 * Base (ทุกก้อน copy โครง/คลาสมาจากของที่ shipped แล้ว ไม่ประกอบ UI เอง):
 *   - แถบสถานะ 3 ค่า + ชิปวลี + แบนเนอร์โหมดทดสอบ:
 *     src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/KeywordEditorClient.tsx
 *   - การ์ดเตือน/ปุ่มซ่อม: src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx
 *   - โครงการ์ด/หัวการ์ด: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx → CardWithHeader
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTime } from '@/lib/format-date'
import type { DraftReasonCode } from '@/lib/auto-order-reasons'
import { DRAFT_REASON_LABEL } from '@/lib/auto-order-reason-label'

import TestThreadsCard from '../[id]/TestThreadsCard'

import { AUTO_ORDER_TEMPLATE, TEMPLATE_HINTS } from './template'

type Status = 'OFFLINE' | 'TEST' | 'LIVE'

type ChannelRow = {
  id: string
  name: string
  provider: string
  avatarUrl: string | null
  messageEchoesStatus: string
  messageEchoesCheckedAt: string | null
}

type Props = {
  canEdit: boolean
  draftCount: number
  initial: { status: string; phrases: string[]; selectedChannelIds: string[] }
  channels: ChannelRow[]
}

/**
 * คำของ 3 สถานะ
 *
 * 🛑 `LIVE` ใช้คำว่า "สร้างออเดอร์จริง" ไม่ใช่ "ตอบลูกค้าจริง" ของ Auto-Reply — สองฟีเจอร์นี้
 * ทำคนละอย่างกันสิ้นเชิง (อันนั้นส่งข้อความหาลูกค้า อันนี้สร้างออเดอร์และตัดสต๊อก) ลอกคำมา
 * จะทำให้ผู้ขายคิดว่าการเปิดสวิตช์นี้ = ลูกค้าจะได้รับข้อความ ซึ่งไม่จริงเลย
 */
const STATUS_META: Record<Status, { label: string; active: string; hint: string }> = {
  OFFLINE: {
    label: 'ไม่ใช้งาน',
    active: 'bg-card text-default-800 shadow-sm',
    hint: 'ระบบจะไม่อ่านข้อความที่คุณพิมพ์เลย',
  },
  TEST: {
    label: 'ทดสอบ',
    active: 'bg-warning text-white shadow-sm',
    hint: 'อ่านเฉพาะห้องแชทที่เลือกไว้ และไม่สร้างออเดอร์จริง — ผลจะขึ้นเป็นร่างให้ดูเท่านั้น',
  },
  LIVE: {
    label: 'สร้างออเดอร์จริง',
    active: 'bg-primary text-white shadow-sm',
    hint: 'ทุกข้อความที่ตรงวลีจุดชนวนจะถูกอ่านเพื่อสร้างคำสั่งซื้อทันที (ตัดสต๊อกจริง)',
  },
}
const STATUS_ORDER: Status[] = ['OFFLINE', 'TEST', 'LIVE']

async function callApi(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'ทำรายการไม่สำเร็จ')
  return data
}

type DryRunResult = {
  wouldTrigger: boolean
  complete: boolean
  reasons: DraftReasonCode[]
  parsed: { items: { rawName: string; qty: number; price: number | null }[]; computedTotal: number }
}

export default function OrderAgentClient({ canEdit, draftCount, initial, channels }: Props) {
  const [status, setStatus] = useState<Status>((initial.status as Status) ?? 'OFFLINE')
  const [phrases, setPhrases] = useState<string[]>(initial.phrases)
  const [selected, setSelected] = useState<string[]>(initial.selectedChannelIds)
  const [rows, setRows] = useState<ChannelRow[]>(channels)
  const [busy, setBusy] = useState(false)
  const [repairing, setRepairing] = useState<string | null>(null)
  const [failedRepair, setFailedRepair] = useState<string[]>([])
  const [addingPhrase, setAddingPhrase] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  const [dryRunText, setDryRunText] = useState('')
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [testThreadCount, setTestThreadCount] = useState(0)
  const phraseInputRef = useRef<HTMLInputElement>(null)

  const hasLine = rows.some((c) => c.provider === 'LINE')
  /**
   * เพจที่ต้องตรวจสิทธิ์ — LINE ไม่มีแนวคิด `message_echoes` เลย (BR-ACO-10)
   * allow-list ของ provider ที่ *ต้องตรวจ* ไม่ใช่ deny-list ของตัวที่ข้าม
   */
  const unhealthy = useMemo(
    () =>
      rows.filter(
        (c) =>
          selected.includes(c.id) &&
          (c.provider === 'MESSENGER' || c.provider === 'INSTAGRAM') &&
          c.messageEchoesStatus !== 'GRANTED',
      ),
    [rows, selected],
  )

  const changeStatus = useCallback(
    async (next: Status) => {
      if (!canEdit || busy || next === status) return
      if (next === 'LIVE') {
        const ok = await pacesConfirm.warning(
          'ให้ระบบสร้างคำสั่งซื้ออัตโนมัติทุกครั้งที่คุณพิมพ์ตามรูปแบบ?',
          'หลังจากนี้ ทุกข้อความที่คุณพิมพ์ในแชทที่ตรงวลีจุดชนวนจะถูกอ่านเพื่อสร้างคำสั่งซื้อทันที (ตัดสต๊อกจริง)',
          { confirmButtonText: 'สร้างออเดอร์จริง' },
        )
        if (!ok) return
      }
      setBusy(true)
      try {
        await callApi('/api/seller/auto-order/status', {
          method: 'PATCH',
          body: JSON.stringify({ status: next }),
        })
        setStatus(next)
        pacesToast.success(`เปลี่ยนเป็น "${STATUS_META[next].label}" แล้ว`)
      } catch (e) {
        pacesToast.error(e instanceof Error ? e.message : 'เปลี่ยนสถานะไม่สำเร็จ')
      } finally {
        setBusy(false)
      }
    },
    [canEdit, busy, status],
  )

  const savePhrases = useCallback(
    async (next: string[]) => {
      setBusy(true)
      try {
        const data = await callApi('/api/seller/auto-order/phrases', {
          method: 'PUT',
          body: JSON.stringify({ phrases: next }),
        })
        setPhrases((data.phrases as { phrase: string }[]).map((p) => p.phrase))
      } catch (e) {
        pacesToast.error(e instanceof Error ? e.message : 'บันทึกวลีไม่สำเร็จ')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const addPhrase = useCallback(() => {
    const value = newPhrase.trim()
    if (!value) return
    setNewPhrase('')
    void savePhrases([...phrases, value])
  }, [newPhrase, phrases, savePhrases])

  const removePhrase = useCallback(
    (phrase: string) => {
      // 🛑 ด่านฝั่ง server บังคับอยู่แล้ว (PHRASE_MIN_ONE) — ที่นี่กันไม่ให้ผู้ใช้เจอ error
      // จากปุ่มที่ไม่ควรกดได้ตั้งแต่แรก ไม่ใช่กันแทน server
      if (phrases.length <= 1) return
      void savePhrases(phrases.filter((p) => p !== phrase))
    },
    [phrases, savePhrases],
  )

  const toggleChannel = useCallback(
    async (id: string) => {
      if (!canEdit || busy) return
      const next = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]
      setSelected(next)
      setBusy(true)
      try {
        const data = await callApi('/api/seller/auto-order/channels', {
          method: 'PUT',
          body: JSON.stringify({ shopChannelIds: next }),
        })
        // ตอบกลับด้วยชุดที่บันทึกจริง ไม่ใช่ echo สิ่งที่ส่งไป — เห็นทันทีถ้ามีอะไรถูกตัดทิ้ง
        setSelected(data.shopChannelIds as string[])
      } catch (e) {
        setSelected(selected)
        pacesToast.error(e instanceof Error ? e.message : 'บันทึกช่องทางไม่สำเร็จ')
      } finally {
        setBusy(false)
      }
    },
    [canEdit, busy, selected],
  )

  const repair = useCallback(async (channelId: string, name: string) => {
    setRepairing(channelId)
    setFailedRepair((f) => f.filter((id) => id !== channelId))
    try {
      const data = await callApi('/api/seller/auto-order/health', {
        method: 'POST',
        body: JSON.stringify({ shopChannelId: channelId, repair: true }),
      })
      const nextStatus = data.messageEchoesStatus as string
      setRows((rs) =>
        rs.map((r) =>
          r.id === channelId
            ? { ...r, messageEchoesStatus: nextStatus, messageEchoesCheckedAt: new Date().toISOString() }
            : r,
        ),
      )
      if (nextStatus === 'GRANTED') pacesToast.success(`ซ่อมสิทธิ์ของ "${name}" แล้ว`)
      else setFailedRepair((f) => [...f, channelId])
    } catch {
      setFailedRepair((f) => [...f, channelId])
    } finally {
      setRepairing(null)
    }
  }, [])

  const runDryRun = useCallback(async () => {
    if (!dryRunText.trim()) return
    setBusy(true)
    try {
      const data = await callApi('/api/seller/auto-order/dry-run', {
        method: 'POST',
        body: JSON.stringify({ text: dryRunText }),
      })
      setDryRun(data as DryRunResult)
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ทดสอบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }, [dryRunText])

  const copyTemplate = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AUTO_ORDER_TEMPLATE)
      pacesToast.success('คัดลอกแล้ว')
    } catch {
      // fallback ตาม OrderCardView.handleCopy — บางเบราว์เซอร์/บริบทไม่ให้สิทธิ์ clipboard
      pacesToast.error('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }, [])

  return (
    <>
      {/* ── ประตูมือถือ (มติ user 2026-08-29) ──────────────────────────────────
          🛑 ต้องบอก 3 อย่าง ไม่ใช่แค่ไล่ผู้ใช้ไปที่อื่น: ตั้งค่าที่ไหนได้และทำไม ·
          **ระบบยังทำงานบนมือถือตามปกติ** (ไม่บอก = ผู้ขายคิดว่าฟีเจอร์ทั้งอันใช้ไม่ได้) ·
          ทางไปต่อที่ทำได้จริงบนมือถือ */}
      <div className="md:hidden">
        <div className="card mb-4">
          <div className="card-body flex flex-col items-center gap-3 py-8 text-center">
            <span className="bg-default-100 text-default-600 flex size-12 items-center justify-center rounded-lg">
              <Icon icon="device-desktop" className="text-2xl" aria-hidden="true" />
            </span>
            <h5 className="text-default-800 mb-0 text-md font-semibold">
              ตั้งค่าหน้านี้บนแท็บเล็ตหรือคอมพิวเตอร์
            </h5>
            <p className="text-default-600 mb-0 max-w-sm text-sm">
              หน้านี้ต้องดูแม่แบบข้อความ รายชื่อเพจ และผลการทดสอบพร้อมกันถึงจะตั้งค่าได้อย่างมั่นใจ
            </p>
          </div>
        </div>
        <div className="card bg-success/10 border-success mb-4">
          <div className="card-body flex items-center gap-3 py-3">
            <Icon icon="circle-check" className="text-success-ink size-5 flex-none" aria-hidden="true" />
            <p className="text-default-700 mb-0 text-sm">
              ระบบยังทำงานบนมือถือตามปกติ — ที่ทำไม่ได้คือ &ldquo;การตั้งค่า&rdquo; เท่านั้น
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-default-700 mb-2 text-sm font-medium">ทำต่อบนมือถือได้</p>
            <div className="flex flex-col gap-2">
              <Link href="/inbox" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover justify-start">
                <Icon icon="messages" className="me-1.5 size-4" aria-hidden="true" />
                ดูผลในห้องแชท
              </Link>
              <Link href="/orders?stage=DRAFT" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover justify-start">
                <Icon icon="file-alert" className="me-1.5 size-4" aria-hidden="true" />
                คำสั่งซื้อที่ยังไม่ครบ
                {draftCount > 0 && (
                  <span className="badge bg-warning/15 text-warning-ink ms-1.5">{draftCount}</span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        {!canEdit && (
          <div className="card bg-default-100 mb-4">
            <div className="card-body flex items-center gap-3 py-3">
              <Icon icon="lock" className="text-default-600 size-5 flex-none" aria-hidden="true" />
              <p className="text-default-700 mb-0 text-sm">
                ดูได้อย่างเดียว — การตั้งค่านี้แก้ไขได้เฉพาะเจ้าของร้านหรือแอดมิน
                ถ้าต้องการเปลี่ยน ให้ติดต่อเจ้าของร้าน
              </p>
            </div>
          </div>
        )}

        {/* ── ตัวตรวจสุขภาพเพจ — โผล่เฉพาะตอนมีเพจที่ไม่ผ่านจริง ────────────────
            Base: ChannelsClient.tsx allTokenInvalid banner */}
        {unhealthy.length > 0 && (
          <div className="card border-warning bg-warning/10 mb-4">
            <div className="card-header border-warning/40 flex items-center gap-2">
              <Icon icon="alert-triangle" className="text-warning-ink size-4 flex-none" aria-hidden="true" />
              <h5 className="text-default-800 mb-0 text-md font-semibold">เพจที่ตั้งค่าไม่ครบ</h5>
            </div>
            <div className="card-body flex flex-col gap-2">
              {unhealthy.map((c) => {
                const failed = failedRepair.includes(c.id)
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-default-700 mb-0 min-w-0 text-sm">
                      {failed ? (
                        <>ซ่อมให้ &ldquo;{c.name}&rdquo; ไม่สำเร็จ</>
                      ) : (
                        <>
                          &ldquo;{c.name}&rdquo; ยังไม่ได้เปิดสิทธิ์ที่จำเป็น
                          ระบบจะอ่านข้อความที่คุณพิมพ์จากเพจนี้ไม่ได้
                        </>
                      )}
                    </p>
                    <div className="flex flex-none items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-sm bg-light text-default-700 hover:bg-light-hover"
                        disabled={!canEdit || repairing === c.id}
                        title={canEdit ? undefined : 'ให้เจ้าของร้านหรือแอดมินเป็นคนกดซ่อม'}
                        onClick={() => repair(c.id, c.name)}
                      >
                        {repairing === c.id ? (
                          <>
                            <Icon icon="loader-2" className="me-1.5 size-4 animate-spin" aria-hidden="true" />
                            กำลังซ่อม...
                          </>
                        ) : failed ? (
                          'ลองอีกครั้ง'
                        ) : (
                          'ซ่อมให้'
                        )}
                      </button>
                      {failed && (
                        <Link href="/settings/channels" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover">
                          ไปเชื่อมเพจใหม่
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {status === 'TEST' && (
          <div className="card bg-warning/10 border-warning mb-4">
            <div className="card-body flex items-center gap-3 py-3">
              <span className="bg-warning flex size-8 flex-none items-center justify-center rounded-lg text-white">
                <Icon icon="flask" className="text-base" aria-hidden="true" />
              </span>
              <p className="text-default-700 mb-0 text-sm">
                {testThreadCount > 0 ? (
                  <>
                    อยู่ในโหมดทดสอบ — ระบบจะอ่านเฉพาะ {testThreadCount} ห้องแชทที่เลือกไว้ด้านล่าง และ
                    <strong className="font-semibold"> ไม่สร้างคำสั่งซื้อจริง</strong> ผลจะขึ้นเป็นร่างให้ดูเท่านั้น
                  </>
                ) : (
                  // 🛑 "TEST แต่ไม่มีห้องเลย" = OFFLINE โดยปริยาย — ระบบไม่ auto-flip โดยตั้งใจ
                  // ⇒ ต้องมีคนบอก ไม่งั้นผู้ขายจะรอผลจากสิ่งที่ไม่มีวันทำงาน
                  <>
                    อยู่ในโหมดทดสอบแต่ยังไม่ได้เลือกห้องแชทเลย — ตอนนี้จึงไม่อ่านข้อความจากที่ไหนเลย
                    เพิ่มห้องในตาราง &ldquo;แชทสำหรับทดสอบ&rdquo; ด้านล่างก่อน
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── สถานะ ──────────────────────────────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header flex flex-nowrap items-center justify-between gap-3">
            <h5 className="text-default-800 text-md flex min-w-0 items-center gap-2 font-semibold">
              <Icon icon="adjustments-horizontal" className="text-primary size-4 flex-none" aria-hidden="true" />
              สถานะ
            </h5>
            {/* radiogroup จริง ไม่ใช่ปุ่ม aria-pressed — 3 ค่านี้เลือกได้ค่าเดียว (UX §a11y ข้อ 1) */}
            <div
              className="bg-light inline-flex flex-none rounded-lg p-0.5"
              role="radiogroup"
              aria-label="สถานะการสร้างออเดอร์อัตโนมัติ"
            >
              {STATUS_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={status === key}
                  disabled={!canEdit || busy}
                  onClick={() => changeStatus(key)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    status === key ? STATUS_META[key].active : 'text-default-500 hover:text-default-800'
                  }`}
                >
                  {STATUS_META[key].label}
                </button>
              ))}
            </div>
          </div>
          <div className="card-body py-3">
            <p className="text-default-600 mb-0 text-sm">{STATUS_META[status].hint}</p>
            {status !== 'OFFLINE' && selected.length === 0 && (
              // 🛑 "LIVE แต่ไม่มีเพจ" = OFFLINE โดยปริยาย — ระบบไม่ auto-flip โดยตั้งใจ
              // ⇒ ต้องมีคนบอกผู้ใช้ ไม่งั้นเขาจะเชื่อว่ามันทำงานอยู่
              <p className="text-danger-ink mt-2 mb-0 text-sm">
                ยังไม่ได้เลือกเพจเลย — ตอนนี้ระบบจึงไม่อ่านข้อความจากที่ไหนเลยแม้สถานะจะเปิดอยู่
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
          <div className="flex flex-col gap-4 xl:col-span-7">
            {/* ── วลีจุดชนวน ─────────────────────────────────────────────── */}
            <div className="card">
              <div className="card-header">
                <h5 className="text-default-800 mb-0 text-md font-semibold">วลีจุดชนวน</h5>
              </div>
              <div className="card-body">
                <p className="text-default-600 mb-3 text-sm">
                  เมื่อข้อความที่คุณพิมพ์ในแชทมีวลีนี้อยู่ ระบบจะอ่านข้อความทั้งก้อนเพื่อลองสร้างคำสั่งซื้อให้
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {phrases.map((p) => (
                    <span
                      key={p}
                      className={`bg-primary/10 text-primary flex max-w-full items-center gap-1 rounded py-0.5 text-xs font-medium ${
                        canEdit ? 'ps-2 pe-1 sm:pe-2' : 'px-2'
                      }`}
                    >
                      <span className="min-w-0 break-words">{p}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removePhrase(p)}
                          disabled={busy || phrases.length <= 1}
                          title={phrases.length <= 1 ? 'ต้องมีวลีอย่างน้อย 1 คำเสมอ' : undefined}
                          aria-label={`ลบวลี ${p}`}
                          className="text-primary/60 hover:text-danger hover:bg-primary/15 flex size-9 flex-none items-center justify-center rounded-full disabled:opacity-40 sm:size-4"
                        >
                          <Icon icon="x" className="text-xs" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit &&
                    (addingPhrase ? (
                      <div className="input-group w-full sm:w-56">
                        <input
                          ref={phraseInputRef}
                          className="form-input placeholder:text-default-500! min-h-11 sm:min-h-0"
                          value={newPhrase}
                          placeholder="เช่น สรุปคำสั่งซื้อ"
                          maxLength={100}
                          aria-label="วลีจุดชนวนใหม่"
                          onChange={(e) => setNewPhrase(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addPhrase()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setAddingPhrase(false)
                            }
                          }}
                          onBlur={() => {
                            if (!newPhrase.trim()) setAddingPhrase(false)
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingPhrase(true)
                          setTimeout(() => phraseInputRef.current?.focus(), 0)
                        }}
                        aria-expanded={addingPhrase}
                        className="btn btn-sm border-default-300 text-primary hover:bg-primary/5 inline-flex min-h-11 items-center gap-1 border border-dashed sm:min-h-0"
                      >
                        <Icon icon="plus" className="size-3.5" aria-hidden="true" />
                        เพิ่มวลี
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* ── แม่แบบ ─────────────────────────────────────────────────── */}
            <div className="card">
              <div className="card-header flex flex-nowrap items-center justify-between gap-3">
                <h5 className="text-default-800 mb-0 text-md min-w-0 font-semibold">แม่แบบสรุปคำสั่งซื้อ</h5>
                <button type="button" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover flex-none" onClick={copyTemplate}>
                  <Icon icon="copy" className="me-1.5 size-4" aria-hidden="true" />
                  คัดลอกข้อความนี้
                </button>
              </div>
              <div className="card-body">
                <p className="text-default-600 mb-3 text-sm">
                  ก็อปไปใช้เป็นแบบพิมพ์ทุกครั้งที่จะพิมพ์สรุปคำสั่งซื้อในแชท —
                  ระบบอ่านได้ก็ต่อเมื่อพิมพ์ตามหัวข้อเหล่านี้
                </p>
                {/* 🛑 ไม่ใช้ font-mono — มันทำให้ตัวไทยตกฟอนต์ Anuphan (feedback_font_mono_breaks_anuphan) */}
                <pre className="bg-light text-default-800 mb-3 overflow-x-auto rounded-lg p-3 text-sm whitespace-pre-wrap">
                  {AUTO_ORDER_TEMPLATE}
                </pre>
                <ul className="text-default-600 mb-0 list-disc space-y-1 ps-5 text-xs">
                  {TEMPLATE_HINTS.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── ลองพิมพ์ดู ─────────────────────────────────────────────── */}
            <div className="card">
              <div className="card-header">
                <h5 className="text-default-800 mb-0 text-md font-semibold">ลองพิมพ์ดูว่าระบบจะทำอะไร</h5>
              </div>
              <div className="card-body">
                <textarea
                  className="form-input placeholder:text-default-500! mb-2 min-h-32"
                  placeholder="พิมพ์ตามแม่แบบด้านบนแล้วกดทดสอบ"
                  value={dryRunText}
                  onChange={(e) => setDryRunText(e.target.value)}
                  aria-label="ข้อความสำหรับทดสอบ"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
                    disabled={busy || !dryRunText.trim()}
                    onClick={runDryRun}
                  >
                    ทดสอบ
                  </button>
                  <p className="text-default-600 mb-0 text-xs">การทดสอบนี้ไม่บันทึกอะไรลงระบบจริง</p>
                </div>

                {dryRun && (
                  <div className="border-default-200 mt-3 rounded-lg border p-3" aria-live="polite">
                    {!dryRun.wouldTrigger ? (
                      // 🛑 แยก "ไม่ตรงวลี" ออกจาก "ตรงแล้วแต่ไม่ครบ" — สองอันนี้ต้องแก้คนละที่
                      <p className="text-default-700 mb-0 flex items-center gap-2 text-sm">
                        <Icon icon="circle-x" className="text-default-500 size-4 flex-none" aria-hidden="true" />
                        ข้อความนี้ไม่มีวลีจุดชนวนอยู่เลย — ระบบจะไม่แตะมันในสถานการณ์จริง
                      </p>
                    ) : dryRun.complete ? (
                      <>
                        <p className="text-success-ink mb-2 flex items-center gap-2 text-sm font-medium">
                          <Icon icon="circle-check" className="size-4 flex-none" aria-hidden="true" />
                          สร้างคำสั่งซื้อได้
                        </p>
                        <p className="text-default-600 mb-0 text-sm">
                          {dryRun.parsed.items.length} รายการ · ยอดที่คำนวณได้ ฿
                          {dryRun.parsed.computedTotal.toLocaleString('th-TH')}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-warning-ink mb-2 flex items-center gap-2 text-sm font-medium">
                          <Icon icon="alert-triangle" className="size-4 flex-none" aria-hidden="true" />
                          ยังสร้างไม่ได้ — ต้องแก้ {dryRun.reasons.length} อย่าง
                        </p>
                        <ul className="text-default-700 mb-0 list-disc space-y-1 ps-5 text-sm">
                          {dryRun.reasons.map((r) => (
                            <li key={r}>{DRAFT_REASON_LABEL[r]}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── แชทสำหรับทดสอบ — reuse การ์ดเดิมทั้งใบ (Base: settings/auto-reply/[id]/TestThreadsCard)
                🛑 การ์ดนั้นถือคำเตือนที่สำคัญที่สุดของกลไกนี้ไว้แล้ว ("ระบบจะทำงานกับคนจริง
                ในแชทนั้น ไม่ใช่การจำลอง") — เขียนตารางใหม่เอง = ต้องจำมาเขียนคำเตือนซ้ำ */}
            <TestThreadsCard
              apiBase="/api/seller/auto-order/test-threads"
              scopeNoun="ตัวสร้างออเดอร์อัตโนมัติ"
              triggerHint="คุณพิมพ์ข้อความที่ตรงวลีจุดชนวนในห้องนั้น"
              status={status}
              canEdit={canEdit}
              onCountChange={setTestThreadCount}
            />
          </div>

          <div className="flex flex-col gap-4 xl:col-span-3">
            {/* ── เพจที่เปิดใช้ ───────────────────────────────────────────── */}
            <div className="card">
              <div className="card-header">
                <h5 className="text-default-800 mb-0 text-md font-semibold">เปิดใช้กับเพจไหนบ้าง</h5>
              </div>
              <div className="card-body">
                <p className="text-default-600 mb-3 text-sm">
                  ระบบจะอ่านข้อความที่คุณพิมพ์เฉพาะเพจ/ช่องทางที่เลือกไว้เท่านั้น
                </p>
                {rows.length === 0 ? (
                  <div className="text-center">
                    <p className="text-default-600 mb-2 text-sm">ยังไม่ได้เชื่อมเพจ</p>
                    <Link href="/settings/channels" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover">
                      ไปเชื่อมเพจ
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {rows.map((c) => (
                      <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="form-checkbox"
                          checked={selected.includes(c.id)}
                          disabled={!canEdit || busy}
                          onChange={() => toggleChannel(c.id)}
                        />
                        <span className="text-default-800 min-w-0 flex-1 truncate text-sm">{c.name}</span>
                        {c.provider !== 'LINE' && c.messageEchoesStatus !== 'GRANTED' && (
                          <Icon
                            icon="alert-triangle"
                            className="text-warning-ink size-4 flex-none"
                            aria-label="เพจนี้ยังไม่ได้เปิดสิทธิ์ที่จำเป็น"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {hasLine && (
              <div className="card bg-warning/10 border-warning">
                <div className="card-body py-3">
                  <p className="text-default-700 mb-0 text-sm">
                    <strong className="font-semibold">ข้อจำกัดของ LINE:</strong>{' '}
                    ระบบอ่านได้เฉพาะข้อความที่คุณพิมพ์จากกล่องแชทของ Deep เท่านั้น —
                    ถ้าพิมพ์จากแอป LINE Official Account Manager โดยตรง ข้อความนั้นจะไม่ถูกอ่าน
                    และจะไม่มีคำสั่งซื้อเกิดขึ้น เปิดห้องแชทจาก Deep แล้วพิมพ์ที่นี่แทนทุกครั้ง
                  </p>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-body flex items-center justify-between gap-2 py-3">
                <p className="text-default-700 mb-0 text-sm">คำสั่งซื้อที่ยังไม่ครบ</p>
                <Link href="/orders?stage=DRAFT" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover">
                  ดูร่าง {draftCount > 0 && <span className="badge bg-warning/15 text-warning-ink ms-1.5">{draftCount}</span>}
                </Link>
              </div>
            </div>

            {rows.some((c) => c.messageEchoesCheckedAt) && (
              <p className="text-default-500 text-xs">
                ตรวจสิทธิ์เพจล่าสุด{' '}
                {formatDateTime(
                  rows
                    .map((c) => c.messageEchoesCheckedAt)
                    .filter((v): v is string => !!v)
                    .sort()
                    .at(-1)!,
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
