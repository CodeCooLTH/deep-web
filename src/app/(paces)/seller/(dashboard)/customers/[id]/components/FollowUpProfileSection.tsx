'use client'

/**
 * FollowUpProfileSection — การ์ด "ติดตามลูกค้า" บนสุดของคอลัมน์ซ้ายในโปรไฟล์ลูกค้า (00066 พื้นผิว d)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + .card-header เส้นประ)
 * พี่น้อง: CustomerProfileOrders.tsx (หัวการ์ดเดียวกัน) · FollowUpPanel.tsx ในห้องแชท (ข้อมูล/ปุ่มชุดเดียวกัน)
 *
 * ข้อมูลโหลดที่ server (page.tsx) แล้วส่งเข้ามา — หลัง action ใช้ router.refresh() เพราะหน้านี้ไม่มี endpoint โปรไฟล์
 * 🛑 ปุ่มเพิ่มผูกกับ `addConversationId` = ห้องของออเดอร์ล่าสุดเท่านั้น (BR-CUSTP-07) — ห้องที่ได้จาก
 * FK `ExternalContact.customerId` ใช้ "อ่าน" ได้ แต่ห้ามเอามาเลือกห้องให้ปุ่มเพิ่ม
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatCount } from '@/lib/follow-up-view'
import FollowUpCard from '../../../../_follow-up/FollowUpCard'
import FollowUpForm from '../../../../_follow-up/FollowUpForm'
import type { FollowUpDto, PanelResult } from '@/services/customer-follow-up.service'

interface Props {
  /** null = โหลดฝั่ง server ล้ม */
  data: PanelResult | null
  addConversationId: string | null
}

export default function FollowUpProfileSection({ data, addConversationId }: Props) {
  const t = useT().followUps
  const router = useRouter()
  const [form, setForm] = useState<{ item?: FollowUpDto } | null>(null)
  const refresh = () => router.refresh()

  const empty = data && data.open.length === 0 && data.recentDone.length === 0
  const canAdd = data !== null && addConversationId !== null
  const lateItems = data?.open.filter((f) => f.overdue) ?? []
  const rest = data?.open.filter((f) => !f.overdue) ?? []

  const card = (f: FollowUpDto) => (
    <FollowUpCard key={f.id} item={f} variant="profile" onChange={refresh} onEdit={(i) => setForm({ item: i })} />
  )

  return (
    <div className="card">
      <div className="card-header flex-nowrap">
        <h4 className="card-title min-w-0 truncate">
          {data ? fmt(t.panelTitle, { n: formatCount(data.openCount) }) : t.title}
        </h4>
        {canAdd && (
          <button
            type="button"
            aria-label={t.addAria}
            onClick={() => setForm({})}
            className="btn bg-primary/15 text-primary-ink min-h-11 min-w-11 shrink-0 gap-1 lg:min-h-0 lg:min-w-0">
            <Icon icon="plus" className="text-base" />
            <span className="hidden lg:inline">{t.add}</span>
          </button>
        )}
      </div>
      <div className="px-4 pb-3">
        {data === null ? (
          <div className="py-3 text-center">
            <p className="text-default-700 mb-2 text-sm">{t.panelLoadError}</p>
            <button type="button" onClick={refresh} className="btn border-default-300 min-h-11 border">
              <Icon icon="refresh" className="me-1" /> {t.retry}
            </button>
          </div>
        ) : addConversationId === null && empty ? (
          <div className="py-3">
            <p className="text-default-900 mb-1 text-sm font-medium">{t.profileNoRoom}</p>
            <p className="text-default-700 mb-0 text-xs">{t.profileNoRoomHint}</p>
          </div>
        ) : empty ? (
          <div className="py-3">
            <p className="text-default-900 mb-1 text-sm font-medium">{t.panelEmpty}</p>
            <p className="text-default-700 mb-0 text-xs">{t.panelEmptyHint}</p>
          </div>
        ) : (
          <>
            {lateItems.length > 0 && (
              <div>
                <p className="text-danger-ink mt-1 mb-0 text-xs font-semibold">{t.bubbleGroupLate}</p>
                {lateItems.map(card)}
              </div>
            )}
            {rest.map(card)}
            {data.recentDone.length > 0 && (
              <div>
                <p className="text-default-700 mt-2 mb-0 text-xs font-semibold">{t.doneHeading}</p>
                {data.recentDone.map(card)}
              </div>
            )}
          </>
        )}
      </div>

      {form && data && (
        <FollowUpForm
          conversationId={form.item ? undefined : (addConversationId ?? undefined)}
          item={form.item}
          assignees={data.assignees}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
