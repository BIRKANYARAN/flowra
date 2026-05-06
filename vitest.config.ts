import { defineConfig } from 'vitest/config'
import { resolve }       from 'path'

export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    exclude:     ['node_modules', '.next'],
    globals:     true,
    environment: 'node',
    // Prevent test runs from hanging if an import tries to start a server
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      // Matches tsconfig.json's "@/*": ["./*"]
      '@': resolve(__dirname),
    },
  },
})
