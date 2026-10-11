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
				'packages/core/src/**': { statements: 95, branches: 92, functions: 98, lines: 97 },
				'packages/geometry/src/**': { statements: 92, branches: 75, functions: 95, lines: 97 },
				'apps/server/src/**': { statements: 83, branches: 74, functions: 85, lines: 85 },
				'apps/web/src/**': { statements: 40, branches: 39, functions: 32, lines: 40 },
			},
		},
	},
});
