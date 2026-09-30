import { describe, it, expect } from 'vitest'
import { getBudgetStatus } from './budgetStatus'

describe('getBudgetStatus', () => {
  it('is ok below 80%', () => {
    const s = getBudgetStatus({ spentTwd: 5000, availableTwd: 10000 })
    expect(s.level).toBe('ok')
    expect(s.usedPct).toBe(50)
    expect(s.remainingTwd).toBe(5000)
  })

  it('warns from 80%', () => {
    expect(getBudgetStatus({ spentTwd: 8000, availableTwd: 10000 }).level).toBe('warn')
  })

  it('reports the overspend and caps the bar at 100', () => {
    const s = getBudgetStatus({ spentTwd: 12500, availableTwd: 10000 })
    expect(s.level).toBe('over')
    expect(s.usedPct).toBe(125)
    expect(s.barPct).toBe(100)
    expect(s.overTwd).toBe(2500)
  })

  it('treats spending against a zero budget as over', () => {
    const s = getBudgetStatus({ spentTwd: 300, availableTwd: 0 })
    expect(s.level).toBe('over')
    expect(s.overTwd).toBe(300)
    expect(getBudgetStatus({ spentTwd: 0, availableTwd: 0 }).level).toBe('ok')
  })
})
