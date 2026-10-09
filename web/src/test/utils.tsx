import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { expect } from 'vitest';
import { AppDataProvider } from '../state/AppData';

export function renderWithProviders(ui: ReactElement, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppDataProvider>{ui}</AppDataProvider>
    </MemoryRouter>,
  );
}

/**
 * Runs axe-core on a rendered subtree. Colour contrast is checked in the browser, not here
 * (jsdom has no layout), so that rule is off; everything structural stays on.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container as HTMLElement, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact ?? '?'}): ${v.nodes.map((n) => n.html).join(' | ')}`,
  );
  expect(summary).toEqual([]);
}
