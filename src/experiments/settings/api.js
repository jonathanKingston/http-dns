"use strict";


/* global Components, ExtensionAPI */
let Cu2 = Components.utils;
Cu2.import("resource://gre/modules/Services.jsm");
Cu2.import("resource://gre/modules/ExtensionSettingsStore.jsm");
Cu2.import("resource://gre/modules/AddonManager.jsm");

// TODO file scope issue on experiments that join extension contexts causing redeclaration issues.

const prefManager = {
  setPrefs(prefs) {
    prefs.forEach((pref) => {
      this.setPref(pref.name, pref.value, pref.type);
    });
  },
  setPref(name, value, type) {
    if (value === null) {
      Services.prefs.clearUserPref(name);
    }
    /* As prefs are hidden we can't use Services.prefs.getPrefType */
    switch (type) {
      case "string":
        return Services.prefs.setCharPref(name, value);
      case "int":
        return Services.prefs.setIntPref(name, value);
      case "bool":
        return Services.prefs.setBoolPref(name, value);
      default:
        throw new Error("Unknown type");
    }
  },

  getUserPref(name, value) {
    if (!Services.prefs.prefHasUserValue(name)) {
      return value;
    }
    let type = Services.prefs.getPrefType(name);
    switch (type) {
      case Services.prefs.PREF_STRING:
        return Services.prefs.getCharPref(name, value);
      case Services.prefs.PREF_INT:
        return Services.prefs.getIntPref(name, value);
      case Services.prefs.PREF_BOOL:
        return Services.prefs.getBoolPref(name, value);
      default:
        throw new Error("Unknown type");
    }
  }
}
const SETTING_TYPE = "setting_config";
const SETTING_PREFIX = "settingRolloutConfig_";
const settingManager = {
  async init() {
    await ExtensionSettingsStore.initialize();
  },
  async add(id, settingConfig) {
    await this.init();
    await ExtensionSettingsStore.addSetting(id, SETTING_TYPE, `${SETTING_PREFIX}${settingConfig.name}`, settingConfig);
  },
  async getSetting(settingName) {
    await this.init();
    return await ExtensionSettingsStore.getSetting(SETTING_TYPE, `${SETTING_PREFIX}${settingName}`);
  },
  async getSettingConfig(settingName) {
    const setting = await this.getSetting(settingName);
    return setting.value;
  },
  async get(settingName) {
    const settingConfig = await this.getSettingConfig(settingName);
    const statePref = await prefManager.getUserPref(settingConfig.statePref);
    let currentState = null;
    Object.keys(settingConfig.states).forEach((stateKey) => {
      const state = settingConfig.states[stateKey];
      if (state.id === statePref) {
        currentState = stateKey;
      }
    });
    return currentState;
  },
  async set(id, settingName, value, includePrefs = true) {
    const config = await this.getSettingConfig(settingName);
    let match = {};
    let state;
    // If we match a state set the state pref and prefs
    // The state pref can't be cleared
    if (value in config.states) {
      state = config.states[value];
      // If we aren't clearing the prefs we want these too
      if (includePrefs) {
        match = state.prefs;
      }
      match = Object.assign(match, state.persistPrefs, {
        [config.statePref]: state.id
      });
    }

    // set prefs to state or reset
    let prefs = {};
    for (let pref of Object.keys(config.prefTypes)) {
      prefManager.setPref(pref, match[pref] || undefined, config.prefTypes[pref]);
    }

    return true;
  },
  // Clear all non persistant prefs and remove the addon.
  async clear(id, finalState = "uninstalled") {
    await this.init();
    const types = await ExtensionSettingsStore.getAllForExtension(id, SETTING_TYPE);
    for (let key of types) {
      const settingName = key.replace(new RegExp(`^${SETTING_PREFIX}`), "");
      const state = await this.get(settingName);
      const config = await this.getSettingConfig(settingName);
      // If we don't have a valid state or it's not a minus state then set uninstalled
      if (!config.states[state] || config.states[state].id >= 0) {
        await this.set(id, settingName, finalState, false);
      } else {
        // Set the state again, resetting non persistent prefs
        await this.set(id, settingName, state, false);
      }
      await ExtensionSettingsStore.removeSetting(id, SETTING_TYPE, key);
    }
    const addon = await AddonManager.getAddonByID(id);
    addon.uninstall();
  }
};

var settings = class settings extends ExtensionAPI {
  getAPI(context) {
    const {extension} = context;
    extension.callOnClose({
      close: () => {
        switch (extension.shutdownReason) {
          case "ADDON_DISABLE":
            settingManager.clear(extension.id, "disabled");
            break;

          case "ADDON_DOWNGRADE":
          case "ADDON_UPGRADE":
            // TODO Decide if we need to do something here
            break;
          case "ADDON_UNINSTALL":
            settingManager.clear(extension.id);
            break;
        }
      },
    });
    return {
      experiments: {
        settings: {
          async getStrings(stringNames) {
            let brands = Services.strings.createBundle("chrome://branding/locale/brand.properties");
            let output = {};
            for (let key of stringNames) {
              output[key] = brands.GetStringFromName(key);
            }
            return output;
          },
          async getPref(prefName) {
            return await prefManager.getUserPref(prefName);
          },
          async add(settingsObject) {
            return settingManager.add(extension.id, settingsObject);
          },
          async set(settingName, value) {
            return settingManager.set(extension.id, settingName, value);
          },
          async get(settingName) {
            return settingManager.get(settingName);
          },
        },
      },
    };
  }
}
