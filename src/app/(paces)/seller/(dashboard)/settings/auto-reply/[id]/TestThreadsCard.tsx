'use client'

/**
 * TestThreadsCard — ตารางแชทที่ใช้ทดสอบของกลุ่มคำหนึ่ง ๆ (feature 00023)
 *
 * user 2026-07-29: "แล้วไหนเลือกช่องทางทดสอบ ... มันควรมี table สำหรับ lists รายการแชท"
 * และ "ให้ตั้งค่าทดสอบได้ทีละอัน" — รายการนี้จึงเป็นของกลุ่มคำนี้ตัวเดียว ไม่ใช่ของทั้งร้าน
 *
 * Base (การ์ด + `table` ใน `table-responsive` + แถวเลือกแบบ dropdown-item avatar+ชื่อ+ช่องทาง):
 *   src/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown.tsx (แถวเลือก)
 *   theme/paces/Admin/TS/src/app/(admin)/tables/static/page.tsx (โครงตาราง)
 *
 * WARNING: การเพิ่มแชทเข้ารายการนี้ = ระบบจะส่งข้อความถึง "คนจริง" ในแชทนั้นเมื่อเขาทักเข้ามา
 * จึงต้องยืนยันก่อนเสมอ (pacesConfirm) และ API บังคับ `confirmed: true` ซ้ำอีกชั้น
 */
import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTime } from '@/lib/format-date'
import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'

type TestThread = {
  id: string
  conversationId: string
  name: string
  avatarUrl: string | null
  channelName: string | null
  provider: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
}

type Candidate = {
  id: string
  name: string
  avatarUrl: string | null
  provider: string | null
  lastMessageAt: string | null
}

async function callApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'ทำรายการไม่สำเร็จ')
  return data
}

/** avatar คู่สนทนา — รูปจริง + fallback ตัวอักษรแรก (pattern เดียวกับ inbox) */
function ThreadAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {name.trim().charAt(0) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="bg-default-100 size-8 shrink-0 rounded-full object-cover"
    />
  )
}

function ChannelLine({ provider, channelName }: { provider: string | null; channelName?: string | null }) {
  if (!provider) return null
  const display = getChannelDisplay(provider)
  return (
    <span className="text-default-400 flex items-center gap-1 text-xs">
      <Icon
        icon={display.icon}
        width={12}
        height={12}
        className={display.iconClassName}
        style={display.iconStyle}
        aria-hidden="true"
      />
      {channelName ?? display.label}
    </span>
  )
}

type Props = {
  keywordId: string
  status: string
  canEdit: boolean
  onCountChange: (count: number) => void
}

export default function TestThreadsCard({ keywordId, status, canEdit, onCountChange }: Props) {
  const [threads, setThreads] = useState<TestThread[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [search, setSearch] = useState('')

  const reload = useCallback(async () => {
    try {
      const data = await callApi(`/api/shops/auto-reply/keywords/${keywordId}/test-threads`)
      setThreads(data.items ?? [])
      onCountChange((data.items ?? []).length)
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'โหลดรายการแชทไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [keywordId, onCountChange])

  useEffect(() => {
    reload()
  }, [reload])

  async function openPicker() {
    setPicking(true)
    try {
      // ใช้ endpoint เดียวกับกล่องข้อความ ไม่ทำ endpoint ใหม่สำหรับ "รายชื่อแชท" ซ้ำอีกตัว
      const data = await callApi('/api/chat/conversations?take=30')
      const items = (data.items ?? data.conversations ?? []) as Record<string, unknown>[]
      setCandidates(
        items.map((c) => ({
          id: String(c.id),
          name: String(c.alias ?? c.name ?? c.buyerName ?? 'ไม่ทราบชื่อ'),
          avatarUrl: (c.avatarUrl as string | null) ?? null,
          provider: (c.provider as string | null) ?? (c.channel as string | null) ?? null,
          lastMessageAt: (c.lastMessageAt as string | null) ?? null,
        })),
      )
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'โหลดรายชื่อแชทไม่สำเร็จ')
      setPicking(false)
    }
  }

  async function addThread(c: Candidate) {
    const ok = await pacesConfirm.warning(
      `ใช้แชทของ "${c.name}" ทดสอบ?`,
      'เมื่อคนนี้ทักเข้ามาและพิมพ์ตรงกับคำในกลุ่มนี้ ระบบจะส่งข้อความตอบกลับไปจริง ไม่ใช่การจำลอง',
      { confirmButtonText: 'ใช้แชทนี้ทดสอบ' },
    )
    if (!ok) return
    setBusy(true)
    try {
      await callApi(`/api/shops/auto-reply/keywords/${keywordId}/test-threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: c.id, confirmed: true }),
      })
      setPicking(false)
      setSearch('')
      await reload()
      pacesToast.success('เพิ่มแชทสำหรับทดสอบแล้ว')
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เพิ่มไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function removeThread(t: TestThread) {
    setBusy(true)
    try {
      const data = await callApi(
        `/api/shops/auto-reply/keywords/${keywordId}/test-threads/${t.conversationId}`,
        { method: 'DELETE' },
      )
      await reload()
      // เอาแชทสุดท้ายออกทั้งที่ยังเป็นโหมดทดสอบ = กลุ่มนี้เงียบสนิททันที ต้องบอกตรงนั้นเลย
      if (data.remainingCount === 0 && data.status === 'TEST') {
        pacesToast.warning('ไม่เหลือแชทสำหรับทดสอบแล้ว — กลุ่มคำนี้จะไม่ตอบใครเลย')
      } else {
        pacesToast.success('เอาออกจากรายการทดสอบแล้ว')
      }
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เอาออกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const existingIds = new Set(threads.map((t) => t.conversationId))
  const q = search.trim().toLowerCase()
  const visibleCandidates = candidates
    .filter((c) => !existingIds.has(c.id))
    .filter((c) => !q || c.name.toLowerCase().includes(q))

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h5 className="text-default-800 text-base font-semibold">แชทสำหรับทดสอบ ({threads.length})</h5>
          <p className="text-default-500 mt-0.5 text-xs">
            {status === 'TEST'
              ? 'ตอนนี้กลุ่มคำนี้จะตอบเฉพาะแชทในรายการนี้เท่านั้น'
              : 'ใช้เมื่อตั้งกลุ่มคำนี้เป็น "ทดสอบ" — สถานะอื่นรายการนี้จะไม่มีผล'}
          </p>
        </div>
        {canEdit && !picking && (
          <button className="btn btn-soft-primary btn-sm flex-none" onClick={openPicker} disabled={busy}>
            <Icon icon="plus" className="size-4" aria-hidden="true" />
            เพิ่มแชท
          </button>
        )}
      </div>

      {/* ตัวเลือกแชท — เปิดเป็นแผงในที่เดียวกัน ไม่เด้ง modal เพราะต้องเทียบกับรายการที่มีอยู่ */}
      {picking && (
        <div className="border-default-200 border-b p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="input-icon-group flex-1">
              <Icon icon="search" className="input-icon" />
              <input
                type="search"
                className="form-input"
                placeholder="ค้นหาชื่อคู่สนทนา"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="ค้นหาแชท"
              />
            </div>
            <button className="btn btn-soft-default btn-sm flex-none" onClick={() => setPicking(false)}>
              ยกเลิก
            </button>
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {visibleCandidates.length === 0 ? (
              <p className="text-default-400 py-6 text-center text-xs">ไม่มีแชทให้เลือกเพิ่ม</p>
            ) : (
              visibleCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => addThread(c)}
                  className="dropdown-item w-full text-start"
                >
                  <ThreadAvatar url={c.avatarUrl} name={c.name} />
                  <span className="min-w-0 flex-1 text-start">
                    <span className="text-default-900 block truncate text-sm font-medium">{c.name}</span>
                    <ChannelLine provider={c.provider} />
                  </span>
                  <Icon icon="plus" className="text-primary size-4 flex-none" aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="card-body">
          <p className="text-default-400 text-sm">กำลังโหลด…</p>
        </div>
      ) : threads.length === 0 ? (
        <div className="card-body py-8 text-center">
          <Icon icon="flask" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
          <p className="text-default-700 text-sm font-medium">ยังไม่ได้เลือกแชทสำหรับทดสอบ</p>
          <p className="text-default-500 mt-1 text-xs">
            เลือกแชทของตัวเองหรือของทีมงาน แล้วทักเข้ามาด้วยคำที่ตั้งไว้เพื่อดูว่าระบบตอบอะไร
          </p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover">
            <thead className="thead-sm">
              <tr className="bg-light/25 text-2xs uppercase">
                <th>คู่สนทนา</th>
                <th>ข้อความล่าสุด</th>
                <th>เพิ่มเมื่อ</th>
                {canEdit && <th className="text-center">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <ThreadAvatar url={t.avatarUrl} name={t.name} />
                      <div className="min-w-0">
                        <span className="text-default-800 block truncate text-sm font-medium">{t.name}</span>
                        <ChannelLine provider={t.provider} channelName={t.channelName} />
                      </div>
                    </div>
                  </td>
                  <td className="text-default-500 max-w-xs truncate text-sm">
                    {t.lastMessagePreview ?? '—'}
                  </td>
                  <td className="text-default-500 text-sm">
                    {t.lastMessageAt ? formatDateTime(new Date(t.lastMessageAt)) : '—'}
                  </td>
                  {canEdit && (
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
                        disabled={busy}
                        onClick={() => removeThread(t)}
                        aria-label={`เอา ${t.name} ออกจากรายการทดสอบ`}
                      >
                        <Icon icon="trash" className="text-danger text-base" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
