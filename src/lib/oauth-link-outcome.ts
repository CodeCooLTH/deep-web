/**
 * oauth-link-outcome — ผลลัพธ์ของการผูกบัญชี OAuth และปลายทางบนหน้าจอ
 *
 * **โมดูลบริสุทธิ์**: ไม่แตะ prisma ไม่แตะ `NEXTAUTH_SECRET` ⇒ เทสได้ตรง ๆ และ import
 * เข้าที่ไหนก็ได้ · ตรรกะที่แตะฐานข้อมูลอยู่ที่ `services/oauth-link.service.ts`
 *
 * 🛑 แยกออกมาเพราะ `oauth-link.service` ลาก `lib/link-intent` (ซึ่ง **throw ตอน import**
 * ถ้าไม่มี `NEXTAUTH_SECRET`) เข้ามาด้วย ⇒ เทสที่อยากยืนยันแค่ "ปลายทางถูกไหม" จะรันไม่ได้
 * เลยถ้าไม่มี env — ซึ่งจะกลายเป็นข้ออ้างให้ไม่เขียนเทสของกฎที่สำคัญที่สุดข้อหนึ่ง
 */

export type OAuthProviderEnum = 'FACEBOOK' | 'LINE' | 'INSTAGRAM' | 'APPLE'

export type LinkOutcome =
  /** ผูกใหม่สำเร็จ */
  | { kind: 'linked' }
  /** ผูกอยู่แล้วกับบัญชีนี้ — เรียกซ้ำได้ไม่มีผลข้างเคียง */
  | { kind: 'already-linked' }
  /** มีเจ้าของอยู่แล้วและเป็นบัญชีที่มีตัวตนจริง — ห้ามแตะ */
  | { kind: 'taken' }
  /**
   * เจ้าของปัจจุบันเป็น "บัญชีค้าง" ที่ว่างเปล่า — ยึดคืนได้ **แต่ต้องถามผู้ใช้ก่อน**
   *
   * 🛑 ห้ามยึดให้อัตโนมัติที่นี่ — user ทักท้วงตอนออกแบบรอบแรก (2026-08-15) และเขาถูก:
   * "ข้อมูลว่างเปล่า" ตอบว่า *ความเสียหายน้อย* ไม่ได้ตอบว่า *มีสิทธิ์ทำโดยไม่ถามไหม*
   * ⇒ คืนตั๋วเซ็นชื่อให้ UI ไปถาม แล้วค่อยยิง `POST /api/account/link/reclaim`
   */
  | { kind: 'reclaimable'; ticket: string }

/**
 * ปลายทางบนหน้าจอของแต่ละผลลัพธ์ — **ที่เดียวทั้งระบบ**
 *
 * 🛑 ต้องเป็น `/account` ไม่ใช่ `/settings` — การ์ด "วิธีเข้าสู่ระบบ" ย้ายมาตั้งแต่ feature
 * 00026 (2026-08-02) และ `/settings` กลายเป็นหน้า "การจัดส่ง" ไปแล้ว · ปลายทางเก่าพาผู้ใช้
 * ไปหน้าที่ **ไม่มีใครอ่าน `?linked=` / `?link_error=`** ⇒ เชื่อมสำเร็จก็เงียบ ล้มเหลวก็เงียบ
 * (เจอจริง 2026-08-12 — กระทบ Facebook/LINE ด้วยมาตลอด)
 *
 * @param provider ชื่อตัวพิมพ์เล็กแบบที่ next-auth ใช้ (`apple`/`facebook`/…)
 */
export function linkOutcomeRedirect(provider: string, outcome: LinkOutcome): string {
  switch (outcome.kind) {
    case 'linked':
    case 'already-linked':
      return `/account?linked=${provider}`
    case 'taken':
      return '/account?link_error=taken'
    case 'reclaimable':
      return `/account?link_error=reclaimable&ticket=${encodeURIComponent(outcome.ticket)}`
  }
}
