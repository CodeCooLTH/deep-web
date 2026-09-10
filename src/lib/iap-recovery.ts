/**
 * iap-recovery — กู้คืนธุรกรรมที่ StoreKit ส่งกลับมาเอง (feature 00064)
 *
 * ## ปัญหาที่แก้
 *
 * ลูกค้าจ่ายเงินแล้วสิทธิ์ไม่เปิด เกิดได้ 3 ทาง: ยืนยันกับ Apple ช้ากว่าที่เว็บรอ ·
 * เน็ตหลุด/เราตอบ 5xx ตอนยืนยัน · Apple ต่ออายุตอนแอปปิดอยู่
 *
 * เดิมทางกลับมีทางเดียวคือผู้ใช้กดปุ่ม "กู้คืนการซื้อ" เอง — ซึ่ง **คนที่จ่ายเงินแล้วของไม่มา
 * จะไม่คิดว่าตัวเองต้องกดปุ่มกู้คืน เขาจะคิดว่าโดนโกง**
 *
 * ## 🛑 ทำไมส่วนที่ตัดสินใจอยู่ที่นี่ ไม่ใช่ใน component
 *
 * รีโปนี้ไม่มี jsdom ⇒ อะไรที่อยู่ใน `.tsx` เทสแตะไม่ได้เลย และตรรกะกู้คืนคือตรรกะที่
 * **พังแล้วเงียบที่สุด** ในฟีเจอร์นี้ (ไม่มีใครกดปุ่มอะไร ไม่มีใครเห็นอะไร)
 * ⇒ `docs/conventions/ui-boolean-needs-a-testable-home.md`
 */
import type { IapPurchase } from '@/lib/iap-bridge-protocol'
import { decideVerifyOutcome, type VerifyResponse } from '@/lib/iap-verify-outcome'

export interface RecoveryDeps {
  /** ยิงใบเซ็นไปให้เซิร์ฟเวอร์ตรวจ — คืนสถานะ HTTP หรือ `'NETWORK_ERROR'` */
  verify: (item: IapPurchase) => Promise<VerifyResponse>
  /** สั่ง StoreKit ปิดธุรกรรม (ยิงแล้วจบ ไม่รอคำตอบ) */
  finish: (transactionId: string) => void
}

export interface RecoveryReport {
  /** เปิดสิทธิ์สำเร็จกี่ใบ — >0 เมื่อไรถึงจะแจ้งผู้ใช้และรีเฟรชหน้า */
  granted: number
  /** ปิดทิ้งไปกี่ใบ (รวมทั้งใบที่สำเร็จและใบที่เซิร์ฟเวอร์ปฏิเสธ) */
  finished: number
}

/**
 * ยืนยันธุรกรรมที่กู้คืนมาทีละใบ
 *
 * 🛑 **ห้ามหยุดทั้งชุดเมื่อใบใดใบหนึ่งล้ม** — ผู้ใช้อาจมีทั้งใบที่ใช้ได้และใบเสียปนกัน
 * (เช่น ใบเก่าที่ผูกกับบัญชี Deep อื่นตาม BR-IAP-04) หยุดที่ใบแรกที่ล้ม = ใบที่ดีอยู่หลัง
 * ไม่มีวันได้รับการยืนยัน และมันจะวนกลับมาล้มที่เดิมทุกครั้งที่เปิดแอป
 *
 * 🛑 **ห้ามยิงพร้อมกันทั้งชุด** — ลำดับมีความหมาย (ใบต่ออายุใบหลังทับใบก่อน) และการยิง
 * ขนานกันทำให้เซิร์ฟเวอร์เห็นคำขอชนกันเองบนสิทธิ์ก้อนเดียว
 */
export async function recoverPurchases(
  items: readonly IapPurchase[],
  deps: RecoveryDeps,
): Promise<RecoveryReport> {
  let granted = 0
  let finished = 0

  for (const item of items) {
    const res = await deps.verify(item)
    const outcome = decideVerifyOutcome(res)
    if (outcome.shouldFinish) {
      deps.finish(item.transactionId)
      finished += 1
    }
    if (outcome.granted) granted += 1
  }

  return { granted, finished }
}

/**
 * ควรบอกผู้ใช้ไหม
 *
 * 🛑 **เงียบเมื่อไม่มีอะไรสำเร็จ** — ตัวนี้ทำงานเองโดยผู้ใช้ไม่ได้สั่ง การเด้ง error ใส่คนที่
 * ไม่ได้ทำอะไรผิด (และมักไม่ได้กำลังคิดเรื่องแพ็กเกจอยู่เลย) คือการรบกวนล้วน ๆ ⇒ ล้มก็เงียบ
 * แล้วปล่อยให้ StoreKit ส่งกลับมาใหม่รอบหน้า
 *
 * ส่วนตอนสำเร็จ **ต้องบอก** เพราะสิทธิ์ของเขาเพิ่งเปลี่ยนโดยที่เขาไม่ได้กดอะไร
 * ไม่บอก = จอเปลี่ยนเองโดยไม่มีคำอธิบาย
 */
export function shouldAnnounceRecovery(report: RecoveryReport): boolean {
  return report.granted > 0
}
