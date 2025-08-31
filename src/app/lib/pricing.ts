export type PricingInput = {
  forest: string;
  pkg: string;
  guests: number;
  dayTrip?: boolean;
  dateIn: string;
  dateOut?: string;
  needTransport?: boolean;
  needLodging?: boolean;
};

export type PricingBreakdown = {
  basePerPersonPerDay: number;
  multiplier: number;
  days: number;
  nights: number;
  passCost: number;
  transportCost: number;
  lodgingCost: number;
  total: number;
};

const forestBaseIDR: Record<string, number> = {
  AMAZON: 900_000,
  BORNEO: 700_000,
  BLACK_FOREST: 650_000,
  TONGASS: 800_000,
  AOKIGAHARA: 600_000,
  DAINTREE: 680_000,
  OLYMPIC: 720_000,
};

const packageMultiplier: Record<string, number> = {
  base: 1,
  explorer: 1.4,
  expedition: 1.9,
};

const transportPerPerson = 350_000;
const lodgingPerNightPerPerson = 450_000;

function diffDays(a: string, b: string): number {
  const A = new Date(a);
  const B = new Date(b);
  const ms = (Number(B) - Number(A)) / (1000 * 60 * 60 * 24);
  if (!isFinite(ms)) return 1;
  return Math.max(1, Math.round(ms));
}

export function computePricing(input: PricingInput): PricingBreakdown {
  const forestKey = (input.forest || '').toUpperCase();
  const pkgKey = (input.pkg || 'base').toLowerCase();

  const base = forestBaseIDR[forestKey] ?? 600_000; // fallback
  const mult = packageMultiplier[pkgKey] ?? 1;
  const pax = Math.max(1, Number(input.guests || 1));

  const days = input.dayTrip ? 1 : diffDays(input.dateIn, input.dateOut || input.dateIn);
  const nights = Math.max(0, days - 1);

  const passCost = base * pax * days * mult;
  const transportCost = input.needTransport ? transportPerPerson * pax : 0;
  const lodgingCost = input.needLodging && nights > 0 ? lodgingPerNightPerPerson * pax * nights : 0;
  const total = passCost + transportCost + lodgingCost;

  return { basePerPersonPerDay: base, multiplier: mult, days, nights, passCost, transportCost, lodgingCost, total };
}

export const pricingConstants = {
  forestBaseIDR,
  packageMultiplier,
  transportPerPerson,
  lodgingPerNightPerPerson,
};
