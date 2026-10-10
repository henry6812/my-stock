import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollapsibleGroups from './CollapsibleGroups'

const groups = [
  { key: 'Po', title: 'Po · 2 檔', total: '$150', rows: [{ id: 1, name: '合庫金' }, { id: 2, name: '玉山金' }] },
  { key: 'Wei', title: 'Wei · 1 檔', total: '$70', rows: [{ id: 3, name: 'DIA' }] },
]

const renderGroups = (props = {}) => {
  render(
    <CollapsibleGroups
      groups={groups}
      renderRow={(row) => <div key={row.id}>{row.name}</div>}
      empty={<div>沒有資料</div>}
      {...props}
    />,
  )
  return userEvent.setup()
}

describe('<CollapsibleGroups />', () => {
  it('shows each group heading with its total, all expanded by default', () => {
    renderGroups()
    const po = screen.getByRole('button', { name: /Po · 2 檔/ })
    expect(po).toHaveTextContent('$150')
    expect(po).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('合庫金')).toBeInTheDocument()
    expect(screen.getByText('DIA')).toBeInTheDocument()
  })

  it('collapses and expands a group from its heading', async () => {
    const user = renderGroups()
    const po = screen.getByRole('button', { name: /Po · 2 檔/ })
    await user.click(po)
    expect(po).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('合庫金')).not.toBeInTheDocument()
    expect(screen.getByText('DIA')).toBeInTheDocument()
    await user.click(po)
    expect(screen.getByText('合庫金')).toBeInTheDocument()
  })

  it('shows the empty state without groups', () => {
    renderGroups({ groups: [] })
    expect(screen.getByText('沒有資料')).toBeInTheDocument()
  })

  describe('with defaultExpanded false and a storageKey', () => {
    beforeEach(() => window.localStorage.clear())

    it('starts folded and remembers what the user opened', async () => {
      const user = renderGroups({ defaultExpanded: false, storageKey: 'test-groups' })
      const po = screen.getByRole('button', { name: /Po · 2 檔/ })
      expect(po).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('合庫金')).not.toBeInTheDocument()
      await user.click(po)
      expect(JSON.parse(window.localStorage.getItem('test-groups'))).toEqual({ Po: true })
    })

    it('restores the remembered groups on the next visit', () => {
      window.localStorage.setItem('test-groups', JSON.stringify({ Wei: true }))
      renderGroups({ defaultExpanded: false, storageKey: 'test-groups' })
      expect(screen.getByRole('button', { name: /Wei · 1 檔/ })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('DIA')).toBeInTheDocument()
      expect(screen.queryByText('合庫金')).not.toBeInTheDocument()
    })
  })
})
