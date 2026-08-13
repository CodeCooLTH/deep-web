/**
 * feature 00048 — คลังไฟล์ต่อลูกค้า (service layer)
 *
 * 🛑 ทุก query ในไฟล์นี้ต้องมี `shopId` ในเงื่อนไขเสมอ แม้ owner key (externalContactId/
 * conversationId) จะเจาะจงอยู่แล้ว — defense in depth ตามแบบเดียวกับ chat-crm.service
 *
 * 🛑 ห้ามเปลี่ยน saveToLibrary เป็น find-then-create เด็ดขาด: สองคนกดพร้อมกันจะลอดช่องระหว่าง
 * SELECT กับ INSERT ความถูกต้องต้องอยู่ที่ `@@unique` เสมอ (มีเทส [blocker] สแกนซอร์สกันไว้)
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isStickerRawMessage } from '@/lib/chat-sticker'
import {
  LIBRARY_NAME_MAX,
  LIBRARY_NOTE_MAX,
  isLibraryEligible,
  normalizeLibraryText,
  toLibraryKind,
  type LibraryKind,
  type LibraryOwner,
} from '@/lib/customer-file-library'

export type LibraryItem = {
  id: string
  fileId: string
  kind: LibraryKind
  fileName: string | null
  fileSize: number | null
  note: string | null
  sourceMessageId: string | null
  senderRole: string
  senderName: string | null
  sentAt: string
  savedByName: string | null
  savedAt: string
}

export type LibraryCursor = { sentAt: Date; id: string }

/** ข้อผิดพลาดที่ route ต้องแมปเป็น status ต่างกัน — ห้ามปล่อยเป็น Error เปล่าให้เดา */
export class LibraryError extends Error {
  constructor(public readonly code: 'MESSAGE_NOT_FOUND' | 'NOT_ELIGIBLE' | 'ITEM_NOT_FOUND') {
    super(code)
    this.name = 'LibraryError'
  }
}

/** เงื่อนไข where ของเจ้าของคลัง — เขียนที่เดียว ใช้ทุก query กันพลาดข้อใดข้อหนึ่ง */
function ownerWhere(shopId: string, owner: LibraryOwner) {
  return {
    shopId,
    externalContactId: owner.externalContactId ?? null,
    conversationId: owner.conversationId ?? null,
  }
}

function toItem(row: {
  id: string
  fileId: string
  kind: string
  fileName: string | null
  fileSize: number | null
  note: string | null
  sourceMessageId: string | null
  senderRole: string
  senderName: string | null
  sentAt: Date
  savedByName: string | null
  savedAt: Date
}): LibraryItem {
  return {
    id: row.id,
    fileId: row.fileId,
    // kind ถูกบังคับด้วย CHECK ที่ DB แล้ว — cast ตรงนี้จึงไม่ใช่การปิดตา
    kind: row.kind as LibraryKind,
    fileName: row.fileName,
    fileSize: row.fileSize,
    note: row.note,
    sourceMessageId: row.sourceMessageId,
    senderRole: row.senderRole,
    senderName: row.senderName,
    sentAt: row.sentAt.toISOString(),
    savedByName: row.savedByName,
    savedAt: row.savedAt.toISOString(),
  }
}

/**
 * รายการไฟล์ในคลัง — keyset pagination (ไม่ใช้ OFFSET)
 * เรียง `sentAt DESC, id DESC` = **เวลาที่ไฟล์ถูกส่งจริง** ไม่ใช่เวลาที่กดเก็บ (BR-CFL-12)
 */
export async function listLibrary(
  shopId: string,
  owner: LibraryOwner,
  opts: { take: number; cursor?: LibraryCursor | null },
): Promise<{ items: LibraryItem[]; total: number; nextCursor: LibraryCursor | null }> {
  const base = ownerWhere(shopId, owner)
  const where: Prisma.CustomerFileWhereInput = opts.cursor
    ? {
        ...base,
        OR: [
          { sentAt: { lt: opts.cursor.sentAt } },
          { sentAt: opts.cursor.sentAt, id: { lt: opts.cursor.id } },
        ],
      }
    : base

  const [rows, total] = await Promise.all([
    prisma.customerFile.findMany({
      where,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: opts.take + 1, // +1 เพื่อรู้ว่ายังมีหน้าถัดไปไหม โดยไม่ต้อง count ซ้ำ
    }),
    // total = count จริงเสมอ ไม่ใช่ items.length — ไม่งั้น "ดูไฟล์ทั้งหมด (9)" จะโกหกทุกครั้งที่เกิน 9
    prisma.customerFile.count({ where: base }),
  ])

  const hasMore = rows.length > opts.take
  const page = hasMore ? rows.slice(0, opts.take) : rows
  const last = page[page.length - 1]
  return {
    items: page.map(toItem),
    total,
    nextCursor: hasMore && last ? { sentAt: last.sentAt, id: last.id } : null,
  }
}

/** set ของ fileId ที่อยู่ในคลัง — ใช้เติมสถานะ "เก็บแล้ว" ให้ทุกข้อความในเธรดด้วย query เดียว */
export async function listSavedFileIds(shopId: string, owner: LibraryOwner): Promise<string[]> {
  const rows = await prisma.customerFile.findMany({
    where: ownerWhere(shopId, owner),
    select: { fileId: true },
  })
  return rows.map((r) => r.fileId)
}

/**
 * เก็บไฟล์เข้าคลัง — **idempotent**
 *
 * 🛑 snapshot ทุกค่าอ่านจากฐานฝั่ง server ห้ามรับจาก client: ถ้ารับ fileId/sentAt มาจากหน้าจอ
 * จะเปิดช่องให้ยัดไฟล์ของร้านอื่นเข้าคลังตัวเอง และทำให้ลำดับในคลังเป็นค่าที่ client แต่งได้
 *
 * 🛑 หา message ด้วย `{ id, conversationId }` **พร้อมกัน** — scope ในเงื่อนไข ไม่ใช่ดึงมาเทียบทีหลัง
 */
export async function saveToLibrary(args: {
  shopId: string
  owner: LibraryOwner
  conversationId: string
  messageId: string
  savedByUserId: string
  savedByName: string | null
}): Promise<{ item: LibraryItem; created: boolean }> {
  const msg = await prisma.chatMessage.findFirst({
    where: { id: args.messageId, conversationId: args.conversationId },
    select: {
      id: true,
      type: true,
      imageUrl: true,
      attachmentName: true,
      attachmentSize: true,
      senderRole: true,
      createdAt: true,
      // 🛑 **ไม่มีคอลัมน์ `isSticker`** — สติกเกอร์ทุกช่องทางถูกเก็บเป็น type='IMAGE' เหมือนรูปทุก
      // ประการ ร่องรอยอยู่ใน rawMessage.payload.kind เท่านั้น (src/lib/chat-sticker.ts) และ
      // rawMessage ถูก omit เป็นค่าตั้งต้นของ client → ต้องขอตรง ๆ ใน select ไม่งั้นได้ undefined
      // แล้ว isStickerRawMessage คืน false ทุกใบ = สติกเกอร์หลุดเข้าคลังได้เงียบ ๆ
      rawMessage: true,
      conversation: { select: { externalContact: { select: { name: true } }, shop: { select: { shopName: true } } } },
    },
  })
  if (!msg) throw new LibraryError('MESSAGE_NOT_FOUND')

  const eligible = isLibraryEligible({
    type: msg.type,
    isSticker: isStickerRawMessage(msg.rawMessage),
    // รูปในการ์ด carousel ไม่ได้อยู่ที่ imageUrl จึงมาไม่ถึงเส้นทางนี้อยู่แล้ว
    // (ผู้เรียกฝั่ง client กันไว้อีกชั้นด้วย libraryEligible ต่อสไลด์)
    fromCard: false,
    hasFile: Boolean(msg.imageUrl),
  })
  const kind = toLibraryKind(msg.type)
  if (!eligible || !kind || !msg.imageUrl) throw new LibraryError('NOT_ELIGIBLE')

  const senderName =
    msg.senderRole === 'SHOP'
      ? msg.conversation?.shop?.shopName ?? null
      : msg.conversation?.externalContact?.name ?? null

  const data = {
    shopId: args.shopId,
    externalContactId: args.owner.externalContactId ?? null,
    conversationId: args.owner.conversationId ?? null,
    fileId: msg.imageUrl,
    kind,
    fileName: msg.attachmentName,
    fileSize: msg.attachmentSize,
    sourceMessageId: msg.id,
    senderRole: msg.senderRole,
    senderName,
    // 🛑 เวลาที่ "ส่งจริง" ไม่ใช่ now() — นี่คือคีย์เรียงลำดับของคลัง เขียนผิดแล้วไม่มีอะไรฟ้อง
    sentAt: msg.createdAt,
    savedByUserId: args.savedByUserId,
    savedByName: args.savedByName,
  }

  try {
    const row = await prisma.customerFile.create({ data })
    return { item: toItem(row), created: true }
  } catch (e) {
    // ชน @@unique = มีคนเก็บไฟล์นี้ไปแล้ว (อาจเป็นเราเองที่กดรัว หรือเพื่อนร่วมทีมที่กดพร้อมกัน)
    // ถือว่าสำเร็จ ไม่ใช่ error — ผลลัพธ์ที่ผู้ใช้ต้องการคือ "ไฟล์นี้อยู่ในคลัง" ซึ่งจริงแล้ว
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.customerFile.findFirst({
        where: { ...ownerWhere(args.shopId, args.owner), fileId: msg.imageUrl },
      })
      if (existing) return { item: toItem(existing), created: false }
    }
    throw e
  }
}

/** เอาออกจากคลัง — hard delete (แถวคลังเป็นดัชนีอ้างอิง ไม่ใช่ต้นฉบับข้อมูล) · idempotent */
export async function removeFromLibrary(
  shopId: string,
  owner: LibraryOwner,
  fileId: string,
): Promise<{ removed: boolean }> {
  const res = await prisma.customerFile.deleteMany({
    where: { ...ownerWhere(shopId, owner), fileId },
  })
  return { removed: res.count > 0 }
}

/** แก้ชื่อไฟล์/โน้ต — ค่าที่เหลือแต่ช่องว่างถือว่าไม่มีค่า (null) ไม่ใช่สตริงว่าง */
export async function patchLibraryItem(
  shopId: string,
  owner: LibraryOwner,
  fileId: string,
  patch: { fileName?: string | null; note?: string | null },
): Promise<LibraryItem> {
  const where = { ...ownerWhere(shopId, owner), fileId }
  const data: Prisma.CustomerFileUpdateManyMutationInput = {}
  if ('fileName' in patch) data.fileName = normalizeLibraryText(patch.fileName, LIBRARY_NAME_MAX)
  if ('note' in patch) data.note = normalizeLibraryText(patch.note, LIBRARY_NOTE_MAX)

  const res = await prisma.customerFile.updateMany({ where, data })
  if (res.count === 0) throw new LibraryError('ITEM_NOT_FOUND')

  const row = await prisma.customerFile.findFirst({ where })
  if (!row) throw new LibraryError('ITEM_NOT_FOUND')
  return toItem(row)
}
