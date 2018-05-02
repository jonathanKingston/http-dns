"use strict";


/* global Components, ExtensionAPI */
let Cu2 = Components.utils;
Cu2.import("resource://gre/modules/Services.jsm");

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

var rollout = class rollout extends ExtensionAPI {
  getAPI(context) {
    return {
      experiments: {
        rollout: {
          async getPrefs(prefNames) {
            return prefManager.getUserPrefs(prefNames);
          },
          async setPrefs(prefs) {
            return prefManager.setPrefs(prefs);
          },
        },
      },
    };
  }
}
