const DEFAULT_SETTINGS = {
  enabled: true,
  showBadge: true
};

const AD_LABELS = new Set([
  "\u5e7f\u544a",
  "\u63a8\u5e7f",
  "\u5546\u4e1a\u63a8\u5e7f",
  "\u767e\u5ea6\u63a8\u5e7f",
  "\u8d5e\u52a9",
  "Ad",
  "Ads",
  "Sponsored"
]);

const RESULT_SELECTORS = [
  "#content_left > div",
  "#results > div",
  ".result",
  ".c-container",
  "[class*='result']",
  "[tpl]"
];

let settings = { ...DEFAULT_SETTINGS };
let scanTimer = 0;
let hiddenCount = 0;
let badgeTimer = 0;
let observer;

init();

function init() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (storedSettings) => {
    settings = storedSettings;
    scanSoon();
    watchPageChanges();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") {
      return;
    }

    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
    }

    if (changes.showBadge) {
      settings.showBadge = changes.showBadge.newValue;
    }

    if (settings.enabled) {
      scanSoon();
    } else {
      showAllHiddenResults();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BAF_GET_STATUS") {
      sendResponse({
        enabled: settings.enabled,
        hiddenCount
      });
      return true;
    }

    if (message?.type === "BAF_RESCAN") {
      filterAdResults();
      sendResponse({
        enabled: settings.enabled,
        hiddenCount
      });
      return true;
    }

    return false;
  });
}

function watchPageChanges() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(() => {
    if (settings.enabled) {
      scanSoon();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function scanSoon() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(filterAdResults, 150);
}

function filterAdResults() {
  if (!settings.enabled) {
    return;
  }

  const candidates = findResultCandidates();
  let newlyHidden = 0;

  for (const result of candidates) {
    if (hasAdLabel(result)) {
      if (result.dataset.bafHidden !== "1") {
        newlyHidden += 1;
      }

      result.classList.add("baf-hidden-result");
      result.dataset.bafHidden = "1";
    }
  }

  hiddenCount = document.querySelectorAll("[data-baf-hidden='1']").length;

  if (newlyHidden > 0) {
    showBadge(`\u5df2\u8fc7\u6ee4 ${hiddenCount} \u6761\u5e7f\u544a\u7ed3\u679c`);
  }
}

function findResultCandidates() {
  const nodes = new Set();

  for (const selector of RESULT_SELECTORS) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement && isLikelySearchResult(node)) {
        nodes.add(normalizeResultContainer(node));
      }
    });
  }

  return [...nodes].filter((node) => node instanceof HTMLElement);
}

function normalizeResultContainer(node) {
  const container = node.closest(".c-container, .result, [tpl], #content_left > div");
  return container || node;
}

function isLikelySearchResult(node) {
  if (node.closest("header, nav, footer, script, style")) {
    return false;
  }

  const text = getVisibleText(node);
  if (text.length < 2) {
    return false;
  }

  return Boolean(
    node.querySelector("a[href]") ||
      node.matches(".result, .c-container, [tpl]") ||
      node.closest("#content_left, #results")
  );
}

function hasAdLabel(result) {
  const labelElement = [...result.querySelectorAll("*")].find(isAdLabelElement);

  if (labelElement) {
    return true;
  }

  const suspiciousClass = /(^|[-_\s])(ad|ads|ec-tuiguang|tuiguang|sponsored)([-_\s]|$)/i;
  return [...result.querySelectorAll("[class], [id], [aria-label], [title]")].some((node) => {
    const value = [
      node.className,
      node.id,
      node.getAttribute("aria-label"),
      node.getAttribute("title")
    ]
      .join(" ")
      .trim();

    return suspiciousClass.test(value) && containsShortAdText(node);
  });
}

function isAdLabelElement(node) {
  if (!(node instanceof HTMLElement) || !isVisible(node)) {
    return false;
  }

  const text = getVisibleText(node).replace(/\s+/g, "");
  if (!text || text.length > 16) {
    return false;
  }

  if (AD_LABELS.has(text)) {
    return true;
  }

  return /^(\u5e7f\u544a|\u63a8\u5e7f|\u5546\u4e1a\u63a8\u5e7f|\u767e\u5ea6\u63a8\u5e7f|\u8d5e\u52a9|Ad|Ads|Sponsored)([\u00b7:\uff1a\uff5c|])?$/i.test(text);
}

function containsShortAdText(node) {
  const text = getVisibleText(node).replace(/\s+/g, "");
  return text.length <= 24 && /(\u5e7f\u544a|\u63a8\u5e7f|\u5546\u4e1a\u63a8\u5e7f|\u767e\u5ea6\u63a8\u5e7f|\u8d5e\u52a9|Sponsored|Ads?)/i.test(text);
}

function getVisibleText(node) {
  return [...node.childNodes]
    .map((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return child.textContent || "";
      }

      if (child.nodeType === Node.ELEMENT_NODE && isVisible(child)) {
        return child.textContent || "";
      }

      return "";
    })
    .join(" ")
    .trim();
}

function isVisible(node) {
  if (!(node instanceof Element)) {
    return true;
  }

  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function showAllHiddenResults() {
  document.querySelectorAll("[data-baf-hidden='1']").forEach((node) => {
    node.classList.remove("baf-hidden-result");
    delete node.dataset.bafHidden;
  });

  hiddenCount = 0;
  showBadge("\u5df2\u6062\u590d\u5e7f\u544a\u7ed3\u679c");
}

function showBadge(text) {
  if (!settings.showBadge) {
    return;
  }

  let badge = document.querySelector(".baf-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "baf-badge";
    document.body.appendChild(badge);
  }

  badge.textContent = text;
  badge.classList.add("baf-visible");
  window.clearTimeout(badgeTimer);
  badgeTimer = window.setTimeout(() => {
    badge.classList.remove("baf-visible");
  }, 1800);
}
