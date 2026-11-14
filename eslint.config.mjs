import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    // generated: fix the contract or the migration, never the output
    'src/lib/api/generated/**',
    'src/types/database.ts',
    // kit tooling and design artefacts, not app code
    'scripts/**',
    'design/**',
    '.claude/**',
    '.baseleap/**',
  ]),
]);
