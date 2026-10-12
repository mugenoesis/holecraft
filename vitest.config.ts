import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['packages/*/src/**/*.{ts,tsx}', 'apps/server/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
			exclude: [
				'**/*.test.ts',
				'**/*.d.ts',
				'packages/geometry/src/formats/orcaFilamentDefaults.ts', // generated data
				'apps/server/src/main.ts', // the process entry point, exercised by the Docker smoke test
				'apps/web/src/main.tsx',
			],
			reporter: ['text-summary', 'html', 'lcov'],
			// Floors, set just under what each package has today, so coverage can only go up. The web app's
			// React and WebGL code is exercised by the browser tests (e2e/), which do not count here, so its
			// floor is low; the logic packages are held much higher. Raise a floor when the real number rises.
			thresholds: {
				'packages/core/src/**': { statements: 97, branches: 94, functions: 98, lines: 98 },
				'packages/geometry/src/**': { statements: 95, branches: 82, functions: 97, lines: 98 },
				'apps/server/src/**': { statements: 90, branches: 86, functions: 90, lines: 93 },
				'apps/web/src/**': { statements: 43, branches: 43, functions: 34, lines: 43 },
			},
		},
	},
});
