"use strict";
(() => {
  // src/types.ts
  var MESSAGE_SOURCE = "truedate-inject";

  // src/inject.ts
  var VOYAGER_JOB_REGEX = /\/voyager\/api\/.*jobPostings/i;
  console.log("[TrueDate:inject] Interceptor script loaded and initialized in MAIN world.");
  function findOriginalListedAt(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 10) return null;
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
      if (!obj || typeof obj !== "object" || depth > 10) return void 0;
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
    return findUrn(json);
  }
  function processJsonResponse(url, json) {
    if (!json || typeof json !== "object") return;
    const found = findOriginalListedAt(json);
    if (!found || typeof found.originalListedAt !== "number") {
      console.warn("[TrueDate:inject] Voyager response missing originalListedAt:", url, json);
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
        console.log("[TrueDate:inject] Intercepted target Voyager fetch request:", url);
        const clonedResponse = response.clone();
        clonedResponse.json().then((json) => {
          processJsonResponse(url, json);
        }).catch((err) => {
          console.warn("[TrueDate:inject] Failed to parse Voyager fetch JSON:", err);
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
          console.log("[TrueDate:inject] Intercepted target Voyager XHR request:", url);
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
})();
//# sourceMappingURL=inject.js.map
