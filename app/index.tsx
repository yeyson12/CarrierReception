import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  AppState,
  BackHandler,
  NativeSyntheticEvent,
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
  TouchableOpacity,
  View,
} from "react-native";
import type { TextInput as TextInputType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  printCarrierDidLabel,
  printTestLabel,
  resetPrintLock,
} from "../utils/carrierDidPrint";
import { API_BASE } from "../constants/config";
import { useAuthStore } from "../store/useAuthStore";
import { carrierReceptionAudio } from "../utils/audioFeedback";

type BarcodeRow = {
  id: string;
  barcode: string;
  did: string;
  manual: boolean;
  created_at: string | null;
};

type CarrierOption = {
  id: string;
  label: string;
};

type LocationOption = {
  id: string;
  label: string;
};

type SubmitRow = {
  barcode: string;
  did: string | null;
  manual: boolean;
  created_at: string;
};

const LOCATION_OPTIONS: LocationOption[] = [
  { id: "1", label: "1" },
  { id: "4", label: "4" },
];

const CARRIER_OPTIONS: CarrierOption[] = [
  { id: "FEDEX", label: "FedEx" },
  { id: "UPS", label: "UPS" },
  { id: "LTL", label: "LTL / Other" },
];

const LOOKUP_ENDPOINT = `${API_BASE}/lookup_did`;
const SUBMIT_ENDPOINT = `${API_BASE}/carrier_reception/submit`;

const createEmptyRow = (): BarcodeRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  barcode: "",
  did: "",
  manual: false,
  created_at: null,
});

const formatCreatedAt = (date: Date): string => {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}`,
  ].join(" ");
};

const formatRemoteErrors = (errors: unknown): string => {
  if (!errors || typeof errors !== "object") return "";

  return Object.entries(errors as Record<string, string[] | string>)
    .map(([field, value]) => {
      const message = Array.isArray(value)
        ? value.join(", ")
        : String(value);
      return `${field}: ${message}`;
    })
    .join("\n");
};

const getValidationSpeechMessage = (message?: string): string => {
  switch (message) {
    case "Please select a carrier before scanning.":
      return "Carrier.";
    case "Empty tracking.":
      return "Vacio.";
    case "This tracking is already added.":
      return "Duplicado.";
    case "UPS tracking must have between 17 and 19 characters.":
      return "Invalido.";
    case "FedEx tracking must have between 30 and 35 characters.":
      return "Invalido.";
    default: {
      const fallback = String(message || "").trim();
      return fallback ? "Advertencia." : "Advertencia.";
    }
  }
};

const logCarrierReception = (
  event: string,
  payload?: Record<string, unknown>
) => {
  if (payload) {
    console.info(`[carrier-reception] ${event}`, payload);
    return;
  }

  console.info(`[carrier-reception] ${event}`);
};

export default function CarrierReceptionScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [location, setLocation] = useState("4");
  const [locationModalVisible, setLocationModalVisible] =
    useState(false);
  const [carrier, setCarrier] = useState<CarrierOption | null>(null);
  const [carrierModalVisible, setCarrierModalVisible] = useState(false);

  const [claimed, setClaimed] = useState(0);
  const [rows, setRows] = useState<BarcodeRow[]>([createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [printerActionBusy, setPrinterActionBusy] = useState(false);

  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadValue, setKeypadValue] = useState("0");

  const topBarcodeRef = useRef<TextInputType | null>(null);
  const rowsRef = useRef<BarcodeRow[]>(rows);

  const scannedCount = useMemo(
    () => rows.filter((row) => row.barcode.trim() !== "").length,
    [rows]
  );
  const diff = scannedCount - claimed;
  const scanningEnabled = !!carrier;
  const setupLocked = scannedCount > 0;

  const focusTopBarcode = useCallback(() => {
    setTimeout(() => {
      Keyboard.dismiss();
      topBarcodeRef.current?.focus();
    }, 50);
  }, []);

  const showFocusAlert = (
    title: string,
    message: string,
    onOk?: () => void
  ) => {
    Alert.alert(title, message, [
      {
        text: "OK",
        onPress: () => {
          onOk?.();
          if (!onOk) {
            focusTopBarcode();
          }
        },
      },
    ]);
  };

  const confirmLeaveScreen = useCallback(() => {
    Alert.alert(
      "Leave Carrier Reception?",
      setupLocked
        ? "Current reception will be discarded. Do you want to continue?"
        : "Do you want to leave this screen?",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => focusTopBarcode(),
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => BackHandler.exitApp(),
        },
      ]
    );
  }, [focusTopBarcode, setupLocked]);

  const handleLogoutRequest = useCallback(() => {
    Alert.alert(
      "Logout?",
      setupLocked
        ? "Current reception will be discarded. Do you want to logout?"
        : "Do you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => focusTopBarcode(),
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            logout();
            router.replace("/login");
          },
        },
      ]
    );
  }, [focusTopBarcode, logout, router, setupLocked]);

  const openLocationSelector = () => {
    if (setupLocked) {
      focusTopBarcode();
      return;
    }
    setLocationModalVisible(true);
  };

  const openCarrierSelector = () => {
    if (setupLocked) {
      focusTopBarcode();
      return;
    }
    setCarrierModalVisible(true);
  };

  const closeLocationModal = () => {
    setLocationModalVisible(false);
    focusTopBarcode();
  };

  const closeCarrierModal = () => {
    setCarrierModalVisible(false);
    focusTopBarcode();
  };

  const handleSelectLocation = (locationId: string) => {
    setLocation(locationId);
    closeLocationModal();
  };

  const handleSelectCarrier = (option: CarrierOption) => {
    setCarrier(option);
    closeCarrierModal();
  };

  const setRowsState = (
    updater:
      | BarcodeRow[]
      | ((prev: BarcodeRow[]) => BarcodeRow[])
  ) => {
    setRows((prev) => {
      const next =
        typeof updater === "function"
          ? (updater as (prev: BarcodeRow[]) => BarcodeRow[])(
              prev
            )
          : updater;
      rowsRef.current = next;
      return next;
    });
  };

  const updateRow = (id: string, patch: Partial<BarcodeRow>) => {
    setRowsState((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const addRowTop = () => {
    setRowsState((prev) => [createEmptyRow(), ...prev]);
    focusTopBarcode();
  };

  const removeRow = (id: string) => {
    setRowsState((prev) => {
      if (prev.length === 1) {
        return [
          {
            ...prev[0],
            barcode: "",
            did: "",
            manual: false,
            created_at: null,
          },
        ];
      }
      return prev.filter((row) => row.id !== id);
    });
    focusTopBarcode();
  };

  const toggleManual = (id: string, index: number) => {
    if (!scanningEnabled) return;
    setRowsState((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, manual: !row.manual }
          : row
      )
    );
    if (index === 0) {
      focusTopBarcode();
    }
  };

  const resetForm = () => {
    setClaimed(0);
    setKeypadValue("0");
    setRowsState([createEmptyRow()]);
    setTimeout(() => {
      Keyboard.dismiss();
      topBarcodeRef.current?.focus();
    }, 50);
  };

  useEffect(() => {
    if (!scanningEnabled) return;

    const timer = setTimeout(() => {
      Keyboard.dismiss();
      topBarcodeRef.current?.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, [scanningEnabled]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          focusTopBarcode();
        }
      }
    );

    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        confirmLeaveScreen();
        return true;
      }
    );

    return () => {
      appStateSubscription.remove();
      backSubscription.remove();
    };
  }, [confirmLeaveScreen, focusTopBarcode]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    void carrierReceptionAudio.warmup();

    return () => {
      carrierReceptionAudio.stopSpeech();
    };
  }, []);

  const openKeypad = () => {
    setKeypadValue(claimed.toString());
    setKeypadVisible(true);
  };

  const closeKeypad = (apply: boolean) => {
    if (apply) {
      const value = parseInt(keypadValue || "0", 10) || 0;
      setClaimed(value);
    }
    setKeypadVisible(false);
    focusTopBarcode();
  };

  const handleKeypadDigit = (key: string) => {
    setKeypadValue((prev) => {
      if (prev === "0") return key;
      return prev + key;
    });
  };

  const handleKeypadAction = (
    action: "clear" | "back" | "ok" | "cancel"
  ) => {
    if (action === "clear") {
      setKeypadValue("0");
      return;
    }

    if (action === "back") {
      setKeypadValue((prev) => {
        const next = prev.slice(0, -1);
        return next === "" ? "0" : next;
      });
      return;
    }

    if (action === "ok") {
      closeKeypad(true);
      return;
    }

    closeKeypad(false);
  };

  const isDuplicateTracking = (trimmed: string, currentId: string) => {
    if (!trimmed) return false;
    return rows.some(
      (row) =>
        row.id !== currentId && row.barcode.trim() === trimmed
    );
  };

  const validateTracking = (
    trimmed: string,
    currentId: string
  ): { ok: boolean; error?: string } => {
    if (!carrier) {
      return {
        ok: false,
        error: "Please select a carrier before scanning.",
      };
    }

    if (!trimmed) {
      return { ok: false, error: "Empty tracking." };
    }

    if (isDuplicateTracking(trimmed, currentId)) {
      return {
        ok: false,
        error: "This tracking is already added.",
      };
    }

    if (carrier.id === "UPS") {
      if (trimmed.length < 17 || trimmed.length > 19) {
        return {
          ok: false,
          error:
            "UPS tracking must have between 17 and 19 characters.",
        };
      }
    } else if (carrier.id === "FEDEX") {
      if (trimmed.length < 30 || trimmed.length > 35) {
        return {
          ok: false,
          error:
            "FedEx tracking must have between 30 and 35 characters.",
        };
      }
    }

    return { ok: true };
  };

  const buildSubmitRows = (): {
    ok: boolean;
    rows?: SubmitRow[];
    error?: string;
  } => {
    const activeRows = rows
      .map((row) => ({
        barcode: row.barcode.trim(),
        did: row.did.trim(),
        manual: row.manual,
        created_at: row.created_at,
      }))
      .filter((row) => row.barcode !== "");

    if (activeRows.length === 0) {
      return {
        ok: false,
        error: "Scan at least one barcode before submitting.",
      };
    }

    const seen = new Set<string>();

    for (const row of activeRows) {
      if (seen.has(row.barcode)) {
        return {
          ok: false,
          error: `Duplicate barcode detected: ${row.barcode}`,
        };
      }
      seen.add(row.barcode);
    }

    return {
      ok: true,
      rows: activeRows.map((row) => ({
        barcode: row.barcode,
        did: row.did === "" ? null : row.did,
        manual: row.manual || row.did === "",
        created_at: row.created_at || formatCreatedAt(new Date()),
      })),
    };
  };

  const lookupDid = async (id: string, tracking: string) => {
    const trimmed = tracking.trim();
    if (!trimmed) {
      updateRow(id, { did: "" });
      return;
    }

    const locationValue = location.trim();
    if (!locationValue) {
      updateRow(id, { did: "" });
      return;
    }

    logCarrierReception("lookup:start", {
      tracking: trimmed,
      locationid: locationValue,
    });

    try {
      const resp = await fetch(
        `${LOOKUP_ENDPOINT}?tracking=${encodeURIComponent(
          trimmed
        )}&locationid=${encodeURIComponent(locationValue)}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!resp.ok) {
        const responseText = await resp.text().catch(() => "");
        console.warn("[carrier-reception] lookup:error", {
          tracking: trimmed,
          locationid: locationValue,
          status: resp.status,
          body: responseText.slice(0, 300),
        });
        updateRow(id, { did: "" });
        return;
      }

      const data = await resp.json();
      if (data.did !== null && data.did !== undefined) {
        const did = String(data.did);
        const currentRows = rowsRef.current;
        const currentRow = currentRows.find((row) => row.id === id);
        const shouldPrint = currentRow?.did !== did;
        const nextRows = currentRows.map((row) =>
          row.id === id ? { ...row, did } : row
        );
        const position = nextRows.filter(
          (row) => row.did === did && row.barcode.trim() !== ""
        ).length;

        setRowsState(nextRows);
        void carrierReceptionAudio.sayDid(did);

        if (shouldPrint) {
          logCarrierReception("lookup:auto_print_start", {
            tracking: trimmed,
            locationid: locationValue,
            did,
            position,
          });
          try {
            await printCarrierDidLabel({
              did,
              position,
              dateISO: new Date().toISOString(),
            });
            logCarrierReception("lookup:auto_print_success", {
              tracking: trimmed,
              locationid: locationValue,
              did,
              position,
            });
          } catch (printError) {
            console.warn("DID print error:", printError);
          }
        }

        logCarrierReception("lookup:success", {
          tracking: trimmed,
          locationid: locationValue,
          did,
        });
        return;
      }

      logCarrierReception("lookup:miss", {
        tracking: trimmed,
        locationid: locationValue,
      });
      updateRow(id, { did: "" });
    } catch (err) {
      console.warn("[carrier-reception] lookup:network_error", {
        tracking: trimmed,
        locationid: locationValue,
        error: err,
      });
      updateRow(id, { did: "" });
    }
  };

  const getDidPositionForRow = (rowId: string, did: string) => {
    const targetIndex = rows.findIndex((row) => row.id === rowId);
    if (targetIndex === -1) return 1;

    return rows.slice(targetIndex).filter(
      (row) => row.did === did && row.barcode.trim() !== ""
    ).length;
  };

  const handleReprintRow = async (rowId: string) => {
    const row = rows.find((item) => item.id === rowId);
    const did = row?.did.trim() || "";

    if (!did) {
      showFocusAlert(
        "Missing DID",
        "This row has no DID to reprint."
      );
      return;
    }

    try {
      await printCarrierDidLabel({
        did,
        position: getDidPositionForRow(rowId, did),
        dateISO: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("DID reprint error:", err);
      showFocusAlert(
        "Print error",
        String((err as { message?: string })?.message || err)
      );
    }
  };

  const handlePrinterTest = async () => {
    if (printerActionBusy) return;

    setPrinterActionBusy(true);
    logCarrierReception("printer:test_start");
    try {
      await printTestLabel({
        dateISO: new Date().toISOString(),
      });
      logCarrierReception("printer:test_success");
      showFocusAlert(
        "Printer",
        "Test label sent. Verify the printer output."
      );
    } catch (err) {
      console.warn("[carrier-reception] printer:test_error", err);
      showFocusAlert(
        "Printer error",
        String((err as { message?: string })?.message || err)
      );
    } finally {
      setPrinterActionBusy(false);
    }
  };

  const handlePrinterReset = () => {
    resetPrintLock();
    logCarrierReception("printer:reset");
    showFocusAlert(
      "Printer",
      "Printer state cleared. You can retry printing now."
    );
  };

  const processTracking = (
    id: string,
    rawText: string,
    fromScan: boolean
  ) => {
    const trimmed = rawText.trim();

    if (!trimmed) {
      updateRow(id, { barcode: "", did: "", created_at: null });
      focusTopBarcode();
      return;
    }

    const result = validateTracking(trimmed, id);
    if (!result.ok) {
      void carrierReceptionAudio.warn(
        getValidationSpeechMessage(result.error)
      );
      showFocusAlert(
        "Invalid tracking",
        result.error || "Unknown validation error."
      );
      updateRow(id, {
        barcode: "",
        did: "",
        created_at: null,
      });
      focusTopBarcode();
      return;
    }

    updateRow(id, {
      barcode: trimmed,
      did: "",
      created_at: formatCreatedAt(new Date()),
    });
    void carrierReceptionAudio.success();
    void lookupDid(id, trimmed);

    if (fromScan) {
      addRowTop();
    }
  };

  const handleBarcodeChange = (id: string, text: string) => {
    setRowsState((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              barcode: text,
              did:
                row.barcode.trim() === text.trim()
                  ? row.did
                  : "",
              created_at:
                row.barcode.trim() === text.trim()
                  ? row.created_at
                  : null,
            }
          : row
      )
    );
  };

  const handleBarcodeBlur = (
    id: string,
    text: string,
    manual: boolean
  ) => {
    if (!scanningEnabled) return;
    if (!manual) return;
    processTracking(id, text, false);
  };

  const handleBarcodeSubmit = (
    id: string,
    text: string,
    event?: NativeSyntheticEvent<TextInputSubmitEditingEventData>
  ) => {
    const submittedText = event?.nativeEvent.text ?? text;

    if (!scanningEnabled) {
      void carrierReceptionAudio.warn("Carrier.");
      showFocusAlert(
        "Carrier required",
        "Please select a carrier before scanning."
      );
      updateRow(id, { barcode: "", did: "", created_at: null });
      return;
    }

    processTracking(id, submittedText, true);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (!carrier) {
      showFocusAlert(
        "Carrier required",
        "Please select a carrier before submitting."
      );
      return;
    }

    if (!location.trim()) {
      showFocusAlert(
        "Location required",
        "Please enter a valid location before submitting."
      );
      return;
    }

    if (diff !== 0) {
      showFocusAlert(
        "Review required",
        "Difference (Deff.) must be 0 before submitting."
      );
      return;
    }

    const submitRows = buildSubmitRows();
    if (!submitRows.ok || !submitRows.rows) {
      showFocusAlert(
        "Invalid payload",
        submitRows.error || "Unknown payload error."
      );
      return;
    }

    const submitUser =
      user?.name?.trim() || user?.user_id?.trim() || null;

    const payload = {
      location: location.trim(),
      carrier: carrier.id,
      claimed,
      scannedCount: submitRows.rows.length,
      diff,
      user: submitUser,
      username: submitUser,
      rows: submitRows.rows,
    };

    logCarrierReception("submit:start", {
      location: payload.location,
      carrier: payload.carrier,
      user: payload.user,
      claimed: payload.claimed,
      scannedCount: payload.scannedCount,
      diff: payload.diff,
      rowCount: payload.rows.length,
      manualRows: payload.rows.filter((row) => row.manual).length,
    });

    setSubmitting(true);

    try {
      const resp = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await resp
        .json()
        .catch(() => null as Record<string, unknown> | null);

      if (!resp.ok || data?.success === false) {
        const message =
          (typeof data?.message === "string" && data.message) ||
          `Request failed with status ${resp.status}.`;
        const remoteErrors = formatRemoteErrors(data?.errors);

        console.warn("[carrier-reception] submit:error", {
          status: resp.status,
          message,
          remoteErrors,
          location: payload.location,
          carrier: payload.carrier,
          scannedCount: payload.scannedCount,
          diff: payload.diff,
        });
        showFocusAlert(
          "Submit failed",
          remoteErrors ? `${message}\n${remoteErrors}` : message
        );
        return;
      }

      const receptionId =
        data &&
        typeof data.idcourrier_reception !== "undefined"
          ? String(data.idcourrier_reception)
          : null;

      logCarrierReception("submit:success", {
        idcourrier_reception: receptionId,
        location: payload.location,
        carrier: payload.carrier,
        scannedCount: payload.scannedCount,
        diff: payload.diff,
      });
      showFocusAlert(
        "Reception saved",
        receptionId
          ? `Reception saved successfully.\nID: ${receptionId}`
          : "Reception saved successfully.",
        resetForm
      );
    } catch (err) {
      console.warn("[carrier-reception] submit:network_error", {
        location: payload.location,
        carrier: payload.carrier,
        scannedCount: payload.scannedCount,
        diff: payload.diff,
        error: err,
      });
      showFocusAlert(
        "Network error",
        "Could not submit the carrier reception request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "bottom", "left", "right"]}
    >
      <View style={styles.rootRow}>
        <View style={styles.leftColumn}>
          <View style={styles.summaryCard}>
            <View style={styles.leftColumnTop}>
              <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <Text style={styles.pageTitle}>Carrier Reception</Text>
                <Text style={styles.pageSubtitle} numberOfLines={2}>
                  {user?.name?.trim()
                    ? `Package Tracking - ${user.name}`
                    : "Package Tracking"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleLogoutRequest}
                activeOpacity={0.85}
                focusable={false}
              >
                <Text style={styles.logoutBtnText}>Logout</Text>
              </TouchableOpacity>
              </View>

            <View style={styles.headerRow}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Location</Text>
                <TouchableOpacity
                  style={[
                    styles.input,
                    styles.dropdown,
                    setupLocked && styles.inputLocked,
                  ]}
                  onPress={openLocationSelector}
                  activeOpacity={0.8}
                  focusable={false}
                >
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {location}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Carrier</Text>
                <TouchableOpacity
                  style={[
                    styles.input,
                    styles.dropdown,
                    setupLocked && styles.inputLocked,
                  ]}
                  onPress={openCarrierSelector}
                  activeOpacity={0.8}
                  focusable={false}
                >
                  <Text
                    style={
                      carrier
                        ? styles.dropdownText
                        : styles.dropdownPlaceholderText
                    }
                    numberOfLines={1}
                  >
                    {carrier ? carrier.label : "Select carrier"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={[styles.statCard, styles.clickableCard]}
                onPress={openKeypad}
                activeOpacity={0.85}
                focusable={false}
              >
                <View style={styles.statInnerBox}>
                  <Text style={styles.statNumber}>{claimed}</Text>
                </View>
                <Text style={styles.statLabel}>Claimed</Text>
              </TouchableOpacity>

              <View style={styles.statCard}>
                <View style={styles.statInnerBox}>
                  <Text style={styles.statNumber}>{scannedCount}</Text>
                </View>
                <Text style={styles.statLabel}>Scanned</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statInnerBox}>
                  <Text
                    style={[
                      styles.statNumber,
                      diff > 0
                        ? styles.diffPositive
                        : diff < 0
                        ? styles.diffNegative
                        : null,
                    ]}
                  >
                    {diff}
                  </Text>
                </View>
                <Text style={styles.statLabel}>Diff</Text>
              </View>
            </View>
            </View>

            <View style={styles.leftColumnBottom}>
              <View style={styles.printerStrip}>
                <View style={styles.printerStripHeader}>
                  <Text style={styles.printerStripTitle}>Printer</Text>
                  <Text style={styles.printerToolsHelp}>
                    Test label or clear the lock.
                  </Text>
                </View>

                <View style={styles.printerToolsRow}>
                  <TouchableOpacity
                    style={[
                      styles.printerToolBtn,
                      printerActionBusy && styles.disabledButton,
                    ]}
                    onPress={() => void handlePrinterTest()}
                    activeOpacity={0.85}
                    disabled={printerActionBusy}
                    focusable={false}
                  >
                    <Text style={styles.printerToolBtnText}>
                      {printerActionBusy ? "Printing..." : "Test"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.printerToolBtn,
                      styles.printerToolBtnSecondary,
                    ]}
                    onPress={handlePrinterReset}
                    activeOpacity={0.85}
                    focusable={false}
                  >
                    <Text
                      style={[
                        styles.printerToolBtnText,
                        styles.printerToolBtnSecondaryText,
                      ]}
                    >
                      Reset
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.rightColumn}>
          <Text style={styles.scanTitle}>Scan barcodes</Text>

          <View
            style={[
              styles.scanListWrapper,
              !scanningEnabled && styles.scanDisabled,
            ]}
          >
            <ScrollView
              style={styles.scanScroll}
              contentContainerStyle={styles.scanListContent}
              keyboardShouldPersistTaps="handled"
            >
              {rows.map((row, index) => (
                <View key={row.id} style={styles.scanRow}>
                  <TextInput
                    ref={index === 0 ? topBarcodeRef : undefined}
                    style={styles.barcodeInput}
                    autoFocus={index === 0 && scanningEnabled}
                    placeholder={
                      scanningEnabled
                        ? "BARCODE"
                        : "Select carrier first"
                    }
                    value={row.barcode}
                    onChangeText={(text) =>
                      handleBarcodeChange(row.id, text)
                    }
                    onBlur={() =>
                      handleBarcodeBlur(
                        row.id,
                        row.barcode,
                        row.manual
                      )
                    }
                    onFocus={() => {
                      if (index !== 0 && !row.manual) {
                        focusTopBarcode();
                      }
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    blurOnSubmit={false}
                    returnKeyType="next"
                    onSubmitEditing={(event) =>
                      handleBarcodeSubmit(
                        row.id,
                        row.barcode,
                        event
                      )
                    }
                    showSoftInputOnFocus={
                      row.manual && scanningEnabled
                    }
                    editable={scanningEnabled}
                  />

                  <TouchableOpacity
                    style={[
                      styles.manualButton,
                      row.manual && scanningEnabled
                        ? styles.manualButtonActive
                        : null,
                      !scanningEnabled &&
                        styles.manualButtonDisabled,
                    ]}
                    onPress={() =>
                      toggleManual(row.id, index)
                    }
                    activeOpacity={0.7}
                    disabled={!scanningEnabled}
                    focusable={false}
                  >
                    <Text
                      style={[
                        styles.manualButtonText,
                        row.manual && scanningEnabled
                          ? styles.manualButtonTextActive
                          : null,
                      ]}
                    >
                      KB
                    </Text>
                  </TouchableOpacity>

                  <TextInput
                    style={[styles.didInput, styles.didInputReadonly]}
                    placeholder="DID"
                    keyboardType="numeric"
                    value={row.did}
                    editable={false}
                    showSoftInputOnFocus={false}
                  />

                  <TouchableOpacity
                    style={[
                      styles.reprintButton,
                      !row.did.trim() && styles.disabledButton,
                    ]}
                    onPress={() => void handleReprintRow(row.id)}
                    disabled={!row.did.trim()}
                    focusable={false}
                  >
                    <Text style={styles.reprintButtonText}>RP</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeRow(row.id)}
                    disabled={!scanningEnabled}
                    focusable={false}
                  >
                    <Text style={styles.removeButtonText}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[
              styles.addRowBtn,
              !scanningEnabled && styles.disabledButton,
            ]}
            onPress={addRowTop}
            activeOpacity={0.85}
            disabled={!scanningEnabled}
            focusable={false}
          >
            <Text style={styles.addRowBtnText}>
              Add another barcode
            </Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>
            {scanningEnabled
              ? "Scan each barcode. DID is filled automatically when the lookup finds one."
              : "Select a carrier to start scanning."}
          </Text>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomInfo}>
              Scanned: {scannedCount} | Claimed: {claimed} | Deff:{" "}
              {diff}
            </Text>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!scanningEnabled || submitting) &&
                  styles.disabledButton,
              ]}
              onPress={() => void handleSubmit()}
              activeOpacity={0.9}
              disabled={!scanningEnabled || submitting}
              focusable={false}
            >
              <Text style={styles.submitText}>
                {submitting ? "Submitting..." : "Submit"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={locationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeLocationModal}
      >
        <View style={styles.carrierModalOverlay}>
          <View style={styles.carrierModal}>
            <Text style={styles.carrierModalTitle}>
              Select location
            </Text>
            {LOCATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.carrierOption}
                onPress={() => handleSelectLocation(option.id)}
                activeOpacity={0.8}
                focusable={false}
              >
                <Text style={styles.carrierOptionText}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.carrierOption, styles.carrierCancel]}
              onPress={closeLocationModal}
              focusable={false}
            >
              <Text
                style={[
                  styles.carrierOptionText,
                  { color: "#6b7280" },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={carrierModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCarrierModal}
      >
        <View style={styles.carrierModalOverlay}>
          <View style={styles.carrierModal}>
            <Text style={styles.carrierModalTitle}>
              Select carrier
            </Text>
            {CARRIER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.carrierOption}
                onPress={() => handleSelectCarrier(option)}
                activeOpacity={0.8}
                focusable={false}
              >
                <Text style={styles.carrierOptionText}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.carrierOption, styles.carrierCancel]}
              onPress={closeCarrierModal}
              focusable={false}
            >
              <Text
                style={[
                  styles.carrierOptionText,
                  { color: "#6b7280" },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={keypadVisible}
        transparent
        animationType="fade"
        onRequestClose={() => closeKeypad(false)}
      >
        <View style={styles.keypadOverlay}>
          <View style={styles.keypad}>
            <Text style={styles.keypadTitle}>
              Enter claimed packages
            </Text>
            <View style={styles.keypadDisplayBox}>
              <Text style={styles.keypadDisplayText}>
                {keypadValue}
              </Text>
            </View>

            <View style={styles.keypadGrid}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(
                (key) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.keypadButton}
                    onPress={() => handleKeypadDigit(key)}
                    activeOpacity={0.8}
                    focusable={false}
                  >
                    <Text style={styles.keypadButtonText}>{key}</Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            <View style={styles.keypadActionsRow}>
              <TouchableOpacity
                style={[styles.keypadActionBtn, styles.btnClear]}
                onPress={() => handleKeypadAction("clear")}
                focusable={false}
              >
                <Text style={styles.keypadActionText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.keypadActionBtn, styles.btnBack]}
                onPress={() => handleKeypadAction("back")}
                focusable={false}
              >
                <Text style={styles.keypadActionText}>{"<"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.keypadActionBtn, styles.btnOk]}
                onPress={() => handleKeypadAction("ok")}
                focusable={false}
              >
                <Text style={styles.keypadActionText}>OK</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.keypadActionBtn, styles.btnCancel]}
              onPress={() => handleKeypadAction("cancel")}
              focusable={false}
            >
              <Text style={styles.keypadActionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  rootRow: {
    flex: 1,
    flexDirection: "row",
  },
  leftColumn: {
    flex: 1.1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dbe1e7",
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  leftColumnTop: {
    gap: 12,
  },
  leftColumnBottom: {
    paddingBottom: 0,
    alignSelf: "stretch",
  },
  rightColumn: {
    flex: 1.3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
  },
  pageTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  titleCopy: {
    flex: 1,
  },
  pageSubtitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "500",
    marginTop: 4,
    color: "#64748b",
  },
  logoutBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    justifyContent: "center",
    alignItems: "center",
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#b91c1c",
  },
  headerRow: {
    flexDirection: "row",
    gap: 10,
  },
  formGroup: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    marginBottom: 5,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    fontSize: 14,
  },
  inputLocked: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  dropdown: {
    justifyContent: "center",
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  dropdownPlaceholderText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  clickableCard: {},
  statInnerBox: {
    width: 64,
    height: 58,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  diffPositive: {
    color: "#1d4ed8",
  },
  diffNegative: {
    color: "#b91c1c",
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  scanListWrapper: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  scanDisabled: {
    opacity: 0.5,
  },
  scanScroll: {
    flex: 1,
  },
  scanListContent: {
    padding: 8,
    paddingBottom: 16,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  barcodeInput: {
    flex: 1.7,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 8,
    fontSize: 14,
    backgroundColor: "#ffffff",
  },
  manualButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  manualButtonDisabled: {
    opacity: 0.5,
  },
  manualButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  manualButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  manualButtonTextActive: {
    color: "#ffffff",
  },
  didInput: {
    flex: 1.4,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 8,
    fontSize: 14,
    backgroundColor: "#ffffff",
  },
  didInputReadonly: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  reprintButton: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  reprintButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 11,
  },
  removeButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  addRowBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#2563eb",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  disabledButton: {
    opacity: 0.5,
  },
  addRowBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  helpText: {
    marginTop: 6,
    fontSize: 12,
    color: "#4b5563",
  },
  printerToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 4,
  },
  printerToolBtn: {
    minWidth: 88,
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  printerToolBtnSecondary: {
    backgroundColor: "#e5e7eb",
  },
  printerToolBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  printerToolBtnSecondaryText: {
    color: "#374151",
  },
  printerToolsHelp: {
    fontSize: 11,
    color: "#6b7280",
    flex: 1,
  },
  printerStrip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  printerStripHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  printerStripTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    textTransform: "uppercase",
  },
  bottomRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bottomInfo: {
    fontSize: 12,
    color: "#4b5563",
    flex: 1,
  },
  submitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: "#2563eb",
    borderRadius: 8,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  carrierModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  carrierModal: {
    width: "70%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
  },
  carrierModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  carrierOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: "#f3f4f6",
  },
  carrierOptionText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  carrierCancel: {
    marginTop: 6,
    backgroundColor: "#e5e7eb",
  },
  keypadOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  keypad: {
    width: "65%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
  },
  keypadTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  keypadDisplayBox: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  keypadDisplayText: {
    fontSize: 26,
    fontWeight: "600",
    textAlign: "right",
  },
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  keypadButton: {
    width: "30%",
    height: 44,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  keypadButtonText: {
    fontSize: 20,
    fontWeight: "700",
  },
  keypadActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  keypadActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 3,
  },
  keypadActionText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  btnClear: {
    backgroundColor: "#e5e7eb",
  },
  btnBack: {
    backgroundColor: "#f97316",
  },
  btnOk: {
    backgroundColor: "#2563eb",
  },
  btnCancel: {
    backgroundColor: "#6b7280",
    marginTop: 4,
  },
});
