/**
 * Luau Embed - Lightweight iframe-based web component
 * 
 * Creates an iframe pointing to play.luau.org with embed mode enabled.
 * This gives full playground functionality with minimal bundle size.
 */

import LZString from 'lz-string';

const PLAYGROUND_URL = 'https://play.luau.org';

interface ShareState {
  files: Record<string, string>;
  active: string;
  v: number;
}

/**
 * Encode files to URL-safe format (same as main playground)
 */
function encodeFiles(files: Record<string, string>, activeFile: string): string {
  const state: ShareState = {
    files,
    active: activeFile,
    v: 1,
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

/**
 * <luau-file> - Defines a file within a <luau-embed>
 */
class LuauFile extends HTMLElement {
  get name(): string {
    return this.getAttribute('name') || 'main.luau';
  }
  
  get code(): string {
    return this.textContent?.trim() || '';
  }
}

/**
 * <luau-embed> - Embeds a Luau playground via iframe
 * 
 * Attributes:
 * - height: iframe height (default: "400px")
 * - theme: "light" | "dark" | "auto" (default: "auto")
 * - base-url: Override the playground URL (for local testing)
 */
class LuauEmbed extends HTMLElement {
  private iframe: HTMLIFrameElement | null = null;
  
  static get observedAttributes() {
    return ['height', 'theme', 'base-url'];
  }
  
  connectedCallback() {
    this.render();
  }
  
  disconnectedCallback() {
    this.iframe = null;
  }
  
  attributeChangedCallback() {
    if (this.iframe) {
      this.render();
    }
  }
  
  private render() {
    // Parse files from <luau-file> children
    const files = this.parseFiles();
    const activeFile = Object.keys(files)[0] || 'main.luau';
    
    // Get attributes
    const height = this.getAttribute('height') || '400px';
    const theme = this.getAttribute('theme') || 'auto';
    const baseUrl = this.getAttribute('base-url') || PLAYGROUND_URL;
    
    // Build iframe URL
    const encoded = encodeFiles(files, activeFile);
    const url = `${baseUrl}/?embed=true&theme=${theme}#code=${encoded}`;
    
    // Hide the <luau-file> children
    const fileElements = this.querySelectorAll('luau-file');
    fileElements.forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    
    // Create or update iframe
    if (!this.iframe) {
      this.iframe = document.createElement('iframe');
      this.iframe.style.border = 'none';
      this.iframe.style.width = '100%';
      this.iframe.style.borderRadius = '6px';
      this.iframe.setAttribute('loading', 'lazy');
      this.iframe.setAttribute('allowfullscreen', '');
      this.iframe.setAttribute('allow', 'clipboard-write');
      this.appendChild(this.iframe);
    }
    
    this.iframe.src = url;
    this.iframe.style.height = height;
    this.iframe.title = 'Luau Playground';
  }
  
  private parseFiles(): Record<string, string> {
    const fileElements = this.querySelectorAll('luau-file');
    const files: Record<string, string> = {};
    
    fileElements.forEach((el) => {
      const name = el.getAttribute('name') || 'main.luau';
      const code = el.textContent?.trim() || '';
      files[name] = code;
    });
    
    if (Object.keys(files).length === 0) {
      files['main.luau'] = '-- Write your Luau code here\n';
    }
    
    return files;
  }
}

// Register custom elements
if (!customElements.get('luau-file')) {
  customElements.define('luau-file', LuauFile);
}

if (!customElements.get('luau-embed')) {
  customElements.define('luau-embed', LuauEmbed);
}

export { LuauEmbed, LuauFile };
