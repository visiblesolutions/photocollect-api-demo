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
const appLanguageButtons = document.querySelectorAll("[data-ui-language]");
const linkTitle = document.getElementById("linkTitle");
const linkDescription = document.getElementById("linkDescription");
const linkMainPanel = document.getElementById("linkMainPanel");
const linkIframePanel = document.getElementById("linkIframePanel");
const linkIframeStage = document.getElementById("linkIframeStage");
const linkIframe = document.getElementById("linkIframe");
const linkInlineResult = document.getElementById("linkInlineResult");
const linkInlinePlaceholder = document.getElementById("linkInlinePlaceholder");
const linkInlineGallery = document.getElementById("linkInlineGallery");
const linkInlineImage = document.getElementById("linkInlineImage");
const linkInlineSignaturePanel = document.getElementById("linkInlineSignaturePanel");
const linkInlineSignatureImage = document.getElementById("linkInlineSignatureImage");
const linkInlineRetryButton = document.getElementById("linkInlineRetry");
const linkProcessStepPanel = document.getElementById("linkProcessStepPanel");
const linkProcessStepValue = document.getElementById("linkProcessStepValue");
const openLinkButton = document.getElementById("openLinkButton");
const linkActionRow = document.getElementById("linkActionRow");
const generatedLinkPanel = document.getElementById("generatedLinkPanel");
const generatedLinkText = document.getElementById("generatedLinkText");
const linkUploadHint = document.getElementById("linkUploadHint");
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
const UI_LANGUAGE_COOKIE_NAME = "photo_collect_ui_language";
const UI_LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SUPPORTED_UI_LANGUAGES = ["en", "de"];
const DEFAULT_UI_LANGUAGE = "en";

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

function persistUiLanguage(language) {
  if (!SUPPORTED_UI_LANGUAGES.includes(language)) {
    return;
  }

  writeCookie(UI_LANGUAGE_COOKIE_NAME, language, UI_LANGUAGE_COOKIE_MAX_AGE_SECONDS);
}

function normalizeUiLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_UI_LANGUAGES.includes(normalized) ? normalized : DEFAULT_UI_LANGUAGE;
}

function mapLocaleToUiLanguage(locale) {
  return String(locale || "").toLowerCase().startsWith("de") ? "de" : "en";
}

function getDefaultUiLanguage() {
  const fromCookie = readCookie(UI_LANGUAGE_COOKIE_NAME);
  if (fromCookie) {
    return normalizeUiLanguage(fromCookie);
  }

  const fromLocaleCookie = readCookie(LOCALE_COOKIE_NAME);
  if (fromLocaleCookie && SUPPORTED_LOCALES.includes(fromLocaleCookie)) {
    return mapLocaleToUiLanguage(fromLocaleCookie);
  }

  const browserLanguage = normalizeUiLanguage((window.navigator.language || "").slice(0, 2));
  return SUPPORTED_UI_LANGUAGES.includes(browserLanguage) ? browserLanguage : DEFAULT_UI_LANGUAGE;
}

const state = {
  customerNo: "",
  flow: "",
  siteCode: getDefaultSiteCode(),
  locale: getDefaultLocale(),
  uiLanguage: getDefaultUiLanguage(),
  translations: {},
  linkUrl: "",
  processStep: "",
  pollHandle: null,
  pollAttempts: 0,
  maxPollAttempts: 15,
  exportFetchInFlight: false,
  inlineRevealHandle: null,
  inlineRevealPending: false,
  resultState: null,
  resultPlaceholderState: null,
  lastExportPayload: null,
  inlineExportVisible: false,
  inlinePlaceholderState: null
};

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

function clearInlineRevealDelay() {
  if (state.inlineRevealHandle) {
    window.clearTimeout(state.inlineRevealHandle);
    state.inlineRevealHandle = null;
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
  if (customerNoBadge) {
    customerNoBadge.textContent = state.customerNo;
  }
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

function updateUiLanguageButtons() {
  appLanguageButtons.forEach((button) => {
    const isActive = button.dataset.uiLanguage === state.uiLanguage;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  document.documentElement.lang = state.uiLanguage;
}

function setUiLanguage(language, { persist = true } = {}) {
  state.uiLanguage = normalizeUiLanguage(language);
  updateUiLanguageButtons();

  if (persist) {
    persistUiLanguage(state.uiLanguage);
  }
}

function setResultPlaceholder(key, params = {}) {
  state.resultPlaceholderState = { key, params };
  resultPlaceholder.textContent = t(key, params, resultPlaceholder.textContent || "");
}

function setRawResultPlaceholder(text) {
  state.resultPlaceholderState = { rawText: String(text || "") };
  resultPlaceholder.textContent = state.resultPlaceholderState.rawText;
}

function setInlineResultPlaceholder(key, params = {}) {
  state.inlinePlaceholderState = { key, params };

  if (!linkInlinePlaceholder) {
    return;
  }

  linkInlinePlaceholder.textContent = t(key, params, linkInlinePlaceholder.textContent || "");
}

function setRawInlineResultPlaceholder(text) {
  state.inlinePlaceholderState = { rawText: String(text || "") };

  if (!linkInlinePlaceholder) {
    return;
  }

  linkInlinePlaceholder.textContent = state.inlinePlaceholderState.rawText;
}

function getResultMediaView() {
  return {
    placeholder: resultPlaceholder,
    gallery: resultGallery,
    image: resultImage,
    signaturePanel: resultSignaturePanel,
    signatureImage: resultSignatureImage
  };
}

function getInlineMediaView() {
  return {
    placeholder: linkInlinePlaceholder,
    gallery: linkInlineGallery,
    image: linkInlineImage,
    signaturePanel: linkInlineSignaturePanel,
    signatureImage: linkInlineSignatureImage
  };
}

function resetMediaView(view) {
  if (!view) {
    return;
  }

  view.gallery.classList.add("hidden");
  view.image.classList.add("hidden");
  view.image.src = "";
  view.signaturePanel.classList.add("hidden");
  view.signatureImage.classList.add("hidden");
  view.signatureImage.src = "";
  view.placeholder.classList.remove("hidden");
}

function renderMediaView(file, view) {
  if (!view) {
    return;
  }

  const exportFile = typeof file.file === "object" && file.file !== null ? file.file : {};
  const signatureContent = typeof exportFile.signature_content === "string" ? exportFile.signature_content.trim() : "";
  const signatureType = typeof exportFile.signature_type === "string" ? exportFile.signature_type.trim() : "";
  const hasSignature = signatureContent !== "";
  const signatureSource = signatureContent.startsWith("data:")
    ? signatureContent
    : `data:${signatureType};base64,${signatureContent}`;

  view.gallery.classList.remove("hidden");
  view.image.src = file.image_url || "";
  view.image.classList.remove("hidden");
  view.placeholder.classList.add("hidden");

  if (hasSignature) {
    view.signaturePanel.classList.remove("hidden");
    view.signatureImage.classList.remove("hidden");
    view.signatureImage.src = signatureSource;
    return {
      exportFile,
      hasSignature: true
    };
  }

  view.signaturePanel.classList.add("hidden");
  view.signatureImage.src = "";
  view.signatureImage.classList.add("hidden");

  return {
    exportFile,
    hasSignature: false
  };
}

function syncIframePanelContentVisibility(showIframe = !linkIframePanel.classList.contains("hidden")) {
  const showInlineResult = showIframe && state.inlineExportVisible;

  if (linkIframeStage) {
    linkIframeStage.classList.toggle("is-collapsed", !showIframe || showInlineResult);
  }

  if (linkInlineResult) {
    linkInlineResult.classList.toggle("is-collapsed", !showInlineResult);
  }

  if (!linkIframe) {
    return;
  }

  if (!showIframe) {
    clearIframeHeightFrame();
    lastIframeHeight = 0;
    linkIframe.style.height = "";
    linkIframe.src = "about:blank";
    return;
  }

  if (showInlineResult) {
    clearIframeHeightFrame();
    return;
  }

  applyIframeHeight(IFRAME_MIN_HEIGHT);
  linkIframe.src = state.linkUrl || "about:blank";
}

function resetGeneratedState() {
  clearPolling();
  clearInlineRevealDelay();
  state.flow = "";
  state.linkUrl = "";
  state.processStep = "";
  state.pollAttempts = 0;
  state.exportFetchInFlight = false;
  state.inlineRevealPending = false;
  state.resultState = null;
  state.resultPlaceholderState = null;
  state.lastExportPayload = null;
  state.inlineExportVisible = false;
  state.inlinePlaceholderState = null;
  openLinkButton.href = "#";
  openLinkButton.textContent = "Continue";
  openLinkButton.classList.remove("hidden");
  linkIframePanel.classList.add("hidden");
  if (linkUploadHint) {
    linkUploadHint.classList.remove("hidden");
  }
  if (linkIframe) {
    linkIframe.style.height = "";
  }
  lastIframeHeight = 0;
  syncIframePanelContentVisibility(false);
  resetMediaView(getResultMediaView());
  resetMediaView(getInlineMediaView());
  resultMeta.innerHTML = "";
  resultMeta.classList.add("hidden");
  retryFetchButton.classList.add("hidden");
  if (linkInlineRetryButton) {
    linkInlineRetryButton.classList.add("hidden");
  }
  resultPlaceholder.classList.remove("hidden");
  setResultPlaceholder("result.placeholder.waitingProcessedData");
  setInlineResultPlaceholder("result.placeholder.waitingProcessedData");
  setResultState("waiting", "result.badges.waiting", "result.status.waitingProxy");
}

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

async function loadTranslation(language) {
  const response = await fetch(new URL(`assets/locales/${language}.json`, document.baseURI).toString(), {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to load locale: ${language}`);
  }

  return response.json();
}

async function loadTranslations() {
  const entries = await Promise.all(
    SUPPORTED_UI_LANGUAGES.map(async (language) => [language, await loadTranslation(language)])
  );

  state.translations = Object.fromEntries(entries);
}

function getTranslationValue(language, key) {
  const dictionary = state.translations[language];
  if (!dictionary) {
    return null;
  }

  return key.split(".").reduce((value, part) => {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, part)) {
      return value[part];
    }

    return null;
  }, dictionary);
}

function interpolate(message, params = {}) {
  return String(message).replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }

    return match;
  });
}

function t(key, params = {}, fallback = key) {
  const localized = getTranslationValue(state.uiLanguage, key);
  const englishFallback = getTranslationValue(DEFAULT_UI_LANGUAGE, key);
  const resolved = localized ?? englishFallback ?? fallback;

  return typeof resolved === "string" ? interpolate(resolved, params) : fallback;
}

function toDatasetKey(attributeName) {
  return attributeName
    .split("-")
    .map((part, index) => (index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join("");
}

function applyStaticTranslations() {
  document.title = t("meta.title", {}, document.title);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const fallback = element.dataset.i18nFallback || element.textContent || "";
    if (!element.dataset.i18nFallback) {
      element.dataset.i18nFallback = fallback;
    }

    element.textContent = t(element.dataset.i18n, {}, fallback);
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    const mappings = String(element.dataset.i18nAttr || "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.includes(":"));

    mappings.forEach((mapping) => {
      const separatorIndex = mapping.indexOf(":");
      const attributeName = mapping.slice(0, separatorIndex).trim();
      const key = mapping.slice(separatorIndex + 1).trim();
      const fallbackDatasetKey = `i18nAttrFallback${toDatasetKey(attributeName).charAt(0).toUpperCase()}${toDatasetKey(attributeName).slice(1)}`;
      const fallback = element.dataset[fallbackDatasetKey] || element.getAttribute(attributeName) || "";

      if (!element.dataset[fallbackDatasetKey]) {
        element.dataset[fallbackDatasetKey] = fallback;
      }

      element.setAttribute(attributeName, t(key, {}, fallback));
    });
  });
}

function localizeSiteCodeOptions() {
  if (!siteCodeSelect) {
    return;
  }

  Array.from(siteCodeSelect.options).forEach((option) => {
    const fallback = option.dataset.defaultLabel || option.value;
    option.textContent = t(`siteCodes.${option.value}`, {}, fallback);
  });
}

function localizeLocaleOptions() {
  if (!localeSelect) {
    return;
  }

  Array.from(localeSelect.options).forEach((option) => {
    const key = option.dataset.localeOption;
    if (!key) {
      return;
    }

    option.textContent = t(`start.processLocaleOptions.${key}`, {}, option.textContent);
  });
}

function refreshLinkScreenCopy() {
  if (screenLink.classList.contains("hidden")) {
    return;
  }

  if (state.flow === "deeplink") {
    showDeeplinkFlowScreen();
    return;
  }

  if (state.flow === "deeplink-iframe") {
    showDeeplinkIframeFlowScreen();

    if (state.inlineExportVisible && linkInlinePlaceholder) {
      if (state.lastExportPayload) {
        renderInlineResult(state.lastExportPayload);
      } else if (state.inlinePlaceholderState) {
        const { key, params, rawText } = state.inlinePlaceholderState;
        if (typeof rawText === "string") {
          linkInlinePlaceholder.textContent = rawText;
        } else {
          setInlineResultPlaceholder(key, params);
        }
      }
    }

    return;
  }

  if (state.flow === "api") {
    showApiFlowScreen();
  }
}

function refreshResultScreenCopy() {
  if (screenResult.classList.contains("hidden")) {
    return;
  }

  if (state.lastExportPayload) {
    renderResult(state.lastExportPayload);
    return;
  }

  if (state.resultState) {
    const { kind, badgeKey, bodyKey, bodyParams } = state.resultState;
    setResultState(kind, badgeKey, bodyKey, bodyParams);
  }

  if (state.resultPlaceholderState) {
    const { key, params, rawText } = state.resultPlaceholderState;
    if (typeof rawText === "string") {
      resultPlaceholder.textContent = rawText;
    } else {
      setResultPlaceholder(key, params);
    }
  }
}

function applyTranslations() {
  applyStaticTranslations();
  localizeSiteCodeOptions();
  localizeLocaleOptions();
  refreshLinkScreenCopy();
  refreshResultScreenCopy();
}

function applyProcessStepStatus(step) {
  const normalizedStep = typeof step === "string" ? step.trim() : "";
  const isFinalize = normalizedStep === "finalize";

  state.processStep = normalizedStep;

  if (!linkProcessStepValue || !linkProcessStepPanel) {
    return;
  }

  const processStepLabel = normalizedStep
    ? t(`link.processSteps.${normalizedStep}`, {}, normalizedStep)
    : t("common.notSet", {}, "-");

  linkProcessStepValue.textContent = processStepLabel;
  linkProcessStepPanel.className = [
    "rounded-3xl border px-4 py-3",
    isFinalize ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"
  ].join(" ");

  if (state.flow === "deeplink-iframe" && isFinalize) {
    beginInlineFinalizeFetch();
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
    titleKey,
    descriptionKey,
    buttonLabelKey,
    showIframe,
    showOpenButton,
    showUploadHint,
    showGeneratedLink
  } = {
    showIframe: false,
    showOpenButton: true,
    showGeneratedLink: false,
    showUploadHint: true,
    ...copy
  };

  linkTitle.textContent = t(titleKey, {}, linkTitle.textContent || "");
  linkDescription.textContent = t(descriptionKey, {}, linkDescription.textContent || "");
  openLinkButton.textContent = t(buttonLabelKey, {}, openLinkButton.textContent || "Continue");
  openLinkButton.href = state.linkUrl;
  linkIframePanel.classList.toggle("hidden", !showIframe);
  syncIframePanelContentVisibility(showIframe);
  openLinkButton.classList.toggle("hidden", !showOpenButton);
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
  if (generatedLinkPanel && generatedLinkText) {
    generatedLinkText.textContent = state.linkUrl || "";
    generatedLinkPanel.classList.toggle("hidden", !showGeneratedLink || !state.linkUrl);
  }
  linkProcessStepPanel.classList.toggle("hidden", !showIframe);
  if (showIframe) {
    applyProcessStepStatus(state.processStep || "pending");
    if (!state.inlineExportVisible) {
      scheduleIframeContentHeightMeasure();
    }
  }
  showScreen("link");
}

function showDeeplinkFlowScreen() {
  setLinkScreen({
    titleKey: "link.flows.deeplink.title",
    descriptionKey: "link.flows.deeplink.description",
    buttonLabelKey: "link.flows.deeplink.button",
    showIframe: false,
    showOpenButton: true,
    showGeneratedLink: true
  });
}

function showDeeplinkIframeFlowScreen() {
  setLinkScreen({
    titleKey: "link.flows.iframe.title",
    descriptionKey: "link.flows.iframe.description",
    buttonLabelKey: "link.flows.iframe.button",
    showIframe: true,
    showOpenButton: false,
    showUploadHint: false
  });
}

function showApiFlowScreen() {
  setLinkScreen({
    titleKey: "link.flows.api.title",
    descriptionKey: "link.flows.api.description",
    buttonLabelKey: "link.flows.api.button",
    showIframe: false,
    showOpenButton: true,
    showGeneratedLink: true
  });
}

function setResultState(kind, badgeKey, bodyKey, bodyParams = {}) {
  state.resultState = {
    kind,
    badgeKey,
    bodyKey,
    bodyParams
  };

  resultStatusBadge.textContent = t(badgeKey, {}, resultStatusBadge.textContent || "");
  resultStatusBadge.className = "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em]";

  if (kind === "ready") {
    resultStatusBadge.classList.add("bg-blue-100", "text-blue-700");
  } else if (kind === "error") {
    resultStatusBadge.classList.add("bg-rose-100", "text-rose-700");
  } else {
    resultStatusBadge.classList.add("bg-amber-100", "text-amber-700");
  }

  resultStatusText.textContent = t(bodyKey, bodyParams, resultStatusText.textContent || "");
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
    throw new Error(payload.error || t("errors.requestFailed", {}, "Request failed."));
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
          redirect_uri: buildRedirectUrl() //Redirect back
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
          redirect_uri: "" //Don't redirect - empty string disabled preconfigured default redirectUri
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

    throw new Error(t("errors.unknownFlow", {}, "Unknown flow selected."));
  } catch (error) {
    window.alert(error.message || t("errors.requestFailed", {}, "Request failed."));
    showScreen("start");
  } finally {
    setLoadingButtons(false);
  }
}

function renderResult(file) {
  state.lastExportPayload = file;
  state.resultPlaceholderState = null;

  const { exportFile, hasSignature } = renderMediaView(file, getResultMediaView());
  const notAvailable = t("common.notAvailable", {}, "n/a");
  const signatureKey = hasSignature
    ? "result.meta.signatureIncluded"
    : "result.meta.signatureNotRequested";

  resultMeta.classList.remove("hidden");
  resultMeta.innerHTML = [
    `<div><strong>${escapeHtml(t("result.meta.locale", {}, "locale"))}:</strong> ${escapeHtml(state.locale || notAvailable)}</div>`,
    `<div><strong>${escapeHtml(t("result.meta.siteCode", {}, "site_code"))}:</strong> ${escapeHtml(file.site_code || state.siteCode || notAvailable)}</div>`,
    `<div><strong>${escapeHtml(t("result.meta.file", {}, "File"))}:</strong> ${escapeHtml(exportFile.file_name || notAvailable)}</div>`,
    `<div><strong>${escapeHtml(t("result.meta.uploaded", {}, "Uploaded"))}:</strong> ${escapeHtml(exportFile.uploaded_at || notAvailable)}</div>`,
    `<div><strong>${escapeHtml(t("result.meta.exported", {}, "Exported"))}:</strong> ${escapeHtml(exportFile.exported_at || notAvailable)}</div>`,
    `<div><strong>${escapeHtml(t("result.meta.invitation", {}, "Invitation"))}:</strong> ${escapeHtml(exportFile.invitation_key || notAvailable)}</div>`,
    `<div><strong>${escapeHtml(t("result.meta.signature", {}, "Signature"))}:</strong> ${escapeHtml(t(signatureKey, {}, ""))}</div>`
  ].join("");
  retryFetchButton.classList.add("hidden");
  setResultState("ready", "result.badges.ready", "result.status.ready");
}

function renderInlineResult(file) {
  state.lastExportPayload = file;
  state.inlinePlaceholderState = null;

  if (!state.inlineExportVisible) {
    return;
  }

  renderMediaView(file, getInlineMediaView());
  if (linkInlineRetryButton) {
    linkInlineRetryButton.classList.add("hidden");
  }
  syncIframePanelContentVisibility(true);
}

function revealInlineResultPanel() {
  state.inlineRevealPending = false;
  state.inlineExportVisible = true;

  if (state.lastExportPayload) {
    renderMediaView(state.lastExportPayload, getInlineMediaView());
  } else {
    resetMediaView(getInlineMediaView());

    if (state.inlinePlaceholderState) {
      const { key, params, rawText } = state.inlinePlaceholderState;
      if (typeof rawText === "string") {
        linkInlinePlaceholder.textContent = rawText;
      } else {
        setInlineResultPlaceholder(key, params);
      }
    } else {
      setInlineResultPlaceholder("result.placeholder.waitingProcessedData");
    }
  }

  syncIframePanelContentVisibility(true);
}

function beginInlineFinalizeFetch() {
  if (state.inlineRevealPending || state.inlineExportVisible) {
    return;
  }

  clearPolling();
  clearInlineRevealDelay();
  state.pollAttempts = 0;
  state.lastExportPayload = null;
  state.inlineRevealPending = true;
  state.inlineExportVisible = false;
  state.inlinePlaceholderState = null;
  if (linkInlineRetryButton) {
    linkInlineRetryButton.classList.add("hidden");
  }
  setInlineResultPlaceholder("result.placeholder.waitingProcessedData");
  state.inlineRevealHandle = window.setTimeout(() => {
    state.inlineRevealHandle = null;
    revealInlineResultPanel();
  }, 3000);
  pollForPhoto("inline");
}

async function pollForPhoto(target = "screen") {
  clearPolling();
  state.pollAttempts += 1;
  state.exportFetchInFlight = true;
  const isInlineTarget = target === "inline";

  if (isInlineTarget) {
    if (linkInlineRetryButton) {
      linkInlineRetryButton.classList.add("hidden");
    }
  } else {
    retryFetchButton.classList.add("hidden");
  }

  try {
    const exportParams = new URLSearchParams();
    exportParams.set("customer_no", state.customerNo);
    exportParams.set("site_code", state.siteCode);
    const payload = await requestJson(`api/export?${exportParams.toString()}`);

    if (payload.status === "ready") {
      if (isInlineTarget) {
        renderInlineResult(payload);
      } else {
        renderResult(payload);
      }
      return;
    }

    state.lastExportPayload = null;
    const placeholderParams = {
      attempt: state.pollAttempts,
      maxAttempts: state.maxPollAttempts
    };

    if (isInlineTarget) {
      resetMediaView(getInlineMediaView());
      setInlineResultPlaceholder("result.placeholder.noPhotoAttempt", placeholderParams);
    } else {
      resultPlaceholder.classList.remove("hidden");
      setResultPlaceholder("result.placeholder.noPhotoAttempt", placeholderParams);
      setResultState("waiting", "result.badges.waiting", "result.status.notReady");
    }

    if (state.pollAttempts < state.maxPollAttempts) {
      state.pollHandle = window.setTimeout(() => {
        pollForPhoto(target);
      }, 4000);
      return;
    }

    if (isInlineTarget) {
      if (linkInlineRetryButton) {
        linkInlineRetryButton.classList.remove("hidden");
      }
    } else {
      retryFetchButton.classList.remove("hidden");
      setResultState("waiting", "result.badges.stillWaiting", "result.status.retryLater");
    }
  } catch (error) {
    state.lastExportPayload = null;
    if (isInlineTarget) {
      resetMediaView(getInlineMediaView());
      if (linkInlineRetryButton) {
        linkInlineRetryButton.classList.remove("hidden");
      }
      setRawInlineResultPlaceholder(error.message);
    } else {
      retryFetchButton.classList.remove("hidden");
      resultPlaceholder.classList.remove("hidden");
      setRawResultPlaceholder(error.message);
      setResultState("error", "result.badges.error", "result.status.error");
    }
  } finally {
    state.exportFetchInFlight = false;
  }
}

function openResultScreen() {
  clearPolling();
  clearInlineRevealDelay();
  state.pollAttempts = 0;
  state.inlineExportVisible = false;
  state.inlineRevealPending = false;
  state.inlinePlaceholderState = null;
  state.lastExportPayload = null;
  window.history.replaceState({}, "", buildRedirectUrl());
  syncIframePanelContentVisibility(linkIframePanel && !linkIframePanel.classList.contains("hidden"));
  resetMediaView(getResultMediaView());
  resultMeta.classList.add("hidden");
  resultMeta.innerHTML = "";
  resultPlaceholder.classList.remove("hidden");
  setResultPlaceholder("result.placeholder.waitingProcessedData");
  showScreen("result");
  setResultState("waiting", "result.badges.waiting", "result.status.waitingProxy");
  pollForPhoto("screen");
}

function bootstrapFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const customerNo = params.get("customer_no");
  const requestedScreen = params.get("screen");
  const flow = params.get("flow");
  const siteCode = params.get("site_code");
  const locale = params.get("locale");
  const hasPersistedUiLanguage = Boolean(readCookie(UI_LANGUAGE_COOKIE_NAME));

  if (customerNo) {
    state.customerNo = customerNo;
  } else {
    state.customerNo = generateCustomerNo();
  }

  state.siteCode = (siteCode && SUPPORTED_SITE_CODES.includes(siteCode)) ? siteCode : getDefaultSiteCode();
  state.locale = (locale && SUPPORTED_LOCALES.includes(locale)) ? locale : getDefaultLocale();

  if (!hasPersistedUiLanguage && locale) {
    setUiLanguage(mapLocaleToUiLanguage(locale), { persist: false });
  }

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

appLanguageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setUiLanguage(button.dataset.uiLanguage);
    applyTranslations();
  });
});

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

if (linkInlineRetryButton) {
  linkInlineRetryButton.addEventListener("click", () => {
    clearPolling();
    clearInlineRevealDelay();
    state.pollAttempts = 0;
    state.lastExportPayload = null;
    state.inlineRevealPending = false;
    revealInlineResultPanel();
    pollForPhoto("inline");
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

async function initializeApp() {
  setUiLanguage(state.uiLanguage, { persist: false });
  initializeIframeResizePropagation();

  try {
    await loadTranslations();
  } catch (error) {
    console.error(error);
  }

  bootstrapFromUrl();
  applyTranslations();
}

initializeApp();
