import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is used so Nest's decorator metadata (constructor injection by type) works under Vitest.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 60000, hookTimeout: 90000, fileParallelism: false, globals: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
