import { writable, get } from 'svelte/store';
import { parseStateFromHash } from '$lib/utils/decode';
import type { OutputLine } from '$lib/utils/output';

// Re-export for backwards compatibility
export type { OutputLine };

export interface PlaygroundState {
  files: Record<string, string>;
  activeFile: string;
  output: OutputLine[];
  isRunning: boolean;
}

// Default initial code
const defaultCode = `-- Welcome to the Luau Playground!
-- Write your code here and click Run

local function greet(name: string): string
    return \`Hello, {name}!\`
end

print(greet("World"))

-- Try some Luau features:
local numbers = {1, 2, 3, 4, 5}
local sum = 0
for _, n in numbers do
    sum += n
end
print("Sum:", sum)
`;

// Load initial state from URL if available
function getInitialState(): { files: Record<string, string>; activeFile: string } {
  const defaultState = { files: { 'main.luau': defaultCode }, activeFile: 'main.luau' };
  
  if (typeof window === 'undefined') {
    return defaultState;
  }
  
  const state = parseStateFromHash(window.location.hash);
  if (!state || Object.keys(state.files).length === 0) {
    return defaultState;
  }
  
  const active = state.active in state.files ? state.active : Object.keys(state.files)[0];
  return { files: state.files, activeFile: active };
}

const initialState = getInitialState();

// Stores - initialized with URL state if available
export const files = writable<Record<string, string>>(initialState.files);
export const activeFile = writable<string>(initialState.activeFile);
export const output = writable<OutputLine[]>([]);
export const isRunning = writable<boolean>(false);
export const executionTime = writable<number | null>(null);
export const cursorLine = writable<number>(1);

export function setExecutionTime(ms: number | null) {
  executionTime.set(ms);
}

// Actions
export function addFile(name: string, content: string = '') {
  files.update((f) => ({ ...f, [name]: content }));
  activeFile.set(name);
}

export function removeFile(name: string) {
  files.update((f) => {
    const { [name]: _, ...rest } = f;
    return rest;
  });
  
  // Switch to another file if we removed the active one
  const currentActive = get(activeFile);
  if (currentActive === name) {
    const remaining = Object.keys(get(files));
    if (remaining.length > 0) {
      activeFile.set(remaining[0]);
    }
  }
}

export function updateFile(name: string, content: string) {
  files.update((f) => ({ ...f, [name]: content }));
}

export function renameFile(oldName: string, newName: string) {
  if (oldName === newName) return;
  
  files.update((f) => {
    const content = f[oldName];
    const { [oldName]: _, ...rest } = f;
    return { ...rest, [newName]: content };
  });
  
  // Update active file if we renamed it
  const currentActive = get(activeFile);
  if (currentActive === oldName) {
    activeFile.set(newName);
  }
}

export function setActiveFile(name: string) {
  activeFile.set(name);
}

export function appendOutput(line: OutputLine) {
  output.update((o) => [...o, line]);
}

export function clearOutput() {
  output.set([]);
}

export function setRunning(running: boolean) {
  isRunning.set(running);
}

// Get all files content for execution
export function getAllFiles(): Record<string, string> {
  return get(files);
}

export function getActiveFileContent(): string {
  const f = get(files);
  const active = get(activeFile);
  return f[active] || '';
}

