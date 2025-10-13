import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "build",
    target: "es2015",
    assetsDir: "",
    rollupOptions: {
      input: "index.html",
      output: {
        format: "iife",
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@common": path.resolve(__dirname, "../common"),
    },
  },
  optimizeDeps: {
    include: ["@dynatrace/strato-components-preview", "@dynatrace/strato-components"],
  },
});
