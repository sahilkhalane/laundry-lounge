import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
export const C = {
  ink: "#243f38",
  muted: "#789087",
  teal: "#008b80",
  mint: "#e9f5ef",
  bg: "#f5f8f6",
  border: "#e0eae4",
  white: "#ffffff",
  pink: "#e80d80",
  orange: "#b7833d",
  red: "#b64f43",
};
export const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        u.button,
        secondary && u.secondary,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {icon && (
        <Ionicons name={icon} size={18} color={secondary ? C.teal : C.white} />
      )}
      <Text style={[u.buttonText, secondary && { color: C.teal }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={u.field}>
      <Text style={u.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#a1b2a8"
        style={[
          u.input,
          props.multiline && { minHeight: 80, textAlignVertical: "top" },
        ]}
        {...props}
      />
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[u.card, style]}>{children}</View>;
}
export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={u.title}>{title}</Text>
      {subtitle && <Text style={u.subtitle}>{subtitle}</Text>}
    </View>
  );
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <Text accessibilityRole="alert" style={u.error}>
      {text}
    </Text>
  ) : null;
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ padding: 28, alignItems: "center" }}>
      <Ionicons name="shirt-outline" size={32} color={C.muted} />
      <Text style={[u.heading, { marginTop: 14, textAlign: "center" }]}>
        {title}
      </Text>
      <Text style={[u.subtitle, { textAlign: "center", marginTop: 7 }]}>
        {text}
      </Text>
    </View>
  );
}
export function Sheet({
  title,
  onClose,
  children,
  footer,
  scroll = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: C.bg }}
        edges={["top", "bottom"]}
      >
        <View style={u.sheetHeader}>
          <Text accessibilityRole="header" style={u.heading}>
            {title}
          </Text>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={12}
            style={{ padding: 8 }}
          >
            <Ionicons name="close" size={24} color={C.muted} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "android" ? "height" : "padding"}
        >
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={u.sheetBody}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, padding: 20 }}>{children}</View>
          )}
          {footer && <View style={u.sheetFooter}>{footer}</View>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export function Chips<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 5, marginBottom: 12 }}
    >
      {values.map((v) => (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          accessibilityRole="button"
          accessibilityState={{ selected: v === value }}
          style={[u.chip, v === value && u.chipActive]}
        >
          <Text
            style={[
              u.chipText,
              v === value && { color: C.teal, fontWeight: "700" },
            ]}
          >
            {v}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Saving({ active }: { active: boolean }) {
  return active ? (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        padding: 10,
      }}
    >
      <ActivityIndicator color={C.teal} />
      <Text style={u.small}>Saving on this phone…</Text>
    </View>
  ) : null;
}
export const u = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 20, paddingBottom: 28 },
  title: { fontSize: 29, fontWeight: "800", letterSpacing: -0.8, color: C.ink },
  heading: { fontSize: 18, fontWeight: "700", color: C.ink },
  subtitle: { fontSize: 13, color: C.muted, lineHeight: 20, marginTop: 7 },
  small: { fontSize: 12, color: C.muted, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "600", color: "#637d6f", marginBottom: 8 },
  field: { marginBottom: 17 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.white,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 49,
    fontSize: 15,
    color: C.ink,
  },
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    marginBottom: 15,
  },
  button: {
    borderRadius: 10,
    backgroundColor: C.teal,
    paddingVertical: 14,
    paddingHorizontal: 17,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondary: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  buttonText: { fontSize: 13, fontWeight: "700", color: C.white },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 15 },
  amount: { fontSize: 22, fontWeight: "700", color: C.ink },
  error: {
    backgroundColor: "#fff0eb",
    color: C.red,
    padding: 13,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  success: {
    backgroundColor: C.mint,
    color: C.teal,
    padding: 13,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetBody: { padding: 20, paddingBottom: 32 },
  sheetFooter: {
    padding: 16,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  chipActive: { backgroundColor: C.mint, borderColor: "#b7dacb" },
  chipText: { fontSize: 12, color: C.muted },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.teal, fontSize: 13, fontWeight: "700" },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: C.mint,
  },
  badgeText: { fontSize: 10, color: C.teal, fontWeight: "600" },
  pill: {
    backgroundColor: C.mint,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  danger: { color: C.red, fontSize: 12, fontWeight: "600" },
  listRow: { paddingVertical: 15, borderBottomWidth: 1, borderColor: C.border },
  search: { marginBottom: 15 },
  twoColumns: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  spacer: { height: 14 },
});

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
}) {
  const parsed = new Date(`${value}T12:00:00`);
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return (
    <View style={u.field}>
      <Text style={u.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() =>
          DateTimePickerAndroid.open({
            value: date,
            mode: "date",
            minimumDate,
            onChange: (event, chosen) => {
              if (event.type === "set" && chosen)
                onChange(
                  `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, "0")}-${String(chosen.getDate()).padStart(2, "0")}`,
                );
            },
          })
        }
        style={[
          u.input,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text style={{ color: C.ink, fontSize: 15 }}>
          {date.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
        <Ionicons name="calendar-outline" size={19} color={C.teal} />
      </Pressable>
    </View>
  );
}
