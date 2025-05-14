import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  optimizeDeps: {
    include: ["@dynatrace/strato-components-preview", "@dynatrace/strato-components"],
  },
});
