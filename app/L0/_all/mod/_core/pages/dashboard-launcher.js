import { listPages } from "/mod/_core/pages/page-index.js";

function logDashboardPagesError(context, error) {
  console.error(`[pages-dashboard] ${context}`, error);
}

function buildFallbackHref(routePath) {
  return `#/${String(routePath || "").replace(/^\/?#+\/?/u, "")}`;
}

globalThis.pagesDashboardLauncher = function pagesDashboardLauncher() {
  return {
    entries: [],
    loadErrorText: "",
    loading: false,

    async init() {
      await this.loadPages();
    },

    get hasEntries() {
      return this.entries.length > 0;
    },

    hrefFor(routePath) {
      return globalThis.space.router?.createHref?.(routePath) || buildFallbackHref(routePath);
    },

    async loadPages() {
      this.loading = true;
      this.loadErrorText = "";

      try {
        this.entries = await listPages();
      } catch (error) {
        logDashboardPagesError("loadPages failed", error);
        this.loadErrorText = String(error?.message || "Unable to load pages.");
      } finally {
        this.loading = false;
      }
    },

    async openPage(routePath) {
      if (!routePath) {
        return;
      }

      if (globalThis.space.router?.goTo) {
        await globalThis.space.router.goTo(routePath, {
          scrollMode: "top"
        });
        return;
      }

      globalThis.location.hash = buildFallbackHref(routePath);
    }
  };
};
