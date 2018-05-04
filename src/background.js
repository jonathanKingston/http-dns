"use strict";

/* global browser */
const HAS_SEEN_VERSION = 1;
const STORAGE_AREA = "local";
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

  async getStateName() {
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

  async getIntialPrefValues() {
    const prefNames = await this.getPrefNames();
    const storePrefNames = prefNames.map(n => {
      return this.getUserPrefKey(n);
    });
    const initialStoredValues = await browser.storage[STORAGE_AREA].get(storePrefNames);
    const initialValues = {};
    prefNames.forEach(prefName => {
      initialValues[prefName] = initialStoredValues[this.getUserPrefKey(prefName)];
    });
    return initialValues;
  },

  /**
   * Ensure that the user hasn't modified any pref in the prerequisite list
   */
  async checkPrerequisites() {
    await this.init();
    const prerequisitePrefs = this.statesInfo.prerequisitePrefs;
    for (let pref of prerequisitePrefs) {
      const prefValue = await browser.experiments.settings.getPref(pref);
      if (null !== prefValue) {
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
      states: this.statesInfo.states
    });
  },
};

const rollout = {
  async init() {
    browser.runtime.onMessage.addListener((...args) => this.handleMessage(...args));
    await stateManager.setSetting();
    const stateName = await stateManager.getStateName();
    switch (stateName) {
      case null:
      case "loaded":
        if (await stateManager.checkPrerequisites()) {
          await stateManager.setState("loaded");
          await this.show();
        }
        break;
      case "enabled":
      case "disabled":
        break
    }
  },

  async handleMessage(message) {
    switch (message.method) {
      case "disable":
        await this.disable();
        break;
    }
  },

  async disable() {
    await stateManager.setState("disabled");
    const tabs = await browser.tabs.query({
      url: STUDY_URL
    });
    browser.tabs.remove(tabs.map((tab) => tab.id));
    browser.experiments.notifications.clear("rollout-prompt");
  },

  async show() {
    await stateManager.setState("enabled");
    browser.experiments.notifications.onButtonClicked.addListener((options) => {
      switch (Number(options.buttonIndex)) {
        case 1:
          console.log("ok");
          break;
        case 0:
          this.disable();
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
  }
};

rollout.init();

