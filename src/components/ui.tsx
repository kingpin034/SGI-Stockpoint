import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Search, SlidersHorizontal, Warehouse, ClipboardCheck, LayoutDashboard, MapPin, Menu, CircleCheck, CircleX, ArrowDownLeft, ArrowUpRight, ScanLine, Building2, ArrowLeft, ArrowRight, BadgeCheck, Banknote, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, Copy, Download, Gem, HelpCircle, IdCard, Landmark, Link2, LoaderCircle, LockKeyhole, LogOut, Network, Package, QrCode, ReceiptText, RefreshCw, Send, Settings2, Share2, ShieldCheck, Smartphone, Sparkles, TrendingUp, Upload, UserRound, UsersRound, Wallet, X, Camera, Eye, Image, Info } from 'lucide-react';

const icons = { search: Search, filter: SlidersHorizontal, warehouse: Warehouse, reconcile: ClipboardCheck, overview: LayoutDashboard, pin: MapPin, menu: Menu, success: CircleCheck, failed: CircleX, incoming: ArrowDownLeft, outgoing: ArrowUpRight, scan: ScanLine, building: Building2, arrow: ArrowRight, back: ArrowLeft, check: Check, verified: BadgeCheck, shield: ShieldCheck, calendar: CalendarDays, down: ChevronDown, left: ChevronLeft, right: ChevronRight, copy: Copy, download: Download, gold: Gem, help: HelpCircle, id: IdCard, bank: Landmark, link: Link2, loading: LoaderCircle, lock: LockKeyhole, logout: LogOut, network: Network, package: Package, qr: QrCode, receipt: ReceiptText, refresh: RefreshCw, send: Send, settings: Settings2, share: Share2, phone: Smartphone, sparkles: Sparkles, chart: TrendingUp, upload: Upload, user: UserRound, users: UsersRound, wallet: Wallet, close: X, clock: Clock3, alert: CircleAlert, camera: Camera, eye: Eye, image: Image, info: Info, cash: Banknote, checks: CheckCheck };
export function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) { const Component = icons[name as keyof typeof icons] || CircleAlert; return <Component size={size} strokeWidth={1.7} className={className} aria-hidden="true" />; }
export function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button type="button" className={`button ${className}`} {...props}>{children}</button>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'gold' | 'success' | 'neutral' | 'red' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function EmptyState({ icon = 'receipt', title, description, children }: { icon?: string; title: string; description?: string; children?: ReactNode }) { return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={26} /></span><h3>{title}</h3>{description && <p>{description}</p>}{children}</div>; }
export function Modal({ title, subtitle, onClose, children, footer, wide = false }: { wide?: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(n => n.offsetParent !== null);
      const first = nodes[0]; const last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener('keydown', handle); if (prior?.isConnected) prior.focus(); };
  }, []);
  return <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}><div className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div><div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}</div></div>;
}
