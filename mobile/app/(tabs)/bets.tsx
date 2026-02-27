import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { bets, parlays, Bet, Parlay } from "@/lib/api";
import { formatCurrency, formatOdds } from "@/lib/odds-utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadgeStyle(status: string) {
  if (status === "ACTIVE") return { bg: "#1e3a5f", text: "#93c5fd" };
  if (status === "WON") return { bg: "#14532d", text: "#22c55e" };
  if (status === "LOST") return { bg: "#450a0a", text: "#f87171" };
  return { bg: "#1f2937", text: "#9ca3af" };
}

function BetCard({ bet }: { bet: Bet }) {
  const stake = parseFloat(bet.stake);
  const payout = parseFloat(bet.potentialPayout);
  const { bg, text: textC } = statusBadgeStyle(bet.status);

  return (
    <View
      style={{
        backgroundColor: "#1a1d27",
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#2d3142",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
            {bet.selection.name}
            {bet.selection.line ? ` ${bet.selection.line}` : ""}
          </Text>
          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
            {bet.selection.market.event.awayTeam} @ {bet.selection.market.event.homeTeam}
          </Text>
          <Text style={{ color: "#4b5563", fontSize: 11, marginTop: 2 }}>
            {bet.selection.market.name} · {formatDate(bet.placedAt)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 10 }}>
          <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 4 }}>
            <Text style={{ color: textC, fontSize: 11, fontWeight: "700" }}>{bet.status}</Text>
          </View>
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 13 }}>
            {formatCurrency(stake)} @ {formatOdds(bet.odds)}
          </Text>
          {bet.status === "ACTIVE" ? (
            <Text style={{ color: "#6b7280", fontSize: 11 }}>To win {formatCurrency(payout - stake)}</Text>
          ) : bet.status === "WON" && bet.settlement ? (
            <Text style={{ color: "#22c55e", fontSize: 11 }}>
              Won {formatCurrency(parseFloat(bet.settlement.payout))}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ParlayCard({ parlay }: { parlay: Parlay }) {
  const stake = parseFloat(parlay.stake);
  const payout = parseFloat(parlay.potentialPayout);
  const { bg, text: textC } = statusBadgeStyle(parlay.status);
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={{
        backgroundColor: "#1a1d27",
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#2d3142",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
            <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 14 }}>
              {parlay.legs.length}-Leg Parlay {expanded ? "▲" : "▼"}
            </Text>
          </TouchableOpacity>
          <Text style={{ color: "#4b5563", fontSize: 11, marginTop: 2 }}>
            {formatDate(parlay.placedAt)}
          </Text>
          {expanded && (
            <View style={{ marginTop: 8, gap: 4 }}>
              {parlay.legs.map((leg) => (
                <View key={leg.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        leg.result === "WON"
                          ? "#22c55e"
                          : leg.result === "LOST"
                          ? "#ef4444"
                          : "#6b7280",
                    }}
                  />
                  <Text style={{ color: "#9ca3af", fontSize: 12, flex: 1 }} numberOfLines={1}>
                    {leg.selection.name}
                    {leg.selection.line ? ` ${leg.selection.line}` : ""}
                  </Text>
                  <Text style={{ color: "#6b7280", fontSize: 12 }}>{formatOdds(leg.acceptedOdds)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 10 }}>
          <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 4 }}>
            <Text style={{ color: textC, fontSize: 11, fontWeight: "700" }}>{parlay.status}</Text>
          </View>
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 13 }}>
            {formatCurrency(stake)} @ {formatOdds(parlay.combinedOdds)}
          </Text>
          {parlay.status === "ACTIVE" ? (
            <Text style={{ color: "#6b7280", fontSize: 11 }}>To win {formatCurrency(payout - stake)}</Text>
          ) : parlay.status === "WON" ? (
            <Text style={{ color: "#22c55e", fontSize: 11 }}>Won {formatCurrency(payout)}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type BetItem = { type: "bet"; data: Bet } | { type: "parlay"; data: Parlay };

export default function BetsScreen() {
  const [items, setItems] = useState<BetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [betList, parlayList] = await Promise.all([bets.list(), parlays.list()]);
    const mapped: BetItem[] = [
      ...betList.map((b) => ({ type: "bet" as const, data: b })),
      ...parlayList.map((p) => ({ type: "parlay" as const, data: p })),
    ].sort(
      (a, b) =>
        new Date(b.data.placedAt).getTime() - new Date(a.data.placedAt).getTime()
    );
    setItems(mapped);
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

  const active = items.filter(
    (i) => i.data.status === "ACTIVE" || i.data.status === "PENDING"
  );
  const history = items.filter(
    (i) => i.data.status !== "ACTIVE" && i.data.status !== "PENDING"
  );

  const sections = [];
  if (active.length > 0) sections.push({ title: `Active (${active.length})`, data: active });
  if (history.length > 0) sections.push({ title: "History", data: history });

  return (
    <SectionList
      sections={sections}
      style={{ backgroundColor: "#0f1117" }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      ListEmptyComponent={
        <Text style={{ color: "#6b7280", textAlign: "center", marginTop: 60 }}>
          No bets yet.
        </Text>
      }
      renderSectionHeader={({ section }) => (
        <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 16, marginBottom: 10, marginTop: 4 }}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) =>
        item.type === "bet" ? (
          <BetCard bet={item.data as Bet} />
        ) : (
          <ParlayCard parlay={item.data as Parlay} />
        )
      }
      keyExtractor={(item) => item.data.id}
      stickySectionHeadersEnabled={false}
    />
  );
}
