import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CheckCircle2, QrCode, ScanLine, Shirt, X } from 'lucide-react';
import { getTags, parseTagInput, STATUSES, updateTagStatus } from '../domain';
import type { Status, Store } from '../types';

interface Props { store: Store; onChange: (store: Store) => void; onClose: () => void; }
interface DetectedBarcode { rawValue: string; }
interface QRDetector { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>; }
interface QRDetectorConstructor { new (options: { formats: string[] }): QRDetector; }

export default function Scanner({ store, onChange, onClose }: Props) {
  const [input, setInput] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [nextStatus, setNextStatus] = useState<Status>('Processing');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const storeRef = useRef(store);
  const lastScanRef = useRef({ raw: '', time: 0 });
  storeRef.current = store;
  const supportsCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  const order = store.orders.find(candidate => getTags(candidate).some(tag => tag.id === selectedId));
  const tag = order && getTags(order).find(candidate => candidate.id === selectedId);
  const customer = order && store.customers.find(candidate => candidate.id === order.customerId);

  function stopCamera() {
    generationRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mountedRef.current) { setCameraOn(false); setCameraBusy(false); }
  }
  useEffect(() => {
    mountedRef.current = true;
    function key(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', key);
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  function findTag(raw: string): boolean {
    setError(''); setSuccess('');
    const id = parseTagInput(raw);
    if (!id) { setError('Enter a full garment tag, such as LL-1048-1-1, or scan its QR code.'); setSelectedId(''); return false; }
    const foundOrder = storeRef.current.orders.find(candidate => getTags(candidate).some(candidateTag => candidateTag.id === id));
    const found = foundOrder && getTags(foundOrder).find(candidate => candidate.id === id);
    if (!found) { setError('No garment matches this tag. Check the number or restore the order’s backup on this device.'); setSelectedId(''); return false; }
    setInput(id); setSelectedId(id);
    setNextStatus(STATUSES[Math.min(STATUSES.indexOf(found.status) + 1, STATUSES.length - 1)]);
    return true;
  }
  async function startCamera() {
    setError(''); setSuccess('');
    if (!window.isSecureContext) { setError('Camera scanning needs a secure HTTPS connection. You can still enter the printed tag below.'); return; }
    const Detector = (window as Window & { BarcodeDetector?: QRDetectorConstructor }).BarcodeDetector;
    if (!Detector) { setError('QR camera scanning is not supported by this browser. Enter the tag number below, or use a compatible browser such as Chrome on Android.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('The camera is unavailable. Enter the printed tag number below.'); return; }
    stopCamera();
    const generation = generationRef.current;
    setCameraBusy(true);
    try {
      const detector = new Detector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!mountedRef.current || generation !== generationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      setCameraOn(true);
      await video.play();
      if (!mountedRef.current || generation !== generationRef.current) return;
      setCameraBusy(false);
      async function detect() {
        if (!mountedRef.current || generation !== generationRef.current || !video) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (!mountedRef.current || generation !== generationRef.current) return;
            const raw = codes[0]?.rawValue;
            if (raw && (lastScanRef.current.raw !== raw || Date.now() - lastScanRef.current.time > 2000)) {
              lastScanRef.current = { raw, time: Date.now() };
              if (findTag(raw)) { stopCamera(); return; }
            }
          }
        } catch {
          stopCamera();
          if (mountedRef.current) setError('The browser could not read the camera stream. Enter the printed tag below.');
          return;
        }
        if (mountedRef.current && generation === generationRef.current) timerRef.current = setTimeout(detect, 300);
      }
      timerRef.current = setTimeout(detect, 250);
    } catch (issue) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      stopCamera();
      const denied = issue instanceof DOMException && issue.name === 'NotAllowedError';
      setError(denied ? 'Camera permission was denied. Allow camera access in your browser, or enter the printed tag below.' : 'The camera could not start. Check that it is available, or enter the printed tag below.');
    }
  }
  function saveStatus() {
    try {
      const next = updateTagStatus(store, selectedId, nextStatus);
      onChange(next);
      setSuccess(`Tag ${selectedId} marked ${nextStatus.toLowerCase()}.`);
      setError('');
    } catch (issue) { setSuccess(''); setError(issue instanceof Error ? issue.message : 'The garment status could not be saved. Please try again.'); }
  }

  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
      <div className="modal-header"><div><span className="eyebrow">EVERY GARMENT, ACCOUNTED FOR</span><h2 id="scanner-title">Scan a garment tag</h2><p className="muted">Find a garment and update its care journey.</p></div><button className="icon-button" aria-label="Close scanner" onClick={onClose}><X size={20}/></button></div>
      <div className="modal-body">
        <div className={`scanner-camera ${cameraOn ? 'active' : ''}`}>
          <video ref={videoRef} muted playsInline aria-label="Live QR scanning camera" style={{ display: cameraOn ? 'block' : 'none', width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12 }}/>
          {!cameraOn && <div className="scanner-placeholder"><div className="scanner-qr"><ScanLine size={44} strokeWidth={1.4}/></div><h3>A quick scan. A clear picture.</h3><p className="muted">Point your camera at a Laundry Lounge QR tag.</p></div>}
          <div className="scanner-camera-actions">{cameraOn ? <button type="button" className="btn btn-secondary" onClick={stopCamera}>Stop camera</button> : <button type="button" className="btn btn-secondary" onClick={() => void startCamera()} disabled={cameraBusy}><Camera size={17}/>{cameraBusy ? 'Opening camera…' : 'Open camera'}</button>}</div>
        </div>
        {!supportsCamera && <p className="form-hint">Camera QR scanning is unavailable in this browser. Enter a tag below, or open the app in Chrome on Android.</p>}
        <form className="scanner-manual" onSubmit={event => { event.preventDefault(); stopCamera(); findTag(input); }}>
          <label className="field">Or enter the printed tag number<input autoFocus placeholder="e.g. LL-1048-1-1" value={input} onChange={event => { setInput(event.target.value); setSuccess(''); setSelectedId(''); setError(''); }} autoComplete="off" autoCapitalize="characters" maxLength={100}/></label>
          <button className="btn btn-secondary" type="submit"><QrCode size={17}/>Find garment</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {tag && order && <div className="scanner-result">
          <div className="section-label"><Shirt size={20}/><div><h3>{tag.item.garment}</h3><span className="muted">{tag.item.service} · piece {tag.number}</span></div><span className={`status-badge ${tag.status.toLowerCase()}`}>{tag.status}</span></div>
          <div className="scanner-tag-details"><p><span className="muted">Customer</span><strong>{customer?.name ?? 'Customer'}</strong></p><p><span className="muted">Order</span><strong>{order.id}</strong></p><p><span className="muted">Tag</span><strong>{tag.id}</strong></p></div>
          <label className="field">Update garment status<select value={nextStatus} onChange={event => { setNextStatus(event.target.value as Status); setSuccess(''); }}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <p className="form-hint">The order advances when every garment reaches the next stage.</p>
          <button className="btn btn-primary" type="button" disabled={tag.status === nextStatus} onClick={saveStatus}><Check size={17}/>Save garment status</button>
        </div>}
        {success && <div className="success-message" role="status"><CheckCircle2 size={18}/>{success}</div>}
      </div>
      <div className="modal-footer"><span className="form-hint">Works with printed QR tags and manual entry.</span><button className="btn btn-secondary" onClick={onClose}>Done</button></div>
    </section>
  </div>;
}
