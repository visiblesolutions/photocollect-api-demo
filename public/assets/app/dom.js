function byId(documentRef, id) {
  return documentRef.getElementById(id);
}

export function collectElements(documentRef = document) {
  const elements = {
    screenStart: byId(documentRef, "screen-start"),
    screenLink: byId(documentRef, "screen-link"),
    screenResult: byId(documentRef, "screen-result"),
    customerNoBadge: byId(documentRef, "customerNoBadge"),
    refreshCustomerNoButton: byId(documentRef, "refreshCustomerNo"),
    localeSelect: byId(documentRef, "localeSelect"),
    siteCodeSelect: byId(documentRef, "siteCodeSelect"),
    startDeeplinkButton: byId(documentRef, "startDeeplink"),
    startDeeplinkIframeButton: byId(documentRef, "startDeeplinkIframe"),
    startApiButton: byId(documentRef, "startApi"),
    logoHomeButton: byId(documentRef, "logoHome"),
    appLanguageButtons: documentRef.querySelectorAll("[data-ui-language]"),
    linkTitle: byId(documentRef, "linkTitle"),
    linkDescription: byId(documentRef, "linkDescription"),
    linkMainPanel: byId(documentRef, "linkMainPanel"),
    linkIframePanel: byId(documentRef, "linkIframePanel"),
    linkIframeStage: byId(documentRef, "linkIframeStage"),
    linkIframe: byId(documentRef, "linkIframe"),
    linkInlineResult: byId(documentRef, "linkInlineResult"),
    linkInlinePlaceholder: byId(documentRef, "linkInlinePlaceholder"),
    linkInlineGallery: byId(documentRef, "linkInlineGallery"),
    linkInlineImage: byId(documentRef, "linkInlineImage"),
    linkInlineSignaturePanel: byId(documentRef, "linkInlineSignaturePanel"),
    linkInlineSignatureImage: byId(documentRef, "linkInlineSignatureImage"),
    linkInlineRetryButton: byId(documentRef, "linkInlineRetry"),
    linkInlineCloseButton: byId(documentRef, "linkInlineClose"),
    linkProcessStepPanel: byId(documentRef, "linkProcessStepPanel"),
    linkProcessStepValue: byId(documentRef, "linkProcessStepValue"),
    openLinkButton: byId(documentRef, "openLinkButton"),
    linkActionRow: byId(documentRef, "linkActionRow"),
    generatedLinkPanel: byId(documentRef, "generatedLinkPanel"),
    generatedLinkText: byId(documentRef, "generatedLinkText"),
    linkUploadHint: byId(documentRef, "linkUploadHint"),
    resultStatusBadge: byId(documentRef, "resultStatusBadge"),
    resultStatusText: byId(documentRef, "resultStatusText"),
    resultPlaceholder: byId(documentRef, "resultPlaceholder"),
    resultGallery: byId(documentRef, "resultGallery"),
    resultImage: byId(documentRef, "resultImage"),
    resultSignaturePanel: byId(documentRef, "resultSignaturePanel"),
    resultSignatureImage: byId(documentRef, "resultSignatureImage"),
    resultMeta: byId(documentRef, "resultMeta"),
    retryFetchButton: byId(documentRef, "retryFetch"),
    closeResultButtons: documentRef.querySelectorAll("[data-close-result]")
  };

  return {
    ...elements,
    screens: {
      start: elements.screenStart,
      link: elements.screenLink,
      result: elements.screenResult
    },
    mediaViews: {
      result: {
        placeholder: elements.resultPlaceholder,
        gallery: elements.resultGallery,
        image: elements.resultImage,
        signaturePanel: elements.resultSignaturePanel,
        signatureImage: elements.resultSignatureImage
      },
      inline: {
        placeholder: elements.linkInlinePlaceholder,
        gallery: elements.linkInlineGallery,
        image: elements.linkInlineImage,
        signaturePanel: elements.linkInlineSignaturePanel,
        signatureImage: elements.linkInlineSignatureImage
      }
    }
  };
}

export function showScreen(screens, name) {
  Object.entries(screens).forEach(([screenName, element]) => {
    if (!element) {
      return;
    }

    element.classList.toggle("hidden", screenName !== name);
  });
}

export function setLoadingState(control, isLoading) {
  if (!control) {
    return;
  }

  control.disabled = isLoading;
  control.classList.toggle("opacity-60", isLoading);
  control.classList.toggle("cursor-not-allowed", isLoading);
}
