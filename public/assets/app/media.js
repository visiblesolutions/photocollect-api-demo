export function resetMediaView(view) {
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

export function renderMediaView(file, view) {
  if (!view) {
    return null;
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
