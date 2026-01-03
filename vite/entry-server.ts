import { render } from 'svelte/server';
import App from '../src/App.svelte';

export function renderApp() {
  return render(App);
}

