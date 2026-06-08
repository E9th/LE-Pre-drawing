import { test, expect } from '@playwright/test';

const getModuleSizeSection = (page: import('@playwright/test').Page) =>
  page.locator('label:text-is("Module Size (mm)")').locator('xpath=following-sibling::div');

const getSpacingSection = (page: import('@playwright/test').Page) =>
  page.locator('label:text-is("Spacing C-to-C (mm)")').locator('xpath=following-sibling::div');

const getLayoutSection = (page: import('@playwright/test').Page) =>
  page.locator('label:text-is("Layout Type")').locator('xpath=following-sibling::div');

const getPlannerLightTempSelect = (page: import('@playwright/test').Page) =>
  page.locator('label:has-text("Light Temp")').last().locator('xpath=following-sibling::select');

const getPlannerControlSelect = (page: import('@playwright/test').Page) =>
  page.locator('label:has-text("การควบคุมแสง")').last().locator('xpath=following-sibling::select');

const expectRgbwPreset = async (page: import('@playwright/test').Page) => {
  const moduleSize = getModuleSizeSection(page);
  const spacing = getSpacingSection(page);
  const layout = getLayoutSection(page);

  await expect(moduleSize.locator('input').nth(0)).toHaveValue('93');
  await expect(moduleSize.locator('input').nth(1)).toHaveValue('32');
  await expect(spacing.locator('input').nth(0)).toHaveValue('150');
  await expect(spacing.locator('input').nth(1)).toHaveValue('150');
  await expect(layout.getByRole('button', { name: 'Grid' })).toHaveClass(/border-blue-500/);
  await expect(layout.getByRole('button', { name: 'Staggered' })).not.toHaveClass(/border-blue-500/);
};

test('RGBW selection syncs the preset and both selectors', async ({ page }) => {
  await page.addInitScript(() => {
    window.prompt = () => 'kp_anakin';
  });

  await page.goto('/');

  const topFormInputs = page.locator('input[type="text"]');
  const topNumberInputs = page.locator('input[type="number"]');
  const structureSelect = page.locator('select').first();

  await topFormInputs.nth(0).fill('QA AO');
  await topFormInputs.nth(1).fill('QA Project');
  await topFormInputs.nth(2).fill('Bangkok');

  await structureSelect.selectOption({ label: 'ทำ' });

  await topNumberInputs.nth(0).fill('1200');
  await topNumberInputs.nth(1).fill('800');
  await topNumberInputs.nth(2).fill('1');

  await page.getByRole('button', { name: 'เปิดเครื่องมือวาดขั้นสูง' }).click();

  await expect(page.getByText('Module Size (mm)')).toBeVisible({ timeout: 60_000 });

  await getPlannerLightTempSelect(page).selectOption('RGBW');
  await expect(getPlannerControlSelect(page)).toHaveValue('RGBW');
  await expectRgbwPreset(page);

  await getPlannerControlSelect(page).selectOption('On-Off');
  await getPlannerLightTempSelect(page).selectOption('3000K');

  await getPlannerControlSelect(page).selectOption('RGBW');
  await expect(getPlannerLightTempSelect(page)).toHaveValue('RGBW');
  await expectRgbwPreset(page);
});