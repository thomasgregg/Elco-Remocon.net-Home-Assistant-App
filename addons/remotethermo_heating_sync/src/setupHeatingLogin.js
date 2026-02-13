import { chromium } from 'playwright';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  AUTH_DIR,
  BROWSER_CHANNEL,
  HEATING_LOGIN_URL,
  HEATING_STORAGE_STATE_PATH,
  ensureDir
} from './heatingConfig.js';

async function main() {
  ensureDir(AUTH_DIR);

  const browser = await chromium.launch({
    headless: false,
    channel: BROWSER_CHANNEL,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-crash-reporter', '--disable-breakpad']
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(HEATING_LOGIN_URL, { waitUntil: 'domcontentloaded' });

  console.log('\nComplete login in the opened browser window.');
  console.log('Wait until the heating dashboard shows all values, then press Enter to save session.\n');

  const rl = readline.createInterface({ input, output });
  await rl.question('Press Enter here when login is complete: ');
  rl.close();

  await context.storageState({ path: HEATING_STORAGE_STATE_PATH });
  await context.close();
  await browser.close();

  console.log(`Saved heating session state to: ${HEATING_STORAGE_STATE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
