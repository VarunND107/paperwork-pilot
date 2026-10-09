import { expect, test } from '@playwright/test';

/**
 * The one smoke test: the demo flow a first-time visitor takes, against the real API and database.
 * It also checks the rules that must never regress: ORDER (a step is locked until the steps it
 * needs are done), auto-satisfied documents, persistence, undo, and "sample data is never
 * presented as verified".
 */
test('demo flow: describe a situation, work the route in order, persist, undo', async ({
  page,
}) => {
  // Google Fonts is cosmetic; keep the test independent of the network.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

  await test.step('the landing page loads with the disclaimer', async () => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Know the order before you join the queue.' }),
    ).toBeVisible();
    await expect(page.getByText(/not legal advice/i).first()).toBeVisible();
  });

  await test.step('free text finds the situation through the real API', async () => {
    await page.getByLabel("What's happening in your life?").fill('my father passed away');
    await page.getByRole('button', { name: 'Plot my route' }).click();
    await expect(page.locator('#sit-status')).toHaveText(
      'Route ready for: A parent has passed away.',
    );
    await expect(
      page.getByRole('heading', { level: 2, name: /A parent has passed away/ }),
    ).toBeVisible();
    await expect(page.locator('#count')).toHaveText('0 of 6 steps done');
  });

  const route = page.getByRole('list', { name: 'Steps in order' });

  await test.step('order: later steps are locked and say what they wait for', async () => {
    await expect(
      route.getByRole('button', { name: /Get the medical certificate of cause of death.*Next up/ }),
    ).toBeVisible();
    await expect(
      route.getByRole('button', { name: /Settle bank accounts and insurance.*After 3, 4/ }),
    ).toBeVisible();
    await route.getByRole('button', { name: /Settle bank accounts and insurance/ }).click();
    await expect(page.getByText('Not yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark step done' })).toBeDisabled();
    // The "jump" link in the blocked box opens the step it waits for.
    await page.getByRole('button', { name: /^Step 3, / }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: /Collect certified copies/ }),
    ).toBeVisible();
  });

  await test.step('sample data is labelled sample, with its source, never "verified"', async () => {
    await route
      .getByRole('button', { name: /Get the medical certificate of cause of death/ })
      .click();
    await expect(page.getByText('Sample data. Not verified. Last verified: never.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'crsorgi.gov.in' })).toBeVisible();
    await expect(page.getByText('Tip from the queue · sample')).toBeVisible();
  });

  const markDone = page.getByRole('button', { name: 'Mark step done' });

  await test.step('a step needs its documents ticked before it can be marked done', async () => {
    await expect(markDone).toBeDisabled();
    await page.getByLabel('Hospital discharge or death summary', { exact: true }).check();
    await expect(markDone).toBeDisabled();
    await page.getByLabel('ID of the person who died', { exact: true }).check();
    await expect(markDone).toBeEnabled();
  });

  await test.step('marking it done stamps it, unlocks the next step and moves progress', async () => {
    await markDone.click();
    await expect(page.locator('#detail.slam .stamp')).toBeVisible();
    await expect(page.locator('#detail')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#count')).toHaveText('1 of 6 steps done');
    await expect(page.getByText('Step done. Step 2 is ready.')).toBeVisible();
    await expect(route.getByRole('button', { name: /Register the death.*Next up/ })).toBeVisible();
    // The live region tells assistive technology what happened.
    await expect(page.locator('#live')).toContainText('Step 1 done.');
  });

  await test.step('a document produced by the finished step is auto-ticked for the next one', async () => {
    await page.getByRole('button', { name: 'Open step 2' }).click();
    const produced = page.getByLabel('Medical certificate of cause of death', { exact: true });
    await expect(produced).toBeChecked();
    await expect(produced).toBeDisabled();
    await expect(page.getByText('From step 1')).toBeVisible();
  });

  await test.step('progress persists across a reload (the case lives in the database)', async () => {
    await page.reload();
    await expect(page.locator('#count')).toHaveText('1 of 6 steps done');
    await expect(
      route.getByRole('button', { name: /Get the medical certificate of cause of death.*Done/ }),
    ).toBeVisible();
  });

  await test.step('undo re-locks what depends on the step', async () => {
    await route
      .getByRole('button', { name: /Get the medical certificate of cause of death/ })
      .click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#count')).toHaveText('0 of 6 steps done');
    await expect(page.locator('#live')).toContainText('Step 1 reopened.');
    await expect(route.getByRole('button', { name: /Register the death.*After 1/ })).toBeVisible();
  });

  await test.step('layout: detail beside the list on desktop, under the selected step on mobile', async () => {
    await expect(page.locator('#detail-slot #detail')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('li.stn.is-selected #detail')).toBeVisible();
    await expect(page.locator('#detail-slot #detail')).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  await test.step('the light/dark toggle works and is remembered', async () => {
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  });
});
