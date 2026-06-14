import { describe, it, expect } from 'vitest'
import { getTierDisplay, getTrustLevel } from './trust-score.service'

// ยึด SSOT docs/10 - Business Rules/Tier Lists.md — กัน tier mapping drift
describe('getTierDisplay (SSOT Tier Lists)', () => {
  const cases: [number, string, string, number][] = [
    [100, 'A+', 'Deep Star', 5],
    [95, 'A+', 'Deep Star', 5],
    [89, 'A', 'Deep Diamond', 4],
    [80, 'A', 'Deep Diamond', 4],
    [79, 'B+', 'Deep Gold', 3],
    [70, 'B+', 'Deep Gold', 3],
    [69, 'B', 'Deep Silver', 2],
    [60, 'B', 'Deep Silver', 2],
    [59, 'C', 'Deep Classic', 1],
    [40, 'C', 'Deep Classic', 1],
    [39, 'D', 'Deep Classic', 0],
    [0, 'D', 'Deep Classic', 0],
  ]
  it.each(cases)('score %i → %s / %s / %i dots', (score, letter, tier, dots) => {
    const t = getTierDisplay(score)
    expect(t.letter).toBe(letter)
    expect(t.tier).toBe(tier)
    expect(t.dots).toBe(dots)
  })

  it('letter boundaries', () => {
    expect(getTrustLevel(40)).toBe('C')
    expect(getTrustLevel(39)).toBe('D')
    expect(getTrustLevel(90)).toBe('A+')
  })
})
