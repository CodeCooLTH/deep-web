// 00095 SDS §7 — Error ของ service ที่ route ต้องแปลงเป็น HTTP · วางใน lib (ไม่ใช่ service) เพื่อให้ route-errors.ts import ได้โดยไม่ลาก prisma
// ทุก class ต้องมี branch ใน route-errors.ts — เทส route-errors.test.ts ไล่ export ทั้งไฟล์นี้แล้วแดงเมื่อมี class ที่ตกเป็น 500
// ตัวสร้างทุกตัวต้องเรียกได้โดยไม่มีอาร์กิวเมนต์ (เทสสร้างตัวอย่างอัตโนมัติ)
import type { ChannelConflict } from './conflicts'
import type { BotIssue } from './schemas'

export class SalesFollowBotNotFoundError extends Error {
  constructor() {
    super('SALES_FOLLOW_BOT_NOT_FOUND')
    this.name = 'SalesFollowBotNotFoundError'
  }
}

export class SalesFollowBotStaleError extends Error {
  constructor(public readonly currentUpdatedAt: Date | null = null) {
    super('SALES_FOLLOW_BOT_STALE')
    this.name = 'SalesFollowBotStaleError'
  }
}

export class SalesFollowBotChannelConflictError extends Error {
  constructor(public readonly conflicts: ChannelConflict[] = []) {
    super('SALES_FOLLOW_BOT_CHANNEL_CONFLICT')
    this.name = 'SalesFollowBotChannelConflictError'
  }
}

/** ช่องทางไม่มี/ไม่ใช่ของร้าน/เป็น DEEP — ตอบเหมือนกันทุกกรณี ไม่เปิดเผยว่ามีในร้านอื่น */
export class SalesFollowBotChannelNotFoundError extends Error {
  constructor() {
    super('SALES_FOLLOW_BOT_CHANNEL_NOT_FOUND')
    this.name = 'SalesFollowBotChannelNotFoundError'
  }
}

export class SalesFollowBotTagNotFoundError extends Error {
  constructor(public readonly names: string[] = []) {
    super('SALES_FOLLOW_BOT_TAG_NOT_FOUND')
    this.name = 'SalesFollowBotTagNotFoundError'
  }
}

export type TestRoomsErrorCode = 'TEST_ROOMS_REQUIRED' | 'TEST_ROOM_NOT_FOUND' | 'TEST_ROOMS_TOO_MANY'
export class SalesFollowBotTestRoomsError extends Error {
  constructor(public readonly code: TestRoomsErrorCode = 'TEST_ROOMS_REQUIRED') {
    super(code)
    this.name = 'SalesFollowBotTestRoomsError'
  }
}

/** ร้านไม่อยู่ในรายชื่อนำร่อง (403) หรือไม่ใช่ ONLINE_SALES (409) */
export class SalesFollowBotNotAvailableError extends Error {
  constructor(public readonly reason: 'FEATURE_NOT_ENABLED' | 'NOT_AVAILABLE_FOR_SHOP' = 'FEATURE_NOT_ENABLED') {
    super(reason)
    this.name = 'SalesFollowBotNotAvailableError'
  }
}

/** service ตรวจซ้ำหลังรวมกับบอทเดิม (PATCH) แล้วเจอ issue */
export class SalesFollowBotValidationError extends Error {
  constructor(public readonly issues: BotIssue[] = []) {
    super('SALES_FOLLOW_BOT_VALIDATION')
    this.name = 'SalesFollowBotValidationError'
  }
}
