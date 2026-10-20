const DEFAULT_ATTEMPTS = 40;
const DEFAULT_DELAY_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function cacheBust(url, attempt) {
  const target = new URL(url);
  target.searchParams.set("live-check", `${Date.now()}-${attempt}`);
  return target.toString();
}

async function fetchLive(url, requestTimeoutMs) {
  return fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
}

export async function checkDeployment(
  targetUrl,
  expectedAsset,
  attempt,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
) {
  const htmlResponse = await fetchLive(cacheBust(targetUrl, attempt), requestTimeoutMs);
  if (!htmlResponse.ok) {
    throw new Error(`HTTP ${htmlResponse.status} ${htmlResponse.statusText}`.trim());
  }

  const html = await htmlResponse.text();
  if (!expectedAsset) {
    return;
  }

  const assetName = expectedAsset.split("/").pop();
  if (!html.includes(expectedAsset) && !html.includes(assetName)) {
    throw new Error(`live HTML does not reference ${assetName}`);
  }

  const assetUrl = new URL(expectedAsset, targetUrl);
  const assetResponse = await fetchLive(
    cacheBust(assetUrl.toString(), attempt),
    requestTimeoutMs,
  );
  if (!assetResponse.ok) {
    throw new Error(
      `${assetName} returned HTTP ${assetResponse.status} ${assetResponse.statusText}`.trim(),
    );
  }
}

export async function waitForDeployment(targetUrl, expectedAsset, options = {}) {
  const attempts = positiveInteger(options.attempts, DEFAULT_ATTEMPTS);
  const delayMs = positiveInteger(options.delayMs, DEFAULT_DELAY_MS);
  const requestTimeoutMs = positiveInteger(
    options.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const log = options.log ?? console.log;
  const label = expectedAsset
    ? `asset ${expectedAsset.split("/").pop()}`
    : "the deployed page";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkDeployment(targetUrl, expectedAsset, attempt, requestTimeoutMs);
      log(`[live] ${targetUrl} is serving ${label}`);
      return;
    } catch (error) {
      log(`[live] Attempt ${attempt}/${attempts}: ${error.message}`);
    }

    if (attempt < attempts) {
      await delay(delayMs);
    }
  }

  throw new Error(
    `Deployed site did not serve ${label} at ${targetUrl} after ${attempts} attempts`,
  );
}
