import { createApiClient } from "./api-client.js";
import { downloadProxiedFile } from "./download.js";
import { installFetchProxy } from "./fetch-proxy.js";
import { buildProxyUrl, isProxyableExternalUrl } from "./proxy-url.js";

function publishRuntime(targetWindow, runtime) {
  if (!targetWindow) {
    return;
  }

  try {
    targetWindow.space = runtime;
  } catch (error) {
    // Ignore inaccessible window targets.
  }
}

export function initializeRuntime(options = {}) {
  const apiBasePath = options.apiBasePath || "/api";
  const proxyPath = options.proxyPath || "/api/proxy";

  installFetchProxy({ proxyPath });
  const api = createApiClient({ basePath: apiBasePath });
  const previousRuntime = globalThis.space && typeof globalThis.space === "object" ? globalThis.space : {};

  const runtime = {
    ...previousRuntime,
    api,
    apiBasePath,
    proxyPath,
    fetchExternal(targetUrl, init) {
      return window.fetch(targetUrl, init);
    },
    proxy: {
      isExternal(targetUrl) {
        return isProxyableExternalUrl(targetUrl);
      },
      buildUrl(targetUrl, proxyOptions = {}) {
        return buildProxyUrl(targetUrl, {
          proxyPath,
          ...proxyOptions
        });
      }
    },
    download(targetUrl, downloadOptions = {}) {
      return downloadProxiedFile(targetUrl, {
        proxyPath,
        ...downloadOptions
      });
    }
  };

  publishRuntime(window, runtime);
  publishRuntime(window.parent, runtime);
  publishRuntime(window.top, runtime);
  return runtime;
}
