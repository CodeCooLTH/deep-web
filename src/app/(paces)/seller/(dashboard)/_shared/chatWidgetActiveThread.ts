/**
 * chatWidgetActiveThread — module-level singleton (feat 00011 Deep Chat, ChatWidget task, OQ2)
 *
 * ทำไม module-level แทน React Context: SellerChatWidget กับ ChatToastListener mount เป็น
 * sibling ตรงที่ layout.tsx (RSC — mount ผ่านองค์ประกอบธรรมดา ไม่ได้ครอบด้วย client provider
 * ร่วมกัน) จะเพิ่ม Context ต้องเพิ่ม client wrapper ใหม่ครอบทั้งคู่ (ต้นทุนสูงเกินความจำเป็น)
 * ค่านี้อ่านแค่ตอน broadcast event มาถึง (ไม่ reactive, ไม่ต้อง re-render จาก state เปลี่ยน)
 * โมดูล singleton ในบันเดิล client เดียวกันจึงพอ (เหมือน getSupabaseBrowserClient เก็บ instance)
 *
 * ใช้คู่กับ pathname check เดิมใน ChatToastListener.tsx (dedup 2 ชั้น: pathname ตรง /inbox/{id}
 * มาก่อน — ครอบกรณี full-page; ตัวนี้ครอบกรณี widget panel เปิด thread เดียวกันอยู่ ไม่ว่าจะอยู่
 * page ไหนก็ตาม เช่น seller เปิด panel คุยอยู่ที่หน้า /dashboard)
 */

let activeConversationId: string | null = null

/** SellerChatWidget เรียกตอน panel เปิด/ปิด thread ใด ๆ */
export function setChatWidgetActiveConversationId(id: string | null) {
  activeConversationId = id
}

/** ChatToastListener อ่านค่าล่าสุดตอน broadcast event มาถึง */
export function getChatWidgetActiveConversationId(): string | null {
  return activeConversationId
}
