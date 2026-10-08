import * as React from "react";

/** Debounce a rapidly changing value (search inputs, filter typing). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Run a callback when a click happens outside the referenced element. */
export function useClickOutside<T extends HTMLElement>(
  handler: () => void,
  enabled = true,
): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    if (!enabled) return;
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [handler, enabled]);
  return ref;
}

/** Element size, used by the responsive dashboard charts. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
