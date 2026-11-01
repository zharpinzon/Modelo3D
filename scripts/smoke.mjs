import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const url = process.env.SMOKE_URL ?? 'http://localhost:5173/';

// The serverless Chromium build needs a few shared libraries (nspr/nss).
// Extract them from the package's al2023 bundle when missing.
const libDir = '/tmp/chromium-libs/lib';
if (!existsSync(`${libDir}/libnss3.so`)) {
  const pkgRoot = require.resolve('@sparticuz/chromium').replace(/build[/\\].*$/, '');
  const tarBr = `${pkgRoot}bin/al2023.tar.br`;
  if (existsSync(tarBr)) {
    mkdirSync('/tmp/chromium-libs', { recursive: true });
    writeFileSync('/tmp/al2023.tar', brotliDecompressSync(readFileSync(tarBr)));
    execSync('tar -xf /tmp/al2023.tar -C /tmp/chromium-libs');
  }
}
process.env.LD_LIBRARY_PATH = `${libDir}:${process.env.LD_LIBRARY_PATH ?? ''}`;
const executablePath = await chromium.executablePath();
const browser = await pw.launch({
  executablePath,
  args: chromium.args,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Briefing visible
const briefing = await page.locator('.briefing-card h2').textContent();
console.log('BRIEFING:', briefing);

// WebGL canvas present
const canvasCount = await page.locator('canvas.city-canvas').count();
console.log('CANVAS:', canvasCount);

// Start the operation
await page.getByRole('button', { name: 'Iniciar operación' }).click();
await page.waitForTimeout(2500);
const phase = await page.locator('.stat-pill.phase-running').count();
console.log('RUNNING PILL:', phase);

// Select R-04 and send extraction
await page.locator('.roster-card').nth(3).click();
await page.waitForTimeout(300);
const supportBtn = page.locator('.aid-btn.support');
console.log('SUPPORT ENABLED:', await supportBtn.isEnabled());
await supportBtn.click();
await page.waitForTimeout(500);
const toast = await page.locator('.toast').first().textContent();
console.log('TOAST:', toast);

// Let simulation run, then screenshot
await page.waitForTimeout(6000);
await page.screenshot({ path: 'smoke-main.png', fullPage: false });

// Speed + pause toggles
const speedBtn = page.getByTitle('Velocidad');
await speedBtn.click();
await speedBtn.click();
console.log('SPEED:', (await speedBtn.textContent())?.trim());
await page.getByRole('button', { name: 'Pausa' }).click();
await page.waitForTimeout(300);
console.log('PAUSED:', await page.locator('.stat-pill.phase-paused').count());
await page.getByRole('button', { name: 'Reanudar' }).click();
await page.waitForTimeout(300);

// Keyboard selection
await page.keyboard.press('2');
await page.waitForTimeout(300);
const selected = await page.locator('.device-unit h3').textContent();
console.log('SELECTED VIA KEY:', selected);

// MR button degrades gracefully when no camera is available
await page.getByRole('button', { name: 'MR' }).click();
await page.waitForTimeout(1200);
const mrToast = await page.locator('.toast, .camera-error').last().textContent();
console.log('MR FEEDBACK:', mrToast?.replace(/\s+/g, ' ').slice(0, 90));

// Narrow / tablet layout sanity check
await page.setViewportSize({ width: 900, height: 1000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'smoke-narrow.png', fullPage: false });
await page.setViewportSize({ width: 1440, height: 900 });

// Monitor page (same context so BroadcastChannel/localStorage are shared)
const monitor = await context.newPage();
await monitor.setViewportSize({ width: 1280, height: 900 });
await monitor.goto(url.replace(/\/$/, '') + '/monitor.html', { waitUntil: 'networkidle' });
await monitor.waitForTimeout(1500);
const conn = await monitor.locator('.conn-pill').textContent();
console.log('MONITOR:', conn);
await monitor.screenshot({ path: 'smoke-monitor.png', fullPage: false });

// Help modal
await page.bringToFront();
await page.keyboard.press('h');
await page.waitForTimeout(400);
console.log('HELP VISIBLE:', await page.locator('.modal').isVisible());
await page.keyboard.press('h');

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
