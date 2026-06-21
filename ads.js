(function () {
  const config = window.FutokoroAds || {};
  const slots = document.querySelectorAll("[data-ad-slot-key]");
  const client = String(config.client || "").trim();
  const readiness = config.readiness || {};
  const canLoadAds = (
    config.enabled === true &&
    readiness.csp === true &&
    readiness.privacy === true &&
    /^ca-pub-\d+$/.test(client)
  );
  let hasActiveSlot = false;

  function isValidSlotId(value) {
    return /^\d+$/.test(String(value || "").trim());
  }

  function disableSlot(slot) {
    slot.hidden = true;
    slot.dataset.adStatus = "disabled";
    const creative = slot.querySelector(".ad-creative");
    if (creative) clearChildren(creative);
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function buildAdsenseSlot(slot, slotId) {
    const creative = slot.querySelector(".ad-creative");
    if (!creative) return;

    clearChildren(creative);

    const adElement = document.createElement("ins");
    adElement.className = "adsbygoogle";
    adElement.style.display = "block";
    adElement.dataset.adClient = client;
    adElement.dataset.adSlot = slotId;
    adElement.dataset.adFormat = "auto";
    adElement.dataset.fullWidthResponsive = "true";

    creative.appendChild(adElement);
    slot.hidden = false;
    slot.dataset.adStatus = "enabled";
    hasActiveSlot = true;
  }

  function loadAdsenseScript() {
    if (!hasActiveSlot || document.querySelector("script[data-futokoro-adsense]")) return;

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.futokoroAdsense = "true";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.addEventListener("load", function () {
      document.querySelectorAll(".adsbygoogle").forEach(function () {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      });
    });
    document.head.appendChild(script);
  }

  slots.forEach(function (slot) {
    const slotKey = slot.dataset.adSlotKey;
    const slotId = config.slots ? String(config.slots[slotKey] || "").trim() : "";

    if (!canLoadAds || !isValidSlotId(slotId)) {
      disableSlot(slot);
      return;
    }

    buildAdsenseSlot(slot, slotId);
  });

  loadAdsenseScript();
})();
