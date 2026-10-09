import type { OptionSelection } from '@/lib/chat-memory-types'

// stub ของ G0 (contract freeze) — เนื้อจริงมาใน T3

export function splitAttributeValues(raw: string): string[] {
  void raw
  throw new Error('NOT_IMPLEMENTED')
}

export function normalizeAttributes(raw: unknown): Record<string, string> {
  void raw
  throw new Error('NOT_IMPLEMENTED')
}

export function buildOptionLabel(
  attrs: Record<string, string>,
  selections: OptionSelection[],
): { ok: true; label: string } | { ok: false } {
  void attrs, selections
  throw new Error('NOT_IMPLEMENTED')
}
