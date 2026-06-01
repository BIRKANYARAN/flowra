import { defineConfig } from 'vitest/config'
import { resolve }       from 'path'

export default defineConfig({
  test: {
    // .test.ts → node env (default). .test.tsx → opt into jsdom via a
    // `// @vitest-environment jsdom` comment at the top of the file, so the
    // existing node-env suite is unaffected.
    include:     ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude:     ['node_modules', '.next'],
    globals:     true,
    environment: 'node',
    // Prevent test runs from hanging if an import tries to start a server
    testTimeout: 10_000,
  },
  // Automatic JSX runtime (matches Next.js) so component tests need no React import.
  esbuild: {
    jsx:             'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      // Matches tsconfig.json's "@/*": ["./*"]
      '@': resolve(__dirname),
    },
  },
})
