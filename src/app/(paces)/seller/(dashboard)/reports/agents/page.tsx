/**
 * รายงานผลงานแอดมิน — หน้าภาพรวม + ตารางจัดอันดับ (feature 00059)
 *
 * Base (โครงหน้า: breadcrumb → แถวการ์ดสถิติ → การ์ดตาราง):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 * Base (การ์ดสถิติ): src/app/(paces)/seller/(dashboard)/_shared/PacesStatCard.tsx
 *   (ซึ่ง copy มาจาก theme/.../apps/ecommerce/(products)/products/components/ProductStats.tsx)
 *
 * ── สิ่งที่หน้านี้รับผิดชอบ ──────────────────────────────────────────────────
 * ตัดสินสิทธิ์ · แปลง query · เรียก service · ส่งของที่ serialize ได้ลงไปให้ client
 * **ไม่มีสูตรอะไรอยู่ในไฟล์นี้เลย** ทุกตัวเลขมาจาก `agent-performance.ts` ซึ่งมีเทสเป็นด่าน
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import PacesStatCard from '../../_shared/PacesStatCard'
import SellerErrorState from '../../_shared/SellerErrorState'
import { authOptions } from '@/lib/auth'
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { formatPercent, formatResponseDuration } from '@/lib/agent-performance'
import { MAX_RANGE_DAYS, parseReportQuery } from '@/lib/agent-report-query'
import { resolveAgentReportAccess } from '@/services/agent-report-access.service'
import { getAgentPerformanceOverview } from '@/services/agent-performance.service'
import AgentLeaderboard from './components/AgentLeaderboard'
import ReportFilters from './components/ReportFilters'
import type { LeaderboardRow } from './components/data'

export const metadata: Metadata = { title: 'ผลงานแอดมิน' }

type SearchParams = {
  from?: string
  to?: string
  channel?: string
  source?: string
  shopChannelId?: string
}

export default async function AgentPerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const access = await resolveAgentReportAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )

  if (access.kind === 'NO_SHOP') {
    return (
      <>
        <PageBreadcrumb title="ผลงานแอดมิน" subtitle="รายงาน" />
        <div className="card mx-auto max-w-2xl rounded-xl p-10 text-center">
          <Icon icon="building-store" className="text-warning mx-auto mb-4 size-16" />
          <h2 className="text-dark mb-2 text-xl font-bold">ยังไม่มีร้านค้า</h2>
          <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะดูรายงานได้</p>
          <Link
            href="/shop"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white">
            <Icon icon="plus" />
            สร้างร้านค้า
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

  /**
   * 🛑 ฐานข้อมูลล่มต้องไม่หน้าตาเหมือน "ร้านนี้ยังไม่มีใครตอบแชท" — บทเรียนเดียวกับ
   * `/customers` (feature 00057 หัวไฟล์ข้อ 3) ปล่อยให้ throw ขึ้นมาแล้วแยก UI คนละแบบ
   */
  let result
  try {
    result = await getAgentPerformanceOverview(access.shop.id, parsed.filters, {
      scopeToAgentUserId: access.kind === 'SELF' ? access.scopeToAgentUserId : null,
    })
  } catch (e) {
    console.error('[reports/agents] getAgentPerformanceOverview failed', e)
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

  const { overview, previous } = result
  const canSeeRevenue = access.kind === 'FULL'

  const rows: LeaderboardRow[] = result.leaderboard.map((r) => ({
    agentUserId: r.agentUserId,
    displayName: r.displayName,
    avatar: r.avatar,
    isCurrentMember: r.isCurrentMember,
    conversations: r.conversations,
    qualifiedConversations: r.qualifiedConversations,
    convertedConversations: r.convertedConversations,
    conversionRatePct: r.conversionRatePct,
    ordersCreated: r.ordersCreated,
    // ตัดที่นี่ด้วย ไม่ใช่แค่ไม่ render — หน้า (paces) อยู่ใต้ client layout ทุก field ที่ส่งลงไป
    // อยู่ใน flight payload ที่เปิดดูได้ (feedback_rsc_pii_neutralize_at_source)
    revenue: canSeeRevenue ? r.revenue : null,
    firstResponseAvgSec: r.firstResponseAvgSec,
    firstResponseMedianSec: r.firstResponseMedianSec,
    responseAvgSec: r.responseAvgSec,
    responseMedianSec: r.responseMedianSec,
    responseSampleCount: r.responseSampleCount,
    slaPct: r.slaPct,
    slaRequired: r.slaRequired,
    slaWithin: r.slaWithin,
    timeToCloseAvgSec: r.timeToCloseAvgSec,
    repliedConversations: r.repliedConversations,
    conversationsWithOrder: r.conversationsWithOrder,
    conversationsWithClosedOrder: r.conversationsWithClosedOrder,
    ordersCreatedByOthers: r.ordersCreatedByOthers,
  }))

  const qs = new URLSearchParams()
  if (sp.from) qs.set('from', sp.from)
  if (sp.to) qs.set('to', sp.to)
  if (parsed.filters.channel) qs.set('channel', parsed.filters.channel)
  if (parsed.filters.source) qs.set('source', parsed.filters.source)
  if (parsed.filters.shopChannelId) qs.set('shopChannelId', parsed.filters.shopChannelId)

  /* ทิศของ badge: เวลาตอบ "ลดลง = ดีขึ้น" จึงต้อง invert ไม่งั้นตอบเร็วขึ้นจะขึ้นสีแดง
     (เหตุผลเดียวกับที่ `pctChangeVsPrev` มี flag นี้ไว้ให้ค่าใช้จ่าย) */
  const change = (cur: number | null, prev: number | null | undefined, invert = false) =>
    cur === null || prev === null || prev === undefined ? null : pctChangeVsPrev(cur, prev, invert)

  return (
    <>
      <PageBreadcrumb title="ผลงานแอดมิน" subtitle="รายงาน" />

      <ReportFilters
        from={parsed.label.from}
        to={parsed.label.to}
        channel={parsed.filters.channel ?? null}
        source={parsed.filters.source ?? null}
        shopChannelId={parsed.filters.shopChannelId ?? null}
        channels={result.channels}
        clamped={parsed.clamped}
        maxRangeDays={MAX_RANGE_DAYS}
      />

      {access.kind === 'SELF' && (
        /* พนักงานที่ยังไม่ได้รับสิทธิ์การเงิน — บอกให้รู้ว่ากำลังดูอะไรอยู่
           🛑 ห้ามแสดงหน้าเปล่าหรือ 403: ผลงานของตัวเองคือข้อมูลของเจ้าตัวเอง */
        <p className="text-default-700 bg-default-100 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="user-shield" className="shrink-0 text-base" aria-hidden="true" />
          คุณกำลังดูผลงานของตัวเอง — เจ้าของร้านเป็นผู้เปิดสิทธิ์ดูผลงานของทั้งทีม
        </p>
      )}

      {overview.answeredOutsideSystemConversations > 0 && (
        /**
         * 🛑 ตัวเลขบางส่วนที่หน้าตาเหมือนตัวเลขที่ครบแล้ว อันตรายกว่าไม่มีตัวเลข
         * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
         *
         * ผู้ใช้เคาะ 2026-08-27: แชทที่ตอบจาก Business Suite **ไม่นับ** ทั้งตัวตั้งและตัวหาร
         * เพราะ Meta ไม่ส่งชื่อผู้พิมพ์กลับมา ⇒ ทำอะไรกับมันไม่ได้จริง ๆ
         * แต่ "ไม่นับ" ต้องมาคู่กับ "บอกว่าไม่ได้นับไปเท่าไร" เสมอ ไม่งั้นผู้จัดการจะอ่านตัวเลข
         * ที่เหลือว่าเป็นภาพทั้งหมดของร้าน (ข้อมูลจริง prod: บางสาขาตกกลุ่มนี้ 830 จาก 834 แชท)
         */
        <p className="text-warning-ink bg-warning/15 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            อีก {formatNumberNoSymbol(overview.answeredOutsideSystemConversations)} แชทถูกตอบจาก
            แอปของแพลตฟอร์มโดยตรง (เช่น Facebook Business Suite) ซึ่งไม่ส่งชื่อผู้พิมพ์กลับมา —
            <strong className="font-semibold"> ไม่ถูกนับในตัวเลขทั้งหน้านี้</strong>{' '}
            ทั้งเวลาตอบและ SLA เพราะระบบไม่รู้ว่าใครตอบและตอบเมื่อไร
            ให้ทีมตอบผ่านกล่องข้อความของ Deep แล้วแชทกลุ่มนี้จะเข้ามาเองทันที
          </span>
        </p>
      )}

      {result.unlinkedOrderCount > 0 && (
        /**
         * 🛑 ตัวเลขบางส่วนที่หน้าตาเหมือนตัวเลขที่ครบแล้ว อันตรายกว่าไม่มีตัวเลข
         * ข้อมูลจริงบน prod 2026-08-27 (BT Premium คลอง 4 ธัญบุรี): ออเดอร์ 30 วัน 110 ใบ
         * ผูกกับเธรดแชทแค่ 52 ใบ ⇒ ถ้าไม่บอก การ์ด "คำสั่งซื้อ" จะอ่านเหมือนยอดรวมของร้าน
         */
        <p className="text-default-700 bg-default-100 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            รายงานนี้นับเฉพาะคำสั่งซื้อที่เปิดจากในแชท — ช่วงนี้มีอีก{' '}
            {formatNumberNoSymbol(result.unlinkedOrderCount)} ใบที่เปิดนอกแชท (หน้าร้าน/POS/ลิงก์ตรง)
            ซึ่งไม่ได้อยู่ในตัวเลขข้างล่าง
          </span>
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PacesStatCard
          icon="messages"
          iconClass="bg-primary/15 text-primary-ink"
          title="แชททั้งหมด"
          note="เธรดที่ถูกเปิดในช่วงเวลาที่เลือก — ตัวเลขทุกตัวในหน้านี้อิงชุดเดียวกันนี้"
          text={formatNumberNoSymbol(overview.conversations)}
          valueClass="text-default-900"
          changePercent={change(overview.conversations, previous?.conversations ?? null)}
          bulletClass="text-primary"
          metric="เข้าเกณฑ์ปิดการขาย"
          metricValue={formatNumberNoSymbol(overview.qualifiedConversations)}
        />
        <PacesStatCard
          icon="clock-bolt"
          iconClass="bg-info/15 text-info-ink"
          title="ตอบครั้งแรกเฉลี่ย"
          note="นับจากข้อความแรกของลูกค้าถึงคำตอบของ 'คน' ใบแรก — ไม่นับบอทและข้อความระบบ"
          text={formatResponseDuration(overview.firstResponseAvgSec)}
          valueClass="text-default-900"
          changePercent={change(
            overview.firstResponseAvgSec,
            previous?.firstResponseAvgSec ?? null,
            true,
          )}
          changeHint="ลดลง = ตอบเร็วขึ้น"
          bulletClass="text-info"
          metric="ค่ากลาง"
          metricValue={formatResponseDuration(overview.firstResponseMedianSec)}
        />
        <PacesStatCard
          icon="message-2-share"
          iconClass="bg-info/15 text-info-ink"
          title="ตอบเฉลี่ยทั้งบทสนทนา"
          note="ทุกครั้งที่ลูกค้าถามแล้วรอคำตอบ — ลูกค้าพิมพ์รัวหลายใบนับเป็นการรอครั้งเดียว"
          text={formatResponseDuration(overview.responseAvgSec)}
          valueClass="text-default-900"
          changePercent={change(overview.responseAvgSec, previous?.responseAvgSec ?? null, true)}
          changeHint="ลดลง = ตอบเร็วขึ้น"
          bulletClass="text-info"
          metric="จำนวนครั้งที่วัดได้"
          metricValue={formatNumberNoSymbol(overview.responseSampleCount)}
        />
        <PacesStatCard
          icon="shield-check"
          iconClass="bg-success/15 text-success-ink"
          title="ตอบทันเกณฑ์"
          note={`เกณฑ์ตั้งต้นของระบบ: ตอบครั้งแรกภายใน ${Math.round(result.sla.firstResponseSec / 60)} นาที · แชทที่ไม่มีใครตอบเลยนับว่าไม่ทัน · แชทที่ตอบจากนอกระบบไม่ถูกนับทั้งตัวตั้งและตัวหาร`}
          text={formatPercent(overview.slaPct)}
          valueClass="text-default-900"
          changePercent={change(overview.slaPct, previous?.slaPct ?? null)}
          bulletClass="text-danger"
          metric="ยังไม่มีใครตอบ"
          metricValue={formatNumberNoSymbol(overview.unansweredConversations)}
        />
        <PacesStatCard
          icon="receipt-2"
          /* 🛑 ห้ามใช้ `text-secondary-ink` — `--color-secondary-ink` ไม่มีในธีม (ยืนยันแล้ว
             ที่ BadgeDetailModal.tsx:49) คลาสจะไม่ผลิตสีอะไรเลยแล้วไอคอนหายไปกับพื้น
             ใช้คู่กลางแทน แบบเดียวกับการ์ด "ต้นทุนสินค้า" ใน PnlReportCard.tsx:84 */
          iconClass="bg-default-200 text-default-700"
          title="คำสั่งซื้อที่เปิด"
          note="ใบที่ผูกกับแชทในช่วงนี้ — รวมใบที่ยังไม่ยืนยันและใบที่ถูกยกเลิก"
          text={formatNumberNoSymbol(overview.ordersCreated)}
          valueClass="text-default-900"
          changePercent={change(overview.ordersCreated, previous?.ordersCreated ?? null)}
          bulletClass="text-default-500"
          metric="แชทที่ปิดการขายได้"
          metricValue={formatNumberNoSymbol(overview.convertedConversations)}
        />
        <PacesStatCard
          icon="target-arrow"
          iconClass="bg-success/15 text-success-ink"
          title="อัตราปิดการขาย"
          note="แชทที่ปิดได้ ÷ แชทที่เข้าเกณฑ์ (มีลูกค้าทัก + มีคนตอบ + ไม่ใช่สแปม) ไม่ใช่แชททั้งหมด"
          text={formatPercent(overview.conversionRatePct)}
          valueClass="text-default-900"
          changePercent={change(overview.conversionRatePct, previous?.conversionRatePct ?? null)}
          bulletClass="text-success"
          metric="เวลาปิดการขายเฉลี่ย"
          metricValue={formatResponseDuration(overview.timeToCloseAvgSec)}
        />
        {canSeeRevenue && (
          <PacesStatCard
            icon="cash-banknote"
            iconClass="bg-success/15 text-success-ink"
            title="ยอดขายจากแชท"
            note="นับเฉพาะใบที่ระบบถือว่าขายแล้วจริง (ยืนยันแล้ว หรือขนส่งรับของไปแล้ว) — ใบที่ยกเลิกไม่นับ"
            text={formatBaht(overview.revenue)}
            valueClass="text-default-900"
            changePercent={change(overview.revenue, previous?.revenue ?? null)}
            bulletClass="text-success"
            metric="เฉลี่ยต่อแชทที่ปิดได้"
            metricValue={
              overview.convertedConversations > 0
                ? formatBaht(overview.revenue / overview.convertedConversations)
                : '—'
            }
          />
        )}
      </div>

      <AgentLeaderboard
        rows={rows}
        totalConversations={overview.conversations}
        answeredOutsideSystemConversations={overview.answeredOutsideSystemConversations}
        canSeeRevenue={canSeeRevenue}
        queryString={qs.toString()}
      />
    </>
  )
}
