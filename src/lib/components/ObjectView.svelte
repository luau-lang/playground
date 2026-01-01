<script lang="ts">
  import type { LuauValue } from "$lib/utils/output";
  import { Icon } from "$lib/icons";
  import ObjectView from "./ObjectView.svelte";

  interface Props {
    value: LuauValue;
    keyName?: string;
    isTopLevel?: boolean;
    indent?: number;
  }

  let { value, keyName, isTopLevel = false, indent = 0 }: Props = $props();

  let isExpanded = $state(false);
  $effect.pre(() => {
    if (isTopLevel) isExpanded = true;
  });

  const isTable = $derived(value.type === "table");
  const isArray = $derived(value.type === "table" && value.isArray);

  const entries = $derived.by(() => {
    if (value.type !== "table") return [];
    if (value.isArray) {
      return (value.value as LuauValue[]).map((v, i) => ({
        key: String(i + 1),
        value: v,
      }));
    }
    return Object.entries(value.value as Record<string, LuauValue>).map(
      ([k, v]) => ({ key: k, value: v }),
    );
  });

  const isEmpty = $derived(entries.length === 0);
  const indentStr = $derived("  ".repeat(indent));
  const nextIndentStr = $derived("  ".repeat(indent + 1));

  function formatKey(key: string): string {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      return key;
    }
    return `[${JSON.stringify(key)}]`;
  }

  function getPreview(): string {
    if (value.type !== "table" || isEmpty) return "";
    const count = entries.length;
    return isArray
      ? `${count} item${count !== 1 ? "s" : ""}`
      : `${count} field${count !== 1 ? "s" : ""}`;
  }

  function getPrimitiveText(): string {
    switch (value.type) {
      case "nil":
        return "nil";
      case "boolean":
        return String(value.value);
      case "number":
        return String(value.value);
      case "string":
        return isTopLevel && keyName === undefined
          ? String(value.value)
          : `"${value.value}"`;
      case "function":
        return "<function>";
      case "userdata":
        return "<userdata>";
      case "thread":
        return "<thread>";
      case "circular":
        return "<circular>";
      default:
        return "?";
    }
  }

  function getPrimitiveClass(): string {
    switch (value.type) {
      case "nil":
        return "ov-nil";
      case "boolean":
        return "ov-bool";
      case "number":
        return "ov-number";
      case "string":
        return isTopLevel && keyName === undefined ? "ov-text" : "ov-string";
      case "function":
      case "userdata":
      case "thread":
        return "ov-special";
      case "circular":
        return "ov-error";
      default:
        return "ov-punctuation";
    }
  }
</script>

<!--
  Template is carefully structured to control whitespace output.
  Explicit {'\n'} and {' = '} are used for intended whitespace.
  No whitespace between inline elements.
--><span
  class="object-view"
  style="white-space: pre;"
  >{#if isTable}{#if keyName}<span class="ov-key">{formatKey(keyName)}</span
      >{" = "}{/if}{#if !isEmpty}<button
        class="ov-toggle"
        onclick={() => (isExpanded = !isExpanded)}
        ><span class="ov-chevron" class:expanded={isExpanded}
          ><Icon name="chevronRight" size={10} /></span
        >{"{"}{#if !isExpanded}<span class="ov-preview">{getPreview()}</span
          >{"}"}{/if}</button
      >{#if isExpanded}{"\n"}{#each entries as entry}{nextIndentStr}<ObjectView
            value={entry.value}
            keyName={isArray ? undefined : entry.key}
            indent={indent + 1}
          />,{"\n"}{/each}{indentStr}{"}"}{/if}{:else}{"{}"}{/if}{:else}{#if keyName}<span
        class="ov-key">{formatKey(keyName)}</span
      >{" = "}{/if}<span class={getPrimitiveClass()}>{getPrimitiveText()}</span
    >{/if}</span
>

<style>
  .object-view {
    --ov-key: var(--color-blue-900);
    --ov-string: var(--color-green-900);
    --ov-number: var(--color-purple-1000);
    --ov-bool: var(--color-purple-1000);
    --ov-nil: var(--color-extended-gray-600);
    --ov-punctuation: var(--color-extended-gray-600);
    --ov-special: var(--color-extended-gray-600);
    --ov-error: var(--color-red-900);
    --ov-text: var(--text-primary);
    --ov-preview: var(--color-extended-gray-500);
    color: var(--ov-punctuation);
  }

  :global(.dark) .object-view {
    --ov-key: var(--color-blue-400);
    --ov-string: var(--color-green-400);
    --ov-number: var(--color-purple-500);
    --ov-bool: var(--color-purple-500);
    --ov-nil: var(--color-extended-gray-500);
    --ov-punctuation: var(--color-extended-gray-500);
    --ov-special: var(--color-extended-gray-500);
    --ov-error: var(--color-red-700);
    --ov-text: var(--text-primary);
    --ov-preview: var(--color-extended-gray-400);
  }

  .ov-key {
    color: var(--ov-key);
  }
  .ov-string {
    color: var(--ov-string);
  }
  .ov-number {
    color: var(--ov-number);
  }
  .ov-bool {
    color: var(--ov-bool);
  }
  .ov-nil {
    color: var(--ov-nil);
    font-style: italic;
  }
  .ov-special {
    color: var(--ov-special);
    font-style: italic;
  }
  .ov-error {
    color: var(--ov-error);
    font-style: italic;
  }
  .ov-text {
    color: var(--ov-text);
  }
  .ov-preview {
    color: var(--ov-preview);
    font-style: italic;
    padding: 0 0.25em;
  }

  .ov-toggle {
    color: inherit;
    cursor: pointer;
  }
  .ov-toggle:hover {
    opacity: 0.8;
  }

  .ov-chevron {
    display: inline-block;
    width: 0.75rem;
    text-align: center;
    transition: transform 150ms;
  }
  .ov-chevron.expanded {
    transform: rotate(90deg);
  }
</style>
