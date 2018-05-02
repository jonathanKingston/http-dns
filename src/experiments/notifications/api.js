"use strict";

/* global Components, ExtensionAPI */
let Cc = Components.classes;
let Cu = Components.utils;
let Ci = Components.interfaces;
Cu.import("resource://gre/modules/Services.jsm");

const {EventManager} = ExtensionCommon;

// Implements an experimental extension to the notifications api

Cu.import("resource://gre/modules/EventEmitter.jsm");
Cu.import("resource://gre/modules/BrowserUtils.jsm");

function loadStyles(resourceURI) {
  const styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"]
                            .getService(Ci.nsIStyleSheetService);
  const styleURI = styleSheet(resourceURI);
  const sheetType = styleSheetService.AGENT_SHEET;
  styleSheetService.loadAndRegisterSheet(styleURI, sheetType);
}

function styleSheet(resourceURI) {
  return Services.io.newURI("prompt.css", null, Services.io.newURI(resourceURI));
}

function unloadStyles(resourceURI) {
  const styleURI = styleSheet(resourceURI);
  const styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"]
                  .getService(Ci.nsIStyleSheetService);
  const sheetType = styleSheetService.AGENT_SHEET;
  if (styleSheetService.sheetRegistered(styleURI, sheetType)) {
    styleSheetService.unregisterSheet(styleURI, sheetType);
  }
}

class NotificationPrompt {
  constructor(extension, notificationsMap, id, options) {
    this.notificationsMap = notificationsMap;
    this.id = id;
    this.options = options;

    //loadStyles(extension.resourceURL + "");
    loadStyles(extension.baseURI.spec + "");

    const browserWin = Services.wm.getMostRecentWindow("navigator:browser");
    let buttonsOutput = [];
    if (options.buttons) {
      let buttonIndex = 0;
      for (let buttonIndex in options.buttons) {
        let button = options.buttons[buttonIndex];
        buttonsOutput.push({
          label: button.title,
          callback: () => {
            this.handleEvent("buttonClicked", {
              notificationId: id,
              buttonIndex
            });
          }
        });
      }
    }
    this.box = browserWin.document.getElementById("global-notificationbox");
    let outputMessage = options.message;
    if (options.moreInfo) {
        let mainMessage = "%S %S";
        let text = options.moreInfo.title || "Learn more";
        let link = browserWin.document.createElement("label");
        link.className = "text-link";
        link.setAttribute("useoriginprincipal", true);
        link.setAttribute("href", options.moreInfo.url);
        link.textContent = text;
        outputMessage = BrowserUtils.getLocalizedFragment(browserWin.document, mainMessage, outputMessage, link);
    }
    this.box.appendNotification(outputMessage, id, null, this.box.PRIORITY_INFO_HIGH,
      buttonsOutput);
  }

  clear() {
    this.box.getNotificationWithValue(this.id).close();
    this.notificationsMap.delete(this.id);
  }

  handleEvent(event, data) {
    this.notificationsMap.emit(event, data);
  }
}

var notifications = class notifications extends ExtensionAPI {
  constructor(extension) {
    super(extension);

    this.nextId = 0;
    this.notificationsMap = new Map();
    EventEmitter.decorate(this.notificationsMap);
  }

  onShutdown() {
    for (let notification of this.notificationsMap.values()) {
      notification.clear();
    }
  }

  getAPI(context) {
    let {extension} = context;
    let notificationsMap = this.notificationsMap;

    return {
      experiments: {
        notifications: {
          clear: function(notificationId) {
            if (notificationsMap.has(notificationId)) {
              notificationsMap.get(notificationId).clear();
              return Promise.resolve(true);
            }
            return Promise.resolve(false);
          },
          create: (notificationId, options) => {
            if (!notificationId) {
              notificationId = String(this.nextId++);
            }
  
            if (notificationsMap.has(notificationId)) {
              notificationsMap.get(notificationId).clear();
            }
  
            let notification;
            if (options.type === "prompt") {
              notification = new NotificationPrompt(extension, notificationsMap, notificationId, options);
            } else {
             // Normal notices here unsupported in experiment
            }
            notificationsMap.set(notificationId, notification);
  
            return Promise.resolve(notificationId);
          },
  
          onButtonClicked: new EventManager(
            context,
            "notifications.onButtonClicked",
            fire => {
              let listener = (event, data) => {
                fire.async(data);
              };
  
              notificationsMap.on("buttonClicked", listener);
              return () => {
                notificationsMap.off("buttonClicked", listener);
              };
            },
          ).api(),
        },
      },
    };
  }
};
