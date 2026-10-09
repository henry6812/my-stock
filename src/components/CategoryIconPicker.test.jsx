import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CategoryIconPicker from './CategoryIconPicker'

describe('CategoryIconPicker', () => {
  it('offers all 18 icons', () => {
    render(<CategoryIconPicker name="外食" />)
    expect(screen.getByRole('group', { name: '分類圖示' }).querySelectorAll('button')).toHaveLength(18)
  })

  it('shows the icon picked from the name when nothing is stored', () => {
    render(<CategoryIconPicker name="外食" value={null} />)
    expect(screen.getByRole('button', { name: '外食' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('依名稱自動選擇，點圖示可自訂')).toBeInTheDocument()
  })

  it('stores the clicked icon', () => {
    const onChange = vi.fn()
    render(<CategoryIconPicker name="外食" value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '咖啡飲料' }))
    expect(onChange).toHaveBeenCalledWith('coffee')
  })

  it('marks a stored icon and can go back to the name', () => {
    const onChange = vi.fn()
    render(<CategoryIconPicker name="外食" value="coffee" onChange={onChange} />)
    expect(screen.getByRole('button', { name: '咖啡飲料' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '外食' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '改回依名稱自動選擇' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('falls back to 其他 for an unknown or empty name', () => {
    render(<CategoryIconPicker name="" value={null} />)
    expect(screen.getByRole('button', { name: '其他' })).toHaveAttribute('aria-pressed', 'true')
  })
})
