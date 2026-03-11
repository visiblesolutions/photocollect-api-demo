const screenStart = document.getElementById("screen-start");
const screenLink = document.getElementById("screen-link");
const screenResult = document.getElementById("screen-result");
const customerNoBadge = document.getElementById("customerNoBadge");
const refreshCustomerNoButton = document.getElementById("refreshCustomerNo");
const localeSelect = document.getElementById("localeSelect");
const siteCodeSelect = document.getElementById("siteCodeSelect");
const startDeeplinkButton = document.getElementById("startDeeplink");
const startDeeplinkIframeButton = document.getElementById("startDeeplinkIframe");
const startApiButton = document.getElementById("startApi");
const logoHomeButton = document.getElementById("logoHome");
const linkCustomerNo = document.getElementById("linkCustomerNo");
const linkTitle = document.getElementById("linkTitle");
const linkDescription = document.getElementById("linkDescription");
const linkScreenGrid = document.getElementById("linkScreenGrid");
const linkSidebarPanel = document.getElementById("linkSidebarPanel");
const linkMainPanel = document.getElementById("linkMainPanel");
const linkValuePanel = document.getElementById("linkValuePanel");
const linkValue = document.getElementById("linkValue");
const linkIframePanel = document.getElementById("linkIframePanel");
const linkIframe = document.getElementById("linkIframe");
const linkProcessStepPanel = document.getElementById("linkProcessStepPanel");
const linkProcessStepValue = document.getElementById("linkProcessStepValue");
const openLinkButton = document.getElementById("openLinkButton");
const linkActionRow = document.getElementById("linkActionRow");
const qrLinkPanel = document.getElementById("qrLinkPanel");
const qrLinkValue = document.getElementById("qrLinkValue");
const checkPhotoNowIframeButton = document.getElementById("checkPhotoNowIframe");
const checkPhotoNowButton = document.getElementById("checkPhotoNow");
const linkUploadHint = document.getElementById("linkUploadHint");
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
const retryFetchButton = document.getElementById("retryFetch");
const closeResultButtons = document.querySelectorAll("[data-close-result]");
const IFRAME_CONTENT_RESIZE_MESSAGE_TYPE = "photo-collect:content-resize";
const IFRAME_MIN_HEIGHT = 420;
let iframeHeightFrame = 0;
let lastIframeHeight = 0;

const SCREENS = {
  start: screenStart,
  link: screenLink,
  result: screenResult
};

function getConfiguredSiteCodes() {
  if (!siteCodeSelect) {
    return [];
  }

  const configValue = String(siteCodeSelect.dataset.supportedSiteCodes || "").trim();
  if (configValue === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(configValue);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map((value) => String(value || "").trim())
        .filter((value) => value !== "");

      const unique = [...new Set(normalized)];
      if (unique.length > 0) {
        return unique;
      }
    }
  } catch (error) {
    return [];
  }

  return [];
}

const SUPPORTED_SITE_CODES = getConfiguredSiteCodes();
const DEFAULT_SITE_CODE_FROM_TEMPLATE = siteCodeSelect ? String(siteCodeSelect.dataset.defaultSiteCode || "").trim() : "";
const SITE_CODE_FALLBACK = DEFAULT_SITE_CODE_FROM_TEMPLATE || SUPPORTED_SITE_CODES[0] || "";
const SITE_CODE_COOKIE_NAME = "photo_collect_site_code";
const SITE_CODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const LOCALE_COOKIE_NAME = "photo_collect_locale";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SUPPORTED_LOCALES = ["en_US", "de_DE"];
const DEFAULT_LOCALE = "en_US";

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

function persistLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return;
  }

  writeCookie(LOCALE_COOKIE_NAME, locale, LOCALE_COOKIE_MAX_AGE_SECONDS);
}

const state = {
  customerNo: "",
  flow: "",
  siteCode: getDefaultSiteCode(),
  locale: getDefaultLocale(),
  linkUrl: "",
  processStep: "",
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

  return SUPPORTED_SITE_CODES.includes(configured) ? configured : SITE_CODE_FALLBACK;
}

function getDefaultLocale() {
  const configured = localeSelect ? String(localeSelect.dataset.defaultLocale || "").trim() : "";
  const fromCookie = readCookie(LOCALE_COOKIE_NAME);

  if (fromCookie && SUPPORTED_LOCALES.includes(fromCookie)) {
    return fromCookie;
  }

  return SUPPORTED_LOCALES.includes(configured) ? configured : DEFAULT_LOCALE;
}

function getSelectedSiteCode() {
  if (!siteCodeSelect) {
    return state.siteCode || getDefaultSiteCode();
  }

  const selected = String(siteCodeSelect.value || "").trim();
  return SUPPORTED_SITE_CODES.includes(selected) ? selected : getDefaultSiteCode();
}

function getSelectedLocale() {
  if (!localeSelect) {
    return state.locale || getDefaultLocale();
  }

  const selected = String(localeSelect.value || "").trim();
  return SUPPORTED_LOCALES.includes(selected) ? selected : getDefaultLocale();
}

function buildRedirectUrl(options = {}) {
  const { breakOutOfIframe = false } = options;
  const url = appBaseUrl();
  url.search = "";
  url.hash = "";
  url.searchParams.set("screen", "result");
  url.searchParams.set("customer_no", state.customerNo);
  url.searchParams.set("site_code", state.siteCode);
  url.searchParams.set("locale", state.locale);
  if (state.flow) {
    url.searchParams.set("flow", state.flow);
  }
  if (breakOutOfIframe) {
    url.searchParams.set("iframe_redirect", "1");
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

  persistSiteCode(state.siteCode);
}

function syncLocale() {
  const selected = getSelectedLocale();
  const hasValidStateLocale = SUPPORTED_LOCALES.includes(state.locale);

  if (!hasValidStateLocale) {
    state.locale = selected;
  }

  if (localeSelect) {
    localeSelect.value = state.locale;
  }

  persistLocale(state.locale);
}

function resetGeneratedState() {
  clearPolling();
  state.flow = "";
  state.linkUrl = "";
  state.processStep = "";
  state.pollAttempts = 0;
  openLinkButton.href = "#";
  openLinkButton.textContent = "Open Link";
  openLinkButton.classList.remove("hidden");
  linkSidebarPanel.classList.remove("hidden");
  linkScreenGrid.style.gridTemplateColumns = "";
  qrLinkPanel.classList.add("hidden");
  linkValuePanel.classList.remove("hidden");
  linkIframePanel.classList.add("hidden");
  if (checkPhotoNowButton) {
    checkPhotoNowButton.classList.remove("hidden");
  }
  if (checkPhotoNowIframeButton) {
    checkPhotoNowIframeButton.classList.add("hidden");
  }
  if (linkIframe) {
    linkIframe.style.height = "";
  }
  lastIframeHeight = 0;
  linkIframe.src = "about:blank";
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
  [startDeeplinkButton, startDeeplinkIframeButton, startApiButton, refreshCustomerNoButton, siteCodeSelect].forEach((button) => {
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

function applyProcessStepStatus(step) {
  const normalizedStep = typeof step === "string" ? step.trim() : "";
  const isFinalize = normalizedStep === "finalize";

  state.processStep = normalizedStep;

  if (!linkProcessStepValue || !linkProcessStepPanel) {
    return;
  }

  linkProcessStepValue.textContent = normalizedStep || "—";
  linkProcessStepPanel.className = [
    "rounded-3xl border px-4 py-3",
    isFinalize ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"
  ].join(" ");

  if (checkPhotoNowIframeButton) {
    checkPhotoNowIframeButton.classList.toggle(
      "hidden",
      state.flow !== "deeplink-iframe" || !isFinalize
    );
  }
}

function clearIframeHeightFrame() {
  if (iframeHeightFrame !== 0) {
    window.cancelAnimationFrame(iframeHeightFrame);
    iframeHeightFrame = 0;
  }
}

function applyIframeHeight(height) {
  if (!linkIframe) {
    return;
  }

  const safeHeight = Number(height);
  if (!Number.isFinite(safeHeight) || safeHeight <= 0) {
    return;
  }

  const roundedHeight = Math.max(Math.round(safeHeight), IFRAME_MIN_HEIGHT);
  if (roundedHeight === lastIframeHeight) {
    return;
  }

  lastIframeHeight = roundedHeight;
  linkIframe.style.height = `${roundedHeight}px`;
}

function getIframeContentHeightFromPayload(data = null) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const candidates = [
    data.value,
    data.height,
    data?.iframe?.height,
    data?.iframe?.heightPx,
    data?.payload?.height,
    data?.payload?.heightPx,
    data.contentHeight,
    data.documentHeight,
    data.bodyHeight,
    data.iframeHeight,
    data.iframe_height,
    data.body_height
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.round(parsed));
    }
  }

  return null;
}

function measureIframeContentHeightFromDocument() {
  if (!linkIframe || !linkIframe.contentWindow || !linkIframe.contentDocument || linkIframePanel.classList.contains("hidden")) {
    return null;
  }

  try {
    const doc = linkIframe.contentDocument;
    const body = doc.body || null;
    const heights = [
      doc.documentElement ? doc.documentElement.scrollHeight : 0,
      doc.documentElement ? doc.documentElement.offsetHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      body ? body.getBoundingClientRect().height : 0
    ].map((value) => (Number.isFinite(value) ? Number(value) : 0));

    const measuredHeight = Math.max(...heights);
    return measuredHeight > 0 ? Math.max(1, Math.round(measuredHeight)) : null;
  } catch (error) {
    return null;
  }
}

function scheduleIframeContentHeightMeasure() {
  clearIframeHeightFrame();
  iframeHeightFrame = window.requestAnimationFrame(() => {
    iframeHeightFrame = 0;
    const contentHeight = measureIframeContentHeightFromDocument();
    if (contentHeight !== null) {
      applyIframeHeight(contentHeight);
    }
  });
}

function initializeIframeResizePropagation() {
  if (!linkIframe) {
    return;
  }

  linkIframe.addEventListener("load", () => {
    scheduleIframeContentHeightMeasure();
  });

  window.addEventListener("resize", () => {
    scheduleIframeContentHeightMeasure();
  });

  if ("ResizeObserver" in window) {
    const iframeResizeObserver = new window.ResizeObserver(() => {
      scheduleIframeContentHeightMeasure();
    });
    iframeResizeObserver.observe(linkIframe);
    iframeResizeObserver.observe(linkIframePanel);
  }
}

function setLinkScreen(copy) {
  const {
    title,
    description,
    buttonLabel,
    showSidebar,
    showIframe,
    showQrLinkPanel,
    hideLinkValuePanel,
    showOpenButton,
    showUploadHint,
    showCheckPhotoNow
  } = {
    showSidebar: true,
    showIframe: false,
    showQrLinkPanel: false,
    hideLinkValuePanel: false,
    showOpenButton: true,
    showUploadHint: true,
    showCheckPhotoNow: true,
    buttonLabel: "Open Link",
    ...copy
  };

  linkTitle.textContent = title;
  linkDescription.textContent = description;
  linkValue.textContent = state.linkUrl;
  qrLinkValue.textContent = state.linkUrl;
  openLinkButton.textContent = buttonLabel;
  openLinkButton.href = state.linkUrl;
  linkSidebarPanel.classList.toggle("hidden", !showSidebar);
  linkScreenGrid.style.gridTemplateColumns = showSidebar ? "" : "minmax(0, 1fr)";
  qrLinkPanel.classList.toggle("hidden", !showQrLinkPanel);
  linkValuePanel.classList.toggle("hidden", hideLinkValuePanel);
  linkIframePanel.classList.toggle("hidden", !showIframe);
  if (!showIframe) {
    linkIframe.style.height = "";
    lastIframeHeight = 0;
  } else {
    applyIframeHeight(IFRAME_MIN_HEIGHT);
  }
  linkIframe.src = showIframe ? state.linkUrl : "about:blank";
  openLinkButton.classList.toggle("hidden", !showOpenButton);
  checkPhotoNowButton.classList.toggle("hidden", !showCheckPhotoNow);
  if (checkPhotoNowIframeButton) {
    checkPhotoNowIframeButton.classList.add("hidden");
  }
  if (linkUploadHint) {
    linkUploadHint.classList.toggle("hidden", !showUploadHint);
  }
  if (linkMainPanel) {
    linkMainPanel.classList.toggle("rounded-3xl", !showIframe);
    linkMainPanel.classList.toggle("border", !showIframe);
    linkMainPanel.classList.toggle("border-slate-200", !showIframe);
    linkMainPanel.classList.toggle("bg-white", !showIframe);
    linkMainPanel.classList.toggle("p-5", !showIframe);
  }
  if (linkActionRow) {
    linkActionRow.classList.toggle("hidden", showIframe);
  }
  linkProcessStepPanel.classList.toggle("hidden", !showIframe);
  if (showIframe) {
    applyProcessStepStatus(state.processStep || "pending");
    scheduleIframeContentHeightMeasure();
  }
  if (showSidebar) {
    renderQrCode(state.linkUrl);
  }
  showScreen("link");
}

function showDeeplinkFlowScreen() {
  setLinkScreen({
    title: "Open the signed deeplink",
    description: "This deeplink was created on the proxy with the configured secret. A pending invitation on Photo Collect is only created when the link is used.",
    buttonLabel: "Open Link",
    showSidebar: true,
    showIframe: false,
    showOpenButton: true,
    showQrLinkPanel: true,
    hideLinkValuePanel: true
  });
}

function showDeeplinkIframeFlowScreen() {
  setLinkScreen({
    title: "Run the signed deeplink inside the iFrame",
    description: "This deeplink was created on the proxy with the configured secret and is loaded directly below.",
    buttonLabel: "Open Link",
    showSidebar: false,
    showIframe: true,
    showQrLinkPanel: false,
    hideLinkValuePanel: true,
    showOpenButton: false,
    showUploadHint: false,
    showCheckPhotoNow: false
  });
}

function showApiFlowScreen() {
  setLinkScreen({
    title: "Open the invitation link",
    description: "This link comes from POST /invitation. The process created a pending invitation on Photo Collect.",
    buttonLabel: "Open Link",
    showSidebar: true,
    showIframe: false,
    showOpenButton: true,
    showQrLinkPanel: false,
    hideLinkValuePanel: false
  });
}

function setResultState(kind, badgeText, bodyText) {
  resultStatusBadge.textContent = badgeText;
  resultStatusBadge.className = "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em]";

  if (kind === "ready") {
    resultStatusBadge.classList.add("bg-blue-100", "text-blue-700");
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
  state.processStep = "";
  state.siteCode = getSelectedSiteCode();
  state.locale = getSelectedLocale();
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
          locale: state.locale,
          redirect_uri: buildRedirectUrl()
        })
      });

      state.linkUrl = payload.deeplink_url;
      showDeeplinkFlowScreen();
      return;
    }

    if (flow === "deeplink-iframe") {
      payload = await requestJson("api/deeplink", {
        method: "POST",
        body: JSON.stringify({
          customer_no: state.customerNo,
          site_code: state.siteCode,
          locale: state.locale,
          redirect_uri: ""
        })
      });

      state.linkUrl = payload.deeplink_url;
      showDeeplinkIframeFlowScreen();
      return;
    }

    if (flow === "api") {
      payload = await requestJson("api/invitation", {
        method: "POST",
        body: JSON.stringify({
          customer_no: state.customerNo,
          site_code: state.siteCode,
          locale: state.locale
        })
      });

      state.linkUrl = payload.invitation_url;
      showApiFlowScreen();
      return;
    }

    throw new Error("Unknown flow selected.");
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
    `<div><strong>locale:</strong> ${escapeHtml(state.locale || "n/a")}</div>`,
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
  const locale = params.get("locale");

  if (customerNo) {
    state.customerNo = customerNo;
  } else {
    state.customerNo = generateCustomerNo();
  }

  state.siteCode = (siteCode && SUPPORTED_SITE_CODES.includes(siteCode)) ? siteCode : getDefaultSiteCode();
  state.locale = (locale && SUPPORTED_LOCALES.includes(locale)) ? locale : getDefaultLocale();
  syncSiteCode();
  syncLocale();
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

if (localeSelect) {
  localeSelect.addEventListener("change", () => {
    state.locale = getSelectedLocale();
    syncLocale();
  });
}

startDeeplinkButton.addEventListener("click", () => {
  startFlow("deeplink");
});

startDeeplinkIframeButton.addEventListener("click", () => {
  startFlow("deeplink-iframe");
});

startApiButton.addEventListener("click", () => {
startFlow("api");
});

window.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") {
    return;
  }

  if (!linkIframe || !event.source || event.source !== linkIframe.contentWindow) {
    return;
  }

  if (event.data.type === "photo-collect:process-step") {
    applyProcessStepStatus(event.data.value);
    return;
  }

  const shouldResize = (
    event.data.type === IFRAME_CONTENT_RESIZE_MESSAGE_TYPE
  );

  if (!shouldResize) {
    return;
  }

  const messageHeight = getIframeContentHeightFromPayload(event.data);
  if (messageHeight !== null) {
    applyIframeHeight(messageHeight);
  }
});

checkPhotoNowButton.addEventListener("click", () => {
  openResultScreen();
});

if (checkPhotoNowIframeButton) {
  checkPhotoNowIframeButton.addEventListener("click", () => {
    openResultScreen();
  });
}

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

initializeIframeResizePropagation();
bootstrapFromUrl();
