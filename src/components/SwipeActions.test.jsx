import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SwipeActions from './SwipeActions'

const swipe = (el, { dx, dy = 0, steps = 4 }) => {
  fireEvent.pointerDown(el, { clientX: 200, clientY: 100, pointerId: 1 })
  for (let i = 1; i <= steps; i += 1) {
    fireEvent.pointerMove(el, {
      clientX: 200 + (dx * i) / steps,
      clientY: 100 + (dy * i) / steps,
      pointerId: 1,
    })
  }
  fireEvent.pointerUp(el, { clientX: 200 + dx, clientY: 100 + dy, pointerId: 1 })
}

const tap = (el) => {
  fireEvent.pointerDown(el, { clientX: 50, clientY: 50, pointerId: 2 })
  fireEvent.pointerUp(el, { clientX: 50, clientY: 50, pointerId: 2 })
  fireEvent.click(el)
}

const renderRow = (props = {}, label = 'row') => {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const onContentClick = vi.fn()
  const utils = render(
    <SwipeActions
      actions={[
        { key: 'edit', label: `編輯 ${label}`, onClick: onEdit },
        { key: 'delete', label: `刪除 ${label}`, danger: true, onClick: onDelete },
      ]}
      {...props}
    >
      <div data-testid={`content-${label}`} onClick={onContentClick}>
        {label}
      </div>
    </SwipeActions>,
  )
  return { ...utils, onEdit, onDelete, onContentClick }
}

const rootOf = (label) => screen.getByTestId(`content-${label}`).closest('.swipe-actions')
const surfaceOf = (label) => screen.getByTestId(`content-${label}`).closest('.swipe-actions-content')

describe('<SwipeActions />', () => {
  it('renders the content with its actions hidden until swiped', () => {
    renderRow()
    expect(screen.getByText('row')).toBeInTheDocument()
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
    expect(screen.queryByRole('button', { name: '編輯 row' })).not.toBeInTheDocument()
    swipe(surfaceOf('row'), { dx: -150 })
    expect(screen.getByRole('button', { name: '編輯 row' })).toBeInTheDocument()
  })

  it('opens after a left swipe past half the action width', () => {
    renderRow()
    swipe(surfaceOf('row'), { dx: -120 })
    expect(rootOf('row')).toHaveAttribute('data-open', 'true')
  })

  it('springs back after a short swipe', () => {
    renderRow()
    swipe(surfaceOf('row'), { dx: -30 })
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
  })

  it('ignores mostly-vertical movement (scrolling)', () => {
    renderRow()
    swipe(surfaceOf('row'), { dx: -60, dy: 120 })
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
  })

  it('closes with a right swipe', () => {
    renderRow()
    swipe(surfaceOf('row'), { dx: -150 })
    swipe(surfaceOf('row'), { dx: 150 })
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
  })

  it('runs an action and closes', () => {
    const { onDelete } = renderRow()
    swipe(surfaceOf('row'), { dx: -150 })
    fireEvent.click(screen.getByRole('button', { name: '刪除 row' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
  })

  it('does not treat the end of a swipe as a tap on the content', () => {
    const { onContentClick } = renderRow()
    swipe(surfaceOf('row'), { dx: -150 })
    fireEvent.click(screen.getByTestId('content-row'))
    expect(onContentClick).not.toHaveBeenCalled()
  })

  it('a tap on an open row only closes it (no click after the swipe, as on touch)', () => {
    const { onContentClick } = renderRow()
    swipe(surfaceOf('row'), { dx: -150 })
    tap(screen.getByTestId('content-row'))
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
    expect(onContentClick).not.toHaveBeenCalled()
    tap(screen.getByTestId('content-row'))
    expect(onContentClick).toHaveBeenCalledTimes(1)
  })

  it('lets taps through to the content while closed', () => {
    const { onContentClick } = renderRow()
    fireEvent.click(screen.getByTestId('content-row'))
    expect(onContentClick).toHaveBeenCalledTimes(1)
  })

  it('keeps only one row open at a time', () => {
    renderRow({}, 'a')
    renderRow({}, 'b')
    swipe(surfaceOf('a'), { dx: -150 })
    swipe(surfaceOf('b'), { dx: -150 })
    expect(rootOf('a')).toHaveAttribute('data-open', 'false')
    expect(rootOf('b')).toHaveAttribute('data-open', 'true')
  })

  it('closes when tapping elsewhere', () => {
    renderRow()
    swipe(surfaceOf('row'), { dx: -150 })
    fireEvent.pointerDown(document.body)
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
  })

  it('does not swipe while disabled', () => {
    renderRow({ disabled: true })
    swipe(surfaceOf('row'), { dx: -150 })
    expect(rootOf('row')).toHaveAttribute('data-open', 'false')
  })
})
