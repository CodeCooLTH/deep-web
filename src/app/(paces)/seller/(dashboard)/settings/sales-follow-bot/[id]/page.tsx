/**
 * แก้บอทติดตามยอดขาย — /settings/sales-follow-bot/[id] (feature 00095 S-7 · mockup ส่วน 3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx (ฟอร์ม 2 คอลัมน์ — ตัวฟอร์มอยู่ใน BotForm)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/page.tsx (params Promise · โหลดผ่าน service ตรง scope ด้วย shopId)
 * id ไม่ใช่ของร้าน/ถูกลบ = การ์ด "ไม่พบบอทนี้" (ไม่เปิดเผยว่ามีอยู่ในร้านอื่น) — ไม่ใช่ 500
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'

import { getT } from '@/i18n/server'
import { SalesFollowBotNotFoundError } from '@/lib/sales-follow-bot/errors'
import { getBot, getBotOptions, getTestRoomLabels, listBots } from '@/services/sales-follow-bot.service'
import BotForm from '../components/BotForm'
import { LoadFailed } from '../components/sfb-ui'
import { ComingSoon, gateBotPage } from '../gate'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const load = async (shopId: string, id: string) => {
  const [bot, bots, options] = await Promise.all([getBot(shopId, id), listBots(shopId), getBotOptions(shopId)])
  return { bot, bots, options, testRooms: await getTestRoomLabels(shopId, bot.testRoomIds) }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.salesFollowBot.pageTitle }
}

export default async function EditSalesFollowBotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const g = await gateBotPage(session, await gatePage(session, 'H2'))
  if (!g.ok) return g.node
  const t = g.t.salesFollowBot
  const missing = <ComingSoon title={t.notFoundTitle} body={t.notFoundBody} cta={t.backToList} href="/settings/sales-follow-bot" />
  // id ที่ไม่ใช่ uuid = ไม่มีบอทแน่ — ไม่ยิงฐาน (Prisma โยน P2023 ซึ่งจะกลายเป็น "โหลดไม่สำเร็จ" ทั้งที่จริงคือไม่พบ)
  if (!UUID_RE.test(id)) return missing
  let data: Awaited<ReturnType<typeof load>> | null = null
  let notFound = false
  try {
    data = await load(g.shopId, id)
  } catch (e) {
    if (e instanceof SalesFollowBotNotFoundError) notFound = true
    else console.error('[sales-follow-bot edit page]', e instanceof Error ? e.name : typeof e)
  }
  if (notFound) return missing
  if (!data) return <LoadFailed message={t.listFailed} />
  return <BotForm bot={data.bot} bots={data.bots} options={data.options} testRooms={data.testRooms} />
}
