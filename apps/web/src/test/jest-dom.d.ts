// jest-dom's own vitest types extend the `vitest` next to jest-dom (repo root), but vitest lives in apps/web.
// Declaring the same extension here attaches the DOM matchers (toBeInTheDocument, …) to this app's vitest.
import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // `any` mirrors jest-dom's own declaration: matchers accept any expected value.
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
