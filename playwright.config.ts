import { defineConfig, devices } from "@playwright/test";

const liveBaseUrl = process.env.BASE_URL;
const ticketPort = Number(process.env.TICKET_PORT ?? 4173);
const localBaseUrl = `http://127.0.0.1:${ticketPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: liveBaseUrl ?? localBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(liveBaseUrl
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: localBaseUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { TICKET_PORT: String(ticketPort) },
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
