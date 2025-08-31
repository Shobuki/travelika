import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../components/header/header.component';

// ---- Tipe data ----
interface User {
  email: string;
  name: string;
  passHash: string;
  createdAt: number;
}

// ------- IndexedDB helpers (native, tanpa Dexie) -------
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // probe dulu untuk tahu versi saat ini
    const probe = indexedDB.open('travelika');
    probe.onsuccess = () => {
      const current = probe.result.version; // contoh: 20
      probe.result.close();
      const target = Math.max(current + 1, 21); // naikkan minimal 21
      const req = indexedDB.open('travelika', target);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'email' });
        }
        if (!db.objectStoreNames.contains('bookings')) {
          const s = db.createObjectStore('bookings', { keyPath: 'id', autoIncrement: true });
          s.createIndex('email', 'email', { unique: false });
        }
        if (!db.objectStoreNames.contains('payments')) {
          const p = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
          try { p.createIndex('bookingId', 'bookingId', { unique: false }); } catch {}
          try { p.createIndex('email', 'email', { unique: false }); } catch {}
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
    probe.onerror = () => reject(probe.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const st = tx.objectStore(store);
    const req = st.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
function idbPut<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    const req = st.put(value as any);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

@Component({
  selector: 'app-login',
  standalone: true,
   imports: [
    CommonModule,
    FormsModule,
    HeaderComponent, // ← penting: daftarkan komponen header di sini
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  // Tab state
  tab = signal<'login' | 'register'>('login');

  // Form fields
  loginEmail = '';
  loginPass = '';
  regName = '';
  regEmail = '';
  regPass = '';

  // UI state
  loading = false;
  errorMsg = '';
  infoMsg = '';

  // redirect target
  nextUrl = '/';

  // IndexedDB instance
  private db: IDBDatabase | null = null;

  async ngOnInit() {
    // Buka DB (native IndexedDB)
    this.db = await openDB();

    // Baca ?tab= & ?next=
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'register') this.tab.set('register');
    const next = params.get('next');
    this.nextUrl = next ? decodeURIComponent(next) : '/';

    // Jika sudah login, redirect
    const ses = this.getSession();
    if (ses?.email) this.safeRedirect(this.nextUrl);
  }

  // -------- Helpers --------
  private setCookie(name: string, value: string, days = 7) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    let cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
    if (location.protocol === 'https:') cookie += ';Secure';
    document.cookie = cookie;
  }

  private getSession(): { email: string; name?: string } | null {
    try {
      const raw =
        document.cookie
          .split('; ')
          .find((r) => r.startsWith('travelika_session='))?.split('=')[1] || '';
      return raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch {
      return null;
    }
  }

  private async hashPassword(pw: string): Promise<string> {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  private startLoading(msg = '') {
    this.loading = true;
    this.errorMsg = '';
    this.infoMsg = msg;
  }
  private stopLoading() {
    this.loading = false;
    this.infoMsg = '';
  }

  private safeRedirect(url: string) {
    try {
      const u = new URL(url, location.origin);
      if (u.origin === location.origin) {
        location.href = u.pathname + u.search + u.hash;
        return;
      }
    } catch {}
    location.href = '/';
  }

  // -------- Actions --------
  async onRegister() {
    try {
      if (!this.db) this.db = await openDB();
      this.startLoading('Creating your account…');

      const name = this.regName.trim();
      const email = this.regEmail.trim().toLowerCase();
      const pass = this.regPass;

      if (!name || !email || !pass) throw new Error('Please fill all fields.');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email format.');
      if (pass.length < 6) throw new Error('Password must be at least 6 characters.');

      const exists = await idbGet<User>(this.db, 'users', email);
      if (exists) throw new Error('This email is already registered.');

      const passHash = await this.hashPassword(pass);
      const now = Date.now();
      const user: User = { email, name, passHash, createdAt: now };

      await idbPut<User>(this.db, 'users', user);

      // Set cookie sesi
      this.setCookie('travelika_session', JSON.stringify({ email, name, issuedAt: now }), 7);

      this.stopLoading();
      this.safeRedirect(this.nextUrl);
    } catch (err: any) {
      this.stopLoading();
      this.errorMsg = err?.message || 'Registration failed. Please try again.';
    }
  }

  async onLogin() {
    try {
      if (!this.db) this.db = await openDB();
      this.startLoading('Signing you in…');

      const email = this.loginEmail.trim().toLowerCase();
      const pass = this.loginPass;
      if (!email || !pass) throw new Error('Please fill all fields.');

      const user = await idbGet<User>(this.db, 'users', email);
      if (!user) throw new Error('User not found.');

      const passHash = await this.hashPassword(pass);
      if (passHash !== user.passHash) throw new Error('Incorrect password.');

      this.setCookie(
        'travelika_session',
        JSON.stringify({ email: user.email, name: user.name, issuedAt: Date.now() }),
        7
      );

      this.stopLoading();
      this.safeRedirect(this.nextUrl);
    } catch (err: any) {
      this.stopLoading();
      this.errorMsg = err?.message || 'Sign-in failed. Please try again.';
    }
  }

  switchTab(to: 'login' | 'register') {
    this.tab.set(to);
    this.errorMsg = '';
  }
}
