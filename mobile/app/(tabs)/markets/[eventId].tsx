import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { events, Event, Selection, Market } from "@/lib/api";
import { formatOdds } from "@/lib/odds-utils";
import { useParlay } from "@/context/ParlayContext";
import { BetSlipModal } from "@/components/BetSlipModal";

const MARKET_TYPE_LABEL: Record<string, string> = {
  MONEYLINE: "Moneyline",
  SPREAD: "Spread",
  TOTAL: "Total",
  PLAYER_PROP: "Player Prop",
};

export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const navigation = useNavigation();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSelection, setActiveSelection] = useState<{
    selection: Selection;
    market: Market;
  } | null>(null);

  const { addLeg, hasLeg } = useParlay();

  useEffect(() => {
    if (!eventId) return;
    events
      .get(eventId)
      .then((e) => {
        setEvent(e);
        navigation.setOptions({ title: `${e.awayTeam} @ ${e.homeTeam}` });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f1117", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f1117", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#ef4444" }}>Event not found.</Text>
      </View>
    );
  }

  const handleAddToParlay = (market: Market, selection: Selection) => {
    const marketType = MARKET_TYPE_LABEL[market.type] ?? market.type;
    const selectionName = selection.line
      ? `${selection.name} ${selection.line}`
      : selection.name;
    addLeg({
      selectionId: selection.id,
      selectionName,
      eventLabel: `${event.awayTeam} @ ${event.homeTeam}`,
      marketType,
      consensusOdds: selection.consensus?.odds ?? -110,
      requestedOdds: selection.consensus?.odds ?? -110,
    });
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: "#0f1117" }} contentContainerStyle={{ padding: 16 }}>
        {/* Event header */}
        <View
          style={{
            backgroundColor: "#1a1d27",
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: "#2d3142",
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>
            {event.league.sport.name} · {event.league.name}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18, flex: 1 }} numberOfLines={1}>
              {event.awayTeam}
            </Text>
            <Text style={{ color: "#4b5563", fontWeight: "700", marginHorizontal: 8 }}>@</Text>
            <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18, flex: 1, textAlign: "right" }} numberOfLines={1}>
              {event.homeTeam}
            </Text>
          </View>
          {event.status === "LIVE" && (
            <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "700", marginTop: 8 }}>
              🔴 LIVE
            </Text>
          )}
        </View>

        {/* Markets */}
        {(event.markets ?? []).map((market) => (
          <View
            key={market.id}
            style={{
              backgroundColor: "#1a1d27",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#2d3142",
              marginBottom: 14,
              overflow: "hidden",
            }}
          >
            {/* Market header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#1f2937",
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "600" }}>{market.name}</Text>
              <View style={{ backgroundColor: "#2d3142", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                  {MARKET_TYPE_LABEL[market.type] ?? market.type}
                </Text>
              </View>
            </View>

            {/* Selections */}
            <View style={{ padding: 10, gap: 8 }}>
              {market.selections.map((selection) => {
                const inParlay = hasLeg(selection.id);
                const odds = selection.consensus?.odds;
                return (
                  <View
                    key={selection.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: inParlay ? "#1e1e38" : "#0f1117",
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: inParlay ? "#6366f1" : "#2d3142",
                      padding: 12,
                    }}
                  >
                    {/* Name + line + movement */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#ffffff", fontWeight: "500", fontSize: 14 }}>
                        {selection.name}
                        {selection.line ? (
                          <Text style={{ color: "#9ca3af" }}> {selection.line}</Text>
                        ) : null}
                      </Text>
                      {selection.consensus?.lineMovement !== undefined &&
                        selection.consensus.lineMovement !== 0 && (
                          <Text
                            style={{
                              fontSize: 11,
                              marginTop: 2,
                              color:
                                selection.consensus.lineMovement > 0 ? "#22c55e" : "#ef4444",
                            }}
                          >
                            {selection.consensus.lineMovement > 0 ? "▲" : "▼"}{" "}
                            {Math.abs(selection.consensus.lineMovement * 100).toFixed(1)}%
                          </Text>
                        )}
                    </View>

                    {/* Odds */}
                    <View style={{ alignItems: "flex-end", marginRight: 10 }}>
                      {odds !== undefined ? (
                        <Text
                          style={{
                            color: odds > 0 ? "#22c55e" : "#ffffff",
                            fontSize: 18,
                            fontWeight: "800",
                          }}
                        >
                          {formatOdds(odds)}
                        </Text>
                      ) : (
                        <Text style={{ color: "#6b7280", fontSize: 13 }}>N/A</Text>
                      )}
                    </View>

                    {/* Action buttons */}
                    {market.status === "OPEN" && (
                      <View style={{ gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => setActiveSelection({ selection, market })}
                          style={{
                            backgroundColor: "#6366f1",
                            borderRadius: 7,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Bet</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleAddToParlay(market, selection)}
                          disabled={inParlay}
                          style={{
                            backgroundColor: inParlay ? "#1e1e38" : "#2d3142",
                            borderRadius: 7,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            alignItems: "center",
                            borderWidth: inParlay ? 1 : 0,
                            borderColor: inParlay ? "#6366f1" : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              color: inParlay ? "#6366f1" : "#d1d5db",
                              fontWeight: "700",
                              fontSize: 12,
                            }}
                          >
                            {inParlay ? "✓ Added" : "+ Parlay"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* BetSlip modal */}
      {activeSelection && (
        <BetSlipModal
          selection={activeSelection.selection}
          eventLabel={`${event.awayTeam} @ ${event.homeTeam}`}
          onClose={() => setActiveSelection(null)}
        />
      )}
    </>
  );
}
