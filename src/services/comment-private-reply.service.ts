/**
 * comment-private-reply.service — จุดเดียวที่ระบบส่ง private reply ออก (feature 00038)
 *
 * ทั้งปุ่ม "ทักแชท" ที่คนกด และตัวยิงอัตโนมัติ เรียกฟังก์ชันเดียวกันที่นี่
 *
 * 🛑 ห้าม reuse sendOutboundMessage() ของ channel-chat.service — มันเช็ค
 * getWindowState(conversation.lastInboundAt) แล้ว throw WINDOW_CLOSED เมื่อเส้นทางไม่ใช่คนกด
 * (channel-chat.service.ts:1780) ซึ่งห้องที่เพิ่งเกิดจาก private reply มี lastInboundAt = null
 * เสมอ จึงตกทุกครั้ง — และ guard ตัวนั้นทำงานถูกอยู่แล้วสำหรับกรณีของมัน ห้ามไปแก้
 */
import { prisma } from '@/lib/prisma'
import { canAccessShop } from '@/lib/shop-context'
import { markCommentRepliedExternally, resolveChannelToken } from '@/services/page-comment.service'
import { sendPrivateReplyToComment } from '@/lib/facebook/graph'
import { isAlreadyRepliedGraphError } from '@/lib/facebook/private-reply-error'
import { PRIVATE_REPLY_WINDOW_MS, isWithinPrivateReplyWindow } from '@/lib/private-reply-window'

/**
 * หน้าต่างทักส่วนตัวของ Meta — ย้ายไป `@/lib/private-reply-window` แล้ว (2026-08-19) เพราะตัวเลข
 * เดียวกันถูกคัดลอกไปอยู่ 3 ที่จริง ๆ ตามที่ SRS เตือนไว้แต่แรก. re-export ไว้เพื่อไม่ให้ผู้เรียก
 * เดิมต้องแก้ทั้งชุด — **ที่ประกาศจริงมีที่เดียวคือ lib**
 */
export { PRIVATE_REPLY_WINDOW_MS, isWithinPrivateReplyWindow }

/**
 * ชื่อตั้งต้นของผู้ติดต่อ เมื่อห้องแชทเกิดจาก private reply (bug fix 2026-08-19)
 *
 * ทำไมต้องมี: ชื่อผู้ติดต่อถูกดึงจาก Graph ที่ ingestInboundMessage เท่านั้น (channel-chat.service.ts)
 * ซึ่งวิ่งเฉพาะตอนมี "ข้อความขาเข้า" — ห้องที่เราเป็นคนเปิดเองด้วย private reply จึงได้
 * ExternalContact.name = null แล้วหน้า inbox ตกไป fallback "ผู้ติดต่อ" **ค้างตลอดไปจนกว่าลูกค้าจะตอบ**
 * (prod 2026-08-19: 35 ห้อง ทุกห้องมีข้อความ BUYER = 0 ใบ) ทั้งที่ชื่อคนคอมเมนต์อยู่ใน
 * PageComment.fromName ที่ฟังก์ชันนี้โหลดมาอยู่ในมือแล้วตั้งแต่ต้น (เช็คบน prod: หาชื่อเจอครบ 35/35)
 *
 * 🛑 บังคับให้ id ตรงกันก่อนเสมอ — Graph เปิดห้องให้ "ผู้รับ" ที่มันยืนยันกลับมา ไม่ใช่ "ผู้คอมเมนต์"
 * เป๊ะ ๆ (ดูคอมเมนต์ที่จุด upsert) ไม่ตรงเมื่อไหร่คือเอาชื่อคนหนึ่งไปแปะห้องของอีกคน ซึ่งแย่กว่า
 * คำว่า "ผู้ติดต่อ" มาก. เกณฑ์ต้องเป็น "การเช็ค" ไม่ใช่ "สถิติว่าที่ผ่านมามันตรง"
 *
 * fromName เป็น null ได้ตามปกติ: คอมเมนต์ที่ดึงย้อนหลังผ่าน Graph ไม่มีคีย์ `from` มาให้เลย
 * (ติด Standard Access ของ Business Asset User Profile Access — feature 00029) → ไม่ seed ก็จบ
 */
export function resolveSeedContactName(args: {
  recipientId: string
  commentFromExternalId: string | null
  commentFromName: string | null
}): string | null {
  if (!args.commentFromExternalId) return null
  if (args.commentFromExternalId !== args.recipientId) return null
  const name = args.commentFromName?.trim()
  return name ? name : null
}

export type PrivateReplyResult =
  // conversationId เป็น null เฉพาะกรณี Graph ส่งสำเร็จแต่ทรานแซกชันสร้างห้องแชทล้มเหลว (D2) —
  // ข้อความถึงลูกค้าไปแล้วจริง ห้ามรายงาน sent:false ทั้งที่ Meta ส่งสำเร็จ
  | { sent: true; conversationId: string | null; messageId: string }
  | {
      sent: false
      reason: PrivateReplySkipReason
      error?: string
      /**
       * ห้องแชทที่มีอยู่แล้วกับคนคอมเมนต์คนนี้ — ใส่มาเฉพาะ `ALREADY_REPLIED_EXTERNALLY`
       * เพื่อให้จอเสนอ "ไปที่ห้องแชท" แทนที่จะบอกให้กดซ้ำ (null = หาไม่เจอ ซึ่งเกิดได้ปกติ)
       */
      conversationId?: string | null
    }

export type PrivateReplySkipReason =
  | 'COMMENT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'CHANNEL_INACTIVE'
  | 'WINDOW_EXPIRED'
  | 'ALREADY_SENT'
  | 'EMPTY_TEXT'
  | 'SEND_FAILED'
  /**
   * Facebook ปฏิเสธด้วย `(#10900) Activity already replied to` = เพจทัก private reply คอมเมนต์นี้
   * ไปแล้ว **จากนอกระบบเรา** (Business Suite / Page Inbox) และ Meta ให้ทักได้ครั้งเดียวต่อคอมเมนต์
   *
   * 🛑 แยกจาก `SEND_FAILED` เพราะอันนี้ **ถาวร** — กดซ้ำอีกกี่ครั้งก็ไม่ผ่าน. เดิมตกไปรวมกับ
   * SEND_FAILED → route ตอบ 502 → จอขึ้น "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" = เชิญให้กดสิ่งที่ไร้ผล
   * (บน prod สะสม 25 ครั้งก่อนถูกจับได้ 2026-08-19) คลาสเดียวกับบทเรียน retry ของ iShip
   */
  | 'ALREADY_REPLIED_EXTERNALLY'

/**
 * คีย์กันซ้ำ — ต้องเป็นตัวเดียวกับ partial unique index ในฐาน (migration 20260808120000)
 *   AUTO   → UNIQUE (shopChannelId, postId, fromExternalId) WHERE trigger='AUTO'
 *   MANUAL → UNIQUE (commentId)                             WHERE trigger='MANUAL'
 *
 * 🛑 ด่านต้นฟังก์ชัน (หา "เคยมี log ไหม") กับตอนจอง/เขียน log ต้องเรียกฟังก์ชันนี้ตัวเดียวกันเสมอ
 * — Fix round 2 (reviewer C2): รอบก่อนด่านต้นฟังก์ชันหาด้วย `commentId` ล้วนไม่ว่า trigger ไหน
 * แต่การเขียนจริงของ AUTO คีย์ด้วย (shopChannelId, postId, fromExternalId) ทำให้คนเดิมคอมเมนต์
 * ใบที่สองบนโพสต์เดิม (คนละ commentId) ลอดด่านไปยิง Graph ซ้ำได้ แล้วไปอัปเดตทับแถว AUTO ของ
 * คอมเมนต์ใบแรกโดยไม่มีใครรู้ตัว
 */
function dedupeWhere(args: {
  trigger: 'AUTO' | 'MANUAL'
  commentId: string
  shopChannelId: string
  postId: string
  fromExternalId: string | null
}) {
  return args.trigger === 'MANUAL'
    ? { trigger: 'MANUAL' as const, commentId: args.commentId }
    : {
        trigger: 'AUTO' as const,
        shopChannelId: args.shopChannelId,
        postId: args.postId,
        fromExternalId: args.fromExternalId,
      }
}

/**
 * P2002 (unique constraint) ของ Prisma — เช็ค `.code` ตรง ๆ เป็นทางหลัก (PrismaClientKnownRequestError
 * มี `.code === 'P2002'` อยู่แล้ว ไม่ต้องพึ่ง message) แล้วคง string matching ไว้เป็น fallback กันกรณี
 * error ถูก wrap/serialize ระหว่างทางจนไม่เหลือ `.code` (เช่น โยนผ่าน JSON หรือ error boundary อื่น
 * ที่ clone แค่ message) — พิสูจน์แล้วกับฐานจริงว่า string matching ใช้ได้ (probe 00038: partial
 * unique index ทั้ง 2 ตัวโยน error ที่ message มีคำว่า "Unique constraint" เสมอ) แต่เปราะกว่าที่ควร
 * เพราะ message เปลี่ยนได้ตาม Prisma version — `.code` เป็นสัญญาที่ Prisma คงไว้ข้ามเวอร์ชัน
 */
function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002') {
    return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('P2002') || msg.includes('Unique constraint')
}

/**
 * จุดเดียวที่ระบบส่ง private reply ออก — ปุ่ม "ทักแชท" (MANUAL) และตัวยิงอัตโนมัติ (AUTO) เรียกที่นี่
 *
 * ลำดับการตรวจ (เป็นส่วนหนึ่งของความถูกต้อง — อย่าสลับ):
 *   1. หาคอมเมนต์ + โพสต์ + ช่องทาง → ไม่พบ = COMMENT_NOT_FOUND
 *   2. ข้อความว่าง = EMPTY_TEXT (input ของผู้เรียกเอง ไม่รั่วอะไร)
 *   3. trigger==='MANUAL' → ต้องผ่าน canAccessShop ไม่งั้น FORBIDDEN (AUTO ข้าม — system actor,
 *      shopId มาจากแถวในฐานเท่านั้น ไม่รับจากพารามิเตอร์) — 🛑 ต้องมาก่อนทุกด่านที่เปิดเผยสถานะ
 *      ของคอมเมนต์ (WINDOW_EXPIRED/ALREADY_SENT) เพราะ reason ถูกแมปเป็น HTTP code คนละตัวใน
 *      Task 6 (ALREADY_SENT→400, FORBIDDEN→403) — คนไม่มีสิทธิ์ในร้านที่เดา commentId ไปเรื่อย ๆ
 *      ต้องไม่สามารถอ่านจากรหัสตอบกลับได้ว่าคอมเมนต์ไหนถูกทักไปแล้วบ้าง (SRS §7.14: 403 ต้องไม่
 *      ยืนยันว่าทรัพยากรนั้น "มีจริง"/มีสถานะอะไร)
 *   4. เพจไม่ ACTIVE = CHANNEL_INACTIVE
 *   5. เกินหน้าต่าง 7 วัน = WINDOW_EXPIRED
 *   6. เช็ค + จองแถว CommentReplyLog ด้วย dedupeWhere() เดียวกัน (Fix round 2):
 *        - มี log สถานะ SENT อยู่แล้ว → ALREADY_SENT
 *        - AUTO ที่มี log อยู่แล้วไม่ว่าสถานะไหน → ALREADY_SENT (BR-CR-A6: ส่งไม่สำเร็จ = หยุด
 *          ไม่ลองซ้ำเอง — การลองใหม่เป็นสิทธิ์ของคนกด/MANUAL เท่านั้น)
 *        - ไม่มี log → create แถวใหม่ privateReplyStatus=null ("กำลังส่ง") ดัก P2002 (สองคำขอ
 *          พร้อมกันชนกัน) → ผู้แพ้ได้ ALREADY_SENT
 *        - MANUAL ที่มี log เดิม FAILED → conditional updateMany (WHERE status='FAILED') claim
 *          แถวคืนมาลองใหม่ — count===0 = อีกเธรดคว้าไปแล้ว → ALREADY_SENT (หลักเดียวกับ
 *          claimJob ของ auto-reply.service.ts / atomic deduct ของ wallet.service — ห้าม
 *          findFirst แล้วค่อย update เด็ดขาด)
 *      🛑 **ข้ามข้อนี้ทั้งข้อถ้า `params.reservedLogId` มีค่า** — เจ้าของแถวคือผู้เรียก
 *      (processCommentAutoReply จองแถวเดียวกันไว้แล้วก่อนเรียกมาที่นี่ เพื่อกันซ้ำฝั่ง public
 *      reply ด้วย) ไม่งั้น dedupeWhere() จะ `findFirst` เจอแถวที่ผู้เรียกเพิ่งจองไปเอง แล้ว
 *      `trigger==='AUTO'` จะ trip เป็น ALREADY_SENT ทุกครั้ง = private auto-reply ไม่ยิง Graph
 *      เลยสักครั้ง (Fix round 1 — reviewer จับได้ 2026-08-08, ยืนยันจริงจาก coordinator)
 *   7. ถอดโทเคน → ยิง Graph นอกทรานแซกชันเสมอ (ห้าม network call อยู่ในทรานแซกชัน) ล้มเหลว =
 *      update แถวที่จองไว้เป็น FAILED แล้วคืน SEND_FAILED
 *   8. Graph สำเร็จ: **update log เป็น SENT ทันทีเป็นคำสั่งเดี่ยว ๆ ก่อนทำอย่างอื่น** — ข้อความ
 *      ออกไปแล้วย้อนไม่ได้ ข้อเท็จจริงนี้ต้องคงทนก่อนงานที่ยังล้มได้ (สร้างห้องแชท)
 *   9. สร้าง contact/conversation/message ในทรานแซกชัน ห่อ try/catch — ล้มเหลว: บันทึก
 *      errorMessage ไว้ที่ log (ไม่ throw) แล้วยังคืน sent:true พร้อม conversationId:null
 *      (ห้ามพลิกกลับเป็น sent:false — ข้อความถึงลูกค้าไปแล้วจริง) **ห้ามตั้ง lastInboundAt**
 *  10. สำเร็จครบ: update log ใส่ conversationId
 *
 * 🛑 ฟังก์ชันนี้ห้าม throw ออกไปทุกกรณี (ห่อด้วย try/catch ชั้นนอกสุด) — ผู้เรียกฝั่ง AUTO คือ
 * after() ของ webhook route ซึ่ง throw ไม่ได้ (Meta จะ retry ทั้ง batch)
 */
export async function sendPrivateReplyToCommentById(params: {
  commentId: string
  text: string
  trigger: 'AUTO' | 'MANUAL'
  actorUserId?: string | null
  /**
   * id ของแถว CommentReplyLog ที่ **ผู้เรียกจองไว้แล้ว** (processCommentAutoReply เป็นคนจอง)
   *
   * 🛑 มีไว้เพราะเส้นทาง AUTO จองแถวก่อนเพื่อกันซ้ำฝั่ง public reply ด้วย ถ้าไม่บอกกัน
   * ฟังก์ชันนี้จะเห็นแถวนั้นแล้วตีความว่า "ส่งไปแล้ว" คืน ALREADY_SENT ทันที = ไม่ยิงเลยสักครั้ง
   * (บั๊กจริงที่ reviewer จับได้ 2026-08-08)
   *
   * มีค่า  = ข้ามด่านกันซ้ำและขั้นจองทั้งหมด (ทั้ง findFirst/create/updateMany) ใช้ id นี้เป็น
   *          เป้าหมายของทุกคำสั่ง update ที่บันทึกผลแทน — ด่านอื่นทั้งหมด (COMMENT_NOT_FOUND,
   *          EMPTY_TEXT, FORBIDDEN, CHANNEL_INACTIVE, WINDOW_EXPIRED) ยังทำงานตามปกติ
   * ไม่มีค่า = พฤติกรรมเดิมทุกประการ (ปุ่มแมนนวลใช้ทางนี้ — เจ้าของแถวคือฟังก์ชันนี้เอง)
   */
  reservedLogId?: string
}): Promise<PrivateReplyResult> {
  try {
    const comment = await prisma.pageComment.findUnique({
      where: { id: params.commentId },
      include: {
        post: {
          include: {
            channel: { select: { id: true, shopId: true, externalId: true, status: true } },
          },
        },
      },
    })
    if (!comment) return { sent: false, reason: 'COMMENT_NOT_FOUND' }

    const text = params.text.trim()
    if (!text) return { sent: false, reason: 'EMPTY_TEXT' }

    const channel = comment.post.channel

    // FORBIDDEN ต้องมาก่อน WINDOW_EXPIRED/ALREADY_SENT เสมอ — ด่านสิทธิ์ต้องกันก่อนด่านที่เปิดเผย
    // สถานะของคอมเมนต์ ไม่งั้นคนนอกร้านเดา commentId แล้วอ่านสถานะร้านอื่นจาก reason ที่คืนออกไปได้
    // (ดู docstring ด้านบน + SRS §7.14)
    if (params.trigger === 'MANUAL') {
      if (!params.actorUserId || !(await canAccessShop(channel.shopId, params.actorUserId))) {
        return { sent: false, reason: 'FORBIDDEN' }
      }
    }
    // trigger === 'AUTO': ข้าม (system actor) — shopId ใช้ channel.shopId จากแถวในฐานเสมอ ไม่รับจาก param

    if (channel.status !== 'ACTIVE') return { sent: false, reason: 'CHANNEL_INACTIVE' }

    /**
     * เคยโดน `#10900` มาแล้ว = สิทธิ์ทัก 1 ครั้งของคอมเมนต์นี้ถูกใช้ไปแล้วจริง — ห้ามยิง Graph ซ้ำ
     * (AC-CR-35)
     *
     * 🛑 ด่านนี้ต้องอยู่ฝั่ง server ไม่ใช่แค่ซ่อนปุ่ม: เส้นทาง MANUAL มี claim logic ที่ตั้งใจให้
     * "แถวที่ FAILED กดลองใหม่ได้" (conditional updateMany WHERE privateReplyStatus='FAILED')
     * ซึ่งจะคว้าแถวของเคสนี้มายิงซ้ำได้เสมอ แล้วชน #10900 ทุกครั้งไม่มีทางสำเร็จ —
     * "กฎที่เขียนไว้ยังไม่ใช่กฎที่บังคับได้" (rule-must-be-enforced-not-described.md)
     */
    if (comment.resolvedReason === 'ALREADY_REPLIED_EXTERNALLY') {
      return {
        sent: false,
        reason: 'ALREADY_REPLIED_EXTERNALLY',
        conversationId: await findExistingConversationId(channel.id, comment.fromExternalId),
      }
    }

    if (!isWithinPrivateReplyWindow(comment.createdTime)) {
      return { sent: false, reason: 'WINDOW_EXPIRED' }
    }

    // จองแถว: privateReplyStatus=null แปลว่า "กำลังส่ง" — ผูก reservedLogId ไว้อัปเดตต่อ
    let reservedLogId: string
    if (params.reservedLogId) {
      // เจ้าของแถวคือผู้เรียก (processCommentAutoReply จองไว้แล้วก่อนเรียกมาที่นี่) — ข้ามด่าน
      // กันซ้ำ + ขั้นจอง/claim ทั้งหมด (ดู docstring parameter ด้านบน ทำไมข้ามได้/ทำไมต้องข้าม)
      reservedLogId = params.reservedLogId
    } else {
      const dedupeArgs = {
        trigger: params.trigger,
        commentId: comment.id,
        shopChannelId: channel.id,
        postId: comment.postId,
        fromExternalId: comment.fromExternalId,
      }
      const where = dedupeWhere(dedupeArgs)
      const existing = await prisma.commentReplyLog.findFirst({ where })

      if (existing) {
        if (existing.privateReplyStatus === 'SENT') return { sent: false, reason: 'ALREADY_SENT' }
        // AUTO ที่มีแถวอยู่แล้วไม่ว่าสถานะไหน (FAILED หรือกำลังส่งอยู่/null) = หยุด ไม่ลองซ้ำเอง
        if (params.trigger === 'AUTO') return { sent: false, reason: 'ALREADY_SENT' }
      }

      if (!existing) {
        try {
          const created = await prisma.commentReplyLog.create({
            data: {
              shopChannelId: channel.id,
              postId: comment.postId,
              commentId: comment.id,
              fromExternalId: comment.fromExternalId,
              trigger: params.trigger,
              actorUserId: params.trigger === 'MANUAL' ? (params.actorUserId ?? null) : null,
              privateReplyStatus: null,
            },
            select: { id: true },
          })
          reservedLogId = created.id
        } catch (err) {
          // สองคำขอพร้อมกันชนกันตอน create — ผู้แพ้ (ชน P2002) ถือว่า "อีกฝั่งกำลังจัดการอยู่แล้ว"
          if (isUniqueConstraintError(err)) return { sent: false, reason: 'ALREADY_SENT' }
          throw err
        }
      } else {
        // ถึงตรงนี้ได้แค่กรณี trigger==='MANUAL' && existing.privateReplyStatus !== 'SENT'
        // (AUTO ที่มี existing return ไปแล้วด้านบน) — claim แบบ conditional updateMany เท่านั้น
        // ห้าม findFirst แล้วค่อย update (หลักเดียวกับ claimJob/atomic deduct)
        const { count } = await prisma.commentReplyLog.updateMany({
          where: { id: existing.id, privateReplyStatus: 'FAILED' },
          data: {
            privateReplyStatus: null,
            privateErrorMessage: null,
            actorUserId: params.trigger === 'MANUAL' ? (params.actorUserId ?? null) : null,
          },
        })
        if (count === 0) return { sent: false, reason: 'ALREADY_SENT' }
        reservedLogId = existing.id
      }
    }

    const resolved = await resolveChannelToken(channel.id)
    if (!resolved) {
      // หนี้ #3 (retro 00038): ต้องคืน `error` ที่เจาะจงไปด้วย ไม่ใช่แค่บันทึกไว้ที่ log เฉย ๆ —
      // เส้นทาง AUTO (comment-auto-reply.service.ts) เขียน errorMessage ทับอีกครั้งด้วย
      // `result.error ?? result.reason` เมื่อ error ไม่มีค่า มันตกไปใช้ reason ('CHANNEL_INACTIVE'
      // ทั่วไป) ทับข้อความเจาะจงที่เพิ่งเขียนไปบรรทัดบน — "เพจไม่ ACTIVE" กับ "ถอดรหัสโทเคนไม่ผ่าน"
      // เป็นคนละปัญหาคนละทางแก้ ต้องแยกให้ออกตอนสืบ. `reason` ยังเป็น 'CHANNEL_INACTIVE' เหมือนเดิม
      // เสมอ (ห้ามเปลี่ยน — API.md/route.ts map เป็น 409 CHANNEL_NOT_ACTIVE ตาม contract เดิม)
      await prisma.commentReplyLog.update({
        where: { id: reservedLogId },
        data: { privateReplyStatus: 'FAILED', privateErrorMessage: 'CHANNEL_TOKEN_UNAVAILABLE' },
      })
      return { sent: false, reason: 'CHANNEL_INACTIVE', error: 'CHANNEL_TOKEN_UNAVAILABLE' }
    }

    // ยิง Graph นอกทรานแซกชันเสมอ — network call ห้ามอยู่ในทรานแซกชัน DB
    let sendResult: { recipientId: string; messageId: string }
    try {
      sendResult = await sendPrivateReplyToComment(resolved.token, comment.externalCommentId, text)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await prisma.commentReplyLog.update({
        where: { id: reservedLogId },
        data: { privateReplyStatus: 'FAILED', privateErrorMessage: errorMessage },
      })

      /**
       * `(#10900)` = เพจทักคอมเมนต์นี้ไปแล้วจาก Business Suite/Page Inbox — Meta ให้ทักได้
       * ครั้งเดียวต่อคอมเมนต์ ⇒ **ถาวร** ต้องไม่เชิญให้กดซ้ำ
       *
       * ปิดคอมเมนต์นี้เป็น "จัดการแล้ว" ทันทีด้วยเหตุผลของระบบ — ไม่ต้องรอคนกด เพราะเป็น
       * ข้อเท็จจริงที่ Meta ยืนยันมาแล้ว ไม่ใช่การตัดสินใจของใคร (ส่วนขยาย 2026-08-19 D-3)
       * ทำหลังบันทึก log เสมอ: เหตุผลที่ Facebook ให้มาคือหลักฐาน ต้องไม่หายไปกับการปิดงาน
       */
      if (isAlreadyRepliedGraphError(err)) {
        /**
         * 🛑 การจัดประเภท error ต้องรอดแม้การปิดงานจะล้ม — ถ้าปล่อยให้ throw ขึ้นไป catch ชั้นนอก
         * มันจะกลายเป็น SEND_FAILED แล้วผู้ขายได้ข้อความ "ลองใหม่อีกครั้ง" กลับมาเหมือนเดิม
         * ซึ่งคือบั๊กทั้งหมดที่รอบนี้กำลังแก้ (ข้อเท็จจริงที่ Meta บอกสำคัญกว่าการบันทึกของเรา)
         */
        try {
          await markCommentRepliedExternally(comment.id)
        } catch (markErr) {
          console.error('[comment-private-reply] mark resolved failed', markErr)
        }
        return {
          sent: false,
          reason: 'ALREADY_REPLIED_EXTERNALLY',
          error: errorMessage,
          conversationId: await findExistingConversationId(channel.id, comment.fromExternalId),
        }
      }

      return { sent: false, reason: 'SEND_FAILED', error: errorMessage }
    }

    // 🛑 Graph สำเร็จ = ข้อความถึงลูกค้าแล้ว ย้อนไม่ได้ — บันทึกข้อเท็จจริงนี้เป็นคำสั่งเดี่ยว ๆ
    // ก่อนทำอะไรอย่างอื่นทั้งสิ้น (ก่อนสร้างห้องแชทด้วยซ้ำ) กันกรณี DB ล้มหลังจากนี้แล้วสิทธิ์
    // once-per-comment ของ Meta หายไปโดยระบบไม่รู้ตัวว่าเคยส่งสำเร็จ
    await prisma.commentReplyLog.update({
      where: { id: reservedLogId },
      // ล้างเฉพาะช่องของฝั่งตัวเอง — เดิมล้าง errorMessage ที่ใช้ร่วมกัน ทำให้เหตุผล
      // ของ "ตอบใต้คอมเมนต์" ที่ล้มเหลวก่อนหน้าหายไปด้วยทุกครั้ง (user ชี้เอง 2026-08-10)
      data: { privateReplyStatus: 'SENT', privateErrorMessage: null },
    })

    let conversationId: string | null
    try {
      conversationId = await prisma.$transaction(async (tx) => {
        // เลียนแบบคีย์ upsert เดียวกับ ingestInboundMessage (channel-chat.service.ts) — 1 ห้องต่อ
        // (Page, PSID) ใช้ recipientId ที่ Graph ยืนยันกลับมาจริง (ไม่ใช้ comment.fromExternalId ที่
        // อาจไม่ตรง/ไม่มี เพราะ private reply เปิดห้องให้ "ผู้รับ" ของ Graph ไม่ใช่ "ผู้คอมเมนต์" เป๊ะ ๆ)
        // ชื่อตั้งต้นจากคอมเมนต์ที่เรากำลังตอบ (bug fix 2026-08-19) — ดู resolveSeedContactName
        const seedName = resolveSeedContactName({
          recipientId: sendResult.recipientId,
          commentFromExternalId: comment.fromExternalId,
          commentFromName: comment.fromName,
        })

        const contact = await tx.externalContact.upsert({
          where: {
            shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: sendResult.recipientId },
          },
          // 🛑 ห้ามตั้ง avatarSyncedAt ตรงนี้ — ปล่อย null ไว้เพื่อให้ shouldRetryAvatar()
          // (channel-chat.service.ts:826) ยังคืน true ⇒ ข้อความขาเข้าใบแรกของลูกค้ายังยิง Graph
          // ดึงชื่อ/รูปจริงมาทับชื่อชั่วคราวนี้ตามปกติ ตั้งเมื่อไหร่ = ปิดทางอัปเกรดไปตลอด
          create: { shopChannelId: channel.id, externalUserId: sendResult.recipientId, name: seedName },
          update: {},
        })

        // ห้องที่เคยเปิดค้างไว้ก่อนหน้า (upsert ไม่วิ่งสาขา create) — เติมชื่อให้เฉพาะตอนยัง
        // ไม่มีชื่อ ห้ามทับชื่อจริงที่ Graph เคยดึงมาได้แล้วด้วยชื่อจากคอมเมนต์
        if (seedName && !contact.name) {
          await tx.externalContact.update({ where: { id: contact.id }, data: { name: seedName } })
        }

        const conversationWhere = {
          shopChannelId_externalContactId: { shopChannelId: channel.id, externalContactId: contact.id },
        }
        let conversation = await tx.conversation.findUnique({ where: conversationWhere })
        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              shopId: channel.shopId,
              channel: 'MESSENGER',
              shopChannelId: channel.id,
              externalContactId: contact.id,
            },
          })
        }

        await tx.chatMessage.create({
          data: {
            conversationId: conversation.id,
            senderUserId: null,
            senderRole: 'SHOP',
            type: 'TEXT',
            body: text,
            externalMessageId: sendResult.messageId,
            deliveryStatus: 'SENT',
          },
        })

        // 🛑 ห้ามตั้ง lastInboundAt — เราเป็นคนเริ่มห้องนี้ ไม่ใช่ลูกค้า ตั้งเองเท่ากับโกหกว่าลูกค้า
        // ตอบแล้ว (จะเปิดหน้าต่าง 24 ชม. ให้ส่งข้อความตามได้ทั้งที่ Meta จะปฏิเสธ) และห้องจะขึ้น
        // "ยังไม่อ่าน" ทั้งที่ไม่ควร (AC-CR-30)
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: text.slice(0, 100),
            lastSenderRole: 'SHOP',
          },
        })

        return conversation.id
      })
    } catch (err) {
      // ส่งสำเร็จไปแล้วจริง (log บันทึก SENT ไปแล้วข้างบน) — ห้าม throw/พลิกกลับเป็น sent:false
      // แค่บันทึกว่าห้องแชทสร้างไม่สำเร็จไว้ที่ log แล้วรายงานผลตามความจริงที่ Meta เห็น
      const errorMessage = err instanceof Error ? err.message : String(err)
      await prisma.commentReplyLog.update({
        where: { id: reservedLogId },
        data: { privateErrorMessage: `ส่งสำเร็จแต่บันทึกห้องแชทไม่สำเร็จ: ${errorMessage}` },
      })
      return { sent: true, conversationId: null, messageId: sendResult.messageId }
    }

    await prisma.commentReplyLog.update({
      where: { id: reservedLogId },
      data: { conversationId },
    })

    return { sent: true, conversationId, messageId: sendResult.messageId }
  } catch (err) {
    // ห้าม throw ออกจากฟังก์ชันนี้ทุกกรณี — ผู้เรียกฝั่ง AUTO คือ after() ของ webhook route
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[comment-private-reply] unexpected error', errorMessage)
    return { sent: false, reason: 'SEND_FAILED', error: errorMessage }
  }
}

/**
 * ห้องแชทที่มีอยู่แล้วกับคนคอมเมนต์คนนี้ — ใช้เฉพาะตอนเจอ `#10900` เพื่อเสนอ "ไปที่ห้องแชท"
 * แทนที่จะบอกให้กดซ้ำ
 *
 * 🛑 เทียบ id **ตรง ๆ ทั้งสตริงภายในเพจเดียวกัน** เท่านั้น ห้าม heuristic/ห้ามแปลงค่า —
 * โดยหลักการ PSID (ที่ webhook เห็น) กับ ASID (ที่คอมเมนต์ให้มา) เป็นคนละ id space และ Meta
 * ไม่ได้สัญญาว่าแปลงกันได้ (reference_fb_psid_asid_cannot_map) บน prod บังเอิญเท่ากัน 430/469
 * ซึ่งพอใช้ได้เพราะ **โหมดล้มเหลวของการเทียบเท่าเป๊ะคือ "หาไม่เจอ" ไม่ใช่ "เจอผิดคน"** —
 * ถ้าวันหน้าพบว่าเจอผิดคนแม้แต่เคสเดียว ให้ถอดการเชื่อมนี้ออกทั้งอัน ไม่ใช่ปรับเกณฑ์
 *
 * หาไม่เจอ = คืน null ตามปกติ (จอต้องไม่พังและต้องไม่โกหกว่ามีห้องแชท)
 */
async function findExistingConversationId(
  shopChannelId: string,
  commentFromExternalId: string | null,
): Promise<string | null> {
  if (!commentFromExternalId) return null
  // relation เป็น `conversations` (พหูพจน์) เพราะ schema ยอมให้ contact เดียวมีได้หลายห้อง —
  // ในทางปฏิบัติมีใบเดียวต่อ (channel, contact) จาก unique ของ Conversation แต่ต้องเขียนตามชนิดจริง
  const contact = await prisma.externalContact.findUnique({
    where: { shopChannelId_externalUserId: { shopChannelId, externalUserId: commentFromExternalId } },
    select: { conversations: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  })
  return contact?.conversations[0]?.id ?? null
}
