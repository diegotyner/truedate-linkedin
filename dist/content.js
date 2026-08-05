"use strict";
(() => {
  // src/types.ts
  var MESSAGE_SOURCE = "truedate-inject";

  // src/content.ts
  var SHADOW_HOST_ID = "truedate-banner-root";
  var jobCache = /* @__PURE__ */ new Map();
  var lastActiveJobId = null;
  console.log(
    "[TrueDate:content] Content script loaded and initialized in ISOLATED world."
  );
  function getCssUrl() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        const url = chrome.runtime.getURL("globals.css");
        if (url && !url.includes("invalid")) {
          return url;
        }
      }
    } catch {
    }
    return null;
  }
  function getOrCreateShadowRoot() {
    let host = document.getElementById(SHADOW_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = SHADOW_HOST_ID;
      document.body.appendChild(host);
      console.log("[TrueDate:content] Created shadow DOM host element.");
    }
    if (!host.shadowRoot) {
      const shadow = host.attachShadow({ mode: "open" });
      const cssUrl = getCssUrl();
      if (cssUrl) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssUrl;
        shadow.appendChild(link);
      }
      const fallbackStyle = document.createElement("style");
      fallbackStyle.textContent = `
      .truedate-card {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 999999;
        background-color: #0f172a;
        color: #ffffff;
        border-radius: 0.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        border: 1px solid #334155;
        padding: 0.75rem;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-size: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-width: 18rem;
      }
      .truedate-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .truedate-title {
        font-weight: 600;
        color: #60a5fa;
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }
      .truedate-date {
        color: #d1d5db;
        margin-top: 0.25rem;
        padding-top: 0.25rem;
        border-top: 1px solid #1e293b;
        font-size: 12px;
        display: flex;
        align-items: center;
      }
      .truedate-desc {
        color: #cbd5e1;
        font-size: 11px;
        line-height: 1.375;
      }
      .truedate-expire {
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 10px;
        color: #94a3b8;
      }
    `;
      shadow.appendChild(fallbackStyle);
      const container = document.createElement("div");
      container.id = "truedate-container";
      shadow.appendChild(container);
      return shadow;
    }
    return host.shadowRoot;
  }
  function renderBanner(data) {
    console.log("[TrueDate:content] Rendering banner with payload:", data);
    const shadowRoot = getOrCreateShadowRoot();
    const container = shadowRoot.querySelector("#truedate-container");
    if (!container) return;
    const formattedDate = new Date(data.originalListedAt).toLocaleDateString(
      void 0,
      {
        year: "numeric",
        month: "short",
        day: "numeric"
      }
    );
    const ageText = data.daysSinceOriginal === 0 ? "This is the original posting" : `Originally posted ${data.daysSinceOriginal} day${data.daysSinceOriginal === 1 ? "" : "s"} before this listing`;
    container.innerHTML = `
    <div class="truedate-card fixed top-4 right-4 z-[999999] bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 p-3 font-sans text-xs flex flex-col gap-1 max-w-xs transition-all">
      <div class="truedate-header flex items-center justify-between gap-2">
        <span class="truedate-title font-semibold text-blue-400 text-sm flex items-center gap-1.5">
          <svg class="w-4 h-4 text-blue-400 fill-current" viewBox="0 0 20 20">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z"/>
          </svg>
          TrueDate
        </span>
        ${data.expireAt ? `<span class="truedate-expire pl-3 text-slate-400 font-mono text-[10px]">
            Expires: ${new Date(data.expireAt).toLocaleDateString()}</span>` : ""}
      </div>
      <p class="truedate-desc text-slate-300 text-[11px] leading-snug">${ageText}</p>
      <div class="truedate-date mt-1 pt-1 border-t border-slate-800 text-[12px] flex items-center gap-2.5">
        <span>True Post:</span>
        <span>${formattedDate}</span>
      </div>
    </div>
  `;
  }
  function getCurrentJobIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      const currentJobId = url.searchParams.get("currentJobId");
      if (currentJobId) return currentJobId;
      const match = url.pathname.match(/\/jobs\/view\/(\d+)/);
      if (match && match[1]) return match[1];
    } catch {
    }
    return null;
  }
  function updateBannerFromCache() {
    const currentJobId = getCurrentJobIdFromUrl();
    if (!currentJobId) return;
    if (currentJobId !== lastActiveJobId) {
      lastActiveJobId = currentJobId;
      const cachedData = jobCache.get(currentJobId);
      if (cachedData) {
        console.log(
          `[TrueDate:content] Found cached data for jobId ${currentJobId}:`,
          cachedData
        );
        renderBanner(cachedData);
      }
    }
  }
  setInterval(updateBannerFromCache, 300);
  window.addEventListener("popstate", updateBannerFromCache);
  window.addEventListener("hashchange", updateBannerFromCache);
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== MESSAGE_SOURCE)
      return;
    console.log("[TrueDate:content] Received TrueDateMessage event:", data);
    const payload = data.payload;
    const currentUrlJobId = getCurrentJobIdFromUrl();
    const effectiveJobId = payload.jobId || currentUrlJobId;
    if (effectiveJobId) {
      jobCache.set(effectiveJobId, payload);
    }
    if (!currentUrlJobId || currentUrlJobId === effectiveJobId) {
      renderBanner(payload);
    } else {
      updateBannerFromCache();
    }
  });
})();
//# sourceMappingURL=content.js.map
