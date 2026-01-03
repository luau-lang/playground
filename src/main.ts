import './app.css';
import App from './App.svelte';
import { hydrate, mount } from 'svelte';

const target = document.getElementById('app')!;

// Use hydrate if there's pre-rendered content, otherwise mount fresh
// Check for actual element children (not just text/comment nodes)
const hasPrerenderedContent = target.firstElementChild !== null;

const app = hasPrerenderedContent
  ? hydrate(App, { target })
  : mount(App, { target });

export default app;
