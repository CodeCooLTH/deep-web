/**
 * 00083 — จัดการแท็กของร้าน (ทะเบียน ShopTag) — SRS TFR-001..005
 * ห้องยังเก็บแท็กเป็นสตริงใน ExternalContact.tags; "แท็กเดียวกัน" ตัดสินด้วย tagNameKey (TD-001)
 * ทุก query ผูก shopId (contact เข้าถึงผ่าน ShopChannel.shopId) · service ไม่ตัดสินบทบาท (ตัดที่ route)
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SHOP_TAG_LIMITS as L, tagNameKey, variantsIn } from '@/lib/shop-tag-match'

export type ShopTagErrorCode =
  | 'VALIDATION_ERROR'
  | 'TAG_NAME_TAKEN'
  | 'TAG_LIMIT_REACHED'
  | 'KEYWORD_TAG_LIMIT_REACHED'
  | 'TAG_NOT_FOUND'
  | 'SHOP_LOCKED'

export class ShopTagError extends Error {
  constructor(public readonly code: ShopTagErrorCode) {
    super(code)
    this.name = 'ShopTagError'
  }
}

export type ShopTagInput = { name: string; keywords?: string[]; removeOnOrderCreate?: boolean }
export type ShopTagPatch = Partial<ShopTagInput>

export type ShopTagRow = {
  id: string | null
  name: string
  registered: boolean
  rooms: number
  keywords: string[]
  removeOnOrderCreate: boolean
}

type Tx = Prisma.TransactionClient

const TX_OPTS = { timeout: 30_000 }
const thai = (a: string, b: string) => a.localeCompare(b, 'th')

// เพดาน 50/20 นับข้ามแถว DB บังคับไม่ได้ → lock แถว Shop ให้คำขอของร้านเดียวกันเรียงคิว (TD-008)
// NO KEY UPDATE ไม่ใช่ UPDATE: FOR UPDATE ชนกับ FOR KEY SHARE ของ FK check ทำให้สร้างออเดอร์/รับข้อความของร้านค้างรอระหว่าง rename
const lockShop = (tx: Tx, shopId: string) => tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR NO KEY UPDATE`

/** สตริงที่ห้องของร้านใช้อยู่จริง ซึ่ง tagNameKey ตรงกับ key ที่ระบุ */
async function roomVariants(tx: Tx, shopId: string, keys: string[]): Promise<string[]> {
  const rows = await tx.$queryRaw<{ name: string }[]>`
    SELECT DISTINCT t AS name
    FROM "ExternalContact" ec
    JOIN "ShopChannel" sc ON sc.id = ec."shopChannelId", unnest(ec.tags) t
    WHERE sc."shopId" = ${shopId}`
  return rows.map((r) => r.name).filter((n) => keys.includes(tagNameKey(n)))
}

export async function listShopTags(shopId: string) {
  const registered = (await prisma.shopTag.findMany({ where: { shopId } })).sort((a, b) => thai(a.name, b.name))
  const roomStrings = await prisma.$queryRaw<{ name: string; rooms: number }[]>`
    SELECT t AS name, count(DISTINCT ec.id)::int AS rooms
    FROM "ExternalContact" ec
    JOIN "ShopChannel" sc ON sc.id = ec."shopChannelId", unnest(ec.tags) t
    WHERE sc."shopId" = ${shopId} GROUP BY t`
  const strings = roomStrings.map((r) => r.name)
  const known = new Set(registered.map((t) => t.nameKey))

  const tags: ShopTagRow[] = []
  for (const t of registered) {
    const variants = variantsIn(strings, t.nameKey)
    let rooms = roomStrings.filter((r) => variants.includes(r.name)).reduce((s, r) => s + r.rooms, 0)
    if (variants.length > 1) {
      // ห้องเดียวอาจมีหลาย variant → นับ distinct ใหม่ ไม่งั้นนับซ้ำ
      const [r] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT ec.id)::int AS n
        FROM "ExternalContact" ec JOIN "ShopChannel" sc ON sc.id = ec."shopChannelId"
        WHERE sc."shopId" = ${shopId} AND ec.tags && ${variants}::text[]`
      rooms = r?.n ?? 0
    }
    tags.push({ id: t.id, name: t.name, registered: true, rooms, keywords: t.keywords, removeOnOrderCreate: t.removeOnOrderCreate })
  }
  const unregistered = roomStrings
    .filter((r) => !known.has(tagNameKey(r.name)))
    .sort((a, b) => b.rooms - a.rooms || thai(a.name, b.name))
    .map((r): ShopTagRow => ({ id: null, name: r.name, registered: false, rooms: r.rooms, keywords: [], removeOnOrderCreate: false }))

  return {
    tags: [...tags, ...unregistered],
    counts: { registered: registered.length, withKeywords: registered.filter((t) => t.keywords.length > 0).length },
    limits: L,
  }
}

export async function createShopTag(shopId: string, userId: string, input: ShopTagInput) {
  const keywords = input.keywords ?? []
  try {
    return await prisma.$transaction(async (tx) => {
      await lockShop(tx, shopId)
      const nameKey = tagNameKey(input.name)
      if (await tx.shopTag.findUnique({ where: { shopId_nameKey: { shopId, nameKey } }, select: { id: true } })) {
        throw new ShopTagError('TAG_NAME_TAKEN')
      }
      if ((await tx.shopTag.count({ where: { shopId } })) >= L.maxTags) throw new ShopTagError('TAG_LIMIT_REACHED')
      if (keywords.length > 0 && (await countWithKeywords(tx, shopId)) >= L.maxKeywordTags) {
        throw new ShopTagError('KEYWORD_TAG_LIMIT_REACHED')
      }
      return tx.shopTag.create({
        data: { shopId, name: input.name, nameKey, keywords, removeOnOrderCreate: input.removeOnOrderCreate ?? false, createdByUserId: userId },
      })
    }, TX_OPTS)
  } catch (e) {
    throw mapP2002(e)
  }
}

const countWithKeywords = (tx: Tx, shopId: string) =>
  // Prisma ไม่มี filter "array ไม่ว่าง" → นับด้วย SQL
  tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "ShopTag" WHERE "shopId" = ${shopId} AND cardinality(keywords) > 0`.then((r) => r[0]?.n ?? 0)

function mapP2002(e: unknown): unknown {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? new ShopTagError('TAG_NAME_TAKEN') : e
}

export async function updateShopTag(shopId: string, tagId: string, input: ShopTagPatch) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockShop(tx, shopId)
      const tag = await tx.shopTag.findFirst({ where: { id: tagId, shopId } })
      if (!tag) throw new ShopTagError('TAG_NOT_FOUND')

      const data: Prisma.ShopTagUpdateInput = {}
      let renamedRooms = 0

      if (input.keywords !== undefined) {
        // เพดานตรวจเฉพาะตอนเปลี่ยนจาก "ไม่มีคำ" เป็น "มีคำ"
        if (tag.keywords.length === 0 && input.keywords.length > 0 && (await countWithKeywords(tx, shopId)) >= L.maxKeywordTags) {
          throw new ShopTagError('KEYWORD_TAG_LIMIT_REACHED')
        }
        data.keywords = input.keywords
      }
      if (input.removeOnOrderCreate !== undefined) data.removeOnOrderCreate = input.removeOnOrderCreate

      if (input.name !== undefined && input.name !== tag.name) {
        const newKey = tagNameKey(input.name)
        if (newKey !== tag.nameKey) {
          const clash = await tx.shopTag.findUnique({ where: { shopId_nameKey: { shopId, nameKey: newKey } }, select: { id: true } })
          if (clash) throw new ShopTagError('TAG_NAME_TAKEN')
        }
        // รวม variant ของชื่อใหม่ด้วย → ชื่อที่มีแต่ในห้อง (Q-6) ถูกรวมเป็นสตริงเดียว
        const variants = await roomVariants(tx, shopId, [tag.nameKey, newKey])
        if (variants.length > 0) {
          renamedRooms = await tx.$executeRaw`
            UPDATE "ExternalContact" ec
            SET "tags" = ARRAY(
              SELECT t FROM (
                SELECT CASE WHEN x = ANY(${variants}::text[]) THEN ${input.name} ELSE x END AS t, ord
                FROM unnest(ec."tags") WITH ORDINALITY u(x, ord)
              ) m GROUP BY t ORDER BY min(ord))
            FROM "ShopChannel" sc
            WHERE ec."shopChannelId" = sc."id" AND sc."shopId" = ${shopId} AND ec."tags" && ${variants}::text[]`
        }
        data.name = input.name
        data.nameKey = newKey
      }

      const updated = await tx.shopTag.update({ where: { id: tag.id }, data })
      return { tag: updated, renamedRooms }
    }, TX_OPTS)
  } catch (e) {
    throw mapP2002(e)
  }
}

export async function deleteShopTag(shopId: string, tagId: string) {
  return prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId) // เรียงคิวกับ rename ของร้านเดียวกัน
    const tag = await tx.shopTag.findFirst({ where: { id: tagId, shopId } })
    if (!tag) throw new ShopTagError('TAG_NOT_FOUND')
    const variants = await roomVariants(tx, shopId, [tag.nameKey])
    let removedFromRooms = 0
    if (variants.length > 0) {
      removedFromRooms = await tx.$executeRaw`
        UPDATE "ExternalContact" ec
        SET "tags" = ARRAY(SELECT t FROM unnest(ec."tags") t WHERE t <> ALL(${variants}::text[]))
        FROM "ShopChannel" sc
        WHERE ec."shopChannelId" = sc."id" AND sc."shopId" = ${shopId} AND ec."tags" && ${variants}::text[]`
    }
    await tx.shopTag.delete({ where: { id: tag.id } })
    return { removedFromRooms }
  }, TX_OPTS)
}
