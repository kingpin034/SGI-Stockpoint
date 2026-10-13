import { useEffect, useMemo, useState } from 'react';
import type { Buyback, BuybackQuote, ConsoleData, Repository } from '../lib/types';
import { formatCurrency, formatDate, formatWeight } from '../lib/format';
import { Badge, Button, Icon, Modal } from './ui';

interface Props {
  data: ConsoleData;
  repository: Repository;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
}

const statusLabel = (status: Buyback['status']) => status === 'submitted' ? 'Siap ditinjau' : 'Booking tercatat';

export default function BuybackPage({ data, repository, onRefresh, onNotify }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Buyback['status']>('all');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [detail, setDetail] = useState<Buyback | null>(null);
  const [serial, setSerial] = useState('');
  const [quote, setQuote] = useState<BuybackQuote | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [conditionConfirmed, setConditionConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quote]);
  const expired = quote ? now >= new Date(quote.expiresAt).getTime() : false;
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return data.buybacks.filter(item => (filter === 'all' || item.status === filter)
      && `${item.number} ${item.customerName} ${item.serial}`.toLocaleLowerCase().includes(term));
  }, [data.buybacks, search, filter]);
  const sample = data.inventory.find(unit => unit.state === 'released' && !data.buybacks.some(booking => booking.serial === unit.serial));

  function startBooking() {
    setSerial(''); setQuote(null); setIdentityConfirmed(false); setConditionConfirmed(false);
    setNotes(''); setError(''); setAttempt(crypto.randomUUID()); setBookingOpen(true);
  }
  function closeBooking() { if (!busy) setBookingOpen(false); }
  async function requestQuote() {
    if (!serial.trim()) { setError('Masukkan nomor seri emas yang dibawa pelanggan.'); return; }
    setBusy(true); setError('');
    try {
      const result = await repository.quoteBuyback(data.activeStockpoint.id, serial.trim());
      setQuote(result); setNow(Date.now()); setAttempt(crypto.randomUUID());
    } catch (err) { setError(err instanceof Error ? err.message : 'Estimasi buyback belum dapat diperoleh.'); }
    finally { setBusy(false); }
  }
  async function book() {
    if (!quote || expired || !identityConfirmed || !conditionConfirmed) return;
    setBusy(true); setError('');
    let saved = false;
    try {
      const booking = await repository.bookBuyback(data.activeStockpoint.id, {
        quoteId: quote.id, identityConfirmed, conditionConfirmed, notes: notes.trim(), idempotencyKey: attempt,
      });
      saved = true; setBookingOpen(false); setQuote(null); setDetail(booking);
      await onRefresh();
      onNotify('Booking demo berhasil dicatat. Tidak ada pembayaran yang diproses.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Booking buyback belum dapat diproses.';
      if (saved) onNotify(`Booking sudah tersimpan. Muat ulang data: ${message}`);
      else setError(message);
    } finally { setBusy(false); }
  }

  return <div className="operations-page">
    <div className="page-toolbar">
      <p>Catat pengajuan pembelian kembali dan pemeriksaan emas pelanggan.</p>
      <Button onClick={startBooking}><Icon name="gold" size={18} />Booking baru</Button>
    </div>
    <div className="buyback-overview panel">
      <div className="buyback-rate"><span className="icon-tile"><Icon name="gold" /></span><div><span className="label">Harga buyback per gram</span><strong>{formatCurrency(data.buybackPrice)}</strong><span className="muted">Diperbarui {formatDate(data.priceUpdatedAt, { hour: '2-digit', minute: '2-digit' })}</span></div></div>
      <div className="buyback-note"><Badge tone="gold">Harga demo</Badge><p>Simulasikan estimasi dan booking buyback dengan data contoh. Tidak ada pembayaran yang diproses.</p></div>
    </div>
    <section className="panel operations-list" aria-label="Daftar booking buyback">
      <div className="list-toolbar"><div className="segmented" aria-label="Filter status buyback">
        {(['all', 'booked', 'submitted'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'Semua' : value === 'booked' ? 'Tercatat' : 'Siap ditinjau'}</button>)}
      </div><label className="search-field"><Icon name="search" size={18} /><span className="sr-only">Cari booking buyback</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama, booking, atau seri…" /></label></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Booking / pelanggan</th><th>Nomor seri</th><th>Berat</th><th>Estimasi buyback</th><th>Status</th><th><span className="sr-only">Detail</span></th></tr></thead><tbody>
        {results.map(item => <tr key={item.id}><td><strong>{item.number}</strong><span>{item.customerName}</span><small>{formatDate(item.createdAt)}</small></td><td><code>{item.serial}</code></td><td>{formatWeight(item.grams)}</td><td className="currency-cell">{formatCurrency(item.amount)}</td><td><Badge tone={item.status === 'submitted' ? 'success' : 'gold'}>{statusLabel(item.status)}</Badge></td><td><Button className="button-secondary button-small" onClick={() => setDetail(item)} aria-label={`Lihat booking ${item.number}`}>Detail<Icon name="arrow" size={15} /></Button></td></tr>)}
      </tbody></table></div>
      {results.length === 0 && <div className="empty-state"><Icon name="receipt" size={30} /><h3>{search || filter !== 'all' ? 'Booking tidak ditemukan' : 'Belum ada booking buyback'}</h3><p>{search || filter !== 'all' ? 'Sesuaikan kata pencarian atau filter status.' : 'Buat booking setelah memeriksa emas dan identitas pelanggan.'}</p></div>}
      <div className="list-footer">{results.length} booking ditampilkan</div>
    </section>
    {bookingOpen && <Modal title="Booking buyback baru" subtitle={quote ? '2 dari 2 · Periksa dan konfirmasi' : '1 dari 2 · Cek nomor seri'} onClose={closeBooking} footer={<><Button className="button-secondary" disabled={busy} onClick={quote ? () => { setQuote(null); setError(''); setIdentityConfirmed(false); setConditionConfirmed(false); } : closeBooking}>{quote ? 'Kembali' : 'Batal'}</Button><Button disabled={busy || (quote !== null && (expired || !identityConfirmed || !conditionConfirmed))} onClick={quote ? book : requestQuote}>{busy && <Icon name="loading" size={17} />}{quote ? 'Simpan booking' : 'Cek estimasi'}<Icon name="arrow" size={17} /></Button></>}>
      {!quote ? <div className="form-stack"><div className="inline-note"><Icon name="info" size={18} /><p>Gunakan nomor seri emas yang sudah diserahkan kepada pelanggan. Data pemilik dan estimasi harga ditarik dari catatan transaksi.</p></div><label className="form-field">Nomor seri emas<input autoFocus value={serial} onChange={event => setSerial(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !busy) { event.preventDefault(); void requestQuote(); } }} maxLength={100} autoComplete="off" placeholder="Masukkan nomor seri" /></label>{sample && <div className="sandbox-help"><span>Seri contoh untuk mencoba alur:</span><button type="button" className="text-button" onClick={() => setSerial(sample.serial)}>{sample.serial}<Icon name="copy" size={14} /></button></div>}</div> : <div className="form-stack">
        <div className="quote-total"><span>Estimasi buyback</span><strong>{formatCurrency(quote.amount)}</strong><small>{formatWeight(quote.grams)} × {formatCurrency(quote.rate)} / gram</small></div>
        <dl className="detail-rows"><div><dt>Pelanggan</dt><dd>{quote.customerName}</dd></div><div><dt>Produk</dt><dd>{quote.productName}</dd></div><div><dt>Nomor seri</dt><dd><code>{quote.serial}</code></dd></div><div><dt>Stock point</dt><dd>{data.activeStockpoint.name}</dd></div><div><dt>Estimasi berlaku hingga</dt><dd>{formatDate(quote.expiresAt, { hour: '2-digit', minute: '2-digit' })} WIB</dd></div></dl>
        {expired && <div className="form-error" role="alert">Estimasi kedaluwarsa. Kembali untuk mendapatkan estimasi terbaru.</div>}
        <label className="check-field"><input type="checkbox" checked={identityConfirmed} onChange={event => setIdentityConfirmed(event.target.checked)} disabled={busy} /><span>Identitas pelanggan sesuai dengan pemilik yang tercatat.</span></label>
        <label className="check-field"><input type="checkbox" checked={conditionConfirmed} onChange={event => setConditionConfirmed(event.target.checked)} disabled={busy} /><span>Nomor seri, kondisi fisik, dan kemasan emas telah diperiksa.</span></label>
        <label className="form-field">Catatan pemeriksaan <span className="muted">(opsional)</span><textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="Kondisi kemasan atau catatan untuk SGI Finance" /></label>
        <div className="inline-note"><Icon name="shield" size={18} /><p>Booking demo ini mencatat pengajuan dan hasil pemeriksaan. Emas tidak ditambahkan ke stok dan tidak ada dana yang dikirim.</p></div>
      </div>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </Modal>}
    {detail && <Modal title={detail.number} subtitle="Detail booking buyback" onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Tutup</Button>}><div className="form-stack"><div className="quote-total"><Badge tone={detail.status === 'submitted' ? 'success' : 'gold'}>{statusLabel(detail.status)}</Badge><strong>{formatCurrency(detail.amount)}</strong><small>Estimasi buyback · {formatWeight(detail.grams)}</small></div><dl className="detail-rows"><div><dt>Pelanggan</dt><dd>{detail.customerName}</dd></div><div><dt>Nomor seri</dt><dd><code>{detail.serial}</code></dd></div><div><dt>Dicatat pada</dt><dd>{formatDate(detail.createdAt, { hour: '2-digit', minute: '2-digit' })}</dd></div><div><dt>Catatan pemeriksaan</dt><dd>{detail.notes || 'Tidak ada catatan tambahan.'}</dd></div></dl><div className="inline-note"><Icon name="info" size={18} /><p>Catatan demo ini tersimpan selama sesi browser. Status booking tidak berarti pembayaran kepada pelanggan selesai.</p></div></div></Modal>}
  </div>;
}
