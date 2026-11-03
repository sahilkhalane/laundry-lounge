import React, { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Status, Store } from "../types";
import { getTags, parseTagInput, updateTagStatus } from "../domain";
import {
  Button,
  C,
  Card,
  Chips,
  ErrorText,
  Field,
  Saving,
  Sheet,
  u,
} from "../ui";

const STATUSES: readonly Status[] = [
  "Received",
  "Processing",
  "Ready",
  "Delivered",
];

export default function Scanner({
  store,
  onChange,
  onClose,
}: {
  store: Store;
  onChange: (store: Store) => Promise<void>;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [manual, setManual] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<Status>("Received");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const lastRead = useRef({ value: "", at: 0 });
  const ownerId = /^(LL-\d+)-/.exec(selectedId)?.[1];
  const order = store.orders.find((entry) => entry.id === ownerId);
  const tag = order
    ? getTags(order).find((entry) => entry.id === selectedId)
    : undefined;
  const customer = store.customers.find(
    (entry) => entry.id === order?.customerId,
  );

  function find(raw: string) {
    if (saving.current) return;
    setError("");
    setMessage("");
    const id = parseTagInput(raw);
    const orderId = /^(LL-\d+)-/.exec(id)?.[1];
    const foundOrder = id
      ? store.orders.find((entry) => entry.id === orderId)
      : undefined;
    const foundTag =
      foundOrder && getTags(foundOrder).find((tag) => tag.id === id);
    if (!foundTag) {
      setSelectedId("");
      setError(
        "No garment matches this tag. Enter a printed number such as LL-1048-1-1.",
      );
      return;
    }
    setSelectedId(foundTag.id);
    setManual(foundTag.id);
    setStatus(foundTag.status);
    setActive(false);
  }
  function scanned(result: BarcodeScanningResult) {
    const now = Date.now();
    if (
      lastRead.current.value === result.data &&
      now - lastRead.current.at < 1800
    )
      return;
    lastRead.current = { value: result.data, at: now };
    find(result.data);
  }
  async function startCamera() {
    if (saving.current) return;
    setError("");
    setMessage("");
    try {
      const result = permission?.granted
        ? permission
        : await requestPermission();
      if (!result.granted) {
        setError(
          "Camera permission is needed to scan a QR tag. You can still enter its printed number below.",
        );
        return;
      }
      lastRead.current = { value: "", at: 0 };
      setSelectedId("");
      setManual("");
      setActive(true);
    } catch {
      setError(
        "The camera could not be opened. Enter the printed tag number below, or enable camera access in Android Settings.",
      );
    }
  }
  async function save() {
    if (saving.current || !tag) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onChange(updateTagStatus(store, tag.id, status));
      setMessage(
        `${tag.item.garment} marked ${status.toLowerCase()}. The order updates when all its garments progress.`,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The garment status could not be saved.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (!saving.current) {
      setActive(false);
      onClose();
    }
  }
  return (
    <Sheet title="Scan garment tag" onClose={close}>
      <Text style={[u.small, { marginBottom: 18 }]}>
        Point the camera at a Laundry Lounge QR tag, or enter the printed code.
        Every garment has its own tag.
      </Text>
      <ErrorText text={error} />
      {message ? (
        <Text accessibilityRole="alert" style={u.success}>
          {message}
        </Text>
      ) : null}
      <Saving active={busy} />
      <View style={s.cameraBox}>
        {active ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanned}
              onMountError={() => {
                setActive(false);
                setError(
                  "The camera is not available. Check Android camera permission, or enter the printed tag code.",
                );
              }}
            />
            <View pointerEvents="none" style={s.target}>
              <View style={s.cornerTL} />
              <View style={s.cornerTR} />
              <View style={s.cornerBL} />
              <View style={s.cornerBR} />
            </View>
            <View pointerEvents="none" style={s.cameraCaption}>
              <Text style={s.cameraCaptionText}>
                Place the QR tag inside the frame
              </Text>
            </View>
          </>
        ) : (
          <View style={s.placeholder}>
            <Ionicons name="scan-outline" size={52} color={C.teal} />
            <Text style={[u.heading, { marginTop: 14 }]}>
              A quick scan. A clear update.
            </Text>
            <Text style={[u.small, { textAlign: "center", marginTop: 8 }]}>
              Camera access is used only to read garment tags.
            </Text>
          </View>
        )}
      </View>
      <View style={{ marginVertical: 15 }}>
        <Button
          title={active ? "Stop camera" : "Start camera"}
          secondary={active}
          icon={active ? "stop-circle-outline" : "camera-outline"}
          disabled={busy}
          onPress={() => {
            if (active) setActive(false);
            else void startCamera();
          }}
        />
      </View>
      {permission && !permission.granted && !permission.canAskAgain && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Android camera permission settings"
          onPress={() => {
            void Linking.openSettings().catch(() =>
              setError(
                "Open Android Settings → Apps → Laundry Lounge → Permissions to allow the camera.",
              ),
            );
          }}
          style={{ marginBottom: 20 }}
        >
          <Text
            style={{
              color: C.teal,
              textAlign: "center",
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Open Android permission settings
          </Text>
        </Pressable>
      )}
      <View style={u.divider} />
      <Field
        label="Printed tag number"
        placeholder="e.g. LL-1048-1-1"
        value={manual}
        onChangeText={(value) => {
          setManual(value);
          setMessage("");
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        onSubmitEditing={() => find(manual)}
        returnKeyType="search"
      />
      <Button
        title="Find garment"
        icon="search-outline"
        secondary
        disabled={busy || !manual.trim()}
        onPress={() => find(manual)}
      />
      {tag && order && (
        <Card style={{ marginTop: 22 }}>
          <Text
            style={[
              u.small,
              { color: C.teal, fontWeight: "700", marginBottom: 10 },
            ]}
            selectable
          >
            {tag.id}
          </Text>
          <Text style={u.heading}>{tag.item.garment}</Text>
          <View style={u.divider} />
          <Detail label="Customer" value={customer?.name || "Customer"} />
          <Detail label="Service" value={tag.item.service} />
          <Detail label="Order" value={order.id} />
          <Detail label="Current garment status" value={tag.status} />
          <Detail label="Order status" value={order.status} />
          {tag.item.note || order.notes ? (
            <Text style={[u.small, { marginTop: 10 }]}>
              Care notes: {tag.item.note || order.notes}
            </Text>
          ) : null}
          <View style={u.divider} />
          <Text style={u.label}>New garment status</Text>
          <Chips
            values={STATUSES}
            value={status}
            onChange={(value) => {
              if (!busy) setStatus(value);
            }}
          />
          <Button
            title="Save garment status"
            icon="checkmark"
            disabled={busy}
            onPress={() => {
              void save();
            }}
          />
        </Card>
      )}
      <Text style={[u.small, { marginTop: 20 }]}>
        Scan the next garment to continue. Updating one tag preserves every
        other garment’s status.
      </Text>
    </Sheet>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={[u.between, { paddingVertical: 6 }]}>
      <Text style={u.small}>{label}</Text>
      <Text
        style={{
          color: C.ink,
          fontSize: 12,
          fontWeight: "600",
          textAlign: "right",
          flex: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
const corner = {
  position: "absolute" as const,
  width: 30,
  height: 30,
  borderColor: "#a7e7cb",
  borderWidth: 3,
};
const s = StyleSheet.create({
  cameraBox: {
    height: 285,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { padding: 28, alignItems: "center" },
  target: { width: 190, height: 190 },
  cornerTL: {
    ...corner,
    left: 0,
    top: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    ...corner,
    right: 0,
    top: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    ...corner,
    left: 0,
    bottom: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    ...corner,
    right: 0,
    bottom: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  cameraCaption: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 14,
    alignItems: "center",
  },
  cameraCaptionText: {
    fontSize: 12,
    color: C.white,
    backgroundColor: "#17352dbb",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
});
