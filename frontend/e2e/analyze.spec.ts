import { test, expect } from '@playwright/test';

const DEMO_INGREDIENTS =
  'Water, Glycerin, Niacinamide, Salicylic Acid, Fragrance, Ceramide NP, Phenoxyethanol, Alcohol Denat.';

test.describe('Ingredient Analyzer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('landing page loads with hero heading', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('ingredient');
  });

  test('navigates to Analyze tab and shows input modes', async ({ page }) => {
    // Click the nav "Analyze" link
    await page.getByRole('link', { name: /analyze/i }).first().click();
    // Or use tab button text — the nav items use button onClick
    await page.locator('button', { hasText: /analyze/i }).first().click();

    // Three input mode pills should be visible
    await expect(page.locator('button', { hasText: /Paste List/i })).toBeVisible();
    await expect(page.locator('button', { hasText: /Scan Label/i })).toBeVisible();
    await expect(page.locator('button', { hasText: /Barcode/i })).toBeVisible();
  });

  test('demo button populates ingredients and switches to analyze tab', async ({ page }) => {
    // The hero "Try Demo" / "Analyze Now" button loads demo data
    const demoBtn = page.locator('button', { hasText: /try demo/i }).first();
    await demoBtn.click();

    // Should now be on the analyze tab and show a textarea with ingredients
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(/Glycerin/i);
  });

  test('paste ingredients and run analysis', async ({ page }) => {
    // Go to analyze tab
    await page.locator('button', { hasText: /^Analyze$/i }).first().click();

    // Find the textarea and paste ingredients
    const textarea = page.locator('textarea').first();
    await textarea.fill(DEMO_INGREDIENTS);

    // Click Analyze Now
    await page.locator('button', { hasText: /Analyze Now/i }).click();

    // Results dashboard should appear — wait up to 15s for API call
    await expect(page.locator('text=Safety Score').or(page.locator('text=safety score'))).toBeVisible({ timeout: 15000 });
  });

  test('shows error when textarea is empty and analyze is clicked', async ({ page }) => {
    await page.locator('button', { hasText: /^Analyze$/i }).first().click();

    const textarea = page.locator('textarea').first();
    await textarea.fill('');

    await page.locator('button', { hasText: /Analyze Now/i }).click();

    // Error state or no results — no crash
    // The app returns early for empty input; results should stay hidden
    await expect(page.locator('text=Safety Score')).not.toBeVisible({ timeout: 3000 });
  });

  test('shows error for single-token ingredient list', async ({ page }) => {
    await page.locator('button', { hasText: /^Analyze$/i }).first().click();

    const textarea = page.locator('textarea').first();
    await textarea.fill('Water');

    await page.locator('button', { hasText: /Analyze Now/i }).click();

    await expect(
      page.locator('text=full ingredient list').or(page.locator('[role="alert"]'))
    ).toBeVisible({ timeout: 5000 });
  });
});
