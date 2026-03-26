import * as Print from "expo-print";
import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

const PRINT_MAX_MS = 30_000;
const DEFAULT_LABEL_SIZE = { wIn: 2.84, hIn: 1.1 };

let printBusy = false;
let printBusyTimer: ReturnType<typeof setTimeout> | null = null;

type NativeExpoPrintModule = {
  print: (options: {
    html?: string;
    uri?: string;
    orientation?: string;
  }) => Promise<void>;
};

let nativeExpoPrint: NativeExpoPrintModule | null = null;

if (Platform.OS !== "web") {
  try {
    nativeExpoPrint =
      requireNativeModule<NativeExpoPrintModule>("ExpoPrint");
  } catch {
    nativeExpoPrint = null;
  }
}

function fmtLabelDate(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resetPrintLock() {
  printBusy = false;
  if (printBusyTimer) {
    clearTimeout(printBusyTimer);
    printBusyTimer = null;
  }
}

async function printWithBestAvailableDriver(options: {
  html?: string;
  uri?: string;
  orientation?: string;
}) {
  if (nativeExpoPrint?.print) {
    return nativeExpoPrint.print(options);
  }

  return Print.printAsync(options);
}

async function withPrintGuard<T>(fn: () => Promise<T>): Promise<T> {
  if (printBusy) {
    throw new Error(
      "There is already a print request in progress. Wait for it to finish or use Reset printer."
    );
  }

  printBusy = true;
  printBusyTimer = setTimeout(() => {
    printBusy = false;
    printBusyTimer = null;
  }, PRINT_MAX_MS);

  try {
    try {
      return await fn();
    } catch (err: any) {
      if (
        String(err?.message ?? "").includes(
          "Another print request is already in progress"
        )
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await fn();
      }
      throw err;
    }
  } finally {
    resetPrintLock();
  }
}

function buildDidLabelHTML(opts: {
  did: string;
  position: number;
  dateISO?: string;
}) {
  const { did, position, dateISO } = opts;
  const dateLabel = escapeHtml(fmtLabelDate(dateISO));
  const safeDid = escapeHtml(did);
  const safePosition = escapeHtml(String(position));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: ${DEFAULT_LABEL_SIZE.wIn}in ${DEFAULT_LABEL_SIZE.hIn}in;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${DEFAULT_LABEL_SIZE.wIn}in;
      height: ${DEFAULT_LABEL_SIZE.hIn}in;
      font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: #ffffff;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .label {
      width: 100%;
      padding: 0.08in 0.10in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.04in;
      box-sizing: border-box;
    }
    .did {
      font-size: 0.30in;
      font-weight: 900;
      line-height: 1;
    }
    .meta {
      font-size: 0.11in;
      line-height: 1.2;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="did">DID: ${safeDid}</div>
    <div class="meta">Date: ${dateLabel}</div>
    <div class="meta">Count: ${safePosition}</div>
  </div>
</body>
</html>`;
}

function buildTestLabelHTML(opts?: {
  dateISO?: string;
  labelSizeIn?: { wIn: number; hIn: number };
}) {
  const { dateISO, labelSizeIn } = opts || {};
  const { wIn, hIn } = labelSizeIn || DEFAULT_LABEL_SIZE;
  const dateLabel = escapeHtml(fmtLabelDate(dateISO));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: ${wIn}in ${hIn}in;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${wIn}in;
      height: ${hIn}in;
      font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: #ffffff;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .label {
      width: 100%;
      padding: 0.08in 0.10in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 0.04in;
      box-sizing: border-box;
      text-align: center;
    }
    .title {
      font-size: 0.27in;
      font-weight: 900;
      line-height: 1;
    }
    .meta {
      font-size: 0.11in;
      line-height: 1.2;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="title">TEST PRINT</div>
    <div class="meta">Carrier Reception</div>
    <div class="meta">${dateLabel}</div>
  </div>
</body>
</html>`;
}

export async function printCarrierDidLabel(opts: {
  did: string;
  position: number;
  dateISO?: string;
}) {
  const html = buildDidLabelHTML(opts);
  await withPrintGuard(() =>
    printWithBestAvailableDriver({
      html,
      orientation: Print.Orientation.landscape,
    })
  );
}

export async function printTestLabel(opts?: {
  dateISO?: string;
  labelSizeIn?: { wIn: number; hIn: number };
}) {
  const html = buildTestLabelHTML(opts);
  await withPrintGuard(() =>
    printWithBestAvailableDriver({
      html,
      orientation: Print.Orientation.landscape,
    })
  );
}
