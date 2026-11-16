/**
 * Shared Luau Data
 * 
 * Used for storing retrieved data from the WASM module.
 */

import type {
  LuauLint,
  LuauFlagRecord
} from "./types";

// Simple interface for a promise with it's corresponding resolve & reject methods.

interface ResolvablePromiseWrapper<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

function promiseWithResolvers<T>(): ResolvablePromiseWrapper<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Promise for getting all Luau lints
export const getAllLints = promiseWithResolvers<LuauLint[]>();

// Promise for getting all Luau flags
export const getAllFlags = promiseWithResolvers<LuauFlagRecord>();
