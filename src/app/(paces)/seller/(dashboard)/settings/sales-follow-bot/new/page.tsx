/**
 * สร้างบอทติดตามยอดขาย — /settings/sales-follow-bot/new (feature 00095 S-7 · mockup ส่วน 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx (ฟอร์มสร้าง 2 คอลัมน์ — ตัวฟอร์มอยู่ใน BotForm)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/page.tsx (gate H2 + NoPermissionCard)
 * ร้านไม่เปิดใช้เข้า URL ตรง = หน้า "เร็ว ๆ นี้" (gateBotPage) ไม่ใช่ 500/ข้อมูล (AC-FB-83)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'

import { getT } from '@/i18n/server'
import { getBotOptions, listBots } from '@/services/sales-follow-bot.service'
import BotForm from '../components/BotForm'
import { LoadFailed } from '../components/sfb-ui'
import { gateBotPage } from '../gate'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.salesFollowBot.newBotTitle }
}

const load = async (shopId: string) => {
  const [bots, options] = await Promise.all([listBots(shopId), getBotOptions(shopId)])
  return { bots, options }
}

export default async function NewSalesFollowBotPage() {
  const session = await getServerSession(authOptions)
  const g = await gateBotPage(session, await gatePage(session, 'H2'))
  if (!g.ok) return g.node
  let data: Awaited<ReturnType<typeof load>> | null = null
  try {
    data = await load(g.shopId)
  } catch (e) {
    console.error('[sales-follow-bot new page]', e instanceof Error ? e.name : typeof e)
  }
  if (!data) return <LoadFailed message={g.t.salesFollowBot.listFailed} />
  return <BotForm bot={null} bots={data.bots} options={data.options} testRooms={[]} />
}
