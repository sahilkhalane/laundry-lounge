import React, { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "expo-crypto";
import type {
  Customer,
  LineItem,
  Order,
  Service,
  Status,
  Store,
} from "../types";
import {
  balance,
  dateLabel,
  getPayments,
  getTags,
  initials,
  nextOrderId,
  orderTotal,
} from "../domain";
import { printOrder, shareBill, shareWhatsApp } from "../integrations";
import QR from "./QR";
import {
  Button,
  C,
  Card,
  Chips,
  DateField,
  Empty,
  ErrorText,
  Field,
  money,
  Saving,
  SectionTitle,
  Sheet,
  u,
} from "../ui";

const STATUSES: readonly Status[] = [
  "Received",
  "Processing",
  "Ready",
  "Delivered",
];
const SERVICES: readonly Service[] = [
  "Wash & Fold",
  "Wash & Iron",
  "Dry Cleaning",
  "Steam Iron",
];
const RATES: Record<Service, number> = {
  "Wash & Fold": 40,
  "Wash & Iron": 60,
  "Dry Cleaning": 150,
  "Steam Iron": 20,
};
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pieces = (order: Order) =>
  order.items.reduce((sum, item) => sum + item.quantity, 0);
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const readableDue = (date: string) =>
  dateLabel(date.length === 10 ? `${date}T12:00:00` : date);
const canonicalPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
};
const cents = (n: number) =>
  Number.isFinite(n) && Math.abs(rounded(n) - n) < 0.0000001;
function freshItem(): LineItem {
  return {
    id: randomUUID(),
    garment: "Shirt",
    service: "Wash & Iron",
    quantity: 1,
    price: 60,
  };
}
function StatusBadge({ status }: { status: Status }) {
  const color = {
    Received: "#6585ac",
    Processing: "#aa823e",
    Ready: "#528264",
    Delivered: "#8a72a4",
  }[status];
  return (
    <View style={[u.badge, { backgroundColor: `${color}14` }]}>
      <Text style={[u.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

export function OrdersScreen({
  store,
  onOpen,
  onNew,
}: {
  store: Store;
  onOpen: (order: Order) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const orders = store.orders.filter((order) => {
    const customer = store.customers.find((c) => c.id === order.customerId);
    return (
      (filter === "All" || order.status === filter) &&
      `${order.id} ${customer?.name} ${customer?.phone}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  return (
    <ScrollView
      style={u.screen}
      contentContainerStyle={u.body}
      keyboardShouldPersistTaps="handled"
    >
      <SectionTitle
        title="Orders"
        subtitle="Every garment, right where it belongs."
      />
      <Button title="New order" onPress={onNew} icon="add" />
      <View style={u.spacer} />
      <Field
        label="Search orders"
        placeholder="Customer, phone or order number"
        value={query}
        onChangeText={setQuery}
      />
      <Chips
        values={["All", ...STATUSES]}
        value={filter}
        onChange={setFilter}
      />
      <Text style={[u.small, { marginBottom: 14 }]}>
        {orders.length} orders ·{" "}
        {money(orders.reduce((sum, order) => sum + balance(order), 0))}{" "}
        outstanding
      </Text>
      {orders.map((order) => {
        const customer = store.customers.find((c) => c.id === order.customerId);
        return (
          <Pressable
            key={order.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${order.id}, ${customer?.name}, ${order.status}`}
            onPress={() => onOpen(order)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Card>
              <View style={u.row}>
                <View style={u.avatar}>
                  <Text style={u.avatarText}>
                    {initials(customer?.name || "Customer")}
                  </Text>
                </View>
                <View style={u.flex}>
                  <Text style={s.customerName}>{customer?.name}</Text>
                  <Text style={u.small}>
                    #{order.id} · {pieces(order)} garments
                  </Text>
                </View>
                <StatusBadge status={order.status} />
              </View>
              <View style={[u.between, { marginTop: 18 }]}>
                <View>
                  <Text style={s.service}>{order.items[0].service}</Text>
                  <Text style={u.small}>
                    Due {readableDue(order.dueDate)}
                    {order.express ? " · Express" : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.rowAmount}>{money(orderTotal(order))}</Text>
                  <Text
                    style={[
                      u.small,
                      { color: balance(order) ? C.orange : C.teal },
                    ]}
                  >
                    {balance(order) ? `${money(balance(order))} due` : "Paid"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={C.muted} />
              </View>
            </Card>
          </Pressable>
        );
      })}
      {!orders.length && (
        <Empty
          title="No orders here yet"
          text="Create a new order, or try another search."
        />
      )}
    </ScrollView>
  );
}
export default OrdersScreen;

export function NewOrder({
  store,
  onSave,
  onClose,
}: {
  store: Store;
  onSave: (order: Order, customer?: Customer) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState(store.customers[0]?.id || "new");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<LineItem[]>(() => [freshItem()]);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return localDate(date);
  });
  const [express, setExpress] = useState(false);
  const [notes, setNotes] = useState("");
  const [discountText, setDiscountText] = useState("0");
  const [paidText, setPaidText] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const discount = Number(discountText);
  const paid = Number(paidText);
  const subtotal = rounded(
    items.reduce((sum, item) => sum + item.quantity * item.price, 0),
  );
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = rounded(
    Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0)),
  );
  const orderId = nextOrderId(store.orders);
  const customer = store.customers.find((c) => c.id === customerId);
  const close = () => {
    if (!saving.current) onClose();
  };
  const patch = (id: string, update: Partial<LineItem>) => {
    setItems((old) =>
      old.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
    setError("");
  };
  function updateRate(id: string, value: string) {
    setRateDrafts((old) => ({ ...old, [id]: value }));
    const number = Number(value);
    patch(id, { price: Number.isFinite(number) ? number : 0 });
  }
  function removeItem(id: string) {
    setItems((old) => old.filter((item) => item.id !== id));
    setRateDrafts((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
  }
  function validate(stage: number): string {
    if (stage === 0) {
      if (customerId === "new") {
        if (name.trim().length < 2)
          return "Enter a customer name with at least two characters.";
        if (
          !/^\+?[\d\s()-]{8,20}$/.test(phone.trim()) ||
          phone.replace(/\D/g, "").length < 10 ||
          phone.replace(/\D/g, "").length > 15
        )
          return "Enter a valid phone number with 10–15 digits.";
        if (
          store.customers.some(
            (c) => canonicalPhone(c.phone) === canonicalPhone(phone),
          )
        )
          return "This phone number already belongs to a customer. Select that customer instead.";
      } else if (!customer) return "Select a customer first.";
    }
    if (stage === 1) {
      if (!items.length || count > 10000)
        return "Add garments, with no more than 10,000 pieces in one order.";
      if (
        items.some(
          (item) =>
            !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(
              rateDrafts[item.id] ?? String(item.price),
            ),
        )
      )
        return "Enter a complete rate for every garment, with no more than two decimal places.";
      if (
        items.some(
          (item) =>
            !item.garment.trim() ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1 ||
            item.quantity > 999 ||
            !cents(item.price) ||
            item.price < 0 ||
            item.price > 100000,
        )
      )
        return "Each garment needs a name, a whole quantity from 1–999, and a valid rate with up to two decimal places.";
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
        ? new Date(`${dueDate}T12:00:00`)
        : new Date(NaN);
      if (
        !Number.isFinite(parsed.getTime()) ||
        localDate(parsed) !== dueDate ||
        dueDate < localDate()
      )
        return "Enter a valid collection date, today or later, as YYYY-MM-DD.";
    }
    if (stage === 2) {
      if (!cents(discount) || discount < 0 || discount > subtotal)
        return "Discount must be between zero and the subtotal, with up to two decimal places.";
      if (!cents(paid) || paid < 0 || paid > total)
        return "Payment must be between zero and the bill total, with up to two decimal places.";
    }
    return "";
  }
  async function proceed() {
    if (saving.current) return;
    const issue = validate(step);
    if (issue) return setError(issue);
    if (step < 2) {
      setError("");
      setStep(step + 1);
      return;
    }
    for (let stage = 0; stage < 3; stage++) {
      const issue = validate(stage);
      if (issue) {
        setStep(stage);
        return setError(issue);
      }
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const newCustomer: Customer | undefined =
        customerId === "new"
          ? { id: randomUUID(), name: name.trim(), phone: phone.trim() }
          : undefined;
      const createdAt = new Date().toISOString();
      const order: Order = {
        id: orderId,
        customerId: newCustomer?.id || customerId,
        items: items.map((item) => ({ ...item, garment: item.garment.trim() })),
        createdAt,
        dueDate,
        status: "Received",
        paid,
        payments:
          paid > 0
            ? [{ id: randomUUID(), amount: paid, paidAt: createdAt }]
            : [],
        discount,
        express,
        notes: notes.trim(),
        tagStatuses: {},
      };
      await onSave(order, newCustomer);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The order could not be saved. Please try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const displayedCustomers = store.customers
    .filter((c) =>
      `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 30);
  return (
    <Sheet
      title="New order"
      onClose={close}
      footer={
        <>
          <Saving active={busy} />
          <View style={u.between}>
            <Button
              title={step ? "Back" : "Cancel"}
              secondary
              disabled={busy}
              onPress={() => {
                if (step) {
                  setStep(step - 1);
                  setError("");
                } else close();
              }}
            />
            <View style={{ alignItems: "center" }}>
              <Text style={s.rowAmount}>{money(total)}</Text>
              <Text style={u.small}>{count} pieces</Text>
            </View>
            <Button
              title={step === 2 ? "Create order" : "Continue"}
              disabled={busy}
              onPress={() => {
                void proceed();
              }}
              icon={step === 2 ? "checkmark" : "arrow-forward"}
            />
          </View>
        </>
      }
    >
      <View style={s.steps}>
        {["Customer", "Garments", "Review"].map((label, index) => (
          <View key={label} style={[s.step, index === step && s.activeStep]}>
            <Text style={[s.stepText, index <= step && { color: C.teal }]}>
              {index + 1}. {label}
            </Text>
          </View>
        ))}
      </View>
      <ErrorText text={error} />
      {step === 0 && (
        <>
          <SectionTitle
            title="Who are we caring for?"
            subtitle="Choose a familiar face, or add someone new."
          />
          <Button
            title={
              customerId === "new"
                ? "Select existing customer"
                : "Add a new customer"
            }
            secondary
            onPress={() => {
              setCustomerId(
                customerId === "new" && store.customers.length
                  ? store.customers[0].id
                  : "new",
              );
              setError("");
            }}
            disabled={busy || (!store.customers.length && customerId === "new")}
          />
          <View style={u.spacer} />
          {customerId === "new" ? (
            <>
              <Field
                label="Customer name"
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                maxLength={100}
                editable={!busy}
                autoCapitalize="words"
              />
              <Field
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
                maxLength={20}
                editable={!busy}
              />
              <Text style={u.small}>
                This number is used when sharing bills and collection messages
                through WhatsApp.
              </Text>
            </>
          ) : (
            <>
              <Field
                label="Find customer"
                placeholder="Name or phone"
                value={search}
                onChangeText={setSearch}
                editable={!busy}
              />
              {displayedCustomers.map((c) => (
                <Pressable
                  key={c.id}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: c.id === customerId }}
                  accessibilityLabel={`${c.name}, ${c.phone}`}
                  onPress={() => {
                    setCustomerId(c.id);
                    setError("");
                  }}
                  style={[
                    s.customerChoice,
                    c.id === customerId && s.selectedCustomer,
                  ]}
                >
                  <View style={u.avatar}>
                    <Text style={u.avatarText}>{initials(c.name)}</Text>
                  </View>
                  <View style={u.flex}>
                    <Text style={s.customerName}>{c.name}</Text>
                    <Text style={u.small}>{c.phone}</Text>
                  </View>
                  <Ionicons
                    name={
                      c.id === customerId
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={21}
                    color={c.id === customerId ? C.teal : C.muted}
                  />
                </Pressable>
              ))}
              {!displayedCustomers.length && (
                <Empty
                  title="No customer found"
                  text="Try another name or add a new customer."
                />
              )}
              {store.customers.length > 30 && (
                <Text style={u.small}>
                  Search by name or phone to find more customers.
                </Text>
              )}
            </>
          )}
        </>
      )}
      {step === 1 && (
        <>
          <SectionTitle
            title="Garments & care"
            subtitle="Each piece gets its own scannable QR tag."
          />
          {items.map((item, index) => (
            <Card key={item.id}>
              <View style={[u.between, { marginBottom: 15 }]}>
                <Text style={s.customerName}>Item {index + 1}</Text>
                <Pressable
                  disabled={busy || items.length === 1}
                  onPress={() => removeItem(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove item ${index + 1}`}
                  hitSlop={10}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={items.length === 1 ? "#c3cfc7" : C.red}
                  />
                </Pressable>
              </View>
              <Field
                label={`Item ${index + 1} garment`}
                value={item.garment}
                onChangeText={(garment) => patch(item.id, { garment })}
                placeholder="Shirt, saree, jeans…"
                maxLength={80}
                editable={!busy}
              />
              <Text style={u.label}>Service</Text>
              <Chips
                values={SERVICES}
                value={item.service}
                onChange={(service) => {
                  if (!busy) {
                    patch(item.id, { service, price: RATES[service] });
                    setRateDrafts((old) => ({
                      ...old,
                      [item.id]: String(RATES[service]),
                    }));
                  }
                }}
              />
              <View style={u.twoColumns}>
                <View style={u.flex}>
                  <Text style={u.label}>Quantity</Text>
                  <View style={s.quantity}>
                    <Pressable
                      disabled={busy || item.quantity <= 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease item ${index + 1} quantity`}
                      onPress={() =>
                        patch(item.id, {
                          quantity: Math.max(1, item.quantity - 1),
                        })
                      }
                      style={s.quantityButton}
                    >
                      <Ionicons name="remove" size={19} color={C.teal} />
                    </Pressable>
                    <TextInput
                      accessibilityLabel={`Item ${index + 1} quantity`}
                      value={item.quantity ? String(item.quantity) : ""}
                      onChangeText={(value) =>
                        patch(item.id, { quantity: Number(value) })
                      }
                      keyboardType="number-pad"
                      maxLength={3}
                      editable={!busy}
                      style={s.quantityInput}
                    />
                    <Pressable
                      disabled={busy || item.quantity >= 999}
                      accessibilityRole="button"
                      accessibilityLabel={`Increase item ${index + 1} quantity`}
                      onPress={() =>
                        patch(item.id, {
                          quantity: Math.min(999, item.quantity + 1),
                        })
                      }
                      style={s.quantityButton}
                    >
                      <Ionicons name="add" size={19} color={C.teal} />
                    </Pressable>
                  </View>
                </View>
                <View style={u.flex}>
                  <Field
                    label={`Item ${index + 1} rate (₹)`}
                    value={rateDrafts[item.id] ?? String(item.price)}
                    onChangeText={(value) => updateRate(item.id, value)}
                    keyboardType="decimal-pad"
                    editable={!busy}
                    selectTextOnFocus
                  />
                </View>
              </View>
              <Text style={[s.rowAmount, { textAlign: "right" }]}>
                {money(item.quantity * item.price)}
              </Text>
            </Card>
          ))}
          <Button
            title="Add garment"
            secondary
            icon="add"
            disabled={busy}
            onPress={() => setItems((old) => [...old, freshItem()])}
          />
          <View style={u.spacer} />
          <DateField
            label="Collection date"
            value={dueDate}
            onChange={setDueDate}
            minimumDate={new Date(`${localDate()}T00:00:00`)}
          />
          <Card>
            <View style={u.between}>
              <View style={u.flex}>
                <Text style={s.customerName}>Express order</Text>
                <Text style={u.small}>
                  Prioritise this order · no extra fee
                </Text>
              </View>
              <Switch
                accessibilityLabel="Express order"
                value={express}
                onValueChange={setExpress}
                disabled={busy}
                trackColor={{ true: "#91cdb7", false: "#dce5df" }}
                thumbColor={express ? C.teal : "#f7faf8"}
              />
            </View>
          </Card>
          <Field
            label="Care instructions (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Stains, delicate fabrics, special requests…"
            multiline
            maxLength={1000}
            editable={!busy}
          />
        </>
      )}
      {step === 2 && (
        <>
          <SectionTitle
            title="A little extra care"
            subtitle={`#${orderId} · ${count} individual garment tags`}
          />
          <Card>
            <Text style={u.heading}>
              {customerId === "new" ? name.trim() : customer?.name}
            </Text>
            <Text style={u.small}>
              Collection {readableDue(dueDate)}
              {express ? " · Express" : ""}
            </Text>
            <View style={u.divider} />
            {items.map((item) => (
              <View key={item.id} style={[u.between, { paddingVertical: 10 }]}>
                <View style={u.flex}>
                  <Text style={s.customerName}>
                    {item.quantity} × {item.garment}
                  </Text>
                  <Text style={u.small}>
                    {item.service} · {money(item.price)} each
                  </Text>
                </View>
                <Text style={s.rowAmount}>
                  {money(item.quantity * item.price)}
                </Text>
              </View>
            ))}
          </Card>
          <Field
            label="Discount (₹)"
            value={discountText}
            onChangeText={setDiscountText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            editable={!busy}
          />
          <Field
            label="Payment received (₹)"
            value={paidText}
            onChangeText={setPaidText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            editable={!busy}
          />
          <Card>
            <MoneyRow label="Subtotal" value={subtotal} />
            <MoneyRow label="Discount" value={-discount} />
            <View style={u.divider} />
            <MoneyRow label="Bill total" value={total} bold />
            <MoneyRow label="Paid" value={paid} />
            <MoneyRow
              label="Balance due"
              value={Math.max(total - paid, 0)}
              bold
            />
          </Card>
          <Text style={u.small}>
            Creating this order saves its bill and a unique tag for every
            garment on this phone. Print or share them from the order.
          </Text>
        </>
      )}
    </Sheet>
  );
}

function MoneyRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <View style={[u.between, { paddingVertical: 7 }]}>
      <Text
        style={[
          u.small,
          bold && { color: C.ink, fontWeight: "700", fontSize: 14 },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          { color: C.ink, fontSize: 14 },
          bold && { fontWeight: "700", fontSize: 17 },
        ]}
      >
        {money(Number.isFinite(value) ? value : 0)}
      </Text>
    </View>
  );
}

export function OrderDetail({
  store,
  order,
  onChange,
  onClose,
}: {
  store: Store;
  order: Order;
  onChange: (next: Store) => Promise<void>;
  onClose: () => void;
}) {
  const customer = store.customers.find((c) => c.id === order.customerId);
  const [payment, setPayment] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showTags, setShowTags] = useState(false);
  const tags = getTags(order);
  async function run(action: () => Promise<void>, success = "") {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (success) setMessage(success);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This action could not be completed.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function setStatus(status: Status) {
    if (status === order.status && tags.every((tag) => tag.status === status))
      return;
    void run(async () => {
      await onChange({
        ...store,
        orders: store.orders.map((entry) =>
          entry.id === order.id
            ? {
                ...entry,
                status,
                tagStatuses: Object.fromEntries(
                  getTags(entry).map((tag) => [tag.id, status]),
                ),
              }
            : entry,
        ),
      });
    }, `All garments marked ${status.toLowerCase()}.`);
  }
  function recordPayment() {
    const amount = Number(payment);
    if (!cents(amount) || amount <= 0 || amount > balance(order)) {
      setError(
        "Enter a positive payment up to the outstanding balance, with no more than two decimal places.",
      );
      return;
    }
    void run(async () => {
      await onChange({
        ...store,
        orders: store.orders.map((entry) =>
          entry.id === order.id
            ? {
                ...entry,
                paid: rounded(entry.paid + amount),
                payments: [
                  ...getPayments(entry),
                  {
                    id: randomUUID(),
                    amount,
                    paidAt: new Date().toISOString(),
                  },
                ],
              }
            : entry,
        ),
      });
      setPayment("");
    }, "Payment recorded on this phone.");
  }
  return (
    <Sheet
      title={`Order ${order.id}`}
      onClose={() => {
        if (!running.current) onClose();
      }}
    >
      <ErrorText text={error} />
      {message && (
        <Text accessibilityRole="alert" style={u.success}>
          {message}
        </Text>
      )}
      <Saving active={busy} />
      <Card>
        <View style={u.row}>
          <View style={u.avatar}>
            <Text style={u.avatarText}>
              {initials(customer?.name || "Customer")}
            </Text>
          </View>
          <View style={u.flex}>
            <Text style={u.heading}>{customer?.name}</Text>
            <Text style={u.small}>{customer?.phone}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>
        <Text style={[u.small, { marginTop: 14 }]}>
          Due {readableDue(order.dueDate)}
          {order.express ? " · Express" : ""} · {tags.length} garments
        </Text>
        <View style={u.divider} />
        {order.items.map((item) => (
          <View key={item.id} style={[u.between, { paddingVertical: 12 }]}>
            <View style={u.flex}>
              <Text style={s.customerName}>
                {item.garment} × {item.quantity}
              </Text>
              <Text style={u.small}>
                {item.service} · {money(item.price)} each
              </Text>
            </View>
            <Text style={s.rowAmount}>{money(item.price * item.quantity)}</Text>
          </View>
        ))}
        <View style={u.divider} />
        <MoneyRow
          label="Subtotal"
          value={rounded(orderTotal(order) + order.discount)}
        />
        {order.discount > 0 && (
          <MoneyRow label="Discount" value={-order.discount} />
        )}
        <MoneyRow label="Total" value={orderTotal(order)} bold />
        <MoneyRow label="Paid" value={order.paid} />
        <MoneyRow label="Balance due" value={balance(order)} bold />
        {order.notes ? (
          <Text style={[u.small, { marginTop: 16 }]}>
            Care notes: {order.notes}
          </Text>
        ) : null}
      </Card>
      <Text style={[u.heading, { marginBottom: 14 }]}>
        Bills & garment tags
      </Text>
      <View style={s.actionGrid}>
        <View style={u.flex}>
          <Button
            title="Print bill"
            icon="print-outline"
            secondary
            disabled={busy}
            onPress={() => {
              void run(() => printOrder(store, order, "bill"));
            }}
          />
        </View>
        <View style={u.flex}>
          <Button
            title="Print tags"
            icon="qr-code-outline"
            secondary
            disabled={busy}
            onPress={() => {
              void run(() => printOrder(store, order, "tags"));
            }}
          />
        </View>
      </View>
      <View style={s.actionGrid}>
        <View style={u.flex}>
          <Button
            title="Share PDF"
            icon="share-outline"
            secondary
            disabled={busy}
            onPress={() => {
              void run(() => shareBill(store, order));
            }}
          />
        </View>
        <View style={u.flex}>
          <Button
            title="WhatsApp"
            icon="logo-whatsapp"
            disabled={busy}
            onPress={() => {
              void run(() => shareWhatsApp(store, order));
            }}
          />
        </View>
      </View>
      <Text style={[u.small, { marginBottom: 22 }]}>
        Android opens the available print and share apps. Review the WhatsApp
        message before sending.
      </Text>
      <Card>
        <Text style={[u.heading, { marginBottom: 9 }]}>
          Update all garments
        </Text>
        <Text style={[u.small, { marginBottom: 12 }]}>
          Scan an individual tag to update just one piece.
        </Text>
        <Chips
          values={STATUSES}
          value={order.status}
          onChange={(status) => {
            if (!busy) setStatus(status);
          }}
        />
      </Card>
      {balance(order) > 0 && (
        <Card>
          <Text style={[u.heading, { marginBottom: 16 }]}>Record payment</Text>
          <Field
            label="Payment amount (₹)"
            keyboardType="decimal-pad"
            value={payment}
            onChangeText={setPayment}
            placeholder={`Up to ${money(balance(order))}`}
            editable={!busy}
          />
          <Button
            title="Save payment"
            icon="checkmark"
            disabled={busy}
            onPress={recordPayment}
          />
        </Card>
      )}
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showTags ? "Hide garment tags" : "Preview garment tags"
          }
          onPress={() => setShowTags(!showTags)}
          style={u.between}
        >
          <Text style={u.heading}>{tags.length} garment tags</Text>
          <Ionicons
            name={showTags ? "chevron-up" : "chevron-down"}
            size={19}
            color={C.teal}
          />
        </Pressable>
        {showTags && (
          <>
            <Text style={[u.small, { marginVertical: 15 }]}>
              Previewing {Math.min(tags.length, 6)} tags. Print tags includes
              every garment.
            </Text>
            {tags.slice(0, 6).map((tag) => (
              <View key={tag.id} style={s.tagPreview}>
                <QR value={`laundry-lounge:${tag.id}`} size={100} />
                <View style={u.flex}>
                  <Text style={s.customerName}>{tag.item.garment}</Text>
                  <Text style={u.small}>{tag.item.service}</Text>
                  <Text
                    selectable
                    style={[u.small, { marginVertical: 5, fontWeight: "600" }]}
                  >
                    {tag.id}
                  </Text>
                  <StatusBadge status={tag.status} />
                </View>
              </View>
            ))}
          </>
        )}
      </Card>
    </Sheet>
  );
}

const s = StyleSheet.create({
  customerName: { fontSize: 14, fontWeight: "600", color: C.ink },
  service: { fontSize: 12, color: C.muted, marginBottom: 4 },
  rowAmount: { fontSize: 16, fontWeight: "700", color: C.ink },
  steps: { flexDirection: "row", gap: 9, marginBottom: 23 },
  step: {
    flex: 1,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderColor: C.border,
  },
  activeStep: { borderColor: C.teal },
  stepText: { color: C.muted, fontSize: 12, fontWeight: "600" },
  customerChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    borderRadius: 12,
    marginBottom: 10,
  },
  selectedCustomer: { backgroundColor: "#eff8f2", borderColor: "#9acbb6" },
  quantity: { flexDirection: "row", gap: 4, alignItems: "center", flex: 1 },
  quantityButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 44,
    backgroundColor: C.mint,
    borderRadius: 8,
  },
  quantityInput: {
    fontSize: 14,
    color: C.ink,
    width: 44,
    padding: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 7,
    textAlign: "center",
    minHeight: 44,
  },
  actionGrid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  tagPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderColor: C.border,
  },
});
