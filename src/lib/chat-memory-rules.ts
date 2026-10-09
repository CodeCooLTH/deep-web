// stub ของ G0 (contract freeze) — เนื้อจริงมาใน T3 (pure ไม่มี server-only)

export function normalizeMemoryText(raw: string): string {
  void raw
  throw new Error('NOT_IMPLEMENTED')
}

export function canUseProducts(i: { productCount: number; interestedCount: number }): boolean {
  void i
  throw new Error('NOT_IMPLEMENTED')
}

export function baseHasPii(base: string): boolean {
  void base
  throw new Error('NOT_IMPLEMENTED')
}

export function validateAiMemory(
  out: string,
  base: string,
): { ok: true; text: string } | { ok: false; outcome: 'REJECTED_PII' | 'REJECTED_FORMAT' | 'REJECTED_SHRINK' } {
  void out, base
  throw new Error('NOT_IMPLEMENTED')
}

export function shouldAttemptMemoryUpdate(i: {
  newMessageCount: number
  totalMessages: number
  buyerMessages: number
  hasText: boolean
  msSinceLastAiRun: number | null
  force: boolean
}): { ok: true } | { ok: false; outcome: 'SKIPPED_FEW_MESSAGES' | 'SKIPPED_COOLDOWN' } {
  void i
  throw new Error('NOT_IMPLEMENTED')
}
