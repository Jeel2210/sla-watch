// DOM matchers (toBeInTheDocument, …) registered with this app's vitest; jest-dom's own vitest entry
// imports `vitest` from the repo root, where it is not installed.
import * as domMatchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(domMatchers);

afterEach(() => cleanup());

// The whole monorepo's tests run in parallel (turbo), next to core's 460k-row stress test: give async UI
// waits room on a busy machine instead of failing on a slow tick.
configure({ asyncUtilTimeout: 5000 });

// jsdom does not implement scrolling; navigation scrolls to the top.
window.scrollTo = () => {};

// jsdom has no modal dialogs; behave like browsers: showModal opens, close closes and fires "close".
const dialogProto: HTMLDialogElement = HTMLDialogElement.prototype;
if (typeof dialogProto.showModal !== 'function') {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
