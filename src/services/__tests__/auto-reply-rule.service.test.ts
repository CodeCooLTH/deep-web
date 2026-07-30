/**
 * auto-reply-rule.service.test.ts — unit tests (feature 00023, S-03)
 *
 * mock prisma (test env ไม่มี DB จริง) ครอบกฎเหล็กของ S-03:
 * - TFR-004: specificity คำนวณเสมอที่ service (ห้ามรับจาก client) + invariant adId/keywordId
 * - TFR-004: ownership scope ของ shopChannelId/productId (ต้องเป็นของร้านเดียวกัน)
 * - AC-005-03: replyText ว่างหลัง trim ต้องถูกปฏิเสธ
 * - AC-002-03/04: phrase ซ้ำในกลุ่ม (block) vs ซ้ำข้ามกลุ่ม (warn ไม่บล็อก)
 * - TFR-006: กลุ่มที่ไม่ใช่ OFFLINE ต้องมี phrase>=1 และมีคำตอบ(isActive)>=1 — บังคับตอนเปลี่ยนสถานะ/ลบ phrase
 *   สุดท้าย/ลบหรือปิดกฎสุดท้าย
 * - P2002 -> error code ที่ route คาดหวัง (AUTO_REPLY_KEYWORD_NAME_DUPLICATE / AUTO_REPLY_RULE_CONDITION_DUPLICATE)
 *
 * mock $transaction: เรียก callback ทันทีด้วย txMock ที่ผูก method เดียวกับ prisma top-level
 * (พอเพียงสำหรับ unit test ระดับ logic — ไม่จำลอง rollback จริง) pattern เดียวกับ invite-link.service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const {
  keywordFindFirst,
  keywordFindMany,
  keywordCreate,
  keywordUpdate,
  keywordDeleteMany,
  phraseFindMany,
  phraseCreateMany,
  phraseCount,
  phraseDelete,
  phraseFindFirst,
  ruleFindFirst,
  ruleCreate,
  ruleUpdate,
  ruleDelete,
  ruleCount,
  testThreadCount,
  channelFindFirst,
  productFindFirst,
} = vi.hoisted(() => ({
  keywordFindFirst: vi.fn(),
  keywordFindMany: vi.fn(),
  keywordCreate: vi.fn(),
  keywordUpdate: vi.fn(),
  keywordDeleteMany: vi.fn(),
  phraseFindMany: vi.fn(),
  phraseCreateMany: vi.fn(),
  phraseCount: vi.fn(),
  phraseDelete: vi.fn(),
  phraseFindFirst: vi.fn(),
  ruleFindFirst: vi.fn(),
  ruleCreate: vi.fn(),
  ruleUpdate: vi.fn(),
  ruleDelete: vi.fn(),
  ruleCount: vi.fn(),
  testThreadCount: vi.fn(),
  channelFindFirst: vi.fn(),
  productFindFirst: vi.fn(),
}))

const txMock = {
  autoReplyKeyword: { findFirst: keywordFindFirst, findMany: keywordFindMany, update: keywordUpdate },
  autoReplyPhrase: { count: phraseCount, delete: phraseDelete, findFirst: phraseFindFirst, createMany: phraseCreateMany },
  autoReplyRule: { findFirst: ruleFindFirst, create: ruleCreate, update: ruleUpdate, delete: ruleDelete, count: ruleCount },
  autoReplyKeywordTestThread: { count: testThreadCount },
  shopChannel: { findFirst: channelFindFirst },
  product: { findFirst: productFindFirst },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    autoReplyKeyword: {
      findFirst: keywordFindFirst,
      findMany: keywordFindMany,
      create: keywordCreate,
      deleteMany: keywordDeleteMany,
    },
    autoReplyPhrase: { findMany: phraseFindMany, createMany: phraseCreateMany },
    // autoReplyRule.findMany (top-level) ใช้เฉพาะ listRules — ไม่มี test ครอบฟังก์ชันนี้ในไฟล์นี้
    // (อ่านอย่างเดียว ไม่มี invariant ต้อง cover) จึง stub เป็น vi.fn() เฉย ๆ พอ
    autoReplyRule: { findMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}))

vi.mock('@/lib/auto-reply-cache', () => ({ invalidateShop: vi.fn() }))

import { invalidateShop } from '@/lib/auto-reply-cache'
import {
  createKeyword,
  updateKeyword,
  deleteKeyword,
  addPhrases,
  deletePhrase,
  createRule,
  updateRule,
  deleteRule,
} from '@/services/auto-reply-rule.service'

const SHOP = 'shop-1'
const USER = 'user-1'
const KEYWORD = 'kw-1'

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.1',
    meta: { target },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createKeyword', () => {
  it('สร้างใหม่เสมอในสถานะ OFFLINE — ห้ามแตะลูกค้าตั้งแต่วินาทีแรก', async () => {
    keywordCreate.mockResolvedValue({
      id: 'kw-2', name: 'สนใจสินค้า', matchType: 'CONTAINS', priority: 100, status: 'OFFLINE',
      createdAt: new Date(), updatedAt: new Date(), phrases: [], _count: { phrases: 0, rules: 0, testThreads: 0 },
    } as never)
    await createKeyword(SHOP, USER, { name: 'สนใจสินค้า' })
    expect(keywordCreate.mock.calls[0][0].data.status).toBe('OFFLINE')
  })

  it('ชื่อว่างหลัง trim -> throw AUTO_REPLY_KEYWORD_NAME_EMPTY โดยไม่แตะ DB', async () => {
    await expect(createKeyword(SHOP, USER, { name: '   ' })).rejects.toThrow(
      'AUTO_REPLY_KEYWORD_NAME_EMPTY',
    )
    expect(keywordCreate).not.toHaveBeenCalled()
  })

  it('P2002 (ชื่อซ้ำในร้าน) -> แปลงเป็น AUTO_REPLY_KEYWORD_NAME_DUPLICATE (AC-001-04)', async () => {
    keywordCreate.mockRejectedValue(p2002(['shopId', 'name']) as never)
    await expect(createKeyword(SHOP, USER, { name: 'สนใจสินค้า' })).rejects.toThrow(
      'AUTO_REPLY_KEYWORD_NAME_DUPLICATE',
    )
  })
})

describe('updateKeyword — TFR-006 ออกจาก OFFLINE ต้องผ่านเงื่อนไขครบ', () => {
  it('ไป LIVE ทั้งที่ไม่มี phrase -> throw AUTO_REPLY_KEYWORD_NO_PHRASE', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD, shopId: SHOP, status: 'OFFLINE' } as never)
    phraseCount.mockResolvedValue(0 as never)
    await expect(updateKeyword(KEYWORD, SHOP, USER, { status: 'LIVE' })).rejects.toThrow(
      'AUTO_REPLY_KEYWORD_NO_PHRASE',
    )
    expect(keywordUpdate).not.toHaveBeenCalled()
  })

  it('มี phrase แต่ไม่มีกฎที่เปิดใช้งาน -> throw AUTO_REPLY_KEYWORD_NO_ANSWER', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD, shopId: SHOP, status: 'OFFLINE' } as never)
    phraseCount.mockResolvedValue(2 as never)
    ruleCount.mockResolvedValue(0 as never)
    await expect(updateKeyword(KEYWORD, SHOP, USER, { status: 'LIVE' })).rejects.toThrow(
      'AUTO_REPLY_KEYWORD_NO_ANSWER',
    )
  })

  it('ครบทั้งสองเงื่อนไข -> ไป LIVE ได้ + invalidateShop', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD, shopId: SHOP, status: 'OFFLINE' } as never)
    phraseCount.mockResolvedValue(2 as never)
    ruleCount.mockResolvedValue(1 as never)
    keywordUpdate.mockResolvedValue({
      id: KEYWORD, name: 'x', matchType: 'CONTAINS', priority: 100, status: 'LIVE',
      createdAt: new Date(), updatedAt: new Date(), phrases: [], _count: { phrases: 2, rules: 1, testThreads: 0 },
    } as never)
    const result = await updateKeyword(KEYWORD, SHOP, USER, { status: 'LIVE' })
    expect(result.status).toBe('LIVE')
    expect(invalidateShop).toHaveBeenCalledWith(SHOP)
  })


  it('ไป TEST ทั้งที่ยังไม่มีแชททดสอบ -> throw AUTO_REPLY_KEYWORD_NO_TEST_THREAD', async () => {
    // ถ้าไม่กันตรงนี้ TEST จะเท่ากับ OFFLINE แบบเงียบ ๆ แล้วร้านจะงงว่าตั้งทดสอบแล้วไม่มีอะไรเกิดขึ้น
    keywordFindFirst.mockResolvedValue({ id: KEYWORD, shopId: SHOP, status: 'OFFLINE' } as never)
    phraseCount.mockResolvedValue(2 as never)
    ruleCount.mockResolvedValue(1 as never)
    testThreadCount.mockResolvedValue(0 as never)
    await expect(updateKeyword(KEYWORD, SHOP, USER, { status: 'TEST' })).rejects.toThrow(
      'AUTO_REPLY_KEYWORD_NO_TEST_THREAD',
    )
  })

  it('กลับไป OFFLINE ไม่ต้องเช็คเงื่อนไขความสมบูรณ์', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD, shopId: SHOP, status: 'LIVE' } as never)
    keywordUpdate.mockResolvedValue({
      id: KEYWORD, name: 'x', matchType: 'CONTAINS', priority: 100, status: 'OFFLINE',
      createdAt: new Date(), updatedAt: new Date(), phrases: [], _count: { phrases: 0, rules: 0, testThreads: 0 },
    } as never)
    await updateKeyword(KEYWORD, SHOP, USER, { status: 'OFFLINE' })
    expect(phraseCount).not.toHaveBeenCalled()
  })
})

describe('deleteKeyword — ownership scope', () => {
  it('ไม่พบแถวของร้านนี้ -> throw NOT_FOUND (กัน IDOR ข้ามร้าน)', async () => {
    keywordDeleteMany.mockResolvedValue({ count: 0 } as never)
    await expect(deleteKeyword(KEYWORD, SHOP)).rejects.toThrow('AUTO_REPLY_KEYWORD_NOT_FOUND')
  })

  it('ลบสำเร็จ -> deleteMany scope {id, shopId} + invalidateShop', async () => {
    keywordDeleteMany.mockResolvedValue({ count: 1 } as never)
    await deleteKeyword(KEYWORD, SHOP)
    expect(keywordDeleteMany).toHaveBeenCalledWith({ where: { id: KEYWORD, shopId: SHOP } })
    expect(invalidateShop).toHaveBeenCalledWith(SHOP)
  })
})

describe('addPhrases — normalize + dedupe + duplicate detection (TFR-003)', () => {
  it('normalize แล้วว่าง (มีแต่วรรคตอน) -> ข้ามไม่บันทึก', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    const result = await addPhrases(KEYWORD, SHOP, ['!!!'])
    expect(result.emptyAfterNormalize).toEqual(['!!!'])
    expect(result.created).toEqual([])
    expect(phraseCreateMany).not.toHaveBeenCalled()
  })

  it('ซ้ำในกลุ่มเดียวกัน (มีอยู่แล้ว) -> block ไม่สร้างซ้ำ (AC-002-03)', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    phraseFindMany.mockResolvedValueOnce([{ normalizedPhrase: 'สนใจ' }] as never) // existing in group
    phraseFindMany.mockResolvedValueOnce([] as never) // cross-group warnings query
    const result = await addPhrases(KEYWORD, SHOP, ['สนใจ!!'])
    expect(result.duplicateInGroup).toEqual(['สนใจ!!'])
    expect(phraseCreateMany).not.toHaveBeenCalled()
  })

  it('ซ้ำกันเองในคำขอเดียวกัน -> dedupe เหลือรายการเดียว', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    phraseFindMany.mockResolvedValueOnce([] as never) // existing in group
    phraseFindMany.mockResolvedValueOnce([] as never) // created lookup after createMany
    phraseFindMany.mockResolvedValueOnce([] as never) // cross-group warnings query
    await addPhrases(KEYWORD, SHOP, ['สนใจ', 'สนใจ!!', 'สนใจ  '])
    expect(phraseCreateMany.mock.calls[0][0].data).toHaveLength(1)
  })

  it('ซ้ำกับกลุ่มอื่นที่เปิดใช้งาน -> warnings (ไม่บล็อก ยังสร้างได้)', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    phraseFindMany.mockResolvedValueOnce([] as never) // ไม่ซ้ำในกลุ่มตัวเอง
    phraseFindMany
      .mockResolvedValueOnce([]) // created lookup after createMany
      .mockResolvedValueOnce([
        { normalizedPhrase: 'สนใจ', keyword: { id: 'kw-other', name: 'ถามราคา' } },
      ] as never)
    const result = await addPhrases(KEYWORD, SHOP, ['สนใจ'])
    expect(result.warnings).toEqual([
      { phrase: 'สนใจ', conflictKeywordId: 'kw-other', conflictKeywordName: 'ถามราคา' },
    ])
  })

  it('กลุ่มไม่ใช่ของร้านนี้ -> throw AUTO_REPLY_KEYWORD_NOT_FOUND', async () => {
    keywordFindFirst.mockResolvedValue(null as never)
    await expect(addPhrases(KEYWORD, SHOP, ['สนใจ'])).rejects.toThrow('AUTO_REPLY_KEYWORD_NOT_FOUND')
  })
})

describe('deletePhrase — TFR-006 กันลบ phrase สุดท้ายของกลุ่มที่ไม่ใช่ OFFLINE', () => {
  it('เป็น phrase สุดท้ายของกลุ่มที่เปิดใช้งาน -> throw AUTO_REPLY_KEYWORD_LAST_PHRASE', async () => {
    phraseFindFirst.mockResolvedValue({ id: 'ph-1' } as never)
    keywordFindFirst.mockResolvedValue({ status: 'LIVE' } as never)
    phraseCount.mockResolvedValue(0 as never) // เหลือ 0 หลังลบตัวนี้
    await expect(deletePhrase('ph-1', KEYWORD, SHOP)).rejects.toThrow('AUTO_REPLY_KEYWORD_LAST_PHRASE')
    expect(phraseDelete).not.toHaveBeenCalled()
  })

  it('กลุ่มเป็น OFFLINE -> ลบ phrase สุดท้ายได้', async () => {
    phraseFindFirst.mockResolvedValue({ id: 'ph-1' } as never)
    keywordFindFirst.mockResolvedValue({ status: 'OFFLINE' } as never)
    await deletePhrase('ph-1', KEYWORD, SHOP)
    expect(phraseDelete).toHaveBeenCalledWith({ where: { id: 'ph-1' } })
    expect(invalidateShop).toHaveBeenCalledWith(SHOP)
  })
})

describe('createRule — specificity invariant (TFR-004)', () => {
  it('คำนวณ specificity จากเงื่อนไขเสมอ (ไม่รับจาก input) — เพจ+สินค้า = 5', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    channelFindFirst.mockResolvedValue({ id: 'ch-1' } as never)
    productFindFirst.mockResolvedValue({ id: 'prod-1' } as never)
    ruleCreate.mockResolvedValue({ id: 'rule-1', specificity: 5 } as never)

    await createRule(SHOP, USER, {
      keywordId: KEYWORD,
      shopChannelId: 'ch-1',
      adId: null,
      adLabel: null,
      productId: 'prod-1',
      replyText: 'สวัสดีครับ',
      isActive: true,
      activeFrom: null,
      activeUntil: null,
    })

    expect(ruleCreate.mock.calls[0][0].data.specificity).toBe(5)
  })

  it('replyText ว่างหลัง trim -> throw AUTO_REPLY_RULE_EMPTY_REPLY (AC-005-03) ไม่แตะ DB', async () => {
    await expect(
      createRule(SHOP, USER, {
        keywordId: KEYWORD,
        shopChannelId: null,
        adId: null,
        adLabel: null,
        productId: null,
        replyText: '   ',
        isActive: true,
        activeFrom: null,
        activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_EMPTY_REPLY')
    expect(ruleCreate).not.toHaveBeenCalled()
  })

  it('adId มีค่าแต่ shopChannelId ไม่มี -> throw AUTO_REPLY_RULE_AD_REQUIRES_CHANNEL (invariant TFR-004)', async () => {
    await expect(
      createRule(SHOP, USER, {
        keywordId: KEYWORD,
        shopChannelId: null,
        adId: 'ad_123',
        adLabel: null,
        productId: null,
        replyText: 'ตอบ',
        isActive: true,
        activeFrom: null,
        activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_AD_REQUIRES_CHANNEL')
  })

  it('keywordId=null (กฎกลาง) แต่มี productId -> throw AUTO_REPLY_RULE_CENTRAL_CANNOT_HAVE_AD_OR_PRODUCT', async () => {
    await expect(
      createRule(SHOP, USER, {
        keywordId: null,
        shopChannelId: null,
        adId: null,
        adLabel: null,
        productId: 'prod-1',
        replyText: 'ตอบ',
        isActive: true,
        activeFrom: null,
        activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_CENTRAL_CANNOT_HAVE_AD_OR_PRODUCT')
  })

  it('shopChannelId ไม่ใช่เพจของร้านนี้ -> throw AUTO_REPLY_RULE_CHANNEL_NOT_FOUND (ownership)', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    channelFindFirst.mockResolvedValue(null as never)
    await expect(
      createRule(SHOP, USER, {
        keywordId: KEYWORD,
        shopChannelId: 'ch-other-shop',
        adId: null,
        adLabel: null,
        productId: null,
        replyText: 'ตอบ',
        isActive: true,
        activeFrom: null,
        activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_CHANNEL_NOT_FOUND')
    expect(channelFindFirst).toHaveBeenCalledWith({
      where: { id: 'ch-other-shop', shopId: SHOP, status: 'ACTIVE' },
      select: { id: true },
    })
  })

  it('productId ไม่ใช่ของร้านนี้ -> throw AUTO_REPLY_RULE_PRODUCT_NOT_FOUND (ownership)', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    productFindFirst.mockResolvedValue(null as never)
    await expect(
      createRule(SHOP, USER, {
        keywordId: KEYWORD,
        shopChannelId: null,
        adId: null,
        adLabel: null,
        productId: 'prod-other-shop',
        replyText: 'ตอบ',
        isActive: true,
        activeFrom: null,
        activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_PRODUCT_NOT_FOUND')
  })

  it('P2002 (unique เงื่อนไขซ้ำ) -> แปลงเป็น AUTO_REPLY_RULE_CONDITION_DUPLICATE (AC-006-02)', async () => {
    keywordFindFirst.mockResolvedValue({ id: KEYWORD } as never)
    ruleCreate.mockRejectedValue(p2002(['shopId', 'keywordId', 'shopChannelId', 'adId', 'productId']) as never)
    await expect(
      createRule(SHOP, USER, {
        keywordId: KEYWORD,
        shopChannelId: null,
        adId: null,
        adLabel: null,
        productId: null,
        replyText: 'ตอบ',
        isActive: true,
        activeFrom: null,
        activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_CONDITION_DUPLICATE')
  })
})

describe('updateRule — recompute specificity ทุกครั้ง + TFR-006 กันปิดกฎสุดท้าย', () => {
  it('ล้าง productId ตอน update -> specificity ต้องถูกคำนวณใหม่ (ไม่ใช่ค่าเดิม)', async () => {
    ruleFindFirst.mockResolvedValue({
      id: 'rule-1', shopId: SHOP, keywordId: KEYWORD, shopChannelId: 'ch-1', productId: 'prod-1',
      isActive: true, specificity: 5,
    } as never)
    channelFindFirst.mockResolvedValue({ id: 'ch-1' } as never)
    ruleUpdate.mockResolvedValue({ id: 'rule-1', specificity: 4 } as never)

    await updateRule('rule-1', SHOP, USER, {
      shopChannelId: 'ch-1',
      adId: null,
      adLabel: null,
      productId: null, // ล้างสินค้าออก
      replyText: 'ตอบใหม่',
      isActive: true,
      activeFrom: null,
      activeUntil: null,
    })

    expect(ruleUpdate.mock.calls[0][0].data.specificity).toBe(4) // เพจอย่างเดียว = 4
  })

  it('ปิดกฎสุดท้ายของกลุ่มที่เปิดอยู่ -> throw AUTO_REPLY_KEYWORD_LAST_ANSWER', async () => {
    ruleFindFirst.mockResolvedValue({
      id: 'rule-1', shopId: SHOP, keywordId: KEYWORD, shopChannelId: null, productId: null,
      isActive: true, specificity: 0,
    } as never)
    keywordFindFirst.mockResolvedValue({ status: 'LIVE' } as never)
    ruleCount.mockResolvedValue(0 as never)

    await expect(
      updateRule('rule-1', SHOP, USER, {
        shopChannelId: null, adId: null, adLabel: null, productId: null,
        replyText: 'ตอบ', isActive: false, activeFrom: null, activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_KEYWORD_LAST_ANSWER')
    expect(ruleUpdate).not.toHaveBeenCalled()
  })

  it('กฎไม่ใช่ของร้านนี้ -> throw AUTO_REPLY_RULE_NOT_FOUND', async () => {
    ruleFindFirst.mockResolvedValue(null as never)
    await expect(
      updateRule('rule-1', SHOP, USER, {
        shopChannelId: null, adId: null, adLabel: null, productId: null,
        replyText: 'ตอบ', isActive: true, activeFrom: null, activeUntil: null,
      }),
    ).rejects.toThrow('AUTO_REPLY_RULE_NOT_FOUND')
  })
})

describe('deleteRule — TFR-006 กันลบกฎสุดท้ายของกลุ่มที่เปิดอยู่', () => {
  it('เป็นกฎสุดท้ายที่เปิดใช้งานของกลุ่มที่เปิดอยู่ -> throw', async () => {
    ruleFindFirst.mockResolvedValue({ id: 'rule-1', shopId: SHOP, keywordId: KEYWORD, isActive: true } as never)
    keywordFindFirst.mockResolvedValue({ status: 'LIVE' } as never)
    ruleCount.mockResolvedValue(0 as never)
    await expect(deleteRule('rule-1', SHOP)).rejects.toThrow('AUTO_REPLY_KEYWORD_LAST_ANSWER')
    expect(ruleDelete).not.toHaveBeenCalled()
  })

  it('กฎกลาง (keywordId=null) ไม่ผูก TFR-006 -> ลบได้เสมอ', async () => {
    ruleFindFirst.mockResolvedValue({ id: 'rule-1', shopId: SHOP, keywordId: null, isActive: true } as never)
    await deleteRule('rule-1', SHOP)
    expect(ruleDelete).toHaveBeenCalledWith({ where: { id: 'rule-1' } })
    expect(invalidateShop).toHaveBeenCalledWith(SHOP)
  })
})
