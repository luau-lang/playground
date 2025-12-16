<script lang="ts">
  import { cn } from '$lib/utils/cn';
  import { tv, type VariantProps } from 'tailwind-variants';

  const buttonVariants = tv({
    base: 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50',
    variants: {
      variant: {
        default: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
        secondary: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
        ghost: 'ghost-btn hover:text-[var(--text-primary)] text-[var(--text-secondary)]',
        outline: 'border border-[var(--border-color)] bg-transparent hover:bg-[var(--bg-tertiary)]',
      },
      size: {
        default: 'h-9 px-4 py-2 min-w-9',
        sm: 'h-8 px-3 text-xs min-w-8',
        lg: 'h-10 px-6 min-w-10',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  });

  type Variant = VariantProps<typeof buttonVariants>['variant'];
  type Size = VariantProps<typeof buttonVariants>['size'];

  interface Props {
    class?: string;
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    class: className,
    variant = 'default',
    size = 'default',
    disabled = false,
    type = 'button',
    onclick,
    children,
    ...restProps
  }: Props = $props();
</script>

<button
  class={cn(buttonVariants({ variant, size }), className)}
  {disabled}
  {type}
  {onclick}
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</button>

