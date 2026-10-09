import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the product name and the disclaimer', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Paperwork Pilot' })).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });
});
