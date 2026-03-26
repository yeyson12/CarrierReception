import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  listUsersWarehouse,
  loginWarehouse,
} from "../api/client";
import type { UsersWarehouseResp } from "../constants/types";
import { useAuthStore } from "../store/useAuthStore";

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [users, setUsers] = useState<UsersWarehouseResp["users"]>([]);
  const [query, setQuery] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userPickerVisible, setUserPickerVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      setErrorMsg("");

      try {
        const data = await listUsersWarehouse();
        if (data.ok) {
          setUsers(data.users);
        } else {
          setErrorMsg("Failed to load users");
        }
      } catch {
        setErrorMsg("Failed to load users");
      } finally {
        setLoadingUsers(false);
      }
    };

    void load();
  }, []);

  const filteredUsers = users.filter((user) =>
    user.correo
      .toLowerCase()
      .includes(userSearch.trim().toLowerCase())
  );
  const selectedUser =
    users.find(
      (user) =>
        user.correo.toLowerCase() === query.trim().toLowerCase()
    ) || null;

  const submitLogin = async () => {
    setErrorMsg("");

    const resolvedUser = query.trim();

    if (!resolvedUser) {
      setErrorMsg("Enter user");
      return;
    }

    if (!password.trim()) {
      setErrorMsg("Enter password");
      return;
    }

    setLoadingLogin(true);
    try {
      const response = await loginWarehouse({
        name: resolvedUser,
        password,
      });

      if (response.ok && response.user.user_id !== "") {
        setUser(response.user);
        router.replace("/");
        return;
      }

      setErrorMsg("Invalid credentials");
    } catch {
      setErrorMsg("Login error");
    } finally {
      setLoadingLogin(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.scrollContent,
            isLandscape && styles.scrollContentLandscape,
          ]}
        >
          <View
            style={[
              styles.card,
              isLandscape && styles.cardLandscape,
            ]}
          >
            <Text style={styles.title}>Carrier Reception</Text>
            <Text style={styles.subtitle}>Warehouse Login</Text>

            <View
              style={[
                styles.formGrid,
                isLandscape && styles.formGridLandscape,
              ]}
            >
              <View style={styles.formPane}>
                <Text style={styles.label}>User</Text>
                <Pressable
                  style={styles.userSelector}
                  onPress={() => {
                    setUserSearch("");
                    setUserPickerVisible(true);
                  }}
                >
                  <View style={styles.userSelectorCopy}>
                    <Text
                      style={[
                        styles.userSelectorValue,
                        !query.trim() &&
                          styles.userSelectorPlaceholder,
                      ]}
                    >
                      {query.trim() || "Select user"}
                    </Text>
                    {selectedUser ? (
                      <Text style={styles.userSelectorMeta}>
                        {selectedUser.name}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color="#4b5563"
                  />
                </Pressable>

                {loadingUsers ? (
                  <ActivityIndicator style={styles.loader} />
                ) : (
                  <Pressable
                    style={styles.selectUserBtn}
                    onPress={() => {
                      setUserSearch("");
                      setUserPickerVisible(true);
                    }}
                  >
                    <Text style={styles.selectUserBtnText}>
                      Open user list
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.formPane}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    style={[styles.input, styles.passwordInput]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => void submitLogin()}
                  />
                  <Pressable
                    onPress={() =>
                      setShowPassword((prev) => !prev)
                    }
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={22}
                      color="#4b5563"
                    />
                  </Pressable>
                </View>

                {errorMsg ? (
                  <Text style={styles.error}>{errorMsg}</Text>
                ) : null}

                <Pressable
                  onPress={() => void submitLogin()}
                  disabled={loadingLogin}
                  style={[
                    styles.loginBtn,
                    loadingLogin && styles.loginBtnDisabled,
                  ]}
                >
                  <Text style={styles.loginBtnText}>
                    {loadingLogin ? "Loading..." : "Login"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={userPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUserPickerVisible(false)}
      >
        <View style={styles.userModalOverlay}>
          <View
            style={[
              styles.userModalCard,
              isLandscape && styles.userModalCardLandscape,
            ]}
          >
            <Text style={styles.userModalTitle}>Select user</Text>
            <TextInput
              placeholder="Search user..."
              style={styles.input}
              value={userSearch}
              onChangeText={setUserSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {loadingUsers ? (
              <ActivityIndicator style={styles.loader} />
            ) : (
              <View style={styles.usersListModal}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {filteredUsers.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        setQuery(item.correo);
                        setUserSearch(item.correo);
                        setUserPickerVisible(false);
                      }}
                      style={[
                        styles.userRow,
                        query.trim().toLowerCase() ===
                          item.correo.toLowerCase() &&
                          styles.userRowSelected,
                      ]}
                    >
                      <Text style={styles.userName}>{item.name}</Text>
                      <Text style={styles.userEmail}>
                        {item.correo}
                      </Text>
                    </Pressable>
                  ))}

                  {!filteredUsers.length ? (
                    <Text style={styles.emptyUsersText}>
                      No users found
                    </Text>
                  ) : null}
                </ScrollView>
              </View>
            )}

            <Pressable
              style={styles.modalCancelBtn}
              onPress={() => setUserPickerVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  scrollContent: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  scrollContentLandscape: {
    justifyContent: "flex-start",
    paddingVertical: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#d1d5db",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  cardLandscape: {
    maxWidth: 920,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    marginBottom: 18,
  },
  formGrid: {
    gap: 18,
  },
  formGridLandscape: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  formPane: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1f2937",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    color: "#111827",
  },
  loader: {
    marginVertical: 12,
  },
  userSelector: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  userSelectorCopy: {
    flex: 1,
  },
  userSelectorValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  userSelectorPlaceholder: {
    color: "#9ca3af",
    fontWeight: "500",
  },
  userSelectorMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  selectUserBtn: {
    marginBottom: 18,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#e0f2fe",
    paddingVertical: 12,
    alignItems: "center",
  },
  selectUserBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f766e",
  },
  usersListModal: {
    flex: 1,
    minHeight: 220,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  userRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  userRowSelected: {
    backgroundColor: "#dbeafe",
  },
  userName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  userEmail: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  emptyUsersText: {
    padding: 16,
    textAlign: "center",
    color: "#6b7280",
    fontWeight: "700",
  },
  passwordWrap: {
    position: "relative",
    marginBottom: 8,
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  error: {
    marginTop: 10,
    color: "#b91c1c",
    fontWeight: "700",
  },
  loginBtn: {
    marginTop: 22,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  userModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    padding: 20,
    justifyContent: "center",
  },
  userModalCard: {
    flex: 1,
    maxHeight: 640,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 18,
  },
  userModalCardLandscape: {
    maxHeight: "92%",
  },
  userModalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 12,
  },
  modalCancelBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
});
