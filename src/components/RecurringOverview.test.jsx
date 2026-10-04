import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecurringOverview from './RecurringOverview'

const row = (overrides) => ({
  id: 1,
  name: '房租',
  amountTwd: 18000,
  recurrenceType: 'MONTHLY',
  monthlyDay: 20,
  yearlyMonth: null,
  yearlyDay: null,
  recurrenceUntil: null,
  categoryId: 10,
  nextOccurrenceDate: '2026-10-20',
  monthlyEquivalentTwd: 18000,
  startsInFuture: false,
  occurredAt: '2026-01-01',
  ...overrides,
})

const rows = [
  row({ id: 1 }),
  row({ id: 2, name: '電話費', amountTwd: 600, monthlyDay: 2, nextOccurrenceDate: '2026-10-05', monthlyEquivalentTwd: 600 }),
  row({ id: 3, name: '健身房', amountTwd: 1500, monthlyDay: 15, nextOccurrenceDate: '2026-11-15', startsInFuture: true, occurredAt: '2026-11-15', monthlyEquivalentTwd: 1500 }),
  row({
    id: 4,
    name: '保險',
    amountTwd: 24000,
    recurrenceType: 'YEARLY',
    monthlyDay: null,
    yearlyMonth: 3,
    yearlyDay: 1,
    nextOccurrenceDate: '2027-03-01',
    monthlyEquivalentTwd: 2000,
    recurrenceUntil: '2030-03-01',
  }),
  row({ id: 5, name: '串流', amountTwd: 390, monthlyDay: 4, nextOccurrenceDate: '2026-10-04', monthlyEquivalentTwd: 390 }),
]

const renderOverview = (props = {}) => {
  const handlers = { onEdit: vi.fn(), onStop: vi.fn(), onCreate: vi.fn() }
  render(
    <RecurringOverview
      rows={rows}
      summary={{ count: 5, monthlyEquivalentTwd: 22490 }}
      categoryNames={new Map([[10, '居住']])}
      today="2026-10-04"
      {...handlers}
      {...props}
    />,
  )
  return { user: userEvent.setup(), ...handlers }
}

const listItems = () => screen.getAllByRole('listitem')

const swipeOpen = (el) => {
  fireEvent.pointerDown(el, { clientX: 300, clientY: 20, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: 250, clientY: 20, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: 140, clientY: 20, pointerId: 1 })
  fireEvent.pointerUp(el, { clientX: 140, clientY: 20, pointerId: 1 })
}

describe('<RecurringOverview />', () => {
  it('shows the count and monthly equivalent total', () => {
    renderOverview()
    expect(screen.getByText(/共 5 筆/)).toHaveTextContent('共 5 筆 · 每月約 $22,490')
  })

  it('shows the first four rows and expands to all', async () => {
    const { user } = renderOverview()
    expect(listItems()).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: '看全部 5 筆' }))
    expect(listItems()).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: '收合' }))
    expect(listItems()).toHaveLength(4)
  })

  it('describes the next charge relative to today', () => {
    renderOverview({ rows: [rows[0], rows[1], rows[4]] })
    const [rent, phone, streaming] = listItems()
    expect(within(rent).getByText(/下次/)).toHaveTextContent('下次 10/20（16 天後）')
    expect(within(phone).getByText(/下次/)).toHaveTextContent('下次 10/5（明天）')
    expect(within(streaming).getByText('今天扣款')).toBeInTheDocument()
  })

  it('shows the cadence, category and yearly monthly equivalent', async () => {
    const { user } = renderOverview()
    await user.click(screen.getByRole('button', { name: '看全部 5 筆' }))
    const insurance = listItems().find((item) => item.textContent.includes('保險'))
    expect(insurance).toHaveTextContent('/年')
    expect(insurance).toHaveTextContent('約 $2,000/月')
    expect(insurance).toHaveTextContent('至 2030/03/01')
    expect(listItems()[0]).toHaveTextContent('居住 · 每月 20 日扣款')
  })

  it('flags rules that have not started yet', async () => {
    const { user } = renderOverview()
    await user.click(screen.getByRole('button', { name: '看全部 5 筆' }))
    const gym = listItems().find((item) => item.textContent.includes('健身房'))
    expect(gym).toHaveTextContent('11/15 起')
  })

  it('wires the edit, stop and create actions', async () => {
    const { user, onEdit, onStop, onCreate } = renderOverview()
    await user.click(screen.getByRole('button', { name: '編輯 房租' }))
    expect(onEdit).toHaveBeenCalledWith(rows[0])
    await user.click(screen.getByRole('button', { name: '停止 房租' }))
    expect(onStop).toHaveBeenCalledWith(rows[0])
    await user.click(screen.getByRole('button', { name: '新增定期支出' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows an empty state with a create button', async () => {
    const { user, onCreate } = renderOverview({ rows: [], summary: { count: 0, monthlyEquivalentTwd: 0 } })
    expect(screen.getByText('目前沒有定期支出（例如房租、訂閱）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /新增定期支出/ }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('on mobile (swipeable) moves edit / stop into the swipe actions', async () => {
    const { user, onEdit, onStop } = renderOverview({ swipeable: true })
    const [first] = listItems()
    expect(first.querySelector('.swipe-actions')).not.toBeNull()
    expect(first.querySelector('.recurring-overview-actions')).toBeNull()
    const surface = first.querySelector('.swipe-actions-content')
    swipeOpen(surface)
    await user.click(within(first).getByRole('button', { name: '編輯 房租' }))
    expect(onEdit).toHaveBeenCalledWith(rows[0])
    swipeOpen(surface)
    await user.click(within(first).getByRole('button', { name: '停止 房租' }))
    expect(onStop).toHaveBeenCalledWith(rows[0])
  })

  it('keeps the inline buttons on desktop', () => {
    renderOverview()
    const [first] = listItems()
    expect(first.querySelector('.swipe-actions')).toBeNull()
    expect(first.querySelector('.recurring-overview-actions')).not.toBeNull()
  })
})
