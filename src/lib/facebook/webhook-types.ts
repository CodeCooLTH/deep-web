import * as v from 'valibot'

// Schema ของ payload ที่ Meta ยิงเข้า webhook (feature 00018)
// ห้ามเชื่อ shape จาก Meta ตรง ๆ — parse ก่อนใช้เสมอ ฟิลด์ที่เราไม่ใช้ปล่อยผ่านได้
// (Valibot object ตัดฟิลด์เกินทิ้งอยู่แล้ว) แต่ฟิลด์ที่ใช้ต้องมีจริง

const AttachmentSchema = v.object({
  type: v.string(), // "image" | "video" | "audio" | "file" | "fallback" | ...
  payload: v.optional(v.object({ url: v.optional(v.string()) })),
})

const MessageSchema = v.object({
  mid: v.string(),
  text: v.optional(v.string()),
  // is_echo = ข้อความที่ "ฝั่งเพจ" ส่ง — เกิดเมื่อ seller ตอบจากแอป Messenger โดยตรง
  // หรือเป็น echo ของข้อความที่ระบบเราส่งออกไปเอง
  is_echo: v.optional(v.boolean()),
  attachments: v.optional(v.array(AttachmentSchema)),
})

const MessagingEventSchema = v.object({
  sender: v.object({ id: v.string() }),
  recipient: v.object({ id: v.string() }),
  timestamp: v.optional(v.number()),
  message: v.optional(MessageSchema),
  // read: event ที่ลูกค้าอ่านข้อความของเพจ (message_reads) — watermark = อ่านถึง timestamp นี้
  // feature 00018 read receipt. sender = ลูกค้า (คนอ่าน), recipient = เพจ
  read: v.optional(v.object({ watermark: v.number() })),
})

const EntrySchema = v.object({
  id: v.string(), // Page ID (object=page) หรือ IG Business Account ID (object=instagram)
  time: v.optional(v.number()),
  messaging: v.optional(v.array(MessagingEventSchema)),
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
