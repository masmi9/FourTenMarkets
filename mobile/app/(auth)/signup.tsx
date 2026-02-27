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
  ScrollView,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function SignupScreen() {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), password, name.trim() || undefined);
    } catch (err: unknown) {
      Alert.alert("Sign Up Failed", err instanceof Error ? err.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: "#1a1d27",
    color: "#ffffff",
    borderWidth: 1,
    borderColor: "#2d3142",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  } as const;

  const labelStyle = {
    color: "#9ca3af",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "500" as const,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#0f1117" }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginBottom: 40, alignItems: "center" }}>
          <Image
            source={require("../../assets/images/fourten-logo.png")}
            style={{ width: 180, height: 60, resizeMode: "contain", marginBottom: 16 }}
          />
          <Text style={{ color: "#6b7280", fontSize: 15 }}>
            Create your account
          </Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={labelStyle}>Name (optional)</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#4b5563"
            style={inputStyle}
          />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={labelStyle}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#4b5563"
            autoCapitalize="none"
            keyboardType="email-address"
            style={inputStyle}
          />
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={labelStyle}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 characters"
            placeholderTextColor="#4b5563"
            secureTextEntry
            style={inputStyle}
          />
        </View>

        <TouchableOpacity
          onPress={handleSignup}
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
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 20 }}>
          <Text style={{ color: "#6b7280" }}>Already have an account? </Text>
          <Link href="/(auth)/login">
            <Text style={{ color: "#6366f1", fontWeight: "600" }}>Sign In</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
