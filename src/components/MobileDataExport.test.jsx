import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileDataExport from './MobileDataExport'

describe('<MobileDataExport />', () => {
  it('runs a row’s export and disables rows with nothing to export', async () => {
    const onExport = vi.fn()
    render(
      <MobileDataExport
        items={[
          { key: 'a', label: '持股', hint: 'CSV · 3 檔', onExport },
          { key: 'b', label: '現金帳戶', hint: '還沒有現金帳戶', disabled: true, onExport: vi.fn() },
        ]}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /持股/ }))
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /現金帳戶/ })).toBeDisabled()
  })
})
