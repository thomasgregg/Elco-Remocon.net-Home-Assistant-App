import fs from 'node:fs';
import { chromium } from 'playwright';
import {
  AUTH_DIR,
  HEATING_DASHBOARD_URL,
  HEATING_STORAGE_STATE_PATH,
  ensureDir
} from './heatingConfig.js';

async function main() {
  ensureDir(AUTH_DIR);

  const endpoint = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
  const browser = await chromium.connectOverCDP(endpoint);

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No Chrome contexts found. Open a normal Chrome window first.');
  }

  const context = contexts[0];
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const state = await context.storageState();
  fs.writeFileSync(HEATING_STORAGE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);

  await browser.close();
  console.log(`Saved heating session state to: ${HEATING_STORAGE_STATE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
