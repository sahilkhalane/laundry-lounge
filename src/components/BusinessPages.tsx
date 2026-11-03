import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, CreditCard, FileSpreadsheet, ImagePlus, IndianRupee, Mail, MapPin, Pencil, Plus, Search, Settings2, Smartphone, TrendingUp, Users, Wallet, X } from 'lucide-react';
import type { Customer, Expense, Settings, Store } from '../types';
import { balance, initials, money, orderTotal, sumPaymentsInRange, validateStore } from '../domain';

type Props = { store: Store; onChange: (store: Store) => void };
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const expenseDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDate(new Date(value));
const failureMessage = (error: unknown) => error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.';
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">LAUNDRY LOUNGE</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</section></div>;
}
function Stat({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><span className="muted">{note}</span></div>;
}

export function CustomersPage({ store, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const filtered = store.customers.filter(customer => `${customer.name} ${customer.phone} ${customer.email ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const totalOutstanding = store.orders.reduce((sum, order) => sum + balance(order), 0);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const customer: Customer = { id: editing?.id ?? crypto.randomUUID(), name: String(data.get('name') ?? '').trim(), phone: String(data.get('phone') ?? '').trim(), email: String(data.get('email') ?? '').trim(), address: String(data.get('address') ?? '').trim() };
    if (customer.name.length < 2) return setError('Enter a customer name with at least two characters.');
    if (!/^\+?[\d\s()-]{7,20}$/.test(customer.phone) || customer.phone.replace(/\D/g, '').length < 7 || customer.phone.replace(/\D/g, '').length > 15) return setError('Enter a valid phone number, including the country code when needed.');
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return setError('Enter a valid email address.');
    const normalized = customer.phone.replace(/\D/g, '');
    if (store.customers.some(c => c.id !== customer.id && c.phone.replace(/\D/g, '') === normalized)) return setError('A customer with this phone number already exists.');
    try {
      onChange({ ...store, customers: editing ? store.customers.map(c => c.id === customer.id ? customer : c) : [...store.customers, customer] });
      setIsAdding(false); setEditing(null); setError('');
    } catch (saveError) { setError(failureMessage(saveError)); }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">YOUR COMMUNITY</div><h1>Customers</h1><p className="muted">A little care for every familiar face.</p></div><button className="btn btn-primary" onClick={() => { setIsAdding(true); setError(''); }}><Plus size={18} />Add customer</button></div>
    <div className="stat-grid"><Stat label="Total customers" value={String(store.customers.length)} note="All your customers, in one place" icon={<Users size={20} />} /><Stat label="Returning customers" value={String(store.customers.filter(c => store.orders.filter(o => o.customerId === c.id).length > 1).length)} note="Customers with more than one order" icon={<TrendingUp size={20} />} /><Stat label="Outstanding balance" value={money(totalOutstanding)} note="Across all customer accounts" icon={<Wallet size={20} />} /></div>
    <section className="panel"><div className="panel-header"><h2>Customer directory <span className="count-badge">{store.customers.length}</span></h2><label className="search-field"><Search size={17} /><input aria-label="Search customers" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Outstanding</th><th /></tr></thead><tbody>{filtered.map(customer => {
        const orders = store.orders.filter(o => o.customerId === customer.id); const due = orders.reduce((sum, order) => sum + balance(order), 0);
        return <tr key={customer.id}><td><div className="customer-cell"><span className="avatar">{initials(customer.name)}</span><div><strong>{customer.name}</strong><small className="muted">{customer.email || 'Laundry Lounge customer'}</small></div></div></td><td>{customer.phone}</td><td>{orders.length} orders</td><td><strong style={{ color: due > 0 ? '#b66b1b' : '#008b7b' }}>{money(due)}</strong></td><td><button className="icon-button" aria-label={`Edit ${customer.name}`} onClick={() => { setEditing(customer); setError(''); }}><Pencil size={17} /></button></td></tr>;
      })}</tbody></table></div>{filtered.length === 0 && <div className="empty-state"><Users size={32} /><h3>{search ? 'No customers found' : 'Your first familiar face'}</h3><p className="muted">{search ? 'Try a different name or phone number.' : 'Add a customer to create their first order.'}</p></div>}
    </section>
    {(editing || isAdding) && <Modal title={editing ? 'Edit customer' : 'Add a customer'} onClose={() => { setIsAdding(false); setEditing(null); }}><form onSubmit={save}><div className="modal-body"><label className="field">Full name<input name="name" placeholder="e.g. Priya Sharma" defaultValue={editing?.name} required autoFocus minLength={2} /></label><label className="field">Phone number<input name="phone" type="tel" placeholder="e.g. +91 98765 43210" defaultValue={editing?.phone} required /></label><label className="field">Email <span className="muted">(optional)</span><input name="email" type="email" placeholder="customer@example.com" defaultValue={editing?.email} /></label><label className="field">Address <span className="muted">(optional)</span><textarea name="address" placeholder="Pickup or delivery address" defaultValue={editing?.address} rows={3} /></label>{error && <p className="form-error" role="alert">{error}</p>}</div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => { setIsAdding(false); setEditing(null); }}>Cancel</button><button type="submit" className="btn btn-primary">Save customer</button></div></form></Modal>}
  </>;
}

const categories = ['Supplies', 'Utilities', 'Rent', 'Salaries', 'Maintenance', 'Transport', 'Other'];
export function ExpensesPage({ store, onChange }: Props) {
  const [adding, setAdding] = useState(false); const [search, setSearch] = useState(''); const [category, setCategory] = useState('All categories'); const [error, setError] = useState('');
  const month = localDate().slice(0, 7);
  const expenseCategories = [...new Set([...categories, ...store.expenses.map(expense => expense.category)])];
  const expenses = store.expenses.filter(e => (category === 'All categories' || e.category === category) && `${e.title} ${e.category}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const monthExpenses = store.expenses.filter(e => expenseDay(e.date).startsWith(month));
  const monthlyTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totals = expenseCategories.map(categoryName => ({ name: categoryName, total: monthExpenses.filter(e => e.category === categoryName).reduce((sum, e) => sum + e.amount, 0) })).sort((a, b) => b.total - a.total);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const amount = Number(data.get('amount')); const title = String(data.get('title') ?? '').trim(); const date = String(data.get('date'));
    if (!title || !Number.isFinite(amount) || amount <= 0 || amount > 10000000 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter a title, valid date, and an amount greater than zero.');
    const expense: Expense = { id: crypto.randomUUID(), title, amount: Math.round(amount * 100) / 100, date, category: String(data.get('category')) };
    try { onChange({ ...store, expenses: [expense, ...store.expenses] }); setAdding(false); setError(''); }
    catch (saveError) { setError(failureMessage(saveError)); }
  }
  return <><div className="page-heading"><div><div className="eyebrow">KEEP THINGS BALANCED</div><h1>Expenses</h1><p className="muted">Small details. A clearer picture of your business.</p></div><button className="btn btn-primary" onClick={() => { setAdding(true); setError(''); }}><Plus size={18} />Add expense</button></div>
    <div className="stat-grid"><Stat label="This month" value={money(monthlyTotal)} note={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} icon={<Wallet size={20} />} /><Stat label="Transactions" value={String(monthExpenses.length)} note="Expenses recorded this month" icon={<CreditCard size={20} />} /><Stat label="Largest category" value={totals[0]?.total ? totals[0].name : '—'} note={totals[0]?.total ? `${money(totals[0].total)} this month` : 'No expenses recorded yet'} icon={<IndianRupee size={20} />} /></div>
    <section className="panel"><div className="panel-header"><h2>Expense history</h2><div className="table-tools"><label className="search-field"><Search size={17} /><input aria-label="Search expenses" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses…" /></label><select aria-label="Filter expense category" value={category} onChange={e => setCategory(e.target.value)}><option>All categories</option>{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{expenses.map(expense => <tr key={expense.id}><td><div className="customer-cell"><span className="avatar"><Wallet size={18} /></span><strong>{expense.title}</strong></div></td><td><span className="badge badge-neutral">{expense.category}</span></td><td>{new Date(`${expenseDay(expense.date)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td style={{ textAlign: 'right', fontWeight: 650 }}>{money(expense.amount)}</td></tr>)}</tbody></table></div>{expenses.length === 0 && <div className="empty-state"><Wallet size={32} /><h3>No expenses here yet</h3><p className="muted">Add an expense or try another filter.</p></div>}<div className="panel-footer"><span className="muted">{expenses.length} expenses shown</span><strong>Total {money(expenses.reduce((sum, e) => sum + e.amount, 0))}</strong></div></section>
    {adding && <Modal title="Record an expense" onClose={() => setAdding(false)}><form onSubmit={save}><div className="modal-body"><label className="field">Description<input name="title" placeholder="e.g. Laundry detergent" required autoFocus /></label><div className="field-row"><label className="field">Amount (₹)<input name="amount" type="number" min="0.01" max="10000000" step="0.01" placeholder="0.00" required /></label><label className="field">Date<input name="date" type="date" defaultValue={localDate()} required /></label></div><label className="field">Category<select name="category">{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}</div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save expense</button></div></form></Modal>}
  </>;
}

export function ReportsPage({ store }: Props) {
  const [from, setFrom] = useState(`${localDate().slice(0, 7)}-01`); const [to, setTo] = useState(localDate());
  const validRange = Boolean(from && to && from <= to);
  const orders = validRange ? store.orders.filter(o => { const day = localDate(new Date(o.createdAt)); return day >= from && day <= to; }) : [];
  const expenses = validRange ? store.expenses.filter(e => { const day = expenseDay(e.date); return day >= from && day <= to; }) : [];
  const collected = validRange ? sumPaymentsInRange(store.orders, from, to) : 0; const billed = orders.reduce((sum, o) => sum + orderTotal(o), 0); const spent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const serviceTotals = ['Wash & Fold', 'Wash & Iron', 'Dry Cleaning', 'Steam Iron'].map(service => ({ name: service, amount: orders.reduce((sum, o) => sum + o.items.filter(i => i.service === service).reduce((s, i) => s + i.price * i.quantity, 0), 0), count: orders.reduce((sum, o) => sum + o.items.filter(i => i.service === service).reduce((s, i) => s + i.quantity, 0), 0) }));
  const expenseTotals = [...new Set([...categories, ...expenses.map(expense => expense.category)])].map(category => ({ name: category, amount: expenses.filter(e => e.category === category).reduce((sum, e) => sum + e.amount, 0) })).filter(e => e.amount > 0).sort((a, b) => b.amount - a.amount);
  function exportCsv() {
    const escape = (value: unknown) => { const text = String(value ?? ''); const safe = /^[=+@\-\t\r]/.test(text.trimStart()) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; };
    const rows = [['Order', 'Customer', 'Created', 'Due', 'Status', 'Garments', 'Billed INR', 'Total collected INR', 'Current outstanding INR'], ...orders.map(order => [order.id, store.customers.find(c => c.id === order.customerId)?.name ?? 'Unknown', localDate(new Date(order.createdAt)), order.dueDate, order.status, order.items.reduce((s, i) => s + i.quantity, 0), orderTotal(order), order.paid, balance(order)])];
    download(`laundry-lounge-orders-${from}-to-${to}.csv`, '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  return <><div className="page-heading"><div><div className="eyebrow">THE BIGGER PICTURE</div><h1>Reports</h1><p className="muted">A clearer view of how your lounge is doing.</p></div><button className="btn btn-secondary" disabled={!validRange || orders.length === 0} onClick={exportCsv}><FileSpreadsheet size={17} />Export orders</button></div><section className="panel report-filter"><div><h3>Your business, at a glance</h3><p className="muted">Payments collected, orders placed and expenses recorded within your date range.</p></div><div className="field-row"><label className="field">From<input aria-label="Report start date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="field">To<input aria-label="Report end date" type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>{!validRange && <p className="form-error" role="alert">Choose an end date on or after the start date.</p>}</section>
    <div className="stat-grid"><Stat label="Payments collected" value={money(collected)} note="Payments received during this period" icon={<IndianRupee size={20} />} /><Stat label="Total billed" value={money(billed)} note={`${money(orders.reduce((sum, o) => sum + balance(o), 0))} still outstanding`} icon={<CreditCard size={20} />} /><Stat label="Expenses" value={money(spent)} note={`${expenses.length} recorded expenses`} icon={<Wallet size={20} />} /><Stat label="Cash after expenses" value={money(collected - spent)} note="Collected payments minus expenses" icon={<TrendingUp size={20} />} /></div>
    <div className="settings-grid"><section className="panel"><div className="panel-header"><div><h2>Service mix</h2><p className="muted">Garment value before order discounts</p></div></div><div className="chart-list">{serviceTotals.map((s, index) => <div className="chart-row" key={s.name}><div className="chart-label"><span>{s.name} <small className="muted">· {s.count} pieces</small></span><strong>{money(s.amount)}</strong></div><div style={{ height: 9, borderRadius: 8, background: '#f0f4f3', overflow: 'hidden', marginTop: 10 }}><div style={{ width: `${s.amount / Math.max(...serviceTotals.map(v => v.amount), 1) * 100}%`, background: ['#008c8c', '#78bfb4', '#b7d8cd', '#ceded8'][index], height: '100%', borderRadius: 8 }} /></div></div>)}</div></section><section className="panel"><div className="panel-header"><div><h2>Where money goes</h2><p className="muted">Expenses by category</p></div></div><div className="chart-list">{expenseTotals.map(e => <div className="chart-row" key={e.name}><div className="chart-label"><span>{e.name}</span><strong>{money(e.amount)}</strong></div><div style={{ height: 9, borderRadius: 8, background: '#f7f0e8', overflow: 'hidden', marginTop: 10 }}><div style={{ width: `${e.amount / Math.max(spent, 1) * 100}%`, background: '#dba76b', height: '100%', borderRadius: 8 }} /></div></div>)}{expenseTotals.length === 0 && <div className="empty-state"><Wallet size={26} /><p className="muted">No expenses in this period.</p></div>}</div></section></div>
    <p className="muted report-note">Payments use their collection dates, including payments for older orders. Bills and service mix use order creation dates. Older backups without payment history use the order date for their existing payments. The order export shows current cumulative payments and balances.</p>
  </>;
}

export function SettingsPage({ store, onChange, onRestore = onChange }: Props & { onRestore?: (store: Store) => void }) {
  const [settings, setSettings] = useState<Settings>(store.settings); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [pendingImport, setPendingImport] = useState<Store | null>(null); const [clearConfirm, setClearConfirm] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null); const restoreInput = useRef<HTMLInputElement>(null);
  useEffect(() => setSettings(store.settings), [store.settings]);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); if (!settings.businessName.trim()) return setError('Enter the business name.');
    try { onChange({ ...store, settings: { ...settings, businessName: settings.businessName.trim() } }); setMessage('Business details saved on this device.'); }
    catch (saveError) { setMessage(''); setError(failureMessage(saveError)); }
  }
  async function uploadLogo(file?: File) {
    setError(''); setMessage(''); if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return setError('Choose a PNG, JPG or WebP image under 2 MB.');
    const reader = new FileReader(); reader.onerror = () => setError('The image could not be read. Try another file.'); reader.onload = () => {
      const source = String(reader.result); const image = new Image(); image.onerror = () => setError('This image could not be opened. Please choose another image.'); image.onload = () => { if (image.width < 1 || image.height < 1) return setError('Choose a valid image.'); setSettings(previous => ({ ...previous, logo: source })); setMessage('Logo selected. Save business details to apply it.'); }; image.src = source;
    }; reader.readAsDataURL(file);
  }
  async function readBackup(file?: File) {
    setError(''); setMessage(''); setPendingImport(null); if (!file) return;
    if (file.size > 12 * 1024 * 1024) return setError('This backup is too large. Choose a Laundry Lounge backup under 12 MB.');
    try { const parsed: unknown = JSON.parse(await file.text()); if (!validateStore(parsed)) throw new Error('Invalid backup'); setPendingImport(parsed); }
    catch { setError('This is not a valid Laundry Lounge backup. Your current data has been kept.'); }
  }
  function restoreBackup() {
    if (!pendingImport) return;
    setError(''); setMessage('');
    try { onRestore(pendingImport); setSettings(pendingImport.settings); setPendingImport(null); setClearConfirm(false); setMessage('Backup restored successfully.'); }
    catch (saveError) { setError(failureMessage(saveError)); }
  }
  function clearWorkspace() {
    setError(''); setMessage('');
    try { onRestore({ ...store, orders: [], customers: [], expenses: [] }); setSettings(store.settings); setClearConfirm(false); setPendingImport(null); setMessage('Workspace cleared. You’re ready for your first customer.'); }
    catch (saveError) { setError(failureMessage(saveError)); }
  }
  const update = (key: keyof Settings, value: string) => { setSettings(previous => ({ ...previous, [key]: value })); setMessage(''); };
  return <><div className="page-heading"><div><div className="eyebrow">MAKE YOURSELF AT HOME</div><h1>Settings</h1><p className="muted">The little details that make it Laundry Lounge.</p></div><span className="badge badge-neutral"><Settings2 size={14} /> Single-business workspace</span></div>
    {message && <div className="success-notice" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}
    <div className="settings-grid"><section className="panel settings-card"><div className="panel-header"><div><h2>Business details</h2><p className="muted">Shown on your printed bills and customer messages.</p></div></div><form onSubmit={save}><div className="modal-body"><div className="logo-upload">{settings.logo ? <img src={settings.logo} alt="Laundry Lounge business logo" style={{ width: 100, height: 90, objectFit: 'contain' }} /> : <span className="avatar" style={{ width: 64, height: 64 }}><ImagePlus size={28} /></span>}<div><button type="button" className="btn btn-secondary" onClick={() => logoInput.current?.click()}><ImagePlus size={16} />Upload your logo</button><p className="muted">PNG, JPG or WebP · up to 2 MB</p></div><input ref={logoInput} aria-label="Upload business logo" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /></div><label className="field">Business name<input required value={settings.businessName} onChange={e => update('businessName', e.target.value)} /></label><label className="field">Business phone<input type="tel" placeholder="+91 98765 43210" value={settings.phone} onChange={e => update('phone', e.target.value)} /></label><label className="field">Business address<textarea rows={3} placeholder="Your Laundry Lounge address" value={settings.address} onChange={e => update('address', e.target.value)} /></label><label className="field">Receipt footer<input value={settings.receiptFooter} onChange={e => update('receiptFooter', e.target.value)} /></label></div><div className="modal-footer"><button type="submit" className="btn btn-primary">Save business details</button></div></form></section>
    <div className="settings-stack"><section className="panel settings-card"><div className="panel-header"><div><h2>Your data, in your hands</h2><p className="muted">Records are saved in this browser on this device.</p></div></div><div className="modal-body"><p className="muted">Download backups regularly. Browser data can be removed by clearing site storage. Backups contain customer information; keep them private. This version does not sync between devices.</p><div className="button-row"><button className="btn btn-secondary" onClick={() => download(`laundry-lounge-backup-${localDate()}.json`, JSON.stringify(store, null, 2), 'application/json')}><ArrowDownToLine size={16} />Download backup</button><button className="btn btn-secondary" onClick={() => restoreInput.current?.click()}><ArrowUpFromLine size={16} />Restore backup</button><input ref={restoreInput} aria-label="Restore backup file" type="file" accept="application/json,.json" hidden onChange={e => { void readBackup(e.target.files?.[0]); e.target.value = ''; }} /></div>{pendingImport && <div className="confirmation-box"><h3>Replace the data on this device?</h3><p className="muted">This backup contains {pendingImport.orders.length} orders, {pendingImport.customers.length} customers, and {pendingImport.expenses.length} expenses. Download your current backup first.</p><div className="button-row"><button className="btn btn-secondary" onClick={() => setPendingImport(null)}>Cancel</button><button className="btn btn-primary" onClick={restoreBackup}>Replace and restore</button></div></div>}</div></section>
    <section className="panel settings-card"><div className="panel-header"><div><h2><Smartphone size={18} /> Made for your phone</h2><p className="muted">Keep Laundry Lounge one tap away.</p></div></div><div className="modal-body"><p><strong>Android:</strong> Open in Chrome, tap the menu, then “Install app” or “Add to Home screen”.</p><p><strong>iPhone:</strong> Open in Safari, tap Share, then “Add to Home Screen”.</p><p className="muted">Camera scanning requires HTTPS and camera permission, or enter the tag code manually.</p></div></section>
    <section className="panel settings-card"><div className="panel-header"><div><h2>WhatsApp & printing</h2><p className="muted">Simple tools for your everyday routine.</p></div></div><div className="modal-body"><p className="muted">WhatsApp buttons open a message draft addressed to the customer. Review and send it in WhatsApp. Automatic background messages require a separate WhatsApp Business API integration.</p><p className="muted">Bills and QR tags use your device’s print dialog. Choose your connected printer and adjust paper size in the print settings. Dedicated Bluetooth printer drivers are not included.</p></div></section></div></div>
    <section className="panel settings-card" style={{ marginTop: 24 }}><div className="panel-header"><div><h2>Start fresh</h2><p className="muted">Remove sample data when you’re ready for your first real order.</p></div></div><div className="modal-body">{!clearConfirm ? <button className="btn btn-secondary" onClick={() => setClearConfirm(true)}>Clear workspace data <ChevronRight size={16} /></button> : <div className="confirmation-box"><h3>Clear all customers, orders and expenses?</h3><p className="muted">This removes every record on this device, including any real orders you have entered. Your business settings and logo will be kept. Download a backup first.</p><div className="button-row"><button className="btn btn-secondary" onClick={() => setClearConfirm(false)}>Keep my data</button><button className="btn btn-primary" onClick={clearWorkspace}>Clear all records</button></div></div>}</div></section>
    <p className="muted report-note"><Mail size={13} /> Customer messages stay under your control. <MapPin size={13} /> Built for one Laundry Lounge.</p>
  </>;
}
