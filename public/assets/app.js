const screenStart = document.getElementById("screen-start");
const screenLink = document.getElementById("screen-link");
const screenResult = document.getElementById("screen-result");
const customerNoBadge = document.getElementById("customerNoBadge");
const refreshCustomerNoButton = document.getElementById("refreshCustomerNo");
const siteCodeSelect = document.getElementById("siteCodeSelect");
const startDeeplinkButton = document.getElementById("startDeeplink");
const startApiButton = document.getElementById("startApi");
const logoHomeButton = document.getElementById("logoHome");
const linkCustomerNo = document.getElementById("linkCustomerNo");
const linkTitle = document.getElementById("linkTitle");
const linkDescription = document.getElementById("linkDescription");
const linkValuePanel = document.getElementById("linkValuePanel");
const linkValue = document.getElementById("linkValue");
const openLinkButton = document.getElementById("openLinkButton");
const qrLinkPanel = document.getElementById("qrLinkPanel");
const qrLinkValue = document.getElementById("qrLinkValue");
const checkPhotoNowButton = document.getElementById("checkPhotoNow");
const backToStartButton = document.getElementById("backToStart");
const qrCanvas = document.getElementById("qrCanvas");
const resultCustomerNo = document.getElementById("resultCustomerNo");
const resultStatusBadge = document.getElementById("resultStatusBadge");
const resultStatusText = document.getElementById("resultStatusText");
const resultPlaceholder = document.getElementById("resultPlaceholder");
const resultGallery = document.getElementById("resultGallery");
const resultImage = document.getElementById("resultImage");
const resultSignaturePanel = document.getElementById("resultSignaturePanel");
const resultSignatureImage = document.getElementById("resultSignatureImage");
const resultMeta = document.getElementById("resultMeta");
const parameterSiteCode = document.getElementById("parameterSiteCode");
const retryFetchButton = document.getElementById("retryFetch");
const closeResultButtons = document.querySelectorAll("[data-close-result]");

const SCREENS = {
  start: screenStart,
  link: screenLink,
  result: screenResult
};

const SUPPORTED_SITE_CODES = [
  "api-demo",
  "api-demo-signature"
];
const SITE_CODE_COOKIE_NAME = "photo_collect_site_code";
const SITE_CODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.substring(prefix.length));
}

function writeCookie(name, value, maxAgeSeconds) {
  const safeValue = encodeURIComponent(value);
  const attributes = [
    `max-age=${maxAgeSeconds}`,
    "path=/",
    "SameSite=Lax"
  ];

  document.cookie = `${encodeURIComponent(name)}=${safeValue}; ${attributes.join("; ")}`;
}

function persistSiteCode(siteCode) {
  if (!SUPPORTED_SITE_CODES.includes(siteCode)) {
    return;
  }

  writeCookie(SITE_CODE_COOKIE_NAME, siteCode, SITE_CODE_COOKIE_MAX_AGE_SECONDS);
}

const state = {
  customerNo: "",
  flow: "",
  siteCode: "api-demo",
  linkUrl: "",
  qr: null,
  pollHandle: null,
  pollAttempts: 0,
  maxPollAttempts: 15
};

function generateCustomerNo() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 16;
  let result = "";

  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);

    bytes.forEach((byte) => {
      result += alphabet[byte % alphabet.length];
    });

    return result;
  }

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    result += alphabet[randomIndex];
  }

  return result;
}

function appBaseUrl() {
  return new URL(document.baseURI);
}

function getDefaultSiteCode() {
  const configured = siteCodeSelect ? String(siteCodeSelect.dataset.defaultSiteCode || "").trim() : "";
  const fromCookie = readCookie(SITE_CODE_COOKIE_NAME);

  if (fromCookie && SUPPORTED_SITE_CODES.includes(fromCookie)) {
    return fromCookie;
  }

  return SUPPORTED_SITE_CODES.includes(configured) ? configured : SUPPORTED_SITE_CODES[0];
}

function getSelectedSiteCode() {
  if (!siteCodeSelect) {
    return state.siteCode || getDefaultSiteCode();
  }

  const selected = String(siteCodeSelect.value || "").trim();
  return SUPPORTED_SITE_CODES.includes(selected) ? selected : getDefaultSiteCode();
}

function buildRedirectUrl() {
  const url = appBaseUrl();
  url.search = "";
  url.hash = "";
  url.searchParams.set("screen", "result");
  url.searchParams.set("customer_no", state.customerNo);
  url.searchParams.set("site_code", state.siteCode);
  if (state.flow) {
    url.searchParams.set("flow", state.flow);
  }

  return url.toString();
}

function clearPolling() {
  if (state.pollHandle) {
    window.clearTimeout(state.pollHandle);
    state.pollHandle = null;
  }
}

function showScreen(name) {
  Object.entries(SCREENS).forEach(([screenName, element]) => {
    if (!element) {
      return;
    }

    element.classList.toggle("hidden", screenName !== name);
  });
}

function syncCustomerNo() {
  customerNoBadge.textContent = state.customerNo;
  linkCustomerNo.textContent = state.customerNo;
  resultCustomerNo.textContent = state.customerNo;
}

function syncSiteCode() {
  const selected = getSelectedSiteCode();
  const hasValidStateSiteCode = SUPPORTED_SITE_CODES.includes(state.siteCode);

  if (!hasValidStateSiteCode) {
    state.siteCode = selected;
  }

  if (siteCodeSelect) {
    siteCodeSelect.value = state.siteCode;
  }

  if (parameterSiteCode) {
    parameterSiteCode.textContent = state.siteCode;
  }

  persistSiteCode(state.siteCode);
}

function resetGeneratedState() {
  clearPolling();
  state.flow = "";
  state.linkUrl = "";
  state.pollAttempts = 0;
  openLinkButton.href = "#";
  openLinkButton.textContent = "Open Link";
  openLinkButton.classList.remove("hidden");
  qrLinkPanel.classList.add("hidden");
  linkValuePanel.classList.remove("hidden");
  linkValue.textContent = "";
  qrLinkValue.textContent = "";
  resultGallery.classList.add("hidden");
  resultImage.src = "";
  resultImage.classList.add("hidden");
  resultSignatureImage.src = "";
  resultSignaturePanel.classList.add("hidden");
  resultMeta.innerHTML = "";
  resultMeta.classList.add("hidden");
  retryFetchButton.classList.add("hidden");
  resultPlaceholder.classList.remove("hidden");
  resultPlaceholder.textContent = "Waiting for the exported image...";
  setResultState("waiting", "Waiting for export", "The app polls GET /export through the local PHP proxy until a file is ready.");
}

function resetToStart(pushHistory = true) {
  state.customerNo = generateCustomerNo();
  resetGeneratedState();
  syncCustomerNo();
  showScreen("start");

  if (pushHistory) {
    const redirectUrl = appBaseUrl();
    redirectUrl.pathname = appBaseUrl().pathname;
    redirectUrl.search = "";
    redirectUrl.hash = "";
    window.history.replaceState({}, "", redirectUrl.toString());
  }
}

function setLoadingButtons(isLoading) {
  [startDeeplinkButton, startApiButton, refreshCustomerNoButton, siteCodeSelect].forEach((button) => {
    if (!button) {
      return;
    }

    button.disabled = isLoading;
    button.classList.toggle("opacity-60", isLoading);
    button.classList.toggle("cursor-not-allowed", isLoading);
  });
}

function renderQrCode(url) {
  if (!window.QRious) {
    const context = qrCanvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
      context.fillStyle = "#f8fafc";
      context.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
      context.fillStyle = "#64748b";
      context.font = "600 16px 'Space Grotesk', sans-serif";
      context.textAlign = "center";
      context.fillText("QR unavailable", qrCanvas.width / 2, qrCanvas.height / 2);
    }
    return;
  }

  if (!state.qr) {
    state.qr = new window.QRious({
      element: qrCanvas,
      size: 240,
      value: url,
      foreground: "#0f172a",
      background: "#ffffff"
    });
    return;
  }

  state.qr.value = url;
}

function setLinkScreen(copy) {
  linkTitle.textContent = copy.title;
  linkDescription.textContent = copy.description;
  linkValue.textContent = state.linkUrl;
  qrLinkValue.textContent = state.linkUrl;
  openLinkButton.textContent = copy.buttonLabel;
  openLinkButton.href = state.linkUrl;
  qrLinkPanel.classList.toggle("hidden", !copy.showQrLinkPanel);
  linkValuePanel.classList.toggle("hidden", !!copy.showQrLinkPanel);
  openLinkButton.classList.remove("hidden");
  renderQrCode(state.linkUrl);
  showScreen("link");
}

function setResultState(kind, badgeText, bodyText) {
  resultStatusBadge.textContent = badgeText;
  resultStatusBadge.className = "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em]";

  if (kind === "ready") {
    resultStatusBadge.classList.add("bg-emerald-100", "text-emerald-700");
  } else if (kind === "error") {
    resultStatusBadge.classList.add("bg-rose-100", "text-rose-700");
  } else {
    resultStatusBadge.classList.add("bg-amber-100", "text-amber-700");
  }

  resultStatusText.textContent = bodyText;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Accept": "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function startFlow(flow) {
  state.flow = flow;
  state.siteCode = getSelectedSiteCode();
  syncCustomerNo();
  setLoadingButtons(true);

  try {
    let payload;
    if (flow === "deeplink") {
      payload = await requestJson("api/deeplink", {
        method: "POST",
        body: JSON.stringify({
          customer_no: state.customerNo,
          site_code: state.siteCode,
          redirect_uri: buildRedirectUrl()
        })
      });

      state.linkUrl = payload.deeplink_url;
      setLinkScreen({
        mode: "Deeplink",
        title: "Open the signed deeplink",
        description: "This deeplink was created on the proxy with the configured secret. A pending invitation on Photo Collect is only created when the link is used.",
        buttonLabel: "Open Link",
        showQrLinkPanel: true
      });
    } else {
      payload = await requestJson("api/invitation", {
        method: "POST",
        body: JSON.stringify({
          customer_no: state.customerNo,
          site_code: state.siteCode
        })
      });

      state.linkUrl = payload.invitation_url;
      setLinkScreen({
        mode: "API",
        title: "Open the invitation link",
        description: "This link comes from POST /invitation. The process created a pending invitation on Photo Collect.",
        buttonLabel: "Open Link",
        showQrLinkPanel: false
      });
    }
  } catch (error) {
    window.alert(error.message);
    showScreen("start");
  } finally {
    setLoadingButtons(false);
  }
}

function renderResult(file) {
  const exportFile = typeof file.file === "object" && file.file !== null ? file.file : {};
  const signatureContent = typeof exportFile.signature_content === "string" ? exportFile.signature_content.trim() : "";
  const hasSignature = state.siteCode === "api-demo-signature" && signatureContent !== "";
  const signatureSource = signatureContent.startsWith("data:")
    ? signatureContent
    : `data:image/png;base64,${signatureContent}`;

  resultGallery.classList.remove("hidden");
  resultImage.src = file.image_url || "";
  resultImage.classList.remove("hidden");
  resultPlaceholder.classList.add("hidden");

  if (hasSignature) {
    resultSignaturePanel.classList.remove("hidden");
    resultSignatureImage.classList.remove("hidden");
    resultSignatureImage.src = signatureSource;
  } else {
    resultSignaturePanel.classList.add("hidden");
    resultSignatureImage.src = "";
    resultSignatureImage.classList.add("hidden");
  }

  resultMeta.classList.remove("hidden");
  resultMeta.innerHTML = [
    `<div><strong>site_code:</strong> ${escapeHtml(file.site_code || state.siteCode || "n/a")}</div>`,
    `<div><strong>File:</strong> ${escapeHtml(exportFile.file_name || "n/a")}</div>`,
    `<div><strong>Uploaded:</strong> ${escapeHtml(exportFile.uploaded_at || "n/a")}</div>`,
    `<div><strong>Exported:</strong> ${escapeHtml(exportFile.exported_at || "n/a")}</div>`,
    `<div><strong>Invitation:</strong> ${escapeHtml(exportFile.invitation_key || "n/a")}</div>`,
    `<div><strong>Signature:</strong> ${escapeHtml(hasSignature ? "Included" : state.siteCode === "api-demo-signature" ? "Not present yet" : "Not requested")}</div>`
  ].join("");
  retryFetchButton.classList.add("hidden");
  setResultState("ready", "Ready", "The latest export for this customer_no is shown below.");
}

async function pollForPhoto() {
  clearPolling();
  state.pollAttempts += 1;
  retryFetchButton.classList.add("hidden");

  try {
    const exportParams = new URLSearchParams();
    exportParams.set("customer_no", state.customerNo);
    exportParams.set("site_code", state.siteCode);
    const payload = await requestJson(`api/export?${exportParams.toString()}`);

    if (payload.status === "ready") {
      renderResult(payload);
      return;
    }

    resultPlaceholder.classList.remove("hidden");
    resultPlaceholder.textContent = `No photo yet. Poll attempt ${state.pollAttempts} of ${state.maxPollAttempts}...`;
    setResultState("waiting", "Waiting", "The export is not ready yet. The app will keep polling for a short time.");

    if (state.pollAttempts < state.maxPollAttempts) {
      state.pollHandle = window.setTimeout(pollForPhoto, 4000);
      return;
    }

    retryFetchButton.classList.remove("hidden");
    setResultState("waiting", "Still waiting", "No exported file was found yet. Retry after the upload has finished.");
  } catch (error) {
    retryFetchButton.classList.remove("hidden");
    resultPlaceholder.classList.remove("hidden");
    resultPlaceholder.textContent = error.message;
    setResultState("error", "Error", "The export check failed. You can retry once the upstream service is reachable.");
  }
}

function openResultScreen() {
  clearPolling();
  state.pollAttempts = 0;
  window.history.replaceState({}, "", buildRedirectUrl());
  resultGallery.classList.add("hidden");
  resultImage.classList.add("hidden");
  resultImage.src = "";
  resultSignaturePanel.classList.add("hidden");
  resultSignatureImage.src = "";
  resultSignatureImage.classList.add("hidden");
  resultMeta.classList.add("hidden");
  resultMeta.innerHTML = "";
  resultPlaceholder.classList.remove("hidden");
  resultPlaceholder.textContent = "Waiting for the exported photo...";
  showScreen("result");
  setResultState("waiting", "Waiting", "The app polls GET /export through the local proxy until a file is ready.");
  pollForPhoto();
}

function bootstrapFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const customerNo = params.get("customer_no");
  const requestedScreen = params.get("screen");
  const flow = params.get("flow");
  const siteCode = params.get("site_code");

  if (customerNo) {
    state.customerNo = customerNo;
  } else {
    state.customerNo = generateCustomerNo();
  }

  state.siteCode = (siteCode && SUPPORTED_SITE_CODES.includes(siteCode)) ? siteCode : getDefaultSiteCode();
  syncSiteCode();
  state.flow = flow || "";
  syncCustomerNo();

  if (requestedScreen === "result" && customerNo) {
    openResultScreen();
    return;
  }

  showScreen("start");
}

refreshCustomerNoButton.addEventListener("click", () => {
  state.customerNo = generateCustomerNo();
  syncCustomerNo();
});

if (siteCodeSelect) {
  siteCodeSelect.addEventListener("change", () => {
    state.siteCode = getSelectedSiteCode();
    syncSiteCode();
  });
}

startDeeplinkButton.addEventListener("click", () => {
  startFlow("deeplink");
});

startApiButton.addEventListener("click", () => {
  startFlow("api");
});

checkPhotoNowButton.addEventListener("click", () => {
  openResultScreen();
});

backToStartButton.addEventListener("click", () => {
  resetToStart();
});

if (logoHomeButton) {
  logoHomeButton.addEventListener("click", () => {
    resetToStart();
  });
}

retryFetchButton.addEventListener("click", () => {
  openResultScreen();
});

closeResultButtons.forEach((button) => {
  button.addEventListener("click", () => {
    window.location.assign(appBaseUrl().toString());
  });
});

bootstrapFromUrl();
