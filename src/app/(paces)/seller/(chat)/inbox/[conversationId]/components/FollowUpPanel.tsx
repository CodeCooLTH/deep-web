'use client'

/**
 * FollowUpPanel — แถวพับปักหมุด "ติดตามลูกค้า (n)" เหนือแท็บของแผงลูกค้า (00066 UX พื้นผิว a)
 *
 * Base:
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/accordions/page.tsx (แนวคิดหัวสลับ + chevron เท่านั้น — ไม่ได้ใช้ markup/JS ของ hs-accordion;
 *    เป็นปุ่ม + React state + aria-expanded เพราะ parent re-render บ่อย; โครง state เดียวกับ tab ของ CustomerPanelBody)
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (ป้ายเลยกำหนด)
 *  พี่น้อง: CustomerCrmSection.tsx (โหลด/error/ลองใหม่ ตามแบบ crmSlot), CustomerPanelSheet.tsx
 *
 * ทำไมเป็นแถวพับ ไม่ใช่แท็บที่ 5: แถบแท็บถูกคำนวณให้พอดี 384px และ user สั่งห้าม slide; แท็บที่ 5 = ตกบรรทัดหรือต้องเลื่อน
 * และซ่อนใต้แท็บ = ฟีเจอร์ที่หาไม่เจอ (มติ user 2026-09-29 Q-4)
 *
 * กางเอง: ตอนโหลดครั้งแรกของห้องเมื่อ API บอก expanded (มีเลยกำหนด) — หลังจากนั้นผู้ใช้คุม ไม่พับกลับเมื่อ late→0
 * (กันจอกระโดดใต้นิ้ว). เปลี่ยนห้อง = mount ใหม่ผ่าน `key={conversationId}` ที่ผู้เรียก จึงคำนวณใหม่
 * ตัวเลข n/late มาจาก panelModel ฝั่ง server (symbol เดียวกับป้ายแถวห้อง/กระดาน — AC-ACT-22) ไม่นับเองที่ client
 */
import { useCallback, useEffect, useId, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatCount } from '@/lib/follow-up-view'
import FollowUpCard from '../../../../_follow-up/FollowUpCard'
import FollowUpForm from '../../../../_follow-up/FollowUpForm'
import type { FollowUpDto, PanelResult } from '@/services/customer-follow-up.service'

export default function FollowUpPanel({ conversationId }: { conversationId: string }) {
  const tAll = useT()
  const t = tAll.followUps
  const bodyId = useId()
  const [data, setData] = useState<PanelResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // null = ยังตามค่าที่ API แนะนำตอนโหลดครั้งแรก · true/false = ผู้ใช้กดเอง
  const [manual, setManual] = useState<boolean | null>(null)
  const [auto, setAuto] = useState<boolean | null>(null)
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
        // ค่ากางเองเก็บครั้งแรกครั้งเดียว — รีเฟรชหลัง action ต้องไม่ดีดแผงเปิด/ปิดเอง
        setAuto((prev) => prev ?? json.expanded)
      } catch {
        // รีเฟรชเงียบที่ล้ม = คงข้อมูลเดิมไว้ (ไม่ทำแผงว่างเงียบ) · โหลดครั้งแรกล้ม = ขึ้นแถว error พร้อมลองใหม่
        if (!silent) setFailed(true)
      } finally {
        setLoading(false)
      }
    },
    [conversationId],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const expanded = manual ?? auto ?? false
  const ready = data !== null && !failed
  const late = data?.lateCount ?? 0
  const late1 = data?.open.filter((f) => f.overdue) ?? []
  const rest = data?.open.filter((f) => !f.overdue) ?? []

  const onChange = () => void load(true)

  return (
    <div className="border-default-200 border-t">
      <div className="flex min-w-0 items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setManual(!expanded)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-start"
        >
          <Icon icon="chevron-down" className={`text-default-700 shrink-0 text-base transition-transform motion-reduce:transition-none ${expanded ? '' : '-rotate-90'}`} />
          <span className="text-default-900 truncate text-sm font-semibold">
            {ready ? fmt(t.panelTitle, { n: formatCount(data.openCount) }) : t.title}
          </span>
          {loading && !data && <span className="bg-default-100 h-5 w-10 shrink-0 animate-pulse rounded-full" role="status">
              <span className="sr-only">{tAll.common.loading}</span>
            </span>}
          {ready && late > 0 && (
            <span className="badge bg-danger/15 text-danger-ink min-w-0 shrink gap-1 truncate">
              <Icon icon="clock-exclamation" className="shrink-0 text-sm" />
              <span className="truncate">{fmt(t.bubbleLate, { n: formatCount(late) })}</span>
            </span>
          )}
        </button>
        {ready && (
          <button
            type="button"
            aria-label={t.addAria}
            onClick={() => setForm({})}
            className="btn bg-primary/15 text-primary-ink min-h-11 min-w-11 shrink-0 gap-1 lg:min-h-0 lg:min-w-0"
          >
            <Icon icon="plus" className="text-base" />
            <span className="hidden lg:inline">{t.add}</span>
          </button>
        )}
      </div>

      {expanded && (
        <div id={bodyId} className="px-4 pb-2 max-h-72 overflow-y-auto overscroll-contain">
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
      )}

      {form && data && (
        <FollowUpForm
          conversationId={conversationId}
          item={form.item}
          assignees={data.assignees}
          inChat
          onClose={() => setForm(null)}
          onSaved={(_item, mode) => {
            setForm(null)
            // สร้างใหม่แล้วกางให้เห็นรายการที่เพิ่งจด
            if (mode === 'create') setManual(true)
            void load(true)
          }}
        />
      )}
    </div>
  )
}
