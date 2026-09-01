import * as Haptics from "expo-haptics";

const listeners = new Set();
const confirmListeners = new Set();
let toastSeq = 0;
let activeConfirm = null;

const ERROR_RE =
  /\b(fail|failed|error|invalid|unable|not allowed|banned|mismatch|rejected|cannot|denied|unavailable)\b/i;
const SUCCESS_RE =
  /\b(success|updated|saved|sent|deleted|approved|created|unbanned|confirmed)\b/i;
const WARNING_RE =
  /\b(warn|warning|outside|needed|required|missing|weak|permission)\b/i;

export function inferToastType(title = "") {
  const label = String(title || "").trim();

  if (/^user banned$/i.test(label)) return "success";
  if (ERROR_RE.test(label)) return "error";
  if (SUCCESS_RE.test(label)) return "success";
  if (WARNING_RE.test(label)) return "warning";
  return "info";
}

function emit(nextToasts) {
  listeners.forEach((listener) => listener(nextToasts));
}

let queue = [];

function subscribe(listener) {
  listeners.add(listener);
  listener(queue);
  return () => listeners.delete(listener);
}

function dismiss(id) {
  queue = queue.filter((item) => item.id !== id);
  emit(queue);
}

const HAPTIC_TYPE = {
  success: Haptics.NotificationFeedbackType.Success,
  error: Haptics.NotificationFeedbackType.Error,
  warning: Haptics.NotificationFeedbackType.Warning,
  info: Haptics.NotificationFeedbackType.Warning,
};

function showToast({ title, message, type = "info", duration = 3200 } = {}) {
  const id = ++toastSeq;
  const toastItem = {
    id,
    title: title || "",
    message: message || "",
    type,
    duration,
  };

  queue = [toastItem, ...queue].slice(0, 3);
  emit(queue);

  Haptics.notificationAsync(HAPTIC_TYPE[type] || HAPTIC_TYPE.info).catch(
    () => {}
  );

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }

  return id;
}

export function toast(title, message, type) {
  return showToast({
    title,
    message,
    type: type || inferToastType(title),
  });
}

toast.success = (title, message) =>
  showToast({ title, message, type: "success" });
toast.error = (title, message) =>
  showToast({ title, message, type: "error" });
toast.warning = (title, message) =>
  showToast({ title, message, type: "warning" });
toast.info = (title, message) => showToast({ title, message, type: "info" });
toast.dismiss = dismiss;

function emitConfirm() {
  confirmListeners.forEach((listener) => listener(activeConfirm));
}

function subscribeConfirm(listener) {
  confirmListeners.add(listener);
  listener(activeConfirm);
  return () => confirmListeners.delete(listener);
}

function dismissConfirm() {
  activeConfirm = null;
  emitConfirm();
}

function showConfirm({ title, message, buttons, options }) {
  activeConfirm = {
    title: title || "",
    message: message || "",
    buttons: Array.isArray(buttons) ? buttons : [],
    options: options || {},
  };
  emitConfirm();
}

const GREEN = "#087A0D";
const RED = "#D71920";
const LIGHT_GREEN = "#EAF6E4";
const LIGHT_RED = "#FFF4F4";

export function inferConfirmDialogMeta(title = "", buttons = []) {
  const label = String(title || "").trim().toLowerCase();
  const hasDestructive = buttons.some((button) => button?.style === "destructive");

  if (/log\s?out|sign\s?out/.test(label)) {
    return {
      icon: "log-out-outline",
      accent: RED,
      iconBackground: LIGHT_RED,
    };
  }

  if (/delete|ban|remove|unban/.test(label) || hasDestructive) {
    return {
      icon: "alert-circle-outline",
      accent: RED,
      iconBackground: LIGHT_RED,
    };
  }

  if (/photo|camera|gallery|image/.test(label)) {
    return {
      icon: "camera-outline",
      accent: GREEN,
      iconBackground: LIGHT_GREEN,
    };
  }

  if (/microphone|voice|record/.test(label)) {
    return {
      icon: "mic-outline",
      accent: GREEN,
      iconBackground: LIGHT_GREEN,
    };
  }

  if (/similar|duplicate|submit anyway/.test(label)) {
    return {
      icon: "documents-outline",
      accent: "#C97812",
      iconBackground: "#FFF8EE",
    };
  }

  if (/ai validation|validation/.test(label)) {
    return {
      icon: "sparkles-outline",
      accent: GREEN,
      iconBackground: LIGHT_GREEN,
    };
  }

  return {
    icon: "help-circle-outline",
    accent: GREEN,
    iconBackground: LIGHT_GREEN,
  };
}

export const confirmStore = {
  subscribe: subscribeConfirm,
  dismiss: dismissConfirm,
};

/**
 * Drop-in for Alert.alert: toasts simple messages, shows in-app
 * confirmation dialogs for multi-button prompts.
 */
export function notify(title, message, buttons, options) {
  const actions = Array.isArray(buttons) ? buttons : [];
  const hasMultipleChoices = actions.length >= 2;

  if (hasMultipleChoices) {
    showConfirm({ title, message, buttons: actions, options });
    return;
  }

  showToast({
    title,
    message,
    type: inferToastType(title),
  });

  const action = actions.find((button) => button?.style !== "cancel");
  if (typeof action?.onPress === "function") {
    setTimeout(action.onPress, 280);
  }
}

export const toastStore = {
  subscribe,
  dismiss,
};
