import { Linking } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import {
  balance,
  dateLabel,
  getTags,
  money,
  orderTotal,
  validateStore,
} from "./domain";
import { tagSvg } from "./qr";
import type { Order, Store } from "./types";

export { tagSvg } from "./qr";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const printDate = (date: string) => dateLabel(date);
const logoHtml = (store: Store) =>
  store.settings.logo &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
    store.settings.logo,
  )
    ? `<img class="logo" src="${store.settings.logo}" alt="Business logo"/>`
    : "";
function htmlPage(title: string, contents: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172c24;font-size:12px;margin:0}h1,h2,p{margin:0}header{text-align:center;border-bottom:1px dashed #a7b8a9;padding:0 0 20px}h1{font-size:24px;color:#008b80}header p{font-size:11px;line-height:1.6;margin-top:5px;white-space:pre-line}.logo{max-width:150px;max-height:90px;object-fit:contain;margin:0 0 10px}section{margin-top:20px}.meta{display:flex;justify-content:space-between;margin:20px 0}.small{font-size:10px;color:#637a6a}.customer p{line-height:1.7}table{width:100%;border-collapse:collapse;margin-top:22px}thead{display:table-header-group}tr{break-inside:avoid}th{padding:10px 5px;text-align:left;background:#edf5ee;font-size:10px}td{padding:13px 5px;border-bottom:1px solid #e2e9df;font-size:11px}td:not(:first-child),th:not(:first-child){text-align:right}td small{display:block;margin-top:4px;color:#637a6a;font-size:10px}.summary{margin:20px 0 20px auto;width:260px}.summary p{display:flex;justify-content:space-between;padding:7px 0}.total{font-size:16px;border-top:1px solid #d4e0d1;margin-top:5px;padding-top:14px!important}.notes{background:#f3f7f0;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}footer{text-align:center;font-size:11px;border-top:1px dashed #a7b8a9;margin-top:20px;padding-top:16px;line-height:1.7}.tags{display:flex;flex-wrap:wrap;gap:7mm}.tag{width:calc(50% - 4mm);border:1px dashed #52674e;padding:3mm;break-inside:avoid;page-break-inside:avoid;overflow-wrap:anywhere}.tag-brand{font-size:12px;font-weight:bold;border-bottom:1px solid #d7e1d0;padding-bottom:6px;margin-bottom:6px;display:flex;align-items:center;gap:7px}.tag-brand .logo{max-width:35px;max-height:30px;margin:0}.tag-body{display:flex;align-items:center;gap:7px}.tag-body svg{width:26mm;height:26mm;flex-shrink:0}.tag-body p{font-size:10px;line-height:1.6}.tag code{display:block;text-align:center;font-size:11px;margin-top:6px}.tag-note{font-size:9px;margin-top:6px;line-height:1.5;white-space:pre-wrap}
  </style></head><body>${contents}</body></html>`;
}
function billHtml(store: Store, order: Order): string {
  const customer = store.customers.find(
    (entry) => entry.id === order.customerId,
  );
  const rows = order.items
    .map(
      (item) =>
        `<tr><td><strong>${escapeHtml(item.garment)}</strong><small>${escapeHtml(item.service)}</small></td><td>${item.quantity}</td><td>${escapeHtml(money(item.price))}</td><td>${escapeHtml(money(item.price * item.quantity))}</td></tr>`,
    )
    .join("");
  return htmlPage(
    `${store.settings.businessName} · ${order.id}`,
    `<header>${logoHtml(store)}<h1>${escapeHtml(store.settings.businessName)}</h1><p>Your finest fabric caretaker.</p>${store.settings.address ? `<p>${escapeHtml(store.settings.address)}</p>` : ""}${store.settings.phone ? `<p>Tel: ${escapeHtml(store.settings.phone)}</p>` : ""}</header><div class="meta"><p><span class="small">BILL NUMBER</span><br/><strong>${escapeHtml(order.id)}</strong></p><p><span class="small">ISSUED</span><br/>${escapeHtml(printDate(order.createdAt))}</p></div><section class="customer"><span class="small">BILLED TO</span><h2>${escapeHtml(customer?.name ?? "Customer")}</h2><p>${escapeHtml(customer?.phone)}</p><p>Collection: ${escapeHtml(printDate(order.dueDate))}${order.express ? " · Express" : ""}</p></section><table><thead><tr><th>Garment / service</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><p><span>Subtotal</span><span>${escapeHtml(money(order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)))}</span></p>${order.discount ? `<p><span>Discount</span><span>− ${escapeHtml(money(order.discount))}</span></p>` : ""}<p class="total"><strong>Total</strong><strong>${escapeHtml(money(orderTotal(order)))}</strong></p><p><span>Paid</span><span>${escapeHtml(money(order.paid))}</span></p><p><strong>Balance due</strong><strong>${escapeHtml(money(balance(order)))}</strong></p></div>${order.notes ? `<p class="notes"><strong>Care instructions:</strong> ${escapeHtml(order.notes)}</p>` : ""}<footer>${escapeHtml(store.settings.receiptFooter)}<br/><small>Please bring this bill when collecting your garments. Amounts in INR; no tax added.</small></footer>`,
  );
}
function tagsHtml(store: Store, order: Order): string {
  const customer = store.customers.find(
    (entry) => entry.id === order.customerId,
  );
  return htmlPage(
    `${order.id} · Garment tags`,
    `<div class="tags">${getTags(order)
      .map(
        (tag) =>
          `<article class="tag"><div class="tag-brand">${logoHtml(store)}${escapeHtml(store.settings.businessName)}</div><div class="tag-body">${tagSvg(tag.id)}<div><strong>${escapeHtml(tag.item.garment)}</strong><p>${escapeHtml(tag.item.service)}</p><p>${escapeHtml(customer?.name)}</p><p>Due ${escapeHtml(printDate(order.dueDate))}${order.express ? " · EXPRESS" : ""}</p></div></div><code>${escapeHtml(tag.id)}</code>${tag.item.note || order.notes ? `<p class="tag-note">${escapeHtml(tag.item.note || order.notes)}</p>` : ""}</article>`,
      )
      .join("")}</div>`,
  );
}
export async function printOrder(
  store: Store,
  order: Order,
  mode: "bill" | "tags",
): Promise<void> {
  await Print.printAsync({
    html: mode === "tags" ? tagsHtml(store, order) : billHtml(store, order),
  });
}
export async function shareBill(store: Store, order: Order): Promise<void> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "Sharing is not available on this phone. Use Print bill to save a PDF.",
    );
  const file = await Print.printToFileAsync({
    html: billHtml(store, order),
    base64: false,
  });
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    dialogTitle: `${order.id} · Laundry Lounge bill`,
    UTI: "com.adobe.pdf",
  });
}
export async function shareWhatsApp(store: Store, order: Order): Promise<void> {
  const customer = store.customers.find(
    (entry) => entry.id === order.customerId,
  );
  let phone = customer?.phone.replace(/\D/g, "") ?? "";
  if (phone.length === 11 && phone.startsWith("0")) phone = phone.slice(1);
  if (phone.length === 10) phone = `91${phone}`;
  if (!/^[1-9]\d{9,14}$/.test(phone))
    throw new Error(
      "Add a valid customer phone number before sharing on WhatsApp.",
    );
  const text = `Hello ${customer?.name}, your ${store.settings.businessName} order ${order.id} is ${order.status.toLowerCase()}.\n\n${order.items.map((item) => `${item.quantity} × ${item.garment} · ${item.service} · ${money(item.quantity * item.price)}`).join("\n")}\n\nTotal: ${money(orderTotal(order))}\nPaid: ${money(order.paid)}\nBalance: ${money(balance(order))}\nCollection: ${printDate(order.dueDate)}\n\n${store.settings.receiptFooter}`;
  const query = `phone=${phone}&text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(`whatsapp://send?${query}`);
  } catch {
    await Linking.openURL(
      `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
    );
  }
}
async function shareJson(
  contents: string,
  filename: string,
  title: string,
): Promise<void> {
  if (!FileSystem.cacheDirectory)
    throw new Error("Temporary storage is unavailable on this phone.");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is not available on this phone.");
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    mimeType: "application/json",
    dialogTitle: title,
    UTI: "public.json",
  });
}
export async function exportBackup(store: Store): Promise<void> {
  if (!validateStore(store))
    throw new Error(
      "The current records are invalid. Use the recovery export instead.",
    );
  await shareJson(
    JSON.stringify(store, null, 2),
    `laundry-lounge-backup-${Date.now()}.json`,
    "Save your Laundry Lounge backup",
  );
}
/** Preserve malformed original content so recovery never silently discards it. */
export async function exportRawBackup(raw: string): Promise<void> {
  await shareJson(
    raw,
    `laundry-lounge-recovery-${Date.now()}.json`,
    "Save original Laundry Lounge data",
  );
}
export async function readBackup(): Promise<Store | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "application/octet-stream"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = result.assets[0];
  if (!file) return null;
  if (file.size !== undefined && file.size > 12 * 1024 * 1024)
    throw new Error("Choose a Laundry Lounge backup under 12 MB.");
  const raw = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (raw.length > 12 * 1024 * 1024)
    throw new Error("Choose a Laundry Lounge backup under 12 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "This file is not a readable JSON backup. Existing records have been kept.",
    );
  }
  if (!validateStore(parsed))
    throw new Error(
      "This is not a valid Laundry Lounge backup. Existing records have been kept.",
    );
  return parsed;
}
