import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/token-crypto'
import { subscribePageToApp, type PageInfo } from '@/lib/facebook/graph'

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

  try {
    await prisma.shopChannel.create({
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
    return { kind: 'created' }
  } catch (e) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
    // findUnique ด้วย provider_externalId ใช้ไม่ได้แล้ว — ไม่มี @@unique เต็มตารางให้ประกอบเป็น
    // compound key ต้องใช้ findFirst + กรอง status ให้ตรงกับขอบเขตของ partial unique index จริง
    // (ถ้าไม่กรอง อาจไปเจอแถว DISCONNECTED เก่าซึ่งไม่ใช่ตัวที่ชน constraint แล้วรายงาน shopId ผิด)
    const existing = await prisma.shopChannel.findFirst({
      where: { provider: params.provider, externalId: params.externalId, status: { not: 'DISCONNECTED' } },
      select: { shopId: true, shop: { select: { shopName: true } } },
    })
    if (existing?.shopId === params.shopId) return { kind: 'existing-same-shop' }

    if (params.force) {
      // ย้ายเพจ: ตัดแถว active ทั้งหมดของเพจนี้ (ร้านอื่น) แล้วสร้างใหม่ให้ร้านนี้ ในทรานแซกชันเดียว
      // — ตั้ง DISCONNECTED ไม่ลบแถว เพื่อรักษาประวัติ Conversation/Message ของร้านเดิมไว้
      await prisma.$transaction([
        prisma.shopChannel.updateMany({
          where: { provider: params.provider, externalId: params.externalId, status: { not: 'DISCONNECTED' } },
          data: { status: 'DISCONNECTED' },
        }),
        prisma.shopChannel.create({
          data: {
            shopId: params.shopId,
            provider: params.provider,
            externalId: params.externalId,
            name: params.name,
            avatarUrl,
            accessTokenEnc: encryptToken(params.accessToken),
            connectedByUserId: params.userId,
          },
        }),
      ])
      return { kind: 'created' }
    }

    return { kind: 'other-shop', shopName: existing?.shop?.shopName ?? null }
  }
}

export async function connectPages(
  shopId: string,
  userId: string,
  pages: PageInfo[],
  opts: { force?: boolean } = {},
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
    const messengerResult = await upsertChannel({
      shopId,
      userId,
      provider: 'MESSENGER',
      externalId: page.id,
      name: page.name,
      accessToken: page.accessToken,
      force: opts.force,
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
        force: opts.force,
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

export async function markChannelTokenInvalid(channelId: string): Promise<void> {
  await prisma.shopChannel.update({ where: { id: channelId }, data: { status: 'TOKEN_INVALID' } })
}
