import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import HolderAvatar from './HolderAvatar'
import { getHolderInitial } from '../utils/holderAvatars'

describe('getHolderInitial', () => {
  it('takes the first character, upper-cased', () => {
    expect(getHolderInitial('po')).toBe('P')
    expect(getHolderInitial('澄澄')).toBe('澄')
    expect(getHolderInitial('')).toBe('')
  })
})

describe('<HolderAvatar />', () => {
  it('shows the initial while there is no photo', () => {
    const { container } = render(<HolderAvatar holder="Wei" />)
    expect(container.querySelector('.holder-avatar')).toHaveTextContent('W')
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows a person icon for 未設定', () => {
    const { container } = render(<HolderAvatar holder="未設定" unset />)
    expect(container.querySelector('.holder-avatar svg')).not.toBeNull()
    expect(container.querySelector('.holder-avatar')).toHaveTextContent('')
  })
})
