import {test, expect} from '@playwright/test';
import JSZip from 'jszip';
import {give, task, process, done, setSize} from './helpers.js';

// The Flisk bar and analytics load from other sites; the tests do not depend on them.
test.beforeEach(async ({page}) => { await page.route(/flisk\.(si|sh)\//, (r) => r.abort()); await page.goto('/'); });
const caption = (page) => page.locator('.viewer').getByText(/ · \d+ × \d+ px/);

test.describe('layout', () => {
  test('tasks switch from the side panel', async ({page}) => {
    await expect(page.locator('.task-head h2')).toHaveText('Photos');
    await task(page, 'Merge PDFs'); await expect(page.locator('.task-head h2')).toHaveText('Merge PDFs');
    await expect(page.locator('.side-item.on')).toContainText('Merge PDFs');
  });
  test('the task is kept in the URL, and back and a pasted link switch it', async ({page}) => {
    await task(page, 'Merge PDFs'); await expect(page).toHaveURL(/#merge$/);
    await page.goBack(); await expect(page.locator('.task-head h2')).toHaveText('Photos');
    await page.evaluate(() => { location.hash = 'shrink'; }); await expect(page.locator('.task-head h2')).toHaveText('Shrink PDFs');
  });
  test('no horizontal scroll on a phone', async ({page}) => {
    await page.setViewportSize({width: 375, height: 812}); await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('picked files', () => {
  test('shows what you picked, adds more, removes, clears on task switch', async ({page}) => {
    await give(page, [{name: 'red.png', w: 400, h: 300}, {name: 'blue.png', w: 400, h: 300}]);
    await expect(page.locator('.picked')).toHaveCount(2);
    await expect(page.locator('.picked-thumb img').first()).toBeVisible();
    await give(page, [{name: 'green.png', w: 400, h: 300}]); await expect(page.locator('.picked')).toHaveCount(3);
    await page.getByRole('button', {name: 'Remove blue.png'}).click(); await expect(page.locator('.picked')).toHaveCount(2);
    await task(page, 'Merge PDFs'); await expect(page.locator('.picked')).toHaveCount(0);
  });
});

test.describe('photos', () => {
  const run = async (page, specs, preset, extra) => { await give(page, specs); await setSize(page, preset); if (extra) await extra(); await process(page); await expect(done(page)).toBeVisible({timeout: 30000}); };
  test('landscape 4000x3000 -> 1200x900', async ({page}) => { await run(page, [{name: 'a.jpg', type: 'image/jpeg', w: 4000, h: 3000}], 'Web 1200'); await expect(caption(page)).toContainText('1200 × 900'); });
  test('portrait 3000x4000 -> 900x1200', async ({page}) => { await run(page, [{name: 'p.jpg', type: 'image/jpeg', w: 3000, h: 4000}], 'Web 1200'); await expect(caption(page)).toContainText('900 × 1200'); });
  test('square crop', async ({page}) => { await run(page, [{name: 's.png', w: 1600, h: 900}], 'Web 1200', () => page.getByRole('button', {name: 'Square crop'}).click()); await expect(caption(page)).toContainText('900 × 900'); });
  test('small images are not enlarged', async ({page}) => { await run(page, [{name: 't.png', w: 300, h: 200}], 'Documents 2000'); await expect(caption(page)).toContainText('300 × 200'); });
  test('transparent PNG becomes white, not black, as JPEG', async ({page}) => {
    await run(page, [{name: 'tr.png', w: 400, h: 300, draw: 'transparent'}], 'Web 1200');
    const px = await page.evaluate(() => { const im = document.querySelector('.stage img'); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return [...g.getImageData(2, 2, 1, 1).data]; });
    expect(px.slice(0, 3).every((v) => v > 240)).toBe(true);
  });
  test('WebP input works', async ({page}) => { await run(page, [{name: 'w.webp', type: 'image/webp', w: 800, h: 600}], 'Web 1200'); await expect(caption(page)).toContainText('800 × 600'); });
  test('25 large photos in one go', async ({page}) => {
    await run(page, Array.from({length: 25}, (_, i) => ({name: `m${i}.jpg`, type: 'image/jpeg', w: 3000, h: 2000})), 'Web 1200');
    await expect(page.locator('.thumb')).toHaveCount(25);
  });
  test('same file name twice gives two files in the ZIP', async ({page}) => {
    await run(page, [{name: 'dup.png', w: 300, h: 200}, {name: 'dup.png', w: 301, h: 200}], 'Web 1200');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /Download photos\.zip/}).click()]);
    const zip = await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(await dl.path()));
    expect(Object.keys(zip.files).sort()).toEqual(['dup-2.jpg', 'dup.jpg']);
  });
  test('Ukrainian watermark on a photo works', async ({page}) => { await run(page, [{name: 'u.jpg', type: 'image/jpeg', w: 800, h: 600}], 'Web 1200', () => page.getByLabel('Watermark text (optional)').fill('Конфіденційно')); });
  test('a broken image gives a clear message, not a crash', async ({page}) => {
    await give(page, [{kind: 'raw', name: 'bad.jpg', type: 'image/jpeg', bytes: [1, 2, 3, 4]}]); await process(page);
    await expect(page.getByText(/could not be read/)).toBeVisible();
  });
  test('warns when the size is too small for text', async ({page}) => {
    await setSize(page, 'Thumbnail 500'); await expect(page.getByText(/Small size/)).toBeVisible();
    await give(page, [{name: 'd.png', w: 1600, h: 1000, draw: 'text'}]); await process(page);
    await expect(page.getByText(/This is small/)).toBeVisible(); await expect(caption(page)).toContainText('500 × 313');
  });
});

test.describe('pdf', () => {
  const run = async (page, name, specs, fill) => { await task(page, name); await give(page, specs); if (fill) await fill(); await process(page); await expect(done(page)).toBeVisible({timeout: 45000}); };
  test('merge three PDFs into 10 pages, in the order shown', async ({page}) => {
    await run(page, 'Merge PDFs', [{kind: 'pdf', name: 'a.pdf', pages: 2}, {kind: 'pdf', name: 'b.pdf', pages: 3}, {kind: 'pdf', name: 'c.pdf', pages: 5}]);
    await expect(page.getByText('Merged 3 PDF(s) into 10 pages.')).toBeVisible();
  });
  test('moving a file down changes the order', async ({page}) => {
    await task(page, 'Merge PDFs'); await give(page, [{kind: 'pdf', name: 'a.pdf', pages: 1}, {kind: 'pdf', name: 'b.pdf', pages: 1}]);
    await page.locator('.picked').first().getByRole('button', {name: 'Move down'}).click();
    await expect(page.locator('.picked-name').first()).toHaveText('b.pdf');
  });
  test('shrink never makes a text PDF bigger', async ({page}) => {
    await run(page, 'Shrink PDFs', [{kind: 'pdf', name: 'big.pdf', pages: 30}]);
    await expect(page.getByText(/could not be made smaller|only repacked/)).toBeVisible();
    const m = (await page.getByText(/^Done\./).first().innerText()).match(/(\d+) KB → (\d+) KB/); expect(+m[2]).toBeLessThanOrEqual(+m[1] * 1.1);
  });
  test('shrink makes an already-compressed scanned PDF smaller, with less detail if needed', async ({page}) => {
    await run(page, 'Shrink PDFs', [{kind: 'scanpdf', name: 'book.pdf', pages: 8, w: 1500, h: 2100, q: 0.45}]);
    const m = (await page.getByText(/^Done\./).first().innerText()).match(/(\d+) KB → (\d+) KB/);
    expect(+m[2]).toBeLessThan(+m[1] * 0.8);
    await expect(page.getByText(/could not be made smaller/)).toHaveCount(0);
  });
  test('shrink starts at 60% quality, not the photo default', async ({page}) => {
    await task(page, 'Shrink PDFs'); await expect(page.getByLabel('Shrink quality, %')).toHaveValue('60');
  });
  test('watermark in Ukrainian works on a PDF', async ({page}) => { await run(page, 'Watermark PDFs', [{kind: 'pdf', name: 'w.pdf', pages: 2}], () => page.getByLabel('Watermark text (optional)').fill('Конфіденційно')); });
  test('a file that is not a PDF gives a clear message', async ({page}) => {
    await task(page, 'Merge PDFs'); await give(page, [{kind: 'raw', name: 'x.pdf', type: 'application/pdf', bytes: [104, 101, 108, 108, 111]}]); await process(page);
    await expect(page.getByText(/not a valid PDF|could not be read/)).toBeVisible();
  });
  test('two PDFs with the same name keep both in the ZIP', async ({page}) => {
    await run(page, 'Watermark PDFs', [{kind: 'pdf', name: 'same.pdf', pages: 1}, {kind: 'pdf', name: 'same.pdf', pages: 2}]);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /Download pdfs\.zip/}).click()]);
    const zip = await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(await dl.path()));
    expect(Object.keys(zip.files).sort()).toEqual(['same-2.pdf', 'same.pdf']);
  });
});

test.describe('landing pages', () => {
  for (const [slug, hash, heading] of [['resize-photos', 'photo', 'Photos'], ['merge-pdfs', 'merge', 'Merge PDFs'], ['shrink-pdf', 'shrink', 'Shrink PDFs'], ['watermark-pdf', 'mark', 'Watermark PDFs']]) {
    test(`/${slug}/ has a heading and its button opens ${heading}`, async ({page}) => {
      await page.goto(`/${slug}/`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page).toHaveTitle(/Flisk Studio/);
      await page.locator('a.cta').first().click();
      await expect(page.locator('.task-head h2')).toHaveText(heading);
    });
  }
  test('sitemap and robots exist', async ({request}) => {
    expect((await request.get('/sitemap.xml')).ok()).toBe(true);
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://studio.flisk.si/sitemap.xml');
  });
});
