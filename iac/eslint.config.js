// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config({
  files: ["src/**/*.ts", "src/**/*.js", "test/**/*.ts"],
  extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
});
