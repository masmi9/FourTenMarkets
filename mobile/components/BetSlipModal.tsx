import { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { bets, BetRequestResult, Selection } from "@/lib/api";
import { formatCurrency, formatOdds, calcProfit } from "@/lib/odds-utils";

const QUICK_STAKES = [10, 25, 50, 100];

interface Props {
  selection: Selection;
  eventLabel: string;
  onClose: () => void;
}

type Phase = "input" | "result" | "confirmed";

export function BetSlipModal({ selection, eventLabel, onClose }: Props) {
  const [oddsInput, setOddsInput] = useState(
    selection.consensus?.odds?.toString() ?? "-110"
  );
  const [stakeInput, setStakeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<BetRequestResult | null>(null);
  const [countdown, setCountdown] = useState(120);

  // Countdown for counter offer
  useEffect(() => {
    if (phase !== "result" || result?.decision !== "COUNTER") return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, result?.decision]);

  const requestedOdds = parseInt(oddsInput, 10);
  const stake = parseFloat(stakeInput);
  const validOdds = !isNaN(requestedOdds) && (requestedOdds >= 100 || requestedOdds <= -100);
  const validStake = !isNaN(stake) && stake > 0;
  const estimatedProfit = validOdds && validStake ? calcProfit(stake, requestedOdds) : 0;

  const handleRequest = async () => {
    if (!validOdds || !validStake) {
      Alert.alert("Invalid input", "Enter valid odds (e.g. +150 or -110) and a positive stake.");
      return;
    }
    setLoading(true);
    try {
      const res = await bets.request(selection.id, requestedOdds, stake);
      setResult(res);
      setPhase("result");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCounter = async () => {
    if (!result?.requestId) return;
    setLoading(true);
    try {
      await bets.confirm(result.requestId);
      setPhase("confirmed");
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
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "#0f1117" }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: "#1f2937",
          }}
        >
          <View>
            <Text style={{ color: "#9ca3af", fontSize: 12 }}>{eventLabel}</Text>
            <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 17 }}>
              {selection.name}
              {selection.line ? ` ${selection.line}` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Text style={{ color: "#9ca3af", fontSize: 24, lineHeight: 24 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {phase === "input" && (
            <>
              {/* Consensus */}
              {selection.consensus && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: "#6b7280", fontSize: 13 }}>Consensus odds</Text>
                  <Text
                    style={{
                      color: selection.consensus.odds > 0 ? "#22c55e" : "#ffffff",
                      fontSize: 22,
                      fontWeight: "800",
                    }}
                  >
                    {formatOdds(selection.consensus.odds)}
                  </Text>
                </View>
              )}

              {/* Odds input */}
              <Text style={{ color: "#9ca3af", fontSize: 13, fontWeight: "500", marginBottom: 6 }}>
                Your Odds Request
              </Text>
              <TextInput
                value={oddsInput}
                onChangeText={setOddsInput}
                placeholder="+150 or -110"
                placeholderTextColor="#4b5563"
                keyboardType="numbers-and-punctuation"
                style={{
                  backgroundColor: "#1a1d27",
                  color: "#ffffff",
                  borderWidth: 1,
                  borderColor: "#2d3142",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: 20,
                }}
              />

              {/* Stake */}
              <Text style={{ color: "#9ca3af", fontSize: 13, fontWeight: "500", marginBottom: 6 }}>
                Stake
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
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
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>${amt}</Text>
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
                  backgroundColor: "#1a1d27",
                  color: "#ffffff",
                  borderWidth: 1,
                  borderColor: "#2d3142",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  marginBottom: 20,
                }}
              />

              {/* Preview */}
              {validOdds && validStake && (
                <View
                  style={{
                    backgroundColor: "#1a1d27",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 20,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: "#6b7280" }}>Potential profit</Text>
                  <Text style={{ color: "#22c55e", fontWeight: "700" }}>
                    {formatCurrency(estimatedProfit)}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleRequest}
                disabled={loading || !validOdds || !validStake}
                style={{
                  backgroundColor: "#6366f1",
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: loading || !validOdds || !validStake ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Request Odds</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {phase === "result" && result && (
            <View style={{ alignItems: "center" }}>
              {/* Decision badge */}
              <View
                style={{
                  backgroundColor: decisionColor[result.decision] + "22",
                  borderRadius: 50,
                  width: 80,
                  height: 80,
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 36 }}>
                  {result.decision === "ACCEPT" ? "✅" : result.decision === "COUNTER" ? "🔄" : "❌"}
                </Text>
              </View>
              <Text
                style={{
                  color: decisionColor[result.decision],
                  fontSize: 26,
                  fontWeight: "800",
                  marginBottom: 8,
                }}
              >
                {result.decision}
              </Text>

              {result.decision === "ACCEPT" && (
                <>
                  <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 20 }}>
                    Your bet has been placed at{" "}
                    <Text style={{ color: "#22c55e", fontWeight: "700" }}>
                      {formatOdds(result.acceptedOdds)}
                    </Text>
                  </Text>
                  <View style={{ backgroundColor: "#1a1d27", borderRadius: 12, padding: 16, width: "100%", gap: 8 }}>
                    <Row label="Stake" value={formatCurrency(stake)} />
                    <Row label="Odds" value={formatOdds(result.acceptedOdds)} />
                    <Row label="Potential payout" value={formatCurrency(result.potentialPayout)} isGreen />
                  </View>
                  <TouchableOpacity onPress={onClose} style={{ marginTop: 20, backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Done</Text>
                  </TouchableOpacity>
                </>
              )}

              {result.decision === "COUNTER" && (
                <>
                  <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 6 }}>
                    The exchange offers you
                  </Text>
                  <Text style={{ color: "#f59e0b", fontSize: 32, fontWeight: "800", marginBottom: 4 }}>
                    {formatOdds(result.acceptedOdds)}
                  </Text>
                  <Text style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
                    Expires in {countdown}s
                  </Text>
                  <View style={{ backgroundColor: "#1a1d27", borderRadius: 12, padding: 16, width: "100%", gap: 8, marginBottom: 20 }}>
                    <Row label="Your request" value={formatOdds(requestedOdds)} />
                    <Row label="Counter offer" value={formatOdds(result.acceptedOdds)} />
                    <Row label="Stake" value={formatCurrency(stake)} />
                    <Row label="Potential payout" value={formatCurrency(result.potentialPayout)} isGreen />
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                    <TouchableOpacity
                      onPress={onClose}
                      style={{ flex: 1, borderRadius: 10, paddingVertical: 14, backgroundColor: "#1a1d27", alignItems: "center" }}
                    >
                      <Text style={{ color: "#9ca3af", fontWeight: "700" }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleConfirmCounter}
                      disabled={loading}
                      style={{ flex: 2, borderRadius: 10, paddingVertical: 14, backgroundColor: "#f59e0b", alignItems: "center" }}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Accept {formatOdds(result.acceptedOdds)}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {result.decision === "REJECT" && (
                <>
                  <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 4 }}>
                    {result.reason ?? "Your odds request was rejected."}
                  </Text>
                  {selection.consensus && (
                    <Text style={{ color: "#6b7280", textAlign: "center", marginBottom: 20 }}>
                      Consensus: {formatOdds(selection.consensus.odds)}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setPhase("input")}
                    style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Try Again</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {phase === "confirmed" && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Text style={{ fontSize: 56 }}>🎟️</Text>
              <Text style={{ color: "#22c55e", fontSize: 24, fontWeight: "800", marginTop: 16, marginBottom: 8 }}>
                Bet Confirmed!
              </Text>
              <Text style={{ color: "#9ca3af", textAlign: "center", marginBottom: 30 }}>
                Your bet has been placed and will settle when the game ends.
              </Text>
              <TouchableOpacity onPress={onClose} style={{ backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ label, value, isGreen }: { label: string; value: string; isGreen?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: "#6b7280" }}>{label}</Text>
      <Text style={{ color: isGreen ? "#22c55e" : "#ffffff", fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
