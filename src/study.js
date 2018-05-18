async function init() {
  const elements = document.querySelectorAll("[data-i18n-message]");
  for (const element of elements) {
    element.innerHTML = DOMPurify.sanitize(browser.i18n.getMessage(element.dataset.i18nMessage), {
      ALLOWED_TAGS: ["a"],
      ALLOWED_ATTR: ["href"],
    });
  }

  const brandStrings = await browser.experiments.settings.getStrings(["brandShortName", "brandFullName"]);

  function createNodes(el, tagConfig) {
    for (const childEl of tagConfig.childNodes) {
      if (childEl.nodeName === "#text") {
        // Ignore whitespace nodes
        if (!/[^\W]/.test(childEl.textContent)) {
          continue;
        }
        const textOutput = childEl.textContent;
        el.appendChild(textOutput);
      } else {
        el.appendChild(createElement(childEl));
      }
    }
    return el;
  }

  function createElement(tagConfig) {
    const el = tagConfig.cloneNode(false);
    let placeholders = [];
    if (tagConfig.dataset.i18nBrand) {
      el.textContent = brandStrings[tagConfig.dataset.i18nBrand];
    } else if (tagConfig.dataset.i18nMessage) {
      const placeholders = [...createNodes(document.createDocumentFragment(), tagConfig).childNodes].map(e => `${e.outerHTML || e.textContent}`);
      // Escape to only allow link placeholders, everything is turned to text
      el.innerHTML = DOMPurify.sanitize(browser.i18n.getMessage(tagConfig.dataset.i18nMessage, placeholders), {
        ALLOWED_TAGS: ["a"],
        ALLOWED_ATTR: ["href"],
      });
    } else {
      createNodes(el, tagConfig);
    }
    return el;
  }

  const templates = document.querySelectorAll("template");
  for (const template of templates) {
    const output = document.createDocumentFragment();
    createNodes(output, template.content);
    template.parentNode.insertBefore(output, template)
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
