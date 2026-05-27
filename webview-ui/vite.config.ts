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
      // The @dynatrace-sdk/* packages below are Dynatrace app runtime packages used by
      // @dynatrace/strato-components-preview internals. They are not installed (and not
      // meaningful) in the VS Code webview context, so we redirect them to no-op stubs
      // to keep the bundle self-contained.
      "@dynatrace-sdk/app-environment": path.resolve(
        __dirname,
        "src/stubs/dynatrace-sdk-app-environment.ts",
      ),
      "@dynatrace-sdk/navigation": path.resolve(
        __dirname,
        "src/stubs/dynatrace-sdk-navigation.ts",
      ),
      "@dynatrace-sdk/client-notification": path.resolve(
        __dirname,
        "src/stubs/dynatrace-sdk-client-notification.ts",
      ),
      "@dynatrace-sdk/client-filter-segment-management": path.resolve(
        __dirname,
        "src/stubs/dynatrace-sdk-client-filter-segment-management.ts",
      ),
      "@dynatrace-sdk/client-query": path.resolve(
        __dirname,
        "src/stubs/dynatrace-sdk-client-query.ts",
      ),
      "@dynatrace-sdk/react-hooks": path.resolve(
        __dirname,
        "src/stubs/dynatrace-sdk-react-hooks.ts",
      ),
    },
  },
  optimizeDeps: {
    include: ["@dynatrace/strato-components-preview", "@dynatrace/strato-components"],
  },
});
