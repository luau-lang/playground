/// <reference types="vite/client" />

declare module 'virtual:compiled-patterns' {
  /** Map of Oniguruma pattern string -> [source, flags] tuple, or null if compilation failed */
  export const compiledPatterns: Record<string, [string, string] | null>;
}

