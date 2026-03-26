import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import type { LoginUser } from "../constants/types";

const memoryStorage = new Map<string, string>();

const safeStateStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return memoryStorage.get(name) ?? null;
    }
  },

  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
      return;
    } catch {
      memoryStorage.set(name, value);
    }
  },

  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
      return;
    } catch {
      memoryStorage.delete(name);
    }
  },
};

type AuthState = {
  user: LoginUser | null;
  setUser: (user: LoginUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,

      setUser: (user) => {
        set({ user });
      },

      logout: () => {
        set({ user: null });
      },
    }),
    {
      name: "carrier-reception-auth",
      storage: createJSONStorage(() => safeStateStorage),
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);
