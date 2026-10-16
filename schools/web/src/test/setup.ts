import '@testing-library/jest-dom/vitest'

// jsdom gaps that Radix (Popover, DropdownMenu, Tooltip) and cmdk rely on.
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserver, writable: true })
    Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserver, writable: true })
  }
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.scrollIntoView ??= function scrollIntoView() {}
  proto.hasPointerCapture ??= function hasPointerCapture() {
    return false
  }
  proto.releasePointerCapture ??= function releasePointerCapture() {}
  proto.setPointerCapture ??= function setPointerCapture() {}
  // ProseMirror (Tiptap) measures ranges when it scrolls the selection into view;
  // jsdom has no layout, so give ranges empty rects instead of throwing.
  const rangeProto = Range.prototype as unknown as Record<string, unknown>
  rangeProto.getClientRects ??= function getClientRects() {
    return [] as unknown as DOMRectList
  }
  rangeProto.getBoundingClientRect ??= function getBoundingClientRect() {
    return new DOMRect(0, 0, 0, 0)
  }
  // Node 25 ships a global `localStorage` stub that shadows jsdom's; use an in-memory one.
  if (typeof window.localStorage?.clear !== 'function') {
    const data = new Map<string, string>()
    const storage: Storage = {
      get length() {
        return data.size
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, String(v)),
    }
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  }
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
