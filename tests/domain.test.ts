import { describe, expect, it } from 'vitest';
import { deriveProductStock, jakartaDate } from '../src/lib/domain';
import { createSandboxRepository, getSandboxPickupCode } from '../src/lib/sandbox';
import type { ConsoleData, PickupOrder, ReconciliationInput, ReleaseInput, Repository } from '../src/lib/types';

const initialTime = Date.parse('2026-10-13T06:00:00.000Z');
const load = async (repository: Repository, stockpointId?: string) => (await repository.load(stockpointId)) as ConsoleData;
const create = () => createSandboxRepository({ now: () => initialTime });
async function verified(repository: Repository, data: ConsoleData, order = data.orders[0]): Promise<ReleaseInput> {
  const verification = await repository.verifyPickup(data.activeStockpoint.id, order.id, getSandboxPickupCode(order));
  return { orderId: order.id, verificationId: verification.id, serials: [...order.serials], identityConfirmed: true, idempotencyKey: 'release-request-1' };
}
function counts(data: ConsoleData): ReconciliationInput {
  return { snapshotId: data.reconciliationSnapshot.id, counted: data.reconciliationSnapshot.counts.map(row => ({ productId: row.productId, counted: row.expected })), countedCash: 0, note: '', idempotencyKey: 'reconciliation-1' };
}

describe('local stockpoint dataset', () => {
  it('starts a demo session in production-independent memory with unique serials', async () => {
    const repository = create();
    const data = await load(repository);
    expect(repository.mode).toBe('sandbox');
    expect(data.staff.name).toBe('Nadia Kusuma');
    expect(data.stockpoints).toHaveLength(2);
    expect(data.orders).toHaveLength(18);
    expect(data.products.map(product => product.grams)).toEqual([0.5, 1, 5, 10]);
    expect(new Set(data.inventory.map(unit => unit.serial)).size).toBe(data.inventory.length);
    expect(data.reconciliationSnapshot.counts.every(row => row.expected > 0)).toBe(true);
  });
  it('returns detached values so UI edits cannot mutate inventory or orders', async () => {
    const repository = create();
    const data = await load(repository);
    data.orders[0].status = 'done';
    data.inventory[0].state = 'released';
    const next = await load(repository);
    expect(next.orders[0].status).toBe('ready');
    expect(next.inventory[0].state).toBe('available');
  });
  it('isolates locations and rejects unknown locations', async () => {
    const repository = create();
    const first = await load(repository);
    const second = await load(repository, first.stockpoints[1].id);
    expect(second.orders[0].id).not.toBe(first.orders[0].id);
    expect(second.inventory[0].serial).not.toBe(first.inventory[0].serial);
    await expect(repository.load('unknown')).rejects.toThrow('Stockpoint');
  });
  it('signs out and restarts a demo session without real credentials', async () => {
    const repository = create();
    await repository.signOut();
    expect(await repository.load()).toBeNull();
    await expect(repository.quoteBuyback('waris-jakarta', 'anything')).rejects.toThrow('sesi demo');
    await repository.signIn('', '');
    expect((await load(repository)).staff.id).toBe('demo-nadia');
  });
  it('uses Jakarta dates on either side of midnight', () => {
    expect(jakartaDate('2026-10-13T16:59:59Z')).toBe('2026-10-13');
    expect(jakartaDate('2026-10-13T17:00:00Z')).toBe('2026-10-14');
  });
});

describe('pickup flow', () => {
  it('rejects incorrect codes and cross-location orders', async () => {
    const repository = create();
    const data = await load(repository);
    const order = data.orders[0];
    expect(getSandboxPickupCode(order)).toBe('SGP1101');
    await expect(repository.verifyPickup(data.activeStockpoint.id, order.id, 'SGP9999')).rejects.toThrow('Kode');
    await expect(repository.verifyPickup(data.stockpoints[1].id, order.id, 'SGP1101')).rejects.toThrow('Pesanan');
  });
  it('requires identity confirmation and every matching serial before release', async () => {
    const repository = create();
    const data = await load(repository);
    const order = data.orders.find(item => item.status === 'ready' && item.quantity === 2)!;
    const input = await verified(repository, data, order);
    await expect(repository.releasePickup(data.activeStockpoint.id, { ...input, identityConfirmed: false })).rejects.toThrow('identitas');
    await expect(repository.releasePickup(data.activeStockpoint.id, { ...input, serials: order.serials.slice(0, 1) })).rejects.toThrow('Nomor seri');
    await expect(repository.releasePickup(data.activeStockpoint.id, { ...input, serials: [order.serials[0], order.serials[0]] })).rejects.toThrow('Nomor seri');
    expect((await load(repository)).orders.find(item => item.id === order.id)!.status).toBe('ready');
  });
  it('rejects expired challenges and challenges belonging to another order', async () => {
    let currentTime = initialTime;
    const repository = createSandboxRepository({ now: () => currentTime });
    const data = await load(repository);
    const input = await verified(repository, data);
    await expect(repository.releasePickup(data.activeStockpoint.id, { ...input, orderId: data.orders[1].id, serials: data.orders[1].serials })).rejects.toThrow('Verifikasi');
    currentTime += 5 * 60_000;
    await expect(repository.releasePickup(data.activeStockpoint.id, input)).rejects.toThrow('Verifikasi');
  });
  it('updates pickup, inventory, daily totals and audit once, including retries', async () => {
    const repository = create();
    const data = await load(repository);
    const input = await verified(repository, data);
    const released = await repository.releasePickup(data.activeStockpoint.id, input);
    expect(released.status).toBe('done');
    expect(await repository.releasePickup(data.activeStockpoint.id, input)).toEqual(released);
    const updated = await load(repository);
    expect(updated.inventory.filter(unit => released.serials.includes(unit.serial)).every(unit => unit.state === 'released')).toBe(true);
    expect(updated.activities.length).toBe(data.activities.length + 1);
    const product = updated.products.find(item => item.productId === released.productId)!;
    const previousProduct = data.products.find(item => item.productId === released.productId)!;
    expect(product.reserved).toBe(previousProduct.reserved - released.quantity);
    expect(product.releasedToday).toBe(previousProduct.releasedToday + released.quantity);
    await expect(repository.releasePickup(data.activeStockpoint.id, { ...input, identityConfirmed: false })).rejects.toThrow('detail berbeda');
  });
  it('invalidates session challenges on sign-out', async () => {
    const repository = create();
    const data = await load(repository);
    const input = await verified(repository, data);
    await repository.signOut();
    await repository.signIn('', '');
    await expect(repository.releasePickup(data.activeStockpoint.id, input)).rejects.toThrow('Verifikasi');
  });
});

describe('buyback booking', () => {
  async function quoteSetup(repository: Repository) {
    const data = await load(repository);
    const order = data.orders.find(item => item.status === 'done' && !data.buybacks.some(booking => booking.serial === item.serials[0])) as PickupOrder;
    const quote = await repository.quoteBuyback(data.activeStockpoint.id, order.serials[0]);
    return { data, order, quote };
  }
  it('quotes released serials using the recorded customer and rejects unavailable ones', async () => {
    const repository = create();
    const { data, order, quote } = await quoteSetup(repository);
    expect(quote.customerName).toBe(order.customerName);
    expect(quote.amount).toBe(Math.round(order.grams * data.buybackPrice));
    await expect(repository.quoteBuyback(data.activeStockpoint.id, data.orders[0].serials[0])).rejects.toThrow('belum diserahkan');
    await expect(repository.quoteBuyback(data.stockpoints[1].id, quote.serial)).rejects.toThrow('tidak ditemukan');
  });
  it('requires both checks and records only one booking without altering inventory or cash', async () => {
    const repository = create();
    const { data, quote } = await quoteSetup(repository);
    const input = { quoteId: quote.id, identityConfirmed: true, conditionConfirmed: true, notes: 'Kemasan sesuai.', idempotencyKey: 'booking-request-1' };
    await expect(repository.bookBuyback(data.activeStockpoint.id, { ...input, identityConfirmed: false })).rejects.toThrow('identitas');
    await expect(repository.bookBuyback(data.activeStockpoint.id, { ...input, conditionConfirmed: false })).rejects.toThrow('kondisi');
    const booking = await repository.bookBuyback(data.activeStockpoint.id, input);
    expect(await repository.bookBuyback(data.activeStockpoint.id, input)).toEqual(booking);
    const after = await load(repository);
    expect(after.buybacks).toHaveLength(data.buybacks.length + 1);
    expect(after.inventory).toEqual(data.inventory);
    expect(after.reconciliationSnapshot.expectedCash).toBe(0);
    await expect(repository.quoteBuyback(data.activeStockpoint.id, quote.serial)).rejects.toThrow('sudah memiliki');
  });
  it('rejects expired quotations', async () => {
    let currentTime = initialTime;
    const repository = createSandboxRepository({ now: () => currentTime });
    const { data, quote } = await quoteSetup(repository);
    currentTime += 10 * 60_000;
    await expect(repository.bookBuyback(data.activeStockpoint.id, { quoteId: quote.id, identityConfirmed: true, conditionConfirmed: true, notes: '', idempotencyKey: 'expired-booking' })).rejects.toThrow('Penawaran');
  });
});

describe('daily reconciliation and exceptions', () => {
  it('keeps snapshots stable until the stock or Jakarta date changes', async () => {
    const repository = create();
    const data = await load(repository);
    expect((await load(repository)).reconciliationSnapshot.id).toBe(data.reconciliationSnapshot.id);
    const input = await verified(repository, data);
    await repository.releasePickup(data.activeStockpoint.id, input);
    expect((await load(repository)).reconciliationSnapshot.id).not.toBe(data.reconciliationSnapshot.id);
    await expect(repository.submitReconciliation(data.activeStockpoint.id, counts(data))).rejects.toThrow('Snapshot');
  });
  it('requires all SKUs exactly once and nonnegative integer counts', async () => {
    const repository = create();
    const data = await load(repository);
    const input = counts(data);
    await expect(repository.submitReconciliation(data.activeStockpoint.id, { ...input, counted: input.counted.slice(1) })).rejects.toThrow('setiap produk');
    await expect(repository.submitReconciliation(data.activeStockpoint.id, { ...input, counted: [input.counted[0], input.counted[0], ...input.counted.slice(2)] })).rejects.toThrow('setiap produk');
    await expect(repository.submitReconciliation(data.activeStockpoint.id, { ...input, countedCash: -1 })).rejects.toThrow('bilangan bulat');
    await expect(repository.submitReconciliation(data.activeStockpoint.id, { ...input, counted: input.counted.map((row, i) => ({ ...row, counted: i === 0 ? 1.5 : row.counted })) })).rejects.toThrow('bilangan bulat');
  });
  it('submits balanced counts exactly once per day with idempotent retries', async () => {
    const repository = create();
    const data = await load(repository);
    const input = counts(data);
    const result = await repository.submitReconciliation(data.activeStockpoint.id, input);
    expect(result.status).toBe('balanced');
    expect(await repository.submitReconciliation(data.activeStockpoint.id, input)).toEqual(result);
    expect((await load(repository)).reconciliations).toHaveLength(1);
    await expect(repository.submitReconciliation(data.activeStockpoint.id, { ...input, idempotencyKey: 'second-reconciliation' })).rejects.toThrow('sudah diserahkan');
  });
  it('requires a reason for variance and creates an exception and audit entry', async () => {
    const repository = create();
    const data = await load(repository);
    const input = { ...counts(data), countedCash: 50_000 };
    await expect(repository.submitReconciliation(data.activeStockpoint.id, input)).rejects.toThrow('minimal 10');
    const result = await repository.submitReconciliation(data.activeStockpoint.id, { ...input, note: 'Kas fisik berlebih saat pemeriksaan harian.' });
    expect(result.status).toBe('exception');
    const after = await load(repository);
    expect(after.exceptions).toHaveLength(data.exceptions.length + 1);
    expect(after.exceptions[0].category).toBe('cash');
    expect(after.activities).toHaveLength(data.activities.length + 2);
  });
  it('records validated exceptions once and notifies subscribers', async () => {
    const repository = create();
    const data = await load(repository);
    let notifications = 0;
    const unsubscribe = repository.subscribe!(() => { notifications++; });
    const input = { reference: 'SGP-1101', category: 'serial' as const, note: 'Nomor seri pada kemasan perlu diperiksa ulang.', idempotencyKey: 'report-exception-1' };
    await expect(repository.reportException(data.activeStockpoint.id, { ...input, note: 'Pendek' })).rejects.toThrow('10–1.000');
    const result = await repository.reportException(data.activeStockpoint.id, input);
    expect(await repository.reportException(data.activeStockpoint.id, input)).toEqual(result);
    const after = await load(repository);
    expect(after.exceptions).toHaveLength(data.exceptions.length + 1);
    expect(notifications).toBe(1);
    unsubscribe();
  });
  it('counts only today’s released units in Jakarta time', async () => {
    const data = await load(create());
    const stocks = deriveProductStock(data.inventory, initialTime);
    expect(stocks.reduce((sum, product) => sum + product.releasedToday, 0)).toBe(4);
  });
});
