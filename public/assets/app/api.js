export async function requestJson(path, options = {}, translate = (_key, _params, fallback) => fallback) {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || translate("errors.requestFailed", {}, "Request failed."));
  }

  return payload;
}
