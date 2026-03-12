function toDatasetKey(attributeName) {
  return attributeName
    .split("-")
    .map((part, index) => (index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join("");
}

export class TranslationService {
  constructor({ baseUrl, documentRef = document, supportedLanguages, defaultLanguage }) {
    this.baseUrl = new URL(baseUrl, documentRef.baseURI);
    this.document = documentRef;
    this.supportedLanguages = supportedLanguages;
    this.defaultLanguage = defaultLanguage;
    this.currentLanguage = defaultLanguage;
    this.dictionaries = {};
  }

  async loadAll() {
    const entries = await Promise.all(
      this.supportedLanguages.map(async (language) => [language, await this.load(language)])
    );

    this.dictionaries = Object.fromEntries(entries);
  }

  setLanguage(language) {
    this.currentLanguage = this.normalizeLanguage(language);
    this.document.documentElement.lang = this.currentLanguage;
  }

  translate(key, params = {}, fallback = key) {
    const localized = this.getValue(this.currentLanguage, key);
    const englishFallback = this.getValue(this.defaultLanguage, key);
    const resolved = localized ?? englishFallback ?? fallback;

    return typeof resolved === "string" ? this.interpolate(resolved, params) : fallback;
  }

  applyDocumentTranslations() {
    this.document.title = this.translate("meta.title", {}, this.document.title);

    this.document.querySelectorAll("[data-i18n]").forEach((element) => {
      const fallback = element.dataset.i18nFallback || element.textContent || "";
      if (!element.dataset.i18nFallback) {
        element.dataset.i18nFallback = fallback;
      }

      element.textContent = this.translate(element.dataset.i18n, {}, fallback);
    });

    this.document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
      const mappings = String(element.dataset.i18nAttr || "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.includes(":"));

      mappings.forEach((mapping) => {
        const separatorIndex = mapping.indexOf(":");
        const attributeName = mapping.slice(0, separatorIndex).trim();
        const key = mapping.slice(separatorIndex + 1).trim();
        const datasetKey = toDatasetKey(attributeName);
        const fallbackDatasetKey = `i18nAttrFallback${datasetKey.charAt(0).toUpperCase()}${datasetKey.slice(1)}`;
        const fallback = element.dataset[fallbackDatasetKey] || element.getAttribute(attributeName) || "";

        if (!element.dataset[fallbackDatasetKey]) {
          element.dataset[fallbackDatasetKey] = fallback;
        }

        element.setAttribute(attributeName, this.translate(key, {}, fallback));
      });
    });
  }

  localizeSiteCodeOptions(select) {
    if (!select) {
      return;
    }

    Array.from(select.options).forEach((option) => {
      const fallback = option.dataset.defaultLabel || option.value;
      option.textContent = this.translate(`siteCodes.${option.value}`, {}, fallback);
    });
  }

  localizeLocaleOptions(select) {
    if (!select) {
      return;
    }

    Array.from(select.options).forEach((option) => {
      const key = option.dataset.localeOption;
      if (!key) {
        return;
      }

      option.textContent = this.translate(`start.processLocaleOptions.${key}`, {}, option.textContent);
    });
  }

  async load(language) {
    const response = await fetch(new URL(`assets/locales/${language}.json`, this.baseUrl).toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Unable to load locale: ${language}`);
    }

    return response.json();
  }

  getValue(language, key) {
    const dictionary = this.dictionaries[language];
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

  interpolate(message, params = {}) {
    return String(message).replace(/\{(\w+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        return String(params[key]);
      }

      return match;
    });
  }

  normalizeLanguage(language) {
    const normalized = String(language || "").trim().toLowerCase();
    return this.supportedLanguages.includes(normalized) ? normalized : this.defaultLanguage;
  }
}
