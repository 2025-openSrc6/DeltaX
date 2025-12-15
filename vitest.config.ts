import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  /**
   * IMPORTANT (sandbox/CI):
   * - Vite/Vitest는 기본적으로 repo root의 `.env.local` 등을 자동 로드하려고 시도한다.
   * - `.env.local`은 보통 gitignored 파일이며, 이 환경에서는 접근이 막혀 테스트가 실패할 수 있다.
   * - 따라서 테스트 실행 시 env 파일 탐색 경로를 별도 디렉토리로 분리한다.
   */
  envDir: resolve(__dirname, './.vitest-env'),
  test: {
    globals: true,
    environment: 'node',
    /**
     * In restricted environments, process forking/termination may fail (EPERM on kill).
     * Use threads pool to avoid managing child processes.
     */
    pool: 'threads',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist', '.open-next'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html'],
      include: [
        // API Routes
        'app/api/bets/**/*.ts',
        'app/api/health/**/*.ts',
        'app/api/rounds/**/*.ts',
        'app/api/cron/**/*.ts',
        // Business Logic
        'lib/bets/**/*.ts',
        'lib/rounds/**/*.ts',
        'lib/config/**/*.ts',
        'lib/cron/**/*.ts',
        'lib/sui/**/*.ts',
        'lib/shared/**/*.ts',
      ],
      exclude: [
        'node_modules',
        '.next',
        'dist',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types.ts',
        'db/schema/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
