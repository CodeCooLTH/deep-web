'use client'

/**
 * TestModeCard — โหมดทดสอบ + รายการเธรดที่อนุญาต (feature 00023, FR-021)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/BRD.md FR-021 (AC-021-01..10)
 *
 * Base (card + form-switch + table): src/app/(paces)/seller/(dashboard)/settings/auto-reply/
 *   AutoReplyListClient.tsx ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/
 *   {form/elements/components/ChecksRadioSwitches.tsx, tables/static/page.tsx}
 *
 * WARNING: เปิดโหมดนี้ = ระบบตอบ **เฉพาะเธรดในรายการ** ลูกค้าคนอื่นทั้งร้านเงียบสนิท (AC-021-03)
 * ซึ่งอันตรายถ้าร้านลืมปิด — จึงบังคับตั้งเวลาหมดอายุ และมีแถบเตือนค้างในหน้ารายการ
 *
 * WARNING: ข้อความในโหมดทดสอบ **ส่งถึงผู้รับจริง** (AC-021-04) จึงต้องยืนยันด้วย Sweet Alerts
 * พร้อมแสดงชื่อเธรดก่อนเพิ่มทุกครั้ง (AC-021-06) — ห้ามใช้ window.confirm
 */
import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import { formatDateTime } from '@/lib/format-date'

type Thread = {
  id: string
  alias: string | null
  lastMessageAt: string
  externalContact: { name: string | null } | null
}
type Candidate = {
  id: string
  counterparty?: { displayName?: string; shopName?: string } | null
  lastMessagePreview?: string | null
}

type Props = {
  canEdit: boolean
  testMode: boolean
  testModeExpiresAt: string | null
  onChanged: (next: { testMode: boolean; testModeExpiresAt: string | null }) => void
}

const EXPIRY_OPTIONS = [
  { value: '2', label: 'หมดอายุใน 2 ชั่วโมง' },
  { value: '8', label: 'หมดอายุใน 8 ชั่วโมง' },
  { value: '24', label: 'หมดอายุใน 24 ชั่วโมง' },
  { value: '72', label: 'หมดอายุใน 3 วัน' },
]

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
  return data
}

function threadName(t: Thread) {
  return t.alias ?? t.externalContact?.name ?? 'ผู้ติดต่อ'
}

export default function TestModeCard({ canEdit, testMode, testModeExpiresAt, onChanged }: Props) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [expiry, setExpiry] = useState('24')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!testMode) return
    api('/api/shops/auto-reply/test-mode/threads')
      .then((d) => setThreads(d.items ?? []))
      .catch(() => setThreads([]))
  }, [testMode])

  async function toggle(next: boolean) {
    if (!canEdit || busy) return
    if (next) {
      const ok = await pacesConfirm.warning(
        'เปิดโหมดทดสอบ?',
        'ระหว่างเปิดโหมดนี้ ระบบจะตอบเฉพาะแชทที่คุณเลือกไว้เท่านั้น ลูกค้าคนอื่นทั้งร้านจะไม่ได้รับคำตอบอัตโนมัติ',
        { confirmButtonText: 'เปิดโหมดทดสอบ' },
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const data = await api('/api/shops/auto-reply/test-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testMode: next, expiresInHours: next ? Number(expiry) : null }),
      })
      onChanged({
        testMode: data.testMode,
        testModeExpiresAt: data.testModeExpiresAt ?? null,
      })
      pacesToast.success(next ? 'เปิดโหมดทดสอบแล้ว' : 'ปิดโหมดทดสอบแล้ว — ระบบกลับมาตอบลูกค้าทุกคน')
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เปลี่ยนโหมดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function openPicker() {
    setPicking(true)
    if (candidates !== null) return
    try {
      const d = await api('/api/chat/conversations?take=30')
      setCandidates(d.items ?? [])
    } catch {
      setCandidates([])
    }
  }

  async function addThread(c: Candidate) {
    const label = c.counterparty?.displayName ?? c.counterparty?.shopName ?? 'ผู้ติดต่อ'
    // AC-021-06 — ข้อความจะถูกส่งถึงคนจริง ต้องยืนยันพร้อมชื่อเธรดเสมอ
    const ok = await pacesConfirm.warning(
      `เพิ่ม “${label}” เข้าโหมดทดสอบ?`,
      'ระบบจะตอบข้อความในแชทนี้จริง และผู้รับจะได้รับข้อความนั้นจริงบน Messenger',
      { confirmButtonText: 'เพิ่มแชทนี้' },
    )
    if (!ok) return

    setBusy(true)
    try {
      await api('/api/shops/auto-reply/test-mode/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: c.id, confirmed: true }),
      })
      const d = await api('/api/shops/auto-reply/test-mode/threads')
      setThreads(d.items ?? [])
      setPicking(false)
      pacesToast.success('เพิ่มแชททดสอบแล้ว')
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เพิ่มไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function removeThread(t: Thread) {
    if (busy) return
    setBusy(true)
    try {
      await api(`/api/shops/auto-reply/test-mode/threads/${t.id}`, { method: 'DELETE' })
      setThreads((prev) => prev.filter((x) => x.id !== t.id))
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ถอดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="text-default-800 text-base font-semibold">โหมดทดสอบ</h5>
          <p className="text-default-500 mt-0.5 text-xs">
            ลองระบบกับแชทของตัวเองก่อน โดยลูกค้าคนอื่นไม่ได้รับผลกระทบ
          </p>
        </div>
        <label className="flex flex-none cursor-pointer items-center gap-2">
          <input type="checkbox" className="form-switch" checked={testMode} disabled={!canEdit || busy}
            onChange={(e) => toggle(e.target.checked)} aria-label="เปิดโหมดทดสอบ" />
          <span className={`text-sm font-medium ${testMode ? 'text-warning' : 'text-default-500'}`}>
            {testMode ? 'เปิด' : 'ปิด'}
          </span>
        </label>
      </div>

      <div className="card-body">
        {!testMode ? (
          <>
            <p className="text-default-600 mb-3 text-sm">
              เปิดโหมดนี้แล้วระบบจะตอบ <b>เฉพาะแชทที่คุณเลือก</b> เท่านั้น เหมาะกับการลองว่าคำตอบออกมาหน้าตาแบบไหน
              ก่อนเปิดใช้จริงกับลูกค้าทุกคน
            </p>
            {canEdit && (
              <div className="max-w-xs">
                <label className="text-default-600 mb-1 block text-xs">ตั้งเวลาปิดอัตโนมัติ</label>
                <ChoiceSelect options={EXPIRY_OPTIONS} value={expiry} search={false}
                  onChange={(v) => setExpiry(v as string)} ariaLabel="ตั้งเวลาปิดอัตโนมัติ" />
                <p className="text-default-500 mt-1 text-xs">
                  กันลืมปิด — ถ้าลืม ลูกค้าจริงจะไม่ได้รับคำตอบโดยที่คุณไม่รู้ตัว
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-warning/10 border-warning mb-3 rounded border p-3">
              <p className="text-default-800 text-sm font-medium">กำลังทดสอบอยู่</p>
              <p className="text-default-600 mt-0.5 text-xs">
                ระบบตอบเฉพาะ {threads.length} แชทด้านล่างเท่านั้น
                {testModeExpiresAt ? ` · ปิดอัตโนมัติ ${formatDateTime(new Date(testModeExpiresAt))}` : ''}
              </p>
            </div>

            {threads.length === 0 ? (
              <p className="text-default-500 mb-3 text-sm">
                ยังไม่ได้เลือกแชท — ตอนนี้ระบบจะไม่ตอบใครเลย เพิ่มแชทที่จะใช้ทดสอบก่อน
              </p>
            ) : (
              <ul className="border-default-200 mb-3 divide-y rounded border">
                {threads.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 p-2.5">
                    <span className="min-w-0">
                      <span className="text-default-800 block truncate text-sm font-medium">{threadName(t)}</span>
                      <span className="text-default-500 block text-xs">
                        ข้อความล่าสุด {formatDateTime(new Date(t.lastMessageAt))}
                      </span>
                    </span>
                    {canEdit && (
                      <button className="btn btn-sm btn-soft-default flex-none" disabled={busy}
                        onClick={() => removeThread(t)}>ถอดออก</button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <button className="btn btn-soft-primary btn-sm" onClick={openPicker} disabled={busy}>
                <Icon icon="plus" className="me-1" aria-hidden="true" />เพิ่มแชททดสอบ
              </button>
            )}
          </>
        )}
      </div>

      {picking && (
        <div className="bg-default-900/50 fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="card mb-0 flex max-h-full w-full max-w-md flex-col overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <h5 className="text-default-800 text-base font-semibold">เลือกแชทที่จะใช้ทดสอบ</h5>
              <button onClick={() => setPicking(false)} className="text-default-500" aria-label="ปิด">
                <Icon icon="x" aria-hidden="true" />
              </button>
            </div>
            <div className="card-body flex-1 overflow-y-auto">
              <p className="text-default-500 mb-3 text-xs">
                แนะนำให้เลือกแชทของตัวเองหรือของพนักงาน — ข้อความจะถูกส่งถึงผู้รับจริง
              </p>
              {candidates === null ? (
                <p className="text-default-500 text-sm">กำลังโหลด…</p>
              ) : candidates.length === 0 ? (
                <p className="text-default-500 text-sm">ยังไม่มีแชทในกล่องข้อความ</p>
              ) : (
                <ul className="border-default-200 divide-y rounded border">
                  {candidates
                    .filter((c) => !threads.some((t) => t.id === c.id))
                    .map((c) => (
                      <li key={c.id}>
                        <button className="hover:bg-default-50 w-full p-2.5 text-start" disabled={busy}
                          onClick={() => addThread(c)}>
                          <span className="text-default-800 block truncate text-sm font-medium">
                            {c.counterparty?.displayName ?? c.counterparty?.shopName ?? 'ผู้ติดต่อ'}
                          </span>
                          {c.lastMessagePreview && (
                            <span className="text-default-500 block truncate text-xs">{c.lastMessagePreview}</span>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
