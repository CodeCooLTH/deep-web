import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pageComment: { findUnique: vi.fn(), findFirst: vi.fn() },
    commentReplyLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    commentReplyRule: { findMany: vi.fn() },
  },
}))
vi.mock('@/services/page-comment.service', () => ({ replyToComment: vi.fn() }))
vi.mock('@/services/comment-private-reply.service', () => ({
  sendPrivateReplyToCommentById: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { replyToComment } from '@/services/page-comment.service'
import { sendPrivateReplyToCommentById } from '@/services/comment-private-reply.service'
import { processCommentAutoReply } from '@/services/comment-auto-reply.service'

const publicReply = vi.mocked(replyToComment)
const privateReply = vi.mocked(sendPrivateReplyToCommentById)
const logCreate = vi.mocked(prisma.commentReplyLog.create)
const ruleFindMany = vi.mocked(prisma.commentReplyRule.findMany)
const logUpdate = vi.mocked(prisma.commentReplyLog.update)

/** คอมเมนต์ที่ผ่านทุกด่าน เพจเปิดทั้ง 2 สวิตช์ */
function okRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cmt-1',
    externalCommentId: '123_456',
    postId: 'post-1',
    shopChannelId: 'ch-1',
    fromExternalId: 'psid-1',
    fromName: 'Jiravut Sungkakul',
    message: 'ชุดนี้ราคาเท่าไหร่ครับ',
    isFromPage: false,
    parentExternalId: null,
    isDeleted: false,
    createdTime: new Date(),
    post: {
      id: 'post-1',
      channel: {
        id: 'ch-1',
        shopId: 'shop-1',
        externalId: 'page-1',
        status: 'ACTIVE',
        commentPublicReplyEnabled: true,
        commentPublicReplyText: 'ขอบคุณที่สนใจครับ',
        commentPublicReplyFileId: null,
        commentPrivateReplyEnabled: true,
        commentPrivateReplyText: 'สวัสดีครับ',
      },
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(okRow() as never)
  vi.mocked(prisma.pageComment.findFirst).mockResolvedValue(null as never) // ไม่มีคนตอบ
  vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue(null as never) // ยังไม่เคยตอบ
  ruleFindMany.mockResolvedValue([] as never) // ไม่มีกฎ = พฤติกรรมเดิม (ใช้ข้อความ fallback ของเพจ)
  logCreate.mockResolvedValue({ id: 'log-1' } as never)
  logUpdate.mockResolvedValue({ id: 'log-1' } as never)
  publicReply.mockResolvedValue({ id: 'reply-1' } as never)
  privateReply.mockResolvedValue({ sent: true, conversationId: 'conv-1', messageId: 'mid-1' } as never)
})

describe('processCommentAutoReply', () => {
  it('เปิดทั้ง 2 สวิตช์ -> ตอบใต้คอมเมนต์ด้วย system actor แล้วทักแชท', async () => {
    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 'cmt-1',
        message: 'ขอบคุณที่สนใจครับ',
        actorUserId: null, // system actor — ไม่ใช่ user จริง
      }),
    )
    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 'cmt-1', text: 'สวัสดีครับ', trigger: 'AUTO' }),
    )
  })

  // Fix round 1 — ต้องส่ง reservedLogId เป็นแถวเดียวกับที่ processCommentAutoReply จองไว้เอง
  // (logCreate mock คืน { id: 'log-1' }) ไม่งั้น sendPrivateReplyToCommentById จะ findFirst เจอแถว
  // นั้นแล้ว trip ALREADY_SENT ทันทีทุกครั้ง = private auto-reply ไม่ยิง Graph เลยสักครั้ง
  it('ส่ง reservedLogId เป็น id ของแถวที่จองไว้เข้า sendPrivateReplyToCommentById เสมอ', async () => {
    logCreate.mockResolvedValue({ id: 'log-reserved-123' } as never)

    await processCommentAutoReply('cmt-1')

    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ reservedLogId: 'log-reserved-123' }),
    )
  })

  it('ตอบใต้คอมเมนต์ล้มเหลว -> ยังทักแชทต่อ (BR-CR-A5 ไม่ผูกกันแบบ all-or-nothing)', async () => {
    publicReply.mockRejectedValue(new Error('(#200) Permissions error'))

    await processCommentAutoReply('cmt-1')

    expect(privateReply).toHaveBeenCalledTimes(1)
    expect(vi.mocked(prisma.commentReplyLog.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicReplyStatus: 'FAILED' }),
      }),
    )
  })

  it('คนในทีมตอบไปแล้ว -> ไม่เรียกตัวส่งเลยสักตัว และบันทึก skipReason', async () => {
    vi.mocked(prisma.pageComment.findFirst).mockResolvedValue({ id: 'human-reply' } as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger: 'AUTO', skipReason: 'HUMAN_ANSWERED' }),
      }),
    )
  })

  it('คอมเมนต์ใบนี้เคยถูกประมวลผลแล้ว (Meta ส่ง webhook ซ้ำ) -> หยุดเงียบ ไม่เขียนแถวใหม่', async () => {
    vi.mocked(prisma.commentReplyLog.findFirst).mockResolvedValue({ id: 'log-old' } as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
    expect(logCreate).not.toHaveBeenCalled()
  })

  /** ทำให้เฉพาะ "การจองสิทธิ์ทักแชท" (update ที่มี privateAttemptedAt) ชน P2002 — update อื่นปกติ */
  function rejectPrivateClaimWithP2002() {
    logUpdate.mockImplementation((async (args: { data?: Record<string, unknown> }) =>
      args?.data?.privateAttemptedAt
        ? Promise.reject(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
        : ({ id: 'log-1' } as never)) as never)
  }

  // [blocker] 2026-08-15 — เคสที่ user เจอเองบน prod: ลูกค้าคนเดิมคอมเมนต์ใบที่ 2 บนโพสต์เดิม
  // (fromExternalId 27753759930971545 / โพสต์ 32ce13f4…) แล้วเงียบสนิททั้งแถว ไม่มีแม้แต่บรรทัด
  // ในหน้าประวัติ — เพราะกฎ "ครั้งเดียวต่อคนต่อโพสต์" เดิมครอบฝั่งตอบใต้คอมเมนต์ไปด้วย
  // BR-CR-A2a: ฝั่งสาธารณะไม่มีเพดานนี้แล้ว ลูกค้าถามใหม่ต้องได้คำตอบใหม่เสมอ
  it('[blocker] คอมเมนต์ใบใหม่ของคนเดิมบนโพสต์เดิม -> ยังตอบใต้คอมเมนต์เสมอ', async () => {
    // จำลองโลกจริง: มีแถว AUTO ของ "คนนี้บนโพสต์นี้" อยู่แล้วจากคอมเมนต์ใบก่อน แต่ยังไม่มีแถว
    // ของ "คอมเมนต์ใบนี้" — ด่านต้องถามคำถามที่สอง ไม่ใช่คำถามแรก ถ้าใครย้ายคีย์กลับไปเป็น
    // (shopChannelId, postId, fromExternalId) เทสนี้จะแดงทันที
    vi.mocked(prisma.commentReplyLog.findFirst).mockImplementation((async (args: {
      where?: Record<string, unknown>
    }) => (args?.where?.commentId ? null : { id: 'log-เมื่อวาน' })) as never)
    rejectPrivateClaimWithP2002()

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledTimes(1)
  })

  // [blocker] อีกครึ่งของกฎเดียวกัน: DM ซ้ำใบที่สองคือสแปมจริง ๆ และ Facebook ให้ทักได้ครั้งเดียว
  // ต่อคอมเมนต์อยู่แล้ว — การจองสิทธิ์ต้องกันได้ **และต้องบันทึกให้ผู้ขายเห็นเหตุผล** ไม่ใช่เงียบ
  it('[blocker] จองสิทธิ์ทักแชทชน P2002 -> ไม่ยิง DM ซ้ำ และบันทึก SKIPPED/ALREADY_SENT', async () => {
    rejectPrivateClaimWithP2002()

    await processCommentAutoReply('cmt-1')

    expect(privateReply).not.toHaveBeenCalled()
    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { privateReplyStatus: 'SKIPPED', privateErrorMessage: 'ALREADY_SENT' },
      }),
    )
  })

  it('[blocker] ต้องจองสิทธิ์ (เขียน privateAttemptedAt) ก่อนเรียกตัวส่ง DM เสมอ', async () => {
    const order: string[] = []
    logUpdate.mockImplementation((async (args: { data?: Record<string, unknown> }) => {
      if (args?.data?.privateAttemptedAt) order.push('claim')
      return { id: 'log-1' } as never
    }) as never)
    privateReply.mockImplementation((async () => {
      order.push('send')
      return { sent: true, conversationId: 'conv-1' } as never
    }) as never)

    await processCommentAutoReply('cmt-1')

    expect(order).toEqual(['claim', 'send'])
  })

  it('จองแถว log แล้วชน P2002 (อีกเธรดชนะ) -> หยุดเงียบ ไม่ยิงซ้ำ', async () => {
    logCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
  })

  it('ตัวส่งโยน error -> ฟังก์ชันนี้ต้องไม่ throw ออกไป (caller คือ webhook after())', async () => {
    privateReply.mockRejectedValue(new Error('boom'))

    await expect(processCommentAutoReply('cmt-1')).resolves.toBeUndefined()
  })

  /** ทับค่าตั้งค่าของเพจตรง ๆ (ซ้อนลึกใน post.channel) */
  function withChannel(over: Record<string, unknown>) {
    const base = okRow()
    return { ...base, post: { ...base.post, channel: { ...base.post.channel, ...over } } }
  }

  /** สร้าง okRow ที่ทับข้อความตั้งค่าของเพจ (ซ้อนลึกใน post.channel จึงเขียนเป็น helper) */
  function rowWithTexts(over: { publicText?: string | null; privateText?: string | null; fromName?: string | null }) {
    const base = okRow()
    return {
      ...base,
      fromName: over.fromName === undefined ? base.fromName : over.fromName,
      post: {
        ...base.post,
        channel: {
          ...base.post.channel,
          ...(over.publicText !== undefined ? { commentPublicReplyText: over.publicText } : {}),
          ...(over.privateText !== undefined ? { commentPrivateReplyText: over.privateText } : {}),
        },
      },
    }
  }

  // [blocker] user สั่ง 2026-08-15 "แทรกชื่อ facebook ที่ reply ได้ไหม" — ถ้าตัวแทนชื่อไม่ถูกแทน
  // ลูกค้าจะเห็นคำว่า {ชื่อ} โผล่ในคอมเมนต์สาธารณะ ซึ่งแย่กว่าไม่มีฟีเจอร์นี้เลย
  it('[blocker] แทน {ชื่อ} ด้วยชื่อผู้คอมเมนต์ทั้งฝั่งตอบใต้คอมเมนต์และฝั่งทักแชท', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      rowWithTexts({
        publicText: 'แอดมิน {ชื่อ} ขออนุญาติทักไปให้ข้อมูลนะคะ',
        privateText: 'สวัสดีค่ะคุณ {ชื่อ}',
        fromName: 'Jiravut Sungkakul',
      }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'แอดมิน Jiravut Sungkakul ขออนุญาติทักไปให้ข้อมูลนะคะ' }),
    )
    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'สวัสดีค่ะคุณ Jiravut Sungkakul' }),
    )
  })

  it('[blocker] คอมเมนต์ที่ไม่มีชื่อ -> ตัด {ชื่อ} ทิ้ง ห้ามส่งคำนั้นออกไปดิบ ๆ', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      rowWithTexts({ publicText: 'สวัสดีค่ะ {ชื่อ} สนใจสอบถามได้เลย', fromName: null }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'สวัสดีค่ะ สนใจสอบถามได้เลย' }),
    )
  })

  // [blocker] ข้อความที่มีแต่ {ชื่อ} + ไม่มีชื่อ = สตริงว่าง — ถ้าด่านตัดสินจากข้อความ **ดิบ**
  // (ซึ่งไม่ว่าง) จะจองแถว log ไว้เฉย ๆ แล้วยิงข้อความเปล่าออกไปหา Meta
  it('[blocker] ข้อความเหลือว่างหลังแทนชื่อ -> ไม่ยิงอะไรเลย และบันทึก DISABLED', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      rowWithTexts({ publicText: '{ชื่อ}', privateText: '{ชื่อ}', fromName: null }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ skipReason: 'DISABLED' }) }),
    )
  })

  // [blocker] ส่วนขยาย E1 — ต้องส่ง fileId ต่อเข้า replyToComment ไม่ใช่ปล่อย null ทิ้งเหมือนเดิม
  // (ท่อส่งรูปมีมาตั้งแต่ 2026-08-03 และโหมด "ตอบเอง" ใช้จริงแล้ว 134 ใบ ขาดแค่โหมดอัตโนมัติ)
  it('[blocker] เพจตั้งรูปไว้ -> ส่ง fileId ต่อเข้า replyToComment', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      withChannel({ commentPublicReplyFileId: 'file-abc' }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'file-abc' }))
  })

  // [blocker] คู่กับด่านใน evaluateCommentGate — ถ้าที่นี่ยังคิด publicOn จากข้อความอย่างเดียว
  // ด่านจะปล่อยผ่าน (เพราะนับรูป) แล้วมาเงียบตรงนี้แทน = จองแถว log ไว้เฉย ๆ ไม่ส่งอะไร
  it('[blocker] มีรูปแต่ไม่มีข้อความ -> ยังตอบใต้คอมเมนต์ (ส่งรูปเปล่า)', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      withChannel({ commentPublicReplyText: null, commentPublicReplyFileId: 'file-abc' }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: '', fileId: 'file-abc' }),
    )
  })

  /** กฎเดียวที่จับคำว่า "ราคา" — override เฉพาะช่องที่เทสสนใจ */
  function priceRule(over: Record<string, unknown> = {}) {
    return {
      id: 'rule-price',
      shopChannelId: null,
      normalizedPhrases: ['ราคา'],
      priority: 100,
      createdAt: new Date('2026-08-01'),
      publicReplyText: 'ชุดนี้ 1,500 บาทครับ',
      publicReplyFileId: null,
      privateReplyText: 'ทักมาได้เลยครับ',
      ...over,
    }
  }

  // [blocker] ส่วนขยาย E2 — 35% ของคอมเมนต์บน prod ถามราคาตรง ๆ ถ้ากฎไม่ชนะ fallback
  // ทั้งฟีเจอร์ก็ไม่มีความหมายเลย
  it('[blocker] คอมเมนต์เข้ากฎ -> ใช้ข้อความของกฎ ไม่ใช่ข้อความ fallback ของเพจ', async () => {
    ruleFindMany.mockResolvedValue([priceRule()] as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ชุดนี้ 1,500 บาทครับ' }),
    )
    expect(privateReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'ทักมาได้เลยครับ' }),
    )
  })

  it('[blocker] บันทึกว่าใช้กฎไหน -> ประวัติต้องอธิบายคำตอบนั้นได้', async () => {
    ruleFindMany.mockResolvedValue([priceRule()] as never)

    await processCommentAutoReply('cmt-1')

    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchedRuleId: 'rule-price' }) }),
    )
  })

  it('ไม่เข้ากฎไหนเลย -> ตกไปใช้ข้อความ fallback ของเพจ (พฤติกรรมเดิม) และ matchedRuleId เป็น null', async () => {
    ruleFindMany.mockResolvedValue([priceRule({ normalizedPhrases: ['ผ่อน'] })] as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ขอบคุณที่สนใจครับ' }),
    )
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchedRuleId: null }) }),
    )
  })

  // [blocker] D-EXT2-4 — ร้านตั้งใจว่า "คนพิมพ์ว่าสวย ขอบคุณพอ ไม่ต้องทัก" ถ้าฝั่งทักแชทตกกลับไป
  // ใช้ข้อความ fallback ของเพจ ลูกค้าจะยังโดนทักอยู่ดี = ตรงข้ามกับสิ่งที่สั่งไว้เป๊ะ ๆ
  it('[blocker] กฎสั่งเฉพาะตอบใต้คอมเมนต์ -> ห้ามทักแชทด้วยข้อความ fallback ของเพจ', async () => {
    ruleFindMany.mockResolvedValue([priceRule({ privateReplyText: null })] as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).toHaveBeenCalledTimes(1)
    expect(privateReply).not.toHaveBeenCalled()
  })

  it('[blocker] กฎสั่งเฉพาะทักแชท -> ห้ามตอบใต้คอมเมนต์ด้วยข้อความ fallback ของเพจ', async () => {
    ruleFindMany.mockResolvedValue([
      priceRule({ publicReplyText: null, publicReplyFileId: null }),
    ] as never)

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).toHaveBeenCalledTimes(1)
  })

  // [blocker] กฎต้องไม่กลายเป็นทางลัดข้ามสวิตช์หลัก — ปิดสวิตช์แล้วต้องเงียบจริง
  // ไม่งั้นการปิดฟีเจอร์ไม่ได้ปิดอะไรเลย ซึ่งเป็นสิ่งที่ผู้ใช้ไว้ใจไม่ได้ที่สุด
  it('[blocker] ปิดสวิตช์ทั้งสองของเพจ -> กฎก็ต้องไม่ยิงอะไรเลย', async () => {
    ruleFindMany.mockResolvedValue([priceRule()] as never)
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      withChannel({ commentPublicReplyEnabled: false, commentPrivateReplyEnabled: false }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).not.toHaveBeenCalled()
  })

  // [blocker] เคสที่แยกได้จริงว่า "สวิตช์ยังคูณอยู่ไหม" — ปิดทั้งสองสวิตช์ด่าน DISABLED จะตัดจบ
  // ก่อนถึงบรรทัดนั้นเสมอ เทสจึงจับไม่ได้ ต้องปิดทีละข้างถึงจะเห็นความต่าง
  it('[blocker] ปิดเฉพาะสวิตช์ตอบใต้คอมเมนต์ -> กฎมีข้อความสาธารณะก็ต้องไม่ตอบ', async () => {
    ruleFindMany.mockResolvedValue([priceRule()] as never)
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      withChannel({ commentPublicReplyEnabled: false }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(publicReply).not.toHaveBeenCalled()
    expect(privateReply).toHaveBeenCalledTimes(1) // ฝั่งที่ยังเปิดอยู่ต้องทำงานตามปกติ
  })

  it('[blocker] ปิดเฉพาะสวิตช์ทักแชท -> กฎมีข้อความทักแชทก็ต้องไม่ทัก', async () => {
    ruleFindMany.mockResolvedValue([priceRule()] as never)
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(
      withChannel({ commentPrivateReplyEnabled: false }) as never,
    )

    await processCommentAutoReply('cmt-1')

    expect(privateReply).not.toHaveBeenCalled()
    expect(publicReply).toHaveBeenCalledTimes(1)
  })

  it('ไม่พบคอมเมนต์ -> ไม่ throw และไม่เรียกอะไร', async () => {
    vi.mocked(prisma.pageComment.findUnique).mockResolvedValue(null as never)

    await expect(processCommentAutoReply('missing')).resolves.toBeUndefined()
    expect(logCreate).not.toHaveBeenCalled()
  })
})
