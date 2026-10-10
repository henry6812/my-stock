import { describe, it, expect } from 'vitest'
import { measureStuckHeadings } from './useStuckHeadings'

const rect = (top, left = 16, right = 374) => () => ({ top, left, right, bottom: top + 100 })

const build = (groupTop, headingTop) => {
  const container = document.createElement('div')
  const group = document.createElement('section')
  const heading = document.createElement('button')
  heading.className = 'expense-day-heading'
  group.appendChild(heading)
  container.appendChild(group)
  group.getBoundingClientRect = rect(groupTop)
  heading.getBoundingClientRect = rect(headingTop)
  return { container, heading }
}

describe('measureStuckHeadings', () => {
  it('marks a heading stuck once it slides down from its group top, with edge distances', () => {
    const { container, heading } = build(-200, 0)
    measureStuckHeadings(container, 390)
    expect(heading.dataset.stuck).toBe('true')
    expect(heading.style.getPropertyValue('--bleed-left')).toBe('16px')
    expect(heading.style.getPropertyValue('--bleed-right')).toBe('16px')
  })

  it('clears the mark when the heading is back at its group top', () => {
    const { container, heading } = build(-200, 0)
    measureStuckHeadings(container, 390)
    heading.getBoundingClientRect = rect(120)
    heading.parentElement.getBoundingClientRect = rect(120)
    measureStuckHeadings(container, 390)
    expect(heading.dataset.stuck).toBeUndefined()
    expect(heading.style.getPropertyValue('--bleed-left')).toBe('')
  })

  it('does not count the divider border above a resting heading', () => {
    const { container, heading } = build(100, 101)
    Object.defineProperty(heading.parentElement, 'clientTop', { value: 1 })
    measureStuckHeadings(container, 390)
    expect(heading.dataset.stuck).toBeUndefined()
  })
})
