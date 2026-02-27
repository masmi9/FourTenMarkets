import { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      Alert.alert("Login Failed", err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#0f1117" }}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        {/* Logo */}
        <View style={{ marginBottom: 40, alignItems: "center" }}>
          <Image
            source={require("../../assets/images/fourten-logo.png")}
            style={{ width: 180, height: 60, resizeMode: "contain", marginBottom: 16 }}
          />
          <Text style={{ color: "#6b7280", fontSize: 15 }}>
            Sign in to your account
          </Text>
        </View>

        {/* Email */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13, fontWeight: "500" }}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#4b5563"
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              backgroundColor: "#1a1d27",
              color: "#ffffff",
              borderWidth: 1,
              borderColor: "#2d3142",
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
            }}
          />
        </View>

        {/* Password */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13, fontWeight: "500" }}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#4b5563"
            secureTextEntry
            style={{
              backgroundColor: "#1a1d27",
              color: "#ffffff",
              borderWidth: 1,
              borderColor: "#2d3142",
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
            }}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          style={{
            backgroundColor: "#6366f1",
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Sign In</Text>
          )}
        </TouchableOpacity>

        {/* Sign up link */}
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 20 }}>
          <Text style={{ color: "#6b7280" }}>Don't have an account? </Text>
          <Link href="/(auth)/signup">
            <Text style={{ color: "#6366f1", fontWeight: "600" }}>Sign Up</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
