import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/legal-pii-redaction/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    watch: {
      ignored: ['**/ML_Pipeline/venv/**'],
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["shield.png", "robots.txt", "placeholder.svg"],
      manifest: {
        name: "Legal PII Redaction",
        short_name: "PII Redact",
        description: "Offline-capable PII redaction tool for legal documents",
        theme_color: "#1e293b",
        background_color: "#0f172a",
        display: "standalone",
        scope: "/legal-pii-redaction/",
        start_url: "/legal-pii-redaction/",
        icons: [
          {
            src: "shield.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "shield.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        // Cache all JS, CSS, HTML assets with cache-first strategy
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Cache PDF.js worker too (used for PDF processing)
            urlPattern: /\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "js-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
