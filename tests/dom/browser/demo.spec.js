import { expect, test } from "@playwright/test";

test("built demo examples load from their workspace artifact", async ({ page }) => {
	const errors = [];

	page.on("pageerror", (error) => errors.push(error.message));

	await page.goto("/demo/example");

	await expect(page.locator("#updateMain h1")).toHaveText("Signal DOM Concept!");

	await page.goto("/demo/example/basic-element");

	await expect(page.locator("basic-element")).toHaveJSProperty("content", "Edit my content property.");

	await page.goto("/demo/example/button");

	await expect(page.locator("button-element")).toHaveJSProperty("href", "#href");
	await expect(page.locator("button-element a")).toHaveAttribute("href", "#href");
	await expect(page.locator("button-element button")).toHaveCount(0);

	expect(errors).toEqual([]);
});
