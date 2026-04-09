function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneRuntimeState(state, seen = new WeakMap()) {
  if (state == null || typeof state === "string" || typeof state === "number" || typeof state === "boolean") {
    return state;
  }

  if (typeof state === "bigint") {
    return Number(state);
  }

  if (typeof state === "function" || typeof state === "symbol") {
    return undefined;
  }

  if (state instanceof Error) {
    return {
      message: state.message,
      name: state.name,
      stack: state.stack || ""
    };
  }

  if (typeof globalThis.URL === "function" && state instanceof globalThis.URL) {
    return state.href;
  }

  if (state instanceof Date) {
    return new Date(state.getTime()).toISOString();
  }

  if (state instanceof RegExp) {
    return String(state);
  }

  if (typeof globalThis.Window === "function" && state instanceof globalThis.Window) {
    return null;
  }

  if (typeof globalThis.Element === "function" && state instanceof globalThis.Element) {
    return null;
  }

  if (seen.has(state)) {
    return seen.get(state);
  }

  if (Array.isArray(state)) {
    const clonedArray = [];
    seen.set(state, clonedArray);

    state.forEach((entry) => {
      const clonedEntry = cloneRuntimeState(entry, seen);
      clonedArray.push(clonedEntry === undefined ? null : clonedEntry);
    });

    return clonedArray;
  }

  if (state instanceof Map) {
    const clonedEntries = [];
    seen.set(state, clonedEntries);

    state.forEach((entryValue, entryKey) => {
      clonedEntries.push([
        cloneRuntimeState(entryKey, seen),
        cloneRuntimeState(entryValue, seen)
      ]);
    });

    return clonedEntries;
  }

  if (state instanceof Set) {
    const clonedEntries = [];
    seen.set(state, clonedEntries);

    state.forEach((entryValue) => {
      clonedEntries.push(cloneRuntimeState(entryValue, seen));
    });

    return clonedEntries;
  }

  if (state instanceof ArrayBuffer) {
    return state.slice(0);
  }

  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(state)) {
    return Array.from(state);
  }

  if (isPlainObject(state)) {
    const clonedObject = {};
    seen.set(state, clonedObject);

    Object.entries(state).forEach(([key, entryValue]) => {
      const clonedEntry = cloneRuntimeState(entryValue, seen);

      if (clonedEntry !== undefined) {
        clonedObject[key] = clonedEntry;
      }
    });

    return clonedObject;
  }

  try {
    return String(state);
  } catch {
    return null;
  }
}

export function createDeferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve
  };
}

export function createAbortError(message = "The operation was aborted.") {
  try {
    return new DOMException(message, "AbortError");
  } catch {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
}

export function createLocalRuntimeError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error?.message === "string" && error.message) {
    return new Error(error.message);
  }

  return new Error(fallbackMessage);
}

export class AdminAgentLocalLlmRuntime {
  constructor(options = {}) {
    this.onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : null;
    this.protocol = options.protocol;
    this.providerLabel = String(options.providerLabel || "Local runtime");
    this.readyStatusText = String(options.readyStatusText || "Ready.");
    this.streamMode = String(options.streamMode || "local");
    this.workerType = String(options.workerType || "module");
    this.workerUrl = String(options.workerUrl || "");
    this.state = cloneRuntimeState(options.initialState || {});
    this.worker = null;
    this.readyDeferred = null;
    this.pendingChat = null;
    this.handleWorkerMessage = this.handleWorkerMessage.bind(this);
    this.handleWorkerError = this.handleWorkerError.bind(this);
    this.handleWorkerMessageError = this.handleWorkerMessageError.bind(this);
  }

  emitState() {
    this.onStateChange?.(this.getSnapshot());
  }

  setState(patch = {}) {
    this.state = {
      ...this.state,
      ...patch
    };
    this.emitState();
  }

  getSnapshot() {
    return cloneRuntimeState(this.state);
  }

  createReadyDeferred() {
    this.readyDeferred = createDeferred();
    return this.readyDeferred;
  }

  createWorker() {
    return new Worker(this.workerUrl, {
      type: this.workerType
    });
  }

  ensureWorker() {
    if (this.worker) {
      return this.readyDeferred?.promise || Promise.resolve(this.getSnapshot());
    }

    if (!this.workerUrl) {
      return Promise.reject(new Error(`${this.providerLabel} worker URL is not configured.`));
    }

    this.createReadyDeferred();
    this.worker = this.createWorker();
    this.worker.addEventListener("message", this.handleWorkerMessage);
    this.worker.addEventListener("error", this.handleWorkerError);
    this.worker.addEventListener("messageerror", this.handleWorkerMessageError);
    this.postMessage(this.protocol.WORKER_INBOUND.BOOT, {});
    return this.readyDeferred.promise;
  }

  postMessage(type, payload = {}) {
    if (!this.worker) {
      throw new Error(`${this.providerLabel} worker is not available.`);
    }

    this.worker.postMessage({
      payload,
      type
    });
  }

  clearPendingChat() {
    if (!this.pendingChat) {
      return;
    }

    this.pendingChat.signal?.removeEventListener("abort", this.pendingChat.abortHandler);
    this.pendingChat = null;
  }

  teardownWorker(error = null) {
    if (this.worker) {
      this.worker.removeEventListener("message", this.handleWorkerMessage);
      this.worker.removeEventListener("error", this.handleWorkerError);
      this.worker.removeEventListener("messageerror", this.handleWorkerMessageError);

      try {
        this.worker.terminate();
      } catch {
        // Ignore worker termination failures.
      }
    }

    this.worker = null;

    if (this.readyDeferred && error) {
      this.readyDeferred.reject(error);
    }

    this.readyDeferred = null;
  }

  destroy() {
    const runtimeClosedError = new Error(`${this.providerLabel} runtime closed.`);

    if (this.pendingChat) {
      this.pendingChat.deferred.reject(runtimeClosedError);
      this.clearPendingChat();
    }

    this.handleProviderDestroy(runtimeClosedError);
    this.teardownWorker(runtimeClosedError);
  }

  handleProviderDestroy() {}

  handleReadyPayload(payload = {}, extraPatch = {}) {
    this.setState({
      error: "",
      isWorkerReady: true,
      statusText: this.readyStatusText,
      webgpuSupported: payload.webgpuSupported !== false,
      ...extraPatch
    });
    this.readyDeferred?.resolve(this.getSnapshot());
  }

  readChatDelta(payload = {}, pendingChat) {
    if (typeof payload.delta === "string") {
      return payload.delta;
    }

    const nextText = typeof payload.text === "string" ? payload.text : "";
    const previousText = typeof pendingChat?.fullText === "string" ? pendingChat.fullText : "";
    const delta = nextText.startsWith(previousText) ? nextText.slice(previousText.length) : nextText;
    pendingChat.fullText = nextText;
    return delta;
  }

  buildChatResponseMeta(payload = {}, pendingChat = {}) {
    return {
      finishReason: payload.finishReason || "stop",
      mode: this.streamMode,
      payloadCount: Math.max(1, pendingChat.deltaCount || 0),
      protocolObserved: true,
      sawDoneMarker: false,
      textChunkCount: pendingChat.deltaCount || 0,
      verifiedEmpty: !String(payload.text || pendingChat.fullText || "").trim()
    };
  }

  createChatError(payload = {}) {
    return createLocalRuntimeError(payload.error, `${this.providerLabel} chat failed.`);
  }

  handleChatDeltaPayload(payload = {}) {
    if (!this.pendingChat || payload.requestId !== this.pendingChat.requestId) {
      return true;
    }

    const delta = this.readChatDelta(payload, this.pendingChat);

    if (delta) {
      this.pendingChat.deltaCount += 1;
      this.pendingChat.onDelta(delta);
    }

    return true;
  }

  handleChatCompletePayload(payload = {}) {
    if (!this.pendingChat || payload.requestId !== this.pendingChat.requestId) {
      return true;
    }

    const pendingChat = this.pendingChat;
    const responseMeta = this.buildChatResponseMeta(payload, pendingChat);
    this.clearPendingChat();

    if (pendingChat.abortRequested || responseMeta.finishReason === "abort") {
      const abortError = createAbortError();
      abortError.responseMeta = responseMeta;
      pendingChat.deferred.reject(abortError);
      return true;
    }

    pendingChat.deferred.resolve(responseMeta);
    return true;
  }

  handleChatErrorPayload(payload = {}) {
    if (!this.pendingChat || payload.requestId !== this.pendingChat.requestId) {
      return true;
    }

    const pendingChat = this.pendingChat;
    this.clearPendingChat();

    if (pendingChat.abortRequested) {
      pendingChat.deferred.reject(createAbortError());
      return true;
    }

    pendingChat.deferred.reject(this.createChatError(payload));
    return true;
  }

  handleInterruptAckPayload(payload = {}) {
    if (!this.pendingChat || payload.requestId !== this.pendingChat.requestId) {
      return true;
    }

    return true;
  }

  handleCommonWorkerMessage(message = {}, payload = {}) {
    switch (message.type) {
      case this.protocol.WORKER_OUTBOUND.READY:
        this.handleReadyPayload(payload);
        return true;
      case this.protocol.WORKER_OUTBOUND.CHAT_DELTA:
        return this.handleChatDeltaPayload(payload);
      case this.protocol.WORKER_OUTBOUND.CHAT_COMPLETE:
        return this.handleChatCompletePayload(payload);
      case this.protocol.WORKER_OUTBOUND.CHAT_ERROR:
        return this.handleChatErrorPayload(payload);
      case this.protocol.WORKER_OUTBOUND.INTERRUPT_ACK:
        return this.handleInterruptAckPayload(payload);
      default:
        return false;
    }
  }

  handleProviderWorkerMessage() {}

  handleWorkerMessage(event) {
    const message = event.data || {};
    const payload = message.payload || {};

    if (this.handleCommonWorkerMessage(message, payload)) {
      return;
    }

    this.handleProviderWorkerMessage(message, payload);
  }

  handleWorkerFailure(error) {}

  handleWorkerError(event) {
    const error = createLocalRuntimeError(event?.error || event?.message, `${this.providerLabel} worker failed.`);
    console.error(`[admin-agent][${this.streamMode}] Worker error`, event);
    this.handleWorkerFailure(error);
    this.setState({
      error: error.message,
      isLoadingModel: false,
      isWorkerReady: false,
      statusText: error.message
    });
    this.teardownWorker(error);
  }

  handleWorkerMessageError(event) {
    const error = new Error(`${this.providerLabel} worker produced an invalid message.`);
    console.error(`[admin-agent][${this.streamMode}] Worker message error`, event);
    this.handleWorkerFailure(error);
    this.setState({
      error: error.message,
      isLoadingModel: false,
      isWorkerReady: false,
      statusText: error.message
    });
    this.teardownWorker(error);
  }

  buildRunChatPayload({ messages, modelSelection, requestId, requestOptions }) {
    return {
      messages: Array.isArray(messages) ? messages : [],
      modelSelection,
      requestId,
      requestOptions:
        requestOptions && typeof requestOptions === "object" && !Array.isArray(requestOptions)
          ? { ...requestOptions }
          : {}
    };
  }

  async ensureModelLoaded() {
    throw new Error(`${this.providerLabel} must implement ensureModelLoaded().`);
  }

  async streamCompletion(options = {}) {
    const onDelta = typeof options.onDelta === "function" ? options.onDelta : () => {};
    const signal = options.signal;

    await this.ensureModelLoaded(options.modelSelection, {
      signal
    });

    if (signal?.aborted) {
      throw createAbortError();
    }

    if (this.pendingChat) {
      throw new Error(`A ${this.providerLabel} response is already running.`);
    }

    const deferred = createDeferred();
    const requestId = crypto.randomUUID();
    const abortHandler = () => {
      if (!this.pendingChat || this.pendingChat.requestId !== requestId) {
        return;
      }

      this.pendingChat.abortRequested = true;
      this.postMessage(this.protocol.WORKER_INBOUND.INTERRUPT, {
        requestId
      });
    };

    this.pendingChat = {
      abortHandler,
      abortRequested: false,
      deferred,
      deltaCount: 0,
      fullText: "",
      onDelta,
      requestId,
      signal
    };

    signal?.addEventListener("abort", abortHandler, {
      once: true
    });

    this.postMessage(this.protocol.WORKER_INBOUND.RUN_CHAT, this.buildRunChatPayload({
      messages: Array.isArray(options.messages) ? options.messages : [],
      modelSelection: options.modelSelection,
      requestId,
      requestOptions: options.requestOptions
    }));

    return deferred.promise;
  }

  async resetChat() {}

  openConfiguration() {}
}
