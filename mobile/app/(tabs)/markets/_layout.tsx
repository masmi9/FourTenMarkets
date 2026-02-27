import { Stack } from "expo-router";

export default function MarketsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0f1117" },
        headerTintColor: "#ffffff",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "#0f1117" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Markets" }} />
      <Stack.Screen name="[eventId]" options={{ title: "Event" }} />
    </Stack>
  );
}
