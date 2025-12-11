const HANDSHAKE_URL = "http://esp32.local/handshake";
const HEARTBEAT_URL = "http://esp32.local/heartbeat";
const STATE_URL = "http://esp32.local/heartbeat/state?=";
const HANDSHAKE_RETRY_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 500;
const HEARTBEAT_TIMEOUT_MS = 3000;

const handshakeStatusEl = document.getElementById("handshakeStatus");
const stateStatusEl = document.getElementById("stateStatus");
const logAreaEl = document.getElementById("logArea");
const sendHighBtn = document.getElementById("sendHighBtn");
const sendLowBtn = document.getElementById("sendLowBtn");
const connectionBannerEl = document.getElementById("connectionBanner");

let handshakeRetryTimer = null;
let heartbeatTimer = null;
let timeoutLogged = false;

const statusClasses = ["muted", "ok", "warn", "danger"];

function setStatus(el, text, tone = "muted") {
  el.textContent = text;
  statusClasses.forEach((c) => el.classList.remove(c));
  el.classList.add(tone);
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logAreaEl.textContent = `[${timestamp}] ${message}\n${logAreaEl.textContent}`;
}

async function requestText(url, timeoutMs = 0) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const res = await fetch(url, {
    cache: "no-store",
    signal: controller ? controller.signal : undefined,
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

async function handshakeLoop() {
  clearTimeout(handshakeRetryTimer);
  setStatus(handshakeStatusEl, "Contacting...", "muted");

  try {
    const body = await requestText(HANDSHAKE_URL, 5000);
    log(`Handshake response: ${body}`);
    const trimmed = body.trim();
    const online = trimmed.includes("DEVICE_ONLINE");
    setStatus(
      handshakeStatusEl,
      online ? "Device is Online" : trimmed || "No response body",
      online ? "ok" : "warn"
    );
    enableControls(online);
    if (!online) {
      handshakeRetryTimer = setTimeout(handshakeLoop, HANDSHAKE_RETRY_MS);
    }
  } catch (err) {
    log(`Handshake failed: ${err.message}`);
    setStatus(handshakeStatusEl, "Device Offline", "danger");
    enableControls(false);
    handshakeRetryTimer = setTimeout(handshakeLoop, HANDSHAKE_RETRY_MS);
  }
}

async function sendState(state) {
  enableControls(false);
  try {
    const body = await requestText(`${STATE_URL}${state}`);
    setStatus(stateStatusEl, state, state === "HIGH" ? "ok" : "muted");
    log(`State ${state} sent: ${body}`);
  } catch (err) {
    log(`State ${state} error: ${err.message}`);
  } finally {
    enableControls(true);
  }
}

function enableControls(enabled) {
  sendHighBtn.disabled = !enabled;
  sendLowBtn.disabled = !enabled;
}

function startHeartbeatLoop() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(checkHeartbeat, HEARTBEAT_INTERVAL_MS);
  checkHeartbeat();
}

async function checkHeartbeat() {
  try {
    const body = await requestText(HEARTBEAT_URL, HEARTBEAT_TIMEOUT_MS);
    const online = body.trim().includes("DEVICE_ONLINE");
    connectionBannerEl.classList.toggle("hidden", online);
    setStatus(
      handshakeStatusEl,
      online ? "Device is Online" : "Device Offline",
      online ? "ok" : "danger"
    );
    timeoutLogged = false;
  } catch (err) {
    connectionBannerEl.classList.remove("hidden");
    setStatus(handshakeStatusEl, "Device Offline", "danger");
    if (HEARTBEAT_TIMEOUT_MS === 500 && !timeoutLogged && err.name === "AbortError") {
      log(`Heartbeat timeout (${HEARTBEAT_TIMEOUT_MS}ms)`);
      timeoutLogged = true;
    }
  }
}

sendHighBtn.addEventListener("click", () => sendState("HIGH"));
sendLowBtn.addEventListener("click", () => sendState("LOW"));

document.addEventListener("DOMContentLoaded", () => {
  enableControls(false);
  handshakeLoop();
  startHeartbeatLoop();
});

