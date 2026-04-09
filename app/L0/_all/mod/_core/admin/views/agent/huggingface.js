import { DEFAULT_DTYPE, normalizeHuggingFaceModelInput } from "/mod/_core/huggingface/helpers.js";
import { getHuggingFaceManager } from "/mod/_core/huggingface/manager.js";
import { AdminAgentLocalLlmRuntime } from "/mod/_core/admin/views/agent/local-runtime.js";

function normalizeSelection(selection = {}) {
  const modelId = normalizeHuggingFaceModelInput(selection.modelId || selection.modelInput);
  const dtype = String(selection.dtype || DEFAULT_DTYPE).trim() || DEFAULT_DTYPE;

  return {
    dtype,
    modelId
  };
}

function isMatchingSelection(leftSelection = {}, rightSelection = {}) {
  return leftSelection.modelId === rightSelection.modelId && leftSelection.dtype === rightSelection.dtype;
}

export function mapManagerStateToAdminState(snapshot = {}) {
  return {
    activeDtype: String(snapshot.activeDtype || ""),
    activeModelId: String(snapshot.activeModelId || ""),
    error: String(snapshot.error || ""),
    isLoadingModel: snapshot.isLoadingModel === true,
    isWorkerBooting: snapshot.isWorkerBooting === true,
    isWorkerReady: snapshot.isWorkerReady === true,
    loadProgress: {
      progress: Number.isFinite(Number(snapshot.loadProgress?.progress))
        ? Math.max(0, Math.min(1, Number(snapshot.loadProgress.progress)))
        : 0,
      status: String(snapshot.loadProgress?.status || ""),
      stepLabel: String(snapshot.loadProgress?.stepLabel || ""),
      text: String(snapshot.loadProgress?.stepLabel || ""),
      timeElapsed: 0
    },
    loadingModelLabel: String(snapshot.loadingModelLabel || ""),
    savedModels: Array.isArray(snapshot.savedModels) ? [...snapshot.savedModels] : [],
    statusText: String(snapshot.statusText || ""),
    webgpuSupported: snapshot.webgpuSupported !== false
  };
}

export function getAdminAgentHuggingFaceStateSnapshot() {
  return mapManagerStateToAdminState(getHuggingFaceManager().getSnapshot());
}

export class AdminAgentHuggingFaceRuntime extends AdminAgentLocalLlmRuntime {
  constructor(options = {}) {
    const manager = getHuggingFaceManager();

    super({
      initialState: mapManagerStateToAdminState(manager.getSnapshot()),
      onStateChange: options.onStateChange,
      providerLabel: "Hugging Face",
      readyStatusText: "Ready.",
      streamMode: "huggingface"
    });

    this.manager = manager;
    this.unsubscribeManager = this.manager.subscribe((snapshot) => {
      this.state = mapManagerStateToAdminState(snapshot);
      this.emitState();
    });
  }

  destroy() {
    this.unsubscribeManager?.();
    this.unsubscribeManager = null;
  }

  async ensureWorker() {
    await this.manager.ensureWorker();
    this.state = mapManagerStateToAdminState(this.manager.getSnapshot());
    this.emitState();
    return this.getSnapshot();
  }

  refreshSavedModels() {
    return this.manager.refreshSavedModels();
  }

  isSavedModelAvailable(selection = {}) {
    const normalizedSelection = normalizeSelection(selection);
    return this.state.savedModels.some((entry) => isMatchingSelection(entry, normalizedSelection));
  }

  async loadModel(selection = {}, options = {}) {
    return this.manager.loadModel(selection, options);
  }

  async unloadModel(options = {}) {
    const stoppedLoad = this.state.isLoadingModel;
    await this.manager.unloadModel(options);
    return {
      stoppedLoad
    };
  }

  async ensureModelLoaded(selection = {}, options = {}) {
    const normalizedSelection = normalizeSelection(selection);

    await this.ensureWorker();
    this.refreshSavedModels();

    if (!this.state.webgpuSupported) {
      throw new Error("WebGPU is not available in this browser.");
    }

    if (!normalizedSelection.modelId) {
      throw new Error("Choose a downloaded Hugging Face model.");
    }

    if (!normalizedSelection.dtype) {
      throw new Error("Choose a Hugging Face dtype.");
    }

    return this.manager.ensureModelLoaded(normalizedSelection, options);
  }

  async streamCompletion(options = {}) {
    const result = await this.manager.streamCompletion({
      messages: Array.isArray(options.messages) ? options.messages : [],
      modelSelection: options.modelSelection,
      onDelta: typeof options.onDelta === "function" ? options.onDelta : () => {},
      requestOptions: options.requestOptions,
      signal: options.signal
    });

    return result.responseMeta;
  }

  async resetChat() {}

  openConfiguration() {
    this.manager.openConfiguration();
  }
}
