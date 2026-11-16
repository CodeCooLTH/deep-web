/**
 * บอทติดตามยอดขาย — รายการบอท + ประวัติการส่ง (feature 00095 S-7 · mockup ส่วน 1, 1b, 2)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-notify/page.tsx (gate + PageBreadcrumb + บรรทัดอธิบายเดียว)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * ด่าน = H2 (OWNER/MANAGER/CHAT — มติ Q-11 ข: ไม่มีหน้าอ่านอย่างเดียว) · แท็บเป็นลิงก์ `?tab=log`
 * ข้อมูลโหลดจาก service ตรง (ไม่ self-fetch API ตัวเอง) — โหลดไม่สำเร็จ = การ์ด "โหลด…ไม่สำเร็จ" + ลองใหม่ ไม่ใช่หน้า 500
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import Link from 'next/link'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { getT } from '@/i18n/server'
import { fmt } from '@/i18n/fmt'
import { repliedPct, type BotStatsResult } from '@/lib/sales-follow-bot/stats'
import { getBotOptions, getBotStats7d, listBots, listSends, type BotDto, type SendHistoryItem } from '@/services/sales-follow-bot.service'
import BotListClient from './components/BotListClient'
import BotTabs from './components/BotTabs'
import SendHistoryClient from './components/SendHistoryClient'
import { LoadFailed } from './components/sfb-ui'
import { gateBotPage } from './gate'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.salesFollowBot.pageTitle }
}

const CREATE_CLS = 'btn bg-primary hover:bg-primary-hover min-h-11 w-full text-white md:ms-auto md:w-auto lg:min-h-0'

/** บรรทัดสรุป 7 วันใต้แท็บ (แทนไทล์ 4 ตัว) — ตัวหารของ % ตอบกลับบอกครบ · ส่งไม่สำเร็จเป็นลิงก์ไปแท็บประวัติ */
function StatsLine({ stats, t }: { stats: BotStatsResult | null; t: Awaited<ReturnType<typeof getT>>['salesFollowBot'] }) {
  const sep = <span aria-hidden="true"> · </span>
  if (!stats) return <p className="text-default-700 -mt-2 mb-base text-sm">{t.statsWindow}{sep}–</p>
  const { total } = stats
  const pct = repliedPct(total)
  return (
    <p className="text-default-700 -mt-2 mb-base flex flex-wrap items-center gap-x-1 text-sm">
      <span>{t.statsWindow}</span>
      {sep}
      <span className="tabular-nums">{fmt(t.statsSent, { n: total.sent.toLocaleString() })}</span>
      {sep}
      <span className="tabular-nums">{pct === null ? t.statsRepliedNone : fmt(t.statsReplied, { pct, a: total.replied.toLocaleString(), b: total.reached.toLocaleString() })}</span>
      {total.failed > 0 && (
        <>
          {sep}
          <Link href="/settings/sales-follow-bot?tab=log" className="text-primary-ink inline-flex min-h-11 items-center font-medium underline tabular-nums lg:min-h-0">
            {fmt(t.statsFailed, { n: total.failed.toLocaleString() })}
          </Link>
        </>
      )}
    </p>
  )
}

export default async function SalesFollowBotPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getServerSession(authOptions)
  const g = await gateBotPage(session, await gatePage(session, 'H2'))
  if (!g.ok) return g.node
  const { t, shopId } = g
  const tab = (await searchParams).tab === 'log' ? 'log' : 'bots'

  let list: { bots: BotDto[]; hasChannel: boolean; stats: BotStatsResult | null } | null = null
  let log: { items: SendHistoryItem[]; nextCursor: string | null } | null = null
  try {
    if (tab === 'bots') {
      // ตัวเลข 7 วันโหลดไม่ได้ ≠ รายการโหลดไม่ได้ — ใช้ null แล้วแสดง "–" (ไม่ใช่ 0 ที่หลอกว่าไม่มีการส่ง)
      const [bots, options, stats] = await Promise.all([
        listBots(shopId),
        getBotOptions(shopId),
        getBotStats7d(shopId).catch((e) => {
          console.error('[sales-follow-bot stats]', e instanceof Error ? e.name : typeof e)
          return null
        }),
      ])
      list = { bots, hasChannel: options.channels.length > 0, stats }
    } else {
      log = await listSends(shopId)
    }
  } catch (e) {
    // log แค่ชื่อชนิด — ข้อความ Prisma อาจมีข้อมูลลูกค้า (NFR-FB-04)
    console.error('[sales-follow-bot page]', e instanceof Error ? e.name : typeof e)
  }

  // ปุ่มสร้างที่หัว: เฉพาะแท็บบอทที่มีบอทแล้ว (ไม่มี = ปุ่มอยู่กลางการ์ด ไม่ซ้ำ) · ไม่มีช่องทาง = ปิดพร้อม aria-describedby ชี้แบนเนอร์
  const showCreate = tab === 'bots' && list !== null && list.bots.length > 0

  return (
    <>
      <PageBreadcrumb title={t.salesFollowBot.pageTitle} homeLabel={t.common.home} trail={[{ label: t.salesFollowBot.breadcrumbSettings, href: '/settings' }]} />
      <p className="text-default-700 mb-base text-sm">{t.salesFollowBot.pageSubtitle}</p>

      <div className="mb-base flex flex-col gap-3 md:flex-row md:items-center">
        <BotTabs active={tab} labels={{ aria: t.salesFollowBot.tabsAria, bots: t.salesFollowBot.tabBots, log: t.salesFollowBot.tabLog }} />
        {showCreate &&
          list &&
          (list.hasChannel ? (
            <Link href="/settings/sales-follow-bot/new" className={CREATE_CLS}>
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              {t.salesFollowBot.createBot}
            </Link>
          ) : (
            <button type="button" disabled aria-describedby="sfb-no-channel" className={`${CREATE_CLS} disabled:opacity-50`}>
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              {t.salesFollowBot.createBot}
            </button>
          ))}
      </div>
      {tab === 'bots' && list && list.bots.length > 0 && <StatsLine stats={list.stats} t={t.salesFollowBot} />}
      
      {tab === 'bots' ? (
        list ? (
          <BotListClient bots={list.bots} hasChannel={list.hasChannel} stats={list.stats?.byBot ?? null} />
        ) : (
          <LoadFailed message={t.salesFollowBot.listFailed} />
        )
      ) : log ? (
        <SendHistoryClient initial={log.items} initialCursor={log.nextCursor} />
      ) : (
        <LoadFailed message={t.salesFollowBot.logFailed} />
      )}
    </>
  )
}
