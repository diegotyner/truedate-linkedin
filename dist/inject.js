"use strict";
(() => {
  // src/types.ts
  var MESSAGE_SOURCE = "truedate-inject";

  // src/inject.ts
  var VOYAGER_JOB_REGEX = /\/voyager\/api\/.*jobPostings/i;
  var injectCache = /* @__PURE__ */ new Map();
  console.log(
    "[TrueDate:inject] Interceptor script loaded and initialized in MAIN world."
  );
  function findOriginalListedAt(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 30) return null;
    if (typeof obj.originalListedAt === "number") {
      return {
        originalListedAt: obj.originalListedAt,
        expireAt: typeof obj.expireAt === "number" ? obj.expireAt : null
      };
    }
    for (const key of Object.keys(obj)) {
      const child = obj[key];
      if (child && typeof child === "object") {
        const found = findOriginalListedAt(child, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  function extractJobId(url, json) {
    const urlMatch = url.match(/fsd_jobPosting%3A(\d+)|jobPostingUrn.*%3A(\d+)/i);
    if (urlMatch) {
      return urlMatch[1] || urlMatch[2];
    }
    const pathMatch = url.match(/\/voyager\/api\/jobs\/jobPostings\/(\d+)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
    const findUrn = (obj, depth = 0) => {
      if (!obj || typeof obj !== "object" || depth > 15) return void 0;
      for (const key of ["entityUrn", "jobPostingUrn", "urn", "$id"]) {
        if (typeof obj[key] === "string") {
          const m = obj[key].match(/(?:fsd_jobPosting|jobPosting):(\d+)/i);
          if (m && m[1]) return m[1];
        }
      }
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (child && typeof child === "object") {
          const found = findUrn(child, depth + 1);
          if (found) return found;
        }
      }
      return void 0;
    };
    const structural = findUrn(json);
    if (structural) return structural;
    try {
      const text = JSON.stringify(json);
      const textMatch = text.match(/fsd_jobPosting:(\d+)/);
      if (textMatch && textMatch[1]) return textMatch[1];
    } catch {
    }
    return void 0;
  }
  function processJsonResponse(url, json) {
    if (!json || typeof json !== "object") return;
    const found = findOriginalListedAt(json);
    if (!found || typeof found.originalListedAt !== "number") {
      console.warn(
        "[TrueDate:inject] Voyager response missing originalListedAt:",
        url,
        json
      );
      return;
    }
    const jobId = extractJobId(url, json);
    const now = Date.now();
    const originalListedAt = found.originalListedAt;
    const expireAt = found.expireAt ?? null;
    const diffMs = Math.max(0, now - originalListedAt);
    const daysSinceOriginal = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
    const payload = {
      jobId,
      originalListedAt,
      expireAt,
      daysSinceOriginal
    };
    const message = {
      source: MESSAGE_SOURCE,
      payload
    };
    if (jobId) injectCache.set(jobId, message);
    console.log("[TrueDate:inject] Posting parsed job data to window:", payload);
    window.postMessage(message, window.location.origin);
  }
  var originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this || window, args);
    try {
      let url = "";
      const input = args[0];
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input instanceof Request) {
        url = input.url;
      } else if (input && typeof input === "object" && "url" in input) {
        url = String(input.url);
      }
      if (VOYAGER_JOB_REGEX.test(url)) {
        console.log(
          "[TrueDate:inject] Intercepted target Voyager fetch request:"
          // url,
        );
        const clonedResponse = response.clone();
        clonedResponse.json().then((json) => {
          processJsonResponse(url, json);
        }).catch((err) => {
          console.warn(
            "[TrueDate:inject] Failed to parse Voyager fetch JSON:",
            err
          );
        });
      }
    } catch (err) {
      console.warn("[TrueDate:inject] Error in fetch interceptor:", err);
    }
    return response;
  };
  var XhrProto = XMLHttpRequest.prototype;
  var originalXhrOpen = XhrProto.open;
  var originalXhrSend = XhrProto.send;
  XhrProto.open = function(method, url, ...rest) {
    const urlStr = typeof url === "string" ? url : url.href;
    this._truedate_url = urlStr;
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };
  XhrProto.send = function(...args) {
    this.addEventListener("load", function() {
      try {
        const url = this._truedate_url || "";
        if (VOYAGER_JOB_REGEX.test(url)) {
          console.log(
            "[TrueDate:inject] Intercepted target Voyager XHR request:"
            // url,
          );
          const handleText = (text) => {
            try {
              const json = JSON.parse(text);
              processJsonResponse(url, json);
            } catch (e) {
              console.warn("[TrueDate:inject] Failed to parse XHR JSON:", e);
            }
          };
          if (this.responseType === "" || this.responseType === "text") {
            if (this.responseText) handleText(this.responseText);
          } else if (this.responseType === "json" && this.response) {
            processJsonResponse(url, this.response);
          } else if (this.responseType === "blob" && this.response instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") {
                handleText(reader.result);
              }
            };
            reader.readAsText(this.response);
          }
        }
      } catch (err) {
        console.warn("[TrueDate:inject] Error in XHR interceptor:", err);
      }
    });
    return originalXhrSend.apply(this, args);
  };
  function scanEmbeddedHydrationState() {
    const elements = document.querySelectorAll(
      'code[id^="bpr-guid"], script[type="application/json"]'
    );
    elements.forEach((el) => {
      try {
        const content = el.textContent;
        if (content && content.includes("originalListedAt")) {
          const json = JSON.parse(content);
          processJsonResponse("embedded-hydration", json);
        }
      } catch (err) {
        console.warn("[TrueDate:inject] Hydration scan JSON.parse failed:", err);
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanEmbeddedHydrationState);
  } else {
    scanEmbeddedHydrationState();
  }
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source === "truedate-content-ready") {
      console.log(
        "[TrueDate:inject] Replaying cached payloads:",
        injectCache.size
      );
      injectCache.forEach(
        (msg) => window.postMessage(msg, window.location.origin)
      );
    }
  });
})();
//# sourceMappingURL=inject.js.map
