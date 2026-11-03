import type {
  Customer,
  LineItem,
  Order,
  Payment,
  Service,
  Status,
  Store,
  Tag,
} from "./types";

export const STORAGE_KEY = "laundry-lounge-android-v1";
export const STATUSES: Status[] = [
  "Received",
  "Processing",
  "Ready",
  "Delivered",
];
export const SERVICES: Service[] = [
  "Wash & Fold",
  "Wash & Iron",
  "Dry Cleaning",
  "Steam Iron",
];
const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (amount: number): string => rupees.format(amount);
export const orderTotal = (order: Order): number =>
  rounded(
    Math.max(
      0,
      order.items.reduce(
        (total, item) => total + item.quantity * item.price,
        0,
      ) - order.discount,
    ),
  );
export const balance = (order: Order): number =>
  rounded(Math.max(0, orderTotal(order) - order.paid));
/** Older backups have only a total: conservatively retain it on the order's creation day. */
export function getPayments(order: Order): Payment[] {
  return (
    order.payments ??
    (order.paid > 0
      ? [
          {
            id: `${order.id}-legacy-payment`,
            amount: order.paid,
            paidAt: order.createdAt,
          },
        ]
      : [])
  );
}
export function sumPaymentsInRange(
  orders: Order[],
  fromDate: string,
  toDate: string,
): number {
  const localDay = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  return rounded(
    orders.reduce(
      (total, order) =>
        total +
        getPayments(order).reduce((sum, payment) => {
          const day = localDay(payment.paidAt);
          return sum + (day >= fromDate && day <= toDate ? payment.amount : 0);
        }, 0),
      0,
    ),
  );
}
export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
export function dateLabel(iso: string): string {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso,
  );
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
export function nextOrderId(orders: Order[]): string {
  const max = orders.reduce((value, order) => {
    const match = /^LL-(\d+)$/.exec(order.id);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 1000);
  return `LL-${max + 1}`;
}
export function getTags(order: Order): Tag[] {
  return order.items.flatMap((item, index) =>
    Array.from({ length: item.quantity }, (_, unit) => {
      const id = `${order.id}-${index + 1}-${unit + 1}`;
      return {
        id,
        orderId: order.id,
        item,
        number: unit + 1,
        status: order.tagStatuses[id] ?? order.status,
      };
    }),
  );
}
export function parseTagInput(raw: string): string {
  const value = raw
    .trim()
    .replace(/^laundry-lounge:/i, "")
    .toUpperCase();
  return /^LL-\d+-\d+-\d+$/.test(value) ? value : "";
}
export function updateTagStatus(
  store: Store,
  tagId: string,
  status: Status,
): Store {
  if (!STATUSES.includes(status))
    throw new Error("Choose a valid garment status.");
  const parsed = parseTagInput(tagId);
  const orderId = /^(LL-\d+)-/.exec(parsed)?.[1];
  const order = store.orders.find(
    (candidate) =>
      candidate.id === orderId &&
      getTags(candidate).some((tag) => tag.id === parsed),
  );
  if (!order)
    throw new Error(
      "This garment tag was not found. Check the tag number and try again.",
    );
  const tags = getTags(order).map((tag) => ({
    ...tag,
    status: tag.id === parsed ? status : tag.status,
  }));
  const tagStatuses = Object.fromEntries(
    tags.map((tag) => [tag.id, tag.status]),
  );
  const orderStatus =
    STATUSES[Math.min(...tags.map((tag) => STATUSES.indexOf(tag.status)))];
  return {
    ...store,
    orders: store.orders.map((candidate) =>
      candidate.id === order.id
        ? { ...candidate, tagStatuses, status: orderStatus }
        : candidate,
    ),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const text = (value: unknown): value is string =>
  string(value) && value.trim().length > 0;
const optionalString = (value: unknown) => value === undefined || string(value);
const amount = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1_000_000_000;
const validDate = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const status = (value: unknown): value is Status =>
  STATUSES.includes(value as Status);
const unique = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
function validCustomer(value: unknown): value is Customer {
  return (
    isRecord(value) &&
    text(value.id) &&
    text(value.name) &&
    string(value.phone) &&
    optionalString(value.email) &&
    optionalString(value.address)
  );
}
function validItem(value: unknown): value is LineItem {
  return (
    isRecord(value) &&
    text(value.id) &&
    text(value.garment) &&
    SERVICES.includes(value.service as Service) &&
    Number.isInteger(value.quantity) &&
    (value.quantity as number) > 0 &&
    (value.quantity as number) <= 1000 &&
    amount(value.price) &&
    optionalString(value.note)
  );
}
/** Validate backups before importing: reject malformed records and broken references. */
export function validateStore(value: unknown): value is Store {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.customers) ||
    !Array.isArray(value.orders) ||
    !Array.isArray(value.expenses) ||
    !isRecord(value.settings)
  )
    return false;
  if (
    value.customers.length > 100_000 ||
    value.orders.length > 100_000 ||
    value.expenses.length > 100_000
  )
    return false;
  if (!value.customers.every(validCustomer) || !unique(value.customers))
    return false;
  const customerIds = new Set(value.customers.map((customer) => customer.id));
  for (const order of value.orders) {
    if (
      !isRecord(order) ||
      !text(order.id) ||
      !/^LL-\d+$/.test(order.id) ||
      !text(order.customerId) ||
      !customerIds.has(order.customerId) ||
      !Array.isArray(order.items) ||
      !order.items.length ||
      !order.items.every(validItem) ||
      !unique(order.items) ||
      !validDate(order.createdAt) ||
      !validDate(order.dueDate) ||
      !status(order.status) ||
      !amount(order.paid) ||
      !amount(order.discount) ||
      typeof order.express !== "boolean" ||
      !string(order.notes) ||
      !isRecord(order.tagStatuses)
    )
      return false;
    if (order.items.reduce((sum, item) => sum + item.quantity, 0) > 10_000)
      return false;
    if (order.payments !== undefined) {
      if (
        !Array.isArray(order.payments) ||
        !order.payments.every(
          (payment) =>
            isRecord(payment) &&
            text(payment.id) &&
            amount(payment.amount) &&
            validDate(payment.paidAt),
        ) ||
        !unique(order.payments)
      )
        return false;
      if (
        rounded(
          order.payments.reduce((sum, payment) => sum + payment.amount, 0),
        ) !== rounded(order.paid)
      )
        return false;
    }
    const tags = new Set(
      getTags(order as unknown as Order).map((tag) => tag.id),
    );
    if (
      !Object.entries(order.tagStatuses).every(
        ([id, state]) => tags.has(id) && status(state),
      )
    )
      return false;
  }
  if (!unique(value.orders)) return false;
  if (
    !value.expenses.every(
      (expense) =>
        isRecord(expense) &&
        text(expense.id) &&
        text(expense.title) &&
        text(expense.category) &&
        amount(expense.amount) &&
        validDate(expense.date),
    ) ||
    !unique(value.expenses)
  )
    return false;
  const settings = value.settings;
  return (
    text(settings.businessName) &&
    string(settings.phone) &&
    string(settings.address) &&
    settings.currency === "INR" &&
    string(settings.receiptFooter) &&
    optionalString(settings.logo) &&
    (settings.logo === undefined ||
      ((settings.logo as string).length <= 8_000_000 &&
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          settings.logo as string,
        )))
  );
}

export function seedStore(): Store {
  const at = (days: number, hour = 10, minute = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const customers: Customer[] = [
    {
      id: "c-1",
      name: "Aarav Sharma",
      phone: "9876543210",
      email: "aarav@example.com",
      address: "Baner, Pune",
    },
    {
      id: "c-2",
      name: "Priya Patel",
      phone: "9876543211",
      address: "Aundh, Pune",
    },
    {
      id: "c-3",
      name: "Rohan Deshmukh",
      phone: "9876543212",
      address: "Balewadi, Pune",
    },
    {
      id: "c-4",
      name: "Ananya Joshi",
      phone: "9876543213",
      address: "Baner, Pune",
    },
    {
      id: "c-5",
      name: "Vikram Mehta",
      phone: "9876543214",
      address: "Wakad, Pune",
    },
    {
      id: "c-6",
      name: "Sneha Kulkarni",
      phone: "9876543215",
      address: "Pashan, Pune",
    },
    {
      id: "c-7",
      name: "Neha Shah",
      phone: "9876543216",
      address: "Aundh, Pune",
    },
    {
      id: "c-8",
      name: "Arjun Rao",
      phone: "9876543217",
      address: "Baner, Pune",
    },
  ];
  const item = (
    garment: string,
    service: Service,
    quantity: number,
    price: number,
    index = 1,
  ): LineItem => ({ id: `item-${index}`, garment, service, quantity, price });
  const order = (
    index: number,
    customerId: string,
    status: Status,
    items: LineItem[],
    due: number,
    paid = 0,
    created = 0,
    express = false,
  ): Order => ({
    id: `LL-${1048 - index}`,
    customerId,
    items,
    createdAt: at(
      created,
      11 - Math.floor(index / 3),
      (45 - index * 3 + 60) % 60,
    ),
    dueDate: at(due, 18),
    status,
    paid,
    payments:
      paid > 0
        ? [
            {
              id: `payment-${1048 - index}`,
              amount: paid,
              paidAt: at(
                created,
                11 - Math.floor(index / 3),
                (45 - index * 3 + 60) % 60,
              ),
            },
          ]
        : [],
    discount: 0,
    express,
    notes: "",
    tagStatuses: {},
  });
  return {
    version: 1,
    customers,
    orders: [
      order(
        0,
        "c-1",
        "Received",
        [
          item("Shirt", "Wash & Iron", 4, 65),
          item("Trousers", "Wash & Iron", 2, 80, 2),
        ],
        2,
        200,
      ),
      order(
        1,
        "c-2",
        "Processing",
        [item("Silk saree", "Dry Cleaning", 2, 250)],
        0,
        500,
        0,
        true,
      ),
      order(
        2,
        "c-3",
        "Ready",
        [
          item("T-shirt", "Wash & Fold", 6, 40),
          item("Jeans", "Wash & Fold", 2, 80, 2),
        ],
        0,
        0,
      ),
      order(
        3,
        "c-4",
        "Processing",
        [
          item("Blazer", "Dry Cleaning", 1, 350),
          item("Trousers", "Dry Cleaning", 2, 150, 2),
        ],
        1,
        300,
      ),
      order(4, "c-5", "Ready", [item("Shirt", "Steam Iron", 8, 30)], 0, 240),
      order(
        5,
        "c-6",
        "Received",
        [
          item("Bedsheet", "Wash & Fold", 3, 120),
          item("Pillow cover", "Wash & Fold", 4, 30, 2),
        ],
        2,
      ),
      order(
        6,
        "c-7",
        "Delivered",
        [item("Kurta", "Wash & Iron", 3, 90)],
        0,
        270,
      ),
      order(
        7,
        "c-8",
        "Processing",
        [item("Suit", "Dry Cleaning", 1, 550)],
        0,
        550,
        0,
        true,
      ),
      order(
        8,
        "c-2",
        "Delivered",
        [item("Dress", "Dry Cleaning", 2, 220)],
        0,
        440,
      ),
      order(9, "c-1", "Ready", [item("Shirt", "Steam Iron", 5, 30)], 0, 0),
      order(
        10,
        "c-4",
        "Delivered",
        [item("Blanket", "Dry Cleaning", 2, 300)],
        -1,
        600,
        -2,
      ),
      order(
        11,
        "c-5",
        "Delivered",
        [item("Shirt", "Wash & Iron", 6, 65)],
        -2,
        390,
        -3,
      ),
    ],
    expenses: [
      {
        id: "e-1",
        title: "Detergent & fabric softener",
        category: "Supplies",
        amount: 1850,
        date: at(0),
      },
      {
        id: "e-2",
        title: "Delivery fuel",
        category: "Transport",
        amount: 450,
        date: at(0),
      },
      {
        id: "e-3",
        title: "Packaging & garment covers",
        category: "Supplies",
        amount: 680,
        date: at(-1),
      },
      {
        id: "e-4",
        title: "Machine maintenance",
        category: "Maintenance",
        amount: 1200,
        date: at(-2),
      },
      {
        id: "e-5",
        title: "Electricity",
        category: "Utilities",
        amount: 2400,
        date: at(-4),
      },
    ],
    settings: {
      businessName: "Laundry Lounge",
      phone: "",
      address: "",
      currency: "INR",
      receiptFooter: "Thank you for choosing a little extra care.",
    },
  };
}
