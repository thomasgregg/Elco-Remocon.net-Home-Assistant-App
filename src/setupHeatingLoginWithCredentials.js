import { chromium } from 'playwright';
import {
  AUTH_DIR,
  HEATING_BROWSER_EXECUTABLE_PATH,
  HEATING_DASHBOARD_URL,
  HEATING_LOGIN_PASSWORD,
  HEATING_LOGIN_URL,
  HEATING_LOGIN_USERNAME,
  HEATING_STORAGE_STATE_PATH,
  ensureDir
} from './heatingConfig.js';

function loginSelectors() {
  return {
    username: [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[id*="email" i]',
      'input[id*="user" i]'
    ],
    password: ['input[type="password"]', 'input[name="password"]', 'input[id*="pass" i]'],
    submit: ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Login")', 'button:has-text("Sign in")']
  };
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if ((await loc.count()) === 0) continue;
      await loc.fill('');
      await loc.fill(value);
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if ((await loc.count()) === 0) continue;
      await loc.click({ timeout: 5000 });
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function setupHeatingLoginWithCredentials() {
  if (!HEATING_LOGIN_USERNAME || !HEATING_LOGIN_PASSWORD) {
    throw new Error('HEATING_LOGIN_USERNAME and HEATING_LOGIN_PASSWORD are required for auto-login.');
  }

  ensureDir(AUTH_DIR);

  const launchOptions = {
    headless: true,
    ignoreDefaultArgs: ['--enable-automation']
  };
  if (HEATING_BROWSER_EXECUTABLE_PATH) {
    launchOptions.executablePath = HEATING_BROWSER_EXECUTABLE_PATH;
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(HEATING_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const s = loginSelectors();
    const userOk = await fillFirst(page, s.username, HEATING_LOGIN_USERNAME);
    const passOk = await fillFirst(page, s.password, HEATING_LOGIN_PASSWORD);
    if (!userOk || !passOk) {
      throw new Error('Could not locate login form fields for username/password.');
    }

    const clicked = await clickFirst(page, s.submit);
    if (!clicked) {
      await page.keyboard.press('Enter');
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3500);
    await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    if (/login|signin|account/i.test(finalUrl) && !finalUrl.includes('/BsbPlantDashboard/')) {
      throw new Error(`Auto-login did not reach dashboard. Current URL: ${finalUrl}`);
    }

    await context.storageState({ path: HEATING_STORAGE_STATE_PATH });
  } finally {
    await context.close();
    await browser.close();
  }

  return HEATING_STORAGE_STATE_PATH;
}

export { setupHeatingLoginWithCredentials };

if (process.argv[1] && process.argv[1].endsWith('setupHeatingLoginWithCredentials.js')) {
  setupHeatingLoginWithCredentials()
    .then((savedPath) => {
      console.log(`Saved heating session state to: ${savedPath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
