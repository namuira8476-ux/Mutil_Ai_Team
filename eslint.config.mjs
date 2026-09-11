import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [
 {ignores:['node_modules/**','dist/**','dist-electron/**','release/**','outputs/**','.runtime-test/**']},
 {files:['electron/**/*.ts','src/**/*.{ts,tsx}','tests/**/*.ts','*.ts'],languageOptions:{parser:ts.parser,parserOptions:{ecmaVersion:'latest',sourceType:'module'}},plugins:{'@typescript-eslint':ts.plugin},rules:{...js.configs.recommended.rules,'no-undef':'off','no-unused-vars':'off','no-empty':['error',{allowEmptyCatch:true}], 'no-constant-binary-expression':'error','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrors:'none'}]}}
];
