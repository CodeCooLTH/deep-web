import { prisma } from '@/lib/prisma'
import { ourMetaAppId } from '@/lib/facebook/app-id'

/**
 * ส่งข้อความฝั่งร้านบน Messenger/Instagram สำเร็จ = Meta ยอมให้แอปเราส่ง ณ เวลานั้น = ห้องไม่ได้ถูกแอปอื่น (เช่น Meta AI) ถืออยู่
 * จึงบันทึกเป็นข้อเท็จจริง "ผู้ถือห้อง = เรา" (00078 TFR-001) — สูตร `metaAiHoldingUntilMs` มีกิ่ง
 * `owner==ours && ownerAt > echoAt → ไม่ถือ` อยู่แล้ว ป้าย Meta AI จึงหายทันทีหลังระบบ/ร้านส่งได้
 *
 * ไม่เดา: `FB_CHAT_APP_ID` ไม่ตั้ง → ข้าม (ป้ายหมดเองใน 24 ชม.) · ช่องอื่นนอกจาก Meta → ข้าม
 * 🛑 ห้าม throw — เป็นงานเสริมหลังส่งถึงลูกค้าแล้ว ล้มต้องไม่ทำให้การส่งกลายเป็น error
 * `updateMany` มีเงื่อนไข observedAt เก่ากว่า → ไม่ทับข้อเท็จจริงที่ใหม่กว่า (เช่น handover จาก Meta)
 */
export async function recordOurSendAsMetaOwner(conversationId: string, channel: string, at: Date = new Date()): Promise<void> {
  if (channel !== 'MESSENGER' && channel !== 'INSTAGRAM') return
  const appId = ourMetaAppId()
  if (!appId) return
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [{ metaOwnerObservedAt: null }, { metaOwnerObservedAt: { lt: at } }],
      },
      data: { metaOwnerAppId: appId, metaOwnerObservedAt: at },
    })
  } catch (e) {
    console.error('[meta-owner-on-send] บันทึกผู้ถือห้องหลังส่งไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}
