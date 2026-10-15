import { defineConfig } from "vite";

// In dev, serve the Vercel function under /api/qr so `npm run dev` works alone.
const api = () => ({
  name: "qrquest-api",
  configureServer(server) {
    server.middlewares.use("/api/qr", async (req, res) => {
      const { default: handler } = await server.ssrLoadModule("/api/qr.js");
      req.url = req.originalUrl; // keep the query string
      handler(req, res);
    });
  },
});

export default defineConfig({ plugins: [api()] });
