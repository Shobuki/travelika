import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { HeaderComponent } from '../components/header/header.component'; // <--- import header
import { FooterComponent } from '../components/footer/footer.component';
import { computePricing, pricingConstants } from '../lib/pricing';


@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent, FooterComponent], // <--- daftarkan di sini
  templateUrl: './home.component.html',
  //styleUrls: ['./home.component.css']
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  private rainRAF = 0;
  private rainRO?: ResizeObserver;
  private stopRainFn?: () => void;
  // ---- IndexedDB helpers (native, align with login/mybookings) ----
  private openDB(): Promise<IDBDatabase> {
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
            try { s.createIndex('email', 'email', { unique: false }); } catch {}
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

  private idbAdd<T>(db: IDBDatabase, store: string, value: T): Promise<IDBValidKey> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const st = tx.objectStore(store);
      const req = st.add(value as any);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const st = tx.objectStore(store);
      const req = st.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }
  private idbPut<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const st = tx.objectStore(store);
      const req = st.put(value as any);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ---- Cookie helpers ----
  private setCookie(name: string, value: string, days = 7) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    let cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
    if (location.protocol === 'https:') cookie += ';Secure';
    document.cookie = cookie;
  }
  private getSession(): { email: string; name?: string } | null {
    try {
      const raw = (document.cookie.split('; ').find(r => r.startsWith('travelika_session=')) || '').split('=')[1];
      return raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch { return null; }
  }

  // ---- UI helpers (DOM-based to match existing template) ----
  ngAfterViewInit(): void {
    // If elements are not present (SSR or different view), just no-op
    const form = document.getElementById('bookingForm') as HTMLFormElement | null;
    if (!form) return;

    // Setup hero rain effect
    try { this.setupHeroRain(); } catch {}

    // Refs
    const forest = document.getElementById('forest') as HTMLSelectElement | null;
    const pickup = document.getElementById('pickup') as HTMLSelectElement | null;
    const dateIn = document.getElementById('dateIn') as HTMLInputElement | null;
    const dateOut = document.getElementById('dateOut') as HTMLInputElement | null;
    const guests = document.getElementById('guests') as HTMLInputElement | null;
    const pkg = document.getElementById('pkg') as HTMLSelectElement | null;
    const needTransport = document.getElementById('needTransport') as HTMLInputElement | null;
    const needLodging = document.getElementById('needLodging') as HTMLInputElement | null;
    const dayTrip = document.getElementById('dayTrip') as HTMLInputElement | null;

    const authModal = document.getElementById('authModal');
    const authSummary = document.getElementById('authModalSummary');
    const authGoLogin = document.getElementById('authGoLogin') as HTMLButtonElement | null;

    const confirmModal = document.getElementById('confirmModal');
    const confirmSummary = document.getElementById('confirmModalSummary');
    const confirmTotal = document.getElementById('confirmModalTotal');
    const confirmGoCheckout = document.getElementById('confirmGoCheckout') as HTMLButtonElement | null;
    const confirmSavePending = document.getElementById('confirmSavePending') as HTMLButtonElement | null;

    const successModal = document.getElementById('successModal');
    const successBody = document.getElementById('successModalBody');

    // Payment modal
    const paymentModal = document.getElementById('paymentModal');
    const paymentSummary = document.getElementById('paymentModalSummary');
    const paymentTotal = document.getElementById('paymentModalTotal');
    const paymentDoPay = document.getElementById('paymentDoPay') as HTMLButtonElement | null;
    const getSelectedPayMethod = () => {
      const el = document.querySelector('input[name="payMethod"]:checked') as HTMLInputElement | null;
      return (el?.value || 'CARD');
    };
    // Legacy calc stubs (removed UI)
    const calcModal = null as HTMLElement | null;
    const calcSummary = null as HTMLElement | null;
    const calcBreakdown = null as HTMLElement | null;
    const calcDestinations = null as HTMLElement | null;
    const openCalcBtn = null as HTMLElement | null;
    // Pricing (pre-checkout) modal refs
    const pricingModal = document.getElementById('pricingModal');
    const pricingSummary = document.getElementById('pricingModalSummary');
    const pricingBreakdown = document.getElementById('pricingModalBreakdown');
    const pricingTotal = document.getElementById('pricingModalTotal');
    const pricingDestinations = document.getElementById('pricingDestinations');
    const pricingContinue = document.getElementById('pricingContinue') as HTMLButtonElement | null;
    const pricingBack = document.getElementById('pricingBack') as HTMLButtonElement | null;

    // Calc modal refs
    

    // Visual selected state for payment options (Home modal)
    const refreshPayOptionsUI = () => {
      const labels = Array.from(paymentModal?.querySelectorAll('label.pay-option') || []) as HTMLElement[];
      labels.forEach(l => {
        const input = l.querySelector('input[type="radio"]') as HTMLInputElement | null;
        l.classList.toggle('selected', !!input?.checked);
      });
    };
    document.querySelectorAll('input[name="payMethod"]').forEach(el => {
      el.addEventListener('change', refreshPayOptionsUI);
    });

    // Date min and interactivity
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const minDate = `${yyyy}-${mm}-${dd}`;
    if (dateIn) dateIn.min = minDate;
    if (dateOut) dateOut.min = minDate;

    if (dayTrip && dateOut) {
      dayTrip.addEventListener('change', (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        dateOut.disabled = checked;
        if (checked) dateOut.value = '';
      });
    }
    if (dateIn && dateOut) {
      dateIn.addEventListener('change', () => {
        dateOut.min = dateIn.value || minDate;
        if (dateOut.value && dateOut.value < dateOut.min) dateOut.value = '';
      });
    }

    // Utils
    const diffDays = (a: string, b: string) => {
      const A = new Date(a), B = new Date(b);
      const ms = (Number(B) - Number(A)) / (1000 * 60 * 60 * 24);
      return Math.max(1, Math.round(ms));
    };
    const fmtIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(n);

    const collectPayloadAndSubtotal = () => {
      const pax = Math.max(1, Number(guests?.value || 1));
      const payload = {
        forest: forest?.value || '',
        pickup: pickup?.value || '',
        dateIn: dateIn?.value || '',
        dateOut: dayTrip?.checked ? '' : (dateOut?.value || ''),
        dayTrip: !!dayTrip?.checked,
        guests: pax,
        pkg: pkg?.value || 'base',
        needTransport: !!needTransport?.checked,
        needLodging: !!needLodging?.checked,
      };
      const breakdown = computePricing(payload as any);
      return { payload, subtotal: breakdown.total, days: breakdown.days, nights: breakdown.nights, pax, mult: breakdown.multiplier, breakdown };
    };

    const makeSummary = (payload: any, subtotal: number, forestLabel: string, pax: number, breakdown?: any) => (
      `Forest   : ${forestLabel}\n` +
      `Pickup   : ${payload.pickup}\n` +
      `Dates    : ${payload.dateIn}${payload.dayTrip ? ' (day trip)' : ' – ' + (payload.dateOut || '-') }\n` +
      `Guests   : ${pax} | Package: ${payload.pkg}\n` +
      `Transport: ${payload.needTransport ? 'Yes' : 'No'} | Lodging: ${payload.needLodging ? 'Yes' : 'No'}\n\n` +
      `Estimated cost: ${fmtIDR(subtotal)}`
    );

    const openAuthModal = (summaryText: string) => {
      if (authSummary) authSummary.textContent = summaryText;
      authModal?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    };
    const closeAuthModal = () => {
      authModal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    authModal?.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('[data-close-auth]')) closeAuthModal();
    });

    const openConfirmModal = (summaryText: string, totalText: string) => {
      if (confirmSummary) confirmSummary.textContent = summaryText;
      if (confirmTotal) confirmTotal.textContent = totalText;
      confirmModal?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    };
    const closeConfirmModal = () => {
      confirmModal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    confirmModal?.addEventListener('click', (e) => {
      const t = (e as any).target as HTMLElement;
      if (t.matches('[data-close-confirm]')) closeConfirmModal();
    });

    const openSuccessModal = (text: string) => {
      if (successBody) successBody.textContent = text;
      successModal?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    };
    const closeSuccessModal = () => {
      successModal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    successModal?.addEventListener('click', (e) => {
      const t = (e as any).target as HTMLElement;
      if (t.matches('[data-close-success]')) closeSuccessModal();
    });

    const openPaymentModal = (summaryText: string, totalText: string) => {
      if (paymentSummary) paymentSummary.textContent = summaryText;
      if (paymentTotal) paymentTotal.textContent = totalText;
      paymentModal?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      refreshPayOptionsUI();
    };
    const closePaymentModal = () => {
      paymentModal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    paymentModal?.addEventListener('click', (e) => {
      const t = (e as any).target as HTMLElement;
      if (t.matches('[data-close-payment]')) closePaymentModal();
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!successModal?.classList.contains('hidden')) return closeSuccessModal();
        if (!confirmModal?.classList.contains('hidden')) return closeConfirmModal();
        if (!paymentModal?.classList.contains('hidden')) return closePaymentModal();
        if (!pricingModal?.classList.contains('hidden')) return closePricingModal();
        if (!authModal?.classList.contains('hidden')) return closeAuthModal();
      }
    });

    let pendingPayload: any = null;
    let pendingBookingInfo: { id: number; code: string; email: string } | null = null;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!dateIn) return;
      if (!dateIn.value) { alert('Please select an arrival date.'); return; }
      if (!dayTrip?.checked && !dateOut?.value) {
        alert('Please select a departure date (or choose Day Trip).');
        return;
      }

      const { payload, subtotal, pax, breakdown } = collectPayloadAndSubtotal();
      const forestLabel = forest?.options[forest.selectedIndex!]?.text || payload.forest;

      // Prefill cookie for next visit
      this.setCookie('travelika_visit', JSON.stringify({ ...payload, subtotal }), 7);

      const ses = this.getSession();
      if (!ses) {
        const summary = makeSummary(payload, subtotal, forestLabel, pax, breakdown) + '\n\nSign in to continue.';
        openAuthModal(summary);
        if (authGoLogin) {
          authGoLogin.onclick = () => {
            const next = location.pathname + '#pesan';
            location.href = '/login?next=' + encodeURIComponent(next);
          };
        }
        return;
      }

      pendingPayload = { ...payload, subtotal, forestLabel, pax, ses, breakdown };
      openPricingModal();
    });

    // ----- Pricing modal behavior -----
    const openPricingModal = () => {
      const p = pendingPayload;
      if (!p) return;
      const summary = [
        `Forest   : ${p.forestLabel}`,
        `Pickup   : ${p.pickup}`,
        `Dates    : ${p.dateIn}${p.dayTrip ? ' (day trip)' : ' – ' + (p.dateOut || '-')}`,
        `Guests   : ${p.pax} | Package: ${p.pkg}`,
        `Extras   : Transport=${p.needTransport ? 'Yes' : 'No'} | Lodging=${p.needLodging ? 'Yes' : 'No'}`,
      ].join('\n');
      if (pricingSummary) pricingSummary.textContent = summary;
      const b = p.breakdown || computePricing(p);
      const perTrans = pricingConstants.transportPerPerson;
      const perLodge = pricingConstants.lodgingPerNightPerPerson;
      const bdHTML = `
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-y-1">
            <div>Pass</div><div class="text-right font-semibold">${fmtIDR(b.passCost)}</div>
            <div class="col-span-2 text-[12px] text-slate-500">Base ${fmtIDR(b.basePerPersonPerDay)} × ${p.pax} pax × ${b.days} day(s) × ${b.multiplier} (pkg)</div>
          </div>
          <div class="grid grid-cols-2 gap-y-1">
            <div>Transport</div><div class="text-right font-semibold">${fmtIDR(b.transportCost)}</div>
            <div class="col-span-2 text-[12px] text-slate-500">${fmtIDR(perTrans)} × ${p.pax} pax${p.needTransport ? '' : ' (not selected)'}</div>
          </div>
          <div class="grid grid-cols-2 gap-y-1">
            <div>Lodging</div><div class="text-right font-semibold">${fmtIDR(b.lodgingCost)}</div>
            <div class="col-span-2 text-[12px] text-slate-500">${fmtIDR(perLodge)} × ${p.pax} pax × ${b.nights} night(s)${p.needLodging ? '' : ' (not selected)'}</div>
          </div>
        </div>
      `;
      if (pricingBreakdown) pricingBreakdown.innerHTML = bdHTML;
      if (pricingTotal) pricingTotal.textContent = fmtIDR(p.subtotal);

      // build destination list
      const forests = Object.keys(pricingConstants.forestBaseIDR || {});
      const destHTML = forests.map((f) => {
        const bp = computePricing({
          forest: f,
          pkg: p.pkg,
          guests: p.pax,
          dayTrip: p.dayTrip,
          dateIn: p.dateIn,
          dateOut: p.dateOut,
          needTransport: p.needTransport,
          needLodging: p.needLodging,
        });
        const isSel = (p.forest || '').toUpperCase() === f.toUpperCase();
        return `
          <div class="p-3 rounded-lg border ${isSel ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'} cursor-pointer hover:bg-slate-50"
               data-select-forest="${f}">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium text-slate-800">${forestLabelLocal(f)}</div>
              <div class="font-semibold">${fmtIDR(bp.total)}</div>
            </div>
            <div class="mt-1 grid grid-cols-2">
              <div>Pass</div><div class="text-right">${fmtIDR(bp.passCost)}</div>
              <div>Transport</div><div class="text-right">${fmtIDR(bp.transportCost)}</div>
              <div>Lodging</div><div class="text-right">${fmtIDR(bp.lodgingCost)}</div>
            </div>
          </div>`;
      }).join('');
      if (pricingDestinations) pricingDestinations.innerHTML = destHTML;

      pricingModal?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    };
    const closePricingModal = () => {
      pricingModal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    pricingModal?.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement);
      if (target.matches('[data-close-pricing]')) return closePricingModal();
      const card = target.closest('[data-select-forest]') as HTMLElement | null;
      if (card) {
        const f = card.getAttribute('data-select-forest') || '';
        if (forest) forest.value = f;
        const d = collectPayloadAndSubtotal();
        const label = forest?.options[forest.selectedIndex!]?.text || f;
        // keep existing session
        const ses = pendingPayload?.ses;
        pendingPayload = { ...d.payload, subtotal: d.subtotal, forestLabel: label, pax: d.pax, ses, breakdown: d.breakdown };
        // refresh modal content
        openPricingModal();
      }
    });
    pricingBack?.addEventListener('click', (e: MouseEvent) => { e.preventDefault(); closePricingModal(); });
    pricingContinue?.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      const p = pendingPayload;
      closePricingModal();
      if (!p) return;
      openConfirmModal(makeSummary(p, p.subtotal, p.forestLabel, p.pax, p.breakdown), fmtIDR(p.subtotal));
    });

    confirmGoCheckout?.addEventListener('click', async () => {
      if (!pendingPayload) return;
      const btn = confirmGoCheckout;
      const originalText = btn?.textContent || '';
      if (btn) { btn.disabled = true; btn.textContent = 'Preparing payment...'; }

      try {
        const { subtotal, forestLabel, pax, ses, ...payload } = pendingPayload;
        // Ensure booking exists as pending before payment
        if (!pendingBookingInfo) {
          pendingBookingInfo = await this.savePendingBooking({ ...payload, subtotal });
        }

        closeConfirmModal();
        const summaryText = makeSummary(payload, subtotal, forestLabel, pax, pendingPayload.breakdown);
        openPaymentModal(summaryText, fmtIDR(subtotal));
      } catch (err) {
        console.error('Prepare payment failed:', err);
        alert('Failed to start payment. Please try again.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
      }
    });

    confirmSavePending?.addEventListener('click', async () => {
      if (!pendingPayload) return;
      const btn = confirmSavePending;
      const originalText = btn?.textContent || '';
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

      try {
        const { subtotal, forestLabel, pax, ses, ...payload } = pendingPayload;
        const { id, code } = await this.savePendingBooking({ ...payload, subtotal });
        pendingBookingInfo = { id, code, email: ses.email };

        closeConfirmModal();

        const successText =
`Booking Code : ${code}
Status       : Pending
Under        : ${ses.email}

Forest   : ${forestLabel}
Pickup   : ${payload.pickup}
Dates    : ${payload.dateIn}${payload.dayTrip ? ' (day trip)' : ' – ' + (payload.dateOut || '-')}
Guests   : ${pax} | Package: ${payload.pkg}
Transport: ${payload.needTransport ? 'Yes' : 'No'} | Lodging: ${payload.needLodging ? 'Yes' : 'No'}

Total due: ${fmtIDR(subtotal)}

Your booking is saved as pending in this browser (IndexedDB).
You can pay later from My Bookings.`;
        openSuccessModal(successText);

        this.setCookie('travelika_visit', '', -1);
        pendingPayload = null;
        pendingBookingInfo = null;
      } catch (err) {
        console.error('Save pending failed:', err);
        alert('Failed to save booking. Please try again.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
      }
    });

    paymentDoPay?.addEventListener('click', async () => {
      if (!pendingPayload) return;
      if (!pendingBookingInfo) return;
      const btn = paymentDoPay;
      const originalText = btn?.textContent || '';
      if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

      try {
        const method = getSelectedPayMethod();
        await this.markBookingPaid(pendingBookingInfo.id, method);
        closePaymentModal();

        const { subtotal, forestLabel, pax, ses, ...payload } = pendingPayload;
        const code = pendingBookingInfo.code;
        const successText =
`Booking Code : ${code}
Status       : Paid
Under        : ${ses.email}

Forest   : ${forestLabel}
Pickup   : ${payload.pickup}
Dates    : ${payload.dateIn}${payload.dayTrip ? ' (day trip)' : ' – ' + (payload.dateOut || '-')}
Guests   : ${pax} | Package: ${payload.pkg}
Transport: ${payload.needTransport ? 'Yes' : 'No'} | Lodging: ${payload.needLodging ? 'Yes' : 'No'}

Total paid: ${fmtIDR(subtotal)}

Your pass is saved in this browser (IndexedDB).
You can see it in My Bookings.`;
        openSuccessModal(successText);

        this.setCookie('travelika_visit', '', -1);
        pendingPayload = null;
        pendingBookingInfo = null;
      } catch (err) {
        console.error('Payment failed:', err);
        alert('Payment failed. Please try again.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
      }
    });

    // ---------- Cost Calculator ----------
    const openCalcModal = () => {
      refreshCalcModal();
      calcModal?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    };
    const closeCalcModal = () => {
      calcModal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    calcModal?.addEventListener('click', (e: MouseEvent) => {
      const t = (e as any).target as HTMLElement;
      if (t.matches('[data-close-calc]')) closeCalcModal();
    });
    openCalcBtn?.addEventListener('click', (e: MouseEvent) => { e.preventDefault(); openCalcModal(); });

    function fmtIDRLocal(n: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(n); }
    function forestLabelLocal(forest: string): string {
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

    const refreshCalcModal = () => {
      const { payload, subtotal, pax, breakdown } = collectPayloadAndSubtotal();
      const forestLabel = forest?.options[forest.selectedIndex!]?.text || forestLabelLocal(payload.forest);

      // Summary
      const summaryText = [
        `Forest   : ${forestLabel}`,
        `Pickup   : ${payload.pickup}`,
        `Dates    : ${payload.dateIn}${payload.dayTrip ? ' (day trip)' : ' – ' + (payload.dateOut || '-')}`,
        `Guests   : ${pax} | Package: ${payload.pkg}`,
        `Extras   : Transport=${payload.needTransport ? 'Yes' : 'No'} | Lodging=${payload.needLodging ? 'Yes' : 'No'}`,
        ``,
        `Total    : ${fmtIDRLocal(subtotal)}`,
      ].join('\n');
      if (calcSummary) calcSummary.textContent = summaryText;

      // Deltas
      const noTransport = computePricing({ ...payload, needTransport: false });
      const yesTransport = computePricing({ ...payload, needTransport: true });
      const deltaTransport = yesTransport.total - noTransport.total;
      const noLodging = computePricing({ ...payload, needLodging: false });
      const yesLodging = computePricing({ ...payload, needLodging: true });
      const deltaLodging = yesLodging.total - noLodging.total;
      const baseC = computePricing({ ...payload, pkg: 'base' });
      const explorerC = computePricing({ ...payload, pkg: 'explorer' });
      const expeditionC = computePricing({ ...payload, pkg: 'expedition' });

      const bdHTML = `
        <div class="grid grid-cols-2 gap-y-1">
          <div>Pass</div><div class="text-right">${fmtIDRLocal(breakdown.passCost)}</div>
          <div>Transport</div><div class="text-right">${fmtIDRLocal(breakdown.transportCost)} <span class="text-slate-500">(${deltaTransport >= 0 ? '+' : ''}${fmtIDRLocal(deltaTransport)})</span></div>
          <div>Lodging</div><div class="text-right">${fmtIDRLocal(breakdown.lodgingCost)} <span class="text-slate-500">(${deltaLodging >= 0 ? '+' : ''}${fmtIDRLocal(deltaLodging)})</span></div>
        </div>
        <hr class="my-2 border-slate-200">
        <div class="text-xs font-semibold mb-1">Package impact</div>
        <div class="grid grid-cols-2 gap-y-1">
          <div>Base</div><div class="text-right">${fmtIDRLocal(baseC.total)}</div>
          <div>Explorer</div><div class="text-right">${fmtIDRLocal(explorerC.total)} <span class="text-slate-500">(${explorerC.total - baseC.total >= 0 ? '+' : ''}${fmtIDRLocal(explorerC.total - baseC.total)})</span></div>
          <div>Expedition</div><div class="text-right">${fmtIDRLocal(expeditionC.total)} <span class="text-slate-500">(${expeditionC.total - baseC.total >= 0 ? '+' : ''}${fmtIDRLocal(expeditionC.total - baseC.total)})</span></div>
        </div>
      `;
      if (calcBreakdown) calcBreakdown.innerHTML = bdHTML;

      // Destination comparison for same pkg and extras
      const forests = Object.keys(pricingConstants.forestBaseIDR || {});
      const destItems = forests.map((f) => {
        const cost = computePricing({ ...payload, forest: f }).total;
        const diff = cost - subtotal;
        const sign = diff >= 0 ? '+' : '';
        return `<div class="flex items-center justify-between gap-3 p-2 rounded border border-slate-200 bg-white">
          <div class="text-slate-700">${forestLabelLocal(f)}</div>
          <div class="text-right">
            <div class="font-semibold">${fmtIDRLocal(cost)}</div>
            <div class="text-[11px] text-slate-500">(${sign}${fmtIDRLocal(diff)})</div>
          </div>
        </div>`;
      }).join('');
      if (calcDestinations) calcDestinations.innerHTML = destItems;
    };

    // Live update calculator while open
    const calcSelectors = ['#forest', '#pickup', '#dateIn', '#dateOut', '#guests', '#pkg', '#needTransport', '#needLodging', '#dayTrip'];
    calcSelectors.forEach((sel) => {
      const el = document.querySelector(sel);
      el?.addEventListener('change', () => {
        if (!calcModal?.classList.contains('hidden')) refreshCalcModal();
      });
      el?.addEventListener('input', () => {
        if (!calcModal?.classList.contains('hidden')) refreshCalcModal();
      });
    });
  }

  ngOnDestroy(): void {
    // Stop rain animation
    if (this.stopRainFn) { try { this.stopRainFn(); } catch {} }
  }

  private setupHeroRain() {
    // Respect reduced motion unless body.anim-on overrides
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce && !document.body.classList.contains('anim-on')) return;

    const hero = document.getElementById('hero') as HTMLElement | null;
    const canvas = document.getElementById('rainCanvas') as HTMLCanvasElement | null;
    if (!hero || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let width = 0, height = 0;

    type Drop = { x: number; y: number; len: number; spd: number; wind: number };
    let drops: Drop[] = [];
    let last = performance.now();

    const cfg = {
      density: 0.15,         // drops per css px^2 factor
      baseSpeed: 900,        // px/s baseline
      speedVar: 700,         // variability
      baseLen: 14,           // px
      lenVar: 12,            // variability
      wind: 140,             // px/s horizontal drift
      color: 'rgba(255,255,255,0.28)',
      lineWidth: 1.0,
    };

    function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      width = cssW * dpr; height = cssH * dpr;
      canvas.width = width; canvas.height = height;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';

      // Number of drops scales with area, capped for perf
      const area = cssW * cssH;
      const target = Math.min(350, Math.max(80, Math.floor(area * cfg.density / 3500)));
      drops = new Array(target).fill(0).map(() => ({
        x: rand(0, cssW) * dpr,
        y: rand(-cssH, cssH) * dpr,
        len: (cfg.baseLen + rand(-cfg.lenVar, cfg.lenVar)) * dpr,
        spd: (cfg.baseSpeed + rand(-cfg.speedVar, cfg.speedVar)),
        wind: cfg.wind + rand(-60, 60),
      }));
    };

    resize();
    let usedWindowListener = false;
    if (typeof (window as any).ResizeObserver !== 'undefined') {
      this.rainRO = new ResizeObserver(() => resize());
      this.rainRO.observe(hero);
    } else {
      usedWindowListener = true;
      window.addEventListener('resize', resize);
    }

    ctx.strokeStyle = cfg.color;

    const step = (now: number) => {
      const dt = Math.min(66, now - last) / 1000; // clamp to avoid huge jumps
      last = now;
      // clear
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = cfg.lineWidth * dpr;
      ctx.beginPath();
      for (let i = 0; i < drops.length; i++) {
        const dr = drops[i];
        const dx = dr.wind * dt * dpr;
        const dy = dr.spd * dt * dpr;
        dr.x += dx; dr.y += dy;
        // wrap
        if (dr.y - dr.len > height || dr.x > width + 40 * dpr) {
          dr.x = rand(-40, canvas.clientWidth + 40) * dpr;
          dr.y = rand(-canvas.clientHeight, -20) * dpr;
        }
        // draw as a short slanted segment
        ctx.moveTo(dr.x, dr.y);
        ctx.lineTo(dr.x - dr.wind * 0.02 * dpr, dr.y - dr.len);
      }
      ctx.stroke();
      this.rainRAF = requestAnimationFrame(step);
    };
    this.rainRAF = requestAnimationFrame(step);

    this.stopRainFn = () => {
      if (this.rainRAF) cancelAnimationFrame(this.rainRAF);
      this.rainRAF = 0;
      if (this.rainRO) this.rainRO.disconnect();
      if (usedWindowListener) window.removeEventListener('resize', resize);
    };
  }

  private async saveBookingAndMarkPaid(payload: any): Promise<{ id: number; code: string; email: string }> {
    const db = await this.openDB();
    try {
      const ses = this.getSession();
      if (!ses) throw new Error('AUTH_REQUIRED');
      const code = this.genBookingCode();
      const rec: any = {
        code,
        email: ses.email,
        name: ses.name || null,
        createdAt: Date.now(),
        status: 'pending',
        ...payload,
      };
      const id = await this.idbAdd<any>(db, 'bookings', rec) as number;

      // Mark paid (simulate checkout)
      const existing = await this.idbGet<any>(db, 'bookings', id);
      if (existing) {
        existing.status = 'paid';
        (existing as any).paidAt = Date.now();
        await this.idbPut<any>(db, 'bookings', existing);
      }
      return { id, code, email: rec.email };
    } finally {
      db.close();
    }
  }

  private async savePendingBooking(payload: any): Promise<{ id: number; code: string; email: string }> {
    const db = await this.openDB();
    try {
      const ses = this.getSession();
      if (!ses) throw new Error('AUTH_REQUIRED');
      const code = this.genBookingCode();
      const rec: any = {
        code,
        email: ses.email,
        name: ses.name || null,
        createdAt: Date.now(),
        status: 'pending',
        ...payload,
      };
      const id = await this.idbAdd<any>(db, 'bookings', rec) as number;
      return { id, code, email: rec.email };
    } finally {
      db.close();
    }
  }

  private async markBookingPaid(id: number, method?: string): Promise<void> {
    const db = await this.openDB();
    try {
      const existing = await this.idbGet<any>(db, 'bookings', id);
      if (existing) {
        existing.status = 'paid';
        (existing as any).paidAt = Date.now();
        if (method) (existing as any).paidMethod = method;
        await this.idbPut<any>(db, 'bookings', existing);

        // Add payment record
        try {
          await this.idbAdd<any>(db, 'payments', {
            bookingId: id,
            code: existing.code,
            email: existing.email,
            amount: existing.subtotal || 0,
            method: method || 'CARD',
            status: 'paid',
            createdAt: Date.now(),
          });
        } catch {}
      } else {
        throw new Error('BOOKING_NOT_FOUND');
      }
    } finally {
      db.close();
    }
  }

  private genBookingCode(): string {
    const d = new Date();
    const y = d.getFullYear().toString().slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TIKA-${y}${m}${day}-${rand}`;
  }
}
// (duplicate calc block removed)
    
