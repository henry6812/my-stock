import { describe, it, expect } from 'vitest'
import { evaluateExpression, hasOperator, pressKey } from './amountExpression'

const typeKeys = (keys) => keys.reduce((expr, key) => pressKey(expr, key), '')

describe('pressKey', () => {
  it('appends digits', () => {
    expect(typeKeys(['1', '2', '0'])).toBe('120')
  })

  it('appends operators after a number', () => {
    expect(typeKeys(['1', '2', '0', '+', '8', '5'])).toBe('120+85')
  })

  it('ignores an operator at the start', () => {
    expect(typeKeys(['+', '-', '5'])).toBe('5')
  })

  it('replaces a trailing operator with the new one', () => {
    expect(typeKeys(['5', '+', '-'])).toBe('5-')
  })

  it('does not stack leading zeros', () => {
    expect(typeKeys(['0', '0'])).toBe('0')
    expect(typeKeys(['0', '00'])).toBe('0')
  })

  it('replaces a lone leading zero with the next digit', () => {
    expect(typeKeys(['0', '7'])).toBe('7')
    expect(typeKeys(['5', '+', '0', '3'])).toBe('5+3')
  })

  it('turns 00 at the start of an operand into a single 0', () => {
    expect(typeKeys(['00'])).toBe('0')
    expect(typeKeys(['5', '+', '00'])).toBe('5+0')
  })

  it('appends 00 after a non-zero digit', () => {
    expect(typeKeys(['1', '00'])).toBe('100')
  })

  it('caps each operand at 9 digits', () => {
    const nine = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    expect(typeKeys([...nine, '0'])).toBe('123456789')
    expect(typeKeys([...nine.slice(0, 8), '00'])).toBe('12345678')
    expect(typeKeys([...nine, '+', '1'])).toBe('123456789+1')
  })

  it('backspace removes the last character', () => {
    expect(pressKey('120+', 'backspace')).toBe('120')
    expect(pressKey('', 'backspace')).toBe('')
  })

  it('clear empties the expression', () => {
    expect(pressKey('120+85', 'clear')).toBe('')
  })

  it('ignores unknown keys', () => {
    expect(pressKey('12', '*')).toBe('12')
  })
})

describe('evaluateExpression', () => {
  it('returns null for an empty expression', () => {
    expect(evaluateExpression('')).toBeNull()
  })

  it('evaluates sums and differences left to right', () => {
    expect(evaluateExpression('120+85')).toBe(205)
    expect(evaluateExpression('100-30+5')).toBe(75)
  })

  it('ignores a trailing operator', () => {
    expect(evaluateExpression('120+')).toBe(120)
  })

  it('can go negative', () => {
    expect(evaluateExpression('5-10')).toBe(-5)
  })
})

describe('hasOperator', () => {
  it('detects + and -', () => {
    expect(hasOperator('120')).toBe(false)
    expect(hasOperator('120+')).toBe(true)
    expect(hasOperator('5-1')).toBe(true)
    expect(hasOperator('')).toBe(false)
  })
})
