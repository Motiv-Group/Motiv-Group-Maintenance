// Stub for Next.js's `server-only` package under vitest (which runs in a plain
// node environment where the real package's poison-import throws). Aliased in
// vitest.config.ts so any module doing `import 'server-only'` loads harmlessly.
export {}
