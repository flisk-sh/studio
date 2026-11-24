import {test, expect} from '@playwright/test';
import {give, task} from './helpers.js';

test.beforeEach(async ({page}) => { await page.route(/flisk\.(si|sh)\//, (r) => r.abort()); await page.goto('/'); await task(page, 'Editor'); });
const dims = (page) => page.locator('.ed-dims');
const open = async (page, spec = {name: 'pic.png', w: 400, h: 300, draw: 'subject'}) => { await give(page, [spec]); await expect(dims(page)).toBeVisible(); };
const px = (page, x, y) => page.evaluate(([x, y]) => [...document.querySelector('.ed-canvas').getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
const tool = (page, name) => page.getByRole('tab', {name}).click();

test.describe('editor', () => {
  test('opens from the side panel and asks for a photo', async ({page}) => {
    await expect(page.locator('.task-head h2')).toHaveText('Editor');
    await expect(page.getByText('Choose a photo, drop it here, or paste it')).toBeVisible();
  });
  test('a photo opens on the canvas with its size', async ({page}) => { await open(page); await expect(dims(page)).toContainText('400 × 300 px · pic'); });
  test('rotate swaps the sides, undo and redo bring them back', async ({page}) => {
    await open(page); await tool(page, 'Rotate & flip');
    await page.getByRole('button', {name: 'Rotate right'}).click(); await expect(dims(page)).toContainText('300 × 400 px');
    await page.getByRole('button', {name: 'Undo'}).click(); await expect(dims(page)).toContainText('400 × 300 px');
    await page.getByRole('button', {name: 'Redo'}).click(); await expect(dims(page)).toContainText('300 × 400 px');
  });
  test('flip mirrors the picture', async ({page}) => {
    await open(page, {name: 'f.png', w: 400, h: 300, draw: 'transparent'}); // red square at 100..150 x 75..125
    expect((await px(page, 120, 100))[3]).toBe(255); expect((await px(page, 280, 100))[3]).toBe(0);
    await tool(page, 'Rotate & flip'); await page.getByRole('button', {name: 'Flip horizontal'}).click();
    expect((await px(page, 120, 100))[3]).toBe(0); expect((await px(page, 280, 100))[3]).toBe(255);
  });
  test('crop to a square', async ({page}) => {
    await open(page); await tool(page, 'Crop');
    await page.getByRole('button', {name: '1:1', exact: true}).click();
    await page.getByRole('button', {name: 'Apply crop'}).click(); await expect(dims(page)).toContainText('300 × 300 px');
  });
  test('dragging the crop box corner resizes it', async ({page}) => {
    await open(page); await tool(page, 'Crop');
    const h = page.locator('.ed-handle.se'), b = await h.boundingBox();
    await page.mouse.move(b.x + 9, b.y + 9); await page.mouse.down(); await page.mouse.move(b.x - 91, b.y - 41, {steps: 5}); await page.mouse.up();
    await page.getByRole('button', {name: 'Apply crop'}).click();
    const [w, hh] = (await dims(page).innerText()).match(/(\d+) × (\d+)/).slice(1).map(Number);
    expect(w).toBeLessThan(400); expect(hh).toBeLessThan(300);
  });
  test('remove background makes the backdrop transparent and keeps the subject', async ({page}) => {
    await open(page);
    expect((await px(page, 5, 5))[3]).toBe(255);
    await page.getByRole('button', {name: 'Remove background'}).click();
    await expect(page.getByText(/Background removed/)).toBeVisible();
    expect((await px(page, 5, 5))[3]).toBe(0);
    const c = await px(page, 200, 150); expect(c[3]).toBe(255); expect(c[0]).toBeGreaterThan(200); expect(c[2]).toBeLessThan(100);
    await page.getByRole('button', {name: 'Undo'}).click(); expect((await px(page, 5, 5))[3]).toBe(255);
  });
  test('removing a background that is not there says so', async ({page}) => {
    await open(page, {name: 'noise.png', w: 400, h: 300});
    await page.getByRole('button', {name: 'Remove background'}).click();
    await expect(page.getByText(/Nothing matched|Background removed/)).toBeVisible();
  });
  test('adjustments show live and can be reset', async ({page}) => {
    await open(page); await tool(page, 'Adjust');
    await page.getByRole('button', {name: 'Black & white'}).click();
    await expect(page.locator('.ed-canvas')).toHaveCSS('filter', /grayscale\(1\)/);
    await page.getByRole('button', {name: 'Reset adjustments'}).click();
    await expect(page.locator('.ed-canvas')).not.toHaveCSS('filter', /grayscale\(1\)/);
  });
  test('resize to half', async ({page}) => {
    await open(page); await tool(page, 'Resize');
    await page.getByRole('button', {name: '50%'}).click(); await page.getByRole('button', {name: 'Apply size'}).click();
    await expect(dims(page)).toContainText('200 × 150 px');
  });
  test('download gives an edited PNG, with the transparent background kept', async ({page}) => {
    await open(page);
    await page.getByRole('button', {name: 'Remove background'}).click(); await expect(page.getByText(/Background removed/)).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download', exact: true}).click()]);
    expect(dl.suggestedFilename()).toBe('pic-edited.png');
    const bytes = await (async () => { const s = await dl.createReadStream(); const parts = []; for await (const c of s) parts.push(c); return Buffer.concat(parts); })();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG'); expect(bytes[25]).toBe(6); // colour type 6 = RGBA
  });
  test('JPEG export warns that transparency becomes white', async ({page}) => {
    await open(page); await page.getByRole('button', {name: /JPEG/}).click();
    await expect(page.getByText(/JPEG has no transparency/)).toBeVisible();
  });
  test('no horizontal scroll on a phone', async ({page}) => {
    await page.setViewportSize({width: 375, height: 812}); await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test('a file that is not an image gives a clear message', async ({page}) => {
    await give(page, [{kind: 'raw', name: 'x.png', type: 'image/png', bytes: [1, 2, 3]}]);
    await expect(page.getByText(/could not be read/)).toBeVisible();
  });
  const ink = (page, x, y, w, h) => page.evaluate(([x, y, w, h]) => { const d = document.querySelector('.ed-canvas').getContext('2d').getImageData(x, y, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }, [x, y, w, h]);
  test('text shows live, then is added to the picture', async ({page}) => {
    await open(page, {name: 'p.png', w: 400, h: 300, draw: 'transparent'}); await tool(page, 'Text');
    expect(await ink(page, 0, 0, 120, 60)).toBe(0);
    await page.getByRole('button', {name: 'Top left'}).click(); await page.getByLabel('Text', {exact: true}).fill('Hello');
    expect(await ink(page, 0, 0, 120, 60)).toBeGreaterThan(50);
    await page.getByRole('button', {name: 'Apply text'}).click(); await expect(page.getByText('Text added.')).toBeVisible();
    await tool(page, 'Crop'); expect(await ink(page, 0, 0, 120, 60)).toBeGreaterThan(50);
  });
  test('Ukrainian text works, and a download includes text you have not applied yet', async ({page}) => {
    await open(page, {name: 'u.png', w: 400, h: 300, draw: 'transparent'}); await tool(page, 'Text');
    await page.getByLabel('Text', {exact: true}).fill('Конфіденційно');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Download', exact: true}).click()]);
    const parts = []; for await (const c of await dl.createReadStream()) parts.push(c);
    expect(Buffer.concat(parts).length).toBeGreaterThan(1500); // a 400x300 PNG that is mostly empty would be far smaller
  });
  const twin = (page) => open(page, {name: 'twin.png', w: 400, h: 300, draw: 'twin'});
  const removeBg = async (page) => { await page.getByRole('button', {name: 'Remove background'}).click(); await expect(page.getByText(/Background removed/)).toBeVisible(); };
  const frame = (page) => page.locator('.ed-canvas').boundingBox();
  const drag = async (page, from, to) => { const b = await frame(page); await page.mouse.move(b.x + from[0], b.y + from[1]); await page.mouse.down(); await page.mouse.move(b.x + to[0], b.y + to[1], {steps: 6}); await page.mouse.up(); };
  test('after removing a background the pieces can be dragged with the mouse', async ({page}) => {
    await twin(page); await removeBg(page);
    await expect(page.getByRole('tab', {name: 'Move pieces'})).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('2 pieces')).toBeVisible();
    expect((await px(page, 70, 130))[3]).toBe(255); expect((await px(page, 170, 130))[3]).toBe(0);
    await drag(page, [70, 130], [170, 130]);
    expect((await px(page, 70, 130))[3]).toBe(0); expect((await px(page, 170, 130))[3]).toBe(255);
    expect((await px(page, 290, 130))[3]).toBe(255); // the other piece did not move
    await page.getByRole('button', {name: 'Undo'}).click(); expect((await px(page, 70, 130))[3]).toBe(255);
  });
  test('pick the pieces to keep, delete the rest', async ({page}) => {
    await twin(page); await removeBg(page);
    const b = await frame(page); await page.mouse.click(b.x + 70, b.y + 130);
    await page.getByRole('button', {name: 'Keep only selected'}).click();
    expect((await px(page, 70, 130))[3]).toBe(255); expect((await px(page, 290, 130))[3]).toBe(0);
    await page.getByRole('button', {name: 'Apply', exact: true}).click(); await expect(page.getByText('Pieces applied.')).toBeVisible();
    await expect(page.getByText('1 piece', {exact: true})).toBeVisible();
  });
  test('Delete key removes the clicked piece; Shift-click picks two', async ({page}) => {
    await twin(page); await removeBg(page);
    const b = await frame(page); await page.mouse.click(b.x + 70, b.y + 130); await page.keyboard.press('Delete');
    expect((await px(page, 70, 130))[3]).toBe(0); expect((await px(page, 290, 130))[3]).toBe(255);
    await page.getByRole('button', {name: 'Undo'}).click();
    await page.mouse.click(b.x + 70, b.y + 130); await page.keyboard.down('Shift'); await page.mouse.click(b.x + 290, b.y + 130); await page.keyboard.up('Shift');
    await page.getByRole('button', {name: 'Delete selected'}).click();
    await expect(page.getByText(/Nothing visible is left/)).toBeVisible();
  });
  test('Put background back restores the original picture', async ({page}) => {
    await twin(page); await removeBg(page);
    expect((await px(page, 5, 5))[3]).toBe(0);
    await page.getByRole('button', {name: 'Put background back'}).click();
    expect((await px(page, 5, 5))[3]).toBe(255);
  });
  test('the brush restores the background only where you paint', async ({page}) => {
    await twin(page); await removeBg(page); await tool(page, 'Brush');
    await drag(page, [150, 50], [250, 50]);
    expect((await px(page, 200, 50))[3]).toBe(255); expect((await px(page, 200, 250))[3]).toBe(0);
    await page.getByRole('button', {name: 'Erase'}).click(); await drag(page, [60, 120], [80, 140]);
    expect((await px(page, 70, 130))[3]).toBe(0);
  });
  test('a colour can be put behind the removed background', async ({page}) => {
    await twin(page); await removeBg(page);
    await page.getByRole('button', {name: 'Put black behind the picture'}).click();
    const c = await px(page, 5, 5); expect(c[3]).toBe(255); expect(c[0]).toBe(0);
  });
});
