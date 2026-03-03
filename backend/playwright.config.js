import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    use: {
        baseURL: process.env.BASE_URL || 'https://aegis-agent-firewall-production-6371.up.railway.app',
    },
});
