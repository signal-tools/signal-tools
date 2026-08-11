import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],
	testDir: "browser",
	use: {
		baseURL: "http://127.0.0.1:4173",
		headless: true,
	},
	webServer: {
		command: "FUNDOMENTAL_TEST_PORT=4173 bun scripts/serve.ts",
		reuseExistingServer: !process.env.CI,
		url: "http://127.0.0.1:4173/__test__",
	},
});
