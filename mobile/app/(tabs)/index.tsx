import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { wallet, bets, Wallet, Bet } from "@/lib/api";
import { formatCurrency, formatOdds } from "@/lib/odds-utils";

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [walletData, setWalletData] = useState<Wallet | null>(null);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([wallet.get(), bets.list()])
      .then(([w, b]) => {
        setWalletData(w);
        setRecentBets(b.slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f1117", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  const available = walletData?.available ?? 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#0f1117" }} contentContainerStyle={{ padding: 20 }}>
      {/* Greeting */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ color: "#9ca3af", fontSize: 14 }}>Welcome back,</Text>
        <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "700" }}>
          {user?.name ?? user?.email}
        </Text>
      </View>

      {/* Balance card */}
      <View
        style={{
          backgroundColor: "#1a1d27",
          borderRadius: 16,
          padding: 20,
          marginBottom: 20,
          borderWidth: 1,
          borderColor: "#2d3142",
        }}
      >
        <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 4 }}>Available Balance</Text>
        <Text style={{ color: "#22c55e", fontSize: 32, fontWeight: "800" }}>
          {formatCurrency(available)}
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/wallet")}
          style={{
            marginTop: 14,
            backgroundColor: "#6366f1",
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Manage Wallet</Text>
        </TouchableOpacity>
      </View>

      {/* Quick actions */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/markets")}
          style={{
            flex: 1,
            backgroundColor: "#1a1d27",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: "#2d3142",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#6366f1", fontSize: 22 }}>📈</Text>
          <Text style={{ color: "#ffffff", fontWeight: "600", marginTop: 6 }}>Markets</Text>
          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>Place bets</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/bets")}
          style={{
            flex: 1,
            backgroundColor: "#1a1d27",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: "#2d3142",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#6366f1", fontSize: 22 }}>🎟️</Text>
          <Text style={{ color: "#ffffff", fontWeight: "600", marginTop: 6 }}>My Bets</Text>
          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Recent bets */}
      <Text style={{ color: "#ffffff", fontSize: 17, fontWeight: "700", marginBottom: 12 }}>
        Recent Bets
      </Text>
      {recentBets.length === 0 ? (
        <Text style={{ color: "#6b7280" }}>No bets yet. Head to Markets to place your first bet.</Text>
      ) : (
        recentBets.map((bet) => (
          <View
            key={bet.id}
            style={{
              backgroundColor: "#1a1d27",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "#2d3142",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
                {bet.selection.name}
                {bet.selection.line ? ` ${bet.selection.line}` : ""}
              </Text>
              <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                {bet.selection.market.event.awayTeam} @ {bet.selection.market.event.homeTeam}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
              <Text
                style={{
                  color:
                    bet.status === "WON"
                      ? "#22c55e"
                      : bet.status === "LOST"
                      ? "#ef4444"
                      : "#93c5fd",
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {bet.status}
              </Text>
              <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                {formatCurrency(parseFloat(bet.stake))} @ {formatOdds(bet.odds)}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Sign out */}
      <TouchableOpacity
        onPress={logout}
        style={{ marginTop: 24, alignItems: "center", paddingVertical: 12 }}
      >
        <Text style={{ color: "#6b7280", fontSize: 14 }}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
