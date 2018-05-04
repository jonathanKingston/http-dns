async function init() {
  const elements = [...document.querySelectorAll("[data-i18n-message]")];
  for (const element of elements) {
    // TODO speak with gandalf about new i18n lib to use fragments instead of this
    element.innerHTML = DOMPurify.sanitize(browser.i18n.getMessage(element.dataset.i18nMessage), {
      ALLOWED_TAGS: ["a"],
      ALLOWED_ATTR: ["href"],
    });
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
