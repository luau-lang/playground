<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import { Icon, type IconName } from '$lib/icons';
  import { isRunning, getActiveFileContent } from '$lib/stores/playground';
  import { runCode, checkCode, stopExecution } from '$lib/luau/wasm';
  import { generatePlaygroundUrl } from '$lib/utils/share';
  import { copyText } from '$lib/utils/clipboard';
  import { hostCanResize, requestHostHeight } from '$lib/stores/embedHost';
  import { editorScroller } from '$lib/stores/editorViewport';

  interface Props {
    /** Show a button that copies the active file to the clipboard. */
    showCopy?: boolean;
    /** Show a button that opens the current state in the full playground. */
    showOpen?: boolean;
    /** Offer a button that grows the embed to fit the whole file when clipped. */
    showExpand?: boolean;
    /** Drop text labels and use icons at every breakpoint. */
    iconsOnly?: boolean;
    /** Float the actions over the editor instead of sitting in the tab bar. */
    overlay?: boolean;
  }

  let {
    showCopy = false,
    showOpen = false,
    showExpand = false,
    iconsOnly = false,
    overlay = false,
  }: Props = $props();

  const compact = $derived(iconsOnly || overlay);

  // Delay before showing stop button to avoid flash on fast scripts
  let showStopButton = $state(false);
  let copySuccess = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const isMac = /Mac/i.test(navigator.platform);
  const runShortcut = isMac ? '⌘↵' : 'Ctrl+↵';

  $effect(() => {
    if (!$isRunning) {
      showStopButton = false;
      return;
    }
    const timer = setTimeout(() => showStopButton = true, 150);
    return () => clearTimeout(timer);
  });

  $effect(() => () => {
    if (copyTimer) clearTimeout(copyTimer);
  });

  // Expanding needs a host page that answered the handshake, and is only worth
  // offering while the code is actually clipped.
  const scroller = $derived($editorScroller);
  let isExpanded = $state(false);
  let isClipped = $state(false);
  let requestedHeight = 0;

  const canExpand = $derived(showExpand && $hostCanResize && (isClipped || isExpanded));

  /** Height the embed needs to show the whole file without scrolling. */
  function fullHeight(): number {
    if (!scroller) return window.innerHeight;
    // Everything that isn't the editor viewport: tab bar, output panel, padding
    const chrome = window.innerHeight - scroller.clientHeight;
    return Math.ceil(scroller.scrollHeight + chrome);
  }

  function expandToFit() {
    const height = fullHeight();
    // The host echoes the height back as a resize, so ignore the noise
    if (Math.abs(height - requestedHeight) <= 2) return;
    requestedHeight = height;
    requestHostHeight(height);
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
    if (isExpanded) {
      expandToFit();
    } else {
      requestedHeight = 0;
      requestHostHeight(null);
    }
  }

  function measure() {
    if (!scroller) return;
    isClipped = scroller.scrollHeight - scroller.clientHeight > 2;
    if (isExpanded) expandToFit();
  }

  // Watch the editor viewport and its content: the first changes when chrome
  // such as the output panel appears, the second when the code itself grows
  $effect(() => {
    if (!showExpand || !$hostCanResize || !scroller) return;

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    const content = scroller.querySelector('.cm-content');
    if (content) observer.observe(content);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  function handleRun() {
    if ($isRunning) {
      stopExecution();
    } else {
      runCode();
    }
  }

  async function handleCopy() {
    copySuccess = await copyText(getActiveFileContent());
    if (!copySuccess) return;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copySuccess = false; }, 2000);
  }

  function handleOpenInPlayground() {
    window.open(generatePlaygroundUrl(), '_blank', 'noopener,noreferrer');
  }

  const buttonClass = $derived(
    compact
      ? `w-8 px-0${overlay ? ' overlay-btn' : ''}`
      : 'px-2 sm:px-3'
  );

  // The run button keeps its solid accent fill, so it only needs the shadow
  const runButtonClass = $derived(
    showStopButton || !overlay ? buttonClass : 'w-8 px-0 shadow-sm'
  );
</script>

{#snippet label(icon: IconName, text: string)}
  {#if compact}
    <Icon name={icon} size={16} />
  {:else}
    <span class="hidden sm:inline">{text}</span>
    <span class="sm:hidden"><Icon name={icon} size={16} /></span>
  {/if}
{/snippet}

<div
  class={overlay
    ? 'absolute top-2 right-2 z-20 flex items-center gap-1'
    : 'flex items-center gap-0.5 sm:gap-1'}
>
  {#if showCopy}
    <Button
      size="sm"
      variant="secondary"
      onclick={handleCopy}
      class={buttonClass}
      title={copySuccess ? 'Copied!' : 'Copy code'}
      aria-label={copySuccess ? 'Copied' : 'Copy code'}
    >
      {@render label(copySuccess ? 'check' : 'copy', copySuccess ? 'Copied!' : 'Copy')}
    </Button>
  {/if}
  {#if canExpand}
    <Button
      size="sm"
      variant="secondary"
      onclick={toggleExpand}
      class={buttonClass}
      title={isExpanded ? 'Collapse' : 'Expand to fit the code'}
      aria-label={isExpanded ? 'Collapse' : 'Expand to fit the code'}
    >
      {@render label(isExpanded ? 'collapse' : 'expand', isExpanded ? 'Collapse' : 'Expand')}
    </Button>
  {/if}
  <Button
    size="sm"
    variant="secondary"
    onclick={checkCode}
    class={buttonClass}
    title="Check code for errors"
    aria-label="Check code for errors"
  >
    {@render label('check', 'Check')}
  </Button>
  <Button
    size="sm"
    variant={showStopButton ? 'secondary' : 'default'}
    onclick={handleRun}
    class={runButtonClass}
    title={showStopButton ? 'Stop execution' : `Run code (${runShortcut})`}
    aria-label={showStopButton ? 'Stop execution' : 'Run code'}
  >
    {#if compact}
      <Icon name={showStopButton ? 'stop' : 'play'} size={16} />
    {:else}
      <span class="sm:mr-1"><Icon name={showStopButton ? 'stop' : 'play'} size={16} /></span>
      <span class="hidden sm:inline">{showStopButton ? 'Stop' : 'Run'}</span>
    {/if}
  </Button>
  {#if showOpen}
    <Button
      size="sm"
      variant="secondary"
      onclick={handleOpenInPlayground}
      class={buttonClass}
      title="Open in playground"
      aria-label="Open in playground"
    >
      {@render label('external', 'Open')}
    </Button>
  {/if}
</div>

<style>
  /* Keep the floating actions legible over the code they overlap */
  :global(.overlay-btn) {
    background-color: color-mix(in srgb, var(--bg-secondary) 85%, transparent);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(4px);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }
</style>
