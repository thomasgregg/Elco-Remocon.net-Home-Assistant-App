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
      'input[name="Email"]',
      'input[name="EmailAddress"]',
      'input[name="username"]',
      'input[name="UserName"]',
      'input[id="UserName"]',
      'input[id*="email" i]',
      'input[id*="user" i]'
    ],
    password: [
      'input[type="password"]',
      'input[name="password"]',
      'input[name="Password"]',
      'input[id="Password"]',
      'input[id*="pass" i]'
    ],
    submit: [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Anmelden")',
      'button[id*="login" i]',
      'button[class*="login" i]'
    ],
    cookieAccept: [
      'button:has-text("Accept")',
      'button:has-text("I agree")',
      'button:has-text("OK")',
      'button:has-text("Agree")',
      '#onetrust-accept-btn-handler'
    ]
  };
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if ((await loc.count()) === 0) continue;
      await loc.click({ timeout: 1500 });
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

async function dismissCookieBanner(page, selectors) {
  await clickFirst(page, selectors);
}

async function submitLogin(page, selectors) {
  const clicked = await clickFirst(page, selectors.submit);
  if (!clicked) {
    const passLoc = page.locator(selectors.password[0]).first();
    try {
      if ((await passLoc.count()) > 0) {
        await passLoc.press('Enter');
      } else {
        await page.keyboard.press('Enter');
      }
    } catch {
      await page.keyboard.press('Enter');
    }
  }

  try {
    await Promise.race([
      page.waitForURL((url) => !/login|signin|account/i.test(url.toString()), { timeout: 12000 }),
      page.waitForLoadState('domcontentloaded', { timeout: 12000 })
    ]);
  } catch {
    // fallback below
  }

  // Fallback: submit first form directly if still on login page.
  if (/login|signin|account/i.test(page.url())) {
    try {
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
      });
      await page.waitForTimeout(1500);
    } catch {
      // ignore
    }
  }
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
    await page.goto(HEATING_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);

    const s = loginSelectors();
    await dismissCookieBanner(page, s.cookieAccept);

    const userOk = await fillFirst(page, s.username, HEATING_LOGIN_USERNAME);
    const passOk = await fillFirst(page, s.password, HEATING_LOGIN_PASSWORD);
    if (!userOk || !passOk) {
      throw new Error('Could not locate login form fields for username/password.');
    }

    await submitLogin(page, s);
    await page.waitForTimeout(2500);

    // Always verify by opening target dashboard URL.
    await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
