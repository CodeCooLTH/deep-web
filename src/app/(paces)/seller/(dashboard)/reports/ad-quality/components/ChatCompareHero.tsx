'use client'

/**
 * ChatCompareHero — ① แชท (Meta) เทียบ แชท (Deep) (FR-003 ช่องแชท (Meta)/(Deep) · FR-004 ยอดรวม · F-02)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalVisitors.tsx (หัวการ์ด kicker + วงกลมไอคอน + เลข + badge + แถบ h-3)
 *   + theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (กล่อง `p-2.5 border border-dashed border-default-300 rounded`)
 * ตัด: CountUp · select วันที่ · uppercase · ขนาดตัวอักษรค่าดิบของธีม (→ text-sm) · medal/Congratulations
 * สี (HR7 ห้ามม่วง): ไอคอน bg-primary · แถบ Meta bg-default-400 (ข้อมูลภายนอก) · แถบ Deep bg-primary · ส่วนต่างสูง = warning ไม่ใช่ danger
 * 🛑 เลขหลัก = แชท (Deep) ของ "ชุดแอดเดียวกับ Meta" (ตัวลบนับจากชุดเดียวกับตัวตั้ง) — ไม่ใช่ยอดรวมทั้งร้าน
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { HIGH_GAP_MIN_META_CHATS, HIGH_GAP_PCT, fmtInt, type CardStatus, type QualityRow, type QualityTotals } from './data'
import CardState, { type NotInAccount } from './CardState'
import NoDataCell from './NoDataCell'
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'

type Props = {
  /** deepOnly = การเชื่อมไม่พร้อม (ไม่ดึง Meta) — โชว์เฉพาะแชท (Deep) */
  deepOnly: boolean
  status: CardStatus
  totals: QualityTotals | null
  /** แชท (Deep) ทั้งช่วง (ห้องไม่ซ้ำ) — ใช้เมื่อไม่มีชุดแอดเทียบ */
  deepTotal: number
  top: QualityRow | null
  notInAccount?: NotInAccount
}

export default function ChatCompareHero({ deepOnly, status, totals, deepTotal, top, notInAccount }: Props) {
  const t = useT().adQuality
  const idFallback = useT().inbox.contextBar.adIdFallback
  const ready = !deepOnly && status === 'OK' && totals !== null && totals.chatsMeta !== null
  const main = ready ? totals.chatsDeepSameSet : deepTotal
  const max = ready ? Math.max(totals.chatsMeta ?? 0, totals.chatsDeepSameSet, 1) : 1
  const gap = ready ? totals.gap : null

  return (
    <div className="card h-full min-w-0">
      <div className="card-body">
        <h4 className="text-default-700 mb-2.5 text-sm font-bold">{t.h1Title}</h4>
        <div className="mb-2.5 flex items-center gap-2.5 py-1.25">
          <span className="bg-primary flex size-9 shrink-0 items-center justify-center rounded-full text-white">
            <Icon icon="message-circle" className="text-xl" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="mb-0 text-xl tabular-nums">{fmtInt(main)}</h3>
            <p className="text-default-700 text-2xs mb-0">{ready ? t.h1Caption : t.chatDeep}</p>
          </div>
          {gap !== null && (
            <span className={`badge ms-auto py-0 text-sm ${gap >= HIGH_GAP_PCT ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800'}`}>
              {gap < 0 ? fmt(t.deepMore, { p: Math.abs(gap).toFixed(1) }) : fmt(t.gapLabel, { p: gap.toFixed(1) })}
            </span>
          )}
        </div>

        {ready ? (
          <>
            {/* แถบเทียบ — ค่ากว้างไดนามิกเป็น style แบบธีมเอง (ไม่ใช่ arbitrary class) · aria-hidden เพราะค่าอ่านจากข้อความ */}
            <div className="mb-1.25 flex items-center justify-between text-sm"><span>{t.chatMeta}</span><span className="tabular-nums">{fmtInt(totals.chatsMeta)}</span></div>
            <div className="bg-default-100 mb-2.5 h-3 w-full overflow-hidden rounded" aria-hidden="true">
              <div className="bg-default-400 h-full" style={{ width: `${((totals.chatsMeta ?? 0) / max) * 100}%` }} />
            </div>
            <div className="mb-1.25 flex items-center justify-between text-sm"><span>{t.chatDeep}</span><span className="tabular-nums">{fmtInt(totals.chatsDeepSameSet)}</span></div>
            <div className="bg-default-100 mb-2.5 h-3 w-full overflow-hidden rounded" aria-hidden="true">
              <div className="bg-primary h-full" style={{ width: `${(totals.chatsDeepSameSet / max) * 100}%` }} />
            </div>
            <p className="text-default-700 text-2xs mb-0">{fmt(t.h1Counted, { n: totals.adsCounted })}</p>
            {totals.excludedDeepChats > 0 && <p className="text-default-700 text-2xs mb-0">{fmt(t.h1Excluded, { m: totals.excludedDeepChats })}</p>}
          </>
        ) : deepOnly ? (
          <div className="flex items-center justify-between text-sm"><span>{t.chatMeta}</span><span><NoDataCell /></span></div>
        ) : status === 'OK' ? (
          <p className="text-default-700 mb-0 text-sm">{t.h1NoMetaChats}</p>
        ) : (
          <CardState status={status as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} notInAccount={notInAccount} />
        )}

        {ready && (
          <div className="border-default-300 mt-5 rounded border border-dashed p-2.5">
            {top ? (
              <div className="flex items-center gap-2.5">
                <AdThumb photoFileId={top.photoFileId} className="size-12 rounded-md" iconClass="text-xl" />
                <div className="min-w-0">
                  <p className="text-default-700 text-2xs mb-0.5">{t.h1Top}</p>
                  <h5 className="text-md mb-0 truncate font-semibold" title={adDisplayName(top.title, top.adId, idFallback) ?? top.adId}>{adDisplayName(top.title, top.adId, idFallback) ?? top.adId}</h5>
                  <p className="text-default-700 mb-0 text-sm tabular-nums">{fmt(t.h1TopLine, { a: fmtInt(top.chatsMeta), b: fmtInt(top.chatsDeep) })}</p>
                  <a href="#ad-gap-table" className="text-primary min-h-11 text-sm underline lg:min-h-0">{t.h1TopLink}</a>
                </div>
              </div>
            ) : (
              <p className="text-default-700 mb-0 text-sm">{fmt(t.h1None, { pct: HIGH_GAP_PCT, min: HIGH_GAP_MIN_META_CHATS })}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
