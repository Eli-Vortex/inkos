import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    // The app entry is ~1.7 MB minified (~490 kB gzip) and is served from
    // localhost by the desktop tool, so the default 500 kB advisory is not
    // actionable here. Vendor splitting keeps the long-lived React chunk
    // separately cacheable; the lazy diagram/highlight chunks stay lazy.
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@actalk/inkos-core")) return "vendor-inkos-core";
          if (id.includes("@mariozechner")) return "vendor-agent";
          // React and the component primitives import each other through JSX
          // runtimes and context helpers. Keeping them in one cacheable chunk
          // avoids Rollup producing a vendor-ui <-> vendor-react cycle.
          if (
            id.includes("@base-ui")
            || id.includes("@radix-ui")
            || id.includes("react-dom")
            || id.includes("scheduler")
            || id.includes("/node_modules/react/")
            || id.includes("/react/index")
          ) return "vendor-react-ui";
          // Everything else keeps Rollup's natural (often lazy) chunking — a
          // catch-all here would merge the lazy syntax-highlight/diagram
          // libraries into one eagerly-loaded multi-megabyte chunk.
          return undefined;
        },
      },
    },
  },
  server: {
    port: 4567,
    proxy: {
      "/api/v1/events": {
        target: `http://localhost:${process.env.INKOS_STUDIO_PORT ?? "4569"}`,
        changeOrigin: true,
        // SSE needs unbuffered streaming — bypass http-proxy response handling
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
            proxyRes.pipe(res);
          });
        },
      },
      "/api": {
        target: `http://localhost:${process.env.INKOS_STUDIO_PORT ?? "4569"}`,
        changeOrigin: true,
      },
    },
  },
});
