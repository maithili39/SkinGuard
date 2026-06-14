import { test, expect } from '@playwright/test';

test.describe('Encyclopedia / Ingredient Lookup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to the Encyclopedia (Learn) tab
    await page.locator('button', { hasText: /Encyclopedia/i }).first().click();
  });

  test('encyclopedia tab shows search input', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="ingredient"]').or(
      page.locator('input[placeholder*="Niacinamide"]')
    );
    await expect(searchInput.first()).toBeVisible();
  });

  test('search for Niacinamide returns explanation', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="ingredient"]').or(
      page.locator('input[placeholder*="Niacinamide"]')
    );
    await searchInput.first().fill('Niacinamide');
    await page.keyboard.press('Enter');

    // Wait for explanation card to appear
    await expect(
      page.locator('text=Niacinamide').or(page.locator('text=Vitamin B3'))
    ).toBeVisible({ timeout: 15000 });
  });

  test('search for unknown ingredient shows not found', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="ingredient"]').or(
      page.locator('input[placeholder*="Niacinamide"]')
    );
    await searchInput.first().fill('xyzzy_unknown_ingredient_12345');
    await page.keyboard.press('Enter');

    await expect(
      page.locator('text=not found').or(page.locator('text=No ingredient'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('glossary search filters terms', async ({ page }) => {
    // Glossary search box
    const glossaryInput = page.locator('input[placeholder*="terminology"]').or(
      page.locator('input[placeholder*="Search"]').last()
    );
    await glossaryInput.fill('ceramid');
    await expect(page.locator('text=Ceramides')).toBeVisible({ timeout: 3000 });
  });

  test('glossary shows all terms when search is empty', async ({ page }) => {
    // Key terms should be visible in the glossary
    await expect(page.locator('text=INCI')).toBeVisible();
    await expect(page.locator('text=Comedogenic')).toBeVisible();
    await expect(page.locator('text=Humectant')).toBeVisible();
  });
});
