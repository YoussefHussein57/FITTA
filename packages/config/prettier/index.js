/**
 * Shared Prettier configuration.
 *
 * `endOfLine: 'lf'` pairs with .gitattributes so a Windows checkout does not
 * produce whole-file diffs on a one-line change (NFR-06).
 *
 * @type {import('prettier').Config}
 */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  endOfLine: 'lf',
};

export default config;
