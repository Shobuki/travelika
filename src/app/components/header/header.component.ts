import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

type Session = { email: string; name?: string } | null;

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent {
  ses: Session = null;
  dropdownOpen = false;
  bookingCount = 0;
  resetOpen = false;
  resetLoading = false;

  // simpan next (plain, TIDAK dipanggil fungsi global di template)
  nextRaw = location.pathname + location.search + location.hash;
  nextParams = { next: this.nextRaw };

  constructor(private router: Router) {
    this.ses = this.getSession();
    if (this.ses?.email) {
      this.getMyBookingCount(this.ses.email).then(n => (this.bookingCount = n));
    }
  }

  // ==== NAV ====
  goLogin(ev?: MouseEvent) {
    ev?.preventDefault();
    this.router.navigate(['/login'], { queryParams: this.nextParams });
  }

  goBookHistory(ev?: MouseEvent) {
    ev?.preventDefault();
    if (this.ses?.email) {
      this.router.navigate(['/mybookings']);
    } else {
      this.router.navigate(['/login'], { queryParams: { next: '/mybookings' } });
    }
  }

  // ==== Helpers Cookie & UI ====
  private readCookie(name: string): string {
    const v = document.cookie.split('; ').find(r => r.startsWith(name + '='));
    return v ? decodeURIComponent(v.split('=')[1]) : '';
  }
  private getSession(): Session {
    try {
      const raw = this.readCookie('travelika_session');
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
  initials(str?: string): string {
    const s = (str || '').trim();
    if (!s) return '?';
    const p = s.split(/\s+/);
    const a = (p[0]?.[0] || '').toUpperCase();
    const b = (p[1]?.[0] || '').toUpperCase();
    return (a + b) || a || '?';
  }

  toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }
  @HostListener('document:click')
  onDocClick() {
    this.dropdownOpen = false;
  }

  logout() {
    document.cookie =
      'travelika_session=; Max-Age=0; path=/; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '');
    location.reload();
  }

  // ===== Reset data (bookings + payments) =====
  openResetConfirm(ev?: MouseEvent) {
    ev?.preventDefault();
    this.resetOpen = true;
    this.dropdownOpen = false;
  }
  closeResetConfirm() { this.resetOpen = false; }

  private clearStore(db: IDBDatabase, store: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        const st = tx.objectStore(store);
        st.clear();
      } catch { resolve(); }
    });
  }

  async confirmReset() {
    try {
      this.resetLoading = true;
      const db = await this.openDB();
      await this.clearStore(db, 'bookings');
      await this.clearStore(db, 'payments');
      db.close();
      this.bookingCount = 0;
      this.resetOpen = false;
      alert('All transaction history has been cleared on this browser.');
    } catch {
      alert('Failed to reset data.');
    } finally {
      this.resetLoading = false;
    }
  }

  // ===== IndexedDB (native) =====
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('travelika'); // tanpa versi → aman
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'email' });
        }
        if (!db.objectStoreNames.contains('bookings')) {
          const s = db.createObjectStore('bookings', { keyPath: 'id', autoIncrement: true });
          if (!s.indexNames.contains('email')) s.createIndex('email', 'email', { unique: false });
        }
        if (!db.objectStoreNames.contains('payments')) {
          const p = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
          try { p.createIndex('bookingId', 'bookingId', { unique: false }); } catch {}
          try { p.createIndex('email', 'email', { unique: false }); } catch {}
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private countByEmail(db: IDBDatabase, email: string): Promise<number> {
    return new Promise(resolve => {
      try {
        const tx = db.transaction('bookings', 'readonly');
        const st = tx.objectStore('bookings');
        const idx = st.indexNames.contains('email') ? st.index('email') : null;

        if (idx) {
          const req = idx.count(IDBKeyRange.only(email));
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(0);
        } else {
          // fallback: scan
          let n = 0;
          const req = st.openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
              if ((cur.value?.email || '') === email) n++;
              cur.continue();
            } else resolve(n);
          };
          req.onerror = () => resolve(0);
        }
      } catch {
        resolve(0);
      }
    });
  }

  async getMyBookingCount(email: string): Promise<number> {
    if (!email) return 0;
    try {
      const db = await this.openDB();
      const n = await this.countByEmail(db, email);
      db.close();
      return n;
    } catch {
      return 0;
    }
  }
}
