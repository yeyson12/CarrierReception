import * as Speech from "expo-speech";
import { Vibration } from "react-native";

type SpeakOptions = {
  interrupt?: boolean;
  rate?: number;
};

const AudioConfig = {
  voice: {
    enabled: true,
    lang: "es-US",
    pitch: 1,
    rate: 0.95,
  },
  tones: {
    enabled: true,
    vibrationMs: 70,
  },
};

let speechQueue: Promise<void> = Promise.resolve();

function resetQueue() {
  speechQueue = Promise.resolve();
}

function stopSpeech() {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
  resetQueue();
}

function tone() {
  if (!AudioConfig.tones.enabled) return;
  Vibration.vibrate(AudioConfig.tones.vibrationMs);
}

function runSpeech(text: string, rate?: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      Speech.speak(text, {
        language: AudioConfig.voice.lang,
        pitch: AudioConfig.voice.pitch,
        rate: rate ?? AudioConfig.voice.rate,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    } catch {
      resolve();
    }
  });
}

function speak(text: string, opts?: SpeakOptions): Promise<void> {
  const message = text.trim();
  if (!AudioConfig.voice.enabled || !message) {
    return Promise.resolve();
  }

  if (opts?.interrupt ?? true) {
    stopSpeech();
  }

  const task = () => runSpeech(message, opts?.rate);
  const next = speechQueue.then(task, task);
  speechQueue = next.catch(() => undefined);
  return next;
}

function spellToken(value: string) {
  return value
    .trim()
    .split("")
    .join(" ");
}

export const carrierReceptionAudio = {
  warmup: async () => {
    try {
      Speech.speak(" ", {
        language: AudioConfig.voice.lang,
        pitch: AudioConfig.voice.pitch,
        rate: AudioConfig.voice.rate,
      });
    } catch {
      // ignore
    }
  },

  stopSpeech: () => {
    stopSpeech();
  },

  success: async (message = "Correcto") => {
    tone();
    return speak(message, { interrupt: true });
  },

  warn: async (
    message = "Advertencia",
    opts?: { interrupt?: boolean; rate?: number }
  ) => {
    tone();
    return speak(message, {
      interrupt: opts?.interrupt ?? true,
      rate: opts?.rate,
    });
  },

  sayDid: async (did: string) => {
    const value = did.trim();
    if (!value) return;
    tone();
    return speak(`D I D ${spellToken(value)}`, {
      interrupt: false,
      rate: 0.88,
    });
  },
};
