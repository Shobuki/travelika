import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling, Router, NavigationStart, NavigationEnd } from '@angular/router';
import { App } from './app/app';
import { routes } from './app/app.routes';

bootstrapApplication(App, {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',           // aktifkan scroll ke #id
        scrollPositionRestoration: 'enabled', // restore posisi saat back/forward
      })
    ),
  ],
}).then((appRef) => {
  // Page transition hooks
  try {
    const router = appRef.injector.get(Router);
    // Ensure animations enabled even if OS has reduce motion (can be removed if undesired)
    document.body.classList.add('anim-on');
    router.events.subscribe((ev) => {
      if (ev instanceof NavigationStart) {
        document.body.classList.add('page-leave');
      }
      if (ev instanceof NavigationEnd) {
        document.body.classList.remove('page-leave');
        document.body.classList.add('page-enter');
        // Match CSS page-enter duration (1s) with small buffer
        window.setTimeout(() => document.body.classList.remove('page-enter'), 1100);
        // refresh reveal markers on each navigation
        try { setupReveals(); } catch {}
      }
    });
  } catch {}

  // Initial setup
  try { setupReveals(); } catch {}
  // Ensure initial page animates too
  document.body.classList.add('page-enter');
  // Match CSS page-enter duration (1s) with small buffer
  window.setTimeout(() => document.body.classList.remove('page-enter'), 1100);
}).catch((err) => console.error(err));

// (Removed previous gutter-fill logic; no longer needed.)
// --- Scroll reveal for elements ---
function setupReveals() {
  const targets = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => targets.add(el));
  document.querySelectorAll<HTMLElement>('[data-auto-reveal] > :not(.fixed)')
    .forEach(el => targets.add(el));

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const el = e.target as HTMLElement;
      if (e.isIntersecting) {
        // Delay to ensure initial hidden state paints before animating
        requestAnimationFrame(() => {
          el.classList.add('is-visible');
          io.unobserve(el);
        });
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

  targets.forEach(el => {
    // Optional: delay via data-delay="150"
    const d = Number(el.getAttribute('data-delay') || 0);
    if (d) el.style.transitionDelay = `${d}ms`;
    io.observe(el);
  });
}
