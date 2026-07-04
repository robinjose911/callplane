import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement PointerEvent — Base UI's Switch/Button primitives dispatch pointer
// events internally on click, which throws "PointerEvent is not a constructor" without this.
if (typeof window !== "undefined" && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent implements Partial<PointerEvent> {
    pointerId = 1;
    width = 1;
    height = 1;
    pressure = 0;
    tangentialPressure = 0;
    tiltX = 0;
    tiltY = 0;
    twist = 0;
    pointerType = "mouse";
    isPrimary = true;
    altitudeAngle = 0;
    azimuthAngle = 0;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }

    getCoalescedEvents(): PointerEvent[] {
      return [];
    }
    getPredictedEvents(): PointerEvent[] {
      return [];
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

// jsdom doesn't implement matchMedia — needed by the shadcn sidebar's mobile-breakpoint hook.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
