import 'server-only'

import { createHash } from 'node:crypto'

import { prisma } from '@/lib/prisma'
import { getFile, getFileMeta } from '@/lib/storage'
import type { RoomAutoCheckFacts } from '@/lib/inspection/auto-checks'
import { countCopiedImages } from '@/lib/inspection/fingerprint-match'

/**
 * room-image-fingerprint.service.ts — ลายนิ้วมือรูปประกาศที่พัก (feature 00060 · ปิด OQ-13)
 *
 * ตอบคำถามเดียว: **"รูปของห้องนี้ มีร้านอื่นประกาศไว้ก่อนเราหรือเปล่า"**
 *
 * 🛑 **ต้องแฮชของทุกร้าน ไม่ใช่เฉพาะร้านที่ซื้อแผนตรวจ** — ตัวตรวจจับนี้ทำงานด้วยการเทียบข้ามร้าน
 *    ถ้าคลังเทียบมีแต่ร้านที่จ่ายเงิน (ซึ่งเป็นกลุ่มที่สุจริตอยู่แล้วโดยนิยาม) ผลจะเป็น
 *    "ไม่พบว่าซ้ำ" ทุกครั้งตลอดกาล = ตัวตรวจที่รันทุกคืนโดยไม่มีวันเจออะไร ซึ่งแย่กว่าไม่มี
 *    เพราะมันออกคำรับรองด้วย
 *
 * 🛑 **ใครประกาศก่อนคือคนที่ผ่าน** — ถ้านับ "มีร้านอื่นถือรูปเดียวกัน" เฉย ๆ เหยื่อที่ถูก
 *    มิจฉาชีพก็อปรูปไปจะได้ผล "ไม่ผ่าน" พร้อมกับคนก็อป ทั้งที่เป็นฝ่ายถูกกระทำ
 *    เกณฑ์ "ก่อน" ใช้ `Room.createdAt` ของห้องที่ถือรูปนั้น (เวลาที่ประกาศขึ้นระบบจริง)
 *    ไม่ใช่เวลาที่เราแฮช ซึ่งขึ้นกับลำดับการทำงานของ cron ล้วน ๆ
 */

/** ไฟล์ใหญ่กว่านี้ข้าม — รูปประกาศจริงไม่เคยถึง และ cron มีเพดาน 60 วินาที */
export const FINGERPRINT_MAX_BYTES = 12 * 1024 * 1024
/** ลองแล้วล้มเกินจำนวนนี้ = เลิกลอง (ไฟล์หาย/พัง) ไม่ใช่วนดึงทุกคืนตลอดไป */
export const FINGERPRINT_MAX_ATTEMPTS = 3

export type FingerprintRunSummary = {
  /** แฮชสำเร็จรอบนี้ */
  hashed: number
  /** ลองแล้วไม่สำเร็จรอบนี้ (ไฟล์หาย/ใหญ่เกิน/อ่านไม่ได้) */
  failed: number
  /** ยังเหลือค้างอยู่หลังหมดโควตารอบนี้ — 🛑 ค่าที่ค้างสูงตลอดแปลว่าเพดานต่อรอบต่ำเกินจริง */
  remaining: number
}

function parseImages(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * แฮชรูปที่ยังไม่มีลายนิ้วมือ — bounded ทั้งจำนวนไฟล์และจำนวนไบต์
 *
 * idempotent: ไฟล์ที่มีแถวแล้วและแฮชสำเร็จ จะไม่ถูกอ่านซ้ำอีกเลยตลอดอายุไฟล์
 */
export async function hashPendingRoomImages(input: {
  now: Date
  maxFiles?: number
  maxBytes?: number
}): Promise<FingerprintRunSummary> {
  const { now } = input
  const maxFiles = input.maxFiles ?? 60
  const maxBytes = input.maxBytes ?? 120 * 1024 * 1024

  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    select: { id: true, shopId: true, createdAt: true, images: true },
    orderBy: { createdAt: 'asc' },
  })

  const wanted = rooms.flatMap((room) =>
    parseImages(room.images).map((fileId) => ({
      fileId,
      roomId: room.id,
      shopId: room.shopId,
      firstListedAt: room.createdAt,
    })),
  )
  if (wanted.length === 0) return { hashed: 0, failed: 0, remaining: 0 }

  const existing = await prisma.roomImageFingerprint.findMany({
    where: { fileId: { in: wanted.map((w) => w.fileId) } },
    select: { fileId: true, sha256: true, attempts: true },
  })
  const seen = new Map(existing.map((e) => [e.fileId, e]))

  // 🛑 แถวที่ `sha256 = null` ยังต้องกลับมาลองซ้ำ (ไฟล์อาจอัปโหลดยังไม่เสร็จตอนรอบก่อน)
  //    แต่ไม่เกินเพดานครั้ง ไม่งั้นไฟล์ที่หายถาวรจะกินโควตาของทุกคืนไปตลอดกาล
  const pending = wanted.filter((w) => {
    const row = seen.get(w.fileId)
    if (row === undefined) return true
    return row.sha256 === null && row.attempts < FINGERPRINT_MAX_ATTEMPTS
  })

  let hashed = 0
  let failed = 0
  let spentBytes = 0
  let processed = 0

  for (const item of pending) {
    if (processed >= maxFiles || spentBytes >= maxBytes) break
    processed += 1

    let sha256: string | null = null
    let bytes: number | null = null
    try {
      const meta = await getFileMeta(item.fileId)
      if (meta !== null && meta.size <= FINGERPRINT_MAX_BYTES) {
        const file = await getFile(item.fileId)
        if (file !== null) {
          sha256 = createHash('sha256').update(file.buffer).digest('hex')
          bytes = file.buffer.byteLength
          spentBytes += bytes
        }
      }
    } catch (err) {
      console.error('[inspection/fingerprint] อ่านไฟล์ไม่สำเร็จ fileId=%s', item.fileId, err)
    }

    if (sha256 === null) failed += 1
    else hashed += 1

    await prisma.roomImageFingerprint.upsert({
      where: { fileId: item.fileId },
      create: {
        fileId: item.fileId,
        roomId: item.roomId,
        shopId: item.shopId,
        sha256,
        bytes,
        firstListedAt: item.firstListedAt,
        attempts: 1,
        lastAttemptAt: now,
        computedAt: sha256 === null ? null : now,
      },
      update: {
        sha256,
        bytes,
        attempts: { increment: 1 },
        lastAttemptAt: now,
        computedAt: sha256 === null ? null : now,
      },
    })
  }

  return { hashed, failed, remaining: Math.max(0, pending.length - processed) }
}

/**
 * ประกอบข้อเท็จจริงของ `duplicate_listing` ให้ห้องของร้านหนึ่งร้าน
 *
 * คืน `lookupFailed: true` เมื่อคิวรีล้ม — ปลายทางจะแปลเป็น "ยังไม่มีข้อมูล" ไม่ใช่ "ไม่พบว่าซ้ำ"
 */
export async function collectRoomDuplicateFacts(input: {
  shopId: string
  rooms: { id: string; images: unknown }[]
}): Promise<Map<string, RoomAutoCheckFacts>> {
  const { shopId, rooms } = input
  const out = new Map<string, RoomAutoCheckFacts>()
  const fileIds = rooms.flatMap((r) => parseImages(r.images))

  if (fileIds.length === 0) {
    for (const room of rooms) {
      out.set(room.id, {
        totalImageCount: parseImages(room.images).length,
        hashedImageCount: 0,
        copiedFromOtherShopCount: 0,
        lookupFailed: false,
      })
    }
    return out
  }

  try {
    const mine = await prisma.roomImageFingerprint.findMany({
      where: { fileId: { in: fileIds } },
      select: { fileId: true, sha256: true, firstListedAt: true },
    })
    const hashes = mine.map((m) => m.sha256).filter((h): h is string => h !== null)

    const others =
      hashes.length === 0
        ? []
        : await prisma.roomImageFingerprint.findMany({
            where: { sha256: { in: hashes }, shopId: { not: shopId } },
            select: { sha256: true, firstListedAt: true },
          })

    for (const room of rooms) {
      const images = parseImages(room.images)
      const { hashedImageCount, copiedFromOtherShopCount } = countCopiedImages({
        imageFileIds: images,
        own: mine,
        foreign: others,
      })
      out.set(room.id, {
        totalImageCount: images.length,
        hashedImageCount,
        copiedFromOtherShopCount,
        lookupFailed: false,
      })
    }
    return out
  } catch (err) {
    console.error('[inspection/fingerprint] ค้นลายนิ้วมือไม่สำเร็จ shopId=%s', shopId, err)
    for (const room of rooms) {
      out.set(room.id, {
        totalImageCount: parseImages(room.images).length,
        hashedImageCount: 0,
        copiedFromOtherShopCount: 0,
        lookupFailed: true,
      })
    }
    return out
  }
}
