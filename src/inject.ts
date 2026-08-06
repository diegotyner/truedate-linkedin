import { MESSAGE_SOURCE } from "./types.js";
import type {
  VoyagerJobPostingResponse,
  ParsedJobData,
  TrueDateMessage,
} from "./types.js";

const VOYAGER_JOB_REGEX = /\/voyager\/api\/.*jobPostings/i;
const injectCache = new Map<string, TrueDateMessage>();

console.log(
  "[TrueDate:inject] Interceptor script loaded and initialized in MAIN world.",
);

function findOriginalListedAt(
  obj: any,
  depth = 0,
): { originalListedAt?: number; expireAt?: number | null } | null {
  if (!obj || typeof obj !== "object" || depth > 30) return null;

  if (typeof obj.originalListedAt === "number") {
    return {
      originalListedAt: obj.originalListedAt,
      expireAt: typeof obj.expireAt === "number" ? obj.expireAt : null,
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

function extractJobId(url: string, json: any): string | undefined {
  const urlMatch = url.match(/fsd_jobPosting%3A(\d+)|jobPostingUrn.*%3A(\d+)/i);
  if (urlMatch) {
    return urlMatch[1] || urlMatch[2];
  }

  const pathMatch = url.match(/\/voyager\/api\/jobs\/jobPostings\/(\d+)/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  const findUrn = (obj: any, depth = 0): string | undefined => {
    if (!obj || typeof obj !== "object" || depth > 15) return undefined;

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
    return undefined;
  };

  const structural = findUrn(json);
  if (structural) return structural;

  // Fallback: scan raw JSON text for the URN pattern directly. Handles cases like
  // GraphQL-normalized hydration payloads where the URN sits under a key name
  // (e.g. "*jobsDashJobPostingsById") that structural key-matching won't catch.
  try {
    const text = JSON.stringify(json);
    const textMatch = text.match(/fsd_jobPosting:(\d+)/);
    if (textMatch && textMatch[1]) return textMatch[1];
  } catch {
    // Ignore stringify failures
  }

  return undefined;
}

function processJsonResponse(url: string, json: unknown): void {
  if (!json || typeof json !== "object") return;

  const found = findOriginalListedAt(json);

  if (!found || typeof found.originalListedAt !== "number") {
    console.warn(
      "[TrueDate:inject] Voyager response missing originalListedAt:",
      url,
      json,
    );
    return;
  }

  const jobId = extractJobId(url, json);
  const now = Date.now();
  const originalListedAt = found.originalListedAt;
  const expireAt = found.expireAt ?? null;
  const diffMs = Math.max(0, now - originalListedAt);
  const daysSinceOriginal = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const payload: ParsedJobData = {
    jobId,
    originalListedAt,
    expireAt,
    daysSinceOriginal,
  };

  const message: TrueDateMessage = {
    source: MESSAGE_SOURCE,
    payload,
  };

  if (jobId) injectCache.set(jobId, message);

  console.log("[TrueDate:inject] Posting parsed job data to window:", payload);
  window.postMessage(message, window.location.origin);
}

// 1. Intercept window.fetch
const originalFetch = window.fetch;
window.fetch = async function (
  ...args: Parameters<typeof fetch>
): Promise<Response> {
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
      url = String((input as { url: unknown }).url);
    }

    if (VOYAGER_JOB_REGEX.test(url)) {
      console.log(
        "[TrueDate:inject] Intercepted target Voyager fetch request:",
        // url,
      );

      const clonedResponse = response.clone();
      clonedResponse
        .json()
        .then((json: unknown) => {
          processJsonResponse(url, json);
        })
        .catch((err) => {
          console.warn(
            "[TrueDate:inject] Failed to parse Voyager fetch JSON:",
            err,
          );
        });
    }
  } catch (err) {
    console.warn("[TrueDate:inject] Error in fetch interceptor:", err);
  }

  return response;
};

// 2. Intercept XMLHttpRequest
const XhrProto = XMLHttpRequest.prototype;
const originalXhrOpen = XhrProto.open;
const originalXhrSend = XhrProto.send;

(XhrProto as any).open = function (
  method: string,
  url: string | URL,
  ...rest: any[]
) {
  const urlStr = typeof url === "string" ? url : url.href;
  (this as any)._truedate_url = urlStr;
  return originalXhrOpen.apply(this, [method, url, ...rest] as any);
};

(XhrProto as any).send = function (...args: any[]) {
  this.addEventListener("load", function (this: XMLHttpRequest) {
    try {
      const url = (this as any)._truedate_url || "";
      if (VOYAGER_JOB_REGEX.test(url)) {
        console.log(
          "[TrueDate:inject] Intercepted target Voyager XHR request:",
          // url,
        );

        const handleText = (text: string) => {
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
        } else if (
          this.responseType === "blob" &&
          this.response instanceof Blob
        ) {
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
  return originalXhrSend.apply(this, args as any);
};

// One-time capture of the initial job's data from LinkedIn's embedded hydration state.
// The first job on a fresh page load is often server-rendered rather than fetched
// client-side, so it never passes through the fetch/XHR interceptors above.
function scanEmbeddedHydrationState(): void {
  const elements = document.querySelectorAll(
    'code[id^="bpr-guid"], script[type="application/json"]',
  );
  // console.log(
  //   "[TrueDate:inject] Hydration scan found elements:",
  //   elements.length,
  // );
  elements.forEach((el) => {
    try {
      const content = el.textContent;
      if (content && content.includes("originalListedAt")) {
        // console.log(
        //   "[TrueDate:inject] Found candidate hydration element, id:",
        //   el.id,
        // );
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

window.addEventListener("message", (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.source === "truedate-content-ready") {
    console.log(
      "[TrueDate:inject] Replaying cached payloads:",
      injectCache.size,
    );
    injectCache.forEach((msg) =>
      window.postMessage(msg, window.location.origin),
    );
  }
});
