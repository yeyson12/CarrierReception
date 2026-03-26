import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "../store/useAuthStore";

export default function RootLayout() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const firstSegment = segments[0];
    const isLogin = firstSegment === "login";

    if (!user && !isLogin) {
      setTimeout(() => router.replace("/login"), 0);
      return;
    }

    if (user && isLogin) {
      setTimeout(() => router.replace("/"), 0);
    }
  }, [router, segments, user]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
