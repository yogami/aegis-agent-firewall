import { test, expect } from '@playwright/test';

const TARGET_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

test.describe('SemaProof Agent Firewall Split-Screen Demo', () => {
    test('should load the initial dashboard successfully', async ({ page }) => {
        await page.goto(TARGET_URL);
        await expect(page.locator('h1')).toContainText('SemaProof');
        await expect(page.locator('text=Agent Idle. Monitoring Slack & GitHub...')).toBeVisible();
        await expect(page.locator('button:has-text("Inject Poisoned Prompt")')).toBeVisible();
    });

    test('should execute the catastrophe simulation correctly', async ({ page }) => {
        await page.goto(TARGET_URL);
        // Click the inject button
        await page.click('button:has-text("Inject Poisoned Prompt")');

        // Wait for the simulation stages (it takes about 6-7 seconds to complete the simulation)
        await expect(page.locator('text=TRANSACTION DENIED BY GUARDIANS')).toBeVisible({ timeout: 15000 });

        // Check Guardian Nodes blocked it
        await expect(page.locator('text=THRESHOLD FAILED [0/5]')).toBeVisible();

        // Check Database implies Protected
        await expect(page.locator('text=PROTECTED / HEALTHY')).toBeVisible();

        // Check Metrics Updated
        await expect(page.locator('text=42ms')).toBeVisible();
    });
});
