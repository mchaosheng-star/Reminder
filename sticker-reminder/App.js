import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";

const REMIND_DAYS = [30, 14, 7, 1, 0];
const STORAGE_KEY = "sticker-dates";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestPermission() {
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

async function scheduleReminders(plateDate, cityDate) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const items = [
    { name: "Plate sticker", date: plateDate },
    { name: "City sticker", date: cityDate },
  ];

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
  const [plateDate, setPlateDate] = useState(new Date(2026, 5, 30));
  const [cityDate, setCityDate] = useState(new Date(2026, 6, 15));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await requestPermission();
      if (!ok) Alert.alert("Allow notifications to get reminders.");

      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setPlateDate(new Date(data.plate));
        setCityDate(new Date(data.city));
      }
      setReady(true);
    })();
  }, []);

  async function save() {
    const ok = await requestPermission();
    if (!ok) {
      Alert.alert("Notifications are required.");
      return;
    }

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ plate: plateDate.toISOString(), city: cityDate.toISOString() })
    );
    await scheduleReminders(plateDate, cityDate);
    Alert.alert("Saved", "Reminders scheduled on this phone.");
  }

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sticker Reminder</Text>
        <Text style={styles.sub}>
          Runs on your phone. No Mac or Xcode needed — use Expo Go.
        </Text>

        <DateField label="Plate sticker renewal" value={plateDate} onChange={setPlateDate} />
        <DateField label="City sticker renewal" value={cityDate} onChange={setCityDate} />

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
