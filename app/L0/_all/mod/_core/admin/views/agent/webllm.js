import { compareModelRecords } from "/mod/_core/webllm/helpers.js";
import { WORKER_INBOUND, WORKER_OUTBOUND } from "/mod/_core/webllm/protocol.js";
import {
  AdminAgentLocalLlmRuntime,
  createAbortError,
  createDeferred,
  createLocalRuntimeError
} from "/mod/_core/admin/views/agent/local-runtime.js";

const WEBLLM_CONFIG_ROUTE = "/#/webllm";

function createInitialState() {
  return {
    activeModelId: "",
    cacheStatusReady: false,
    cachedModelIds: [],
    error: "",
    isLoadingModel: false,
    isUnloadingModel: false,
    isWorkerReady: false,
    loadProgress: {
      progress: 0,
      text: "",
      timeElapsed: 0
    },
    loadingModelLabel: "",
    prebuiltModels: [],
    statusText: "Starting WebLLM worker...",
    webgpuSupported: Boolean(globalThis.navigator?.gpu)
  };
}

function normalizeProgressReport(report = {}) {
  return {
    progress: Number.isFinite(report.progress) ? Math.max(0, Math.min(1, report.progress)) : 0,
    text: typeof report.text === "string" ? report.text.trim() : "",
    timeElapsed: Number.isFinite(report.timeElapsed) ? Math.max(0, report.timeElapsed) : 0
  };
}

function isLoadStoppedError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("load stopped") || message.includes("aborted");
}

export class AdminAgentWebLlmRuntime extends AdminAgentLocalLlmRuntime {
  constructor(options = {}) {
    super({
      initialState: createInitialState(),
      onStateChange: options.onStateChange,
      protocol: {
        WORKER_INBOUND,
        WORKER_OUTBOUND
      },
      providerLabel: "WebLLM",
      readyStatusText: "Ready.",
      streamMode: "webllm",
      workerUrl: "/mod/_core/admin/views/agent/webllm-worker.js"
    });

    this.cacheWaiters = [];
    this.pendingLoad = null;
    this.pendingUnload = null;
  }

  handleProviderDestroy(runtimeClosedError) {
    this.pendingLoad?.deferred.reject(runtimeClosedError);
    this.pendingUnload?.deferred.reject(runtimeClosedError);
    this.pendingLoad = null;
    this.pendingUnload = null;
    this.resolveCacheWaiters();
  }

  handleWorkerFailure(error) {
    this.pendingLoad?.deferred.reject(error);
    this.pendingUnload?.deferred.reject(error);
    this.pendingLoad = null;
    this.pendingUnload = null;
    this.resolveCacheWaiters();
  }

  handleReadyPayload(payload = {}) {
    super.handleReadyPayload(payload, {
      prebuiltModels: Array.isArray(payload.prebuiltModels) ? [...payload.prebuiltModels].sort(compareModelRecords) : []
    });
  }

  readChatDelta(payload = {}) {
    return typeof payload.delta === "string" ? payload.delta : super.readChatDelta(payload, this.pendingChat);
  }

  buildChatResponseMeta(payload = {}, pendingChat = {}) {
    return {
      finishReason: payload.finishReason || "stop",
      mode: "webllm",
      payloadCount: Math.max(1, pendingChat.deltaCount || 0),
      protocolObserved: true,
      sawDoneMarker: false,
      textChunkCount: pendingChat.deltaCount || 0,
      verifiedEmpty: !String(payload.text || "").trim()
    };
  }

  resolveCacheWaiters() {
    if (!this.cacheWaiters.length) {
      return;
    }

    const downloadedModels = this.getDownloadedModels();
    const waiters = this.cacheWaiters.slice();
    this.cacheWaiters = [];
    waiters.forEach((resolve) => resolve(downloadedModels));
  }

  handleProviderWorkerMessage(message = {}, payload = {}) {
    switch (message.type) {
      case WORKER_OUTBOUND.CACHE_STATUS: {
        this.setState({
          cacheStatusReady: true,
          cachedModelIds: Array.isArray(payload.cachedModelIds) ? [...payload.cachedModelIds].sort() : []
        });
        this.resolveCacheWaiters();
        break;
      }
      case WORKER_OUTBOUND.LOAD_PROGRESS: {
        if (!this.pendingLoad || payload.requestId !== this.pendingLoad.requestId) {
          return;
        }

        this.setState({
          error: "",
          isLoadingModel: true,
          isUnloadingModel: false,
          loadProgress: normalizeProgressReport(payload.report),
          loadingModelLabel: this.pendingLoad.modelId,
          statusText: "Loading model..."
        });
        break;
      }
      case WORKER_OUTBOUND.LOAD_COMPLETE: {
        if (!this.pendingLoad || payload.requestId !== this.pendingLoad.requestId) {
          return;
        }

        const pendingLoad = this.pendingLoad;
        this.pendingLoad = null;
        this.setState({
          activeModelId: payload.modelId || pendingLoad.modelId,
          error: "",
          isLoadingModel: false,
          loadProgress: {
            progress: 0,
            text: "",
            timeElapsed: 0
          },
          loadingModelLabel: "",
          statusText: "Ready."
        });
        pendingLoad.deferred.resolve({
          modelId: payload.modelId || pendingLoad.modelId
        });
        break;
      }
      case WORKER_OUTBOUND.LOAD_ERROR: {
        if (!this.pendingLoad || payload.requestId !== this.pendingLoad.requestId) {
          return;
        }

        const pendingLoad = this.pendingLoad;
        this.pendingLoad = null;
        const error = createLocalRuntimeError(payload.error, "Unable to load the selected WebLLM model.");
        this.setState({
          error: error.message,
          isLoadingModel: false,
          loadProgress: {
            progress: 0,
            text: "",
            timeElapsed: 0
          },
          loadingModelLabel: "",
          statusText: error.message
        });
        pendingLoad.deferred.reject(error);
        break;
      }
      case WORKER_OUTBOUND.UNLOAD_COMPLETE: {
        const stoppedLoad = payload.stoppedLoad === true;

        if (this.pendingLoad && stoppedLoad) {
          this.pendingLoad.deferred.reject(createAbortError("Model load stopped."));
          this.pendingLoad = null;
        }

        if (this.pendingUnload && payload.requestId === this.pendingUnload.requestId) {
          this.pendingUnload.deferred.resolve({
            stoppedLoad
          });
          this.pendingUnload = null;
        }

        this.setState({
          activeModelId: "",
          error: "",
          isLoadingModel: false,
          isUnloadingModel: false,
          loadProgress: {
            progress: 0,
            text: "",
            timeElapsed: 0
          },
          loadingModelLabel: "",
          statusText: stoppedLoad ? "Model load stopped." : "Model unloaded."
        });
        break;
      }
      case WORKER_OUTBOUND.UNLOAD_ERROR: {
        if (!this.pendingUnload || payload.requestId !== this.pendingUnload.requestId) {
          return;
        }

        const pendingUnload = this.pendingUnload;
        this.pendingUnload = null;
        const error = createLocalRuntimeError(payload.error, "Unable to unload the WebLLM model.");
        this.setState({
          error: error.message,
          isUnloadingModel: false,
          statusText: error.message
        });
        pendingUnload.deferred.reject(error);
        break;
      }
      case WORKER_OUTBOUND.CHAT_RESET:
      case WORKER_OUTBOUND.DISCARD_COMPLETE:
      case WORKER_OUTBOUND.DISCARD_ERROR:
      default:
        break;
    }
  }

  getDownloadedModels() {
    const cachedModelIds = new Set(this.state.cachedModelIds);
    return this.state.prebuiltModels.filter((modelRecord) => cachedModelIds.has(modelRecord.model_id));
  }

  isModelCached(modelId) {
    const normalizedModelId = String(modelId || "").trim();
    return normalizedModelId ? this.state.cachedModelIds.includes(normalizedModelId) : false;
  }

  isKnownModel(modelId) {
    const normalizedModelId = String(modelId || "").trim();
    return normalizedModelId
      ? this.state.prebuiltModels.some((modelRecord) => modelRecord.model_id === normalizedModelId)
      : false;
  }

  async requestCacheStatus() {
    await this.ensureWorker();

    return new Promise((resolve) => {
      this.cacheWaiters.push(resolve);
      this.postMessage(WORKER_INBOUND.SCAN_CACHE, {});
    });
  }

  async waitForInitialCacheStatus() {
    await this.ensureWorker();

    if (this.state.cacheStatusReady) {
      return this.getDownloadedModels();
    }

    return new Promise((resolve) => {
      this.cacheWaiters.push(resolve);
    });
  }

  async unloadModel() {
    await this.ensureWorker();

    if (this.pendingUnload) {
      return this.pendingUnload.deferred.promise;
    }

    if (!this.state.activeModelId && !this.state.isLoadingModel) {
      return {
        stoppedLoad: false
      };
    }

    const deferred = createDeferred();
    const requestId = crypto.randomUUID();
    this.pendingUnload = {
      deferred,
      requestId
    };

    this.setState({
      error: "",
      isUnloadingModel: true,
      statusText: this.state.isLoadingModel ? "Stopping model load..." : "Unloading model..."
    });
    this.postMessage(WORKER_INBOUND.UNLOAD_MODEL, {
      requestId
    });
    return deferred.promise;
  }

  async loadModel(modelId) {
    await this.ensureWorker();

    if (this.pendingLoad && this.pendingLoad.modelId === modelId) {
      return this.pendingLoad.deferred.promise;
    }

    const deferred = createDeferred();
    const requestId = crypto.randomUUID();
    this.pendingLoad = {
      deferred,
      modelId,
      requestId
    };

    this.setState({
      error: "",
      isLoadingModel: true,
      isUnloadingModel: false,
      loadProgress: {
        progress: 0.01,
        text: "",
        timeElapsed: 0
      },
      loadingModelLabel: modelId,
      statusText: "Loading model..."
    });
    this.postMessage(WORKER_INBOUND.LOAD_MODEL, {
      modelId,
      requestId
    });
    return deferred.promise;
  }

  async ensureModelLoaded(modelSelection = {}, options = {}) {
    const signal = options.signal;
    const normalizedModelId = String(modelSelection?.modelId || "").trim();

    await this.ensureWorker();

    if (!this.state.webgpuSupported) {
      throw new Error("WebGPU is not available in this browser.");
    }

    if (!normalizedModelId) {
      throw new Error("Choose a WebLLM model.");
    }

    if (!this.state.cacheStatusReady) {
      await this.waitForInitialCacheStatus();
    }

    if (!this.isKnownModel(normalizedModelId)) {
      throw new Error("Choose a valid WebLLM model.");
    }

    if (signal?.aborted) {
      throw createAbortError();
    }

    const awaitLoad = async (loadPromise) => {
      if (!signal) {
        return loadPromise;
      }

      let abortRequested = signal.aborted;
      const abortHandler = () => {
        abortRequested = true;
        void this.unloadModel().catch(() => {});
      };

      signal.addEventListener("abort", abortHandler, {
        once: true
      });

      try {
        const result = await loadPromise;

        if (abortRequested || signal.aborted) {
          throw createAbortError();
        }

        return result;
      } catch (error) {
        if (abortRequested || signal.aborted || isLoadStoppedError(error)) {
          throw createAbortError();
        }

        throw error;
      } finally {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    if (this.pendingLoad?.modelId === normalizedModelId) {
      return await awaitLoad(this.pendingLoad.deferred.promise);
    }

    if (this.pendingLoad && this.pendingLoad.modelId !== normalizedModelId) {
      await this.unloadModel();
    }

    if (this.state.activeModelId === normalizedModelId && !this.state.isLoadingModel) {
      return {
        modelId: normalizedModelId
      };
    }

    if (this.state.activeModelId && this.state.activeModelId !== normalizedModelId) {
      await this.unloadModel();

      if (signal?.aborted) {
        throw createAbortError();
      }
    }

    return await awaitLoad(this.loadModel(normalizedModelId));
  }

  async resetChat() {
    await this.ensureWorker();
    this.postMessage(WORKER_INBOUND.RESET_CHAT, {});
  }

  openConfiguration() {
    const targetUrl = new URL(WEBLLM_CONFIG_ROUTE, globalThis.location?.origin || globalThis.location?.href || "/").href;
    globalThis.open?.(targetUrl, "_blank", "noopener");
  }
}
