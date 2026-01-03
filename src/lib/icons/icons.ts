// Import Phosphor icons directly from @phosphor-icons/core (Bold weight)
import play from '@phosphor-icons/core/assets/fill/play-fill.svg?raw';
import stop from '@phosphor-icons/core/assets/fill/stop-fill.svg?raw';
import x from '@phosphor-icons/core/assets/bold/x-bold.svg?raw';
import check from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';
import gear from '@phosphor-icons/core/assets/bold/gear-bold.svg?raw';
import plus from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
import sun from '@phosphor-icons/core/assets/bold/sun-bold.svg?raw';
import moon from '@phosphor-icons/core/assets/bold/moon-bold.svg?raw';
import auto from '@phosphor-icons/core/assets/fill/circle-half-fill.svg?raw';
import external from '@phosphor-icons/core/assets/bold/arrow-square-out-bold.svg?raw';
import share from '@phosphor-icons/core/assets/bold/upload-simple-bold.svg?raw';
import chevronRight from '@phosphor-icons/core/assets/bold/caret-right-bold.svg?raw';
import binary from '@phosphor-icons/core/assets/bold/binary-bold.svg?raw';

export const icons = {
  play,
  stop,
  x,
  check,
  gear,
  plus,
  sun,
  moon,
  auto,
  external,
  share,
  chevronRight,
  binary,
} as const;

export type IconName = keyof typeof icons;
