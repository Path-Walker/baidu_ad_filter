const DEFAULT_SETTINGS = {
  enabled: true,
  showBadge: true
};

const enabled = document.querySelector("#enabled");
const showBadge = document.querySelector("#showBadge");
const statusText = document.querySelector("#status");
const rescan = document.querySelector("#rescan");

chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  enabled.checked = settings.enabled;
  showBadge.checked = settings.showBadge;
  refreshStatus();
});

enabled.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabled.checked }, refreshStatus);
});

showBadge.addEventListener("change", () => {
  chrome.storage.sync.set({ showBadge: showBadge.checked });
});

rescan.addEventListener("click", () => {
  sendToCurrentTab({ type: "BAF_RESCAN" }, updateStatus);
});

function refreshStatus() {
  sendToCurrentTab({ type: "BAF_GET_STATUS" }, updateStatus);
}

function updateStatus(response) {
  if (!response) {
    statusText.textContent = "\u8bf7\u5728\u767e\u5ea6\u641c\u7d22\u7ed3\u679c\u9875\u4f7f\u7528";
    return;
  }

  statusText.textContent = response.enabled
    ? `\u5df2\u9690\u85cf ${response.hiddenCount} \u6761\u5e7f\u544a\u7ed3\u679c`
    : "\u8fc7\u6ee4\u5df2\u5173\u95ed";
}

function sendToCurrentTab(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      callback(null);
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, (response) => {
      callback(chrome.runtime.lastError ? null : response);
    });
  });
}
