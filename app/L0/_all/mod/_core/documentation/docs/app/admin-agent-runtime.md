# Admin Agent Runtime

This doc covers the firmware-backed admin agent surface under `_core/admin/views/agent/`.

Primary sources:

- `app/L0/_all/mod/_core/admin/AGENTS.md`
- `app/L0/_all/mod/_core/admin/views/agent/AGENTS.md`
- `app/L0/_all/mod/_core/admin/views/agent/store.js`
- `app/L0/_all/mod/_core/admin/views/agent/api.js`
- `app/L0/_all/mod/_core/admin/views/agent/local-runtime.js`
- `app/L0/_all/mod/_core/admin/views/agent/huggingface.js`
- `app/L0/_all/mod/_core/admin/views/agent/webllm.js`
- `app/L0/_all/mod/_core/admin/views/agent/panel.html`

## Scope

The admin agent is a standalone admin-only chat surface mounted inside `/admin`.

It owns:

- its own settings and history persistence under `~/conf/admin-chat.yaml` and `~/hist/admin-chat.json`
- its own prompt assembly, history compaction, execution loop, and attachment runtime
- its own LLM transport switch between remote API streaming and a browser-local provider layer that can route through HuggingFace ONNX or WebLLM

It does not depend on `_core/onscreen_agent` internals.

## Provider Model

The admin settings modal now starts with a provider switch:

- `LLM APIs`: the existing endpoint, model, API key, params, and max-token settings
- `Local`: a browser-local path that uses WebGPU and then branches into:
- `HuggingFace ONNX`
- `WebLLM`

The stored config keeps both API settings and the selected local provider state:

- `llm_provider`
- `local_provider`
- `huggingface_model`
- `huggingface_dtype`
- `webllm_model`
- the existing API fields and optional custom system prompt

Switching providers does not fork the rest of the admin agent loop. The admin surface still keeps one shared flow for:

- runtime prompt building
- history compaction
- retry-on-empty handling after execution follow-ups
- browser execution blocks
- streaming into the thread view

Only the final LLM transport call branches.

## Local Runtime Layer

The admin agent does not import browser-local inference runtimes on the main thread.

Instead, `views/agent/local-runtime.js` defines a small superclass that owns:

- worker boot and teardown
- unified `streamCompletion({ messages, modelSelection, requestOptions, onDelta, signal })`
- abort or interrupt wiring
- unified completion metadata shape back into the shared admin loop

Two subclasses plug into that:

- `views/agent/webllm.js`: admin-local WebLLM runtime backed by the admin-owned `webllm-worker.js`
- `views/agent/huggingface.js`: admin-facing Hugging Face state-shaping helper around `_core/huggingface/manager.js`

The modal itself reuses the owning modules' standalone config sidebars:

- `/mod/_core/webllm/config-sidebar.html`
- `/mod/_core/huggingface/config-sidebar.html`

Those same component files are also mounted by the routed testing harnesses, so the sidebar contract stays in one place per provider.

## Local Provider Behavior

WebLLM:

- shows the full prebuilt model catalog from the admin-local WebLLM runtime, with cached entries labeled in place
- can download or load or unload the selected model directly from the modal, with progress shown in the shared current-model block
- keeps a separate selected-model line in the modal so a saved or configured choice is visible even before the current-model block changes away from `None loaded`
- may still preload the configured model when it is already cached, but saving the config no longer requires the model to be pre-downloaded first
- links out to `/#/webllm` for fuller testing-chat work, not as the only download path

HuggingFace ONNX:

- accepts a direct Hugging Face repo id plus dtype in the admin modal and can load that selection through the shared manager without forcing the user through the routed test page first
- also shows shortcut entries from the shared browser-side saved-model list exposed by `_core/huggingface/manager.js`
- reads the same live load state, current model, and progress data as the routed `/#/huggingface` surface instead of booting a second in-page Hugging Face worker
- admin load or unload or send actions should call `_core/huggingface/manager.js` directly, so the model-selector actions and admin chat transport use the exact same shared manager path as the routed testing page
- local admin sends use a compact execution prompt profile instead of the full firmware prompt plus admin-skills catalog, which keeps the shared browser-local LLM path closer to the lightweight routed testing chat and avoids inflating the prompt budget unnecessarily
- opening the admin settings dialog should not auto-boot both local runtimes or auto-load the saved Hugging Face model; admin warms only the selected local provider and keeps the actual model load lazy until explicit load or first send
- keeps a separate selected-model line in the modal so the configured repo and dtype remain visible even while no model is currently loaded
- mirrors the routed page's phase labels, so file transfer reads as `Downloading` and post-download runtime preparation reads as `Loading` instead of presenting a misleading all-purpose loading state
- treats `Starting` as an explicit shared-manager boot-in-progress state; when the manager is idle and no local load is active, the admin modal should show `Idle` rather than inferring startup from a generic non-ready snapshot
- that saved-model list is populated when a model is loaded successfully through the shared manager, including loads started from `/#/huggingface`
- discarding a cached Hugging Face repo in `/#/huggingface` also removes the corresponding shared saved-model entries, so the admin selector stops offering that repo until it is loaded again
- saving the config no longer requires the model to already exist in that saved-model list; admin now kicks off background load for the configured local model on save and on page init when local mode is already active, while the first admin send still acts as the fallback load trigger if preparation has not finished yet
- links out to `/#/huggingface` for fuller testing-chat work, not as the only load path

This means the admin agent reuses the same browser-local assets, worker state, and component contracts as the dedicated testing route, while still keeping admin prompt assembly, history, and provider-selection persistence local to `_core/admin/views/agent/`.

## Practical Behavior

- if `llm_provider` is `api`, admin chat uses the existing fetch-based streaming path
- if `llm_provider` is `local`, admin chat resolves the selected local provider, shows `Loading local LLM...` until the configured model is ready, and then streams through the unified local-runtime interface
- before admin loads or sends through one local provider, it releases the inactive local runtime so WebLLM and Hugging Face do not keep competing for the same browser-side GPU budget
- stop requests still use the same admin stop flow; for WebLLM that abort signal is translated into worker-side `interruptGenerate()` or load-stop behavior
- stop requests use the same admin stop flow for Hugging Face too; the local runtime subclasses translate that abort into the appropriate worker-side stop or teardown behavior
- history compaction uses the selected provider too, so local mode stays fully local once configured
