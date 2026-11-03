import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { Customer, Expense, Settings, Store } from "../types";
import { balance, initials, orderTotal, sumPaymentsInRange } from "../domain";
import { exportBackup, readBackup } from "../integrations";
import {
  Button,
  Card,
  Chips,
  Empty,
  ErrorText,
  Field,
  DateField,
  SectionTitle,
  Sheet,
  C,
  money,
  u,
} from "../ui";

type Props = { store: Store; onChange: (next: Store) => Promise<void> };
const categories = [
  "Supplies",
  "Utilities",
  "Rent",
  "Salaries",
  "Maintenance",
  "Transport",
  "Other",
] as const;
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dayOf = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(new Date(date));
function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}
function phoneKey(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}
const failure = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
function confirm(
  title: string,
  message: string,
  action: string,
): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: action, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
function Stat({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <Text style={u.label}>{title}</Text>
      <Text style={u.amount}>{value}</Text>
      {note && <Text style={u.small}>{note}</Text>}
    </Card>
  );
}
function Page({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={u.body}
    >
      {children}
    </ScrollView>
  );
}
const emptyCustomer = { name: "", phone: "", email: "", address: "" };

export function CustomersScreen({ store, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [form, setForm] = useState(emptyCustomer);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const filtered = store.customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.email ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  function open(customer?: Customer) {
    setForm(
      customer
        ? {
            name: customer.name,
            phone: customer.phone,
            email: customer.email ?? "",
            address: customer.address ?? "",
          }
        : emptyCustomer,
    );
    setEditing(customer ?? "new");
    setError("");
  }
  const patch = (key: keyof typeof emptyCustomer, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  async function save() {
    if (lock.current) return;
    setError("");
    const digits = form.phone.replace(/\D/g, "");
    if (form.name.trim().length < 2)
      return setError("Enter a name with at least two characters.");
    if (
      !/^\+?[\d\s()-]+$/.test(form.phone.trim()) ||
      digits.length < 10 ||
      digits.length > 15
    )
      return setError("Enter a phone number with 10–15 digits.");
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    )
      return setError("Enter a valid email address or leave it empty.");
    const id = editing && editing !== "new" ? editing.id : randomUUID();
    if (
      store.customers.some(
        (customer) =>
          customer.id !== id &&
          phoneKey(customer.phone) === phoneKey(form.phone),
      )
    )
      return setError("A customer with this phone number already exists.");
    const customer: Customer = {
      id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
    };
    lock.current = true;
    setBusy(true);
    try {
      await onChange({
        ...store,
        customers:
          editing === "new"
            ? [...store.customers, customer]
            : store.customers.map((item) => (item.id === id ? customer : item)),
      });
      setEditing(null);
    } catch (error) {
      setError(failure(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Page>
        <SectionTitle
          title="Familiar faces."
          subtitle="Every customer, a little extra care."
        />
        <View style={u.twoColumns}>
          <View style={u.flex}>
            <Stat title="Customers" value={String(store.customers.length)} />
          </View>
          <View style={u.flex}>
            <Stat
              title="Outstanding"
              value={money(
                store.orders.reduce((sum, order) => sum + balance(order), 0),
              )}
            />
          </View>
        </View>
        <Button
          title="Add customer"
          icon="person-add-outline"
          onPress={() => open()}
        />
        <View style={u.spacer} />
        <Field
          label="Search customers"
          placeholder="Name or mobile number"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {filtered.map((customer) => {
          const orders = store.orders.filter(
            (order) => order.customerId === customer.id,
          );
          const outstanding = orders.reduce(
            (sum, order) => sum + balance(order),
            0,
          );
          return (
            <Pressable
              key={customer.id}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${customer.name}`}
              onPress={() => open(customer)}
            >
              <Card>
                <View style={u.row}>
                  <View style={u.avatar}>
                    <Text style={u.avatarText}>{initials(customer.name)}</Text>
                  </View>
                  <View style={u.flex}>
                    <Text style={[u.heading, { fontSize: 16 }]}>
                      {customer.name}
                    </Text>
                    <Text style={u.small}>{customer.phone}</Text>
                  </View>
                  <Ionicons name="create-outline" size={20} color={C.muted} />
                </View>
                <View style={[u.between, { marginTop: 15 }]}>
                  <Text style={u.small}>{orders.length} orders</Text>
                  <Text
                    style={{
                      color: outstanding ? C.orange : C.teal,
                      fontWeight: "600",
                      fontSize: 12,
                    }}
                  >
                    {outstanding ? `${money(outstanding)} due` : "All settled"}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
        {!filtered.length && (
          <Empty
            title={
              search ? "No matching customers" : "Your first familiar face"
            }
            text={
              search
                ? "Try another name or phone number."
                : "Add a customer to begin their first order."
            }
          />
        )}
      </Page>
      {editing && (
        <Sheet
          title={editing === "new" ? "Add customer" : "Edit customer"}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          footer={
            <Button
              title={busy ? "Saving…" : "Save customer"}
              disabled={busy}
              onPress={() => {
                void save();
              }}
            />
          }
        >
          <Field
            label="Full name"
            value={form.name}
            onChangeText={(value) => patch("name", value)}
            maxLength={100}
            autoCapitalize="words"
            autoFocus
          />
          <Field
            label="Phone number"
            value={form.phone}
            onChangeText={(value) => patch("phone", value)}
            keyboardType="phone-pad"
            maxLength={22}
            placeholder="e.g. +91 98765 43210"
          />
          <Field
            label="Email (optional)"
            value={form.email}
            onChangeText={(value) => patch("email", value)}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={150}
          />
          <Field
            label="Address (optional)"
            value={form.address}
            onChangeText={(value) => patch("address", value)}
            multiline
            maxLength={500}
          />
          <ErrorText text={error} />
        </Sheet>
      )}
    </>
  );
}

export function ExpensesScreen({ store, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [form, setForm] = useState({
    title: "",
    amount: "",
    date: localDate(),
    category: "Supplies",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const month = localDate().slice(0, 7);
  const monthExpenses = store.expenses.filter((expense) =>
    dayOf(expense.date).startsWith(month),
  );
  const filtered = store.expenses
    .filter(
      (expense) =>
        (category === "All" || expense.category === category) &&
        `${expense.title} ${expense.category}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const allCategories = [
    "All",
    ...new Set([
      ...categories,
      ...store.expenses.map((expense) => expense.category),
    ]),
  ];
  const patch = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  async function save() {
    if (lock.current) return;
    const amount = Number(form.amount);
    setError("");
    if (!form.title.trim()) return setError("Describe this expense.");
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 10000000 ||
      !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(form.amount.trim())
    )
      return setError(
        "Enter an amount above zero, with up to two decimal places.",
      );
    if (!validDay(form.date))
      return setError("Enter a valid date in YYYY-MM-DD format.");
    const expense: Expense = {
      id: randomUUID(),
      title: form.title.trim(),
      category: form.category,
      amount: Math.round(amount * 100) / 100,
      date: form.date,
    };
    lock.current = true;
    setBusy(true);
    try {
      await onChange({ ...store, expenses: [expense, ...store.expenses] });
      setAdding(false);
    } catch (error) {
      setError(failure(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Page>
        <SectionTitle
          title="Keep things balanced."
          subtitle="Everyday expenses, all accounted for."
        />
        <Stat
          title="Spent this month"
          value={money(
            monthExpenses.reduce((sum, expense) => sum + expense.amount, 0),
          )}
          note={`${monthExpenses.length} expenses · ${new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`}
        />
        <Button
          title="Record expense"
          icon="add-outline"
          onPress={() => {
            setForm({
              title: "",
              amount: "",
              date: localDate(),
              category: "Supplies",
            });
            setError("");
            setAdding(true);
          }}
        />
        <View style={u.spacer} />
        <Field
          label="Search expenses"
          placeholder="Description or category"
          value={search}
          onChangeText={setSearch}
        />
        <Chips values={allCategories} value={category} onChange={setCategory} />
        {filtered.map((expense) => (
          <Card key={expense.id}>
            <View style={u.between}>
              <View style={u.flex}>
                <Text style={[u.heading, { fontSize: 15 }]}>
                  {expense.title}
                </Text>
                <Text style={u.small}>
                  {expense.category} · {dayOf(expense.date)}
                </Text>
              </View>
              <Text style={{ fontSize: 16, color: C.ink, fontWeight: "700" }}>
                {money(expense.amount)}
              </Text>
            </View>
          </Card>
        ))}
        {!filtered.length && (
          <Empty
            title="No expenses here yet"
            text="Record an expense or try another filter."
          />
        )}
        {!!filtered.length && (
          <Text style={[u.small, { textAlign: "right" }]}>
            Shown total{" "}
            {money(filtered.reduce((sum, expense) => sum + expense.amount, 0))}
          </Text>
        )}
      </Page>
      {adding && (
        <Sheet
          title="Record expense"
          onClose={() => {
            if (!busy) setAdding(false);
          }}
          footer={
            <Button
              title={busy ? "Saving…" : "Save expense"}
              disabled={busy}
              onPress={() => {
                void save();
              }}
            />
          }
        >
          <Field
            label="Description"
            value={form.title}
            onChangeText={(value) => patch("title", value)}
            placeholder="e.g. Laundry detergent"
            autoFocus
            maxLength={150}
          />
          <Field
            label="Amount (₹)"
            value={form.amount}
            onChangeText={(value) => patch("amount", value)}
            keyboardType="decimal-pad"
            placeholder="0.00"
            maxLength={13}
          />
          <View pointerEvents={busy ? "none" : "auto"}>
            <DateField
              label="Expense date"
              value={form.date}
              onChange={(value) => patch("date", value)}
            />
          </View>
          <Text style={u.label}>Category</Text>
          <Chips
            values={categories}
            value={form.category}
            onChange={(value) => patch("category", value)}
          />
          <ErrorText text={error} />
        </Sheet>
      )}
    </>
  );
}

export function ReportsScreen({ store }: Props) {
  const [from, setFrom] = useState(`${localDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(localDate());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const valid = validDay(from) && validDay(to) && from <= to;
  const orders = valid
    ? store.orders.filter((order) => {
        const day = dayOf(order.createdAt);
        return day >= from && day <= to;
      })
    : [];
  const expenses = valid
    ? store.expenses.filter((expense) => {
        const day = dayOf(expense.date);
        return day >= from && day <= to;
      })
    : [];
  const collected = valid ? sumPaymentsInRange(store.orders, from, to) : 0;
  const billed = orders.reduce((sum, order) => sum + orderTotal(order), 0);
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const services = [
    "Wash & Fold",
    "Wash & Iron",
    "Dry Cleaning",
    "Steam Iron",
  ].map((service) => ({
    name: service,
    amount: orders.reduce(
      (sum, order) =>
        sum +
        order.items
          .filter((item) => item.service === service)
          .reduce((subtotal, item) => subtotal + item.price * item.quantity, 0),
      0,
    ),
  }));
  const expenseTotals = [
    ...new Set(expenses.map((expense) => expense.category)),
  ]
    .map((name) => ({
      name,
      amount: expenses
        .filter((expense) => expense.category === name)
        .reduce((sum, expense) => sum + expense.amount, 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  async function shareCsv() {
    if (lock.current || !valid || !orders.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
        throw new Error("File sharing is unavailable on this phone.");
      const escape = (value: unknown) => {
        const raw = String(value ?? "");
        const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const rows = [
        [
          "Order",
          "Customer",
          "Created",
          "Due",
          "Status",
          "Garments",
          "Billed INR",
          "Total paid INR",
          "Current outstanding INR",
        ],
        ...orders.map((order) => [
          order.id,
          store.customers.find((customer) => customer.id === order.customerId)
            ?.name ?? "",
          dayOf(order.createdAt),
          dayOf(order.dueDate),
          order.status,
          order.items.reduce((sum, item) => sum + item.quantity, 0),
          orderTotal(order),
          order.paid,
          balance(order),
        ]),
      ];
      const uri = `${FileSystem.cacheDirectory}laundry-lounge-orders-${from}-${to}.csv`;
      await FileSystem.writeAsStringAsync(
        uri,
        "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n"),
      );
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Share Laundry Lounge report",
      });
    } catch (error) {
      setError(failure(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Page>
      <SectionTitle
        title="The bigger picture."
        subtitle="A clearer view of your lounge."
      />
      <Card>
        <DateField
          label="From"
          value={from}
          onChange={(value) => {
            setFrom(value);
            if (value > to) setTo(value);
          }}
        />
        <DateField
          label="To"
          value={to}
          minimumDate={new Date(`${from}T00:00:00`)}
          onChange={setTo}
        />
        {!valid && (
          <ErrorText text="Choose valid dates, with the end on or after the start." />
        )}
        <Text style={u.small}>
          Collections use actual payment dates, including payments on earlier
          orders.
        </Text>
      </Card>
      <View style={u.twoColumns}>
        <View style={u.flex}>
          <Stat title="Collected" value={money(collected)} />
        </View>
        <View style={u.flex}>
          <Stat title="Expenses" value={money(spent)} />
        </View>
      </View>
      <Stat
        title="Cash after expenses"
        value={money(collected - spent)}
        note="Collected payments minus recorded expenses"
      />
      <Card>
        <Text style={u.heading}>Orders placed in this period</Text>
        <View style={[u.between, { marginTop: 16 }]}>
          <Text style={u.small}>{orders.length} orders billed</Text>
          <Text style={{ color: C.ink, fontWeight: "700" }}>
            {money(billed)}
          </Text>
        </View>
        <View style={[u.between, { marginTop: 10 }]}>
          <Text style={u.small}>Current outstanding</Text>
          <Text style={{ color: C.orange, fontWeight: "600" }}>
            {money(orders.reduce((sum, order) => sum + balance(order), 0))}
          </Text>
        </View>
      </Card>
      <Card>
        <Text style={u.heading}>Service mix</Text>
        <Text style={u.small}>Garment value before order discounts</Text>
        {services.map((service) => (
          <View key={service.name} style={{ marginTop: 18 }}>
            <View style={u.between}>
              <Text style={u.small}>{service.name}</Text>
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: "600" }}>
                {money(service.amount)}
              </Text>
            </View>
            <View
              style={{
                marginTop: 7,
                height: 8,
                borderRadius: 4,
                backgroundColor: C.bg,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${(service.amount / Math.max(...services.map((item) => item.amount), 1)) * 100}%`,
                  backgroundColor: C.teal,
                  height: "100%",
                  borderRadius: 4,
                }}
              />
            </View>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={u.heading}>Where money goes</Text>
        {expenseTotals.map((expense) => (
          <View key={expense.name} style={{ marginTop: 16 }}>
            <View style={u.between}>
              <Text style={u.small}>{expense.name}</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.ink }}>
                {money(expense.amount)}
              </Text>
            </View>
            <View
              style={{
                height: 7,
                backgroundColor: "#fbf3e7",
                borderRadius: 4,
                marginTop: 7,
              }}
            >
              <View
                style={{
                  width: `${(expense.amount / Math.max(spent, 1)) * 100}%`,
                  height: "100%",
                  backgroundColor: "#d3ab74",
                  borderRadius: 4,
                }}
              />
            </View>
          </View>
        ))}
        {!expenseTotals.length && (
          <Text style={[u.small, { marginTop: 16 }]}>
            No expenses in this period.
          </Text>
        )}
      </Card>
      <Button
        title={busy ? "Preparing report…" : "Share order CSV"}
        icon="share-outline"
        secondary
        disabled={busy || !valid || !orders.length}
        onPress={() => {
          void shareCsv();
        }}
      />
      <View style={u.spacer} />
      <ErrorText text={error} />
      <Text style={u.small}>
        CSV lists orders placed in the selected period and their current
        balances. These operational totals do not replace tax or accounting
        records.
      </Text>
    </Page>
  );
}

export function SettingsScreen({
  store,
  onChange,
  onRestore,
}: Props & { onRestore?: (next: Store) => Promise<void> }) {
  const [settings, setSettings] = useState<Settings>(store.settings);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    setSettings(store.settings);
  }, [store.settings]);
  const patch = (key: keyof Settings, value: string) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setMessage("");
  };
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError(failure(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    await run(async () => {
      if (!settings.businessName.trim())
        throw new Error("Enter your business name.");
      if (
        settings.phone.trim() &&
        (settings.phone.replace(/\D/g, "").length < 10 ||
          settings.phone.replace(/\D/g, "").length > 15)
      )
        throw new Error(
          "Enter a business phone number with 10–15 digits, or leave it empty.",
        );
      await onChange({
        ...store,
        settings: {
          ...settings,
          businessName: settings.businessName.trim(),
          phone: settings.phone.trim(),
          address: settings.address.trim(),
        },
      });
      setMessage("Business details saved on this phone.");
    });
  }
  async function chooseLogo() {
    await run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 1,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mime =
        asset.mimeType ??
        (/\.png$/i.test(asset.fileName ?? "")
          ? "image/png"
          : /\.jpe?g$/i.test(asset.fileName ?? "")
            ? "image/jpeg"
            : /\.webp$/i.test(asset.fileName ?? "")
              ? "image/webp"
              : "");
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(mime) ||
        !asset.base64
      )
        throw new Error("Choose a PNG, JPG or WebP logo.");
      if (
        (asset.fileSize ?? 0) > 2 * 1024 * 1024 ||
        asset.base64.length * 0.75 > 2 * 1024 * 1024
      )
        throw new Error("Choose a logo under 2 MB.");
      setSettings((previous) => ({
        ...previous,
        logo: `data:${mime};base64,${asset.base64}`,
      }));
      setMessage("Logo selected. Save business details to apply it.");
    });
  }
  async function restore() {
    await run(async () => {
      const next = await readBackup();
      if (!next) return;
      const accepted = await confirm(
        "Replace this phone’s records?",
        `This backup contains ${next.orders.length} orders, ${next.customers.length} customers and ${next.expenses.length} expenses. Current records will be replaced. Export a backup first if needed.`,
        "Replace and restore",
      );
      if (!accepted) return;
      await (onRestore ?? onChange)(next);
      setMessage("Backup restored successfully.");
    });
  }
  async function clear() {
    await run(async () => {
      if (
        !(await confirm(
          "Clear all business records?",
          "This removes EVERY customer, order and expense on this phone, including real records you entered. Business settings and logo are kept. Export a backup before continuing.",
          "Clear all records",
        ))
      )
        return;
      await (onRestore ?? onChange)({
        ...store,
        customers: [],
        orders: [],
        expenses: [],
      });
      setMessage("Records cleared. Ready for your first real order.");
    });
  }
  return (
    <Page>
      <SectionTitle
        title="Make yourself at home."
        subtitle="One app, made for Laundry Lounge."
      />
      <ErrorText text={error} />
      {message ? (
        <Text accessibilityRole="alert" style={u.success}>
          {message}
        </Text>
      ) : null}
      <Card>
        <Text style={u.heading}>Business details</Text>
        <Text style={u.subtitle}>
          Used on bills, tags and customer messages.
        </Text>
        <View style={{ marginTop: 20, marginBottom: 18 }}>
          {settings.logo ? (
            <Image
              accessibilityLabel="Business logo"
              source={{ uri: settings.logo }}
              style={{
                width: 130,
                height: 95,
                resizeMode: "contain",
                marginBottom: 14,
              }}
            />
          ) : (
            <View
              style={[u.avatar, { width: 60, height: 60, marginBottom: 14 }]}
            >
              <Ionicons name="image-outline" size={26} color={C.teal} />
            </View>
          )}
          <Button
            title="Choose original logo"
            icon="image-outline"
            secondary
            disabled={busy}
            onPress={() => {
              void chooseLogo();
            }}
          />
          <Text style={[u.small, { marginTop: 8 }]}>
            PNG, JPG or WebP · up to 2 MB
          </Text>
        </View>
        <Field
          label="Business name"
          value={settings.businessName}
          onChangeText={(value) => patch("businessName", value)}
          maxLength={100}
          editable={!busy}
        />
        <Field
          label="Business phone"
          value={settings.phone}
          onChangeText={(value) => patch("phone", value)}
          keyboardType="phone-pad"
          maxLength={22}
          editable={!busy}
        />
        <Field
          label="Business address"
          value={settings.address}
          onChangeText={(value) => patch("address", value)}
          multiline
          maxLength={500}
          editable={!busy}
        />
        <Field
          label="Receipt footer"
          value={settings.receiptFooter}
          onChangeText={(value) => patch("receiptFooter", value)}
          maxLength={250}
          editable={!busy}
        />
        <Button
          title={busy ? "Please wait…" : "Save business details"}
          disabled={busy}
          onPress={() => {
            void save();
          }}
        />
      </Card>
      <Card>
        <Text style={u.heading}>Your data, in your hands</Text>
        <Text style={u.subtitle}>
          Saved locally on this Android phone. Export regular backups using
          Android’s share controls.
        </Text>
        <View style={u.spacer} />
        <Button
          title="Export backup"
          icon="download-outline"
          secondary
          disabled={busy}
          onPress={() => {
            void run(async () => {
              await exportBackup(store);
            });
          }}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Restore backup"
          icon="cloud-upload-outline"
          secondary
          disabled={busy}
          onPress={() => {
            void restore();
          }}
        />
        <Text style={[u.small, { marginTop: 14 }]}>
          Backups contain customer information. Keep them private. This app does
          not currently sync between phones. Uninstalling the app removes its
          local records.
        </Text>
      </Card>
      <Card>
        <Text style={u.heading}>Printing & WhatsApp</Text>
        <Text style={u.subtitle}>
          Bills and garment tags open Android’s print controls. Use a compatible
          printer or save a PDF. Dedicated Bluetooth printer drivers are not
          included.
        </Text>
        <Text style={u.subtitle}>
          WhatsApp opens a prepared customer message for you to review and send.
          Background sending requires a separate WhatsApp Business API
          connection.
        </Text>
      </Card>
      <Card>
        <Text style={u.heading}>Start fresh</Text>
        <Text style={u.subtitle}>
          Remove the sample records before using Laundry Lounge for real
          business. This action removes real records too.
        </Text>
        <View style={u.spacer} />
        <Button
          title="Clear all records"
          secondary
          disabled={busy}
          onPress={() => {
            void clear();
          }}
        />
      </Card>
      <Text style={[u.small, { textAlign: "center" }]}>
        Laundry Lounge · Android · Version 1.0.0
      </Text>
    </Page>
  );
}
