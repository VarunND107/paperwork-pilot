import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { api, ApiError } from '../api/client';
import type { StepView } from '../api/types';
import { freshCase, step } from '../test/fixtures';
import { expectNoA11yViolations } from '../test/utils';
import { TipForm } from './TipForm';

const withOffice = (): StepView =>
  step({
    ...(freshCase().steps[0] as StepView),
    office: { id: 'o1', name: 'Ward office', kind: 'OFFICE', url: null },
  });
const withoutOffice = (): StepView => step({ ...(freshCase().steps[0] as StepView), office: null });

let submit: MockInstance<typeof api.submitTip>;
beforeEach(() => {
  submit = vi.spyOn(api, 'submitTip').mockResolvedValue({ tip: { id: 'new', status: 'PENDING' } });
});

async function open(s: StepView) {
  const user = userEvent.setup();
  const view = render(<TipForm step={s} />);
  await user.click(screen.getByRole('button', { name: 'Add a tip' }));
  return { user, ...view };
}

describe('TipForm', () => {
  it('starts as a single button and opens a labelled form on request', async () => {
    const { user } = await open(withoutOffice());
    const box = screen.getByLabelText('Your tip');
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleDescription(/No links, email addresses or phone numbers/);
    expect(screen.getByText(/0 of 400 characters/)).toBeInTheDocument();
    await user.type(box, 'Hello there');
    expect(screen.getByText(/11 of 400 characters/)).toBeInTheDocument();
    expect(screen.queryByLabelText('This tip is about')).not.toBeInTheDocument();
  });

  it('sends a tip about the step and thanks the visitor', async () => {
    const s = withoutOffice();
    const { user } = await open(s);
    await user.type(screen.getByLabelText('Your tip'), 'Ask for the slip before you leave.');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ stepId: s.id }, 'Ask for the slip before you leave.');
    });
    expect(
      await screen.findByText(/A moderator will read your tip before it appears/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Your tip')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add a tip' })).toHaveFocus();
    });
  });

  it('can send a tip about the office the step goes to', async () => {
    const { user } = await open(withOffice());
    await user.selectOptions(screen.getByLabelText('This tip is about'), 'office');
    expect(screen.getByRole('option', { name: 'The office: Ward office' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your tip'), 'The ground floor counter is quickest.');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        { officeId: 'o1' },
        'The ground floor counter is quickest.',
      );
    });
  });

  it('asks for text first instead of sending an empty tip', async () => {
    const { user } = await open(withoutOffice());
    await user.type(screen.getByLabelText('Your tip'), '   ');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Write your tip first.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows what the server refused, in its words', async () => {
    submit.mockRejectedValue(
      new ApiError(400, 'validation_error', 'The request was not valid.', [
        { path: 'body', message: 'A tip cannot contain links.' },
      ]),
    );
    const { user } = await open(withoutOffice());
    await user.type(screen.getByLabelText('Your tip'), 'See the website for details.');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A tip cannot contain links.');
    // The visitor's words are kept so they can fix them.
    expect(screen.getByLabelText('Your tip')).toHaveValue('See the website for details.');
  });

  it('tells a visitor to try again when the server cannot be reached', async () => {
    submit.mockRejectedValue(new ApiError(0, 'network', 'Could not reach the server.'));
    const { user } = await open(withoutOffice());
    await user.type(screen.getByLabelText('Your tip'), 'Ask for the slip before you leave.');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send your tip');
  });

  it('shows the waiting-list message from the server when the queue is full', async () => {
    submit.mockRejectedValue(
      new ApiError(429, 'tips_queue_full', 'Many tips are waiting for review here.'),
    );
    const { user } = await open(withoutOffice());
    await user.type(screen.getByLabelText('Your tip'), 'Ask for the slip before you leave.');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Many tips are waiting');
  });

  it('closes on cancel without sending and returns focus to the button', async () => {
    const { user } = await open(withoutOffice());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add a tip' })).toHaveFocus();
    });
  });

  it('has no accessibility violations, closed or open', async () => {
    const closed = render(<TipForm step={withOffice()} />);
    await expectNoA11yViolations(closed.container);
    closed.unmount();
    const { container } = await open(withOffice());
    await expectNoA11yViolations(container);
  });
});
