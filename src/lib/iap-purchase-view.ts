/**
 * iap-purchase-view — หน้าแพ็กเกจต้องแสดงอะไร เมื่อเปิดจากในแอป iOS (feature 00064)
 *
 * โมดูลบริสุทธิ์: ไม่แตะ React ไม่แตะ prisma ⇒ เทสได้ทุกทางแยกโดยไม่ต้องประกอบหน้าจอจริง
 *
 * ## ทางกลางที่เลือก (user เคาะ 2026-09-08)
 *
 * ใช้ **หน้าเดียวกับเว็บ** แต่สลับ "แหล่งราคา" — ในแอปราคามาจาก StoreKit บนเว็บมาจากกระเป๋าเงิน
 *
 * ทางเลือกที่ **ไม่** เอา: แยกหน้าซื้อไปทำเป็น native ทั้งจอ · ข้อดีคือไม่ต้องแตะ `(paces)/**`
 * แต่ข้อมูล tier (ชื่อ · โควตา · สิทธิ์) จะกลายเป็นสองชุดคนละรีโปทันที และที่หนักกว่านั้นคือ
 * native ไม่รู้ว่า "บัญชี Deep นี้จ่ายผ่านเว็บอยู่แล้วหรือเปล่า" — รู้แค่ว่า Apple ID นี้ซื้ออะไรไว้
 * ⇒ ทำ TC-IAP-45 ไม่ได้เลยถ้าไม่มี endpoint ใหม่
 *
 * ## 🛑 ลำดับการตัดสินใจห้ามสลับ: สถานะบัญชี → แล้วค่อยสถานะราคา
 *
 * ถ้าเช็กราคาก่อน คนที่จ่ายผ่านกระเป๋าเงินจะตกไปอยู่จอ loading/error ซึ่ง **มีปุ่มลองใหม่**
 * กดวนไปมาแล้วมีโอกาสไปโผล่ปุ่มซื้อ — จ่ายสองทางพร้อมกัน
 */
import type { AppShell } from '@/lib/app-shell'
import { isPaymentRestricted } from '@/lib/app-shell'
import { isWalletBilled } from '@/lib/subscription-source'
import type { BusinessPackageTier } from '@/lib/business-package'
import type { IapFailure, IapProduct } from '@/lib/iap-bridge-protocol'

/** สถานะราคาจาก StoreKit — `null` = ยังถามไม่เสร็จ */
export type IapProductsState = { ok: true; products: IapProduct[] } | { ok: false; reason: IapFailure } | null

export interface AppPurchaseInput {
  shell: AppShell
  /** ใบ subscription ปัจจุบันของบัญชีนี้ — `null` = ยังไม่มี (FREE) */
  subscription: { source: string; status: string; tier: BusinessPackageTier } | null
  products: IapProductsState
}

export type AppPurchaseView =
  /** ไม่ได้อยู่ในเปลือกที่ต้องซื้อผ่าน Apple → ใช้ของเดิมทั้งหมด ห้ามแตะ */
  | { kind: 'web' }
  /** 🛑 จ่ายผ่านกระเป๋าเงินอยู่แล้ว — ห้ามมีปุ่มซื้อ (TC-IAP-45) */
  | { kind: 'wallet'; tier: BusinessPackageTier }
  /** ซื้อผ่าน Apple ไปแล้ว — เปลี่ยน tier / กู้คืน ไม่ใช่ซื้อใหม่ */
  | { kind: 'apple'; tier: BusinessPackageTier; products: IapProduct[] }
  | { kind: 'buy'; products: IapProduct[] }
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: IapFailure }

export function resolveAppPurchaseView(input: AppPurchaseInput): AppPurchaseView {
  /* เปลือกที่ไม่ได้ถูกห้ามช่องทางจ่ายเงิน = เว็บปกติ/Android → ของเดิมทั้งหมด
     ผูกกับ `isPaymentRestricted` ตัวเดียวกับที่ซ่อนปุ่มเติมเงิน เพื่อไม่ให้มีนิยาม
     "อยู่ในแอปหรือเปล่า" สองชุดที่เผลอเปลี่ยนไม่พร้อมกัน */
  if (!isPaymentRestricted(input.shell)) return { kind: 'web' }

  const sub = input.subscription
  if (sub) {
    /* 🛑 ต้องมาก่อนการเช็กราคา — ดูเหตุผลหัวไฟล์ */
    if (isWalletBilled(sub.source)) return { kind: 'wallet', tier: sub.tier }
  }

  if (input.products === null) return { kind: 'loading' }
  if (!input.products.ok) return { kind: 'unavailable', reason: input.products.reason }
  /* รายการว่าง = สินค้ายังไม่ผ่านรีวิว หรือรหัสสะกดไม่ตรงกับ App Store Connect
     (StoreKit คืนว่างเปล่าโดยไม่มี error บอก) ⇒ จอที่มีหัวข้อแต่ไม่มีอะไรให้กดดูเหมือนแอปพัง */
  if (input.products.products.length === 0) return { kind: 'unavailable', reason: 'UNAVAILABLE' }

  if (sub) return { kind: 'apple', tier: sub.tier, products: input.products.products }
  return { kind: 'buy', products: input.products.products }
}
