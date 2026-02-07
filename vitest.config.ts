import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      vscode: new URL('./src/test/__mocks__/vscode.ts', import.meta.url).pathname,
    },
  },
});
