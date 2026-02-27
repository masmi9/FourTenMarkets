import { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useParlay, ParlayLegDraft } from "@/context/ParlayContext";
import { parlays, ParlayRequestResult } from "@/lib/api";
import { formatCurrency, formatOdds, americanToDecimal, decimalToAmerican } from "@/lib/odds-utils";

const QUICK_STAKES = [10, 25, 50, 100];
const SNAP_POINTS = ["12%", "75%"];

type Phase = "builder" | "result" | "confirmed";

function LegRow({
  leg,
  onRemove,
  onOddsChange,
}: {
  leg: ParlayLegDraft;
  onRemove: () => void;
  onOddsChange: (val: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#0f1117",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#2d3142",
        padding: 10,
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
          {leg.selectionName}
        </Text>
        <Text style={{ color: "#6b7280", fontSize: 11 }} numberOfLines={1}>
          {leg.eventLabel} · {leg.marketType}
        </Text>
      </View>
      <TextInput
        value={leg.requestedOdds.toString()}
        onChangeText={onOddsChange}
        keyboardType="numbers-and-punctuation"
        style={{
          backgroundColor: "#1a1d27",
          color: "#ffffff",
          borderWidth: 1,
          borderColor: "#4b5563",
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          fontSize: 14,
          fontWeight: "700",
          width: 72,
          textAlign: "center",
        }}
      />
      <TouchableOpacity onPress={onRemove} style={{ padding: 4 }}>
        <Text style={{ color: "#6b7280", fontSize: 18, lineHeight: 20 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ParlaySheet() {
  const { legs, removeLeg, updateOdds, clear, combinedOdds } = useParlay();
  const sheetRef = useRef<BottomSheet>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [stakeInput, setStakeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("builder");
  const [result, setResult] = useState<ParlayRequestResult | null>(null);
  const [countdown, setCountdown] = useState(120);

  // Expand when legs added
  useEffect(() => {
    if (legs.length > 0 && !isOpen) {
      sheetRef.current?.snapToIndex(0);
    }
  }, [legs.length]);

  // Countdown for counter
  useEffect(() => {
    if (phase !== "result" || result?.decision !== "COUNTER") return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, result?.decision]);

  const handleOpen = useCallback(() => {
    sheetRef.current?.snapToIndex(1);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    sheetRef.current?.snapToIndex(-1);
    setIsOpen(false);
  }, []);

  const stake = parseFloat(stakeInput);
  const validStake = !isNaN(stake) && stake > 0;
  const estimatedPayout =
    validStake && legs.length >= 2
      ? parseFloat(
          (
            stake *
            legs.reduce((acc, l) => acc * americanToDecimal(l.requestedOdds), 1)
          ).toFixed(2)
        )
      : 0;

  const handleRequest = async () => {
    if (legs.length < 2) { Alert.alert("Need at least 2 legs"); return; }
    if (!validStake) { Alert.alert("Enter a valid stake"); return; }
    setLoading(true);
    try {
      const res = await parlays.request(
        legs.map((l) => ({ selectionId: l.selectionId, requestedOdds: l.requestedOdds })),
        stake
      );
      setResult(res);
      setPhase("result");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!result?.parlayId) return;
    setLoading(true);
    try {
      await parlays.confirm(result.parlayId);
      setPhase("confirmed");
      clear();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setLoading(false);
    }
  };

  const decisionColor = {
    ACCEPT: "#22c55e",
    COUNTER: "#f59e0b",
    REJECT: "#ef4444",
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onClose={() => setIsOpen(false)}
      backgroundStyle={{ backgroundColor: "#1a1d27" }}
      handleIndicatorStyle={{ backgroundColor: "#4b5563" }}
    >
      {/* Collapsed handle / tab */}
      <TouchableOpacity
        onPress={isOpen ? handleClose : handleOpen}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15 }}>Parlay Slip</Text>
          {legs.length > 0 && (
            <View style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{legs.length}</Text>
            </View>
          )}
        </View>
        {legs.length > 0 && (
          <Text style={{ color: "#6b7280", fontSize: 13 }}>{isOpen ? "▼ Hide" : "▲ Show"}</Text>
        )}
      </TouchableOpacity>

      {/* Content */}
      <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
        {phase === "builder" && (
          <>
            {legs.length === 0 ? (
              <Text style={{ color: "#6b7280", textAlign: "center", marginTop: 20 }}>
                Tap "+ Parlay" on any selection to add legs.
              </Text>
            ) : (
              <>
                <View style={{ gap: 8, marginBottom: 16 }}>
                  {legs.map((leg) => (
                    <LegRow
                      key={leg.selectionId}
                      leg={leg}
                      onRemove={() => removeLeg(leg.selectionId)}
                      onOddsChange={(val) => {
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) updateOdds(leg.selectionId, n);
                      }}
                    />
                  ))}
                </View>

                {/* Combined odds preview */}
                {legs.length >= 2 && (
                  <View
                    style={{
                      backgroundColor: "#0f1117",
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 16,
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: "#9ca3af" }}>Combined odds</Text>
                    <Text style={{ color: "#22c55e", fontWeight: "800", fontSize: 16 }}>
                      {formatOdds(combinedOdds)}
                    </Text>
                  </View>
                )}

                {/* Stake */}
                <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 6 }}>Stake</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  {QUICK_STAKES.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      onPress={() => setStakeInput(String(amt))}
                      style={{
                        flex: 1,
                        backgroundColor: stakeInput === String(amt) ? "#6366f1" : "#2d3142",
                        borderRadius: 8,
                        paddingVertical: 8,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>${amt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={stakeInput}
                  onChangeText={setStakeInput}
                  placeholder="Enter stake"
                  placeholderTextColor="#4b5563"
                  keyboardType="decimal-pad"
                  style={{
                    backgroundColor: "#0f1117",
                    color: "#ffffff",
                    borderWidth: 1,
                    borderColor: "#2d3142",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 15,
                    marginBottom: 12,
                  }}
                />

                {/* Payout preview */}
                {validStake && estimatedPayout > 0 && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
                    <Text style={{ color: "#6b7280" }}>Potential payout</Text>
                    <Text style={{ color: "#22c55e", fontWeight: "700" }}>
                      {formatCurrency(estimatedPayout)}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={handleRequest}
                  disabled={loading || legs.length < 2 || !validStake}
                  style={{
                    backgroundColor: "#6366f1",
                    borderRadius: 10,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: loading || legs.length < 2 || !validStake ? 0.6 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                      Request {legs.length}-Leg Parlay
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={clear} style={{ marginTop: 12, alignItems: "center" }}>
                  <Text style={{ color: "#6b7280", fontSize: 13 }}>Clear all</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {phase === "result" && result && (
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                color: decisionColor[result.decision] ?? "#fff",
                fontSize: 28,
                fontWeight: "800",
                marginBottom: 8,
              }}
            >
              {result.decision === "ACCEPT" ? "✅ ACCEPTED" : result.decision === "COUNTER" ? "🔄 COUNTER" : "❌ REJECTED"}
            </Text>

            {result.decision === "ACCEPT" && (
              <>
                <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 16 }}>
                  Your parlay is placed at{" "}
                  <Text style={{ color: "#22c55e", fontWeight: "700" }}>{formatOdds(result.combinedOdds)}</Text>
                </Text>
                <View style={{ backgroundColor: "#0f1117", borderRadius: 12, padding: 16, width: "100%", gap: 8 }}>
                  <Row label="Stake" value={formatCurrency(stake)} />
                  <Row label="Combined odds" value={formatOdds(result.combinedOdds)} />
                  <Row label="Potential payout" value={formatCurrency(result.potentialPayout)} isGreen />
                </View>
                <TouchableOpacity onPress={() => { setPhase("builder"); handleClose(); }} style={{ marginTop: 20, backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </>
            )}

            {result.decision === "COUNTER" && (
              <>
                <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 4 }}>
                  Counter offer at
                </Text>
                <Text style={{ color: "#f59e0b", fontSize: 28, fontWeight: "800", marginBottom: 4 }}>
                  {formatOdds(result.combinedOdds)}
                </Text>
                <Text style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
                  Expires in {countdown}s
                </Text>

                {/* Per-leg breakdown */}
                <View style={{ backgroundColor: "#0f1117", borderRadius: 12, padding: 12, width: "100%", gap: 6, marginBottom: 16 }}>
                  {result.legs.map((leg, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: "#9ca3af", fontSize: 12, flex: 1 }} numberOfLines={1}>
                        Leg {i + 1}
                      </Text>
                      <Text
                        style={{
                          color: leg.decision === "ACCEPT" ? "#22c55e" : leg.decision === "COUNTER" ? "#f59e0b" : "#ef4444",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {formatOdds(leg.acceptedOdds)}
                      </Text>
                    </View>
                  ))}
                  <View style={{ borderTopWidth: 1, borderTopColor: "#2d3142", marginTop: 6, paddingTop: 6 }}>
                    <Row label="Stake" value={formatCurrency(stake)} />
                    <Row label="Potential payout" value={formatCurrency(result.potentialPayout)} isGreen />
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
                  <TouchableOpacity onPress={() => setPhase("builder")} style={{ flex: 1, backgroundColor: "#1a1d27", borderRadius: 10, paddingVertical: 14, alignItems: "center" }}>
                    <Text style={{ color: "#9ca3af", fontWeight: "700" }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleConfirm} disabled={loading} style={{ flex: 2, backgroundColor: "#f59e0b", borderRadius: 10, paddingVertical: 14, alignItems: "center" }}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Accept {formatOdds(result.combinedOdds)}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {result.decision === "REJECT" && (
              <>
                <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 20 }}>
                  {result.rejectReason ?? "Your parlay request was rejected."}
                </Text>
                <TouchableOpacity onPress={() => setPhase("builder")} style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Edit Parlay</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {phase === "confirmed" && (
          <View style={{ alignItems: "center", paddingTop: 20 }}>
            <Text style={{ fontSize: 48 }}>🎟️</Text>
            <Text style={{ color: "#22c55e", fontSize: 22, fontWeight: "800", marginTop: 12, marginBottom: 8 }}>
              Parlay Confirmed!
            </Text>
            <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 24 }}>
              Your parlay is live. Good luck!
            </Text>
            <TouchableOpacity onPress={() => { setPhase("builder"); handleClose(); }} style={{ backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function Row({ label, value, isGreen }: { label: string; value: string; isGreen?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>{label}</Text>
      <Text style={{ color: isGreen ? "#22c55e" : "#ffffff", fontWeight: "600", fontSize: 13 }}>{value}</Text>
    </View>
  );
}
