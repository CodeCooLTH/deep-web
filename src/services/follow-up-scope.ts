// 00066 — ขอบเขต "ลูกค้าเดียวกัน" (BR-ACT-10) · SQL ที่รู้จักความสัมพันธ์นี้อยู่ไฟล์นี้ไฟล์เดียว
// 🛑 ห้ามเขียน join/เงื่อนไข cluster ที่อื่น — ใช้ clusterKeySql() ทุกครั้ง (SRS TFR-004: equivalence relation
//    ต้องมาจาก fragment เดียว ไม่งั้นป้ายแถว/แผงห้อง/ตัวกรองนับ "ลูกค้าคนเดียวกัน" คนละแบบ)
// คีย์ = shopId:customerId ของ ExternalContact · ห้องที่ไม่มี contact/ไม่มี customer (รวมห้อง DEEP — มติ S-2)
// = คีย์ของตัวเอง `v:<conversationId>` จึงไม่รวมกับใคร
// ไม่มีคำตัดสิน overdue ที่นี่ — คืนแถวแคบให้ TS (follow-up-rules) ตัดสิน (มติ S-3)
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** fragment คีย์ cluster ของห้อง c (มี contact e ที่ LEFT JOIN แล้ว) — alias เป็นค่าคงที่ในโค้ดเท่านั้น */
export function clusterKeySql(c: string, e: string): Prisma.Sql {
  const cc = Prisma.raw(`${c}."shopId"`)
  const cid = Prisma.raw(`${c}."id"`)
  const ecust = Prisma.raw(`${e}."customerId"`)
  return Prisma.sql`COALESCE(${cc} || ':' || ${ecust}, 'v:' || ${cid})`
}

/** ห้องทั้งหมดใน cluster ของแต่ละ anchor (รวมตัว anchor เอง) · anchor ที่ไม่ใช่ของร้านนี้ = ไม่มี key ในผลลัพธ์ */
export async function expandClusters(
  anchorIds: string[],
  shopId: string,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (anchorIds.length === 0) return out
  const rows = await prisma.$queryRaw<{ anchor: string; id: string }[]>`
    SELECT a."id" AS anchor, b."id" AS id
    FROM "Conversation" a
    LEFT JOIN "ExternalContact" ea ON ea."id" = a."externalContactId"
    JOIN "Conversation" b ON b."shopId" = a."shopId"
    LEFT JOIN "ExternalContact" eb ON eb."id" = b."externalContactId"
    WHERE a."id" = ANY(${anchorIds}::text[]) AND a."shopId" = ${shopId}
      AND ${clusterKeySql('a', 'ea')} = ${clusterKeySql('b', 'eb')}`
  for (const r of rows) {
    const list = out.get(r.anchor) ?? []
    list.push(r.id)
    out.set(r.anchor, list)
  }
  return out
}

/** คีย์ cluster ของแต่ละห้อง (เฉพาะห้องในร้านที่มีสิทธิ์) */
export async function clusterKeysOf(
  conversationIds: string[],
  shopIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (conversationIds.length === 0 || shopIds.length === 0) return out
  const rows = await prisma.$queryRaw<{ id: string; k: string }[]>`
    SELECT c."id" AS id, ${clusterKeySql('c', 'e')} AS k
    FROM "Conversation" c
    LEFT JOIN "ExternalContact" e ON e."id" = c."externalContactId"
    WHERE c."id" = ANY(${conversationIds}::text[]) AND c."shopId" = ANY(${shopIds}::text[])`
  for (const r of rows) out.set(r.id, r.k)
  return out
}

/** ห้อง (id + คีย์) ทั้งหมดที่คีย์อยู่ในชุดที่ให้ */
export async function conversationsByClusterKeys(
  keys: string[],
  shopIds: string[],
): Promise<{ id: string; k: string }[]> {
  if (keys.length === 0 || shopIds.length === 0) return []
  return prisma.$queryRaw<{ id: string; k: string }[]>`
    SELECT c."id" AS id, ${clusterKeySql('c', 'e')} AS k
    FROM "Conversation" c
    LEFT JOIN "ExternalContact" e ON e."id" = c."externalContactId"
    WHERE c."shopId" = ANY(${shopIds}::text[])
      AND ${clusterKeySql('c', 'e')} = ANY(${keys}::text[])`
}

/** ห้องทั้งหมดที่ cluster ของมันมีห้องใดห้องหนึ่งติดแท็กใดแท็กหนึ่ง (OR) — ตัวกรองแท็กของกระดาน */
export async function conversationIdsByClusterTags(
  tags: string[],
  shopIds: string[],
): Promise<Set<string>> {
  if (tags.length === 0 || shopIds.length === 0) return new Set()
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c."id" AS id
    FROM "Conversation" c
    LEFT JOIN "ExternalContact" e ON e."id" = c."externalContactId"
    WHERE c."shopId" = ANY(${shopIds}::text[])
      AND ${clusterKeySql('c', 'e')} IN (
        SELECT ${clusterKeySql('h', 'he')}
        FROM "Conversation" h
        JOIN "ExternalContact" he ON he."id" = h."externalContactId"
        WHERE h."shopId" = ANY(${shopIds}::text[]) AND he."tags" && ${tags}::text[])`
  return new Set(rows.map((r) => r.id))
}

/**
 * แถว OPEN ของ cluster ของแต่ละ anchor ในก้อนเดียว (ป้ายแถวรายการแชท — ไม่ N+1)
 * คืนเฉพาะคอลัมน์ที่ TS ต้องใช้ตัดสิน overdue
 */
export async function openRowsByAnchor(
  anchorIds: string[],
  shopIds: string[],
): Promise<{ anchor: string; status: string; dueAt: Date; allDay: boolean }[]> {
  if (anchorIds.length === 0 || shopIds.length === 0) return []
  return prisma.$queryRaw`
    SELECT a."id" AS anchor, f."status" AS status, f."dueAt" AS "dueAt", f."allDay" AS "allDay"
    FROM "Conversation" a
    LEFT JOIN "ExternalContact" ea ON ea."id" = a."externalContactId"
    JOIN "Conversation" b ON b."shopId" = a."shopId"
    LEFT JOIN "ExternalContact" eb ON eb."id" = b."externalContactId"
    JOIN "CustomerFollowUp" f ON f."conversationId" = b."id" AND f."shopId" = a."shopId" AND f."status" = 'OPEN'
    WHERE a."id" = ANY(${anchorIds}::text[]) AND a."shopId" = ANY(${shopIds}::text[])
      AND ${clusterKeySql('a', 'ea')} = ${clusterKeySql('b', 'eb')}`
}
