import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/",
  plugins: [
    {
      name: "redirect-root-to-trips",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/" || req.url === "") {
            res.writeHead(302, { Location: "/trips/" });
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        trips: resolve(__dirname, "trips/index.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 43148,
  },
  preview: {
    host: "127.0.0.1",
    port: 43148,
  },
});
