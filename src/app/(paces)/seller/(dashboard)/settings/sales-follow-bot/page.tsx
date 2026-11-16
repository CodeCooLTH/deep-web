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
import { getBotOptions, listBots, listSends, type BotDto, type SendHistoryItem } from '@/services/sales-follow-bot.service'
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

export default async function SalesFollowBotPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getServerSession(authOptions)
  const g = await gateBotPage(session, await gatePage(session, 'H2'))
  if (!g.ok) return g.node
  const { t, shopId } = g
  const tab = (await searchParams).tab === 'log' ? 'log' : 'bots'

  let list: { bots: BotDto[]; hasChannel: boolean } | null = null
  let log: { items: SendHistoryItem[]; nextCursor: string | null } | null = null
  try {
    if (tab === 'bots') {
      const [bots, options] = await Promise.all([listBots(shopId), getBotOptions(shopId)])
      list = { bots, hasChannel: options.channels.length > 0 }
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

      {tab === 'bots' ? (
        list ? (
          <BotListClient bots={list.bots} hasChannel={list.hasChannel} />
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
