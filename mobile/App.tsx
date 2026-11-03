import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  balance,
  dateLabel,
  getPayments,
  getTags,
  initials,
  loadStore,
  orderTotal,
  rawSavedData,
  saveStore,
  seedStore,
  STATUSES,
  sumPaymentsInRange,
} from "./src/domain";
import { exportRawBackup, readBackup } from "./src/integrations";
import type { Customer, Order, Store } from "./src/types";
import { C, u, Button, Card, Empty, ErrorText, SectionTitle } from "./src/ui";
import { OrdersScreen, NewOrder, OrderDetail } from "./src/components/Orders";
import Scanner from "./src/components/Scanner";
import {
  CustomersScreen,
  ExpensesScreen,
  ReportsScreen,
  SettingsScreen,
} from "./src/components/Business";
import { money } from "./src/ui";

type Page =
  | "Home"
  | "Orders"
  | "Customers"
  | "More"
  | "Reports"
  | "Expenses"
  | "Settings";
const day = (value = new Date()) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const today = () => day();
const onToday = (iso: string) =>
  day(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) === today();
const pieces = (order: Order) =>
  order.items.reduce((sum, item) => sum + item.quantity, 0);
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Received: { bg: "#edf2fb", fg: "#7596b9" },
  Processing: { bg: "#faf0df", fg: "#b38a4e" },
  Ready: { bg: "#e5f4e8", fg: "#669a6a" },
  Delivered: { bg: "#f1ebf8", fg: "#9b84b6" },
};
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Workspace />
    </SafeAreaProvider>
  );
}
function Workspace() {
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("Home");
  const [newOrder, setNewOrder] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    setError("");
    try {
      setStore(await loadStore());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Saved records could not be read.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (page !== "Home") {
        setPage(
          ["Reports", "Expenses", "Settings"].includes(page) ? "More" : "Home",
        );
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [page]);
  const change = useCallback(async (next: Store) => {
    if (lock.current)
      throw new Error(
        "A save is already in progress. Please try again in a moment.",
      );
    lock.current = true;
    setSaving(true);
    try {
      await saveStore(next);
      setStore(next);
      setToast("Saved on this phone");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }, []);
  const recover = async () => {
    try {
      const backup = await readBackup();
      if (!backup) return;
      Alert.alert(
        "Restore this backup?",
        `Replace the records on this phone with ${backup.orders.length} orders and ${backup.customers.length} customers? Export the original first if you need it.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore backup",
            onPress: () => {
              void change(backup)
                .then(() => setError(""))
                .catch((failure) => setError(failure.message));
            },
          },
        ],
      );
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  if (!store)
    return (
      <SafeAreaView style={u.screen}>
        <View style={{ flex: 1, justifyContent: "center", padding: 28 }}>
          <Image
            source={require("./assets/icon.png")}
            style={{
              width: 100,
              height: 100,
              alignSelf: "center",
              marginBottom: 20,
            }}
          />
          <Text style={[u.title, { textAlign: "center" }]}>Laundry Lounge</Text>
          {error ? (
            <>
              <Text
                style={[
                  u.subtitle,
                  { textAlign: "center", marginVertical: 18 },
                ]}
              >
                Your saved records need attention. Nothing has been overwritten.
              </Text>
              <ErrorText text={error} />
              <Button
                title="Restore a backup"
                icon="cloud-upload-outline"
                onPress={() => void recover()}
              />
              <View style={u.spacer} />
              <Button
                title="Export original data"
                secondary
                icon="share-outline"
                onPress={() => {
                  void rawSavedData()
                    .then((raw) => {
                      if (raw === null)
                        throw new Error("No saved records were found.");
                      return exportRawBackup(raw);
                    })
                    .catch((f) => setError(f.message));
                }}
              />
              <View style={u.spacer} />
              <Button title="Try again" secondary onPress={() => void load()} />
              <Pressable
                style={{ padding: 24, alignItems: "center" }}
                onPress={() =>
                  Alert.alert(
                    "Start with an empty workspace?",
                    "This permanently replaces the saved records on this phone. Export your original data first.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Replace with empty records",
                        style: "destructive",
                        onPress: () => {
                          const blank = seedStore();
                          void change({
                            ...blank,
                            orders: [],
                            customers: [],
                            expenses: [],
                          })
                            .then(() => setError(""))
                            .catch((f) => setError(f.message));
                        },
                      },
                    ],
                  )
                }
              >
                <Text style={u.danger}>Start with empty records</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator
                style={{ marginTop: 25 }}
                size="large"
                color={C.teal}
              />
              <Text style={[u.subtitle, { textAlign: "center" }]}>
                Getting your workspace ready…
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  const selectedOrder = store.orders.find((order) => order.id === selected);
  const hasDemo = store.customers.some((customer) =>
    /^c-[1-8]$/.test(customer.id),
  );
  const tabs = [
    { name: "Home", icon: "grid-outline" },
    { name: "Orders", icon: "bag-handle-outline" },
    { name: "Customers", icon: "people-outline" },
    { name: "More", icon: "ellipsis-horizontal" },
  ] as const;
  const mainPage = ["Reports", "Expenses", "Settings"].includes(page)
    ? "More"
    : page;
  return (
    <SafeAreaView style={u.screen} edges={["top"]}>
      <View style={s.header}>
        <Pressable
          accessibilityLabel={
            page === "Home" ? "Laundry Lounge home" : "Back to home"
          }
          onPress={() =>
            setPage(
              page === "Home"
                ? "Home"
                : ["Reports", "Expenses", "Settings"].includes(page)
                  ? "More"
                  : "Home",
            )
          }
          style={u.row}
        >
          {["Reports", "Expenses", "Settings"].includes(page) ? (
            <Ionicons name="arrow-back" size={24} color={C.teal} />
          ) : (
            <Image
              source={
                store.settings.logo
                  ? { uri: store.settings.logo }
                  : require("./assets/icon.png")
              }
              style={s.logo}
            />
          )}
          <View>
            <Text style={s.brand}>{store.settings.businessName}</Text>
            <Text style={s.brandSub}>
              {page === "Home"
                ? "A LITTLE EXTRA CARE, EVERY DAY"
                : page.toUpperCase()}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Business settings"
          hitSlop={8}
          onPress={() => setPage("Settings")}
          style={s.profile}
        >
          <Text style={s.profileText}>LL</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {page === "Home" ? (
          <ScrollView
            contentContainerStyle={u.body}
            showsVerticalScrollIndicator={false}
          >
            {hasDemo && (
              <Pressable style={s.demo} onPress={() => setPage("Settings")}>
                <View style={s.demoDot} />
                <Text style={s.demoText}>
                  Sample workspace · Make it yours in Settings
                </Text>
                <Ionicons name="arrow-forward" size={13} color={C.muted} />
              </Pressable>
            )}
            <Home
              store={store}
              onNew={() => setNewOrder(true)}
              onScan={() => setScanner(true)}
              onOpen={(order) => setSelected(order.id)}
              onOrders={() => setPage("Orders")}
            />
          </ScrollView>
        ) : page === "Orders" ? (
          <OrdersScreen
            store={store}
            onOpen={(order) => setSelected(order.id)}
            onNew={() => setNewOrder(true)}
          />
        ) : page === "Customers" ? (
          <CustomersScreen store={store} onChange={change} />
        ) : page === "Expenses" ? (
          <ExpensesScreen store={store} onChange={change} />
        ) : page === "Reports" ? (
          <ReportsScreen store={store} onChange={change} />
        ) : page === "Settings" ? (
          <SettingsScreen store={store} onChange={change} onRestore={change} />
        ) : (
          <ScrollView contentContainerStyle={u.body}>
            <SectionTitle
              title="Your daily toolkit."
              subtitle="All the little details, in one place."
            />
            {(
              [
                {
                  page: "Reports",
                  icon: "stats-chart-outline",
                  title: "Business reports",
                  sub: "Collections, services & expenses",
                },
                {
                  page: "Expenses",
                  icon: "wallet-outline",
                  title: "Track expenses",
                  sub: "Keep things balanced",
                },
                {
                  page: "Settings",
                  icon: "settings-outline",
                  title: "Business & backups",
                  sub: "Your logo, details and saved records",
                },
              ] as const
            ).map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item.page}
                onPress={() => setPage(item.page)}
              >
                <Card>
                  <View style={u.row}>
                    <View style={s.toolIcon}>
                      <Ionicons name={item.icon} size={23} color={C.teal} />
                    </View>
                    <View style={u.flex}>
                      <Text style={s.rowTitle}>{item.title}</Text>
                      <Text style={u.small}>{item.sub}</Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color={C.muted}
                    />
                  </View>
                </Card>
              </Pressable>
            ))}
            <Card>
              <Text style={u.heading}>Made for Laundry Lounge</Text>
              <Text style={u.subtitle}>
                This Android app keeps your records on this phone. Export
                regular backups from Settings.
              </Text>
              <View style={u.divider} />
              <Text style={u.small}>
                Scan a garment, update its progress, and keep each order moving.
                Print bills or tags through Android's print menu. Share updates
                through WhatsApp.
              </Text>
            </Card>
          </ScrollView>
        )}
      </View>
      {saving && (
        <View style={s.saving}>
          <ActivityIndicator size="small" color={C.teal} />
          <Text style={u.small}>Saving…</Text>
        </View>
      )}
      <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {tabs.map((tab) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={tab.name}
            accessibilityState={{ selected: mainPage === tab.name }}
            key={tab.name}
            onPress={() => setPage(tab.name)}
            style={s.navItem}
          >
            <View
              style={[
                s.navIcon,
                mainPage === tab.name && { backgroundColor: C.mint },
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                color={mainPage === tab.name ? C.teal : "#9aaea1"}
              />
            </View>
            <Text
              style={[
                s.navLabel,
                mainPage === tab.name && { color: C.teal, fontWeight: "700" },
              ]}
            >
              {tab.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {newOrder && (
        <NewOrder
          store={store}
          onClose={() => setNewOrder(false)}
          onSave={async (order: Order, customer?: Customer) => {
            await change({
              ...store,
              orders: [order, ...store.orders],
              customers: customer
                ? [...store.customers, customer]
                : store.customers,
            });
            setNewOrder(false);
            setSelected(order.id);
            setToast(
              `${order.id} · ${getTags(order).length} garment tags created`,
            );
          }}
        />
      )}
      {selectedOrder && !newOrder && (
        <OrderDetail
          store={store}
          order={selectedOrder}
          onChange={change}
          onClose={() => setSelected(null)}
        />
      )}
      {scanner && (
        <Scanner
          store={store}
          onChange={change}
          onClose={() => setScanner(false)}
        />
      )}
      {toast && (
        <View
          pointerEvents="none"
          style={[s.toast, { bottom: insets.bottom + 82 }]}
        >
          <Ionicons name="checkmark-circle" size={18} color="#bde3cb" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
function Home({
  store,
  onNew,
  onScan,
  onOpen,
  onOrders,
}: {
  store: Store;
  onNew: () => void;
  onScan: () => void;
  onOpen: (order: Order) => void;
  onOrders: () => void;
}) {
  const received = store.orders.filter((order) => onToday(order.createdAt));
  const due = store.orders.filter(
    (order) => onToday(order.dueDate) && order.status !== "Delivered",
  );
  const ready = store.orders.filter((order) => order.status === "Ready");
  const working = store.orders.filter(
    (order) => order.status === "Received" || order.status === "Processing",
  );
  const stats = [
    {
      label: "Today's orders",
      value: String(received.length).padStart(2, "0"),
      sub: `${received.reduce((sum, order) => sum + pieces(order), 0)} garments received`,
      icon: "bag-handle-outline",
      color: "#5c9a7d",
      bg: "#eaf5ed",
    },
    {
      label: "In the works",
      value: String(working.length).padStart(2, "0"),
      sub: "A little care in progress",
      icon: "water-outline",
      color: "#839dba",
      bg: "#edf2fb",
    },
    {
      label: "Ready for pickup",
      value: String(ready.length).padStart(2, "0"),
      sub: "Fresh, folded & good to go",
      icon: "checkmark-done-outline",
      color: "#c09a63",
      bg: "#fcf1e3",
    },
    {
      label: "Collected today",
      value: money(sumPaymentsInRange(store.orders, today(), today())),
      sub: `${store.orders.flatMap(getPayments).filter((p) => onToday(p.paidAt)).length} payments received`,
      icon: "wallet-outline",
      color: "#a18cb6",
      bg: "#f3edf8",
    },
  ] as const;
  return (
    <>
      <Text style={s.eyebrow}>YOUR DAILY OVERVIEW</Text>
      <Text style={u.title}>
        A fresh start.{"\n"}A smoother day
        <Text style={{ color: C.teal }}>.</Text>
      </Text>
      <Text style={u.subtitle}>
        A little less managing. A little more peace of mind.
      </Text>
      <View style={[u.twoColumns, { marginTop: 21, marginBottom: 24 }]}>
        <View style={u.flex}>
          <Button
            title="Scan tag"
            secondary
            icon="scan-outline"
            onPress={onScan}
          />
        </View>
        <View style={u.flex}>
          <Button title="New order" icon="add" onPress={onNew} />
        </View>
      </View>
      <View style={s.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={s.stat}>
            <View style={u.between}>
              <Text style={s.statLabel}>{stat.label}</Text>
              <View style={[s.statIcon, { backgroundColor: stat.bg }]}>
                <Ionicons name={stat.icon} size={19} color={stat.color} />
              </View>
            </View>
            <Text style={s.statValue}>{stat.value}</Text>
            <Text style={[s.statSub, { color: stat.color }]}>{stat.sub}</Text>
          </View>
        ))}
      </View>
      <View style={[u.between, { marginTop: 7, marginBottom: 15 }]}>
        <Text style={u.heading}>Recent orders</Text>
        <Pressable
          onPress={onOrders}
          accessibilityRole="button"
          accessibilityLabel="View all orders"
          style={u.row}
        >
          <Text style={s.link}>View all</Text>
          <Ionicons name="arrow-forward" size={15} color={C.teal} />
        </Pressable>
      </View>
      {!store.orders.length ? (
        <Card>
          <Empty
            title="Your first fresh start"
            text="Create an order to generate its bill and garment tags."
          />
          <Button title="Create your first order" onPress={onNew} />
        </Card>
      ) : (
        store.orders
          .slice(0, 4)
          .map((order) => (
            <OrderCard
              key={order.id}
              store={store}
              order={order}
              onPress={() => onOpen(order)}
            />
          ))
      )}
      <View style={s.care}>
        <Text style={s.careKicker}>✧ THE LAUNDRY LOUNGE WAY</Text>
        <Text style={s.careTitle}>Fresh clothes.{"\n"}Happy people.</Text>
        <Text style={s.careText}>
          You care for the garments.{"\n"}We'll help with the details.
        </Text>
        <Ionicons
          style={s.careArt}
          name="shirt-outline"
          size={90}
          color="#b7ceb0"
        />
      </View>
      <Card>
        <View style={[u.between, { marginBottom: 15 }]}>
          <View style={u.row}>
            <Ionicons name="time-outline" size={19} color={C.muted} />
            <Text style={u.heading}>Due today</Text>
          </View>
          <View style={u.badge}>
            <Text style={u.badgeText}>{due.length}</Text>
          </View>
        </View>
        {due.length ? (
          due.map((order) => {
            const customer = store.customers.find(
              (c) => c.id === order.customerId,
            );
            return (
              <Pressable
                key={order.id}
                onPress={() => onOpen(order)}
                style={u.listRow}
              >
                <View style={u.between}>
                  <View>
                    <Text style={s.rowTitle}>{customer?.name}</Text>
                    <Text style={[u.small, { marginTop: 5 }]}>
                      {order.id} · {pieces(order)} garments
                    </Text>
                  </View>
                  <StatusPill status={order.status} />
                </View>
              </Pressable>
            );
          })
        ) : (
          <Text style={u.small}>All caught up. A fresh slate!</Text>
        )}
      </Card>
      <Card>
        <Text style={u.heading}>Every garment, accounted for.</Text>
        <Text style={u.subtitle}>A smooth flow, from start to finish.</Text>
        <View style={s.workflow}>
          {STATUSES.map((status, index) => (
            <View key={status} style={s.workflowItem}>
              <Ionicons
                name={
                  [
                    "bag-handle-outline",
                    "water-outline",
                    "shirt-outline",
                    "checkmark-done-outline",
                  ][index] as React.ComponentProps<typeof Ionicons>["name"]
                }
                size={22}
                color={STATUS_COLORS[status].fg}
              />
              <View>
                <Text style={{ fontSize: 21, fontWeight: "700", color: C.ink }}>
                  {store.orders
                    .filter((order) => order.status === status)
                    .length.toString()
                    .padStart(2, "0")}
                </Text>
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
      <Text style={s.footer}>Your finest fabric caretaker. ✧</Text>
    </>
  );
}
function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status];
  return (
    <View style={[u.badge, { backgroundColor: colors?.bg }]}>
      <Text style={[u.badgeText, { color: colors?.fg }]}>{status}</Text>
    </View>
  );
}
function OrderCard({
  store,
  order,
  onPress,
}: {
  store: Store;
  order: Order;
  onPress: () => void;
}) {
  const customer = store.customers.find((c) => c.id === order.customerId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${order.id} for ${customer?.name}`}
      onPress={onPress}
    >
      <Card>
        <View style={u.row}>
          <View style={u.avatar}>
            <Text style={u.avatarText}>{initials(customer?.name || "?")}</Text>
          </View>
          <View style={u.flex}>
            <Text style={s.rowTitle}>{customer?.name}</Text>
            <Text style={[u.small, { marginTop: 4 }]}>
              {order.id} · {pieces(order)} garments
            </Text>
          </View>
          <StatusPill status={order.status} />
        </View>
        <View style={[u.between, { marginTop: 17, marginLeft: 54 }]}>
          <View style={u.flex}>
            <Text style={u.small}>{order.items[0]?.service}</Text>
            <Text style={[u.small, { fontSize: 11, marginTop: 3 }]}>
              {onToday(order.dueDate)
                ? "Due today"
                : `Due ${dateLabel(order.dueDate)}`}
              {order.express ? " · Express" : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.ink }}>
              {money(orderTotal(order))}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: balance(order) > 0 ? C.orange : "#6e9e78",
                marginTop: 5,
              }}
            >
              {balance(order) > 0 ? "Payment due" : "Paid"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color="#b1c1ae" />
        </View>
      </Card>
    </Pressable>
  );
}
const s = StyleSheet.create({
  header: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { width: 43, height: 43, resizeMode: "contain" },
  brand: { fontSize: 17, fontWeight: "800", color: C.ink, letterSpacing: -0.4 },
  brandSub: { fontSize: 7, letterSpacing: 1.3, color: "#8da38f", marginTop: 5 },
  profile: {
    width: 33,
    height: 33,
    borderRadius: 17,
    backgroundColor: "#f4ecdf",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fbf9f4",
  },
  profileText: { fontSize: 10, color: "#ad9676", fontWeight: "700" },
  nav: {
    paddingTop: 9,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
  },
  navItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 2 },
  navIcon: {
    width: 47,
    height: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 10, color: "#91a58e" },
  demo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  demoDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#a1b294" },
  demoText: { fontSize: 9, color: "#8b9f81", flex: 1 },
  eyebrow: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.7,
    color: "#91a588",
    marginBottom: 12,
  },
  stats: { flexDirection: "row", gap: 12, flexWrap: "wrap", marginBottom: 19 },
  stat: {
    width: "48%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    padding: 16,
    minHeight: 140,
  },
  statLabel: { fontSize: 10, color: C.muted },
  statIcon: {
    height: 31,
    width: 31,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 30,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -1,
    marginTop: 10,
  },
  statSub: { fontSize: 9, marginTop: 13, lineHeight: 14 },
  link: { fontSize: 12, fontWeight: "600", color: C.teal },
  rowTitle: { fontSize: 14, fontWeight: "600", color: C.ink },
  care: {
    backgroundColor: "#eaf1e3",
    borderColor: "#deead7",
    borderWidth: 1,
    borderRadius: 16,
    padding: 23,
    marginTop: 5,
    marginBottom: 20,
    overflow: "hidden",
  },
  careKicker: {
    fontSize: 7,
    letterSpacing: 1.4,
    color: "#91a282",
    marginBottom: 15,
  },
  careTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: "#536f4b",
    lineHeight: 31,
  },
  careText: { fontSize: 12, color: "#8d9f7f", lineHeight: 19, marginTop: 13 },
  careArt: {
    position: "absolute",
    right: 20,
    bottom: 21,
    transform: [{ rotate: "-10deg" }],
  },
  workflow: { flexDirection: "row", flexWrap: "wrap", gap: 26, marginTop: 23 },
  workflowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "44%",
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    color: "#a1b195",
    marginTop: 9,
    marginBottom: 12,
  },
  toolIcon: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 11,
    backgroundColor: "#285240",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  toastText: { color: "#e8f4e7", fontSize: 12, flex: 1 },
  saving: {
    position: "absolute",
    right: 18,
    top: 69,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    padding: 8,
    backgroundColor: C.white,
    borderRadius: 8,
  },
});
