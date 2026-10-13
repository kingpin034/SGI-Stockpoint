import { useMemo, useState } from 'react';
import type { ConsoleData, Reconciliation, Repository } from '../lib/types';
import { formatCurrency, formatDate, formatWeight } from '../lib/format';
import { validateReconciliation } from '../lib/domain';
import { Badge, Button, Icon, Modal } from './ui';

interface Props {
  data: ConsoleData;
  repository: Repository;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
}

export default function ReconciliationPage({ data, repository, onRefresh, onNotify }: Props) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Reconciliation | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Reconciliation['status']>('all');
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const [snapshot, setSnapshot] = useState(data.reconciliationSnapshot);
  const todayReport = data.reconciliations.find(report => report.date === data.reconciliationSnapshot.date);
  const expectedTotal = data.reconciliationSnapshot.counts.reduce((total, row) => total + row.expected, 0);
  const results = useMemo(() => data.reconciliations.filter(row => filter === 'all' || row.status === filter), [data.reconciliations, filter]);
  const productName = (id: string) => {
    const product = data.products.find(item => item.productId === id);
    return product ? `${product.name} · ${formatWeight(product.grams)}` : id;
  };
  const isComplete = snapshot.counts.every(row => (counts[row.productId] ?? '').trim() !== '') && cash.trim() !== '';
  const variance = isComplete && (snapshot.counts.some(row => Number(counts[row.productId]) !== row.expected) || Number(cash) !== snapshot.expectedCash);
  function start() {
    setSnapshot(data.reconciliationSnapshot); setCounts(Object.fromEntries(data.reconciliationSnapshot.counts.map(row => [row.productId, ''])));
    setCash(''); setNote(''); setError(''); setAttempt(crypto.randomUUID()); setOpen(true);
  }
  function close() { if (!busy) setOpen(false); }
  async function submit() {
    if (busy) return;
    setError('');
    if (!isComplete) { setError('Isi jumlah fisik untuk setiap produk dan jumlah kas yang dihitung.'); return; }
    const input = { snapshotId: snapshot.id, counted: snapshot.counts.map(row => ({ productId: row.productId, counted: Number(counts[row.productId]) })), countedCash: Number(cash), note: note.trim(), idempotencyKey: attempt };
    try { validateReconciliation(snapshot, input); }
    catch (err) { setError(err instanceof Error ? err.message : 'Periksa kembali isian rekonsiliasi.'); return; }
    setBusy(true);
    let saved = false;
    try {
      const result = await repository.submitReconciliation(data.activeStockpoint.id, input);
      saved = true; setOpen(false); setDetail(result);
      await onRefresh();
      onNotify(result.status === 'balanced' ? 'Rekonsiliasi demo tersimpan. Stok dan kas sesuai catatan.' : 'Rekonsiliasi demo tersimpan dengan catatan selisih.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rekonsiliasi belum dapat disimpan.';
      if (saved) onNotify(`Laporan sudah tersimpan. Muat ulang data: ${message}`); else setError(message);
    } finally { setBusy(false); }
  }

  return <div className="operations-page">
    <div className="page-toolbar"><p>Cocokkan catatan stockpoint dengan hasil hitungan fisik.</p><Button onClick={todayReport ? () => setDetail(todayReport) : start}><Icon name="reconcile" size={18} />{todayReport ? 'Lihat laporan hari ini' : 'Mulai rekonsiliasi'}</Button></div>
    <div className="recon-summary">
      <div className="panel recon-stat"><span className="icon-tile"><Icon name="package" /></span><div><span className="label">Stok dalam catatan</span><strong>{expectedTotal}<small> batang</small></strong><p>Tersedia + dipesan, belum diserahkan</p></div></div>
      <div className="panel recon-stat"><span className="icon-tile"><Icon name="cash" /></span><div><span className="label">Kas yang diharapkan</span><strong>{formatCurrency(data.reconciliationSnapshot.expectedCash)}</strong><p>Pembelian melalui pembayaran digital terpusat</p></div></div>
      <div className="panel recon-stat"><span className="icon-tile"><Icon name="calendar" /></span><div><span className="label">Tanggal pemeriksaan</span><strong>{formatDate(`${data.reconciliationSnapshot.date}T12:00:00+07:00`)}</strong><p>{data.activeStockpoint.name}</p></div></div>
    </div>
    <div className="inline-note recon-notice"><Icon name="info" size={18} /><p>Demo menggunakan data contoh. Laporan dan catatan selisih hanya berubah di browser ini; tidak ada pengiriman ke finance.</p></div>
    <section className="panel operations-list" aria-label="Riwayat rekonsiliasi"><div className="list-toolbar"><h2>Riwayat rekonsiliasi</h2><div className="segmented" aria-label="Filter hasil rekonsiliasi">{(['all', 'balanced', 'exception'] as const).map(value => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'Semua' : value === 'balanced' ? 'Sesuai' : 'Ada selisih'}</button>)}</div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Tanggal laporan</th><th>Petugas</th><th>Stok dihitung</th><th>Kas dihitung</th><th>Hasil</th><th><span className="sr-only">Detail</span></th></tr></thead><tbody>{results.map(row => <tr key={row.id}><td><strong>{formatDate(`${row.date}T12:00:00+07:00`)}</strong><small>{formatDate(row.submittedAt, { hour: '2-digit', minute: '2-digit' })} WIB</small></td><td>{row.submittedBy}</td><td>{row.counts.reduce((total, item) => total + item.counted, 0)} batang</td><td className="currency-cell">{formatCurrency(row.countedCash)}</td><td><Badge tone={row.status === 'balanced' ? 'success' : 'red'}>{row.status === 'balanced' ? 'Sesuai' : 'Ada selisih'}</Badge></td><td><Button className="button-secondary button-small" onClick={() => setDetail(row)} aria-label={`Lihat rekonsiliasi ${formatDate(`${row.date}T12:00:00+07:00`)}`}>Detail<Icon name="arrow" size={15} /></Button></td></tr>)}</tbody></table></div>
      {results.length === 0 && <div className="empty-state"><Icon name="reconcile" size={30} /><h3>{filter === 'all' ? 'Belum ada laporan' : 'Tidak ada laporan dengan hasil ini'}</h3><p>{filter === 'all' ? 'Mulai rekonsiliasi untuk mencatat hitungan stok dan kas.' : 'Pilih filter lain untuk melihat riwayat.'}</p></div>}
      <div className="list-footer">{results.length} laporan ditampilkan</div>
    </section>
    {open && <Modal wide title="Rekonsiliasi harian" subtitle={`${data.activeStockpoint.name} · ${formatDate(`${snapshot.date}T12:00:00+07:00`)}`} onClose={close} footer={<><Button className="button-secondary" disabled={busy} onClick={close}>Batal</Button><Button disabled={busy} onClick={submit}><Icon name={busy ? 'loading' : 'check'} size={18} />Simpan laporan</Button></>}><div className="form-stack">
      <div className="recon-form-heading"><div><h3>Hitung stok fisik</h3><p className="muted">Sertakan emas tersedia dan yang sudah dipesan.</p></div><Button className="button-secondary button-small" disabled={busy} onClick={() => { setCounts(Object.fromEntries(snapshot.counts.map(row => [row.productId, String(row.expected)]))); setCash(String(snapshot.expectedCash)); }}>Isi hitungan sesuai catatan</Button></div>
      <div className="table-wrap"><table className="data-table count-table"><thead><tr><th>Produk</th><th>Catatan</th><th>Hitungan fisik</th><th>Selisih</th></tr></thead><tbody>{snapshot.counts.map(row => {
        const raw = counts[row.productId] ?? ''; const delta = raw.trim() === '' ? null : Number(raw) - row.expected;
        return <tr key={row.productId}><td><strong>{productName(row.productId)}</strong></td><td>{row.expected}</td><td><input aria-label={`Hitungan fisik ${productName(row.productId)}`} type="number" inputMode="numeric" min="0" step="1" value={raw} disabled={busy} placeholder="0" onChange={event => setCounts(current => ({ ...current, [row.productId]: event.target.value }))} /></td><td className={delta === null || delta === 0 ? '' : 'variance-value'}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}</td></tr>;
      })}</tbody></table></div>
      <div className="cash-count"><div><h3>Hitung kas fisik</h3><p className="muted">Kas yang diharapkan <strong>{formatCurrency(snapshot.expectedCash)}</strong>. Pembayaran emas diterima secara digital terpusat.</p></div><label className="form-field">Kas dihitung (Rp)<input type="number" inputMode="numeric" min="0" step="1" value={cash} onChange={event => setCash(event.target.value)} disabled={busy} placeholder="0" /></label></div>
      {isComplete && <div className={`inline-note ${variance ? 'note-warning' : 'note-success'}`}><Icon name={variance ? 'alert' : 'check'} size={18} /><p>{variance ? 'Ada selisih pada stok atau kas. Jelaskan penyebab atau hasil pemeriksaan di catatan.' : 'Hitungan stok dan kas sesuai catatan.'}</p></div>}
      <label className="form-field">Catatan pemeriksaan {variance ? '(wajib, minimal 10 karakter)' : '(opsional)'}<textarea value={note} onChange={event => setNote(event.target.value)} disabled={busy} rows={3} maxLength={1000} placeholder="Tuliskan hasil pemeriksaan atau penjelasan selisih" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
    </div></Modal>}
    {detail && <Modal wide title="Detail rekonsiliasi" subtitle={formatDate(`${detail.date}T12:00:00+07:00`)} onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Tutup</Button>}><div className="form-stack"><div className="recon-detail-heading"><div><span className="label">Dicatat oleh</span><strong>{detail.submittedBy}</strong></div><Badge tone={detail.status === 'balanced' ? 'success' : 'red'}>{detail.status === 'balanced' ? 'Sesuai' : 'Ada selisih'}</Badge></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Produk</th><th>Catatan</th><th>Hitungan</th><th>Selisih</th></tr></thead><tbody>{detail.counts.map(row => <tr key={row.productId}><td>{productName(row.productId)}</td><td>{row.expected}</td><td>{row.counted}</td><td className={row.counted !== row.expected ? 'variance-value' : ''}>{row.counted > row.expected ? '+' : ''}{row.counted - row.expected}</td></tr>)}</tbody></table></div><dl className="detail-rows"><div><dt>Kas yang diharapkan</dt><dd>{formatCurrency(detail.expectedCash)}</dd></div><div><dt>Kas dihitung</dt><dd>{formatCurrency(detail.countedCash)}</dd></div><div><dt>Selisih kas</dt><dd className={detail.countedCash !== detail.expectedCash ? 'variance-value' : ''}>{formatCurrency(detail.countedCash - detail.expectedCash)}</dd></div><div><dt>Dicatat pada</dt><dd>{formatDate(detail.submittedAt, { hour: '2-digit', minute: '2-digit' })} WIB</dd></div><div><dt>Catatan</dt><dd>{detail.note || 'Tidak ada catatan tambahan.'}</dd></div></dl></div></Modal>}
  </div>;
}
