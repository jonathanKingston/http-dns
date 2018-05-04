"use strict";


/* global Components, ExtensionAPI */
let Cu2 = Components.utils;
Cu2.import("resource://gre/modules/Services.jsm");
Cu2.import("resource://gre/modules/ExtensionSettingsStore.jsm");
Cu2.import("resource://gre/modules/ExtensionPreferencesManager.jsm");

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

  getUserPrefs(prefNames) {
    let prefs = {};
    prefNames.forEach((prefName) => {prefs[prefName] = this.getUserPref(prefName)});
    return prefs;
  },
  getUserPref(name, value) {
    if (!Services.prefs.prefHasUserValue(name)) {
      return null;
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
const settingManager = {
  async add(id, settingConfig) {
    await ExtensionSettingsStore.addSetting(id, SETTING_TYPE, `settingConfig_${settingConfig.name}`, settingConfig);
    await ExtensionPreferencesManager.addSetting(settingConfig.name, {
      settingConfig,
      prefNames: settingConfig.prefNames.filter((name) => {
        return name !== settingConfig.statePref;
      }),

      setCallback(value) {
        let match = {};
        // If we match a state set the state pref and prefs
        // The state pref can't be cleared
        if (value in this.settingConfig.states) {
          const state = this.settingConfig.states[value];
          prefManager.setPref(this.settingConfig.statePref, state.id, "int");
          match = state.prefs;
        }

        let prefs = {};
        for (let pref of this.prefNames) {
          prefs[pref] = match[pref] || undefined;
        }
        return prefs;
      },
    });
  },
  async getSettingConfig(settingName) {
    return await ExtensionSettingsStore.getSetting(SETTING_TYPE, `settingConfig_${settingName}`);
  },
  async get(settingName) {
    const settingConfig = await this.getSettingConfig(settingName);
    const stateInfo = settingConfig.value;
    const statePref = await prefManager.getUserPref(stateInfo.statePref);
    let currentState = null;
    Object.keys(stateInfo.states).forEach((stateKey) => {
      const state = stateInfo.states[stateKey];
      if (state.id === statePref) {
        currentState = stateKey;
      }
    });
    return currentState;
  },
  async set(id, settingName, value) {
    return await ExtensionPreferencesManager.setSetting(id, settingName, value);
  },
  async clear(id) {
    const types = await ExtensionSettingsStore.getAllForExtension(id, SETTING_TYPE);
    for (let key of types) {
      await ExtensionSettingsStore.removeSetting(id, SETTING_TYPE, key);
    }
    return await ExtensionPreferencesManager.disableAll(id);
  }
};

var settings = class settings extends ExtensionAPI {
  getAPI(context) {
    const {extension} = context;
    extension.callOnClose({
      close: () => {
        switch (extension.shutdownReason) {
          case "ADDON_DISABLE":
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
