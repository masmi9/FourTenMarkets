import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { wallet, Wallet, Transaction } from "@/lib/api";
import { formatCurrency } from "@/lib/odds-utils";

const QUICK_AMOUNTS = [25, 50, 100, 250];

function TxRow({ tx }: { tx: Transaction }) {
  const amount = parseFloat(tx.amount);
  const isCredit = ["DEPOSIT", "BET_WIN", "UNLOCK"].includes(tx.type);

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#1f2937",
      }}
    >
      <View>
        <Text style={{ color: "#ffffff", fontWeight: "500", fontSize: 14 }}>{tx.type.replace("_", " ")}</Text>
        <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
          {new Date(tx.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <Text
        style={{
          color: isCredit ? "#22c55e" : "#ef4444",
          fontWeight: "700",
          fontSize: 15,
        }}
      >
        {isCredit ? "+" : "-"}
        {formatCurrency(Math.abs(amount))}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const [walletData, setWalletData] = useState<Wallet | null>(null);
  const [txList, setTxList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [submitting, setSubmitting] = useState<"deposit" | "withdraw" | null>(null);

  const load = useCallback(async () => {
    const [w, txs] = await Promise.all([wallet.get(), wallet.transactions()]);
    setWalletData(w);
    setTxList(txs);
  }, []);

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().catch(console.error).finally(() => setRefreshing(false));
  }, [load]);

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount");
      return;
    }
    setSubmitting("deposit");
    try {
      const updated = await wallet.deposit(amount);
      setWalletData(updated);
      setDepositAmount("");
      Alert.alert("Success", `${formatCurrency(amount)} deposited.`);
      load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount");
      return;
    }
    setSubmitting("withdraw");
    try {
      const updated = await wallet.withdraw(amount);
      setWalletData(updated);
      setWithdrawAmount("");
      Alert.alert("Success", `${formatCurrency(amount)} withdrawn.`);
      load();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f1117", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  const available = walletData?.available ?? 0;
  const balance = parseFloat(walletData?.balance ?? "0");
  const locked = parseFloat(walletData?.lockedBalance ?? "0");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0f1117" }}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
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
        <Text style={{ color: "#22c55e", fontSize: 36, fontWeight: "800" }}>
          {formatCurrency(available)}
        </Text>
        <View style={{ flexDirection: "row", gap: 20, marginTop: 12 }}>
          <View>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>Total Balance</Text>
            <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 14 }}>
              {formatCurrency(balance)}
            </Text>
          </View>
          <View>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>In Use</Text>
            <Text style={{ color: "#f59e0b", fontWeight: "600", fontSize: 14 }}>
              {formatCurrency(locked)}
            </Text>
          </View>
        </View>
      </View>

      {/* Deposit */}
      <View
        style={{
          backgroundColor: "#1a1d27",
          borderRadius: 14,
          padding: 16,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: "#2d3142",
        }}
      >
        <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15, marginBottom: 12 }}>Deposit</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {QUICK_AMOUNTS.map((amt) => (
            <TouchableOpacity
              key={amt}
              onPress={() => setDepositAmount(String(amt))}
              style={{
                flex: 1,
                backgroundColor: depositAmount === String(amt) ? "#6366f1" : "#2d3142",
                borderRadius: 8,
                paddingVertical: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 13 }}>${amt}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={depositAmount}
          onChangeText={setDepositAmount}
          placeholder="Custom amount"
          placeholderTextColor="#4b5563"
          keyboardType="decimal-pad"
          style={{
            backgroundColor: "#0f1117",
            color: "#ffffff",
            borderWidth: 1,
            borderColor: "#2d3142",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            marginBottom: 12,
          }}
        />
        <TouchableOpacity
          onPress={handleDeposit}
          disabled={submitting === "deposit"}
          style={{
            backgroundColor: "#22c55e",
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {submitting === "deposit" ? "Processing..." : "Deposit"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Withdraw */}
      <View
        style={{
          backgroundColor: "#1a1d27",
          borderRadius: 14,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1,
          borderColor: "#2d3142",
        }}
      >
        <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15, marginBottom: 12 }}>Withdraw</Text>
        <TextInput
          value={withdrawAmount}
          onChangeText={setWithdrawAmount}
          placeholder="Amount to withdraw"
          placeholderTextColor="#4b5563"
          keyboardType="decimal-pad"
          style={{
            backgroundColor: "#0f1117",
            color: "#ffffff",
            borderWidth: 1,
            borderColor: "#2d3142",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            marginBottom: 12,
          }}
        />
        <TouchableOpacity
          onPress={handleWithdraw}
          disabled={submitting === "withdraw"}
          style={{
            backgroundColor: "#ef4444",
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {submitting === "withdraw" ? "Processing..." : "Withdraw"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Transactions */}
      <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
        Transactions
      </Text>
      {txList.length === 0 ? (
        <Text style={{ color: "#6b7280" }}>No transactions yet.</Text>
      ) : (
        txList.map((tx) => <TxRow key={tx.id} tx={tx} />)
      )}
    </ScrollView>
  );
}
