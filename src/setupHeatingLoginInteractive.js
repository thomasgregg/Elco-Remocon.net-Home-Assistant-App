import { chromium } from 'playwright';
import {
  AUTH_DIR,
  BROWSER_CHANNEL,
  HEATING_BROWSER_EXECUTABLE_PATH,
  HEATING_DASHBOARD_URL,
  HEATING_LOGIN_URL,
  HEATING_STORAGE_STATE_PATH,
  ensureDir
} from './heatingConfig.js';

function launchOptions() {
  const options = {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-crash-reporter', '--disable-breakpad']
  };
  if (HEATING_BROWSER_EXECUTABLE_PATH) {
    options.executablePath = HEATING_BROWSER_EXECUTABLE_PATH;
  } else if (BROWSER_CHANNEL) {
    options.channel = BROWSER_CHANNEL;
  }
  return options;
}

async function setupHeatingLoginInteractive() {
  ensureDir(AUTH_DIR);

  const timeoutMs = Number.parseInt(process.env.HEATING_INTERACTIVE_LOGIN_TIMEOUT_MS || '900000', 10);
  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(HEATING_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    console.log('Interactive login started. Complete login in the browser shown via Home Assistant Ingress.');
    console.log(`Waiting up to ${Math.round(timeoutMs / 1000)}s for dashboard auth...`);

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const url = page.url();
      if (url.includes('/BsbPlantDashboard/') || /\/Plant\/Index\//i.test(url)) {
        await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await context.storageState({ path: HEATING_STORAGE_STATE_PATH });
        console.log(`Saved heating session state to: ${HEATING_STORAGE_STATE_PATH}`);
        return HEATING_STORAGE_STATE_PATH;
      }
      await page.waitForTimeout(1000);
    }

    throw new Error(`Interactive login timed out after ${timeoutMs}ms. Current URL: ${page.url()}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

export { setupHeatingLoginInteractive };

if (process.argv[1] && process.argv[1].endsWith('setupHeatingLoginInteractive.js')) {
  setupHeatingLoginInteractive().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
