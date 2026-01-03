import './app.css';
import App from './App.svelte';
import { hydrate, mount } from 'svelte';

// Polyfill popover API if not supported
if (!HTMLElement.prototype.hasOwnProperty('popover')) {
  import('@oddbird/popover-polyfill');
}

// Polyfill CSS anchor positioning if not supported
if (!CSS.supports('anchor-name', '--a')) {
  import('@oddbird/css-anchor-positioning');
}

const target = document.getElementById('app')!;

// Use hydrate if there's pre-rendered content, otherwise mount fresh
// Check for actual element children (not just text/comment nodes)
const hasPrerenderedContent = target.firstElementChild !== null;

const app = hasPrerenderedContent
  ? hydrate(App, { target })
  : mount(App, { target });

export default app;
