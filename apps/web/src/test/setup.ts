import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

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
