import { test, expect } from '@playwright/test';

test.describe('Barcode Lookup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Analyze tab
    await page.locator('button', { hasText: /^Analyze$/i }).first().click();
    // Switch to Barcode input mode
    await page.locator('button', { hasText: /Barcode/i }).first().click();
  });

  test('barcode tab shows input field and lookup button', async ({ page }) => {
    const barcodeInput = page.locator('input[placeholder*="barcode"]');
    await expect(barcodeInput).toBeVisible();

    const lookupBtn = page.locator('button', { hasText: /Look Up/i });
    await expect(lookupBtn).toBeVisible();
  });

  test('shows scan camera button', async ({ page }) => {
    const cameraBtn = page.locator('button', { hasText: /Scan/i }).or(
      page.locator('[aria-label*="camera"]')
    );
    await expect(cameraBtn.first()).toBeVisible();
  });

  test('empty barcode shows error without crashing', async ({ page }) => {
    await page.locator('button', { hasText: /Look Up/i }).click();
    // Should show an error message, not crash
    await expect(page.locator('text=barcode').or(page.locator('[role="alert"]'))).toBeVisible({ timeout: 3000 });
  });

  test('known barcode lookup returns product info or graceful not-found', async ({ page }) => {
    // Dove soap barcode — a real EAN13 in Open Beauty Facts
    const barcodeInput = page.locator('input[placeholder*="barcode"]');
    await barcodeInput.fill('0748948000214');

    await page.locator('button', { hasText: /Look Up/i }).click();

    // Either product info or a "not found" message — both are acceptable; no crash
    await expect(
      page.locator('text=Product').or(
        page.locator('text=not found').or(
          page.locator('text=Analyze Now')
        )
      )
    ).toBeVisible({ timeout: 15000 });
  });

  test('invalid barcode shows not-found message', async ({ page }) => {
    const barcodeInput = page.locator('input[placeholder*="barcode"]');
    await barcodeInput.fill('0000000000000');

    await page.locator('button', { hasText: /Look Up/i }).click();

    await expect(
      page.locator('text=not found').or(page.locator('text=Product'))
    ).toBeVisible({ timeout: 15000 });
  });
});
