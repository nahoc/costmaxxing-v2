declare const chrome: {
  runtime: { onInstalled: { addListener(listener: (details: { reason: string }) => void): void } };
  tabs: { create(options: { url: string }): void };
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: "report.html" });
});
