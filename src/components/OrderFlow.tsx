import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Shirt, Trash2, UserRound, X } from 'lucide-react';
import { money, nextOrderId, orderTotal } from '../domain';
import type { Customer, LineItem, Order, Service, Store } from '../types';

interface Props { store: Store; onSave: (order: Order, customer?: Customer) => void; onClose: () => void; }
const services: Service[] = ['Wash & Fold', 'Wash & Iron', 'Dry Cleaning', 'Steam Iron'];
const rates: Record<Service, number> = { 'Wash & Fold': 40, 'Wash & Iron': 60, 'Dry Cleaning': 150, 'Steam Iron': 20 };
const garments = ['Shirt', 'T-shirt', 'Trousers', 'Jeans', 'Kurta', 'Saree', 'Dress', 'Suit', 'Bedsheet', 'Blanket'];
function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function newItem(): LineItem { return { id: crypto.randomUUID(), garment: 'Shirt', service: 'Wash & Iron', quantity: 1, price: 60 }; }

export default function OrderFlow({ store, onSave, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(store.customers.length ? store.customers[0].id : 'new');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [dueDate, setDueDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 2); return localDate(date); });
  const [express, setExpress] = useState(false);
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [error, setError] = useState('');
  const orderId = nextOrderId(store.orders);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const draft: Order = { id: orderId, customerId, items, createdAt: new Date().toISOString(), dueDate, status: 'Received', paid, discount, express, notes: notes.trim(), tagStatuses: {} };
  const total = orderTotal(draft);
  const pieceCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const customer = store.customers.find((entry) => entry.id === customerId);
  function patchItem(id: string, patch: Partial<LineItem>) { setItems((old) => old.map((item) => item.id === id ? { ...item, ...patch } : item)); setError(''); }
  function validate(stage: number): string {
    if (stage === 0) {
      if (customerId === 'new') {
        if (name.trim().length < 2) return 'Please enter the customer’s name (at least 2 characters).';
        if (!/^\+?[\d\s()-]{8,18}$/.test(phone.trim()) || phone.replace(/\D/g, '').length < 10 || phone.replace(/\D/g, '').length > 13) return 'Please enter a valid phone number with 10–13 digits.';
      } else if (!customer) return 'Please select a customer.';
    }
    if (stage === 1) {
      if (!items.length) return 'Add at least one garment.';
      if (pieceCount > 10000) return 'An order can contain up to 10,000 garment tags. Split larger batches into separate orders.';
      if (items.some((item) => !item.garment.trim() || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || !Number.isFinite(item.price) || item.price < 0 || item.price > 100000)) return 'Each garment needs a name, a whole quantity from 1–999, and a valid nonnegative rate.';
      if (!dueDate || dueDate < localDate() || !Number.isFinite(Date.parse(dueDate))) return 'Choose a delivery date of today or later.';
    }
    if (stage === 2) {
      if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) return 'Discount must be between zero and the subtotal.';
      if (!Number.isFinite(paid) || paid < 0 || paid > total) return 'Payment must be between zero and the bill total.';
    }
    return '';
  }
  function proceed() { const issue = validate(step); if (issue) { setError(issue); return; } setError(''); setStep((old) => old + 1); }
  function save() {
    for (let stage = 0; stage <= 2; stage++) { const issue = validate(stage); if (issue) { setStep(stage); setError(issue); return; } }
    const newCustomer: Customer | undefined = customerId === 'new' ? { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim() } : undefined;
    const createdAt = new Date().toISOString();
    try {
      onSave({ ...draft, createdAt, customerId: newCustomer?.id ?? customerId, payments: paid > 0 ? [{ id: crypto.randomUUID(), amount: paid, paidAt: createdAt }] : [] }, newCustomer);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This order could not be saved. Please try again.');
    }
  }
  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
      <div className="modal-header"><div><span className="eyebrow">A LITTLE CARE STARTS HERE</span><h2 id="order-modal-title">Create an order</h2><p className="muted">Bill and garment tags, together in a few taps.</p></div><button className="icon-button" aria-label="Close new order" onClick={onClose}><X size={20}/></button></div>
      <div className="order-steps" aria-label="Order steps">{['Customer', 'Garments', 'Review & bill'].map((label, index) => <div key={label} className={`order-step ${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`}><span>{step > index ? <Check size={14}/> : index + 1}</span>{label}</div>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); if (step < 2) proceed(); else save(); }}>
        <div className="modal-body">
          {step === 0 && <div className="order-step-content">
            <div className="section-label"><UserRound size={18}/><h3>Who are we caring for?</h3></div>
            <label className="field">Customer<select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setError(''); }}>{store.customers.map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · {entry.phone}</option>)}<option value="new">＋ Add a new customer</option></select></label>
            {customerId === 'new' ? <div className="field-row"><label className="field">Full name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ananya Sharma" autoComplete="name" maxLength={100}/></label><label className="field">Phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" placeholder="10-digit mobile number" autoComplete="tel" maxLength={18}/></label></div> : customer && <div className="customer-preview"><div className="customer-avatar">{customer.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</div><div><strong>{customer.name}</strong><p className="muted">{customer.phone}</p>{customer.address && <p className="muted">{customer.address}</p>}</div></div>}
            <p className="form-hint">The customer’s mobile number is used for WhatsApp bill sharing and collection updates.</p>
          </div>}
          {step === 1 && <div className="order-step-content">
            <div className="section-label"><Shirt size={18}/><h3>Garments & care</h3><span className="muted">{pieceCount} pieces</span></div>
            <datalist id="garment-types">{garments.map((garment) => <option value={garment} key={garment}/>)}</datalist>
            <div className="order-items">{items.map((item, index) => <div className="item-row" key={item.id}>
              <div className="item-row-header"><strong>Item {index + 1}</strong><button type="button" className="icon-button" aria-label={`Remove item ${index + 1}`} onClick={() => setItems((old) => old.filter((entry) => entry.id !== item.id))} disabled={items.length === 1}><Trash2 size={16}/></button></div>
              <div className="field-row"><label className="field">Garment<input list="garment-types" value={item.garment} onChange={(event) => patchItem(item.id, { garment: event.target.value })} maxLength={80}/></label><label className="field">Service<select value={item.service} onChange={(event) => { const service = event.target.value as Service; patchItem(item.id, { service, price: rates[service] }); }}>{services.map((service) => <option key={service}>{service}</option>)}</select></label></div>
              <div className="field-row item-amounts"><label className="field">Quantity<input aria-label={`Item ${index + 1} quantity`} type="number" inputMode="numeric" min="1" max="999" step="1" value={item.quantity || ''} onChange={(event) => patchItem(item.id, { quantity: Number(event.target.value) })}/></label><label className="field">Rate per piece (₹)<input aria-label={`Item ${index + 1} rate`} type="number" inputMode="decimal" min="0" max="100000" step="0.01" value={item.price} onChange={(event) => patchItem(item.id, { price: Number(event.target.value) })}/></label><div className="item-line-total"><span className="muted">Amount</span><strong>{money(item.quantity * item.price)}</strong></div></div>
            </div>)}</div>
            <button type="button" className="btn btn-secondary add-garment" onClick={() => setItems((old) => [...old, newItem()])}><Plus size={16}/>Add garment</button>
            <div className="field-row"><label className="field">Collection date<input type="date" min={localDate()} value={dueDate} onChange={(event) => setDueDate(event.target.value)}/></label><label className="express-option"><input type="checkbox" checked={express} onChange={(event) => setExpress(event.target.checked)}/><span><strong>Express order</strong><small className="muted">Prioritise this order · no extra charge</small></span></label></div>
            <label className="field">Care instructions <span className="muted">(optional)</span><textarea placeholder="Stains, delicate fabrics, special requests…" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={1000}/></label>
          </div>}
          {step === 2 && <div className="order-step-content">
            <div className="review-heading"><div><span className="eyebrow">{orderId}</span><h3>{customerId === 'new' ? name.trim() : customer?.name}</h3><p className="muted">Collection · {new Date(`${dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}{express ? ' · Express' : ''}</p></div><span className="status-badge received">{pieceCount} garment tags</span></div>
            <div className="review-items">{items.map((item) => <div className="review-line" key={item.id}><div><strong>{item.quantity} × {item.garment}</strong><p className="muted">{item.service} · {money(item.price)} each</p></div><strong>{money(item.quantity * item.price)}</strong></div>)}</div>
            <div className="field-row"><label className="field">Discount (₹)<input type="number" inputMode="decimal" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))}/></label><label className="field">Payment received (₹)<input type="number" inputMode="decimal" min="0" max={total} step="0.01" value={paid} onChange={(event) => setPaid(Number(event.target.value))}/></label></div>
            <div className="price-summary"><div><span>Subtotal</span><span>{money(subtotal)}</span></div>{discount > 0 && <div><span>Discount</span><span>− {money(discount)}</span></div>}<div className="summary-total"><strong>Bill total</strong><strong>{money(total)}</strong></div><div><span>Paid</span><span>{money(paid)}</span></div><div><strong>Balance due</strong><strong>{money(Math.max(total - paid, 0))}</strong></div></div>
            <p className="form-hint"><Check size={15}/>Saving creates your bill and {pieceCount} individual QR garment tags. You can print or share the bill from the order.</p>
          </div>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => { if (step === 0) onClose(); else { setStep((old) => old - 1); setError(''); } }}>{step > 0 && <ArrowLeft size={16}/>}{step === 0 ? 'Cancel' : 'Back'}</button><span className="order-footer-total">{money(total)} <span className="muted">· {pieceCount} pieces</span></span><button type="submit" className="btn btn-primary">{step === 2 ? <><Check size={17}/>Create order & bill</> : <>Continue<ArrowRight size={17}/></>}</button></div>
      </form>
    </section>
  </div>;
}
