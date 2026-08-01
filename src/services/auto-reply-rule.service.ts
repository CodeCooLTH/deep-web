import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { normalizeMessage } from '@/lib/auto-reply-normalize'
import { computeSpecificity, type MatchType } from '@/lib/auto-reply-constants'
import { invalidateShop } from '@/lib/auto-reply-cache'

/**
 * auto-reply-rule.service — CRUD `AutoReplyKeyword` / `AutoReplyPhrase` / `AutoReplyRule`
 * ของฟีเจอร์ 00023 (SRS TFR-002/003/004/006)
 *
 * ownership: shopId มาจาก resolveActiveShopContext ที่ชั้น route เท่านั้น (TFR-005) — ไฟล์นี้
 * ห้ามแตะ session/role ทุก query มี shopId ใน WHERE เสมอ (ห้าม post-filter ใน JS)
 *
 * [ข้อบังคับ] invalidateShop(shopId) ต้องถูกเรียกทุกครั้งที่เขียนแถวของ 3 ตารางนี้สำเร็จ — S-04
 * matcher อ่านชุดกฎจาก cache (TTL 60 วิ) ถ้าลืมเรียก ร้านแก้กฎแล้วลูกค้าจะยังได้คำตอบเก่าอีกสูงสุด 60 วิ
 *
 * [ข้อบังคับ] `AutoReplyRule.specificity` คำนวณด้วย computeSpecificity() (S-02) ทุกครั้งที่เขียน
 * เท่านั้น — ห้ามรับค่านี้จากภายนอกไม่ว่ากรณีใด (TFR-004)
 *
 * [ข้อบังคับ] normalizedPhrase ของ AutoReplyPhrase ต้องมาจาก normalizeMessage() (S-02) ตัวเดียวกับ
 * ที่ matcher ใช้เทียบข้อความลูกค้าเท่านั้น (TFR-003/TFR-007) — ห้ามมี normalize เวอร์ชันที่สอง
 */

// ---------------------------------------------------------------------------
// Keyword
// ---------------------------------------------------------------------------

const KEYWORD_NAME_MAX_LEN = 60 // TFR-027 (validation เต็มอยู่ที่ Valibot ชั้น route — นี่คือ guard ขั้นต่ำ)
const DUPLICATE_NAME_MAX_ATTEMPTS = 20 // TFR-006 edge: ชื่อชนเกินนี้ให้ผู้ใช้ตั้งชื่อเอง กัน loop ไม่จบ

export type AutoReplyKeywordListItem = {
  id: string
  name: string
  matchType: string
  priority: number
  /** 'OFFLINE' ไม่ตอบใครเลย | 'TEST' ตอบเฉพาะเธรดที่ระบุของกลุ่มนี้ | 'LIVE' ตอบทุกเธรด */
  status: string
  phraseCount: number
  /** คำตรวจจับจริง (สูงสุด 10 คำแรก) — หน้ารายการต้องเห็นคำ ไม่ใช่เห็นแค่จำนวน
   *  (user 2026-07-30: "อยากให้แสดงข้อความที่ตรวจจับเลย ... user จะได้เห็นชัดเจน") */
  phrases: string[]
  /** จำนวนเธรดทดสอบที่ผูกกับกลุ่มนี้ — status='TEST' ที่ยังเป็น 0 = ไม่ตอบใครเลยจริง ๆ */
  testThreadCount: number
  ruleCount: number
  createdAt: Date
  updatedAt: Date
}

const KEYWORD_LIST_SELECT = {
  id: true,
  name: true,
  matchType: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  // take 10: หน้ารายการโชว์ได้ไม่กี่คำอยู่แล้ว ที่เหลือสรุปเป็น "+n" — ไม่ดึงมาทั้งหมดให้เปลือง
  phrases: { select: { phrase: true }, take: 10, orderBy: { createdAt: 'asc' } },
  _count: { select: { phrases: true, rules: true, testThreads: true } },
} satisfies Prisma.AutoReplyKeywordSelect

type KeywordListRow = {
  id: string
  name: string
  matchType: string
  priority: number
  status: string
  createdAt: Date
  updatedAt: Date
  phrases: { phrase: string }[]
  _count: { phrases: number; rules: number; testThreads: number }
}

function toKeywordListItem(row: KeywordListRow): AutoReplyKeywordListItem {
  return {
    id: row.id,
    name: row.name,
    matchType: row.matchType,
    priority: row.priority,
    status: row.status,
    phraseCount: row._count.phrases,
    phrases: row.phrases.map((p) => p.phrase),
    testThreadCount: row._count.testThreads,
    ruleCount: row._count.rules,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export type AutoReplyPhraseView = { id: string; phrase: string; normalizedPhrase: string }

/** หน้าแก้ไขต้องการ phrase แบบเต็ม (มี id ไว้ลบรายคำ) จึงทับ `phrases: string[]` ของ list item */
export type AutoReplyKeywordDetail = Omit<AutoReplyKeywordListItem, 'phrases'> & {
  phrases: AutoReplyPhraseView[]
  rules: AutoReplyRuleView[]
}

/** listKeywords — หน้ารายการกลุ่มคำของร้าน หนึ่งคิวรี (นับ phrase/rule ด้วย _count ไม่ N+1) */
export async function listKeywords(shopId: string): Promise<AutoReplyKeywordListItem[]> {
  const rows = await prisma.autoReplyKeyword.findMany({
    where: { shopId },
    select: KEYWORD_LIST_SELECT,
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map(toKeywordListItem)
}

/** getKeywordDetail — ownership scope ด้วย {id, shopId} เสมอ (TFR-002 AC-001-05, NFR-Sec-01) */
export async function getKeywordDetail(id: string, shopId: string): Promise<AutoReplyKeywordDetail | null> {
  const row = await prisma.autoReplyKeyword.findFirst({
    where: { id, shopId },
    select: {
      ...KEYWORD_LIST_SELECT,
      phrases: {
        select: { id: true, phrase: true, normalizedPhrase: true },
        orderBy: { createdAt: 'asc' },
      },
      rules: { select: RULE_SELECT, orderBy: [{ specificity: 'desc' }, { id: 'asc' }] },
    },
  })
  if (!row) return null
  return {
    ...toKeywordListItem(row),
    phrases: row.phrases,
    rules: row.rules.map(toRuleView),
  }
}

export type CreateKeywordInput = { name: string; matchType?: MatchType; priority?: number }

/**
 * createKeyword — สร้างกลุ่มใหม่เสมอในสถานะ OFFLINE โดยตั้งใจ: กลุ่มที่เพิ่งสร้างยังไม่มี
 * phrase/rule จะไม่มีทางผ่านเงื่อนไข TFR-006 อยู่แล้ว — เปลี่ยนสถานะทำผ่าน updateKeyword หลังเติมข้อมูลครบ
 */
export async function createKeyword(
  shopId: string,
  userId: string,
  input: CreateKeywordInput,
): Promise<AutoReplyKeywordListItem> {
  const name = input.name.trim()
  if (!name) throw new Error('AUTO_REPLY_KEYWORD_NAME_EMPTY')
  if (name.length > KEYWORD_NAME_MAX_LEN) throw new Error('AUTO_REPLY_KEYWORD_NAME_TOO_LONG')

  try {
    const row = await prisma.autoReplyKeyword.create({
      data: {
        shopId,
        name,
        matchType: input.matchType ?? 'CONTAINS',
        priority: input.priority ?? 100,
        status: 'OFFLINE',
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      select: KEYWORD_LIST_SELECT,
    })
    return toKeywordListItem(row)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new Error('AUTO_REPLY_KEYWORD_NAME_DUPLICATE') // @@unique([shopId, name]) — AC-001-04
    }
    throw e
  }
}

export type UpdateKeywordInput = {
  name?: string
  matchType?: MatchType
  priority?: number
  status?: string
  /** AI Enhance รายกลุ่มคำ (phase `00023-ai-enhance`, BR-AR-31) */
  aiEnhanceEnabled?: boolean
  aiTone?: string | null
}

/**
 * updateKeyword — กำลังจะออกจาก OFFLINE (ไป TEST หรือ LIVE) ต้องผ่าน TFR-006 ก่อน
 * (มี phrase >=1 และมีคำตอบที่เปิดใช้งาน >=1 ระดับ) เช็คในทรานแซกชันเดียวกับการเขียน
 *
 * ไป TEST เพิ่มอีกด่าน: ต้องมีเธรดทดสอบอย่างน้อย 1 เธรด ไม่งั้น TEST จะเท่ากับ OFFLINE
 * แบบเงียบ ๆ แล้วร้านจะงงว่าตั้งเป็นทดสอบแล้วทำไมไม่มีอะไรเกิดขึ้น
 */
export async function updateKeyword(
  id: string,
  shopId: string,
  userId: string,
  input: UpdateKeywordInput,
): Promise<AutoReplyKeywordListItem> {
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.autoReplyKeyword.findFirst({ where: { id, shopId } })
    if (!existing) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')

    const data: Prisma.AutoReplyKeywordUpdateInput = { updatedByUserId: userId }

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new Error('AUTO_REPLY_KEYWORD_NAME_EMPTY')
      if (name.length > KEYWORD_NAME_MAX_LEN) throw new Error('AUTO_REPLY_KEYWORD_NAME_TOO_LONG')
      data.name = name
    }
    if (input.matchType !== undefined) data.matchType = input.matchType
    if (input.priority !== undefined) data.priority = input.priority
    // AI Enhance — สวิตช์ล้วน ไม่มีเงื่อนไขความพร้อมแบบ status เพราะเปิดแล้วอย่างแย่ที่สุด
    // ลูกค้าก็ได้คำตอบดิบเดิม (BR-AR-31) ต่างจาก status ที่เปิดผิดแล้วบอทเงียบ/ตอบผิดคน
    if (input.aiEnhanceEnabled !== undefined) data.aiEnhanceEnabled = input.aiEnhanceEnabled
    // ว่าง = กลับไปใช้ค่ากลาง (เก็บเป็น null ไม่ใช่สตริงว่าง เพื่อให้ "ไม่ได้ตั้ง" กับ
    // "ตั้งเป็นค่าว่าง" เป็นสิ่งเดียวกัน ไม่ต้องมีสองเคสให้พลาด)
    if (input.aiTone !== undefined) data.aiTone = input.aiTone?.trim() || null
    if (input.status !== undefined && input.status !== existing.status) {
      if (input.status !== 'OFFLINE') {
        await assertKeywordCompletion(tx, id, shopId)
      }
      if (input.status === 'TEST') {
        const threads = await tx.autoReplyKeywordTestThread.count({ where: { keywordId: id } })
        if (threads === 0) throw new Error('AUTO_REPLY_KEYWORD_NO_TEST_THREAD')
      }
      data.status = input.status

    }

    try {
      return await tx.autoReplyKeyword.update({ where: { id }, data, select: KEYWORD_LIST_SELECT })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new Error('AUTO_REPLY_KEYWORD_NAME_DUPLICATE')
      }
      throw e
    }
  })
  invalidateShop(shopId)
  return toKeywordListItem(row)
}

/** deleteKeyword — Cascade ลบ phrase/rule ของกลุ่มไปด้วย (schema onDelete: Cascade); log SetNull ไม่หาย */
export async function deleteKeyword(id: string, shopId: string): Promise<void> {
  const result = await prisma.autoReplyKeyword.deleteMany({ where: { id, shopId } })
  if (result.count === 0) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')
  invalidateShop(shopId)
}

/**
 * duplicateKeyword — ทำสำเนากลุ่ม + phrase + rule ทั้งหมดในทรานแซกชันเดียว (AC-001-08)
 * สำเนาบังคับ status=OFFLINE เสมอไม่ว่าต้นฉบับจะอยู่สถานะไหน — ชื่อ "{name} (สำเนา)" เพิ่ม suffix
 * ตัวเลขจนไม่ซ้ำ (สูงสุด 20 ครั้ง กัน loop ไม่จบ)
 */
export async function duplicateKeyword(
  id: string,
  shopId: string,
  userId: string,
): Promise<AutoReplyKeywordListItem> {
  const row = await prisma.$transaction(async (tx) => {
    const source = await tx.autoReplyKeyword.findFirst({
      where: { id, shopId },
      include: { phrases: true, rules: true },
    })
    if (!source) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')

    const name = await findAvailableDuplicateName(tx, shopId, source.name)

    const clone = await tx.autoReplyKeyword.create({
      data: {
        shopId,
        name,
        matchType: source.matchType,
        priority: source.priority,
        // สำเนาเริ่มที่ TEST เสมอ ไม่สืบทอด LIVE จากต้นฉบับ — กันเผลอทำสำเนาแล้วยิงลูกค้าจริงทันที
        status: 'OFFLINE', // AC-001-08 — สำเนาต้องไม่ตอบใครก่อนเสมอ
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    })

    if (source.phrases.length > 0) {
      await tx.autoReplyPhrase.createMany({
        data: source.phrases.map((p) => ({
          keywordId: clone.id,
          phrase: p.phrase,
          normalizedPhrase: p.normalizedPhrase,
        })),
      })
    }

    if (source.rules.length > 0) {
      await tx.autoReplyRule.createMany({
        data: source.rules.map((r) => ({
          shopId,
          keywordId: clone.id,
          shopChannelId: r.shopChannelId,
          adId: r.adId,
          adLabel: r.adLabel,
          productId: r.productId,
          replyText: r.replyText,
          // recompute เสมอ (ไม่ copy r.specificity ตรง ๆ) — self-heal เผื่อแถวต้นทางเป็น TFR-004
          // edge case ที่ specificity ค้างจาก SetNull (เพจ/สินค้าเดิมถูกถอด/ลบไปแล้ว)
          specificity: computeSpecificity({
            shopChannelId: r.shopChannelId,
            adId: r.adId,
            productId: r.productId,
          }),
          isActive: r.isActive,
          activeFrom: r.activeFrom,
          activeUntil: r.activeUntil,
          createdByUserId: userId,
          updatedByUserId: userId,
        })),
      })
    }

    return tx.autoReplyKeyword.findUniqueOrThrow({ where: { id: clone.id }, select: KEYWORD_LIST_SELECT })
  })
  invalidateShop(shopId)
  return toKeywordListItem(row)
}

async function findAvailableDuplicateName(
  tx: Prisma.TransactionClient,
  shopId: string,
  baseName: string,
): Promise<string> {
  const first = `${baseName} (สำเนา)`
  if (!(await tx.autoReplyKeyword.findFirst({ where: { shopId, name: first }, select: { id: true } }))) {
    return first
  }
  for (let n = 2; n <= DUPLICATE_NAME_MAX_ATTEMPTS; n++) {
    const candidate = `${baseName} (สำเนา ${n})`
    if (!(await tx.autoReplyKeyword.findFirst({ where: { shopId, name: candidate }, select: { id: true } }))) {
      return candidate
    }
  }
  throw new Error('AUTO_REPLY_KEYWORD_DUPLICATE_NAME_EXHAUSTED')
}

/** ผ่านเมื่อ: มี phrase >=1 และมี rule (isActive=true) >=1 ของกลุ่มนี้ (TFR-006) */
async function assertKeywordCompletion(
  tx: Prisma.TransactionClient,
  keywordId: string,
  shopId: string,
): Promise<void> {
  const phraseCount = await tx.autoReplyPhrase.count({ where: { keywordId } })
  if (phraseCount === 0) throw new Error('AUTO_REPLY_KEYWORD_NO_PHRASE')

  const ruleCount = await tx.autoReplyRule.count({ where: { shopId, keywordId, isActive: true } })
  if (ruleCount === 0) throw new Error('AUTO_REPLY_KEYWORD_NO_ANSWER')
}

// ---------------------------------------------------------------------------
// Phrase
// ---------------------------------------------------------------------------

export type AddPhrasesResult = {
  created: AutoReplyPhraseView[]
  /** phrase ต้นฉบับที่ถูกข้าม เพราะซ้ำ (หลัง normalize) กับคำที่มีอยู่แล้วในกลุ่มเดียวกัน (AC-002-03) */
  duplicateInGroup: string[]
  /** phrase ที่ normalize แล้วว่าง (เช่นมีแต่วรรคตอน) — ถูกข้ามเสมอ ห้ามบันทึก (TFR-003) */
  emptyAfterNormalize: string[]
  /** คำเตือนไม่บล็อก — ซ้ำกับกลุ่มอื่นที่เปิดใช้งานอยู่ (AC-002-04) */
  warnings: { phrase: string; conflictKeywordId: string; conflictKeywordName: string }[]
}

/**
 * addPhrases — เพิ่มได้หลายคำในคำขอเดียว: dedupe ตาม normalizedPhrase ในหน่วยความจำก่อน
 * (เก็บ phrase ต้นฉบับตัวแรกที่เจอ) แล้ว createMany({ skipDuplicates: true }) กัน race รอบสุดท้าย
 * ที่ @@unique([keywordId, normalizedPhrase]) รับหน้าที่บังคับจริงที่ DB
 */
export async function addPhrases(
  keywordId: string,
  shopId: string,
  rawPhrases: string[],
): Promise<AddPhrasesResult> {
  const keyword = await prisma.autoReplyKeyword.findFirst({
    where: { id: keywordId, shopId },
    select: { id: true },
  })
  if (!keyword) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')

  const emptyAfterNormalize: string[] = []
  const byNormalized = new Map<string, string>() // normalizedPhrase -> phrase ต้นฉบับตัวแรกที่เจอ
  for (const raw of rawPhrases) {
    const phrase = raw.trim()
    if (!phrase) continue
    const normalizedPhrase = normalizeMessage(phrase)
    if (!normalizedPhrase) {
      emptyAfterNormalize.push(phrase)
      continue
    }
    if (!byNormalized.has(normalizedPhrase)) byNormalized.set(normalizedPhrase, phrase)
  }

  if (byNormalized.size === 0) {
    return { created: [], duplicateInGroup: [], emptyAfterNormalize, warnings: [] }
  }

  const normalizedList = [...byNormalized.keys()]
  const existing = await prisma.autoReplyPhrase.findMany({
    where: { keywordId, normalizedPhrase: { in: normalizedList } },
    select: { normalizedPhrase: true },
  })
  const existingSet = new Set(existing.map((e) => e.normalizedPhrase))

  const duplicateInGroup: string[] = []
  const toCreate: { normalizedPhrase: string; phrase: string }[] = []
  for (const [normalizedPhrase, phrase] of byNormalized) {
    if (existingSet.has(normalizedPhrase)) duplicateInGroup.push(phrase)
    else toCreate.push({ normalizedPhrase, phrase })
  }

  let created: AutoReplyPhraseView[] = []
  if (toCreate.length > 0) {
    await prisma.autoReplyPhrase.createMany({
      data: toCreate.map((p) => ({ keywordId, phrase: p.phrase, normalizedPhrase: p.normalizedPhrase })),
      skipDuplicates: true,
    })
    created = await prisma.autoReplyPhrase.findMany({
      where: { keywordId, normalizedPhrase: { in: toCreate.map((p) => p.normalizedPhrase) } },
      select: { id: true, phrase: true, normalizedPhrase: true },
    })
    invalidateShop(shopId)
  }

  // คำเตือนข้ามกลุ่ม (AC-002-04) — เฉพาะกลุ่มอื่นที่เปิดใช้งานอยู่ ไม่บล็อกการบันทึก
  const crossGroup = await prisma.autoReplyPhrase.findMany({
    where: {
      normalizedPhrase: { in: normalizedList },
      keywordId: { not: keywordId },
      keyword: { shopId, status: { not: 'OFFLINE' } },
    },
    select: { normalizedPhrase: true, keyword: { select: { id: true, name: true } } },
  })
  const warnings = crossGroup.map((c) => ({
    phrase: byNormalized.get(c.normalizedPhrase) ?? c.normalizedPhrase,
    conflictKeywordId: c.keyword.id,
    conflictKeywordName: c.keyword.name,
  }))

  return { created, duplicateInGroup, emptyAfterNormalize, warnings }
}

export type PhraseOverlap = {
  id: string
  name: string
  priority: number
  status: string
  /** คำต้นฉบับ (phrase) ที่ซ้ำกัน — ไม่ใช่ normalizedPhrase เพราะ UI เอาไปแสดงเป็นคำที่ร้านพิมพ์เอง */
  sharedPhrases: string[]
}

/**
 * getPhraseOverlaps — "กลุ่มอื่นในร้านนี้ที่ใช้คำตรวจจับซ้ำกับกลุ่มนี้"
 *
 * ตรรกะ where ชุดเดียวกับคำเตือนข้ามกลุ่มใน addPhrases (AC-002-04) แต่มองจากมุมกลุ่มที่กำลังเปิดดู
 * เพื่อให้หน้าแก้ไขอธิบายเป็นประโยคได้ว่าคำไหนไปซ้ำกับกลุ่มไหน แทนที่จะให้ร้านเดาจากเลขลำดับความสำคัญดิบ
 * (จงใจไม่ refactor addPhrases ให้มาเรียกตัวนี้ — shape ของ warnings มีเทสเดิมคุมอยู่ ไม่ต้องเสี่ยง)
 *
 * ทำไมตัด status='OFFLINE' ออก: กลุ่มที่ปิดอยู่ไม่ตอบใครเลย จึงไม่ได้แข่งชิงข้อความกับกลุ่มนี้
 * เตือนไปก็เป็นสัญญาณหลอกให้ร้านไปแก้คำที่ไม่มีปัญหาอะไร
 *
 * shopId อยู่ใน where ของทั้งสองคิวรี (ownership TFR-005) ← ห้ามย้ายออกจากตรงนี้ไปกรองใน JS
 */
export async function getPhraseOverlaps(shopId: string, keywordId: string): Promise<PhraseOverlap[]> {
  const own = await prisma.autoReplyPhrase.findMany({
    where: { keywordId, keyword: { shopId } },
    select: { phrase: true, normalizedPhrase: true },
  })
  // ไม่มีคำในกลุ่มนี้ = ไม่มีอะไรไปซ้ำกับใครได้ ตัดจบก่อนยิงคิวรีที่สองให้เปล่าประโยชน์
  if (own.length === 0) return []

  // normalizedPhrase -> phrase ต้นฉบับของกลุ่มนี้ (แสดงคำที่ร้านพิมพ์ ไม่ใช่รูปหลัง normalize)
  const ownPhraseByNormalized = new Map(own.map((p) => [p.normalizedPhrase, p.phrase]))

  const rows = await prisma.autoReplyPhrase.findMany({
    where: {
      normalizedPhrase: { in: [...ownPhraseByNormalized.keys()] },
      keywordId: { not: keywordId },
      keyword: { shopId, status: { not: 'OFFLINE' } },
    },
    select: {
      phrase: true,
      normalizedPhrase: true,
      keyword: { select: { id: true, name: true, priority: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // ยุบหลายคำที่ซ้ำกับกลุ่มเดียวกันให้เหลือรายการเดียว (UI แสดงเป็น 1 บรรทัดต่อ 1 กลุ่ม)
  const byKeyword = new Map<string, PhraseOverlap>()
  for (const row of rows) {
    let entry = byKeyword.get(row.keyword.id)
    if (!entry) {
      entry = {
        id: row.keyword.id,
        name: row.keyword.name,
        priority: row.keyword.priority,
        status: row.keyword.status,
        sharedPhrases: [],
      }
      byKeyword.set(row.keyword.id, entry)
    }
    const shared = ownPhraseByNormalized.get(row.normalizedPhrase) ?? row.phrase
    if (!entry.sharedPhrases.includes(shared)) entry.sharedPhrases.push(shared)
  }

  // priority มาก->น้อย แล้ว tie-break ด้วยชื่อ เพื่อให้ลำดับที่ UI เห็น (และเทส) นิ่งเสมอ
  return [...byKeyword.values()].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'th'),
  )
}

/** deletePhrase — บล็อกถ้าเป็น phrase สุดท้ายของกลุ่มที่ยังเปิดใช้งานอยู่ (TFR-006) */
export async function deletePhrase(phraseId: string, keywordId: string, shopId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const phrase = await tx.autoReplyPhrase.findFirst({
      where: { id: phraseId, keywordId, keyword: { shopId } },
      select: { id: true },
    })
    if (!phrase) throw new Error('AUTO_REPLY_PHRASE_NOT_FOUND')

    const keyword = await tx.autoReplyKeyword.findFirst({
      where: { id: keywordId, shopId },
      select: { status: true },
    })
    if (!keyword) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')

    if (keyword.status !== 'OFFLINE') {
      const remaining = await tx.autoReplyPhrase.count({ where: { keywordId, id: { not: phraseId } } })
      if (remaining === 0) throw new Error('AUTO_REPLY_KEYWORD_LAST_PHRASE')
    }

    await tx.autoReplyPhrase.delete({ where: { id: phraseId } })
  })
  invalidateShop(shopId)
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export type AutoReplyRuleView = {
  id: string
  keywordId: string | null
  shopChannelId: string | null
  adId: string | null
  adLabel: string | null
  productId: string | null
  replyText: string
  specificity: number
  isActive: boolean
  activeFrom: Date | null
  activeUntil: Date | null
  createdAt: Date
  updatedAt: Date
}

const RULE_SELECT = {
  id: true,
  keywordId: true,
  shopChannelId: true,
  adId: true,
  adLabel: true,
  productId: true,
  replyText: true,
  specificity: true,
  isActive: true,
  activeFrom: true,
  activeUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AutoReplyRuleSelect

function toRuleView(row: AutoReplyRuleView): AutoReplyRuleView {
  return row
}

export type AutoReplyRuleInput = {
  keywordId: string | null
  shopChannelId: string | null
  adId: string | null
  adLabel: string | null
  productId: string | null
  replyText: string
  isActive: boolean
  activeFrom: Date | null
  activeUntil: Date | null
}

function normalizeRuleConditions<T extends AutoReplyRuleInput>(input: T): T {
  return {
    ...input,
    shopChannelId: input.shopChannelId || null,
    adId: input.adId?.trim() || null,
    adLabel: input.adLabel?.trim() || null,
    productId: input.productId || null,
  }
}

/**
 * assertRuleConditionsValid — invariant ของ TFR-004 ที่ทำให้ resolutionLevel ครอบคลุมครบ
 * (ดู DATABASE §3.4 / SRS §10 ประเด็นที่ 1) + ownership scope ของทุกมิติ (server ต้องตรวจก่อนเขียนเสมอ)
 */
async function assertRuleConditionsValid(
  tx: Prisma.TransactionClient,
  shopId: string,
  input: Pick<AutoReplyRuleInput, 'keywordId' | 'shopChannelId' | 'adId' | 'productId'>,
): Promise<void> {
  if (input.adId != null && input.shopChannelId == null) {
    throw new Error('AUTO_REPLY_RULE_AD_REQUIRES_CHANNEL')
  }
  if (input.keywordId == null && (input.adId != null || input.productId != null)) {
    throw new Error('AUTO_REPLY_RULE_CENTRAL_CANNOT_HAVE_AD_OR_PRODUCT')
  }
  if (input.keywordId != null) {
    const keyword = await tx.autoReplyKeyword.findFirst({
      where: { id: input.keywordId, shopId },
      select: { id: true },
    })
    if (!keyword) throw new Error('AUTO_REPLY_KEYWORD_NOT_FOUND')
  }
  if (input.shopChannelId != null) {
    const channel = await tx.shopChannel.findFirst({
      where: { id: input.shopChannelId, shopId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!channel) throw new Error('AUTO_REPLY_RULE_CHANNEL_NOT_FOUND')
  }
  if (input.productId != null) {
    const product = await tx.product.findFirst({ where: { id: input.productId, shopId }, select: { id: true } })
    if (!product) throw new Error('AUTO_REPLY_RULE_PRODUCT_NOT_FOUND')
  }
}

/** ผ่านเมื่อกลุ่มปิดอยู่ (ไม่บังคับ) หรือยังมี rule ที่เปิดใช้งานเหลืออีกอย่างน้อย 1 (ไม่นับ excludeRuleId) */
async function assertKeywordStillHasAnswerAfterRuleChange(
  tx: Prisma.TransactionClient,
  keywordId: string,
  shopId: string,
  excludeRuleId: string,
): Promise<void> {
  const keyword = await tx.autoReplyKeyword.findFirst({ where: { id: keywordId, shopId }, select: { status: true } })
  if (!keyword || keyword.status === 'OFFLINE') return
  const remaining = await tx.autoReplyRule.count({
    where: { shopId, keywordId, isActive: true, id: { not: excludeRuleId } },
  })
  if (remaining === 0) throw new Error('AUTO_REPLY_KEYWORD_LAST_ANSWER')
}

/** createRule — specificity คำนวณเสมอที่นี่ ไม่รับจาก input เด็ดขาด (TFR-004) */
export async function createRule(
  shopId: string,
  userId: string,
  rawInput: AutoReplyRuleInput,
): Promise<AutoReplyRuleView> {
  const replyText = rawInput.replyText.trim()
  if (!replyText) throw new Error('AUTO_REPLY_RULE_EMPTY_REPLY') // AC-005-03

  const input = normalizeRuleConditions(rawInput)

  const row = await prisma.$transaction(async (tx) => {
    await assertRuleConditionsValid(tx, shopId, input)
    const specificity = computeSpecificity(input)
    try {
      return await tx.autoReplyRule.create({
        data: {
          shopId,
          keywordId: input.keywordId,
          shopChannelId: input.shopChannelId,
          adId: input.adId,
          adLabel: input.adLabel,
          productId: input.productId,
          replyText,
          specificity,
          isActive: input.isActive,
          activeFrom: input.activeFrom,
          activeUntil: input.activeUntil,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
        select: RULE_SELECT,
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // UNIQUE NULLS NOT DISTINCT (shopId, keywordId, shopChannelId, adId, productId) — AC-006-02
        throw new Error('AUTO_REPLY_RULE_CONDITION_DUPLICATE')
      }
      throw e
    }
  })
  invalidateShop(shopId)
  return toRuleView(row)
}

export type AutoReplyRuleUpdateInput = Omit<AutoReplyRuleInput, 'keywordId'>

/**
 * updateRule — keywordId ตรึงไว้ตั้งแต่สร้าง (ไม่รับการย้ายกลุ่ม) เงื่อนไข/คำตอบ/ตารางเวลาแก้ได้
 * specificity คำนวณใหม่ทุกครั้ง (TFR-004 "การ update ที่ล้าง productId แล้วไม่คำนวณใหม่ = กฎถูก
 * จัดอันดับผิดตลอดไปโดยไม่มี error ให้เห็น")
 */
export async function updateRule(
  id: string,
  shopId: string,
  userId: string,
  rawInput: AutoReplyRuleUpdateInput,
): Promise<AutoReplyRuleView> {
  const replyText = rawInput.replyText.trim()
  if (!replyText) throw new Error('AUTO_REPLY_RULE_EMPTY_REPLY')

  const input = normalizeRuleConditions({ ...rawInput, keywordId: null }) // keywordId เติมจาก existing ด้านล่าง

  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.autoReplyRule.findFirst({ where: { id, shopId } })
    if (!existing) throw new Error('AUTO_REPLY_RULE_NOT_FOUND')

    const conditions = { ...input, keywordId: existing.keywordId }
    await assertRuleConditionsValid(tx, shopId, conditions)
    const specificity = computeSpecificity(conditions)

    if (existing.keywordId && existing.isActive && !input.isActive) {
      await assertKeywordStillHasAnswerAfterRuleChange(tx, existing.keywordId, shopId, id)
    }

    try {
      return await tx.autoReplyRule.update({
        where: { id },
        data: {
          shopChannelId: conditions.shopChannelId,
          adId: conditions.adId,
          adLabel: conditions.adLabel,
          productId: conditions.productId,
          replyText,
          specificity,
          isActive: input.isActive,
          activeFrom: input.activeFrom,
          activeUntil: input.activeUntil,
          updatedByUserId: userId,
        },
        select: RULE_SELECT,
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new Error('AUTO_REPLY_RULE_CONDITION_DUPLICATE')
      }
      throw e
    }
  })
  invalidateShop(shopId)
  return toRuleView(row)
}

/** deleteRule — บล็อกถ้าเป็นกฎสุดท้ายที่เปิดใช้งานของกลุ่มที่ยังเปิดอยู่ (TFR-006) */
export async function deleteRule(id: string, shopId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.autoReplyRule.findFirst({ where: { id, shopId } })
    if (!existing) throw new Error('AUTO_REPLY_RULE_NOT_FOUND')
    if (existing.keywordId && existing.isActive) {
      await assertKeywordStillHasAnswerAfterRuleChange(tx, existing.keywordId, shopId, id)
    }
    await tx.autoReplyRule.delete({ where: { id } })
  })
  invalidateShop(shopId)
}

/** listRules — อ่านกฎของร้าน กรองได้ตาม keyword/เพจ/สินค้า (ใช้โดยหน้าตั้งค่า, ไม่ใช่ resolver) */
export async function listRules(
  shopId: string,
  filter: { keywordId?: string | null; shopChannelId?: string; productId?: string } = {},
): Promise<AutoReplyRuleView[]> {
  const rows = await prisma.autoReplyRule.findMany({
    where: {
      shopId,
      ...(filter.keywordId !== undefined ? { keywordId: filter.keywordId } : {}),
      ...(filter.shopChannelId !== undefined ? { shopChannelId: filter.shopChannelId } : {}),
      ...(filter.productId !== undefined ? { productId: filter.productId } : {}),
    },
    select: RULE_SELECT,
    orderBy: [{ specificity: 'desc' }, { id: 'asc' }],
  })
  return rows.map(toRuleView)
}
