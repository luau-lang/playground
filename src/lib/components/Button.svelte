<script lang="ts">
  type Variant = 'default' | 'secondary' | 'ghost' | 'outline';
  type Size = 'default' | 'sm' | 'lg' | 'icon' | 'none';

  interface Props {
    class?: string;
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    title?: string;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
    popovertarget?: string;
  }

  let {
    class: className,
    variant = 'default',
    size = 'default',
    disabled = false,
    type = 'button',
    title,
    onclick,
    children,
    popovertarget,
    ...restProps
  }: Props = $props();

  const baseClasses = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0';

  const variantClasses: Record<Variant, string> = {
    default: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
    secondary: 'secondary-btn bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
    ghost: 'ghost-btn hover:text-[var(--text-primary)] text-[var(--text-secondary)]',
    outline: 'border border-[var(--border-color)] bg-transparent hover:bg-[var(--bg-tertiary)]',
  };

  const sizeClasses: Record<Size, string> = {
    default: 'h-9 px-4 py-2 min-w-9',
    sm: 'h-8 text-xs',
    lg: 'h-10 px-6 min-w-10',
    icon: 'h-9 w-9',
    none: '',
  };

  const classes = $derived(`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ''}`);
</script>

<button
  class={classes}
  {disabled}
  {type}
  {title}
  {onclick}
  {popovertarget}
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</button>

