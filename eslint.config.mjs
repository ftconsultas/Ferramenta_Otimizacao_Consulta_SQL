import js from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import globals from "globals";

export default [
    // 1. Base Recommended Configs
    js.configs.recommended,
    sonarjs.configs.recommended,
    security.configs.recommended,

    // 2. Custom Configuration and Rules
    {
        files: ["src/**/*.js", "tests/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.browser,
                // Electron specific globals if needed, but browser+node covers it usually
                process: "readonly",
                __dirname: "readonly",
                window: "readonly",
                document: "readonly",
                jest: "readonly",
                describe: "readonly",
                it: "readonly",
                expect: "readonly",
                beforeEach: "readonly",
                beforeAll: "readonly"
            }
        },
        rules: {
            // General Rules
            "no-unused-vars": "warn",
            
            // Code Quality & Maintenance (Bad Smells)
            "complexity": ["warn", 10],
            "max-lines": ["warn", 500],
            "max-params": ["warn", 5],
            
            // Plugin Specific Overrides (Optional)
            "sonarjs/cognitive-complexity": ["warn", 15],
            "security/detect-object-injection": "off" // Muitas vezes gera falsos positivos em Electron
        }
    },

    // 3. Ignore Files
    {
        ignores: [
            "node_modules/**", 
            "dist/**", 
            "coverage/**", 
            "*.config.js", 
            "*.config.mjs"
        ]
    }
];
