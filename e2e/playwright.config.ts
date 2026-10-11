import { defineConfig, devices } from '@playwright/test';

// Run through scripts/e2e.sh: it uses the Playwright Docker image, which has the
// browser and GUI libraries that the host may lack.
const PORT = Number(process.env.EZCAD_E2E_PORT ?? 18090);

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  reporter: [['list']],
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web',
      testMatch: 'web/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // Software WebGL so the viewport renders without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    {
      name: 'desktop',
      testMatch: 'desktop/**/*.spec.ts',
    },
  ],
  webServer: {
    command: `node apps/server/dist/main.js`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      EZCAD_PORT: String(PORT),
      EZCAD_HOST: '127.0.0.1',
      EZCAD_DATA_DIR: 'test-results/e2e-data',
    },
  },
});
