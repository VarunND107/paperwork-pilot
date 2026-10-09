import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StepView } from '../api/types';
import { caseAfterStepOne, freshCase, step } from '../test/fixtures';
import { expectNoA11yViolations } from '../test/utils';
import { StepDetail } from './StepDetail';

function setup(s: StepView, over: Partial<React.ComponentProps<typeof StepDetail>> = {}) {
  const handlers = {
    onToggleDocument: vi.fn(),
    onComplete: vi.fn(),
    onUndo: vi.fn(),
    onJump: vi.fn(),
    onOpen: vi.fn(),
  };
  const view = render(
    <StepDetail
      step={s}
      total={3}
      nextStep={null}
      busy={false}
      fresh={false}
      slam={false}
      {...handlers}
      {...over}
    />,
  );
  return { ...handlers, ...view };
}

const ready = () => freshCase().steps[0] as StepView;
const locked = () => freshCase().steps[1] as StepView;
const doneStep = () => caseAfterStepOne().steps[0] as StepView;
const nextAfterOne = () => caseAfterStepOne().steps[1] as StepView;

describe('StepDetail: what the step shows', () => {
  it('shows the form, where, fee, typical wait and deadline', () => {
    setup(ready());
    expect(
      screen.getByRole('heading', { level: 3, name: 'Get the medical certificate' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    for (const label of ['Form', 'Where', 'Fee', 'Typical wait', 'Deadline']) {
      expect(screen.getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
    expect(screen.getByText('Form 2')).toBeInTheDocument();
    expect(screen.getByText('Ward office')).toBeInTheDocument();
    expect(screen.getByText('Within 21 days')).toBeInTheDocument();
  });

  it('links to the office portal when there is one', () => {
    const withOffice = step({
      ...ready(),
      office: {
        id: 'o1',
        name: 'UIDAI portal',
        kind: 'PORTAL',
        url: 'https://myaadhaar.uidai.gov.in/',
      },
    });
    setup(withOffice);
    const link = screen.getByRole('link', { name: 'Portal' });
    expect(link).toHaveAttribute('href', 'https://myaadhaar.uidai.gov.in/');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('badges the state: Ready, Locked, Done', () => {
    const { rerender } = setup(ready());
    expect(screen.getByText('Ready', { selector: '.badge' })).toBeInTheDocument();
    rerender(
      <StepDetail
        step={locked()}
        total={3}
        nextStep={null}
        busy={false}
        fresh={false}
        slam={false}
        onToggleDocument={vi.fn()}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
        onJump={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('Locked', { selector: '.badge' })).toBeInTheDocument();
  });
});

describe('StepDetail: documents', () => {
  it('lists documents as labelled checkboxes the visitor can tick', async () => {
    const user = userEvent.setup();
    const { onToggleDocument } = setup(ready());
    const box = screen.getByRole('checkbox', { name: 'Hospital discharge or death summary' });
    expect(box).toBeEnabled();
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(onToggleDocument).toHaveBeenCalledWith('d-discharge', true);
  });

  it('unticks a ticked document', async () => {
    const user = userEvent.setup();
    const ticked = step({
      ...ready(),
      documents: [{ documentId: 'd1', label: 'Passbook', state: 'ticked', comesFrom: null }],
    });
    const { onToggleDocument } = setup(ticked);
    const box = screen.getByRole('checkbox', { name: 'Passbook' });
    expect(box).toBeChecked();
    await user.click(box);
    expect(onToggleDocument).toHaveBeenCalledWith('d1', false);
  });

  it('shows a document from an earlier step as locked, with where it comes from', () => {
    setup(locked());
    const box = screen.getByRole('checkbox', { name: 'Medical certificate of cause of death' });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.getByText('Comes from step 1')).toBeInTheDocument();
    expect(box).toHaveAccessibleDescription('Comes from step 1');
  });

  it('auto-ticks a document once the producing step is done', () => {
    setup(nextAfterOne());
    const box = screen.getByRole('checkbox', { name: 'Medical certificate of cause of death' });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(screen.getByText('From step 1')).toHaveClass('got');
  });

  it('can be tabbed through and toggled with the keyboard', async () => {
    const user = userEvent.setup();
    const { onToggleDocument } = setup(ready());
    await user.tab();
    expect(
      screen.getByRole('checkbox', { name: 'Hospital discharge or death summary' }),
    ).toHaveFocus();
    await user.keyboard(' ');
    expect(onToggleDocument).toHaveBeenCalledWith('d-discharge', true);
  });
});

describe('StepDetail: actions', () => {
  it('cannot be marked done until the documents are ticked, and says why', () => {
    setup(ready());
    const button = screen.getByRole('button', { name: 'Mark step done' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Tick each document you are carrying to finish this step.',
    );
  });

  it('can be marked done once every document is held', async () => {
    const user = userEvent.setup();
    const complete = step({ ...ready(), docsComplete: true, canComplete: true });
    const { onComplete } = setup(complete);
    const button = screen.getByRole('button', { name: 'Mark step done' });
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription('All documents ticked.');
    await user.click(button);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('keeps the button disabled while a change is being saved', () => {
    setup(step({ ...ready(), docsComplete: true, canComplete: true }), { busy: true });
    expect(screen.getByRole('button', { name: 'Mark step done' })).toBeDisabled();
  });

  it('announces hint changes politely', () => {
    setup(ready());
    expect(document.querySelector('#d-hint')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('StepDetail: a locked step', () => {
  it('explains what it waits for and jumps to it', async () => {
    const user = userEvent.setup();
    const { onJump } = setup(locked());
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Not yet. This step waits for this step:');
    await user.click(
      within(note).getByRole('button', { name: 'Step 1, Get the medical certificate' }),
    );
    expect(onJump).toHaveBeenCalledWith('s1');
    expect(screen.getByRole('button', { name: 'Mark step done' })).toBeDisabled();
    expect(screen.getByText('Finish the steps it waits for first.')).toBeInTheDocument();
  });

  it('says "these steps" when it waits for several', () => {
    const many = step({
      id: 's5',
      number: 5,
      title: 'Settle bank accounts',
      blockedBy: [
        { id: 's3', number: 3, title: 'Copies' },
        { id: 's4', number: 4, title: 'Legal heir certificate' },
      ],
    });
    setup(many);
    expect(screen.getByRole('note')).toHaveTextContent('This step waits for these steps:');
    expect(screen.getAllByRole('button', { name: /^Step [34], / })).toHaveLength(2);
  });

  it('does not show the blocked box for a ready or done step', () => {
    setup(ready());
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('StepDetail: a finished step', () => {
  it('shows the stamp, says what is ready next, and offers Open and Undo', async () => {
    const user = userEvent.setup();
    const next = nextAfterOne();
    const { onOpen, onUndo, container } = setup(doneStep(), { nextStep: next });
    expect(container.querySelector('#detail')).toHaveAttribute('data-state', 'done');
    expect(container.querySelector('.stamp')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Step done. Step 2 is ready.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open step 2' }));
    expect(onOpen).toHaveBeenCalledWith('s2');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('says the route is complete when nothing is left', () => {
    setup(doneStep(), { nextStep: null });
    expect(screen.getByText('Step done. The route is complete.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open step/ })).not.toBeInTheDocument();
  });

  it('labels the stamp SAMPLE while the data is unverified, and not once verified', () => {
    const { container, rerender } = setup(doneStep());
    expect(container.querySelector('.stamp small')).toHaveTextContent('FILED · SAMPLE');
    const verified = step({
      ...doneStep(),
      verification: {
        sourceUrl: 'https://crsorgi.gov.in/',
        verified: true,
        lastVerifiedAt: '2026-09-20T00:00:00.000Z',
        stale: false,
      },
    });
    rerender(
      <StepDetail
        step={verified}
        total={3}
        nextStep={null}
        busy={false}
        fresh={false}
        slam={false}
        onToggleDocument={vi.fn()}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
        onJump={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(container.querySelector('.stamp small')).toHaveTextContent(/^FILED$/);
  });

  it('plays the stamp and moves focus to the next action when it was just completed', () => {
    const next = nextAfterOne();
    const { container } = setup(doneStep(), { nextStep: next, slam: true, fresh: true });
    expect(container.querySelector('#detail')).toHaveClass('slam', 'fresh');
    expect(screen.getByRole('button', { name: 'Open step 2' })).toHaveFocus();
  });

  it('does not steal focus when re-selecting a finished step', () => {
    setup(doneStep(), { nextStep: nextAfterOne(), slam: false });
    expect(screen.getByRole('button', { name: 'Open step 2' })).not.toHaveFocus();
  });
});

describe('StepDetail: deadlines', () => {
  const withDeadline = (over: Partial<StepView>) => step({ ...ready(), ...over });

  it('shows the computed date and days left', () => {
    setup(withDeadline({ deadline: '2026-10-22', daysLeft: 13, deadlineState: 'upcoming' }));
    expect(screen.getByText(/By 22 Oct 2026 · 13 days left/)).toHaveAttribute(
      'data-state',
      'upcoming',
    );
  });

  it('uses the singular for one day', () => {
    setup(withDeadline({ deadline: '2026-10-10', daysLeft: 1, deadlineState: 'due_soon' }));
    expect(screen.getByText(/1 day left/)).toBeInTheDocument();
  });

  it('says due today', () => {
    setup(withDeadline({ deadline: '2026-10-09', daysLeft: 0, deadlineState: 'due_soon' }));
    expect(screen.getByText(/Due today/)).toBeInTheDocument();
  });

  it('flags an overdue step', () => {
    setup(withDeadline({ deadline: '2026-10-07', daysLeft: -2, deadlineState: 'overdue' }));
    const note = screen.getByText(/Overdue by 2 days/);
    expect(note).toHaveAttribute('data-state', 'overdue');
  });

  it('stops counting down once the step is done', () => {
    setup(step({ ...doneStep(), deadline: '2026-10-07', daysLeft: -2, deadlineState: 'overdue' }));
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
    expect(screen.getByText('By 7 Oct 2026')).toHaveAttribute('data-state', 'none');
  });

  it('shows only the wording when there is no event date yet', () => {
    setup(ready());
    expect(document.querySelector('.d-deadline')).toBeNull();
  });
});

describe('StepDetail: source and verification (never present unverified data as verified)', () => {
  it('says "Sample data. Not verified." and the source is marked unchecked', () => {
    setup(ready());
    expect(
      screen.getByText('Sample data. Not verified. Last verified: never.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Source \(not yet checked\):/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'crsorgi.gov.in' });
    expect(link).toHaveAttribute('href', 'https://crsorgi.gov.in/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText(/^Last verified: \d/)).not.toBeInTheDocument();
  });

  it('shows the date and the source for a verified step', () => {
    const verified = step({
      ...ready(),
      verification: {
        sourceUrl: 'https://www.uidai.gov.in/en/',
        verified: true,
        lastVerifiedAt: '2026-09-20T00:00:00.000Z',
        stale: false,
      },
    });
    setup(verified);
    expect(screen.getByText(/^Last verified: 20 Sep.* 2026\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Source:/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'uidai.gov.in' })).toBeInTheDocument();
    expect(screen.queryByText(/Sample data/)).not.toBeInTheDocument();
  });

  it('warns when a verified step has gone stale', () => {
    const stale = step({
      ...ready(),
      verification: {
        sourceUrl: 'https://crsorgi.gov.in/',
        verified: true,
        lastVerifiedAt: '2026-03-01T00:00:00.000Z',
        stale: true,
      },
    });
    setup(stale);
    expect(
      screen.getByText(/more than 90 days ago\. Check the source before you rely on it\./),
    ).toBeInTheDocument();
  });

  it('says "Not verified" even when an admin has edited it without verifying', () => {
    const edited = step({
      ...ready(),
      verification: {
        sourceUrl: 'https://crsorgi.gov.in/',
        verified: false,
        lastVerifiedAt: '2026-09-20T00:00:00.000Z',
        stale: false,
      },
    });
    setup(edited);
    expect(screen.getByText(/^Not verified\. Last edited: /)).toBeInTheDocument();
  });
});

describe('StepDetail: tips', () => {
  it('labels sample tips as samples, with no date', () => {
    setup(ready());
    expect(screen.getByText('Tip from the queue · sample')).toBeInTheDocument();
    expect(screen.getByText('Bring the original.')).toBeInTheDocument();
  });

  it('shows visitor tips with their date and any stale flags', () => {
    const withUserTip = step({
      ...ready(),
      tips: [
        {
          id: 't1',
          body: 'Go after 2 pm.',
          origin: 'USER',
          createdAt: '2026-09-01T05:00:00.000Z',
          staleFlags: 2,
        },
      ],
    });
    setup(withUserTip);
    expect(screen.getByText(/^Tip from a visitor · 1 Sep/)).toBeInTheDocument();
    expect(screen.getByText('Flagged out of date by 2 people')).toBeInTheDocument();
  });

  it('renders extra content under the tips', () => {
    setup(ready(), { children: <p>Add a tip form goes here</p> });
    expect(screen.getByText('Add a tip form goes here')).toBeInTheDocument();
  });
});

describe('StepDetail: accessibility', () => {
  it.each([
    ['ready', ready()],
    ['locked', locked()],
    ['done', doneStep()],
  ])('has no axe violations when %s', async (_name, s) => {
    const { container } = setup(s, { nextStep: nextAfterOne() });
    await expectNoA11yViolations(container);
  });
});
