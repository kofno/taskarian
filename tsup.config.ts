import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'], // Your library's entry point
  format: ['esm', 'cjs'], // Build for both ES modules and CommonJS
  dts: true, // Generate TypeScript declaration files (.d.ts)
  splitting: false, // Disable code splitting (usually not needed for libraries)
  sourcemap: true, // Generate sourcemaps for debugging
  clean: true, // Clean the dist directory before building
  minify: true, // Minify the output
  outDir: 'dist', // Output directory
  external: ['@kofno/piper', 'maybeasy'], // Mark these as external dependencies
});
