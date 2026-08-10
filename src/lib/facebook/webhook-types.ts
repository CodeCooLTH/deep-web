import * as v from 'valibot'

// Schema ของ payload ที่ Meta ยิงเข้า webhook (feature 00018)
// ห้ามเชื่อ shape จาก Meta ตรง ๆ — parse ก่อนใช้เสมอ ฟิลด์ที่เราไม่ใช้ปล่อยผ่านได้
// (Valibot object ตัดฟิลด์เกินทิ้งอยู่แล้ว) แต่ฟิลด์ที่ใช้ต้องมีจริง

// payload ของ attachment — parse field ให้ครบ (feature 00018, user 2026-07-25 "รองรับทุกอัน")
// เดิม parse แค่ url/title → Valibot ตัด field เกินทิ้ง ทำให้ template_type/text/elements/coordinates
// ของ order/payment/location หายตั้งแต่ parse layer → ตกไป placeholder ทั้งที่เนื้อหามากับ webhook แล้ว
const AttachmentPayloadSchema = v.object({
  url: v.optional(v.string()),
  title: v.optional(v.string()),
  // template (order/payment/receipt/generic/button) — echo ฝั่งร้านจากเครื่องมือ order/payment
  template_type: v.optional(v.string()), // "button"|"generic"|"receipt"|"media"|"product"|...
  text: v.optional(v.string()), // button template: ข้อความสรุป เช่น "You requested ฿590..."
  order_number: v.optional(v.string()), // receipt
  currency: v.optional(v.string()),
  summary: v.optional(
    v.object({
      subtotal: v.optional(v.number()),
      shipping_cost: v.optional(v.number()),
      total_tax: v.optional(v.number()),
      total_cost: v.optional(v.number()),
    }),
  ),
  elements: v.optional(
    v.array(
      v.object({
        title: v.optional(v.string()),
        subtitle: v.optional(v.string()),
        quantity: v.optional(v.number()),
        price: v.optional(v.number()),
        currency: v.optional(v.string()),
        image_url: v.optional(v.string()),
        // buttons: ต้องประกาศถึงจะรอดมาถึง service — Valibot ตัดฟิลด์ที่ไม่ประกาศทิ้งทุกครั้ง
        // ใช้เป็นหลักฐานว่า element นี้เป็น "การ์ดจริง" (ดู isRealCard ใน channel-chat.service)
        // ไม่ได้เอา title ของปุ่มไปแสดง — เรากดแทนลูกค้าไม่ได้ (ดู E3.2 ของ EXTENSIONS-2026-08-07)
        buttons: v.optional(
          v.array(
            v.object({
              title: v.optional(v.string()),
              url: v.optional(v.string()),
              type: v.optional(v.string()),
            }),
          ),
        ),
      }),
    ),
  ),
  // location: พิกัดมากับ webhook ตรง ๆ (ไม่ต้อง Graph fetch)
  coordinates: v.optional(v.object({ lat: v.number(), long: v.number() })),
  sticker_id: v.optional(v.number()),
})

const AttachmentSchema = v.object({
  // "image"|"sticker"|"video"|"reel"|"ig_reel"|"audio"|"file"|"fallback"|"post"|"ig_post"|
  // "template"|"appointment_booking"|"location"|"story_mention"|... (Meta attachment types เต็มชุด)
  //
  // สำคัญ: optional ตั้งแต่ 2026-08-04: **ห้ามบังคับ** — user ส่งรูป 6 ใบเข้ามาแล้วหายทั้งก้อน
  // (ไม่มีแถว source:"webhook" เลย ไปเจอทีหลังจาก graph-backfill ที่ชนิดเป็น "unknown" ทั้ง 6 ชิ้น)
  // เพราะ Meta ส่ง attachment ที่ไม่มี field `type` มา แล้ว Valibot ตี **ทั้ง event** ตกตั้งแต่ parse
  // = ข้อความหายเงียบ ๆ ซึ่งแย่กว่าการได้ field ไม่ครบ
  // บทเรียนเดียวกับที่เขียนไว้เองข้างล่างกลับด้าน: "field ที่ไม่ประกาศ = หายก่อนถึง service" →
  // "field ที่ประกาศเป็นบังคับทั้งที่ Meta ไม่ส่งเสมอ = ทำให้ event หายทั้งก้อน"
  // ตัวตัดสินว่าเป็นสื่อจึงต้องเป็น `payload.url` ไม่ใช่ `type` (ดู channel-chat.service)
  type: v.optional(v.string()),
  payload: v.optional(AttachmentPayloadSchema),
})

// referral (feature 00018 Phase 2) — ลูกค้าทักมาจากโฆษณา/ลิงก์ (มาได้ 2 ทาง: top-level event.referral
// หรือ message.referral ของข้อความแรก). ads_context_data.ad_title = ชื่อโฆษณาที่คลิกมา
//
// E5 (2026-07-26): parse ads_context_data ให้ครบทุก field ที่ Meta ส่งมา — เดิมรับแค่ ad_title
// ทำให้ photo_url (รูปโฆษณาที่แบนเนอร์ต้องใช้) ถูก Valibot ตัดทิ้งตั้งแต่ parse layer
// บทเรียนเดียวกับ AttachmentPayloadSchema ด้านบน: field ที่ไม่ประกาศ = หายก่อนถึง service
const ReferralSchema = v.object({
  ref: v.optional(v.string()),
  source: v.optional(v.string()), // "ADS" | "SHORTLINK"
  type: v.optional(v.string()),
  ad_id: v.optional(v.string()),
  ads_context_data: v.optional(
    v.object({
      ad_title: v.optional(v.string()),
      photo_url: v.optional(v.string()), // รูปจากโฆษณาที่ลูกค้าสนใจ — mirror เข้า storage เรา
      video_url: v.optional(v.string()), // thumbnail ของโฆษณาวิดีโอ
      post_id: v.optional(v.string()),
      product_id: v.optional(v.string()), // dynamic ads
      flow_id: v.optional(v.string()), // welcome message flow ของ partner app
    }),
  ),
})

export type Referral = v.InferOutput<typeof ReferralSchema>

// reaction (feature 00018 Phase 2, message_reactions) — react/unreact บนข้อความ mid
const ReactionSchema = v.object({
  reaction: v.optional(v.string()), // "like"|"love"|"smile"|... (semantic ของ Meta)
  emoji: v.optional(v.string()), // emoji จริงที่ลูกค้ากด (Unicode)
  action: v.string(), // "react" | "unreact"
  mid: v.string(), // ข้อความที่ถูก react
})

const MessageSchema = v.object({
  mid: v.string(),
  text: v.optional(v.string()),
  // is_echo = ข้อความที่ "ฝั่งเพจ" ส่ง — เกิดเมื่อ seller ตอบจากแอป Messenger โดยตรง
  // หรือเป็น echo ของข้อความที่ระบบเราส่งออกไปเอง
  is_echo: v.optional(v.boolean()),
  attachments: v.optional(v.array(AttachmentSchema)),
  referral: v.optional(ReferralSchema), // ลูกค้าคลิกโฆษณาแล้วทักในข้อความแรก
  // feature 00018 Phase 3 — reply/unsend
  reply_to: v.optional(v.object({ mid: v.optional(v.string()) })), // ตอบทับข้อความ mid นี้
  is_deleted: v.optional(v.boolean()), // ผู้ส่ง unsend ข้อความ (mid = ข้อความที่ถูกลบ)
})

const MessagingEventSchema = v.object({
  sender: v.object({ id: v.string() }),
  recipient: v.object({ id: v.string() }),
  timestamp: v.optional(v.number()),
  message: v.optional(MessageSchema),
  // read: event ที่ลูกค้าอ่านข้อความของเพจ (message_reads) — watermark = อ่านถึง timestamp นี้
  // feature 00018 read receipt. sender = ลูกค้า (คนอ่าน), recipient = เพจ
  read: v.optional(v.object({ watermark: v.number() })),
  // delivery: event ที่ข้อความของเพจ "ถึงเครื่องลูกค้า" (message_deliveries, 2026-08-05)
  // watermark = ข้อความที่ส่งก่อน timestamp นี้ถึงปลายทางหมดแล้ว — โมเดลเดียวกับ read ข้างบน
  //
  // ทุก field optional ตาม docs/conventions/external-payload-schema.md: เอกสาร Meta ระบุว่า `mids`
  // ไม่ได้ติดมาทุกครั้ง (ส่งมาเฉพาะบางกรณี) ถ้าประกาศเป็นบังคับ Valibot จะตี event ตกทั้งก้อน
  // แล้วสถานะ "ได้รับแล้ว" จะไม่มีวันขึ้นเลยโดยไม่มี error ให้เห็น
  //
  // เราใช้แค่ watermark — ไม่ใช้ mids เพราะ watermark ครอบข้อความก่อนหน้าให้หมดในตัวอยู่แล้ว
  // (ประกาศ mids ไว้เพื่อให้ schema ตรงกับของจริง ไม่ได้อ่านค่า)
  delivery: v.optional(
    v.object({
      mids: v.optional(v.array(v.string())),
      watermark: v.optional(v.number()),
    }),
  ),
  // reaction (message_reactions) + referral (messaging_referrals) — feature 00018 Phase 2
  reaction: v.optional(ReactionSchema),
  referral: v.optional(ReferralSchema),
  // message_edits (เปิด field ที่ระดับแอป 2026-08-03) — ลูกค้าแก้ข้อความที่ส่งไปแล้ว
  // โครงตามเอกสาร Meta: { mid, text, num_edit } โดย num_edit เอกสารเขียนเป็น <INT> แต่ payload
  // จริงของ Meta ส่งตัวเลขมาเป็น string ได้ (เจอ pattern นี้กับ field อื่นมาก่อน) จึงรับทั้งสองแบบ
  // ไม่งั้น Valibot ตีตกทั้ง event แล้วข้อความจะค้างเป็นเวอร์ชันก่อนแก้ตลอดไป
  message_edit: v.optional(
    v.object({
      mid: v.string(),
      text: v.optional(v.string()),
      num_edit: v.optional(v.union([v.number(), v.string()])),
    }),
  ),
  /**
   * Handover Protocol (messaging_handovers) — 2026-08-08
   *
   * 🛑 ทำไมถึงต้องมี (user report prod): ร้านเปิด Meta Business Agent ให้ AI ตอบแชท → เธรดนั้น
   * **ไม่เข้ากล่องเราเลยแม้แต่ห้องเดียว** จนกว่าคนจริงจะกด "ตอบกลับด้วยตัวเอง" ใน Business Suite
   * ตอน AI ถือสิทธิ์คุมห้อง เราเป็น secondary receiver ซึ่งต้องประกาศตัวด้วย field นี้ Meta ถึงจะ
   * ส่งของมาให้ (เราอ่านกล่อง standby เป็นตั้งแต่ 2026-08-04 แล้ว แต่ไม่เคยได้ของมาอ่าน)
   *
   * ทุก field optional ตาม external-payload-schema.md — โครงของ 3 event นี้ต่างกันเล็กน้อยและ
   * Meta ไม่ได้ส่งครบทุกครั้ง ประกาศบังคับเมื่อไหร่คือตี event ตกทั้งก้อนเงียบ ๆ เมื่อนั้น
   */
  pass_thread_control: v.optional(
    v.object({
      new_owner_app_id: v.optional(v.union([v.string(), v.number()])),
      previous_owner_app_id: v.optional(v.union([v.string(), v.number()])),
      metadata: v.optional(v.string()),
    }),
  ),
  take_thread_control: v.optional(
    v.object({
      previous_owner_app_id: v.optional(v.union([v.string(), v.number()])),
      metadata: v.optional(v.string()),
    }),
  ),
  request_thread_control: v.optional(
    v.object({
      requested_owner_app_id: v.optional(v.union([v.string(), v.number()])),
      metadata: v.optional(v.string()),
    }),
  ),
  /**
   * postback (messaging_postbacks) — ลูกค้ากดปุ่ม (Get Started/persistent menu/button template)
   * — feature 00043 (TFR-HA-03)
   *
   * ไม่ใช่ quick reply ที่ผูกมากับข้อความ (นั้นมาทาง `message.quick_reply` และยืดหน้าต่างอยู่แล้ว
   * ผ่าน `ingestInboundMessage` เพราะมี `message.mid`) — postback ล้วน ๆ ไม่มี `message` เลย เดิม
   * ตกเข้า branch `else` (ingestInboundMessage) ที่ไม่มีอะไรให้ parse แล้วกลายเป็น `IGNORED` เงียบ ๆ
   * ทำให้หน้าต่าง 24 ชม./7 วันแคบกว่าที่ Meta อนุญาตจริง
   *
   * ทุก sub-field optional ตาม external-payload-schema.md (TD-HA-03): `ingestPostbackEvent` ใช้แค่
   * `sender.id`/`event.timestamp` ที่อยู่นอก object นี้ — ไม่มี sub-field ไหนเป็นตัวตัดสินความหมาย
   * บังคับแล้ว Meta ไม่ส่งมาครบทุกครั้งจะทำให้ Valibot ตี event ทั้งก้อนตก (บั๊กคลาสเดียวกับ
   * `AttachmentSchema.type` ที่เคยทำรูป 6 ใบหายทั้งชุด)
   */
  postback: v.optional(
    v.object({
      title: v.optional(v.string()),
      payload: v.optional(v.string()),
      referral: v.optional(ReferralSchema),
    }),
  ),
})


/**
 * feed (Page topic) — คอมเมนต์/โพสต์บนหน้าเพจ (user สั่ง 2026-08-03 "อยากรับ facebook comment")
 *
 * โครงต่างจากข้อความอย่างสิ้นเชิง: มาที่ `entry.changes[]` ไม่ใช่ `entry.messaging[]`
 * — ถ้าไม่ประกาศไว้ที่นี่ event จะผ่าน Valibot แบบ "ไม่มีอะไรเลย" แล้วตกพื้นเงียบ ๆ ทั้งที่ Meta ส่งมาแล้ว
 *
 * ประกาศเฉพาะ field ที่เอกสาร Page webhook ระบุและเราจะใช้จริง ที่เหลือ Valibot ตัดทิ้งตามปกติ
 * ค่าที่เป็น optional เกือบทั้งหมดโดยตั้งใจ เพราะ verb=remove จะไม่มี message/from ติดมา
 */
const FeedChangeValueSchema = v.object({
  item: v.optional(v.string()), // "comment" | "post" | "reaction" | "share" | ...
  verb: v.optional(v.string()), // "add" | "edit" | "edited" | "remove" | "hide" | "unhide"
  comment_id: v.optional(v.string()),
  post_id: v.optional(v.string()),
  parent_id: v.optional(v.string()), // คอมเมนต์ตอบคอมเมนต์ = id ของตัวแม่
  created_time: v.optional(v.number()),
  message: v.optional(v.string()),
  photo: v.optional(v.string()),
  video: v.optional(v.string()),
  link: v.optional(v.string()),
  from: v.optional(v.object({ id: v.optional(v.string()), name: v.optional(v.string()) })),
})

const ChangeSchema = v.object({
  field: v.string(), // "feed" | "mention" | ...
  value: v.optional(FeedChangeValueSchema),
})

export type FeedChange = v.InferOutput<typeof ChangeSchema>

const EntrySchema = v.object({
  id: v.string(), // Page ID (object=page) หรือ IG Business Account ID (object=instagram)
  time: v.optional(v.number()),
  messaging: v.optional(v.array(MessagingEventSchema)),
  /**
   * standby — เหตุการณ์ของห้องที่ **แอปอื่นถือสิทธิ์คุมอยู่** (Handover Protocol)
   *
   * โครงเหมือน messaging ทุกอย่าง ต่างแค่ Meta ส่งมาคนละกล่องเพื่อบอกว่า "ตอนนี้ไม่ใช่ตาคุณ"
   * — Instagram ที่ร้านเปิดใช้ Business Suite/แอป IG อยู่ ห้องส่วนใหญ่จะถูกส่งมาทางนี้ ไม่ใช่
   * messaging (user report prod 2026-08-04: "chat ig ไม่เข้าระบบ" ทั้งที่ช่องทางเชื่อม ACTIVE
   * และ subscription ฝั่ง Meta มี messages+standby ครบ — เราอ่านแต่ messaging จึงทิ้งทั้งกล่อง)
   */
  standby: v.optional(v.array(MessagingEventSchema)),
  // changes: ช่องทางของ field ตระกูล "หน้าเพจ" (feed/mention) — คนละท่อกับ messaging
  changes: v.optional(v.array(ChangeSchema)),
})

export const WebhookBodySchema = v.object({
  object: v.string(), // "page" | "instagram"
  entry: v.array(EntrySchema),
})

export type WebhookBody = v.InferOutput<typeof WebhookBodySchema>
export type MessagingEvent = v.InferOutput<typeof MessagingEventSchema>

// แบน entry[].messaging[] ให้เป็นลิสต์เดียว พร้อมพก pageId ของ entry ติดไปด้วย
// เพื่อให้ handler ไม่ต้องวน 2 ชั้นเอง
export function extractMessagingEvents(
  body: WebhookBody,
): Array<{ object: string; pageId: string; event: MessagingEvent }> {
  const out: Array<{ object: string; pageId: string; event: MessagingEvent }> = []
  for (const entry of body.entry) {
    for (const event of entry.messaging ?? []) {
      out.push({ object: body.object, pageId: entry.id, event })
    }
  }
  return out
}

/**
 * ดึงเฉพาะ change ของ field `feed` ออกมาพร้อม pageId — คู่กับ extractMessagingEvents
 * (คนละท่อกัน จึงแยกฟังก์ชัน ไม่ยัดรวมให้ caller ต้องมาแยกเองทีหลัง)
 */
export function extractFeedChanges(
  body: WebhookBody,
): Array<{ pageId: string; change: FeedChange }> {
  const out: Array<{ pageId: string; change: FeedChange }> = []
  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'feed') out.push({ pageId: entry.id, change })
    }
  }
  return out
}

/**
 * เหมือน extractMessagingEvents แต่แนบ **event ดิบก่อน parse** มาด้วย (user สั่ง 2026-08-03
 * "rawMessage ผมอยากได้ rawMessage ดิบ ๆ")
 *
 * ทำไมต้องมี: Valibot ตัด field ที่เราไม่ได้ประกาศทิ้งทั้งหมด สิ่งที่เก็บลง `ChatMessage.rawMessage`
 * ตลอดมาจึงเป็น payload **หลัง** parse — field แปลกหน้าที่ Meta ส่งมา (ซึ่งคือสิ่งเดียวที่มีค่า
 * ตอนสืบว่า "ทำไม event ชนิดใหม่ไม่ทำงาน") หายไปตั้งแต่ก่อนถึงฐาน. พบวันนี้ตอนไล่ message_edits:
 * เปิดแถวจริงมาดูแล้วเจอแค่ `{sender, message:{mid}, recipient, timestamp}` ซึ่งไม่ได้แปลว่า
 * Meta ส่งมาเท่านั้น — แปลว่าเราเก็บไว้เท่านั้น
 *
 * จับคู่ด้วย "ตำแหน่ง" (entry index + messaging index) เพราะ parse ไม่ได้สลับลำดับ และไม่มี key
 * ที่ใช้ join ได้ทุกชนิด event (บาง event ไม่มี mid). ถ้าโครงไม่ตรง (จำนวนไม่เท่า) คืน undefined
 * แล้วให้ caller ตกกลับไปใช้ event ที่ parse แล้ว — ดีกว่าจับคู่ผิดตัว
 */
export function extractMessagingEventsWithRaw(
  body: WebhookBody,
  rawBody: unknown,
): Array<{ object: string; pageId: string; event: MessagingEvent; rawEvent?: unknown; standby?: boolean }> {
  const rawEntries = (rawBody as { entry?: Array<{ messaging?: unknown[]; standby?: unknown[] }> } | null)
    ?.entry
  const out: Array<{
    object: string
    pageId: string
    event: MessagingEvent
    rawEvent?: unknown
    /** มาจากกล่อง standby = ห้องนี้แอปอื่นถือสิทธิ์คุมอยู่ (อ่านได้ แต่ยังตอบไม่ได้) */
    standby?: boolean
  }> = []
  body.entry.forEach((entry, ei) => {
    // messaging กับ standby โครงเหมือนกันเป๊ะ ต่างแค่กล่อง — วนด้วยลูปเดียวกัน แล้วติดธงไว้ให้ caller
    const boxes: Array<{ parsed: MessagingEvent[]; raw: unknown[] | null; standby: boolean }> = [
      {
        parsed: entry.messaging ?? [],
        raw: Array.isArray(rawEntries?.[ei]?.messaging) ? rawEntries![ei]!.messaging! : null,
        standby: false,
      },
      {
        parsed: entry.standby ?? [],
        raw: Array.isArray(rawEntries?.[ei]?.standby) ? rawEntries![ei]!.standby! : null,
        standby: true,
      },
    ]
    for (const box of boxes) {
      const aligned = box.raw?.length === box.parsed.length
      box.parsed.forEach((event, mi) => {
        out.push({
          object: body.object,
          pageId: entry.id,
          event,
          rawEvent: aligned ? box.raw![mi] : undefined,
          standby: box.standby || undefined,
        })
      })
    }
  })
  return out
}
