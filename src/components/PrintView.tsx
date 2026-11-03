import { useEffect, useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import QRCode from 'qrcode';
import { balance, getTags, money, orderTotal } from '../domain';
import type { Order, Store } from '../types';

interface Props { store: Store; order: Order; mode: 'bill' | 'tags'; onClose: () => void; }
export default function PrintView({ store, order, mode, onClose }: Props) {
  const customer = store.customers.find((entry) => entry.id === order.customerId);
  const tags = useMemo(() => getTags(order), [order]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (mode !== 'tags') return;
    let active = true;
    Promise.all(tags.map(async (tag) => [tag.id, await QRCode.toDataURL(`laundry-lounge:${tag.id}`, { width: 180, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })] as const)).then((entries) => { if (active) setCodes(Object.fromEntries(entries)); }).catch(() => { if (active) setError('Could not generate QR codes. Close and reopen the print preview to retry.'); });
    return () => { active = false; };
  }, [tags, mode]);
  const canPrint = mode === 'bill' || tags.every((tag) => Boolean(codes[tag.id]));
  return <div className="modal-backdrop print-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal print-modal ${mode === 'tags' ? 'tag-print-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="print-title">
      <div className="modal-header no-print"><div><span className="eyebrow">{order.id}</span><h2 id="print-title">{mode === 'bill' ? 'Bill preview' : 'Garment tags'}</h2><p className="muted">{mode === 'bill' ? 'Print or save as PDF from your device’s print dialog.' : `${tags.length} unique QR tags · one for each garment`}</p></div><button className="icon-button" onClick={onClose} aria-label="Close print preview"><X size={20}/></button></div>
      <div className={`modal-body printable-area ${mode === 'tags' ? 'print-tags' : 'print-bill'}`}>
        {mode === 'bill' ? <article className="receipt">
          <header className="receipt-header">{store.settings.logo && <img className="receipt-logo" src={store.settings.logo} alt={store.settings.businessName}/>}<h2>{store.settings.businessName}</h2><p>Your clothes. Our care.</p>{store.settings.address && <p>{store.settings.address}</p>}{store.settings.phone && <p>Tel: {store.settings.phone}</p>}</header>
          <div className="receipt-meta"><div><span className="muted">BILL NUMBER</span><strong>{order.id}</strong></div><div><span className="muted">ISSUED</span><strong>{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div></div>
          <div className="receipt-customer"><span className="muted">BILLED TO</span><h3>{customer?.name ?? 'Customer'}</h3><p>{customer?.phone}</p><p>Collection: {new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{order.express ? ' · Express' : ''}</p></div>
          <table className="receipt-table"><thead><tr><th>Garment / service</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td><strong>{item.garment}</strong><small>{item.service}</small></td><td>{item.quantity}</td><td>{money(item.price)}</td><td>{money(item.quantity * item.price)}</td></tr>)}</tbody></table>
          <div className="price-summary receipt-totals"><div><span>Subtotal</span><span>{money(order.items.reduce((sum, item) => sum + item.quantity * item.price, 0))}</span></div>{order.discount > 0 && <div><span>Discount</span><span>− {money(order.discount)}</span></div>}<div className="summary-total"><strong>Total</strong><strong>{money(orderTotal(order))}</strong></div><div><span>Payment received</span><span>{money(order.paid)}</span></div><div><strong>Balance due</strong><strong>{money(balance(order))}</strong></div></div>
          {order.notes && <p className="receipt-notes"><strong>Care notes:</strong> {order.notes}</p>}<footer className="receipt-footer"><p>{store.settings.receiptFooter}</p><small>Please bring this bill when collecting your garments.</small></footer>
        </article> : <div className="tag-sheet">{tags.map((tag) => <article className="garment-tag" key={tag.id}><div className="tag-brand">{store.settings.logo && <img src={store.settings.logo} alt="Business logo"/>}{store.settings.businessName}</div><div className="tag-content">{codes[tag.id] ? <img src={codes[tag.id]} alt={`QR code for ${tag.id}`} width="90" height="90"/> : <div className="qr-placeholder" aria-label="Generating QR code">QR</div>}<div><strong>{tag.item.garment}</strong><span>{tag.item.service}</span><span>{customer?.name}</span><span>Due {new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{order.express ? ' · EXPRESS' : ''}</span></div></div><code>{tag.id}</code>{(tag.item.note || order.notes) && <small>{tag.item.note || order.notes}</small>}</article>)}</div>}
      </div>
      <div className="modal-footer no-print">{error ? <p className="form-error" role="alert">{error}</p> : <p className="muted">{mode === 'tags' ? 'Use your printer’s label or paper settings to fit the tags.' : 'No tax is added. Amounts are in INR.'}</p>}<button className="btn btn-primary" disabled={!canPrint} onClick={() => window.print()}><Printer size={17}/>{canPrint ? mode === 'bill' ? 'Print bill' : 'Print tags' : 'Generating tags…'}</button></div>
    </section>
  </div>;
}
