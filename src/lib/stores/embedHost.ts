/**
 * Embed Host Bridge
 *
 * An embedded playground cannot resize its own iframe, so the expand button
 * asks the host page to do it. Hosts opt in by loading `/embed.js`, which
 * answers the handshake below and applies the requested height.
 */

import { writable } from 'svelte/store';

const MESSAGE_SOURCE = 'luau-playground';

interface HostMessage {
  source: typeof MESSAGE_SOURCE;
  type: 'ready' | 'host-ready' | 'resize';
  height?: number | null;
}

/**
 * Whether the host page can resize this embed. Stays false when the playground
 * is not framed, or when the host has not loaded the embed script.
 */
export const hostCanResize = writable(false);

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/**
 * Announce this embed to the host and listen for its acknowledgement.
 * Returns a teardown function.
 */
export function initHostBridge(): () => void {
  if (!isFramed()) return () => {};

  const onMessage = (event: MessageEvent<HostMessage>) => {
    if (event.source !== window.parent) return;
    if (event.data?.source !== MESSAGE_SOURCE) return;
    if (event.data.type === 'host-ready') hostCanResize.set(true);
  };

  window.addEventListener('message', onMessage);
  post({ source: MESSAGE_SOURCE, type: 'ready' });

  return () => window.removeEventListener('message', onMessage);
}

/**
 * Ask the host for a specific embed height, or `null` to restore the original.
 */
export function requestHostHeight(height: number | null): void {
  post({ source: MESSAGE_SOURCE, type: 'resize', height });
}

function post(message: HostMessage): void {
  if (!isFramed()) return;
  // The payload carries no user data, so any host origin may receive it
  window.parent.postMessage(message, '*');
}
