import { defineConfig } from "vite";

const port = Number(process.env.TICKET_PORT ?? 4173);

export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
