import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { events, Event } from "@/lib/api";

function formatGameTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MarketsScreen() {
  const router = useRouter();
  const [eventList, setEventList] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await events.list({ status: "UPCOMING" });
    setEventList(data);
  }, []);

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().catch(console.error).finally(() => setRefreshing(false));
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f1117", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={eventList}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      style={{ backgroundColor: "#0f1117" }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      ListEmptyComponent={
        <Text style={{ color: "#6b7280", textAlign: "center", marginTop: 40 }}>
          No upcoming games right now.
        </Text>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => router.push(`/(tabs)/markets/${item.id}`)}
          style={{
            backgroundColor: "#1a1d27",
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: "#2d3142",
          }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: "#9ca3af", fontSize: 12 }}>
              {item.league.sport.name} · {item.league.name}
            </Text>
            <Text style={{ color: item.status === "LIVE" ? "#ef4444" : "#6b7280", fontSize: 12, fontWeight: "600" }}>
              {item.status === "LIVE" ? "🔴 LIVE" : formatGameTime(item.startTime)}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
                {item.awayTeam}
              </Text>
              <Text style={{ color: "#6b7280", marginTop: 2, fontSize: 12 }}>Away</Text>
            </View>
            <Text style={{ color: "#4b5563", fontWeight: "700", marginHorizontal: 12 }}>@</Text>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
                {item.homeTeam}
              </Text>
              <Text style={{ color: "#6b7280", marginTop: 2, fontSize: 12 }}>Home</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: "#1f2937", paddingTop: 10 }}>
            <Text style={{ color: "#6366f1", fontSize: 13, fontWeight: "600" }}>Tap to bet →</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}
