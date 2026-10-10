import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import GoalIcon from './GoalIcon'
import { GOAL_ICON_KEYS } from '../utils/savingsGoals'
import { GOAL_ICON_COMPONENTS } from './goalIconComponents'

describe('<GoalIcon />', () => {
  it('has a component for every goal icon key', () => {
    expect(Object.keys(GOAL_ICON_COMPONENTS).sort()).toEqual([...GOAL_ICON_KEYS].sort())
  })

  it('renders the tile, falling back to savings for an unknown key', () => {
    const { container } = render(<GoalIcon iconKey="nope" />)
    const tile = container.querySelector('.goal-icon')
    expect(tile).toHaveAttribute('data-goal-icon', 'savings')
    expect(tile.querySelector('svg')).not.toBeNull()
  })
})
