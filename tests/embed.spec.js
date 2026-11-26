import {test, expect} from '@playwright/test';
import {give} from './helpers.js';

// Chat (chat.flisk.si) frames Studio with ?embed=1 and sends it commands with postMessage. Here the page sends them to itself:
// its origin is localhost, which Studio accepts the same way it accepts chat.
test.beforeEach(async ({page}) => { await page.route(/flisk\.(si|sh)\//, (r) => r.abort()); await page.goto('/?embed=1#editor'); });
const ask = (page, msg) => page.evaluate((msg) => new Promise((ok) => {
  window.addEventListener('message', function f(e) { if (e.data && e.data.type === 'reply') { window.removeEventListener('message', f); ok(e.data); } });
  window.postMessage({flisk: 'studio', ...msg}, location.origin);
}), msg);
const dims = (page) => page.locator('.ed-dims');

test.describe('embedded in chat', () => {
  test('the side panel is hidden and the editor is open', async ({page}) => {
    await expect(page.locator('.side')).toBeHidden();
    await expect(page.locator('.task-head h2')).toHaveText('Editor');
  });
  test('with no photo, a command says so', async ({page}) => {
    const r = await ask(page, {cmd: 'removeBackground'});
    expect(r.ok).toBe(false); expect(r.note).toMatch(/Open a photo/);
  });
  test('"remove the background" clears the backdrop', async ({page}) => {
    await give(page, [{name: 'pic.png', w: 400, h: 300, draw: 'subject'}]); await expect(dims(page)).toBeVisible();
    const r = await ask(page, {cmd: 'removeBackground'});
    expect(r.ok).toBe(true); expect(r.note).toMatch(/Background removed/);
  });
  test('"crop to square" crops, and a bare "crop" asks for a shape', async ({page}) => {
    await give(page, [{name: 'pic.png', w: 400, h: 300, draw: 'subject'}]); await expect(dims(page)).toBeVisible();
    const ask0 = await ask(page, {cmd: 'crop', ratio: null});
    expect(ask0.ok).toBe(false); expect(ask0.note).toMatch(/Which shape/);
    const r = await ask(page, {cmd: 'crop', ratio: '1:1'});
    expect(r.ok).toBe(true); await expect(dims(page)).toContainText('300 × 300 px');
  });
  test('a message from another site is ignored', async ({page}) => {
    await give(page, [{name: 'pic.png', w: 400, h: 300, draw: 'subject'}]); await expect(dims(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {data: {flisk: 'studio', cmd: 'crop', ratio: '1:1'}, origin: 'https://evil.example'})));
    await expect(dims(page)).toContainText('400 × 300 px');
  });
  test('the chat sets the look: dark from the address, light live from a message', async ({page}) => {
    await page.goto('/?embed=1&mode=dark#editor');
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    await expect.poll(theme).toBe('dark');
    await page.evaluate(() => window.postMessage({flisk: 'studio', type: 'mode', mode: 'light'}, location.origin));
    await expect.poll(theme).toBe('light');
  });
  test('a look from another site is ignored', async ({page}) => {
    await page.goto('/?embed=1&mode=dark#editor');
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {data: {flisk: 'studio', type: 'mode', mode: 'light'}, origin: 'https://evil.example'})));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  });
});
