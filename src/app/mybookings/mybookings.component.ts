import { Component, OnInit, computed, signal } from '@angular/core';
import { computePricing, PricingBreakdown } from '../lib/pricing';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HeaderComponent } from '../components/header/header.component';

type Session = { email: string; name?: string } | null;

type Booking = {
  id: number;
  code: string;
  email: string;
  name?: string | null;
  createdAt: number;
  status: 'pending' | 'paid' | string;
  paidAt?: number;
  paidMethod?: string;
  forest: string;          // e.g. AMAZON | BORNEO | ...
  pickup: string;          // IATA or city code
  dateIn: string;          // yyyy-mm-dd
  dateOut?: string;        // yyyy-mm-dd | ''
  dayTrip?: boolean;
  guests: number;
  pkg: 'base' | 'explorer' | 'expedition' | string;
  needTransport?: boolean;
  needLodging?: boolean;
  subtotal?: number;       // IDR
};

@Component({
  selector: 'app-mybookings',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent],
  templateUrl: './mybookings.component.html',
})
export class MyBookingsComponent implements OnInit {
  // state
  ses = signal<Session>(null);
  bookings = signal<Booking[]>([]);
  loading = signal<boolean>(true);
  errorMsg = signal<string>('');
  payingId = signal<number | null>(null);
  payTarget = signal<Booking | null>(null);
  showPayModal = computed(() => !!this.payTarget());
  payMethod = signal<string>('CARD');
  // detail modal
  detailTarget = signal<Booking | null>(null);
  detailPayments = signal<any[]>([]);
  showDetailModal = computed(() => !!this.detailTarget());

  // derived
  hasLogin = computed(() => !!this.ses()?.email);
  items = computed(() =>
    (this.bookings() || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  );

  // mapping label tampilan
  forestLabel(forest: string): string {
    switch ((forest || '').toUpperCase()) {
      case 'AMAZON': return 'Amazon, Brazil';
      case 'BORNEO': return 'Borneo, Indonesia';
      case 'BLACK_FOREST': return 'Black Forest, Germany';
      case 'TONGASS': return 'Tongass, Alaska';
      case 'AOKIGAHARA': return 'Aokigahara, Japan';
      case 'DAINTREE': return 'Daintree, Australia';
      case 'OLYMPIC': return 'Olympic, USA';
      default: return forest || '-';
    }
  }
  pkgLabel(p: string): string {
    const t = (p || '').toLowerCase();
    return t === 'explorer' ? 'Explorer' : t === 'expedition' ? 'Expedition' : 'Base';
    }

  fmtIDR(n?: number): string {
    if (typeof n !== 'number') return '-';
    try {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(n);
    } catch { return `IDR ${n.toLocaleString('id-ID')}`; }
  }
  fmtDate(s?: string): string {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  fmtDateRange(inStr: string, outStr?: string, dayTrip?: boolean): string {
    if (dayTrip) return this.fmtDate(inStr) + ' (day trip)';
    if (!outStr) return this.fmtDate(inStr);
    return `${this.fmtDate(inStr)} — ${this.fmtDate(outStr)}`;
  }
  formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString('id-ID');
  } catch {
    return '';
  }
}

  constructor(private router: Router) {}

  async ngOnInit() {
    this.ses.set(this.getSession());
    if (!this.ses()?.email) {
      this.loading.set(false);
      return; // tampilkan CTA login di template
    }
    try {
      const db = await this.openDBV2();
      const list = await this.getBookingsForEmail(db, this.ses()!.email);
      db.close();
      this.bookings.set(list);
    } catch (err: any) {
      console.error(err);
      this.errorMsg.set('Failed to load your bookings.');
    } finally {
      this.loading.set(false);
    }
  }

  // ===== helpers cookie =====
  private readCookie(name: string): string {
    const v = document.cookie.split('; ').find(r => r.startsWith(name + '='));
    return v ? decodeURIComponent(v.split('=')[1]) : '';
  }
  private getSession(): Session {
    try {
      const raw = this.readCookie('travelika_session');
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch { return null; }
  }

  goLogin(ev?: MouseEvent) {
    ev?.preventDefault();
    const next = location.pathname + location.search + location.hash;
    this.router.navigate(['/login'], { queryParams: { next } });
  }

  // ===== IndexedDB (native) =====
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('travelika'); // tanpa versi → aman dari downgrade
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

  // Open DB ensuring latest schema (payments store)
  private openDBV2(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const probe = indexedDB.open('travelika');
      probe.onsuccess = () => {
        const current = probe.result.version;
        probe.result.close();
        const target = Math.max(current + 1, 21);
        const req = indexedDB.open('travelika', target);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('users')) {
            db.createObjectStore('users', { keyPath: 'email' });
          }
          if (!db.objectStoreNames.contains('bookings')) {
            const s = db.createObjectStore('bookings', { keyPath: 'id', autoIncrement: true });
            try { if (!s.indexNames.contains('email')) s.createIndex('email', 'email', { unique: false }); } catch {}
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

  private getBookingsForEmail(db: IDBDatabase, email: string): Promise<Booking[]> {
    return new Promise((resolve) => {
      const out: Booking[] = [];
      try {
        const tx = db.transaction('bookings', 'readonly');
        const st = tx.objectStore('bookings');

        const useIdx = st.indexNames.contains('email');
        if (useIdx) {
          const idx = st.index('email');
          const req = idx.openCursor(IDBKeyRange.only(email));
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
              out.push(cur.value as Booking);
              cur.continue();
            } else resolve(out);
          };
          req.onerror = () => resolve(out);
        } else {
          // fallback scan
          const req = st.openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
              const val = cur.value as Booking;
              if ((val.email || '') === email) out.push(val);
              cur.continue();
            } else resolve(out);
          };
          req.onerror = () => resolve(out);
        }
      } catch {
        resolve(out);
      }
    });
  }

  private markPaid(db: IDBDatabase, id: number, method?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('bookings', 'readwrite');
        const st = tx.objectStore('bookings');
        const getReq = st.get(id);
        getReq.onsuccess = () => {
          const rec = getReq.result as any;
          if (!rec) { resolve(); return; }
          rec.status = 'paid';
          rec.paidAt = Date.now();
          if (method) rec.paidMethod = method;
          const putReq = st.put(rec);
          putReq.onsuccess = () => {
            // Write payment record (best-effort)
            try {
              const ptx = db.transaction('payments', 'readwrite');
              const ps = ptx.objectStore('payments');
              ps.add({
                bookingId: id,
                code: rec.code,
                email: rec.email,
                amount: rec.subtotal || 0,
                method: method || 'CARD',
                status: 'paid',
                createdAt: Date.now(),
              } as any);
            } catch {}
            resolve();
          };
          putReq.onerror = () => resolve();
        };
        getReq.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  payNow(ev: MouseEvent, b: Booking) {
    ev.preventDefault();
    if (!b || (b.status || '').toLowerCase() === 'paid') return;
    this.payTarget.set(b);
    this.payMethod.set('CARD');
    document.body.classList.add('overflow-hidden');
  }

  closePayModal() {
    this.payTarget.set(null);
    document.body.classList.remove('overflow-hidden');
  }

  async confirmPay(ev?: MouseEvent) {
    ev?.preventDefault();
    const target = this.payTarget();
    if (!target) return;
    this.payingId.set(target.id);
    try {
      const db = await this.openDBV2();
      await this.markPaid(db, target.id, this.payMethod());
      db.close();
      // update local state
      const updated = this.bookings().map(it => it.id === target.id ? { ...it, status: 'paid' } : it);
      this.bookings.set(updated);
      this.closePayModal();
    } catch (e) {
      alert('Failed to process payment. Please try again.');
    } finally {
      this.payingId.set(null);
    }
  }

  calcPricing(b?: Partial<Booking> | null): PricingBreakdown | null {
    if (!b) return null;
    try {
      const input = {
        forest: b.forest || '',
        pkg: b.pkg || 'base',
        guests: Number(b.guests || 1),
        dayTrip: !!b.dayTrip,
        dateIn: b.dateIn || '',
        dateOut: b.dayTrip ? '' : (b.dateOut || ''),
        needTransport: !!b.needTransport,
        needLodging: !!b.needLodging,
      };
      return computePricing(input);
    } catch { return null; }
  }

  setPayMethod(m: string) {
    this.payMethod.set(m);
  }

  // ====== Detail modal helpers ======
  openDetail(ev: MouseEvent, b: Booking) {
    ev.preventDefault();
    this.detailTarget.set(b);
    document.body.classList.add('overflow-hidden');
    // load payments (best-effort)
    this.loadPaymentsFor(b.id).catch(() => {});
  }

  closeDetail() {
    this.detailTarget.set(null);
    this.detailPayments.set([]);
    document.body.classList.remove('overflow-hidden');
  }

  private getPaymentsForBooking(db: IDBDatabase, bookingId: number): Promise<any[]> {
    return new Promise((resolve) => {
      const out: any[] = [];
      try {
        const tx = db.transaction('payments', 'readonly');
        const st = tx.objectStore('payments');
        const useIdx = st.indexNames.contains('bookingId');
        if (useIdx) {
          const idx = st.index('bookingId');
          const req = idx.openCursor(IDBKeyRange.only(bookingId));
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) { out.push(cur.value); cur.continue(); }
            else resolve(out);
          };
          req.onerror = () => resolve(out);
        } else {
          const req = st.openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
              if ((cur.value?.bookingId || 0) === bookingId) out.push(cur.value);
              cur.continue();
            } else resolve(out);
          };
          req.onerror = () => resolve(out);
        }
      } catch {
        resolve(out);
      }
    });
  }

  private async loadPaymentsFor(bookingId: number) {
    try {
      const db = await this.openDB();
      const rows = await this.getPaymentsForBooking(db, bookingId);
      db.close();
      this.detailPayments.set(rows || []);
    } catch { this.detailPayments.set([]); }
  }
}
