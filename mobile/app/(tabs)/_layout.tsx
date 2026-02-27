import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ParlaySheet } from "@/components/ParlaySheet";
import { View } from "react-native";

function TabIcon({
  name,
  color,
  size,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  size: number;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarStyle: {
            backgroundColor: "#0f1117",
            borderTopColor: "#1f2937",
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: "#6366f1",
          tabBarInactiveTintColor: "#6b7280",
          headerStyle: { backgroundColor: "#0f1117" },
          headerTintColor: "#ffffff",
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="grid-outline" color={color} size={size} />
            ),
            headerTitle: "FourTen Markets",
          }}
        />
        <Tabs.Screen
          name="markets"
          options={{
            title: "Markets",
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="bar-chart-outline" color={color} size={size} />
            ),
            headerTitle: "Markets",
          }}
        />
        <Tabs.Screen
          name="bets"
          options={{
            title: "My Bets",
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="receipt-outline" color={color} size={size} />
            ),
            headerTitle: "My Bets",
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: "Wallet",
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="wallet-outline" color={color} size={size} />
            ),
            headerTitle: "Wallet",
          }}
        />
      </Tabs>
      {/* Parlay slip floats above tabs */}
      <ParlaySheet />
    </View>
  );
}
