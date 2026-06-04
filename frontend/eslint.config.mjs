import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
    // Node.js globals for config files
    {
        files: ['*.config.js', '*.config.mjs', '*.config.ts'],
        languageOptions: { globals: globals.node },
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            // v5 strict rules are overly zealous for common init-from-storage patterns
            'react-hooks/set-state-in-effect': 'off',
            'react-hooks/immutability': 'off',
        },
    },
    {
        ignores: ['.next/**', 'node_modules/**'],
    },
    {
        rules: {
            // Enforce next/image over raw <img> tags
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'JSXOpeningElement[name.name="img"]',
                    message: 'Use next/image <Image> instead of <img>.',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
);
