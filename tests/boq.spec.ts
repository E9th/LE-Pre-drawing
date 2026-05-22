import { test, expect } from '@playwright/test';

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);
  return rows;
};

const toNumber = (value: string): number | null => {
  if (value === '' || value === '-' || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;
const roundUpToDecimalPlaces = (value: number, decimals: number): number => {
  if (!Number.isFinite(value)) return 0;
  const safeDecimals = Math.max(0, decimals);
  const factor = 10 ** safeDecimals;
  return Math.ceil((value + Number.EPSILON) * factor) / factor;
};

test('BOQ CSV matches template columns and calculations', async ({ page }) => {
  let payloadText = '';

  await page.context().route('**/script.google.com/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    payloadText = request.postData() || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'Success' }),
    });
  });

  await page.goto('/');

  const textInputs = page.locator('input[type="text"]');
  await textInputs.nth(0).fill('Test AO');
  await textInputs.nth(1).fill('BOQ E2E');
  await textInputs.nth(2).fill('Bangkok');

  await page.locator('select').first().selectOption({ index: 2 });

  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(0).fill('100');
  await numberInputs.nth(1).fill('100');
  await numberInputs.nth(2).fill('1');

  await page.locator('select:has(option[value="Tunable White"])').first().selectOption('Tunable White');

  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();

  await expect.poll(() => payloadText, { timeout: 60_000 }).not.toBe('');

  const payload = JSON.parse(payloadText) as { csvFile?: { data: string } };
  expect(payload.csvFile?.data).toBeTruthy();

  const csvBase64 = payload.csvFile?.data ?? '';
  const csvTextWithBom = Buffer.from(csvBase64, 'base64').toString('utf8');
  const csvText = csvTextWithBom.replace(/^\uFEFF/, '');
  const rows = parseCsv(csvText);

  expect(rows.length).toBeGreaterThan(10);
  rows.forEach((row) => expect(row.length).toBe(12));

  const headerIndex = rows.findIndex((row) => row[0] === 'Type' && row[1] === 'Description');
  expect(headerIndex).toBeGreaterThan(0);

  const headerTop = rows[headerIndex];
  expect(headerTop.slice(0, 10)).toEqual([
    'Type',
    'Description',
    'Unit',
    'Qty.',
    'Cost',
    '',
    'SPL',
    '',
    'Total Amount',
    '',
  ]);
  expect(headerTop[10].startsWith('Wattage of LED')).toBe(true);
  expect(headerTop[11].startsWith('Wattage of LED')).toBe(true);

  expect(rows[headerIndex + 1]).toEqual(['', '', '', '', 'Unit Rate', 'Total', 'Unit Rate', 'Total', '', '', '', '']);

  const dataStart = headerIndex + 2;
  const sizeRow = rows[dataStart];
  expect(sizeRow[0]).toBe('SC-01 (rectangle)');
  expect(sizeRow[1]).toBe('Size\n(0.10 x 0.10 m.)');
  expect(sizeRow[2]).toBe('Pcs.');
  expect(sizeRow[3]).toBe('1');
  expect(sizeRow[10]).toBe('2.88');
  expect(sizeRow[11]).toBe('2.88');

  const areaRow = rows[dataStart + 1];
  expect(areaRow[1]).toBe('Area');
  expect(areaRow[2]).toBe('Sq.m.');
  const expectedArea = roundUpToDecimalPlaces((100 * 100) / 1_000_000, 2).toFixed(2);
  expect(areaRow[3]).toBe(expectedArea);

  const costRows = rows.slice(dataStart + 2, dataStart + 10);
  const byDesc = new Map(costRows.map((row) => [row[1], row]));

  const ledRow = byDesc.get('LED Module SLM04 1.44W 8xx Spacing 15x15 cm.');
  expect(ledRow).toBeTruthy();
  if (ledRow) {
    expect(ledRow[3]).toBe('2');
    expect(ledRow[4]).toBe('24.00');
  }

  costRows.forEach((row) => {
    const qty = toNumber(row[3]);
    const unitRate = toNumber(row[4]);
    const total = toNumber(row[5]);
    const splUnitRate = toNumber(row[6]);
    const splTotal = toNumber(row[7]);
    const totalAmount = toNumber(row[8]);

    if (qty === null || unitRate === null) return;

    expect(roundTo2(qty * unitRate)).toBeCloseTo(roundTo2(total ?? 0), 2);
    const expectedSplUnitRate = roundTo2(unitRate / 0.7);
    const expectedSplTotal = roundTo2(qty * (unitRate / 0.7));
    expect(roundTo2(splUnitRate ?? 0)).toBeCloseTo(expectedSplUnitRate, 2);
    expect(roundTo2(splTotal ?? 0)).toBeCloseTo(expectedSplTotal, 2);
    expect(roundTo2(totalAmount ?? 0)).toBeCloseTo(expectedSplTotal, 2);
  });

  const totalRow = rows.find((row) => row[0].startsWith('Total Price') && row[0].includes('/ Pc.'));
  expect(totalRow).toBeTruthy();
  const totalValue = toNumber(totalRow?.[8] ?? '');

  const summaryRow = rows.find((row) => row[0].startsWith('Summary '));
  expect(summaryRow).toBeTruthy();
  const summaryValue = toNumber(summaryRow?.[8] ?? '');

  const grandTotalRow = rows.find((row) => row[0] === 'Total Price');
  expect(grandTotalRow).toBeTruthy();
  const grandTotalValue = toNumber(grandTotalRow?.[8] ?? '');

  const costTotal = costRows.reduce((sum, row) => sum + (toNumber(row[8]) ?? 0), 0);
  expect(roundTo2(costTotal)).toBeCloseTo(roundTo2(totalValue ?? 0), 2);
  expect(roundTo2(totalValue ?? 0)).toBeCloseTo(roundTo2(summaryValue ?? 0), 2);
  expect(roundTo2(summaryValue ?? 0)).toBeCloseTo(roundTo2(grandTotalValue ?? 0), 2);
});
