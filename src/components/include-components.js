// @ts-nocheck
(function () {
  async function includeAll() {
    const nodes = document.querySelectorAll('[data-include]');
    await Promise.all([...nodes].map(async (el) => {
      const url = el.getAttribute('data-include');
      if (!url) return;

      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) {
          console.error('Include failed:', url, res.status);
          return;
        }
        const html = await res.text();

        // Sisipkan HTML ke DOM, ganti placeholder <div data-include=...>
        const range = document.createRange();
        range.selectNode(el);
        const frag = range.createContextualFragment(html);
        el.replaceWith(frag);
      } catch (e) {
        console.error('Include error:', url, e);
      }
    }));

    // Beritahu kalau komponen sudah dimuat → update tahun, dsb
    document.dispatchEvent(new CustomEvent('components:loaded'));
  }

  // Jalan setelah DOM siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', includeAll);
  } else {
    includeAll();
  }

  // Pastikan <span id="y"> di footer terisi tahun berjalan
  document.addEventListener('components:loaded', () => {
    const y = document.getElementById('y');
    if (y) y.textContent = new Date().getFullYear();
  });
})();
