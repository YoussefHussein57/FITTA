import { createBaseConfig } from '@fitta/config/eslint/base';
import { createNextConfig } from '@fitta/config/eslint/next';

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...createNextConfig(),
];
