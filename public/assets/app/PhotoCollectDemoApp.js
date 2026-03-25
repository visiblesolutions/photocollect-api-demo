import { requestJson } from "./api.js";
import {
  appBaseUrl,
  createRuntimeConfig,
  getDefaultLocale,
  getDefaultSiteCode,
  getDefaultUiLanguage,
  getSelectedLocale,
  getSelectedSiteCode,
  mapLocaleToUiLanguage,
  normalizeUiLanguage,
  persistLocale,
  persistSiteCode,
  persistUiLanguage,
  readCookie
} from "./config.js";
import { collectElements, setLoadingState, showScreen } from "./dom.js";
import { TranslationService } from "./i18n.js";
import { renderMediaView, resetMediaView } from "./media.js";

const IFRAME_CONTENT_RESIZE_MESSAGE_TYPE = "photo-collect:content-resize";
const IFRAME_ACTIVITY_MESSAGE_TYPE = "photo-collect:activity";
const IFRAME_PROCESS_STEP_MESSAGE_TYPE = "photo-collect:process-step";
const IFRAME_MIN_HEIGHT = 420;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// The demo stays framework-free on purpose. This controller keeps the imperative
// code readable by grouping state, rendering, and browser integrations by concern.
export class PhotoCollectDemoApp {
  constructor(documentRef = document, windowRef = window) {
    this.document = documentRef;
    this.window = windowRef;
    this.elements = collectElements(documentRef);
    this.config = createRuntimeConfig(this.elements);
    this.i18n = new TranslationService({
      baseUrl: documentRef.baseURI,
      documentRef,
      supportedLanguages: this.config.supportedUiLanguages,
      defaultLanguage: this.config.defaultUiLanguage
    });

    this.state = this.createInitialState();
    this.iframeHeightFrame = 0;
    this.lastIframeHeight = 0;
  }

  async initialize() {
    // Apply persisted language state before any translated UI is rendered.
    this.setUiLanguage(this.state.uiLanguage, { persist: false });
    this.bindEvents();
    this.initializeIframeResizePropagation();

    try {
      await this.i18n.loadAll();
    } catch (error) {
      console.error(error);
    }

    this.bootstrapFromUrl();
    this.applyTranslations();
  }

  createInitialState() {
    return {
      customerNo: "",
      flow: "",
      siteCode: getDefaultSiteCode(this.elements, this.config, this.document),
      locale: getDefaultLocale(this.elements, this.config, this.document),
      uiLanguage: getDefaultUiLanguage(this.config, this.window, this.document),
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
      inlinePlaceholderState: null,
      iframeActivityLogs: []
    };
  }

  bindEvents() {
    const {
      appLanguageButtons,
      closeResultButtons,
      linkInlineRetryButton,
      localeSelect,
      logoHomeButton,
      refreshCustomerNoButton,
      retryFetchButton,
      siteCodeSelect,
      startApiButton,
      startDeeplinkButton,
      startDeeplinkIframeButton
    } = this.elements;

    refreshCustomerNoButton?.addEventListener("click", () => {
      this.state.customerNo = this.generateCustomerNo();
      this.syncCustomerNo();
    });

    siteCodeSelect?.addEventListener("change", () => {
      this.state.siteCode = this.getSelectedSiteCode();
      this.syncSiteCode();
    });

    localeSelect?.addEventListener("change", () => {
      this.state.locale = this.getSelectedLocale();
      this.syncLocale();
    });

    appLanguageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this.setUiLanguage(button.dataset.uiLanguage);
        this.applyTranslations();
      });
    });

    startDeeplinkButton?.addEventListener("click", () => {
      this.startFlow("deeplink");
    });

    startDeeplinkIframeButton?.addEventListener("click", () => {
      this.startFlow("deeplink-iframe");
    });

    startApiButton?.addEventListener("click", () => {
      this.startFlow("api");
    });

    this.window.addEventListener("message", (event) => {
      this.handleWindowMessage(event);
    });

    linkInlineRetryButton?.addEventListener("click", () => {
      this.clearPolling();
      this.clearInlineRevealDelay();
      this.state.pollAttempts = 0;
      this.state.lastExportPayload = null;
      this.state.inlineRevealPending = false;
      this.revealInlineResultPanel();
      this.pollForPhoto("inline");
    });

    logoHomeButton?.addEventListener("click", () => {
      this.resetToStart();
    });

    retryFetchButton?.addEventListener("click", () => {
      this.openResultScreen();
    });

    closeResultButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this.window.location.assign(this.getAppBaseUrl().toString());
      });
    });
  }

  t(key, params = {}, fallback = key) {
    return this.i18n.translate(key, params, fallback);
  }

  getAppBaseUrl() {
    return appBaseUrl(this.document);
  }

  getSelectedSiteCode() {
    return getSelectedSiteCode(this.elements, this.config, getDefaultSiteCode(this.elements, this.config, this.document));
  }

  getSelectedLocale() {
    return getSelectedLocale(this.elements, this.config, getDefaultLocale(this.elements, this.config, this.document));
  }

  clearPolling() {
    if (this.state.pollHandle) {
      this.window.clearTimeout(this.state.pollHandle);
      this.state.pollHandle = null;
    }
  }

  clearInlineRevealDelay() {
    if (this.state.inlineRevealHandle) {
      this.window.clearTimeout(this.state.inlineRevealHandle);
      this.state.inlineRevealHandle = null;
    }
  }

  clearIframeHeightFrame() {
    if (this.iframeHeightFrame !== 0) {
      this.window.cancelAnimationFrame(this.iframeHeightFrame);
      this.iframeHeightFrame = 0;
    }
  }

  formatActivityLogTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  formatActivityLogValue(value) {
    if (value === null) {
      return "null";
    }

    if (typeof value === "undefined") {
      return "undefined";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  getIframeActivityLogValue(message) {
    if (!message || typeof message !== "object") {
      return undefined;
    }

    if (typeof message.value !== "undefined") {
      return message.value;
    }

    if (message.type === IFRAME_CONTENT_RESIZE_MESSAGE_TYPE) {
      return this.getIframeContentHeightFromPayload(message);
    }

    return undefined;
  }

  renderIframeActivityLog() {
    const { linkIframeActivityLog } = this.elements;

    if (!linkIframeActivityLog) {
      return;
    }

    linkIframeActivityLog.textContent = this.state.iframeActivityLogs.join("\n");
    linkIframeActivityLog.scrollTop = linkIframeActivityLog.scrollHeight;
  }

  appendIframeActivityLog(message) {
    const valueLabel = message?.type === IFRAME_CONTENT_RESIZE_MESSAGE_TYPE ? "height" : "value";
    const entry = [
      `type: ${this.formatActivityLogValue(message?.type)}`,
      `${valueLabel}: ${this.formatActivityLogValue(this.getIframeActivityLogValue(message))}`,
      `timestamp: ${this.formatActivityLogTimestamp()}`
    ].join(" | ");

    this.state.iframeActivityLogs.push(entry);
    this.renderIframeActivityLog();
  }

  syncCustomerNo() {
    if (this.elements.customerNoBadge) {
      this.elements.customerNoBadge.textContent = this.state.customerNo;
    }
  }

  syncSiteCode() {
    const selected = this.getSelectedSiteCode();
    const hasValidStateSiteCode = this.config.supportedSiteCodes.includes(this.state.siteCode);

    if (!hasValidStateSiteCode) {
      this.state.siteCode = selected;
    }

    if (this.elements.siteCodeSelect) {
      this.elements.siteCodeSelect.value = this.state.siteCode;
    }

    persistSiteCode(this.config, this.state.siteCode, this.document);
  }

  syncLocale() {
    const selected = this.getSelectedLocale();
    const hasValidStateLocale = this.config.supportedLocales.includes(this.state.locale);

    if (!hasValidStateLocale) {
      this.state.locale = selected;
    }

    if (this.elements.localeSelect) {
      this.elements.localeSelect.value = this.state.locale;
    }

    persistLocale(this.config, this.state.locale, this.document);
  }

  updateUiLanguageButtons() {
    this.elements.appLanguageButtons.forEach((button) => {
      const isActive = button.dataset.uiLanguage === this.state.uiLanguage;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    this.document.documentElement.lang = this.state.uiLanguage;
  }

  setUiLanguage(language, { persist = true } = {}) {
    this.state.uiLanguage = normalizeUiLanguage(language, this.config);
    this.i18n.setLanguage(this.state.uiLanguage);
    this.updateUiLanguageButtons();

    if (persist) {
      persistUiLanguage(this.config, this.state.uiLanguage, this.document);
    }
  }

  setResultPlaceholder(key, params = {}) {
    this.state.resultPlaceholderState = { key, params };
    this.elements.resultPlaceholder.textContent = this.t(
      key,
      params,
      this.elements.resultPlaceholder.textContent || ""
    );
  }

  setRawResultPlaceholder(text) {
    this.state.resultPlaceholderState = { rawText: String(text || "") };
    this.elements.resultPlaceholder.textContent = this.state.resultPlaceholderState.rawText;
  }

  setInlineResultPlaceholder(key, params = {}) {
    this.state.inlinePlaceholderState = { key, params };

    if (!this.elements.linkInlinePlaceholder) {
      return;
    }

    this.elements.linkInlinePlaceholder.textContent = this.t(
      key,
      params,
      this.elements.linkInlinePlaceholder.textContent || ""
    );
  }

  setRawInlineResultPlaceholder(text) {
    this.state.inlinePlaceholderState = { rawText: String(text || "") };

    if (!this.elements.linkInlinePlaceholder) {
      return;
    }

    this.elements.linkInlinePlaceholder.textContent = this.state.inlinePlaceholderState.rawText;
  }

  generateCustomerNo() {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const length = 16;
    let result = "";

    if (this.window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(length);
      this.window.crypto.getRandomValues(bytes);

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

  resetToStart(pushHistory = true) {
    this.state.customerNo = this.generateCustomerNo();
    this.resetGeneratedState();
    this.syncCustomerNo();
    showScreen(this.elements.screens, "start");

    if (!pushHistory) {
      return;
    }

    const redirectUrl = this.getAppBaseUrl();
    redirectUrl.pathname = this.getAppBaseUrl().pathname;
    redirectUrl.search = "";
    redirectUrl.hash = "";
    this.window.history.replaceState({}, "", redirectUrl.toString());
  }

  resetGeneratedState() {
    const {
      generatedLinkPanel,
      linkIframe,
      linkInlineCloseButton,
      linkIframePanel,
      linkInlineRetryButton,
      linkUploadHint,
      openLinkButton,
      resultMeta,
      retryFetchButton
    } = this.elements;

    this.clearPolling();
    this.clearInlineRevealDelay();
    this.state.flow = "";
    this.state.linkUrl = "";
    this.state.processStep = "";
    this.state.pollAttempts = 0;
    this.state.exportFetchInFlight = false;
    this.state.inlineRevealPending = false;
    this.state.resultState = null;
    this.state.resultPlaceholderState = null;
    this.state.lastExportPayload = null;
    this.state.inlineExportVisible = false;
    this.state.inlinePlaceholderState = null;
    this.state.iframeActivityLogs = [];

    if (openLinkButton) {
      openLinkButton.href = "#";
      openLinkButton.textContent = "Continue";
      openLinkButton.classList.remove("hidden");
    }

    linkIframePanel?.classList.add("hidden");

    if (linkUploadHint) {
      linkUploadHint.classList.remove("hidden");
    }

    if (linkIframe) {
      linkIframe.style.height = "";
    }

    this.lastIframeHeight = 0;
    this.syncIframePanelContentVisibility(false);
    resetMediaView(this.elements.mediaViews.result);
    resetMediaView(this.elements.mediaViews.inline);
    resultMeta.innerHTML = "";
    resultMeta.classList.add("hidden");
    retryFetchButton.classList.add("hidden");
    linkInlineRetryButton?.classList.add("hidden");
    linkInlineCloseButton?.classList.add("hidden");
    this.elements.resultPlaceholder.classList.remove("hidden");
    this.setResultPlaceholder("result.placeholder.waitingProcessedData");
    this.setInlineResultPlaceholder("result.placeholder.waitingProcessedData");
    this.setResultState("waiting", "result.badges.waiting", "result.status.waitingProxy");
    this.renderIframeActivityLog();
  }

  setLoadingButtons(isLoading) {
    [
      this.elements.startDeeplinkButton,
      this.elements.startDeeplinkIframeButton,
      this.elements.startApiButton,
      this.elements.refreshCustomerNoButton,
      this.elements.siteCodeSelect
    ].forEach((control) => {
      setLoadingState(control, isLoading);
    });
  }

  applyTranslations() {
    // Static copy and dynamic screen copy are updated separately so changing the
    // UI language does not reset the active flow.
    this.i18n.applyDocumentTranslations();
    this.i18n.localizeSiteCodeOptions(this.elements.siteCodeSelect);
    this.i18n.localizeLocaleOptions(this.elements.localeSelect);
    this.refreshLinkScreenCopy();
    this.refreshResultScreenCopy();
  }

  refreshLinkScreenCopy() {
    if (this.elements.screenLink?.classList.contains("hidden")) {
      return;
    }

    if (this.state.flow === "deeplink") {
      this.showDeeplinkFlowScreen();
      return;
    }

    if (this.state.flow === "deeplink-iframe") {
      this.showDeeplinkIframeFlowScreen();

      if (this.state.inlineExportVisible && this.elements.linkInlinePlaceholder) {
        if (this.state.lastExportPayload) {
          this.renderInlineResult(this.state.lastExportPayload);
        } else if (this.state.inlinePlaceholderState) {
          const { key, params, rawText } = this.state.inlinePlaceholderState;
          if (typeof rawText === "string") {
            this.elements.linkInlinePlaceholder.textContent = rawText;
          } else {
            this.setInlineResultPlaceholder(key, params);
          }
        }
      }

      return;
    }

    if (this.state.flow === "api") {
      this.showApiFlowScreen();
    }
  }

  refreshResultScreenCopy() {
    if (this.elements.screenResult?.classList.contains("hidden")) {
      return;
    }

    if (this.state.lastExportPayload) {
      this.renderResult(this.state.lastExportPayload);
      return;
    }

    if (this.state.resultState) {
      const { kind, badgeKey, bodyKey, bodyParams } = this.state.resultState;
      this.setResultState(kind, badgeKey, bodyKey, bodyParams);
    }

    if (!this.state.resultPlaceholderState) {
      return;
    }

    const { key, params, rawText } = this.state.resultPlaceholderState;
    if (typeof rawText === "string") {
      this.elements.resultPlaceholder.textContent = rawText;
    } else {
      this.setResultPlaceholder(key, params);
    }
  }

  buildRedirectUrl(options = {}) {
    const { breakOutOfIframe = false } = options;
    const url = this.getAppBaseUrl();

    url.search = "";
    url.hash = "";
    url.searchParams.set("screen", "result");
    url.searchParams.set("customer_no", this.state.customerNo);
    url.searchParams.set("site_code", this.state.siteCode);
    url.searchParams.set("locale", this.state.locale);

    if (this.state.flow) {
      url.searchParams.set("flow", this.state.flow);
    }

    if (breakOutOfIframe) {
      url.searchParams.set("iframe_redirect", "1");
    }

    return url.toString();
  }

  setLinkScreen(copy) {
    const {
      generatedLinkPanel,
      generatedLinkText,
      linkActionRow,
      linkDescription,
      linkIframePanel,
      linkMainPanel,
      linkProcessStepPanel,
      linkTitle,
      linkUploadHint,
      openLinkButton
    } = this.elements;
    const options = {
      showIframe: false,
      showOpenButton: true,
      showGeneratedLink: false,
      showUploadHint: true,
      ...copy
    };

    linkTitle.textContent = this.t(options.titleKey, {}, linkTitle.textContent || "");
    linkDescription.textContent = this.t(options.descriptionKey, {}, linkDescription.textContent || "");
    openLinkButton.textContent = this.t(options.buttonLabelKey, {}, openLinkButton.textContent || "Continue");
    openLinkButton.href = this.state.linkUrl;
    linkIframePanel.classList.toggle("hidden", !options.showIframe);
    this.syncIframePanelContentVisibility(options.showIframe);
    openLinkButton.classList.toggle("hidden", !options.showOpenButton);

    if (linkUploadHint) {
      linkUploadHint.classList.toggle("hidden", !options.showUploadHint);
    }

    if (linkMainPanel) {
      linkMainPanel.classList.toggle("rounded-3xl", !options.showIframe);
      linkMainPanel.classList.toggle("border", !options.showIframe);
      linkMainPanel.classList.toggle("border-slate-200", !options.showIframe);
      linkMainPanel.classList.toggle("bg-white", !options.showIframe);
      linkMainPanel.classList.toggle("p-5", !options.showIframe);
    }

    linkActionRow?.classList.toggle("hidden", options.showIframe);

    if (generatedLinkPanel && generatedLinkText) {
      generatedLinkText.textContent = this.state.linkUrl || "";
      generatedLinkPanel.classList.toggle("hidden", !options.showGeneratedLink || !this.state.linkUrl);
    }

    linkProcessStepPanel.classList.toggle("hidden", !options.showIframe);
    if (options.showIframe) {
      this.applyProcessStepStatus(this.state.processStep || "pending");
      if (!this.state.inlineExportVisible) {
        this.scheduleIframeContentHeightMeasure();
      }
    }

    showScreen(this.elements.screens, "link");
  }

  showDeeplinkFlowScreen() {
    this.setLinkScreen({
      titleKey: "link.flows.deeplink.title",
      descriptionKey: "link.flows.deeplink.description",
      buttonLabelKey: "link.flows.deeplink.button",
      showIframe: false,
      showOpenButton: true,
      showGeneratedLink: true
    });
  }

  showDeeplinkIframeFlowScreen() {
    this.setLinkScreen({
      titleKey: "link.flows.iframe.title",
      descriptionKey: "link.flows.iframe.description",
      buttonLabelKey: "link.flows.iframe.button",
      showIframe: true,
      showOpenButton: false,
      showUploadHint: false
    });
  }

  showApiFlowScreen() {
    this.setLinkScreen({
      titleKey: "link.flows.api.title",
      descriptionKey: "link.flows.api.description",
      buttonLabelKey: "link.flows.api.button",
      showIframe: false,
      showOpenButton: true,
      showGeneratedLink: true
    });
  }

  setResultState(kind, badgeKey, bodyKey, bodyParams = {}) {
    const { resultStatusBadge, resultStatusText } = this.elements;

    this.state.resultState = {
      kind,
      badgeKey,
      bodyKey,
      bodyParams
    };

    resultStatusBadge.textContent = this.t(badgeKey, {}, resultStatusBadge.textContent || "");
    resultStatusBadge.className = "inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.18em]";

    if (kind === "ready") {
      resultStatusBadge.classList.add("bg-blue-100", "text-blue-700");
    } else if (kind === "error") {
      resultStatusBadge.classList.add("bg-rose-100", "text-rose-700");
    } else {
      resultStatusBadge.classList.add("bg-amber-100", "text-amber-700");
    }

    resultStatusText.textContent = this.t(bodyKey, bodyParams, resultStatusText.textContent || "");
  }

  applyProcessStepStatus(step) {
    const normalizedStep = typeof step === "string" ? step.trim() : "";
    const isFinalize = normalizedStep === "finalize";
    const { linkProcessStepPanel, linkProcessStepValue } = this.elements;

    this.state.processStep = normalizedStep;

    if (!linkProcessStepValue || !linkProcessStepPanel) {
      return;
    }

    const processStepLabel = normalizedStep
      ? normalizedStep
      : this.t("common.notSet", {}, "-");

    linkProcessStepValue.textContent = processStepLabel;
    linkProcessStepPanel.className = [
      "rounded-3xl border px-4 py-3",
      isFinalize ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"
    ].join(" ");

    if (this.state.flow === "deeplink-iframe" && isFinalize) {
      this.beginInlineFinalizeFetch();
    }
  }

  applyIframeHeight(height) {
    if (!this.elements.linkIframe) {
      return;
    }

    const safeHeight = Number(height);
    if (!Number.isFinite(safeHeight) || safeHeight <= 0) {
      return;
    }

    const roundedHeight = Math.max(Math.round(safeHeight), IFRAME_MIN_HEIGHT);
    if (roundedHeight === this.lastIframeHeight) {
      return;
    }

    this.lastIframeHeight = roundedHeight;
    this.elements.linkIframe.style.height = `${roundedHeight}px`;
  }

  getIframeContentHeightFromPayload(data = null) {
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

  measureIframeContentHeightFromDocument() {
    const { linkIframe, linkIframePanel } = this.elements;

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

  scheduleIframeContentHeightMeasure() {
    this.clearIframeHeightFrame();
    const contentHeight = this.measureIframeContentHeightFromDocument();
    if (contentHeight !== null) {
      this.applyIframeHeight(contentHeight);
    }

    this.iframeHeightFrame = this.window.requestAnimationFrame(() => {
      this.iframeHeightFrame = 0;
      const nextContentHeight = this.measureIframeContentHeightFromDocument();
      if (nextContentHeight !== null) {
        this.applyIframeHeight(nextContentHeight);
      }
    });
  }

  initializeIframeResizePropagation() {
    const { linkIframe, linkIframePanel } = this.elements;

    if (!linkIframe) {
      return;
    }

    linkIframe.addEventListener("load", () => {
      this.scheduleIframeContentHeightMeasure();
    });

    this.window.addEventListener("resize", () => {
      this.scheduleIframeContentHeightMeasure();
    });

    if ("ResizeObserver" in this.window) {
      const iframeResizeObserver = new this.window.ResizeObserver(() => {
        this.scheduleIframeContentHeightMeasure();
      });

      iframeResizeObserver.observe(linkIframe);
      if (linkIframePanel) {
        iframeResizeObserver.observe(linkIframePanel);
      }
    }
  }

  syncIframePanelContentVisibility(showIframe = !this.elements.linkIframePanel?.classList.contains("hidden")) {
    const { linkIframe, linkIframePanel, linkIframeStage, linkInlineResult } = this.elements;
    const showInlineResult = showIframe && this.state.inlineExportVisible;

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
      this.clearIframeHeightFrame();
      this.lastIframeHeight = 0;
      linkIframe.style.height = "";
      linkIframe.src = "about:blank";
      return;
    }

    if (showInlineResult) {
      this.clearIframeHeightFrame();
      return;
    }

    if (!linkIframePanel || linkIframePanel.classList.contains("hidden")) {
      return;
    }

    this.applyIframeHeight(IFRAME_MIN_HEIGHT);
    linkIframe.src = this.state.linkUrl || "about:blank";
  }

  async requestJson(path, options = {}) {
    return requestJson(path, options, this.t.bind(this));
  }

  async startFlow(flow) {
    this.state.flow = flow;
    this.state.processStep = "";
    this.state.siteCode = this.getSelectedSiteCode();
    this.state.locale = this.getSelectedLocale();
    this.syncCustomerNo();
    this.setLoadingButtons(true);

    try {
      let payload;

      if (flow === "deeplink") {
        payload = await this.requestJson("api/deeplink", {
          method: "POST",
          body: JSON.stringify({
            customer_no: this.state.customerNo,
            site_code: this.state.siteCode,
            locale: this.state.locale,
            // Deeplink mode returns the user to the demo so the proxy can poll /export.
            redirect_uri: this.buildRedirectUrl()
          })
        });

        this.state.linkUrl = payload.deeplink_url;
        this.showDeeplinkFlowScreen();
        return;
      }

      if (flow === "deeplink-iframe") {
        payload = await this.requestJson("api/deeplink", {
          method: "POST",
          body: JSON.stringify({
            customer_no: this.state.customerNo,
            site_code: this.state.siteCode,
            locale: this.state.locale,
            // An empty string disables the upstream default redirect for iframe mode.
            redirect_uri: ""
          })
        });

        this.state.linkUrl = payload.deeplink_url;
        this.showDeeplinkIframeFlowScreen();
        return;
      }

      if (flow === "api") {
        payload = await this.requestJson("api/invitation", {
          method: "POST",
          body: JSON.stringify({
            customer_no: this.state.customerNo,
            site_code: this.state.siteCode,
            locale: this.state.locale
          })
        });

        this.state.linkUrl = payload.invitation_url;
        this.showApiFlowScreen();
        return;
      }

      throw new Error(this.t("errors.unknownFlow", {}, "Unknown flow selected."));
    } catch (error) {
      this.window.alert(error.message || this.t("errors.requestFailed", {}, "Request failed."));
      showScreen(this.elements.screens, "start");
    } finally {
      this.setLoadingButtons(false);
    }
  }

  renderResult(file) {
    const { resultMeta, retryFetchButton } = this.elements;

    this.state.lastExportPayload = file;
    this.state.resultPlaceholderState = null;

    const renderResultData = renderMediaView(file, this.elements.mediaViews.result);
    const { exportFile, hasSignature } = renderResultData || { exportFile: {}, hasSignature: false };
    const notAvailable = this.t("common.notAvailable", {}, "n/a");
    const signatureKey = hasSignature
      ? "result.meta.signatureIncluded"
      : "result.meta.signatureNotRequested";

    resultMeta.classList.remove("hidden");
    resultMeta.innerHTML = [
      `<div><strong>${escapeHtml(this.t("result.meta.locale", {}, "locale"))}:</strong> ${escapeHtml(this.state.locale || notAvailable)}</div>`,
      `<div><strong>${escapeHtml(this.t("result.meta.siteCode", {}, "site_code"))}:</strong> ${escapeHtml(file.site_code || this.state.siteCode || notAvailable)}</div>`,
      `<div><strong>${escapeHtml(this.t("result.meta.file", {}, "File"))}:</strong> ${escapeHtml(exportFile.file_name || notAvailable)}</div>`,
      `<div><strong>${escapeHtml(this.t("result.meta.uploaded", {}, "Uploaded"))}:</strong> ${escapeHtml(exportFile.uploaded_at || notAvailable)}</div>`,
      `<div><strong>${escapeHtml(this.t("result.meta.exported", {}, "Exported"))}:</strong> ${escapeHtml(exportFile.exported_at || notAvailable)}</div>`,
      `<div><strong>${escapeHtml(this.t("result.meta.invitation", {}, "Invitation"))}:</strong> ${escapeHtml(exportFile.invitation_key || notAvailable)}</div>`,
      `<div><strong>${escapeHtml(this.t("result.meta.signature", {}, "Signature"))}:</strong> ${escapeHtml(this.t(signatureKey, {}, ""))}</div>`
    ].join("");
    retryFetchButton.classList.add("hidden");
    this.setResultState("ready", "result.badges.ready", "result.status.ready");
  }

  renderInlineResult(file) {
    this.state.lastExportPayload = file;
    this.state.inlinePlaceholderState = null;

    if (!this.state.inlineExportVisible) {
      return;
    }

    renderMediaView(file, this.elements.mediaViews.inline);
    this.elements.linkInlineRetryButton?.classList.add("hidden");
    this.elements.linkInlineCloseButton?.classList.remove("hidden");
    this.syncIframePanelContentVisibility(true);
  }

  revealInlineResultPanel() {
    this.state.inlineRevealPending = false;
    this.state.inlineExportVisible = true;

    if (this.state.lastExportPayload) {
      this.renderInlineResult(this.state.lastExportPayload);
      return;
    } else {
      resetMediaView(this.elements.mediaViews.inline);
      this.elements.linkInlineCloseButton?.classList.add("hidden");

      if (this.state.inlinePlaceholderState) {
        const { key, params, rawText } = this.state.inlinePlaceholderState;
        if (typeof rawText === "string") {
          this.elements.linkInlinePlaceholder.textContent = rawText;
        } else {
          this.setInlineResultPlaceholder(key, params);
        }
      } else {
        this.setInlineResultPlaceholder("result.placeholder.waitingProcessedData");
      }
    }

    this.syncIframePanelContentVisibility(true);
  }

  beginInlineFinalizeFetch() {
    if (this.state.inlineRevealPending || this.state.inlineExportVisible) {
      return;
    }

    // The iframe flow swaps from the child frame to the result preview after the
    // child reports the "finalize" step. Polling starts immediately so the data
    // can arrive before the visual transition finishes.
    this.clearPolling();
    this.clearInlineRevealDelay();
    this.state.pollAttempts = 0;
    this.state.lastExportPayload = null;
    this.state.inlineRevealPending = true;
    this.state.inlineExportVisible = false;
    this.state.inlinePlaceholderState = null;
    this.elements.linkInlineRetryButton?.classList.add("hidden");
    this.setInlineResultPlaceholder("result.placeholder.waitingProcessedData");
    this.state.inlineRevealHandle = this.window.setTimeout(() => {
      this.state.inlineRevealHandle = null;
      this.revealInlineResultPanel();
    }, 3000);
    this.pollForPhoto("inline");
  }

  async pollForPhoto(target = "screen") {
    this.clearPolling();
    this.state.pollAttempts += 1;
    this.state.exportFetchInFlight = true;

    const isInlineTarget = target === "inline";

    if (isInlineTarget) {
      this.elements.linkInlineRetryButton?.classList.add("hidden");
    } else {
      this.elements.retryFetchButton.classList.add("hidden");
    }

    try {
      const exportParams = new URLSearchParams();
      exportParams.set("customer_no", this.state.customerNo);
      exportParams.set("site_code", this.state.siteCode);

      const payload = await this.requestJson(`api/export?${exportParams.toString()}`);

      if (payload.status === "ready") {
        if (isInlineTarget) {
          this.renderInlineResult(payload);
        } else {
          this.renderResult(payload);
        }
        return;
      }

      this.state.lastExportPayload = null;

      const placeholderParams = {
        attempt: this.state.pollAttempts,
        maxAttempts: this.state.maxPollAttempts
      };

      if (isInlineTarget) {
        resetMediaView(this.elements.mediaViews.inline);
        this.elements.linkInlineCloseButton?.classList.add("hidden");
        this.setInlineResultPlaceholder("result.placeholder.noPhotoAttempt", placeholderParams);
      } else {
        this.elements.resultPlaceholder.classList.remove("hidden");
        this.setResultPlaceholder("result.placeholder.noPhotoAttempt", placeholderParams);
        this.setResultState("waiting", "result.badges.waiting", "result.status.notReady");
      }

      if (this.state.pollAttempts < this.state.maxPollAttempts) {
        this.state.pollHandle = this.window.setTimeout(() => {
          this.pollForPhoto(target);
        }, 4000);
        return;
      }

      if (isInlineTarget) {
        this.elements.linkInlineRetryButton?.classList.remove("hidden");
      } else {
        this.elements.retryFetchButton.classList.remove("hidden");
        this.setResultState("waiting", "result.badges.stillWaiting", "result.status.retryLater");
      }
    } catch (error) {
      this.state.lastExportPayload = null;

      if (isInlineTarget) {
        resetMediaView(this.elements.mediaViews.inline);
        this.elements.linkInlineRetryButton?.classList.remove("hidden");
        this.elements.linkInlineCloseButton?.classList.add("hidden");
        this.setRawInlineResultPlaceholder(error.message);
      } else {
        this.elements.retryFetchButton.classList.remove("hidden");
        this.elements.resultPlaceholder.classList.remove("hidden");
        this.setRawResultPlaceholder(error.message);
        this.setResultState("error", "result.badges.error", "result.status.error");
      }
    } finally {
      this.state.exportFetchInFlight = false;
    }
  }

  openResultScreen() {
    const { linkIframePanel, resultMeta, resultPlaceholder } = this.elements;

    this.clearPolling();
    this.clearInlineRevealDelay();
    this.state.pollAttempts = 0;
    this.state.inlineExportVisible = false;
    this.state.inlineRevealPending = false;
    this.state.inlinePlaceholderState = null;
    this.state.lastExportPayload = null;

    this.window.history.replaceState({}, "", this.buildRedirectUrl());
    this.syncIframePanelContentVisibility(Boolean(linkIframePanel && !linkIframePanel.classList.contains("hidden")));
    resetMediaView(this.elements.mediaViews.result);
    resultMeta.classList.add("hidden");
    resultMeta.innerHTML = "";
    resultPlaceholder.classList.remove("hidden");
    this.setResultPlaceholder("result.placeholder.waitingProcessedData");
    showScreen(this.elements.screens, "result");
    this.setResultState("waiting", "result.badges.waiting", "result.status.waitingProxy");
    this.pollForPhoto("screen");
  }

  bootstrapFromUrl() {
    const params = new URLSearchParams(this.window.location.search);
    const customerNo = params.get("customer_no");
    const requestedScreen = params.get("screen");
    const flow = params.get("flow");
    const siteCode = params.get("site_code");
    const locale = params.get("locale");
    const hasPersistedUiLanguage = Boolean(readCookie(this.config.cookieNames.uiLanguage, this.document));

    this.state.customerNo = customerNo || this.generateCustomerNo();
    this.state.siteCode = siteCode && this.config.supportedSiteCodes.includes(siteCode)
      ? siteCode
      : getDefaultSiteCode(this.elements, this.config, this.document);
    this.state.locale = locale && this.config.supportedLocales.includes(locale)
      ? locale
      : getDefaultLocale(this.elements, this.config, this.document);

    if (!hasPersistedUiLanguage && locale) {
      this.setUiLanguage(mapLocaleToUiLanguage(locale), { persist: false });
    }

    this.syncSiteCode();
    this.syncLocale();
    this.state.flow = flow || "";
    this.syncCustomerNo();

    if (requestedScreen === "result" && customerNo) {
      this.openResultScreen();
      return;
    }

    showScreen(this.elements.screens, "start");
  }

  handleWindowMessage(event) {
    const { linkIframe } = this.elements;

    if (!event.data || typeof event.data !== "object") {
      return;
    }

    if (!linkIframe || !event.source || event.source !== linkIframe.contentWindow) {
      return;
    }

    if (
      event.data.type === IFRAME_PROCESS_STEP_MESSAGE_TYPE ||
      event.data.type === IFRAME_ACTIVITY_MESSAGE_TYPE ||
      event.data.type === IFRAME_CONTENT_RESIZE_MESSAGE_TYPE
    ) {
      this.appendIframeActivityLog(event.data);
    }

    if (event.data.type === IFRAME_PROCESS_STEP_MESSAGE_TYPE) {
      this.applyProcessStepStatus(event.data.value);
      return;
    }

    if (event.data.type === IFRAME_ACTIVITY_MESSAGE_TYPE) {
      return;
    }

    if (event.data.type !== IFRAME_CONTENT_RESIZE_MESSAGE_TYPE) {
      return;
    }

    const messageHeight = this.getIframeContentHeightFromPayload(event.data);
    if (messageHeight !== null) {
      this.applyIframeHeight(messageHeight);
    }
  }
}
