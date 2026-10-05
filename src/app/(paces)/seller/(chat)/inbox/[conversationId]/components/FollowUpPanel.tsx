'use client'

/**
 * FollowUpPanel — เนื้อหาแท็บ "ติดตาม" ของแผงลูกค้า (00066)
 *
 * Base:
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (ป้ายเลยกำหนด)
 *  พี่น้อง: CustomerCrmSection.tsx (โหลด/error/ลองใหม่ ตามแบบ crmSlot), แท็บไฟล์/โน้ตใน CustomerPanel.tsx
 *
 * 2026-10-05 user สั่งย้ายจาก "แถวพับเหนือแถบแท็บ" มาเป็นแท็บเหมือนเพื่อน (กลับมติ Q-4 2026-09-29)
 * ข้อกังวลเดิม "ซ่อนใต้แท็บ = หาไม่เจอ" แก้ด้วย: ตัวเลขบนแท็บ (แดงเมื่อเลยกำหนด) ผ่าน onCounts
 * + ชิป/แถบงานด่วนในรายการแชท + ชิปกรอง "ติดตาม" ที่หัวรายการ
 * ตัวเลข n/late มาจาก panelModel ฝั่ง server (symbol เดียวกับป้ายแถวห้อง/กระดาน — AC-ACT-22) ไม่นับเองที่ client
 */
import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatCount } from '@/lib/follow-up-view'
import FollowUpCard from '../../../../_follow-up/FollowUpCard'
import FollowUpForm from '../../../../_follow-up/FollowUpForm'
import type { FollowUpDto, PanelResult } from '@/services/customer-follow-up.service'

export default function FollowUpPanel({
  conversationId,
  onCounts,
}: {
  conversationId: string
  /** ตัวเลขบนแท็บ — ผู้เรียกเก็บไว้แสดงที่แถบแท็บ */
  onCounts?: (c: { open: number; late: number }) => void
}) {
  const tAll = useT()
  const t = tAll.followUps
  const [data, setData] = useState<PanelResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState<{ item?: FollowUpDto } | null>(null)

  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true)
      setFailed(false)
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/follow-ups`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as PanelResult
        setData(json)
        onCounts?.({ open: json.openCount, late: json.lateCount })
      } catch {
        // รีเฟรชเงียบที่ล้ม = คงข้อมูลเดิมไว้ (ไม่ทำแผงว่างเงียบ) · โหลดครั้งแรกล้ม = ขึ้นแถว error พร้อมลองใหม่
        if (!silent) setFailed(true)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCounts เป็น setState ของผู้เรียก ไม่ต้อง re-fetch เมื่อ identity เปลี่ยน
    [conversationId],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const ready = data !== null && !failed
  const late = data?.lateCount ?? 0
  const late1 = data?.open.filter((f) => f.overdue) ?? []
  const rest = data?.open.filter((f) => !f.overdue) ?? []

  const onChange = () => void load(true)

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <p className="text-default-900 mb-0 min-w-0 flex-1 truncate text-sm font-semibold">
          {ready ? fmt(t.panelTitle, { n: formatCount(data.openCount) }) : t.title}
        </p>
        {ready && late > 0 && (
          <span className="badge bg-danger/15 text-danger-ink min-w-0 shrink gap-1 truncate">
            <Icon icon="clock-exclamation" className="shrink-0 text-sm" />
            <span className="truncate">{fmt(t.bubbleLate, { n: formatCount(late) })}</span>
          </span>
        )}
        {ready && (
          <button
            type="button"
            aria-label={t.addAria}
            onClick={() => setForm({})}
            className="btn bg-primary/15 text-primary-ink min-h-11 shrink-0 gap-1 lg:min-h-0"
          >
            <Icon icon="plus" className="text-base" />
            <span>{t.add}</span>
          </button>
        )}
      </div>

      <div>
          {loading && !data ? (
            <div className="space-y-2 py-2" role="status">
              <span className="sr-only">{tAll.common.loading}</span>
              <div className="bg-default-100 h-14 animate-pulse rounded-lg" />
              <div className="bg-default-100 h-14 animate-pulse rounded-lg" />
            </div>
          ) : failed || !data ? (
            <div className="space-y-2 py-2 text-center">
              <p className="text-default-700 mb-0 text-sm">{t.panelLoadError}</p>
              <button type="button" onClick={() => void load(false)} className="btn min-h-11 border border-default-300">
                <Icon icon="refresh" className="me-1" /> {t.retry}
              </button>
            </div>
          ) : data.open.length === 0 && data.recentDone.length === 0 ? (
            <div className="py-3">
              <p className="text-default-900 mb-1 text-sm font-medium">{t.panelEmpty}</p>
              <p className="text-default-700 mb-0 text-xs">{t.panelEmptyHint}</p>
            </div>
          ) : (
            <>
              {late1.length > 0 && (
                <div>
                  <p className="text-danger-ink mb-0 mt-1 text-xs font-semibold">{t.bubbleGroupLate}</p>
                  {late1.map((f) => (
                    <FollowUpCard key={f.id} item={f} variant="panel" onChange={onChange} onEdit={(i) => setForm({ item: i })} />
                  ))}
                </div>
              )}
              {rest.map((f) => (
                <FollowUpCard key={f.id} item={f} variant="panel" onChange={onChange} onEdit={(i) => setForm({ item: i })} />
              ))}
              {data.recentDone.length > 0 && (
                <div>
                  <p className="text-default-700 mb-0 mt-2 text-xs font-semibold">{t.doneHeading}</p>
                  {data.recentDone.map((f) => (
                    <FollowUpCard key={f.id} item={f} variant="panel" onChange={onChange} onEdit={(i) => setForm({ item: i })} />
                  ))}
                </div>
              )}
            </>
          )}
      </div>

      {form && data && (
        <FollowUpForm
          conversationId={conversationId}
          item={form.item}
          assignees={data.assignees}
          inChat
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            void load(true)
          }}
        />
      )}
    </div>
  )
}
