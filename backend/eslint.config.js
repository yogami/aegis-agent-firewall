import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import globals from "globals";

export default [
    {
        ignores: ["node_modules/**", "dist/**"]
    },
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                Buffer: "readonly",
                setTimeout: "readonly"
            }
        },
        plugins: {
            sonarjs,
            security
        },
        rules: {
            ...sonarjs.configs.recommended.rules,
            ...security.configs.recommended.rules,
            "no-unused-vars": ["warn", { "args": "none", "caughtErrors": "none" }],
            "no-undef": "error",
            "complexity": ["error", 3],
            "sonarjs/cognitive-complexity": ["error", 3],
            "sonarjs/no-duplicate-string": "warn",
            "sonarjs/no-identical-functions": "error",
            "security/detect-object-injection": "warn"
        }
    }
];
