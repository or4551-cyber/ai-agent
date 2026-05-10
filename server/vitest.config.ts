import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // All tests live alongside the code they test in src/__tests__/.
    // Keeps imports trivial and prevents an out-of-tree "tests/" mirror
    // that would silently rot.
    include: ['src/__tests__/**/*.test.ts'],
    // The agent + services touch the filesystem (~/.ai-agent/...). Each
    // test redirects HOME to a tmp dir in beforeEach, so isolation matters.
    environment: 'node',
    testTimeout: 10_000,
    // Don't run tests in parallel within a file — many of our services hold
    // module-level singletons and writing to disk concurrently is asking
    // for flakes.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
