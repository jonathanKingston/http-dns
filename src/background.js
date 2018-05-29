"use strict";

/* global browser */
const HAS_SEEN_VERSION = 1;
const STUDY_URL = browser.extension.getURL("study.html");
const SETTING_NAME = "trr";

const stateManager = {
  hasInit: false,

  async init() {
    if (!this.hasInit) {
      const statesFile = browser.runtime.getURL("states.json");
      const response = await fetch(statesFile);
      this.statesInfo = await response.json();
      this.hasInit = true;
    }
  },

  async getState() {
    await this.init();
    return await browser.experiments.settings.get(SETTING_NAME) || null;
  },

  async setState(stateKey) {
    await this.init();
    browser.experiments.settings.set(SETTING_NAME, stateKey);
  },

  getUserPrefKey(key) {
    return `userPref_${key}`;
  },

  async getPrefNames() {
    await this.init();
    return Object.keys(this.statesInfo.prefTypes);
  },

  /**
   * Ensure that the user hasn't modified any pref in the prerequisite list
   */
  async hasUnmodifiedPrerequisites() {
    await this.init();
    const prerequisitePrefs = this.statesInfo.prerequisitePrefs;
    for (let pref of prerequisitePrefs) {
      const prefValue = await browser.experiments.settings.getPref(pref);
      if (undefined !== prefValue) {
        return false;
      }
    }
    return true;
  },

  async setSetting() {
    return browser.experiments.settings.add({
      name: SETTING_NAME,
      prefNames: await this.getPrefNames(),
      statePref: this.statesInfo.statePref,
      states: this.statesInfo.states,
      prefTypes: this.statesInfo.prefTypes,
    });
  },
};

const rollout = {
  async init() {
    browser.runtime.onMessage.addListener((...args) => this.handleMessage(...args));
    await stateManager.setSetting();
    const stateName = await stateManager.getState();
    switch (stateName) {
      case null:
        if (await stateManager.hasUnmodifiedPrerequisites()) {
          await stateManager.setState("loaded");
        }
        // Fall-through
      case "loaded":
        await this.show();
        break;
      case "enabled":
      case "disabled":
      case "UIDisabled":
      case "UIOk":
      case "uninstalled":
        break
    }
  },

  async handleMessage(message) {
    switch (message.method) {
      case "UIDisable":
        await this.handleUIDisable();
        break;
      case "UIOK":
        await this.handleUIOK();
        break;
    }
  },

  async handleUIOK() {
    await stateManager.setState("UIOk");
    browser.experiments.notifications.clear("rollout-prompt");
  },

  async handleUIDisable() {
    await stateManager.setState("UIDisabled");
    const tabs = await browser.tabs.query({
      url: STUDY_URL
    });
    browser.tabs.remove(tabs.map((tab) => tab.id));
    browser.experiments.notifications.clear("rollout-prompt");
    browser.management.uninstallSelf();
  },

  async show() {
    // This doesn't handle the 'x' clicking on the notification mostly because it's not clear what the user intended here.
    browser.experiments.notifications.onButtonClicked.addListener((options) => {
      switch (Number(options.buttonIndex)) {
        case 1:
          this.handleUIOK();
          break;
        case 0:
          this.handleUIDisable();
          break;
      }
    });
    browser.experiments.notifications.create("rollout-prompt", {
      type: "prompt",
      title: "",
      message: browser.i18n.getMessage("notificationMessage"),
      buttons: [
        {title: browser.i18n.getMessage("disableButtonText")},
        {title: browser.i18n.getMessage("acceptButtonText")}
      ],
      moreInfo: {
        url: STUDY_URL,
        title: browser.i18n.getMessage("learnMoreLinkText")
      }
    });
    // Set enabled state last in-case the code above fails.
    await stateManager.setState("enabled");
  }
};

rollout.init();

