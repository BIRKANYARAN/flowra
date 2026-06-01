// @vitest-environment jsdom
// Smoke test proving the component-test infrastructure (jsdom + RTL) works.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

function Hello({ name }: { name: string }) {
  return <div role="status">Merhaba {name}</div>
}

describe('component-test infrastructure smoke', () => {
  it('renders a React component into jsdom and queries it', () => {
    render(<Hello name="Flowra" />)
    expect(screen.getByRole('status')).toHaveTextContent('Merhaba Flowra')
  })
})
