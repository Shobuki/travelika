import { Injectable, NgZone } from '@angular/core';

// Lenis is loaded via UMD script in index.html
declare const Lenis: any;

@Injectable({ providedIn: 'root' })
export class LenisService {
  private lenis: any | null = null;
  private rafId = 0;

  constructor(private zone: NgZone) {}

  init(options?: { duration?: number; touchMultiplier?: number }) {
    if (this.lenis || typeof window === 'undefined' || typeof (window as any).Lenis === 'undefined') {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.lenis = new (Lenis as any)({
        duration: options?.duration ?? 1.3,
        touchMultiplier: options?.touchMultiplier ?? 1.5,
        smoothWheel: true,
        smoothTouch: true,
      });

      const raf = (time: number) => {
        this.lenis?.raf(time);
        this.rafId = requestAnimationFrame(raf);
      };
      this.rafId = requestAnimationFrame(raf);
    });
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.lenis?.destroy?.();
    this.lenis = null;
  }

  scrollTo(target: Element | number | string, opts?: any) {
    this.lenis?.scrollTo?.(target as any, opts);
  }
}

