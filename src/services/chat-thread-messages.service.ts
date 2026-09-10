import { isStickerRawMessage } from '@/lib/chat-sticker'
import { LATEST_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { prisma } from '@/lib/prisma'
import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'
import { getMessages } from '@/services/chat.service'
import { getProductsByIds } from '@/services/product.service'

/**
 * getThreadMessagesPage — "ข้อความหนึ่งหน้าของเธรด พร้อมตกแต่งครบ" สำหรับ **ทั้ง 2 ทางเข้า**
 *
 * 🛑 ทำไมต้องมี (2026-09-10): เดิมโค้ดชุดนี้ (~360 บรรทัด) อยู่ใน GET route ที่เดียว ⇒ หน้าเธรด
 * (RSC) ส่งข้อความชุดแรกไปกับ HTML ไม่ได้เลย ต้องรอ `ChatThread` mount แล้วค่อยยิง fetch เอง
 * ⇒ **เปิดห้อง 1 ครั้ง = ไป-กลับเซิร์ฟเวอร์ 2 รอบเรียงกัน** และผู้ใช้เห็นสเกเลตัน 2 ช่วงซ้อน
 * (user 2026-09-10: "มันยังเห็น loading ครับ ไม่อยากให้โหลด")
 *
 * 🛑 ห้ามก็อปตรรกะตกแต่งไปเขียนซ้ำที่หน้า RSC เด็ดขาด (HR16) — การ์ดสินค้า/ออเดอร์ · สติกเกอร์ ·
 * ไฟล์แนบ · ข้อความที่ถูกตอบกลับ ต้องประกอบด้วยกฎชุดเดียวกันทั้งชุดแรกและชุดที่ poll มาทีหลัง
 * ไม่งั้นข้อความใบเดียวกันจะหน้าตาเปลี่ยนหลังผ่านไป 6 วินาที ซึ่งเป็นบั๊กที่เห็นยากมาก
 *
 * ย้ายมาแบบ **กลไกล้วน ไม่แก้ตรรกะสักบรรทัด** — ต่างจากเดิมแค่ 4 ชื่อที่เคยเป็นตัวแปรนอกขอบเขต
 * (`id`→`conversationId` · `parsed.output.*`→พารามิเตอร์ · `timer.mark`→`mark` ที่ใส่หรือไม่ใส่ก็ได้)
 */

/**
 * `quotable` — ข้อความใบนี้มี `quoteToken` ให้ "ตอบกลับแบบอ้างถึง" ได้ไหม
 *
 * ย้ายมาจาก route 2026-09-10 ตอนยกโค้ดตกแต่งข้อความออกมา — มีผู้ใช้ 2 ทาง (หน้าเธรดชุดแรก และ
 * `withSender` ตอน POST) จึงต้องอยู่ที่เดียว ห้ามก็อป (HR16)
 *
 * ตั้งชื่อกลาง ๆ ว่า quotable ไม่ใช่ lineQuotable โดยตั้งใจ — Meta มีช่องโหว่ชนิดเดียวกัน (ปฏิเสธ
 * reply_to แล้ว retry แบบไม่ quote เงียบ ๆ) แต่ payload ของ Meta ไม่มี quoteToken จึงได้ false เสมอ
 */
export function isQuotable(rawMessage: unknown): boolean {
  const raw = rawMessage as { payload?: { quoteToken?: unknown } } | null | undefined
  const token = raw?.payload?.quoteToken
  return typeof token === 'string' && token.length > 0
}

export async function getThreadMessagesPage(params: {
  conversationId: string
  userId: string
  cursor?: string
  take?: number
  /** ตัวจับเวลาของผู้เรียก (route มี Server-Timing, หน้า RSC ไม่มี) — ไม่ส่งมาก็ได้ */
  mark?: (label: string, detail?: string) => void
}) {
  const { conversationId, userId, cursor, take } = params
  const mark = params.mark ?? (() => {})

    const result = await getMessages(conversationId, userId, {
      cursor: cursor,
      take: take,
    });
    mark("msgs", `n=${result.items.length}`);

    // extension #1 Chat Product Context Card (S-18) — enrich ข้อความ type='PRODUCT' ด้วย productCard
    // (additive เท่านั้น ไม่แตะ ChatMessageView core); batch fetch กัน N+1
    // ต้องเก็บทั้ง 2 คอลัมน์: `productRefId` (การ์ดใบเดียว ของเดิม) และ `productRefIds` (หลายใบ
    // ส่วนขยาย 2026-08-11) — ตกอันใดอันหนึ่ง = การ์ดกลุ่มนั้นขึ้นเป็นบับเบิลเปล่าโดยไม่มีอะไรฟ้อง
    const productIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.type === "PRODUCT")
          .flatMap((m) => {
            const many = (m as { productRefIds?: string[] }).productRefIds ?? [];
            return many.length > 0 ? many : m.productRefId ? [m.productRefId] : [];
          }),
      ),
    );
    const products = productIds.length > 0 ? await getProductsByIds(productIds) : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    // การ์ดออเดอร์/ใบเสนอราคาในแชท (user 2026-07-24) — enrich ข้อความ type='ORDER' ด้วย orderCard
    // (additive เหมือน productCard). token ถูก verify ตอนส่งแล้วว่าเป็นของร้านในเธรดนี้ (sendMessage
    // ORDER guard) จึง live-join ตาม token ได้ตรง ๆ; ลบ order จริง → ไม่พบใน map = null (แสดง empty)
    const orderTokens = Array.from(
      new Set(result.items.filter((m) => m.type === "ORDER" && m.orderRefToken).map((m) => m.orderRefToken as string)),
    );
    const orderRows = orderTokens.length > 0
      ? await prisma.order.findMany({
          where: { publicToken: { in: orderTokens } },
          // user 2026-07-25: การ์ดต้องมีรายการสินค้าข้างใน (ชื่อ/จำนวน/ราคา/รูป) + จำนวนรวม + ยอดสุทธิ
          // Order Progress (2026-08-05): เพิ่ม fulfillmentMode + shipment ให้การ์ดในเธรดแสดง
          // timeline พัสดุได้เหมือนการ์ดใน right panel (เดิม orderMap ไม่เคยมี shipment เลย)
          select: {
            publicToken: true,
            orderNo: true,
            status: true,
            fulfillmentMode: true,
            totalAmount: true,
            updatedAt: true,
            paymentMethod: true,
            codReceivedAt: true,
            // นัดหมาย (feature 00024) — ขาด 4 ค่านี้แล้วการ์ดจะตกไปสาขา NO_SHIPPING ของ
            // OrderCardView แล้วขึ้นแค่ "สถานะ: <ชิปกว้าง ๆ>" แทนวันนัด/มัดจำ โดยไม่มีอะไรฟ้อง
            // (ทุก prop เป็น optional — tsc/build เขียวหมด) การ์ดใน right panel ส่งมาตั้งแต่
            // 2026-08-08 แล้ว การ์ดในเธรดเพิ่งตามมา 2026-08-12 หลัง user เจอบน prod
            serviceStart: true,
            serviceEnd: true,
            appointmentStatus: true,
            depositAmount: true,
            // ผันคำของการ์ดตามประเภทกิจการ — อ่านจากร้าน ณ ปัจจุบัน ไม่ใช่ธงบนแถวออเดอร์
            shop: { select: { vertical: true } },
            items: {
              select: { name: true, qty: true, price: true, product: { select: { images: true } } },
            },
            shipments: {
              where: LATEST_FORWARD_SHIPMENT,
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                trackingNo: true, courierName: true, courierCode: true, status: true, carrierStatus: true,
                // แถวที่ 2 ของ stepper ในการ์ดแชท ("ขากลับ")
                returnStartedAt: true, returnedAt: true,
              },
            },
          },
        })
      : [];
    const orderMap = new Map(
      orderRows.map((o) => [
        o.publicToken,
        {
          token: o.publicToken,
          orderNo: o.orderNo, // เลขคำสั่งซื้อ DP… (user 2026-07-25)
          status: o.status,
          fulfillmentMode: o.fulfillmentMode,
          totalAmount: o.totalAmount.toFixed(2),
          statusAt: o.updatedAt.toISOString(),
          paymentMethod: o.paymentMethod,
          codReceivedAt: o.codReceivedAt ? o.codReceivedAt.toISOString() : null,
          vertical: o.shop.vertical,
          serviceStart: o.serviceStart ? o.serviceStart.toISOString() : null,
          serviceEnd: o.serviceEnd ? o.serviceEnd.toISOString() : null,
          appointmentStatus: o.appointmentStatus,
          depositAmount: o.depositAmount ? o.depositAmount.toFixed(2) : null,
          items: o.items.map((it) => ({
            name: it.name,
            qty: it.qty,
            price: it.price.toFixed(2),
            // Product.images = Json (array of fileId) → cast; custom line (productId null) = null
            imageFileId: (it.product?.images as string[] | undefined)?.[0] ?? null,
          })),
          shipment: o.shipments[0]
            ? {
                trackingNo: o.shipments[0].trackingNo,
                courierName: o.shipments[0].courierName,
                courierCode: o.shipments[0].courierCode,
                status: o.shipments[0].status,
                carrierStatus: o.shipments[0].carrierStatus,
                // แถวที่ 2 ของ stepper ("ขากลับ") — Date ข้ามเส้นมาเป็น JSON ไม่ได้
                returnStartedAt: o.shipments[0].returnStartedAt?.toISOString() ?? null,
                returnedAt: o.shipments[0].returnedAt?.toISOString() ?? null,
              }
            : null,
        },
      ]),
    );

    // reply quote (feature 00018 Phase 3) — ดึง body/ผู้ส่งของข้อความที่ถูกตอบทับมาแสดง quote.
    // replyToMid: ช่องทางนอก = externalMessageId (Meta mid); DEEP = conversationId ภายใน (ไม่มี mid) → match ทั้งคู่.
    // batch fetch กัน N+1, scope conversationId เดียวกัน
    const replyMids = Array.from(
      new Set(
        result.items
          .map((m) => (m as { replyToMid?: string | null }).replyToMid)
          .filter((x): x is string => !!x),
      ),
    );
    const repliedRows =
      replyMids.length > 0
        ? await prisma.chatMessage.findMany({
            where: {
              conversationId: conversationId,
              OR: [{ externalMessageId: { in: replyMids } }, { id: { in: replyMids } }],
            },
            // rawMessage: ต้องอ่านมาด้วยเพื่อคำนวณ quotable ของ "ข้อความที่ถูกอ้างถึง" (isQuotable ด้านบน)
            // imageUrl: fileId ของสื่อ — ใช้วาดรูปย่อใน quote (ดู entry.imageUrl ด้านล่าง)
            select: {
              id: true,
              externalMessageId: true,
              body: true,
              type: true,
              senderRole: true,
              rawMessage: true,
              imageUrl: true,
            },
          })
        : [];
    const repliedMap = new Map<
      string,
      {
        /**
         * conversationId ภายในของข้อความที่ถูกอ้างถึง — UI ใช้เป็นจุดหมายของ "แตะ quote แล้วเลื่อนไปหา"
         * (`[data-message-conversationId]` ในเธรด). ต้องเป็น conversationId ไม่ใช่ externalMessageId เพราะฝั่ง DEEP
         * ไม่มี mid เลย และ DOM ผูกกับ conversationId เสมอทุกช่องทาง
         */
        id: string;
        body: string | null;
        senderRole: "BUYER" | "SHOP";
        quotable: boolean;
        /**
         * fileId ของรูปที่ถูกอ้างถึง (null เมื่อไม่ใช่ข้อความรูป) — ให้ UI วาดรูปย่อแทนคำว่า
         * "[รูปภาพ]" ซึ่งบอกไม่ได้ว่าหมายถึงรูปใบไหนในเธรดที่มีรูปติดกันหลายใบ
         * (user report 2026-08-11 เทียบกับ Messenger ที่แสดงรูปย่อ)
         */
        imageUrl: string | null;
      }
    >();
    for (const r of repliedRows) {
      // ข้อความสื่อ/การ์ด (body=null) → แสดง label แทนช่องว่างใน quote
      const label =
        r.body ??
        ({
          IMAGE: "[รูปภาพ]",
          VIDEO: "[วิดีโอ]",
          AUDIO: "[ข้อความเสียง]",
          FILE: "[ไฟล์แนบ]",
          ORDER: "[คำสั่งซื้อ]",
          PRODUCT: "[สินค้า]",
        }[r.type] ?? null);
      const entry = {
        id: r.id,
        body: label,
        senderRole: r.senderRole as "BUYER" | "SHOP",
        quotable: isQuotable(r.rawMessage),
        // เฉพาะ IMAGE — VIDEO/FILE ไม่มีภาพนิ่งให้ย่อ (ยังใช้ label เดิม) ส่วน imageUrl ของชนิดอื่น
        // เป็น fileId ของไฟล์ที่เอาไปวาดเป็นรูปไม่ได้ ส่งไปก็ได้แต่กรอบรูปแตก
        imageUrl: r.type === "IMAGE" ? r.imageUrl : null,
      };
      if (r.externalMessageId) repliedMap.set(r.externalMessageId, entry);
      repliedMap.set(r.id, entry);
    }

    /**
     * feature 00061 — enrich การ์ดผลลัพธ์ของตัวสร้างออเดอร์อัตโนมัติ
     *
     * 🛑 อ่านสถานะ/เหตุผลจากแถว `Order` **สด** ทุกครั้ง ไม่ snapshot ลง `ChatMessage` —
     * การ์ดใบเดียวต้องเปลี่ยนหน้าตาเองจาก "กำลังอ่าน" → "สร้างแล้ว/ตกร่าง" → "ถูกทิ้งแล้ว"
     * ตามที่ผู้ขายกดปุ่ม โดยไม่ต้องเขียนแถวใหม่ (stored-flag-vs-owner-truth.md)
     *
     * `autoOrderId = null` = การ์ดที่เขียนไว้ก่อนรู้ผล (สถานะ READING) — ยังไม่มีอะไรให้ join
     */
    const autoOrderIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.type === AUTO_ORDER_RESULT_TYPE)
          .map((m) => (m as { autoOrderId?: string | null }).autoOrderId)
          .filter((x): x is string => !!x),
      ),
    );
    const autoOrderRows =
      autoOrderIds.length > 0
        ? await prisma.order.findMany({
            where: { id: { in: autoOrderIds } },
            select: {
              id: true,
              publicToken: true,
              orderNo: true,
              status: true,
              totalAmount: true,
              draftReasons: true,
              draftRawItems: true,
              draftStatedTotalAmount: true,
              discount: true,
              isDryRun: true,
              supersedesOrderId: true,
              buyerContact: true,
              shippingAddress: true,
              createdAt: true,
              items: { select: { name: true, qty: true } },
              shop: { select: { vertical: true } },
            },
          })
        : [];
    const autoOrderMap = new Map(
      autoOrderRows.map((o) => [
        o.id,
        {
          token: o.publicToken,
          orderNo: o.orderNo,
          status: o.status,
          totalAmount: o.totalAmount.toFixed(2),
          draftReasons: o.draftReasons,
          /** รายการดิบของร่าง — แถว DRAFTED มี `OrderItem` = 0 แถวเสมอ (ข้อมูลอยู่คอลัมน์นี้) */
          draftRawItems: o.draftRawItems,
          draftStatedTotal: o.draftStatedTotalAmount ? o.draftStatedTotalAmount.toFixed(2) : null,
          discount: o.discount ? o.discount.toFixed(2) : null,
          isDryRun: o.isDryRun,
          supersedesOrderId: o.supersedesOrderId,
          buyerContact: o.buyerContact,
          shippingAddress: o.shippingAddress,
          vertical: o.shop.vertical,
          items: o.items.map((it) => ({ name: it.name, qty: it.qty })),
        },
      ]),
    );

    // ผู้ส่งฝั่งร้าน (user 2026-08-02) — avatar ท้ายบับเบิลต้องบอกว่า "ใครในทีมเป็นคนตอบ"
    // ไม่ใช่โลโก้เพจเหมือนกันหมด. ร้านที่มีพนักงานหลายคนย้อนดูไม่ได้เลยว่าใครตอบข้อความไหน
    //
    // senderUserId = null คือข้อความที่มาทาง webhook (echo ของสิ่งที่ส่งจาก Messenger/Business
    // Suite โดยตรง หรือบอทตอบ) — ไม่มี "คน" ให้แสดง จึงตกไปใช้รูปเพจตามเดิม
    //
    // batch fetch กัน N+1; ไม่ select อะไรเกินชื่อ+รูป (ผู้ดูเป็นสมาชิกร้านเดียวกันอยู่แล้ว
    // แต่ไม่มีเหตุผลให้ email/เบอร์ของเพื่อนร่วมทีมหลุดลง flight payload)
    const senderIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.senderRole === "SHOP" && m.senderUserId)
          .map((m) => m.senderUserId as string),
      ),
    );
    const senderRows =
      senderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: senderIds } },
            select: { id: true, displayName: true, avatar: true },
          })
        : [];
    const senderMap = new Map(
      senderRows.map((u) => [u.id, { name: u.displayName, avatar: u.avatar }]),
    );
    // 4 query ข้างบนนี้ (สินค้า/ออเดอร์/ข้อความที่ถูกอ้างถึง/ผู้ส่ง) เรียงต่อกันทีละตัว — วัดรวมไว้
    // ก่อน ถ้าเลขก้อนนี้โต ค่อยแยกวัดทีละตัวแล้วพิจารณายุบเป็น Promise.all
    mark("enrich", `p=${productIds.length},o=${orderTokens.length},r=${replyMids.length},s=${senderIds.length}`);

    const items = result.items.map((m) => ({
      ...m,
      // ลูกค้าแก้ข้อความนี้ทีหลังหรือเปล่า (message_edits, 2026-08-03) — ร่องรอยเก็บใน rawMessage.edit
      // ไม่ได้เพิ่มคอลัมน์ (ดู ingestMessageEdit); UI ใช้ขึ้นป้าย "แก้ไขแล้ว" ท้ายบับเบิล
      edited: !!(m as { rawMessage?: { edit?: unknown } | null }).rawMessage?.edit,
      /**
       * สติกเกอร์หรือรูปธรรมดา (S-7b LINE, 2026-08-10) — ร่องรอยอยู่ใน rawMessage เหมือน `edited`
       * ไม่ได้เพิ่มคอลัมน์
       *
       * ทำไมต้อง derive ที่นี่ ไม่ให้ UI เดาเอง: สติกเกอร์ถูกเก็บเป็น `type='IMAGE'` เหมือนรูปทั่วไป
       * (ดู ingestLineMessage) UI จึงเคยแยกด้วย "ขนาดจริงของรูป ≤ 240px" ซึ่งใช้ได้กับสติกเกอร์ Meta
       * (100×100) แต่ **ใช้ไม่ได้กับ LINE** เพราะ CDN ของ LINE ส่งมา 320–370px → หลุดเกณฑ์ กลายเป็น
       * "รูปที่ลูกค้าส่ง" ทั้งขนาดที่แสดงและปุ่มบันทึกรูปที่ไม่ควรมี (user เจอเองบน prod)
       * `filenamePrefix: 'line-sticker'` ที่ ingest ตั้งไว้ใช้แยกไม่ได้ เพราะ `saveFile` ตั้ง key
       * เป็น uuid ใหม่ทิ้งชื่อไฟล์เดิม — ชื่อนั้นไม่เคยไปถึง storage
       */
      isSticker: isStickerRawMessage((m as { rawMessage?: unknown }).rawMessage),
      // null = ไม่มีคนส่ง (webhook/บอท) → UI แสดงรูปเพจ; มีค่า = แสดงรูปคนนั้น + ชื่อตอน hover
      sender:
        m.senderRole === "SHOP" && m.senderUserId ? senderMap.get(m.senderUserId) ?? null : null,
      replyTo: (() => {
        const rmid = (m as { replyToMid?: string | null }).replyToMid;
        return rmid ? repliedMap.get(rmid) ?? null : null;
      })(),
      // reply/quote — ข้อความ "นี้เอง" อ้างอิงได้ไหมถ้าถูกตอบทับต่อ (composer ใช้ตัดสินก่อนกดส่ง
      // ผ่าน replyingTo.quotable — ดู isQuotable ด้านบนไฟล์นี้)
      quotable: isQuotable((m as { rawMessage?: unknown }).rawMessage),
      productCard:
        m.type === "PRODUCT" && m.productRefId && productMap.has(m.productRefId)
          ? (() => {
              const p = productMap.get(m.productRefId!)!;
              // isActive=false ยัง join ได้ (FR-CTX-08 "หยุดขายแล้ว" ตัดสินใจที่ UI); ลบจริง (ไม่พบใน map) = null
              return { id: p.id, name: p.name, price: p.price, imageFileId: p.images[0] ?? null, isActive: p.isActive };
            })()
          : null,
      /**
       * การ์ดหลายชิ้น (ส่วนขยาย 2026-08-11) — `null` เมื่อข้อความนี้เป็นการ์ดใบเดียว (ใช้ productCard เดิม)
       *
       * 🛑 คงลำดับตาม `productRefIds` ที่บันทึกไว้ ไม่ใช่ลำดับที่ query คืนมา — ลำดับใน carousel คือสิ่งที่
       * ผู้ขายตั้งใจให้ลูกค้าเห็นก่อน-หลัง และเป็นลำดับเดียวกับที่ยิงออกไปจริง
       *
       * สินค้าที่ถูกลบหลังส่ง → ไม่อยู่ใน map → คืน `null` **ในตำแหน่งเดิม** (ไม่ filter ทิ้ง) เพื่อให้ UI
       * วาด "ไม่พบสินค้านี้แล้ว" เป็นใบหนึ่งในแถว ไม่ใช่การ์ดหายไปเฉย ๆ แล้วผู้ขายนึกว่าส่งไม่ครบ
       */
      productCards:
        m.type === "PRODUCT" && ((m as { productRefIds?: string[] }).productRefIds?.length ?? 0) > 0
          ? (m as { productRefIds?: string[] }).productRefIds!.map((pid) => {
              const p = productMap.get(pid);
              return p
                ? { id: p.id, name: p.name, price: p.price, imageFileId: p.images[0] ?? null, isActive: p.isActive }
                : null;
            })
          : null,
      orderCard: m.type === "ORDER" && m.orderRefToken ? orderMap.get(m.orderRefToken) ?? null : null,
      /**
       * feature 00061 — ข้อมูลของการ์ดผลลัพธ์ · `null` = ยังอยู่สถานะ "กำลังอ่าน"
       *
       * 🛑 ข้อความชนิดนี้ถูกกรองออกจาก response แล้วสำหรับผู้เรียกฝั่งผู้ซื้อ (`getMessages`
       * ชั้นอ่าน) ⇒ ค่าตรงนี้จะไม่มีวันไปถึง client ของลูกค้า แม้จะ enrich ที่นี่ก็ตาม
       */
      autoOrderCard:
        m.type === AUTO_ORDER_RESULT_TYPE
          ? autoOrderMap.get((m as { autoOrderId?: string | null }).autoOrderId ?? "") ?? null
          : null,
    }));

    // externalReadAt — watermark "ลูกค้าอ่านถึงเวลานี้" (feature 00018 read receipt)
    // bug fix 2026-07-23 (user report: "อ่านแล้วแต่ไม่ขึ้นว่าอ่านแล้ว"): ค่านี้เดิมส่งลง UI ทาง
    // server prop ของ page.tsx เท่านั้น = อ่านครั้งเดียวตอนเปิดหน้า. read event ของ Meta มาทีหลัง
    // ทาง webhook และ **ไม่ได้ insert ChatMessage** จึงไม่ทริกเกอร์ realtime broadcast → client
    // ไม่มีทางรู้เลยจนกว่าจะรีโหลดหน้าเอง. ส่งมากับ GET นี้ด้วยเพื่อให้ refetch รอบถัดไป (realtime/
    // focus/poll) อัปเดตป้าย "ส่งแล้ว → อ่านแล้ว" ได้เอง
    // externalDeliveredAt — watermark "ข้อความของร้านถึงเครื่องลูกค้าถึงเวลานี้" (message_deliveries,
    // 2026-08-05) เดินทางคู่กับ externalReadAt ด้วยเหตุผลเดียวกันเป๊ะ: delivery event ของ Meta
    // **ไม่ได้ insert ChatMessage** จึงไม่มี realtime broadcast ให้เกาะ ต้องติดมากับ GET นี้เพื่อให้
    // ป้าย "ส่งแล้ว → ได้รับแล้ว" ขยับเองได้ใน refetch รอบถัดไป (poll 6 วิ) โดยไม่ต้องรีโหลดหน้า
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { externalReadAt: true, externalDeliveredAt: true },
    });
    mark("watermark");
  return {
    items,
    nextCursor: result.nextCursor,
    externalReadAt: conv?.externalReadAt ? conv.externalReadAt.toISOString() : null,
    externalDeliveredAt: conv?.externalDeliveredAt ? conv.externalDeliveredAt.toISOString() : null,
  }
}
