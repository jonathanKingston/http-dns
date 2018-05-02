function init() {
  const elements = [...document.querySelectorAll("[data-i18n-message]")];
  for (const element of elements) {
    element.textContent = browser.i18n.getMessage(element.dataset.i18nMessage);
  }

  const disable = document.getElementById("disable");
  async function disableAddon() {
    await browser.runtime.sendMessage({
      method: "disable"
    });
  }
  disable.addEventListener("submit", () => {
    disableAddon();
  });
}
init();
