export type Status = "Received" | "Processing" | "Ready" | "Delivered";
export type Service =
  | "Wash & Fold"
  | "Wash & Iron"
  | "Dry Cleaning"
  | "Steam Iron";
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
}
export interface LineItem {
  id: string;
  garment: string;
  service: Service;
  quantity: number;
  price: number;
  note?: string;
}
export interface Payment {
  id: string;
  amount: number;
  paidAt: string;
}
export interface Order {
  id: string;
  customerId: string;
  items: LineItem[];
  createdAt: string;
  dueDate: string;
  status: Status;
  paid: number;
  payments?: Payment[];
  discount: number;
  express: boolean;
  notes: string;
  tagStatuses: Record<string, Status>;
}
export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
}
export interface Settings {
  businessName: string;
  phone: string;
  address: string;
  currency: string;
  logo?: string;
  receiptFooter: string;
}
export interface Store {
  version: 1;
  customers: Customer[];
  orders: Order[];
  expenses: Expense[];
  settings: Settings;
}
export type Page =
  | "Overview"
  | "Orders"
  | "Customers"
  | "Reports"
  | "Expenses"
  | "Settings";
export interface Tag {
  id: string;
  orderId: string;
  item: LineItem;
  number: number;
  status: Status;
}
