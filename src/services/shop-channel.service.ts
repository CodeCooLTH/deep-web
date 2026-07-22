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

export async function connectPages(
  shopId: string,
  userId: string,
  pages: PageInfo[],
): Promise<{ connected: number; skipped: string[] }> {
  let connected = 0
  const skipped: string[] = []

  for (const page of pages) {
    try {
      await prisma.shopChannel.create({
        data: {
          shopId,
          provider: 'MESSENGER',
          externalId: page.id,
          name: page.name,
          accessTokenEnc: encryptToken(page.accessToken),
          connectedByUserId: userId,
        },
      })
      connected++

      // IG ที่ผูกกับเพจนี้ใช้ page token เดียวกัน — แยกเป็นคนละแถวเพราะ
      // externalId คนละ ID space และ inbox ต้อง filter แยกช่องทางได้
      if (page.instagramBusinessAccountId) {
        await prisma.shopChannel.create({
          data: {
            shopId,
            provider: 'INSTAGRAM',
            externalId: page.instagramBusinessAccountId,
            name: page.name,
            accessTokenEnc: encryptToken(page.accessToken),
            connectedByUserId: userId,
          },
        })
      }

      // ต้อง subscribe หลังเก็บสำเร็จ — ถ้า subscribe ก่อนแล้ว DB พัง จะมี webhook
      // ยิงเข้ามาหา channel ที่ไม่มีในระบบ
      await subscribePageToApp(page.id, page.accessToken)
    } catch (e) {
      // P2002 = Page นี้ถูกร้านอื่นเชื่อมไปแล้ว (unique [provider, externalId])
      // ไม่ใช่ error ของระบบ — รายงานกลับเป็นรายการที่ข้าม
      if ((e as { code?: string })?.code === 'P2002') {
        skipped.push(page.name)
        continue
      }
      throw e
    }
  }

  return { connected, skipped }
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
