import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PriceRefreshFooter from './PriceRefreshFooter'

describe('<PriceRefreshFooter />', () => {
  it('says when prices were updated and refreshes from the link', async () => {
    const onRefresh = vi.fn()
    render(<PriceRefreshFooter updatedText="2 小時前" onRefresh={onRefresh} />)
    expect(screen.getByText('2 小時前更新')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '立即更新' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('reads 尚未更新 before the first update', () => {
    render(<PriceRefreshFooter updatedText="尚未更新" />)
    expect(screen.getByText('尚未更新')).toBeInTheDocument()
  })

  it('shows progress and blocks the link while updating or read-only', () => {
    const { rerender } = render(<PriceRefreshFooter updatedText="剛剛" loading />)
    expect(screen.getByText('更新中…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即更新' })).toBeDisabled()
    rerender(<PriceRefreshFooter updatedText="剛剛" disabled />)
    expect(screen.getByRole('button', { name: '立即更新' })).toBeDisabled()
  })
})
