import { Component, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, Scroll } from '@angular/router';
import { LenisService } from './lenis.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  protected readonly title = signal('travelika');

  constructor(private lenis: LenisService, private router: Router) {}

  ngAfterViewInit(): void {
    // Start Lenis smooth scroll
    this.lenis.init({ duration: 1.3, touchMultiplier: 1.5 });

    // Smoothly handle Router anchor/back/forward via Lenis
    this.router.events.subscribe((e) => {
      if (e instanceof Scroll) {
        // Estimate sticky header offset (Tailwind h-16 ≈ 64px)
        const header = document.querySelector('header') as HTMLElement | null;
        const offset = header?.offsetHeight ? header.offsetHeight + 8 : 72;

        if (e.position) {
          // restore scroll position immediately to match browser expectation
          this.lenis.scrollTo(e.position[1] || 0, { immediate: true });
        } else if (e.anchor) {
          const el = document.getElementById(e.anchor);
          if (el) this.lenis.scrollTo(el, { offset: -offset });
        } else {
          // default to top on normal navigation
          this.lenis.scrollTo(0);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.lenis.destroy();
  }
}
