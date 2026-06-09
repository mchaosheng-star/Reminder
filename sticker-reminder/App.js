import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";

const REMIND_DAYS = [30, 14, 7, 1, 0];
const STORAGE_KEY = "sticker-reminder-vehicles-v1";
const KINDS = [
  { key: "plate", label: "Plate sticker", idPlaceholder: "Plate / registration ID" },
  { key: "city", label: "City sticker", idPlaceholder: "Account / registration ID" },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function newSticker(date) {
  return { date, cycleYears: 2, regid: "", pin: "" };
}

function newVehicle(name) {
  return {
    id: uid(),
    name: name || "My Vehicle",
    plate: newSticker(new Date(2026, 5, 30).toISOString()),
    city: newSticker(new Date(2026, 6, 15).toISOString()),
  };
}

async function requestPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

function triggerDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function statusText(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0) return { text: "Expired", color: "#dc2626" };
  if (days === 0) return { text: "Due today", color: "#dc2626" };
  if (days <= 7) return { text: `${days}d left`, color: "#b45309" };
  return { text: `${days}d left`, color: "#2563eb" };
}

function messageFor(name, days, dateStr) {
  if (days === 0) return `${name} expires today.`;
  if (days === 1) return `${name} expires tomorrow.`;
  return `${name} expires in ${days} days (${formatDate(dateStr)}).`;
}

async function scheduleAll(vehicles) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = new Date();
  for (const v of vehicles) {
    for (const kd of KINDS) {
      const s = v[kd.key];
      for (const days of REMIND_DAYS) {
        const when = triggerDate(s.date, days);
        if (when <= now) continue;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Sticker Reminder — ${v.name}`,
            body: messageFor(kd.label, days, s.date),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: when,
          },
        });
      }
    }
  }
}

function Segmented({ value, onChange }) {
  return (
    <View style={styles.segment}>
      {[1, 2].map((y) => (
        <Pressable
          key={y}
          style={[styles.segBtn, value === y && styles.segBtnActive]}
          onPress={() => onChange(y)}
        >
          <Text style={[styles.segText, value === y && styles.segTextActive]}>
            {y} year{y > 1 ? "s" : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function StickerSection({ vehicle, kindDef, onPatch }) {
  const s = vehicle[kindDef.key];
  const [showPicker, setShowPicker] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const status = statusText(s.date);

  function patch(changes) {
    onPatch(kindDef.key, { ...s, ...changes });
  }

  function renewedToday() {
    const next = new Date();
    next.setFullYear(next.getFullYear() + s.cycleYears);
    Alert.alert(
      "Renewed today?",
      `Next ${kindDef.label} reminder will be ${formatDate(next.toISOString())}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes", onPress: () => patch({ date: next.toISOString() }) },
      ]
    );
  }

  return (
    <View style={styles.sticker}>
      <View style={styles.rowBetween}>
        <Text style={styles.stickerTitle}>{kindDef.label}</Text>
        <Text style={[styles.badge, { color: status.color }]}>{status.text}</Text>
      </View>

      <Text style={styles.fieldLabel}>Renewal date</Text>
      <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
        <Text style={styles.inputText}>{formatDate(s.date)}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={new Date(s.date)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_, selected) => {
            if (Platform.OS === "android") setShowPicker(false);
            if (selected) patch({ date: selected.toISOString() });
          }}
        />
      )}
      {showPicker && Platform.OS === "ios" && (
        <Pressable style={styles.doneBtn} onPress={() => setShowPicker(false)}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      )}

      <Text style={styles.fieldLabel}>Renews every</Text>
      <Segmented value={s.cycleYears} onChange={(y) => patch({ cycleYears: y })} />

      <Text style={styles.fieldLabel}>Register ID</Text>
      <TextInput
        style={styles.input}
        value={s.regid}
        placeholder={kindDef.idPlaceholder}
        autoCapitalize="characters"
        autoCorrect={false}
        onChangeText={(t) => patch({ regid: t })}
      />

      <Text style={styles.fieldLabel}>PIN</Text>
      <View style={styles.pinRow}>
        <TextInput
          style={[styles.input, styles.pinInput]}
          value={s.pin}
          placeholder="Renewal PIN"
          secureTextEntry={!showPin}
          keyboardType="number-pad"
          onChangeText={(t) => patch({ pin: t })}
        />
        <Pressable style={styles.revealBtn} onPress={() => setShowPin((v) => !v)}>
          <Text style={styles.revealText}>{showPin ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.ghostBtn} onPress={renewedToday}>
        <Text style={styles.ghostText}>Renewed today</Text>
      </Pressable>
    </View>
  );
}

function VehicleCard({ vehicle, onChange, onRemove }) {
  function patchSticker(kindKey, value) {
    onChange({ ...vehicle, [kindKey]: value });
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <TextInput
          style={styles.vname}
          value={vehicle.name}
          placeholder="Vehicle name"
          onChangeText={(t) => onChange({ ...vehicle, name: t })}
        />
        <Pressable style={styles.delBtn} onPress={() => onRemove(vehicle.id)}>
          <Text style={styles.delText}>Remove</Text>
        </Pressable>
      </View>
      {KINDS.map((kd) => (
        <StickerSection key={kd.key} vehicle={vehicle} kindDef={kd} onPatch={patchSticker} />
      ))}
    </View>
  );
}

export default function App() {
  const [vehicles, setVehicles] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await requestPermission();
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setVehicles(JSON.parse(saved));
        } catch {
          setVehicles([newVehicle("My Vehicle")]);
        }
      } else {
        setVehicles([newVehicle("My Vehicle")]);
      }
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setVehicles(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  function updateVehicle(updated) {
    persist(vehicles.map((v) => (v.id === updated.id ? updated : v)));
  }

  function removeVehicle(id) {
    const target = vehicles.find((v) => v.id === id);
    Alert.alert("Remove vehicle", `Remove "${target?.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => persist(vehicles.filter((v) => v.id !== id)) },
    ]);
  }

  function addVehicle() {
    persist([...vehicles, newVehicle(`Vehicle ${vehicles.length + 1}`)]);
  }

  async function saveAndSchedule() {
    const ok = await requestPermission();
    if (!ok) {
      Alert.alert("Notifications are required to get reminders.");
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
    await scheduleAll(vehicles);
    const count = (await Notifications.getAllScheduledNotificationsAsync()).length;
    Alert.alert("Saved", `${count} reminders scheduled on this phone.`);
  }

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sticker Reminder</Text>
        <Text style={styles.sub}>Plate & city sticker renewals</Text>

        {vehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} onChange={updateVehicle} onRemove={removeVehicle} />
        ))}

        <Pressable style={styles.addBtn} onPress={addVehicle}>
          <Text style={styles.addText}>+ Add vehicle</Text>
        </Pressable>

        <Text style={styles.note}>
          Alerts at 30, 14, 7, 1, and 0 days before each date. Your Register ID and PIN are stored only on this
          phone.
        </Text>

        <Pressable style={styles.saveBtn} onPress={saveAndSchedule}>
          <Text style={styles.saveText}>Save & schedule reminders</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6f8" },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#111" },
  sub: { fontSize: 14, color: "#555", marginBottom: 4 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 14 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  vname: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
  },
  delBtn: { backgroundColor: "#fef2f2", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  delText: { color: "#dc2626", fontSize: 13, fontWeight: "600" },
  sticker: { gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#eef0f3" },
  stickerTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  badge: { fontSize: 13, fontWeight: "700" },
  fieldLabel: { fontSize: 13, color: "#666", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111",
    backgroundColor: "#fff",
  },
  inputText: { fontSize: 16, color: "#111" },
  segment: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  segBtnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  segText: { fontSize: 15, color: "#374151", fontWeight: "600" },
  segTextActive: { color: "#fff" },
  pinRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  pinInput: { flex: 1 },
  revealBtn: { justifyContent: "center", paddingHorizontal: 16, backgroundColor: "#f4f6f8", borderRadius: 10 },
  revealText: { color: "#2563eb", fontWeight: "600" },
  ghostBtn: { backgroundColor: "#f4f6f8", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  ghostText: { color: "#2563eb", fontWeight: "600" },
  doneBtn: { alignSelf: "flex-end" },
  doneText: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
  addBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd5e1", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  addText: { color: "#2563eb", fontWeight: "600", fontSize: 15 },
  note: { fontSize: 13, color: "#666", lineHeight: 18 },
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 12, padding: 16, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
