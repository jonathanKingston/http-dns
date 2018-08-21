"use strict";

/* global browser */
const STUDY_URL = browser.extension.getURL("study.html");
const SETTING_NAME = "trr";

const stateManager = {
  async getState() {
    return await browser.experiments.settings.get(SETTING_NAME) || null;
  },

  async setState(stateKey) {
    browser.study.sendTelemetry({settingName: SETTING_NAME, stateKey});
    browser.experiments.settings.set(SETTING_NAME, stateKey);
  },

  async setSetting() {
    return browser.experiments.settings.add(SETTING_NAME);
  },
};

const rollout = {
  async init() {
    const baseStudySetup = {
      activeExperimentName: browser.runtime.id,
      studyType: "shield",
      // telemetry
      telemetry: {
        // default false. Actually send pings.
        send: true,
        // Marks pings with testing=true.  Set flag to `true` before final release
        removeTestingFlag: false,
      },
      // endings with urls
      endings: {
        /** standard endings */
        "user-disable": {
          baseUrls: [
            "https://qsurvey.mozilla.com/s3/Shield-Study-Example-Survey/?reason=user-disable",
          ],
        },
        ineligible: {
          baseUrls: [],
        },
        expired: {
          baseUrls: [
            "https://qsurvey.mozilla.com/s3/Shield-Study-Example-Survey/?reason=expired",
          ],
        },
      },
      // TODO should we implement this 
      weightedVariations: [
        {
          name: "trr-active",
          weight: 1
        },
        {
          name: "trr-off",
          weight: 1
        },
        {
          name: "trr-study",
          weight: 1
        },
      ],
      // maximum time that the study should run, from the first run
      expire: {
        days: 14,
      },
    };
    await browser.study.setup(baseStudySetup);
    browser.runtime.onMessage.addListener((...args) => this.handleMessage(...args));
    //const studyInfo = await browser.study.getStudyInfo();
    //console.log({studyInfo, stack: new Error().stack});
    await stateManager.setSetting();
    const stateName = await stateManager.getState();
    switch (stateName) {
    case null:
      if (await browser.experiments.settings.hasUnmodifiedPrerequisites(SETTING_NAME)) {
        await stateManager.setState("loaded");
        await this.show();
      } else {
        // If the user hasn't met the criteria clean up
        browser.experiments.settings.clear(null);
      }
      break;
      // If the user has a thrown error show the banner again (shouldn't happen)
    case "loaded":
      await this.show();
      break;
    case "enabled":
    case "disabled":
    case "UIDisabled":
    case "UIOk":
    case "uninstalled":
      break;
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
    const tabs = await browser.tabs.query({
      url: STUDY_URL
    });
    browser.tabs.remove(tabs.map((tab) => tab.id));
    browser.experiments.notifications.clear("rollout-prompt");
    browser.experiments.settings.clear("UIDisabled");
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

