import { useEffect, useState } from "react";
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
const STORAGE_KEY = "sticker-dates";
const DEFAULT_VEHICLE = {
  id: "vehicle-1",
  name: "Vehicle 1",
  plateDate: new Date(2026, 5, 30),
  cityDate: new Date(2026, 6, 15),
};
const IS_WEB = Platform.OS === "web";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestPermission() {
  if (IS_WEB) return true;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function toInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function fromInputDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function createVehicle(index) {
  const now = Date.now();
  return {
    id: `${now}-${index}`,
    name: `Vehicle ${index + 1}`,
    plateDate: new Date(2026, 5, 30),
    cityDate: new Date(2026, 6, 15),
  };
}

function normalizeVehicles(data) {
  if (Array.isArray(data?.vehicles) && data.vehicles.length) {
    return data.vehicles.map((vehicle, index) => ({
      id: vehicle.id || `${Date.now()}-${index}`,
      name: vehicle.name || `Vehicle ${index + 1}`,
      plateDate: new Date(vehicle.plateDate),
      cityDate: new Date(vehicle.cityDate),
    }));
  }

  if (data?.plate && data?.city) {
    return [
      {
        ...DEFAULT_VEHICLE,
        plateDate: new Date(data.plate),
        cityDate: new Date(data.city),
      },
    ];
  }

  return [DEFAULT_VEHICLE];
}

async function scheduleReminders(vehicles) {
  if (IS_WEB) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const items = vehicles.flatMap((vehicle) => [
    { name: `${vehicle.name} plate sticker`, date: vehicle.plateDate },
    { name: `${vehicle.name} city sticker`, date: vehicle.cityDate },
  ]);

  for (const item of items) {
    for (const days of REMIND_DAYS) {
      const triggerDate = addDays(item.date, days);
      if (triggerDate <= new Date()) continue;

      let body;
      if (days === 0) body = `${item.name} expires today.`;
      else if (days === 1) body = `${item.name} expires tomorrow.`;
      else body = `${item.name} expires in ${days} days.`;

      await Notifications.scheduleNotificationAsync({
        content: { title: "Sticker Reminder", body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
    }
  }
}

function DateField({ label, value, onChange }) {
  const [show, setShow] = useState(false);

  if (IS_WEB) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={toInputDate(value)}
          onChangeText={(text) => {
            const nextDate = fromInputDate(text);
            if (nextDate) onChange(nextDate);
          }}
        />
        <Text style={styles.daysLeft}>
          {daysUntil(value) < 0
            ? "Expired"
            : daysUntil(value) === 0
              ? "Due today"
              : `${daysUntil(value)} days left`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.dateBtn} onPress={() => setShow(true)}>
        <Text style={styles.dateText}>{formatDate(value)}</Text>
        <Text style={styles.daysLeft}>
          {daysUntil(value) < 0
            ? "Expired"
            : daysUntil(value) === 0
              ? "Due today"
              : `${daysUntil(value)} days left`}
        </Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, selected) => {
            if (Platform.OS === "android") setShow(false);
            if (selected) onChange(selected);
          }}
        />
      )}
      {show && Platform.OS === "ios" && (
        <Pressable style={styles.doneBtn} onPress={() => setShow(false)}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function App() {
  const [vehicles, setVehicles] = useState([DEFAULT_VEHICLE]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await requestPermission();
      if (!ok) Alert.alert("Allow notifications to get reminders.");

      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setVehicles(normalizeVehicles(data));
      }
      setReady(true);
    })();
  }, []);

  function updateVehicle(id, changes) {
    setVehicles((current) =>
      current.map((vehicle) => (vehicle.id === id ? { ...vehicle, ...changes } : vehicle))
    );
  }

  function addVehicle() {
    setVehicles((current) => [...current, createVehicle(current.length)]);
  }

  function removeVehicle(id) {
    setVehicles((current) => current.filter((vehicle) => vehicle.id !== id));
  }

  async function save() {
    const ok = await requestPermission();
    if (!ok) {
      Alert.alert("Notifications are required.");
      return;
    }

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        vehicles: vehicles.map((vehicle) => ({
          ...vehicle,
          plateDate: vehicle.plateDate.toISOString(),
          cityDate: vehicle.cityDate.toISOString(),
        })),
      })
    );
    await scheduleReminders(vehicles);
    Alert.alert("Saved", IS_WEB ? "Saved in this browser." : "Reminders scheduled on this phone.");
  }

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sticker Reminder</Text>
        <Text style={styles.sub}>Plate and city sticker renewals</Text>

        {vehicles.map((vehicle, index) => (
          <View key={vehicle.id} style={styles.vehicleCard}>
            <View style={styles.vehicleHeader}>
              <Text style={styles.vehicleTitle}>Vehicle {index + 1}</Text>
              {vehicles.length > 1 && (
                <Pressable onPress={() => removeVehicle(vehicle.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.input}
              value={vehicle.name}
              onChangeText={(name) => updateVehicle(vehicle.id, { name })}
              placeholder="Vehicle name"
            />
            <DateField
              label="Plate sticker renewal"
              value={vehicle.plateDate}
              onChange={(plateDate) => updateVehicle(vehicle.id, { plateDate })}
            />
            <DateField
              label="City sticker renewal"
              value={vehicle.cityDate}
              onChange={(cityDate) => updateVehicle(vehicle.id, { cityDate })}
            />
          </View>
        ))}

        <Pressable style={styles.addBtn} onPress={addVehicle}>
          <Text style={styles.addText}>Add Vehicle</Text>
        </Pressable>

        <Text style={styles.note}>Alerts at 30, 14, 7, 1, and 0 days before.</Text>

        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveText}>Save & Schedule</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6f8" },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#111" },
  sub: { fontSize: 14, color: "#555", marginBottom: 8 },
  field: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  label: { fontSize: 14, color: "#666", marginBottom: 8 },
  dateBtn: { gap: 4 },
  dateText: { fontSize: 20, fontWeight: "600", color: "#111" },
  daysLeft: { fontSize: 14, color: "#2563eb" },
  vehicleCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 },
  vehicleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vehicleTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  removeText: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
  input: {
    borderColor: "#ddd",
    borderRadius: 10,
    borderWidth: 1,
    color: "#111",
    fontSize: 16,
    padding: 12,
  },
  addBtn: {
    backgroundColor: "#fff",
    borderColor: "#2563eb",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
  addText: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
  note: { fontSize: 13, color: "#666" },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  doneBtn: { alignSelf: "flex-end", marginTop: 8 },
  doneText: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
});
