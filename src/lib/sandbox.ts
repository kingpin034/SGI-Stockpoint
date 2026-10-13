import type { Activity, Buyback, BuybackQuote, ConsoleData, ExceptionRecord, InventoryUnit, PickupOrder, PickupVerification, Reconciliation, ReconciliationSnapshot, Repository, Stockpoint } from './types';
import { deriveProductStock, inventoryFingerprint, jakartaDate, requireIdempotencyKey, validateBuyback, validateException, validateReconciliation, validateRelease } from './domain';

const stockpoints: Stockpoint[] = [
  { id: 'waris-jakarta', name: 'Waris Jakarta Selatan', city: 'Jakarta', address: 'Jl. Prof. DR. Satrio, Jakarta Selatan · lokasi contoh' },
  { id: 'waris-surabaya', name: 'Waris Surabaya', city: 'Surabaya', address: 'Jl. Basuki Rahmat, Surabaya · lokasi contoh' },
];
const names = ['Alya Putri', 'Budi Santoso', 'Dewi Lestari', 'Rizky Pratama', 'Siti Rahma', 'Andi Wijaya', 'Nabila Zahra', 'Fajar Hidayat', 'Maya Kusuma', 'Dimas Saputra', 'Rina Wulandari', 'Aditya Putra', 'Laras Ayu', 'Arif Setiawan', 'Intan Permata', 'Bayu Nugroho', 'Citra Maharani', 'Hendra Gunawan'];
const sizes = [0.5, 1, 5, 10];
const sellPrice = 1_820_000;
const buybackPrice = 1_740_000;
const id = () => globalThis.crypto.randomUUID();
const clone = <T>(value: T): T => structuredClone(value);

interface LocationState {
  orders: PickupOrder[];
  inventory: InventoryUnit[];
  activities: Activity[];
  buybacks: Buyback[];
  exceptions: ExceptionRecord[];
  reconciliations: Reconciliation[];
  snapshot?: { fingerprint: string; data: ReconciliationSnapshot };
}
interface SavedRequest { payload: string; result: unknown; }

export function getSandboxPickupCode(order: Pick<PickupOrder, 'number'>): string {
  return order.number.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function seedLocation(location: Stockpoint, index: number, now: number): LocationState {
  const inventory: InventoryUnit[] = [];
  const orders: PickupOrder[] = [];
  const prefix = index === 0 ? 'JKT' : 'SBY';
  const iso = (hours = 0) => new Date(now - hours * 3_600_000).toISOString();
  sizes.forEach((grams, productIndex) => {
    for (let i = 1; i <= 10 + productIndex * 3; i++) inventory.push({
      serial: `WR-${prefix}-${String(grams * 10).padStart(3, '0')}-A${String(i).padStart(4, '0')}`,
      productId: `waris-${grams}`, productName: 'WARIS Sampoerna', grams,
      state: 'available', orderNumber: null, updatedAt: iso(24),
    });
  });
  for (let i = 0; i < 18; i++) {
    const grams = sizes[i % sizes.length];
    const quantity = i % 5 === 4 ? 2 : 1;
    const number = `SGP-${1101 + index * 100 + i}`;
    const status = i < 12 ? 'ready' : 'done';
    const serials = Array.from({ length: quantity }, (_, n) => `WR-${prefix}-${String(grams * 10).padStart(3, '0')}-R${String(i * 2 + n + 1).padStart(4, '0')}`);
    const order: PickupOrder = {
      id: `${location.id}-order-${i + 1}`, number, customerName: names[(i + index * 3) % names.length],
      phoneLast4: String(4301 + i * 17), productName: 'WARIS Sampoerna', productId: `waris-${grams}`,
      grams, quantity, total: Math.round(grams * quantity * sellPrice), paymentMethod: i % 2 ? 'va' : 'qris',
      paidAt: iso(2 + i * 1.5), status, serials, ...(status === 'done' ? { releasedAt: iso(i < 15 ? 0 : 26) } : {}),
    };
    orders.push(order);
    serials.forEach(serial => inventory.push({ serial, productId: order.productId, productName: order.productName, grams, state: status === 'ready' ? 'reserved' : 'released', orderNumber: number, updatedAt: order.releasedAt ?? order.paidAt }));
  }
  const buybacks: Buyback[] = orders.slice(16).map((order, i) => ({
    id: `${location.id}-buyback-${i}`, number: `BB-${index + 1}00${i + 1}`, customerName: order.customerName,
    serial: order.serials[0], grams: order.grams, amount: Math.round(order.grams * buybackPrice),
    status: i === 0 ? 'submitted' : 'booked', createdAt: iso(i + 2), notes: 'Catatan contoh: kondisi fisik dan nomor seri sesuai.',
  }));
  const activities: Activity[] = [
    { id: `${location.id}-activity-1`, type: 'pickup', title: 'Emas telah diserahkan', description: `${orders[12].number} · ${orders[12].customerName}`, actor: 'Nadia Kusuma', createdAt: iso(0) },
    { id: `${location.id}-activity-2`, type: 'buyback', title: 'Buyback dicatat', description: `${buybacks[0].number} · ${buybacks[0].customerName}`, actor: 'Nadia Kusuma', createdAt: iso(2) },
    { id: `${location.id}-activity-3`, type: 'exception', title: 'Kendala dicatat', description: `${orders[4].number} · Identitas perlu pemeriksaan`, actor: 'Nadia Kusuma', createdAt: iso(4) },
  ];
  return { orders, inventory, buybacks, activities, reconciliations: [], exceptions: [{ id: `${location.id}-exception-1`, reference: orders[4].number, category: 'identity', note: 'Nama pada identitas perlu dicocokkan ulang saat pelanggan datang.', status: 'open', createdAt: iso(4) }] };
}

export function createSandboxRepository(options: { now?: () => number } = {}): Repository {
  const now = options.now ?? Date.now;
  const locations = new Map(stockpoints.map((location, index) => [location.id, seedLocation(location, index, now())]));
  const listeners = new Set<() => void>();
  const challenges = new Map<string, PickupVerification & { stockpointId: string }>();
  const quotes = new Map<string, BuybackQuote & { stockpointId: string }>();
  const saved = new Map<string, SavedRequest>();
  let signedIn = true;
  let activeLocation = stockpoints[0].id;
  const notify = () => { for (const callback of listeners) queueMicrotask(callback); };
  const iso = () => new Date(now()).toISOString();
  const getLocation = (stockpointId: string) => {
    if (!signedIn) throw new Error('Buka sesi demo staf untuk melanjutkan.');
    const location = locations.get(stockpointId);
    if (!location) throw new Error('Stockpoint tidak tersedia untuk sesi ini.');
    return location;
  };
  const snapshot = (stockpointId: string): ReconciliationSnapshot => {
    const location = getLocation(stockpointId);
    const date = jakartaDate(now());
    const fingerprint = `${date}:${inventoryFingerprint(location.inventory)}`;
    if (!location.snapshot || location.snapshot.fingerprint !== fingerprint) {
      location.snapshot = { fingerprint, data: { id: id(), date, counts: deriveProductStock(location.inventory, now()).map(product => ({ productId: product.productId, expected: product.available + product.reserved })), expectedCash: 0 } };
    }
    return location.snapshot.data;
  };
  const activity = (location: LocationState, type: Activity['type'], title: string, description: string) => {
    location.activities.unshift({ id: id(), type, title, description, actor: 'Nadia Kusuma', createdAt: iso() });
  };
  const prior = <T>(kind: string, stockpointId: string, input: { idempotencyKey: string }): { value?: T; key: string; payload: string } => {
    requireIdempotencyKey(input.idempotencyKey);
    const key = `${kind}:${stockpointId}:${input.idempotencyKey}`;
    const payload = JSON.stringify(input);
    const previous = saved.get(key);
    if (previous && previous.payload !== payload) throw new Error('Permintaan telah dipakai dengan detail berbeda. Ulangi tindakan.');
    return { key, payload, ...(previous ? { value: clone(previous.result as T) } : {}) };
  };
  const save = <T>(request: { key: string; payload: string }, result: T): T => {
    saved.set(request.key, { payload: request.payload, result: clone(result) });
    notify();
    return clone(result);
  };

  return {
    mode: 'sandbox',
    async load(stockpointId) {
      if (!signedIn) return null;
      const locationId = stockpointId ?? activeLocation;
      const location = getLocation(locationId);
      activeLocation = locationId;
      return clone({
        staff: { id: 'demo-nadia', name: 'Nadia Kusuma', email: 'nadia@example.invalid', role: 'staff' },
        stockpoints, activeStockpoint: stockpoints.find(item => item.id === locationId)!,
        orders: location.orders, inventory: location.inventory, activities: location.activities,
        buybacks: location.buybacks, exceptions: location.exceptions, reconciliations: location.reconciliations,
        products: deriveProductStock(location.inventory, now()), reconciliationSnapshot: snapshot(locationId),
        buybackPrice, priceUpdatedAt: iso(), priceSource: 'sample',
      } as ConsoleData);
    },
    async signIn() { signedIn = true; notify(); },
    async signOut() { signedIn = false; challenges.clear(); quotes.clear(); notify(); },
    async verifyPickup(stockpointId, orderId, code) {
      const location = getLocation(stockpointId);
      const order = location.orders.find(item => item.id === orderId);
      if (!order || order.status !== 'ready') throw new Error('Pesanan tidak tersedia untuk pengambilan.');
      if (code.trim().toUpperCase() !== getSandboxPickupCode(order)) throw new Error('Kode pengambilan tidak sesuai dengan pesanan.');
      const verification = { id: id(), orderId, expiresAt: new Date(now() + 5 * 60_000).toISOString() };
      challenges.set(verification.id, { ...verification, stockpointId });
      return clone(verification);
    },
    async releasePickup(stockpointId, input) {
      const location = getLocation(stockpointId);
      const request = prior<PickupOrder>('release', stockpointId, input);
      if (request.value) return request.value;
      const order = location.orders.find(item => item.id === input.orderId);
      if (!order) throw new Error('Pesanan tidak ditemukan di stockpoint ini.');
      validateRelease(order, input);
      const challenge = challenges.get(input.verificationId);
      if (!challenge || challenge.stockpointId !== stockpointId || challenge.orderId !== order.id || Date.parse(challenge.expiresAt) <= now()) throw new Error('Verifikasi kode sudah tidak berlaku. Verifikasi kembali sebelum penyerahan.');
      const units = order.serials.map(serial => location.inventory.find(unit => unit.serial === serial));
      if (units.some(unit => !unit || unit.state !== 'reserved' || unit.orderNumber !== order.number)) throw new Error('Status persediaan berubah. Periksa nomor seri dan laporkan kendala.');
      const timestamp = iso();
      order.status = 'done';
      order.releasedAt = timestamp;
      units.forEach(unit => { unit!.state = 'released'; unit!.updatedAt = timestamp; });
      challenges.delete(input.verificationId);
      activity(location, 'pickup', 'Emas telah diserahkan', `${order.number} · ${order.customerName} · ${order.serials.join(', ')}`);
      return save(request, order);
    },
    async quoteBuyback(stockpointId, serial) {
      const location = getLocation(stockpointId);
      const normalized = serial.trim().toUpperCase();
      const unit = location.inventory.find(item => item.serial === normalized && item.state === 'released');
      const order = unit && location.orders.find(item => item.number === unit.orderNumber && item.status === 'done');
      if (!unit || !order) throw new Error('Nomor seri belum diserahkan atau tidak ditemukan di stockpoint ini.');
      if (location.buybacks.some(item => item.serial === normalized)) throw new Error('Nomor seri ini sudah memiliki pemesanan buyback.');
      const quote: BuybackQuote = { id: id(), serial: normalized, customerName: order.customerName, productName: unit.productName, grams: unit.grams, rate: buybackPrice, amount: Math.round(unit.grams * buybackPrice), expiresAt: new Date(now() + 10 * 60_000).toISOString() };
      quotes.set(quote.id, { ...quote, stockpointId });
      return clone(quote);
    },
    async bookBuyback(stockpointId, input) {
      const location = getLocation(stockpointId);
      const request = prior<Buyback>('buyback', stockpointId, input);
      if (request.value) return request.value;
      validateBuyback(input);
      const quote = quotes.get(input.quoteId);
      if (!quote || quote.stockpointId !== stockpointId || Date.parse(quote.expiresAt) <= now()) throw new Error('Penawaran sudah tidak berlaku. Periksa nomor seri kembali.');
      if (location.buybacks.some(item => item.serial === quote.serial)) throw new Error('Nomor seri ini sudah memiliki pemesanan buyback.');
      const booking: Buyback = { id: id(), number: `BB-${stockpointId === stockpoints[0].id ? '1' : '2'}${String(location.buybacks.length + 1).padStart(3, '0')}`, customerName: quote.customerName, serial: quote.serial, grams: quote.grams, amount: quote.amount, status: 'booked', createdAt: iso(), notes: input.notes.trim() };
      location.buybacks.unshift(booking);
      quotes.delete(input.quoteId);
      activity(location, 'buyback', 'Buyback dicatat', `${booking.number} · ${booking.customerName} · ${booking.serial}`);
      return save(request, booking);
    },
    async submitReconciliation(stockpointId, input) {
      const location = getLocation(stockpointId);
      const request = prior<Reconciliation>('reconciliation', stockpointId, input);
      if (request.value) return request.value;
      const current = snapshot(stockpointId);
      if (location.reconciliations.some(item => item.date === current.date)) throw new Error('Rekonsiliasi hari ini sudah diserahkan.');
      const variance = validateReconciliation(current, input);
      const reconciliation: Reconciliation = { id: id(), date: current.date, counts: current.counts.map(row => ({ ...row, counted: input.counted.find(item => item.productId === row.productId)!.counted })), expectedCash: current.expectedCash, countedCash: input.countedCash, note: input.note.trim(), status: variance ? 'exception' : 'balanced', submittedAt: iso(), submittedBy: 'Nadia Kusuma' };
      location.reconciliations.unshift(reconciliation);
      activity(location, 'reconciliation', variance ? 'Rekonsiliasi dengan selisih' : 'Rekonsiliasi sesuai', `${current.date} · ${variance ? input.note.trim() : 'Stok dan kas sesuai catatan'}`);
      if (variance) {
        location.exceptions.unshift({ id: id(), reference: `REK-${current.date}`, category: input.countedCash !== current.expectedCash ? 'cash' : 'stock', note: input.note.trim(), status: 'open', createdAt: iso() });
        activity(location, 'exception', 'Selisih rekonsiliasi dicatat', input.note.trim());
      }
      return save(request, reconciliation);
    },
    async reportException(stockpointId, input) {
      const location = getLocation(stockpointId);
      const request = prior<ExceptionRecord>('exception', stockpointId, input);
      if (request.value) return request.value;
      validateException(input);
      const record: ExceptionRecord = { id: id(), reference: input.reference.trim(), category: input.category, note: input.note.trim(), status: 'open', createdAt: iso() };
      location.exceptions.unshift(record);
      activity(location, 'exception', 'Kendala dicatat', `${record.reference} · ${record.note}`);
      return save(request, record);
    },
    subscribe(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
  };
}
