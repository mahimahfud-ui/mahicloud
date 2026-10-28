(() => {
  "use strict";
  if (document.getElementById("mahi-ai-launcher") || location.pathname.startsWith("/mahi-ai") || location.pathname.startsWith("/admin")) return;
  const style = document.createElement("style");
  style.textContent = "#mahi-ai-launcher{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:calc(18px + env(safe-area-inset-bottom));z-index:9996;display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 20px 0 12px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:linear-gradient(145deg,rgba(168,150,255,.98),rgba(94,105,230,.98));color:#fff;font:700 14px/1 Inter,system-ui,sans-serif;letter-spacing:.01em;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 12px 30px rgba(92,91,220,.32),0 3px 9px #0006;cursor:pointer;transition:transform .2s,box-shadow .2s}#mahi-ai-launcher .mahi-ai-launcher-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#ffffff26;font-size:19px}#mahi-ai-launcher:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 16px 36px rgba(92,91,220,.38),0 4px 12px #0007}#mahi-ai-launcher:active{transform:scale(.97)}#mahi-ai-launcher:focus-visible{outline:2px solid #fff;outline-offset:4px}@media(max-width:700px){#mahi-ai-launcher{right:14px;bottom:calc(92px + env(safe-area-inset-bottom));min-height:50px;padding:0 16px 0 10px}}@media(prefers-reduced-motion:reduce){#mahi-ai-launcher{transition:none}}";
  document.head.appendChild(style);
  const button = document.createElement("button");
  button.id = "mahi-ai-launcher";
  button.type = "button";
  button.setAttribute("aria-label", "Open Mahi-AI assistant");
  button.title = "Open Mahi-AI";
  button.innerHTML = '<span class="mahi-ai-launcher-mark" aria-hidden="true">✦</span><span>Mahi-AI</span>';
  button.addEventListener("click", () => { location.href = "/mahi-ai/"; });
  document.body.appendChild(button);
})();
