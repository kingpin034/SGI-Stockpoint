export type Page = 'overview' | 'pickups' | 'inventory' | 'buyback' | 'reconciliation';
export type OrderStatus = 'ready' | 'done';
export interface Staff { id: string; name: string; email: string; role: 'staff' | 'supervisor'; }
export interface Stockpoint { id: string; name: string; city: string; address: string; }
export interface PickupOrder { id: string; number: string; customerName: string; phoneLast4: string; productName: string; productId: string; grams: number; quantity: number; total: number; paymentMethod: 'qris' | 'va'; paidAt: string; status: OrderStatus; serials: string[]; releasedAt?: string; }
export interface InventoryUnit { serial: string; productId: string; productName: string; grams: number; state: 'available' | 'reserved' | 'released'; orderNumber: string | null; updatedAt: string; }
export interface ProductStock { productId: string; name: string; grams: number; available: number; reserved: number; releasedToday: number; }
export interface Activity { id: string; type: 'pickup' | 'buyback' | 'reconciliation' | 'exception'; title: string; description: string; actor: string; createdAt: string; }
export interface Buyback { id: string; number: string; customerName: string; serial: string; grams: number; amount: number; status: 'booked' | 'submitted'; createdAt: string; notes: string; }
export interface BuybackQuote { id: string; serial: string; customerName: string; productName: string; grams: number; rate: number; amount: number; expiresAt: string; }
export interface ExceptionRecord { id: string; reference: string; category: 'identity' | 'serial' | 'stock' | 'cash' | 'other'; note: string; status: 'open' | 'resolved'; createdAt: string; }
export interface Reconciliation { id: string; date: string; counts: { productId: string; expected: number; counted: number }[]; expectedCash: number; countedCash: number; note: string; status: 'balanced' | 'exception'; submittedAt: string; submittedBy: string; }
export interface ReconciliationSnapshot { id: string; date: string; counts: { productId: string; expected: number }[]; expectedCash: number; }
export interface ConsoleData { staff: Staff; stockpoints: Stockpoint[]; activeStockpoint: Stockpoint; orders: PickupOrder[]; inventory: InventoryUnit[]; products: ProductStock[]; activities: Activity[]; buybacks: Buyback[]; exceptions: ExceptionRecord[]; reconciliations: Reconciliation[]; reconciliationSnapshot: ReconciliationSnapshot; buybackPrice: number; priceUpdatedAt: string; priceSource: 'sample' | 'live'; }
export interface PickupVerification { id: string; orderId: string; expiresAt: string; }
export interface ReleaseInput { orderId: string; verificationId: string; serials: string[]; identityConfirmed: boolean; idempotencyKey: string; }
export interface BuybackInput { quoteId: string; identityConfirmed: boolean; conditionConfirmed: boolean; notes: string; idempotencyKey: string; }
export interface ReconciliationInput { snapshotId: string; counted: { productId: string; counted: number }[]; countedCash: number; note: string; idempotencyKey: string; }
export interface ExceptionInput { reference: string; category: ExceptionRecord['category']; note: string; idempotencyKey: string; }
export interface Repository {
 readonly mode: 'sandbox';
 load(stockpointId?: string): Promise<ConsoleData | null>;
 signIn(email: string, password: string): Promise<void>;
 signOut(): Promise<void>;
 verifyPickup(stockpointId: string, orderId: string, code: string): Promise<PickupVerification>;
 releasePickup(stockpointId: string, input: ReleaseInput): Promise<PickupOrder>;
 quoteBuyback(stockpointId: string, serial: string): Promise<BuybackQuote>;
 bookBuyback(stockpointId: string, input: BuybackInput): Promise<Buyback>;
 submitReconciliation(stockpointId: string, input: ReconciliationInput): Promise<Reconciliation>;
 reportException(stockpointId: string, input: ExceptionInput): Promise<ExceptionRecord>;
 subscribe?(callback: () => void): () => void;
}
