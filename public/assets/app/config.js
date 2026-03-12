export const COOKIE_MAX_AGE_ONE_YEAR = 60 * 60 * 24 * 365;
export const SUPPORTED_LOCALES = ["en_US", "de_DE"];
export const DEFAULT_LOCALE = "en_US";
export const SUPPORTED_UI_LANGUAGES = ["en", "de"];
export const DEFAULT_UI_LANGUAGE = "en";

export const COOKIE_NAMES = {
  siteCode: "photo_collect_site_code",
  locale: "photo_collect_locale",
  uiLanguage: "photo_collect_ui_language"
};

export function createRuntimeConfig(elements) {
  const supportedSiteCodes = getConfiguredSiteCodes(elements.siteCodeSelect);
  const defaultSiteCodeFromTemplate = elements.siteCodeSelect
    ? String(elements.siteCodeSelect.dataset.defaultSiteCode || "").trim()
    : "";

  return {
    supportedSiteCodes,
    defaultSiteCodeFromTemplate,
    siteCodeFallback: defaultSiteCodeFromTemplate || supportedSiteCodes[0] || "",
    supportedLocales: SUPPORTED_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    supportedUiLanguages: SUPPORTED_UI_LANGUAGES,
    defaultUiLanguage: DEFAULT_UI_LANGUAGE,
    cookieNames: COOKIE_NAMES,
    cookieMaxAgeSeconds: COOKIE_MAX_AGE_ONE_YEAR
  };
}

export function appBaseUrl(documentRef = document) {
  return new URL(documentRef.baseURI);
}

export function readCookie(name, documentRef = document) {
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = documentRef.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.substring(prefix.length));
}

export function writeCookie(name, value, maxAgeSeconds, documentRef = document) {
  const safeValue = encodeURIComponent(value);
  const attributes = [
    `max-age=${maxAgeSeconds}`,
    "path=/",
    "SameSite=Lax"
  ];

  documentRef.cookie = `${encodeURIComponent(name)}=${safeValue}; ${attributes.join("; ")}`;
}

export function persistSiteCode(config, siteCode, documentRef = document) {
  if (!config.supportedSiteCodes.includes(siteCode)) {
    return;
  }

  writeCookie(config.cookieNames.siteCode, siteCode, config.cookieMaxAgeSeconds, documentRef);
}

export function persistLocale(config, locale, documentRef = document) {
  if (!config.supportedLocales.includes(locale)) {
    return;
  }

  writeCookie(config.cookieNames.locale, locale, config.cookieMaxAgeSeconds, documentRef);
}

export function persistUiLanguage(config, language, documentRef = document) {
  if (!config.supportedUiLanguages.includes(language)) {
    return;
  }

  writeCookie(config.cookieNames.uiLanguage, language, config.cookieMaxAgeSeconds, documentRef);
}

export function normalizeUiLanguage(value, config = { supportedUiLanguages: SUPPORTED_UI_LANGUAGES, defaultUiLanguage: DEFAULT_UI_LANGUAGE }) {
  const normalized = String(value || "").trim().toLowerCase();
  return config.supportedUiLanguages.includes(normalized) ? normalized : config.defaultUiLanguage;
}

export function mapLocaleToUiLanguage(locale) {
  return String(locale || "").toLowerCase().startsWith("de") ? "de" : "en";
}

export function getDefaultSiteCode(elements, config, documentRef = document) {
  const configured = elements.siteCodeSelect
    ? String(elements.siteCodeSelect.dataset.defaultSiteCode || "").trim()
    : "";
  const fromCookie = readCookie(config.cookieNames.siteCode, documentRef);

  if (fromCookie && config.supportedSiteCodes.includes(fromCookie)) {
    return fromCookie;
  }

  return config.supportedSiteCodes.includes(configured) ? configured : config.siteCodeFallback;
}

export function getDefaultLocale(elements, config, documentRef = document) {
  const configured = elements.localeSelect
    ? String(elements.localeSelect.dataset.defaultLocale || "").trim()
    : "";
  const fromCookie = readCookie(config.cookieNames.locale, documentRef);

  if (fromCookie && config.supportedLocales.includes(fromCookie)) {
    return fromCookie;
  }

  return config.supportedLocales.includes(configured) ? configured : config.defaultLocale;
}

export function getDefaultUiLanguage(config, windowRef = window, documentRef = document) {
  const fromCookie = readCookie(config.cookieNames.uiLanguage, documentRef);
  if (fromCookie) {
    return normalizeUiLanguage(fromCookie, config);
  }

  const fromLocaleCookie = readCookie(config.cookieNames.locale, documentRef);
  if (fromLocaleCookie && config.supportedLocales.includes(fromLocaleCookie)) {
    return mapLocaleToUiLanguage(fromLocaleCookie);
  }

  const browserLanguage = normalizeUiLanguage((windowRef.navigator.language || "").slice(0, 2), config);
  return config.supportedUiLanguages.includes(browserLanguage) ? browserLanguage : config.defaultUiLanguage;
}

export function getSelectedSiteCode(elements, config, fallback = "") {
  if (!elements.siteCodeSelect) {
    return fallback || config.siteCodeFallback;
  }

  const selected = String(elements.siteCodeSelect.value || "").trim();
  return config.supportedSiteCodes.includes(selected) ? selected : (fallback || config.siteCodeFallback);
}

export function getSelectedLocale(elements, config, fallback = "") {
  if (!elements.localeSelect) {
    return fallback || config.defaultLocale;
  }

  const selected = String(elements.localeSelect.value || "").trim();
  return config.supportedLocales.includes(selected) ? selected : (fallback || config.defaultLocale);
}

function getConfiguredSiteCodes(siteCodeSelect) {
  if (!siteCodeSelect) {
    return [];
  }

  const configValue = String(siteCodeSelect.dataset.supportedSiteCodes || "").trim();
  if (configValue === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(configValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((value) => String(value || "").trim())
      .filter((value) => value !== "");

    return [...new Set(normalized)];
  } catch (error) {
    return [];
  }
}
