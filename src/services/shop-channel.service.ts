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

type ChannelUpsertResult = 'created' | 'existing-same-shop' | 'other-shop'

// สร้างแถว ShopChannel — แยก P2002 ออกเป็น 2 ความหมาย เพราะ unique constraint คือ [provider, externalId]
// เดี่ยว ๆ ไม่บอกว่า "ใครชน": ร้านเดียวกันเชื่อมซ้ำ (เช่น retry หลัง subscribe ล้มเหลวรอบก่อน) ต้องไม่ถือเป็น
// error — ปล่อยให้ subscribePageToApp ยิงซ้ำได้ (ฝั่ง Meta idempotent) ส่วนร้านอื่นยึด externalId นี้ไปแล้ว
// ต้องรายงาน skipped และห้ามแตะ subscribe/แถวเดิมของร้านนั้นเด็ดขาด
async function upsertChannel(params: {
  shopId: string
  userId: string
  provider: 'MESSENGER' | 'INSTAGRAM'
  externalId: string
  name: string
  accessToken: string
}): Promise<ChannelUpsertResult> {
  try {
    await prisma.shopChannel.create({
      data: {
        shopId: params.shopId,
        provider: params.provider,
        externalId: params.externalId,
        name: params.name,
        accessTokenEnc: encryptToken(params.accessToken),
        connectedByUserId: params.userId,
      },
    })
    return 'created'
  } catch (e) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
    const existing = await prisma.shopChannel.findUnique({
      where: { provider_externalId: { provider: params.provider, externalId: params.externalId } },
      select: { shopId: true },
    })
    return existing?.shopId === params.shopId ? 'existing-same-shop' : 'other-shop'
  }
}

export async function connectPages(
  shopId: string,
  userId: string,
  pages: PageInfo[],
): Promise<{ connected: number; skipped: string[]; subscribeFailed: string[] }> {
  let connected = 0
  const skipped: string[] = []
  const subscribeFailed: string[] = []

  for (const page of pages) {
    const messengerResult = await upsertChannel({
      shopId,
      userId,
      provider: 'MESSENGER',
      externalId: page.id,
      name: page.name,
      accessToken: page.accessToken,
    })

    if (messengerResult === 'other-shop') {
      // เพจนี้ถูกร้านอื่นเชื่อมไปแล้ว — ไม่ใช่ error ของระบบ ข้ามไปเลย ห้ามแตะ subscribe/IG
      // เพราะแถว MESSENGER ที่มีอยู่จริงเป็นของร้านอื่น ไม่ใช่ของเรา
      skipped.push(page.name)
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
export async function getChannelByExternalId(
  provider: string,
  externalId: string,
): Promise<{ id: string; shopId: string; provider: string; accessToken: string } | null> {
  const row = await prisma.shopChannel.findUnique({
    where: { provider_externalId: { provider, externalId } },
  })
  if (!row || row.status === 'DISCONNECTED') return null
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
