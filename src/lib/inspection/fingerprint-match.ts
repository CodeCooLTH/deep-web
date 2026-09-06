// fingerprint-match.ts — กติกา "ใครก็อปใคร" (feature 00060 · OQ-13)
//
// แยกออกมาจาก service เพราะนี่คือ **ตรรกะที่ตัดสินว่าจะกล่าวหาร้านไหน** ซึ่งต้องมีที่ให้เทสจับ
// (docs/conventions/ui-boolean-needs-a-testable-home.md — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
//  แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม")

export type OwnFingerprint = {
  fileId: string
  sha256: string | null
  /** เวลาที่ห้อง **ของเรา** ประกาศรูปนี้ (= Room.createdAt) */
  firstListedAt: Date
}

export type ForeignFingerprint = {
  sha256: string | null
  /** เวลาที่ห้อง **ของร้านอื่น** ประกาศรูปเดียวกัน */
  firstListedAt: Date
}

/**
 * นับรูปของห้องหนึ่งที่ "ก็อปมาจากร้านอื่น"
 *
 * 🛑 เงื่อนไขคือ **ร้านอื่นประกาศก่อนเราจริง ๆ** (`<` ไม่ใช่ `<=` และไม่ใช่แค่ "มีร้านอื่นถืออยู่")
 *    - ใช้ "มีร้านอื่นถืออยู่" เฉย ๆ ⇒ เหยื่อที่ถูกก็อปตกเป็น "ไม่ผ่าน" พร้อมคนก็อป
 *    - ใช้ `<=` ⇒ เวลาที่เท่ากันเป๊ะ (นำเข้าชุดเดียวกัน/เวลาเดียวกัน) จะตัดสินว่าเราเป็นคนก็อป
 *      ทั้งที่บอกไม่ได้ว่าใครก่อน — เดาผิดข้างนี้แปลว่ากล่าวหาร้านที่ไม่ได้ทำ
 */
export function countCopiedImages(input: {
  imageFileIds: readonly string[]
  own: readonly OwnFingerprint[]
  foreign: readonly ForeignFingerprint[]
}): { hashedImageCount: number; copiedFromOtherShopCount: number } {
  const byFileId = new Map(input.own.map((o) => [o.fileId, o]))
  let hashedImageCount = 0
  let copiedFromOtherShopCount = 0

  for (const fileId of input.imageFileIds) {
    const mine = byFileId.get(fileId)
    if (mine === undefined || mine.sha256 === null) continue
    hashedImageCount += 1
    const copied = input.foreign.some(
      (o) => o.sha256 === mine.sha256 && o.firstListedAt < mine.firstListedAt,
    )
    if (copied) copiedFromOtherShopCount += 1
  }

  return { hashedImageCount, copiedFromOtherShopCount }
}
