// Browser tests: npx playwright test (README, "Tests"). The emulators (demo- project, made-up accounts; never a live
// project) and the e2e server (the real Worker in Node) start here unless already running. The kit's base config comes
// from app-devkit (.devkit/, put there by setup-browser in CI; copy it once locally).
import { baseConfig } from './.devkit/playwright/base.mjs';
import { emulatorServer } from './.devkit/playwright/helpers.mjs';

export const PORT = 4173;
export default baseConfig({
  testDir: 'e2e',
  testMatch: '*.spec.mjs',
  projects: ['phone'],
  retries: 0,   // a flake is a bug to fix, not a retry
  globalSetup: './e2e/global-setup.mjs',
  // PW_CHROMIUM: a Chromium already on the machine (when the pinned Playwright's own download isn't there)
  use: { baseURL: `http://localhost:${PORT}`, launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
  webServer: [
    emulatorServer({ project: 'demo-starter-app', only: 'firestore,auth', cwd: 'app' }),
    { command: `node e2e/serve.mjs ${PORT}`, url: `http://localhost:${PORT}/app/`, reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
