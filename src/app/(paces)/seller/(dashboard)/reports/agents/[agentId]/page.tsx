/**
 * รายละเอียดผลงานของแอดมินหนึ่งคน (feature 00059)
 *
 * Base (โครงหน้า: breadcrumb → การ์ดสถิติ → กราฟ → ตาราง):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 * Base (การ์ดสถิติ): src/app/(paces)/seller/(dashboard)/_shared/PacesStatCard.tsx
 *
 * 🛑 ด่านสิทธิ์อยู่ที่นี่ด้วย ไม่ใช่แค่ที่ API — หน้านี้เป็น RSC ที่ query ตรง คนที่พิมพ์ URL
 * ของเพื่อนร่วมงานเข้ามาต้องไม่เห็นอะไร (โจทย์ข้อ 12)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import PacesStatCard from '../../../_shared/PacesStatCard'
import SellerErrorState from '../../../_shared/SellerErrorState'
import { authOptions } from '@/lib/auth'
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { formatPercent, formatResponseDuration } from '@/lib/agent-performance'
import { MAX_RANGE_DAYS, parseReportQuery } from '@/lib/agent-report-query'
import { resolveAgentReportAccess } from '@/services/agent-report-access.service'
import { getAgentDetailBundle } from '@/services/agent-performance.service'
import AgentTrendChart from './components/AgentTrendChart'
import ConversationBreakdownTable from './components/ConversationBreakdownTable'
import ReportFilters from '../components/ReportFilters'
import type { BreakdownRow } from '../components/data'

export const metadata: Metadata = { title: 'ผลงานแอดมิน' }

/** เพดานแถวของตารางย่อย — ตรงกับ `MAX_LIMIT` ของ API route ตัวเดียวกัน */
const BREAKDOWN_LIMIT = 100

type SearchParams = {
  from?: string
  to?: string
  channel?: string
  source?: string
  shopChannelId?: string
}

export default async function AgentPerformanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { agentId } = await params
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const access = await resolveAgentReportAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (access.kind === 'NO_SHOP') notFound()

  if (access.kind === 'SELF' && agentId !== access.scopeToAgentUserId) {
    return (
      <>
        <PageBreadcrumb title="ผลงานแอดมิน" subtitle="รายงาน" />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="lock" className="text-warning mx-auto mb-4 size-16" />
          <h2 className="text-dark mb-2 text-xl font-bold">ดูผลงานของคนอื่นไม่ได้</h2>
          <p className="text-default-400 mb-6">
            เจ้าของร้านเป็นผู้เปิดสิทธิ์ดูผลงานของทั้งทีม — ตอนนี้คุณดูได้เฉพาะของตัวเอง
          </p>
          <Link
            href="/reports/agents"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white">
            <Icon icon="arrow-left" />
            กลับไปหน้ารายงาน
          </Link>
        </div>
      </>
    )
  }

  const parsed = parseReportQuery({
    from: sp.from,
    to: sp.to,
    channel: sp.channel,
    source: sp.source,
    shopChannelId: sp.shopChannelId,
  })

  let detail
  let breakdown
  try {
    /* โหลดข้อมูลช่วงปัจจุบัน **ครั้งเดียว** แล้วแตกเป็นสองมุมมอง — เดิมสองฟังก์ชันต่างคนต่าง
       โหลดชุดเดียวกัน ทำให้หน้านี้ยิง 11 query โดย 3 ใน 11 ซ้ำกันเป๊ะ (วัดจริง: 813 ms → ดู
       `getAgentDetailBundle`) และเป็นผลข้างเคียงที่มองไม่เห็นจากฝั่งผู้เรียก */
    ;({ detail, breakdown } = await getAgentDetailBundle(access.shop.id, agentId, parsed.filters, {
      limit: BREAKDOWN_LIMIT,
      offset: 0,
    }))
  } catch (e) {
    console.error('[reports/agents/:id] load failed', e)
    return (
      <>
        <PageBreadcrumb title="ผลงานแอดมิน" subtitle="รายงาน" />
        <SellerErrorState
          title="โหลดรายงานไม่สำเร็จ"
          message="ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว — ข้อมูลของคุณยังอยู่ครบ ลองใหม่อีกครั้งได้เลย"
          retryHref="/reports/agents"
        />
      </>
    )
  }

  if (!detail) notFound()

  const canSeeRevenue = access.kind === 'FULL'
  const { metrics, previous } = detail

  const change = (cur: number | null, prev: number | null | undefined, invert = false) =>
    cur === null || prev === null || prev === undefined ? null : pctChangeVsPrev(cur, prev, invert)

  const rows: BreakdownRow[] = breakdown.rows.map((r) => ({
    conversationId: r.conversationId,
    customerName: r.customerName,
    channel: r.channel,
    source: r.source,
    // ชื่อคนตอบครั้งแรก — หน้านี้ scope อยู่ที่คนเดียวอยู่แล้ว แต่เธรดที่ส่งต่อกันมาอาจมี
    // คนอื่นเป็นผู้ตอบครั้งแรก จึงต้องบอกตามจริง ไม่ใช่เหมาว่าเป็นคนที่กำลังดูอยู่
    assignedAgentName:
      r.assignedAgentUserId === null
        ? null
        : r.assignedAgentUserId === agentId
          ? detail.agent.displayName
          : 'สมาชิกคนอื่น',
    startedAtISO: r.startedAt.toISOString(),
    firstResponseSec: r.firstResponseSec,
    durationSec: r.durationSec,
    orderNo: r.orderNo,
    orderValue: canSeeRevenue ? r.orderValue : null,
    result: r.result,
  }))

  return (
    <>
      <PageBreadcrumb
        title={detail.agent.displayName}
        subtitle="ผลงานแอดมิน"
        trail={[{ label: 'ผลงานแอดมิน', href: '/reports/agents' }]}
      />

      <ReportFilters
        from={parsed.label.from}
        to={parsed.label.to}
        channel={parsed.filters.channel ?? null}
        source={parsed.filters.source ?? null}
        shopChannelId={parsed.filters.shopChannelId ?? null}
        channels={[]}
        clamped={parsed.clamped}
        maxRangeDays={MAX_RANGE_DAYS}
      />

      {!detail.agent.isCurrentMember && (
        <p className="text-warning-ink bg-warning/15 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="user-off" className="shrink-0 text-base" aria-hidden="true" />
          บัญชีนี้ไม่ได้เป็นสมาชิกของร้านแล้ว — ตัวเลขที่แสดงคือผลงานย้อนหลังในช่วงที่เลือก
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PacesStatCard
          icon="messages"
          iconClass="bg-primary/15 text-primary-ink"
          title="แชทที่ดูแล"
          note="เธรดที่คนนี้ตอบอย่างน้อยหนึ่งครั้ง หรือเป็นเจ้าของคำสั่งซื้อที่ผูกกับเธรดนั้น"
          text={formatNumberNoSymbol(metrics.conversations)}
          valueClass="text-default-900"
          changePercent={change(metrics.conversations, previous?.conversations ?? null)}
          bulletClass="text-primary"
          metric="เข้าเกณฑ์ปิดการขาย"
          metricValue={formatNumberNoSymbol(metrics.qualifiedConversations)}
        />
        <PacesStatCard
          icon="clock-bolt"
          iconClass="bg-info/15 text-info-ink"
          title="ตอบครั้งแรกเฉลี่ย"
          note="เฉพาะเธรดที่คนนี้เป็นผู้ตอบครั้งแรก"
          text={formatResponseDuration(metrics.firstResponseAvgSec)}
          valueClass="text-default-900"
          changePercent={change(
            metrics.firstResponseAvgSec,
            previous?.firstResponseAvgSec ?? null,
            true,
          )}
          changeHint="ลดลง = ตอบเร็วขึ้น"
          bulletClass="text-info"
          metric="ค่ากลาง"
          metricValue={formatResponseDuration(metrics.firstResponseMedianSec)}
        />
        <PacesStatCard
          icon="message-2-share"
          iconClass="bg-info/15 text-info-ink"
          title="ตอบเฉลี่ยทั้งบทสนทนา"
          note="เฉพาะรอบที่คนนี้เป็นคนตอบ ไม่รวมรอบที่เพื่อนร่วมทีมตอบในเธรดเดียวกัน"
          text={formatResponseDuration(metrics.responseAvgSec)}
          valueClass="text-default-900"
          changePercent={change(metrics.responseAvgSec, previous?.responseAvgSec ?? null, true)}
          changeHint="ลดลง = ตอบเร็วขึ้น"
          bulletClass="text-info"
          metric="จำนวนครั้งที่วัดได้"
          metricValue={formatNumberNoSymbol(metrics.responseSampleCount)}
        />
        <PacesStatCard
          icon="shield-check"
          iconClass="bg-success/15 text-success-ink"
          title="ตอบทันเกณฑ์"
          note={`ตอบครั้งแรกภายใน ${Math.round(detail.sla.firstResponseSec / 60)} นาที · นับเฉพาะเธรดที่คนนี้เป็นผู้ตอบครั้งแรก`}
          text={formatPercent(metrics.slaPct)}
          valueClass="text-default-900"
          changePercent={change(metrics.slaPct, previous?.slaPct ?? null)}
          bulletClass="text-success"
          metric="ทันเกณฑ์"
          metricValue={`${formatNumberNoSymbol(metrics.slaWithin)}/${formatNumberNoSymbol(metrics.slaRequired)}`}
        />
        <PacesStatCard
          icon="receipt-2"
          iconClass="bg-default-200 text-default-700"
          title="คำสั่งซื้อที่เปิด"
          note="ใบที่ยกเครดิตให้คนนี้ตามกติกา (คนกดสร้าง → เจ้าของเธรด ณ เวลานั้น)"
          text={formatNumberNoSymbol(metrics.ordersCreated)}
          valueClass="text-default-900"
          changePercent={change(metrics.ordersCreated, previous?.ordersCreated ?? null)}
          bulletClass="text-default-500"
          metric="แชทที่ปิดการขายได้"
          metricValue={formatNumberNoSymbol(metrics.convertedConversations)}
        />
        <PacesStatCard
          icon="target-arrow"
          iconClass="bg-success/15 text-success-ink"
          title="อัตราปิดการขาย"
          note="แชทที่ปิดได้ ÷ แชทที่เข้าเกณฑ์ของคนนี้"
          text={formatPercent(metrics.conversionRatePct)}
          valueClass="text-default-900"
          changePercent={change(metrics.conversionRatePct, previous?.conversionRatePct ?? null)}
          bulletClass="text-success"
          metric="เวลาปิดการขายเฉลี่ย"
          metricValue={formatResponseDuration(metrics.timeToCloseAvgSec)}
        />
        {canSeeRevenue && (
          <PacesStatCard
            icon="cash-banknote"
            iconClass="bg-success/15 text-success-ink"
            title="ยอดขาย"
            note="เฉพาะใบที่ระบบถือว่าขายแล้วจริง — ใบที่ยกเลิกไม่นับ"
            text={formatBaht(metrics.revenue)}
            valueClass="text-default-900"
            changePercent={change(metrics.revenue, previous?.revenue ?? null)}
            bulletClass="text-success"
            metric="เฉลี่ยต่อแชทที่ปิดได้"
            metricValue={
              metrics.convertedConversations > 0
                ? formatBaht(metrics.revenue / metrics.convertedConversations)
                : '—'
            }
          />
        )}
      </div>

      <div className="mb-4">
        <AgentTrendChart points={detail.trend} canSeeRevenue={canSeeRevenue} />
      </div>

      <ConversationBreakdownTable rows={rows} canSeeRevenue={canSeeRevenue} />

      {breakdown.total > rows.length && (
        <p className="text-default-500 mt-3 text-center text-sm">
          {/* 🛑 ห้ามตัดเงียบ ๆ — ผู้ใช้ต้องรู้ว่ากำลังดูไม่ครบ (no-silent-caps) */}
          แสดง {formatNumberNoSymbol(rows.length)} จาก {formatNumberNoSymbol(breakdown.total)} บทสนทนา
          — ย่อช่วงเวลาลงเพื่อดูให้ครบ
        </p>
      )}
    </>
  )
}
