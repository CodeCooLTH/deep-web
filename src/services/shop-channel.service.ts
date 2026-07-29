import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/token-crypto'
import {
  subscribePageToApp,
  unsubscribePageFromApp,
  getPageIdFromToken,
  getInstagramAccountIdForPage,
  type PageInfo,
} from '@/lib/facebook/graph'

// จัดการช่องทางที่ร้านผูกไว้ (feature 00018)
// กติกาสำคัญ: accessTokenEnc ห้ามออกจากไฟล์นี้ในรูป plaintext ยกเว้นผ่าน
// getChannelByExternalId ที่ถูกเรียกจาก server เท่านั้น

export interface ChannelView {
  id: string
  provider: string
  externalId: string
  name: string
  avatarUrl: string | null
  status: string
}

// 'other-shop' พก shopName ของร้านที่เพจติดอยู่มาด้วย — เพื่อให้ข้อความแจ้ง user บอกได้ว่า
// "เพจนี้เชื่อมอยู่กับร้าน X แล้ว ถอดก่อนจึงจะย้ายมาได้" แทนที่จะเงียบ ๆ ว่า skipped เฉย ๆ
type ChannelUpsertResult =
  | { kind: 'created' | 'existing-same-shop' }
  | { kind: 'other-shop'; shopName: string | null }

// สร้างแถว ShopChannel — แยก P2002 ออกเป็น 2 ความหมาย เพราะ unique constraint ตอนนี้เป็น partial
// unique index บน (provider, externalId) WHERE status <> 'DISCONNECTED' (ดู migration
// 20260722000200_shopchannel_active_partial_unique — ไม่ใช่ @@unique เต็มตารางอีกต่อไป เพราะแถว
// DISCONNECTED ต้องไม่บล็อกร้านใหม่เชื่อมเพจเดิมซ้ำ) P2002 ที่โยนมาจึงชนกับแถวที่ "ยัง active อยู่"
// เท่านั้น: ร้านเดียวกันเชื่อมซ้ำ (เช่น retry หลัง subscribe ล้มเหลวรอบก่อน) ต้องไม่ถือเป็น
// error — ปล่อยให้ subscribePageToApp ยิงซ้ำได้ (ฝั่ง Meta idempotent) ส่วนร้านอื่นยึด externalId นี้ไปแล้ว
// (แถว active ของร้านอื่น) ต้องรายงาน skipped และห้ามแตะ subscribe/แถวเดิมของร้านนั้นเด็ดขาด
async function upsertChannel(params: {
  shopId: string
  userId: string
  provider: 'MESSENGER' | 'INSTAGRAM'
  externalId: string
  name: string
  accessToken: string
  // force: user ยืนยันแล้วว่าต้องการย้ายเพจมาร้านนี้ (เพจติดอยู่กับร้านอื่น) → ตัดแถว active
  // ของร้านอื่นก่อนแล้วสร้างใหม่ให้ร้านนี้ authorization: pages ที่เข้ามาถึงจุดนี้ผ่าน
  // listManageablePages(userToken) มาแล้ว = เป็นเพจที่ user มีสิทธิ์ MESSAGING+MODERATE จริง
  // (Meta ยืนยันตอน OAuth) การตัดการเชื่อมของร้านเดิมจึงเป็นสิทธิ์ที่ user มีอยู่แล้วโดยตัวมันเอง
  force?: boolean
}): Promise<ChannelUpsertResult> {
  // รูปเพจ (avatar ฝั่งร้านในเธรด) — URL สาธารณะแบบเสถียรของ Graph (ไม่ต้อง token, ไม่หมดอายุ,
  // redirect ไปรูปปัจจุบันเสมอ) pattern เดียวกับ avatar ผู้ใช้ FB login. เฉพาะ MESSENGER (page id
  // เป็น public picture); IG business account id คนละ ID space endpoint นี้ไม่คืนรูป → null (fallback initials)
  const avatarUrl =
    params.provider === 'MESSENGER'
      ? `https://graph.facebook.com/${params.externalId}/picture?type=large`
      : null

  // เพจนี้ "active" (status != DISCONNECTED) อยู่กับร้านอื่นหรือไม่ — partial unique scope เดียวกับ
  // index จริง (20260722000200_shopchannel_active_partial_unique)
  const activeElsewhere = await prisma.shopChannel.findFirst({
    where: {
      provider: params.provider,
      externalId: params.externalId,
      status: { not: 'DISCONNECTED' },
      shopId: { not: params.shopId },
    },
    select: { shopId: true, shop: { select: { shopName: true } } },
  })
  if (activeElsewhere && !params.force) {
    return { kind: 'other-shop', shopName: activeElsewhere.shop?.shopName ?? null }
  }

  // REUSE แถวเดิมของ "ร้านนี้" แทนการ create ใหม่ทุกครั้ง (บั๊ก prod 2026-07-23):
  // เดิม reconnect สร้าง ShopChannel id ใหม่เสมอ แล้วตั้งแถวเก่า DISCONNECTED — แต่ Conversation เก่า
  // ยังชี้ shopChannelId เก่า → เธรดอ่าน status=DISCONNECTED เด้ง banner "เชื่อมต่อมีปัญหา" ทั้งที่
  // settings โชว์ "เชื่อมแล้ว" (คนละแถว). reconnect ร้านเดิม = id เดิม → เธรดไม่ orphan
  // เลือกแถวที่มี contact มากสุด = แถวที่เธรดผูกอยู่จริง (reactivate ตัวนั้น ไม่ใช่แถวว่างที่เพิ่งสร้าง)
  const ownRows = await prisma.shopChannel.findMany({
    where: { provider: params.provider, externalId: params.externalId, shopId: params.shopId },
    select: { id: true, _count: { select: { contacts: true } } },
  })
  ownRows.sort((a, b) => b._count.contacts - a._count.contacts)
  const canonical = ownRows[0]

  await prisma.$transaction(async (tx) => {
    // force ย้ายเพจข้ามร้าน: ตัด active ของร้านอื่นก่อน (ในทรานแซกชันเดียว) — DISCONNECTED ไม่ลบแถว
    // เพื่อรักษาประวัติ Conversation/Message ของร้านเดิม
    if (params.force && activeElsewhere) {
      await tx.shopChannel.updateMany({
        where: {
          provider: params.provider,
          externalId: params.externalId,
          status: { not: 'DISCONNECTED' },
          shopId: { not: params.shopId },
        },
        data: { status: 'DISCONNECTED' },
      })
    }

    if (canonical) {
      // กันชน partial unique: ถ้าร้านนี้มีหลายแถว (จากบั๊กเดิม) ตัดตัวอื่นที่ยัง active ให้เหลือ canonical
      // ตัวเดียวเป็น ACTIVE
      await tx.shopChannel.updateMany({
        where: {
          provider: params.provider,
          externalId: params.externalId,
          shopId: params.shopId,
          id: { not: canonical.id },
          status: { not: 'DISCONNECTED' },
        },
        data: { status: 'DISCONNECTED' },
      })
      await tx.shopChannel.update({
        where: { id: canonical.id },
        data: {
          status: 'ACTIVE',
          accessTokenEnc: encryptToken(params.accessToken), // refresh token ทุก reconnect
          name: params.name,
          avatarUrl,
          connectedByUserId: params.userId,
        },
      })
    } else {
      await tx.shopChannel.create({
        data: {
          shopId: params.shopId,
          provider: params.provider,
          externalId: params.externalId,
          name: params.name,
          avatarUrl,
          accessTokenEnc: encryptToken(params.accessToken),
          connectedByUserId: params.userId,
        },
      })
    }
  })

  return { kind: canonical ? 'existing-same-shop' : 'created' }
}

/**
 * describePageStates — บอกสถานะของแต่ละเพจเทียบกับ "ร้านที่กำลังเชื่อม" ให้หน้าเลือกเพจ
 * (feature 00018 — หน้า /settings/channels/select คั่นหลัง OAuth)
 *
 * ทำไมดูแค่ provider MESSENGER: การจอง externalId เกิดที่ระดับ Page — แถว INSTAGRAM เป็นผลพลอยได้
 * ที่ upsert ตามเพจเดียวกันเสมอ ถ้านับ IG ด้วยจะได้สถานะซ้ำของสิ่งเดียวกัน
 *
 * scope เดียวกับ partial unique index: นับเฉพาะแถวที่ status <> 'DISCONNECTED' — เพจที่เคยเชื่อม
 * แล้วถอดไปแล้วต้องขึ้นว่า 'available' ไม่ใช่ค้างว่าติดร้านเดิม
 */
export type PageConnectionState = 'available' | 'connected-here' | 'other-shop'

export async function describePageStates(
  shopId: string,
  pageIds: string[],
): Promise<Record<string, { state: PageConnectionState; occupiedBy: string | null }>> {
  if (pageIds.length === 0) return {}

  const rows = await prisma.shopChannel.findMany({
    where: {
      provider: 'MESSENGER',
      externalId: { in: pageIds },
      status: { not: 'DISCONNECTED' },
    },
    select: { externalId: true, shopId: true, shop: { select: { shopName: true } } },
  })

  const byPage = new Map(rows.map((r) => [r.externalId, r]))
  const out: Record<string, { state: PageConnectionState; occupiedBy: string | null }> = {}
  for (const id of pageIds) {
    const row = byPage.get(id)
    if (!row) out[id] = { state: 'available', occupiedBy: null }
    else if (row.shopId === shopId) out[id] = { state: 'connected-here', occupiedBy: null }
    else out[id] = { state: 'other-shop', occupiedBy: row.shop?.shopName ?? null }
  }
  return out
}

export async function connectPages(
  shopId: string,
  userId: string,
  pages: PageInfo[],
  // forceIds: ย้ายเพจข้ามร้าน "รายเพจ" — user ติ๊กยืนยันทีละเพจในหน้าเลือกเพจ (ไม่ใช่ทั้งชุด)
  // เดิมมีแต่ force แบบทั้งชุดซึ่งอันตราย: กดยืนยันเพจเดียวแต่เพจอื่นของ user ที่ติดร้านอื่นอยู่
  // โดนถอนตามไปด้วยทั้งหมด (opts.force ยังคงไว้ให้ caller เดิม/เทสต์ที่ตั้งใจย้ายทั้งชุดจริง ๆ)
  opts: { force?: boolean; forceIds?: string[] } = {},
): Promise<{
  connected: number
  // skipped: เพจที่ถูกร้านอื่นเชื่อม active อยู่ — พก shopName ของร้านนั้นมาด้วยให้ UI บอก user ได้
  skipped: { pageName: string; occupiedBy: string | null }[]
  subscribeFailed: string[]
}> {
  let connected = 0
  const skipped: { pageName: string; occupiedBy: string | null }[] = []
  const subscribeFailed: string[] = []

  for (const page of pages) {
    // force รายเพจ — เพจที่ user ไม่ได้ยืนยันย้าย จะยัง skipped ตามเดิมแม้เพจอื่นในชุดเดียวกันจะยืนยันแล้ว
    const forced = opts.force === true || (opts.forceIds?.includes(page.id) ?? false)
    const messengerResult = await upsertChannel({
      shopId,
      userId,
      provider: 'MESSENGER',
      externalId: page.id,
      name: page.name,
      accessToken: page.accessToken,
      force: forced,
    })

    if (messengerResult.kind === 'other-shop') {
      // เพจนี้ถูกร้านอื่นเชื่อมไปแล้ว — ไม่ใช่ error ของระบบ ข้ามไปเลย ห้ามแตะ subscribe/IG
      // เพราะแถว MESSENGER ที่มีอยู่จริงเป็นของร้านอื่น ไม่ใช่ของเรา
      skipped.push({ pageName: page.name, occupiedBy: messengerResult.shopName })
      continue
    }
    connected++

    // IG ที่ผูกกับเพจนี้ใช้ page token เดียวกัน — แยกเป็นคนละแถวเพราะ externalId คนละ ID space
    // และ inbox ต้อง filter แยกช่องทางได้ IG ล้มเหลว (เช่นถูกร้านอื่นยึดไปแล้ว) ต้องไม่ทำให้ Messenger
    // ที่สร้างสำเร็จไปแล้วพลอย throw ออกจาก loop ก่อนถึง subscribePageToApp ด้านล่าง (I-4)
    if (page.instagramBusinessAccountId) {
      await upsertChannel({
        shopId,
        userId,
        provider: 'INSTAGRAM',
        externalId: page.instagramBusinessAccountId,
        name: page.name,
        accessToken: page.accessToken,
        force: forced, // IG ต้องใช้การยืนยันเดียวกับ Page แม่ ไม่งั้นย้าย Page ได้แต่ IG ค้างร้านเดิม
      })
    }

    // ต้องเรียก subscribe "ทุกครั้ง" ไม่ว่าแถว MESSENGER จะเพิ่งสร้างใหม่หรือมีอยู่แล้ว
    // (existing-same-shop) — ฝั่ง Meta idempotent ยิงซ้ำได้ไม่มีผลข้างเคียง แยก try ของตัวเองจากการ
    // เขียน DB ด้านบน: ถ้า subscribe ล้มเหลว (Graph 5xx) ต้องไม่ throw ออกจาก loop เพราะแถว DB ของ
    // เพจนี้ (และเพจถัดไป) จะค้างอยู่แบบไม่มีทาง subscribe ซ้ำได้เลย (P2002 จะกันการ retry ทุกครั้ง
    // ถ้าไม่แยก idempotent-check ไว้ข้างบน)
    try {
      await subscribePageToApp(page.id, page.accessToken)
    } catch (e) {
      console.error('[shop-channel] subscribePageToApp ล้มเหลว', page.id, e instanceof Error ? e.message : e)
      subscribeFailed.push(page.name)
    }
  }

  return { connected, skipped, subscribeFailed }
}

// disconnectChannel — ปลดช่องทางออกจากร้าน (soft: ตั้ง status='DISCONNECTED' ไม่ลบแถวจริง
// เพื่อรักษาประวัติ Conversation/Message ที่ผูกอยู่ + กันเชื่อมใหม่ชน unique constraint โดยไม่ได้ตั้งใจ)
// ใช้ updateMany({where:{id, shopId}}) เป็น atomic ownership guard ตัวเดียว — ป้องกันร้านหนึ่งปลด
// channel ของอีกร้าน (IDOR) แม้จะรู้ channelId ตรง ๆ ก็ตาม โดยไม่ต้อง findUnique แยกก่อน (กัน TOCTOU)
export async function disconnectChannel(channelId: string, shopId: string): Promise<void> {
  const result = await prisma.shopChannel.updateMany({
    where: { id: channelId, shopId },
    data: { status: 'DISCONNECTED' },
  })
  if (result.count === 0) {
    throw new Error('CHANNEL_NOT_FOUND_OR_FORBIDDEN')
  }

  // อ่านแถว **หลัง** guard ผ่านแล้วเท่านั้น — ถึงบรรทัดนี้แปลว่าแถวนี้เป็นของ shopId จริง
  // (อ่านก่อน updateMany = แตะแถวที่ยังไม่ผ่านการตรวจสิทธิ์ ต่อให้ไม่ได้คืนออกไปก็ไม่ควรทำ)
  const row = await prisma.shopChannel.findUnique({
    where: { id: channelId },
    select: { provider: true, externalId: true, accessTokenEnc: true },
  })
  if (row) await stopPageWebhookIfUnused(row)
}

/**
 * ถอน subscription ของเพจออกจากแอปเรา ถ้าไม่มีช่องทางไหนต้องใช้มันแล้ว
 *
 * เงื่อนไข "ถ้าไม่มีใครใช้แล้ว" สำคัญมาก: Meta ไม่มี subscribed_apps แยกของ Instagram —
 * event ของ IG วิ่งผ่าน subscription ของ **Page ที่ผูก IG account นั้น** (เหตุผลเดียวกับที่
 * resubscribeShopChannels วนเฉพาะแถว MESSENGER) ดังนั้นถ้าร้านถอดแค่ช่องทาง Messenger แล้วเรา
 * unsubscribe ทันทีทั้งที่ IG ยังเชื่อมอยู่ → ข้อความ IG จะหยุดเข้าเงียบ ๆ ไม่มี error ให้เห็น
 * และร้านจะไม่มีทางรู้จนกว่าลูกค้าจะบ่นว่าทักไปแล้วไม่ตอบ
 *
 * ล้มเหลวแล้วต้องไม่ throw: ผู้ใช้สั่งถอดช่องทาง = ต้องถอดได้เสมอ ไม่ว่าฝั่ง Meta จะตอบอะไร
 * เคสที่พบบ่อยที่สุดคือ token หมดอายุ/ถูกเพิกถอนไปก่อนแล้ว (status TOKEN_INVALID) ซึ่งกรณีนั้น
 * Meta ตัด subscription ให้อยู่แล้ว
 */
async function stopPageWebhookIfUnused(row: {
  provider: string
  externalId: string
  accessTokenEnc: string
}): Promise<void> {
  try {
    const pageToken = decryptToken(row.accessTokenEnc)
    const pageId =
      row.provider === 'MESSENGER' ? row.externalId : await getPageIdFromToken(pageToken)
    if (!pageId) return

    if (await isPageWebhookStillNeeded(pageId, pageToken)) return

    await unsubscribePageFromApp(pageId, pageToken)
  } catch (e) {
    console.error(
      '[shop-channel] ถอน subscription ของเพจล้มเหลว',
      row.externalId,
      e instanceof Error ? e.message : e,
    )
  }
}

// เช็คข้ามทุกร้าน ไม่ใช่เฉพาะร้านที่กดถอด — ถ้าเพจนี้ยัง active อยู่กับร้านอื่น (เช่นแถว IG ของ
// ร้านอื่นที่ผูกเพจเดียวกัน) การถอน subscription จะไปตัดของร้านนั้นทิ้งด้วย
async function isPageWebhookStillNeeded(pageId: string, pageToken: string): Promise<boolean> {
  const messenger = await prisma.shopChannel.findFirst({
    where: { provider: 'MESSENGER', externalId: pageId, status: { not: 'DISCONNECTED' } },
    select: { id: true },
  })
  if (messenger) return true

  const igAccountId = await getInstagramAccountIdForPage(pageId, pageToken)
  if (!igAccountId) return false

  const instagram = await prisma.shopChannel.findFirst({
    where: { provider: 'INSTAGRAM', externalId: igAccountId, status: { not: 'DISCONNECTED' } },
    select: { id: true },
  })
  return instagram !== null
}

export async function listChannels(shopId: string): Promise<ChannelView[]> {
  return prisma.shopChannel.findMany({
    where: { shopId, status: { not: 'DISCONNECTED' } },
    // allow-list ชัด ๆ — กัน accessTokenEnc หลุดออกไปโดยไม่ตั้งใจเมื่อมีคนเพิ่มฟิลด์ใหม่
    select: { id: true, provider: true, externalId: true, name: true, avatarUrl: true, status: true },
    orderBy: { createdAt: 'asc' },
  })
}

// server-only — คืน token ที่ถอดรหัสแล้ว ห้ามเรียกจาก client component
//
// webhook เรียกทางนี้เพื่อหา channel จาก pageId ที่ Meta ส่งมา — ต้องได้เฉพาะแถว "ยัง active อยู่"
// (ไม่ใช่ DISCONNECTED) เดิมใช้ findUnique ด้วย provider_externalId ได้เพราะมี @@unique เต็มตาราง
// ตอนนี้ partial unique index กันซ้ำแค่แถวที่ status <> 'DISCONNECTED' เท่านั้น จึงมีได้หลายแถวต่อ
// (provider, externalId) ถ้านับรวม DISCONNECTED เก่าด้วย → ต้อง findFirst + กรอง status ชัดเจน
// (ไม่ใช่กรองทีหลังด้วย if เหมือนเดิม เพราะถ้ามีแถว DISCONNECTED เก่าปนอยู่ query อาจสุ่มได้แถวนั้น
// มาก่อนแถว active จริง)
export async function getChannelByExternalId(
  provider: string,
  externalId: string,
): Promise<{ id: string; shopId: string; provider: string; accessToken: string } | null> {
  const row = await prisma.shopChannel.findFirst({
    where: { provider, externalId, status: { not: 'DISCONNECTED' } },
  })
  if (!row) return null
  return {
    id: row.id,
    shopId: row.shopId,
    provider: row.provider,
    accessToken: decryptToken(row.accessTokenEnc),
  }
}

/**
 * resubscribeChannel — สั่ง Meta subscribe webhook ของเพจนี้ใหม่ด้วย field ชุดล่าสุด
 *
 * ทำไมต้องมี: `subscribed_fields` ถูกล็อกไว้ตั้งแต่ตอนกดเชื่อมเพจครั้งแรก — เพจที่เชื่อมก่อนเรา
 * เพิ่ม field ใหม่ (เช่น `message_reads` ของ read receipt) จะ **ไม่ได้รับ event นั้นเลยตลอดไป**
 * ทั้งที่โค้ดฝั่งเรารองรับแล้ว (user report 2026-07-23: "อ่านแล้วแต่ไม่ขึ้นว่าอ่านแล้ว")
 * เดิมทางเดียวที่แก้ได้คือถอดเพจแล้วเชื่อมใหม่ผ่าน OAuth ทั้งชุด — หนักเกินความจำเป็น
 *
 * ฝั่ง Meta เป็น idempotent (เรียกซ้ำได้) — ownership อยู่ใน WHERE {id, shopId} ตามแบบเดียวกับ
 * disconnectChannel; token ถอดรหัสแล้วอยู่ในฟังก์ชันนี้เท่านั้น ไม่คืนออกไป
 */
export async function resubscribeShopChannels(shopId: string): Promise<{ ok: number; failed: number }> {
  // subscribe ที่ระดับ **Page** เท่านั้น — event ของ Instagram ก็วิ่งผ่าน subscription ของ Page
  // ที่ผูก IG account นั้น (Meta ไม่มี subscribed_apps แยกของ IG) จึงไม่ต้องวนแถว INSTAGRAM
  const pages = await prisma.shopChannel.findMany({
    where: { shopId, provider: 'MESSENGER', status: { not: 'DISCONNECTED' } },
  })
  let ok = 0
  let failed = 0
  for (const row of pages) {
    try {
      await subscribePageToApp(row.externalId, decryptToken(row.accessTokenEnc))
      ok++
    } catch (e) {
      failed++
      console.error('[shop-channel] resubscribe ล้มเหลว', row.externalId, e instanceof Error ? e.message : e)
    }
  }
  return { ok, failed }
}

export async function markChannelTokenInvalid(channelId: string): Promise<void> {
  await prisma.shopChannel.update({ where: { id: channelId }, data: { status: 'TOKEN_INVALID' } })
}
