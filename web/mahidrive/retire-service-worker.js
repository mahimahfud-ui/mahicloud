// Prompt the browser to replace the previous MahiCloud root worker with a one-time cleanup worker.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }, { once: true });
}
