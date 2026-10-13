import type { ExceptionInput, InventoryUnit, ProductStock, ReconciliationInput, ReconciliationSnapshot, ReleaseInput, PickupOrder, BuybackInput } from './types';

export function jakartaDate(time: number | string | Date = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}

export function deriveProductStock(inventory: InventoryUnit[], now = Date.now()): ProductStock[] {
  const products = new Map<string, ProductStock>();
  for (const unit of inventory) {
    const product = products.get(unit.productId) ?? { productId: unit.productId, name: unit.productName, grams: unit.grams, available: 0, reserved: 0, releasedToday: 0 };
    if (unit.state === 'available') product.available++;
    if (unit.state === 'reserved') product.reserved++;
    if (unit.state === 'released' && jakartaDate(unit.updatedAt) === jakartaDate(now)) product.releasedToday++;
    products.set(unit.productId, product);
  }
  return [...products.values()].sort((a, b) => a.grams - b.grams);
}

export function inventoryFingerprint(inventory: InventoryUnit[]): string {
  return JSON.stringify(inventory.map(unit => [unit.serial, unit.productId, unit.state, unit.orderNumber]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function validateRelease(order: PickupOrder, input: ReleaseInput): void {
  requireIdempotencyKey(input.idempotencyKey);
  if (order.id !== input.orderId || order.status !== 'ready') throw new Error('Pesanan tidak tersedia untuk pengambilan.');
  if (!input.identityConfirmed) throw new Error('Cocokkan identitas pelanggan sebelum menyerahkan emas.');
  if (!input.verificationId) throw new Error('Verifikasi kode pengambilan terlebih dahulu.');
  const supplied = input.serials.map(serial => serial.trim().toUpperCase());
  const expected = order.serials.map(serial => serial.toUpperCase());
  if (new Set(supplied).size !== supplied.length || supplied.length !== expected.length || expected.some(serial => !supplied.includes(serial))) {
    throw new Error('Nomor seri harus cocok dengan seluruh batang yang dipesan.');
  }
}

export function validateBuyback(input: BuybackInput): void {
  requireIdempotencyKey(input.idempotencyKey);
  if (!input.identityConfirmed) throw new Error('Konfirmasikan identitas pemilik emas.');
  if (!input.conditionConfirmed) throw new Error('Periksa fisik, nomor seri, dan kondisi emas terlebih dahulu.');
  if (input.notes.trim().length > 1000) throw new Error('Catatan maksimal 1.000 karakter.');
}

export function validateReconciliation(snapshot: ReconciliationSnapshot, input: ReconciliationInput): boolean {
  requireIdempotencyKey(input.idempotencyKey);
  if (snapshot.id !== input.snapshotId) throw new Error('Snapshot tidak sesuai. Muat ulang rekonsiliasi.');
  const ids = input.counted.map(row => row.productId);
  if (new Set(ids).size !== ids.length || ids.length !== snapshot.counts.length || snapshot.counts.some(row => !ids.includes(row.productId))) {
    throw new Error('Isi hitungan untuk setiap produk, masing-masing satu kali.');
  }
  if (input.counted.some(row => !Number.isSafeInteger(row.counted) || row.counted < 0) || !Number.isSafeInteger(input.countedCash) || input.countedCash < 0) {
    throw new Error('Jumlah stok dan kas harus berupa bilangan bulat nol atau lebih.');
  }
  const variance = input.countedCash !== snapshot.expectedCash || snapshot.counts.some(row => input.counted.find(count => count.productId === row.productId)!.counted !== row.expected);
  if (variance && input.note.trim().length < 10) throw new Error('Jelaskan selisih stok atau kas dalam catatan minimal 10 karakter.');
  if (input.note.trim().length > 1000) throw new Error('Catatan maksimal 1.000 karakter.');
  return variance;
}

export function validateException(input: ExceptionInput): void {
  requireIdempotencyKey(input.idempotencyKey);
  if (!['identity', 'serial', 'stock', 'cash', 'other'].includes(input.category)) throw new Error('Pilih kategori kendala yang valid.');
  if (!input.reference.trim() || input.reference.trim().length > 120) throw new Error('Isi referensi kendala, maksimal 120 karakter.');
  if (input.note.trim().length < 10 || input.note.trim().length > 1000) throw new Error('Catatan kendala harus berisi 10–1.000 karakter.');
}

export function requireIdempotencyKey(value: string): void {
  if (!value || value.trim().length < 8 || value.length > 128) throw new Error('Identitas permintaan tidak valid. Muat ulang dan coba lagi.');
}
