<script lang="ts">
  type SupportedValues = boolean | number;

  interface Props {
    idlabel: string; /* idlabel must be unique for every table */

    tableclass?: string;
    cellclass?: string;

    keyheader: string;
    valueheader: string;

    source: Record<string, SupportedValues>;
    overloads: Record<string, SupportedValues>;

    filter?: (sourceEntries: [string, SupportedValues][]) => [string, SupportedValues][];
    onentrychanged?: (key: string, newValue: SupportedValues) => void;
  }

  const KEY_COLUMN_MAX_PERCENTAGE = 90;
  const KEY_COLUMN_MIN_PERCENTAGE = 10;

  let {
    idlabel,
    tableclass = '',
    cellclass = '',
    keyheader,
    valueheader,
    source: sourceRecord,
    overloads: overloadsRecord,
    filter: filterSource,
    onentrychanged: onEntryChanged,
    ...restProps
  }: Props = $props();

  const classes = $derived(`border-collapse text-xs text-(--text-secondary) table-fixed ${tableclass}`);
  const cellClasses = $derived(`border border-(--border-color-heavy) overflow-hidden whitespace-nowrap ${cellclass}`);

  const displayedEntries = $derived.by(() => {
    const entries = Object.entries(sourceRecord);
    return filterSource ? filterSource(entries) : entries;
  });

  // Try to get the value from the overload record, or from the source record if it's not present.
  // The latter element in the return type indicates whether the value is overloaded.
  function getUsedValue(key: string): [SupportedValues, boolean] {
    const overloadedEntry = overloadsRecord[key];
    return overloadedEntry === undefined
      ? [sourceRecord[key], false] as const
      : [overloadedEntry, true] as const;
  }

  // Left columns width
  let keyColumnWidthPercentage = $state(70);

  // Handle pointer events for resizing table columns
  let tableEl: HTMLTableElement;
  let heldResizerPointer: number | null = null;

  function onResizerPointerDown(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    if (!tableEl || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    heldResizerPointer = e.pointerId;
  }

  function onResizerPointerMove(e: PointerEvent) {
    if (e.pointerId !== heldResizerPointer) return;
    const tableRect = tableEl.getBoundingClientRect();
    const draggedPercentage = ((e.clientX - tableRect.left) / tableRect.width) * 100;
    keyColumnWidthPercentage = Math.min(Math.max(draggedPercentage, KEY_COLUMN_MIN_PERCENTAGE), KEY_COLUMN_MAX_PERCENTAGE);
  }

  function onResizerPointerUp(e: PointerEvent) {
    if (e.pointerId !== heldResizerPointer) return;
    heldResizerPointer = null;
  }
</script>

<div class="relative w-full">
  <table
    id="{idlabel}-table-content"
    bind:this={tableEl}
    class={classes}
    {...restProps}
  >
    <colgroup>
      <col style:width="{keyColumnWidthPercentage}%" />
      <col />
    </colgroup>
    <thead>
      <tr>
        <th class={cellClasses}>{keyheader}</th>
        <th class={cellClasses}>{valueheader}</th>
      </tr>
    </thead>
    <tbody>
      {#each displayedEntries as [key, value] (key)}
        {@const [usedValue, isOverloaded] = getUsedValue(key)}

        <!-- Key cell -->
        <tr>
          <td class={cellClasses}>
            <button
              type="button"
              class="text-left overflow-hidden text-ellipsis size-full p-px"
              class:hover:bg-(--bg-secondary)={isOverloaded}
              class:font-bold={isOverloaded}
              title="{isOverloaded ? 'Return this flags value to its default.' : key}"
              disabled={!isOverloaded}
              onclick={(e) => onEntryChanged?.(key, sourceRecord[key])}
            >
              {isOverloaded ? '*' : ''}{key}
            </button>
          </td>

          <!-- Value cell -->
          <td class={cellClasses}>
            {#if typeof value === "boolean"}
              <button
                type="button"
                class="size-full transition-colors hover:bg-(--bg-secondary) {usedValue ? 'text-blue-600' : 'text-red-600'}"
                title="Disable or enable this flag."
                onclick={(e) => onEntryChanged?.(key, !usedValue)}
              >
                {usedValue ? "Enabled" : "Disabled"}
              </button>
            {:else if typeof value === "number"}
              <input
                type="number"
                class="pl-1 size-full text-(--text-primary)"
                value={usedValue}
                placeholder={value.toString()}
                required
                step={1}
                title="Change the integer value for this flag."
                onchange={(e) => {
                  const int = parseInt(e.currentTarget.value, 10);
                  if (!isNaN(int)) onEntryChanged?.(key, int);
                }}
              />
            {:else}
              <span class="text-error-500">Unsupported type "{typeof value}"</span>
            {/if}
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="2" class={cellClasses}>No matching flags</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <!-- Interactable div for resizing columns -->
  <div
    class="absolute inset-y-0 -ml-1.5 w-3 pointer-coarse:-ml-3 pointer-coarse:w-6 cursor-col-resize select-none touch-none"
    style:left="{keyColumnWidthPercentage}%"
    role="slider"
    aria-label="Change column size on key value table"
    aria-controls="{idlabel}-table-content"
    aria-orientation="horizontal"
    aria-valuenow={keyColumnWidthPercentage}
    aria-valuemin={10}
    aria-valuemax={90}
    tabindex="0"
    onpointerdown={onResizerPointerDown}
    onpointermove={onResizerPointerMove}
    onpointerup={onResizerPointerUp}
    onpointercancel={onResizerPointerUp}
  ></div>
</div>
