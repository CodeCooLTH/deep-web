/**
 * chat-product-resend — "การ์ดสินค้าชุดนี้เพิ่งถูกส่งไปแล้วหรือเปล่า" (ฟังก์ชันบริสุทธิ์)
 *
 * ที่มา 2026-08-11: เส้นทาง **DEEP** มี idempotent-guard อยู่แล้วใน `chat.service.sendMessage()`
 * (BR-CTX-02 — ข้อความล่าสุดเป็น PRODUCT + `productRefId` เดียวกัน → คืนแถวเดิม ไม่ insert ซ้ำ)
 * แต่ช่องทางนอก (LINE/Messenger/IG) วิ่งผ่าน `sendOutboundMessage` ซึ่ง **ไม่ผ่าน sendMessage**
 * ด่านนั้นจึงไม่เคยครอบเลย
 *
 * 🛑 ทำไมช่องทางนอกต้องการด่านนี้ *มากกว่า* DEEP ไม่ใช่น้อยกว่า: reply token ของ LINE ใช้ได้
 * ครั้งเดียว (`src/lib/line/reply-window.ts` — `replyTokenUsedAt`) การกดส่งครั้งแรกจะ claim token
 * ไป (ฟรี) ครั้งที่สองอีกไม่กี่วินาทีต่อมาหา token ว่างไม่เจอ จึงตกไปใช้ **push ซึ่งนับโควตา =
 * เงินร้านจริง** ดับเบิลคลิกบน DEEP เสียแค่แถวซ้ำ บน LINE เสียเงิน
 *
 * เกณฑ์ยึดตาม DEEP ให้เหมือนกัน (HR16 — "ส่งซ้ำ" ต้องมีนิยามเดียวทั้งระบบ): ดูเฉพาะข้อความที่
 * **ติดกันย้อนขึ้นไปจากล่าสุด** ถ้ามีอย่างอื่นคั่นแปลว่าเป็นการส่งใหม่จริง ๆ ไม่ใช่กดซ้ำ
 */

export type RecentProductMessage = {
  type: string
  /** id ของการ์ดสินค้าในข้อความนั้น เรียงตามลำดับที่ผู้ขายเลือก (ลำดับมีความหมายบน carousel) */
  productRefIds: string[]
  /** null = แชทในแอป · 'SENT'/'DELIVERED'/… = ออกไปถึงช่องทางแล้ว · 'FAILED' = ไม่ถึงลูกค้า */
  deliveryStatus: string | null
}

/**
 * @param recentNewestFirst ข้อความล่าสุดของบทสนทนา เรียง **ใหม่→เก่า** (ยาวอย่างน้อยเท่า batches)
 * @param batches ชุด id ที่กำลังจะส่ง แบ่งตามเพดานของช่องทางแล้ว (1 ชุด = 1 ข้อความ) เรียง เก่า→ใหม่
 * @returns true = ชุดนี้เพิ่งถูกส่งสำเร็จไปแล้วทั้งชุด **ห้ามส่งซ้ำ**
 */
export function isDuplicateProductSend(
  recentNewestFirst: RecentProductMessage[],
  batches: string[][],
): boolean {
  if (batches.length === 0) return false
  // ประวัติสั้นกว่าจำนวนข้อความที่จะส่ง = เป็นไปไม่ได้ที่จะเคยส่งครบชุดมาก่อน
  if (recentNewestFirst.length < batches.length) return false

  // ตัดเฉพาะช่วงที่ติดกันจากล่าสุด แล้วพลิกเป็น เก่า→ใหม่ ให้เทียบกับ batches ตรงตำแหน่ง
  const candidate = recentNewestFirst.slice(0, batches.length).reverse()

  return candidate.every((m, i) => {
    if (m.type !== 'PRODUCT') return false
    // 🛑 ครั้งก่อนส่งไม่ถึงลูกค้า = ยังไม่ได้ส่ง — ต้องปล่อยให้กดใหม่ได้ ไม่งั้นการ์ดที่ล้มจะส่งซ้ำ
    // ไม่ได้ตลอดไปจนกว่าจะมีข้อความอื่นมาคั่น (ด่านกันซ้ำที่บล็อกการกู้คืน แย่กว่าไม่มีด่าน)
    if (m.deliveryStatus === 'FAILED') return false
    const want = batches[i]!
    // ลำดับต้องตรงด้วย ไม่ใช่แค่ "มีของชุดเดียวกัน" — ผู้ขายสลับลำดับใหม่แล้วส่งอีกครั้ง คือเจตนา
    // ที่ต่างออกไป (ลำดับใน carousel คือสิ่งที่เขาตั้งใจให้ลูกค้าเห็นก่อน-หลัง)
    return m.productRefIds.length === want.length && m.productRefIds.every((id, j) => id === want[j])
  })
}
