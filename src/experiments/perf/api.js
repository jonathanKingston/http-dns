"use strict";

let {classes: Cc, interfaces: Ci, utils: Cu3, results: Cr} = Components;

Cu3.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Preferences", "resource://gre/modules/Preferences.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryController", "resource://gre/modules/TelemetryController.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "certDB", "@mozilla.org/security/x509certdb;1", "nsIX509CertDB");
XPCOMUtils.defineLazyServiceGetter(this, "uuidGenerator", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator");
XPCOMUtils.defineLazyGlobalGetters(this, ["XMLHttpRequest"]);

const REPEAT_COUNT = 5;

const XHR_TIMEOUT = 10000;

const measurements = [
  {label: "http-now-doh", url: "http://ionspm-synth.akamaized.net/now.txt", doh: true},
  {label: "http-1M-doh", url: "http://ionspm-synth.akamaized.net/tests/1M.bin", doh: true},
  {label: "https-now-doh", url: "https://ionspm-synth.akamaized.net/now.txt", doh: true},
  {label: "https-1M-doh", url: "https://ionspm-synth.akamaized.net/tests/1M.bin", doh: true},
  {label: "http-now", url: "http://ionspm-synth.akamaized.net/now.txt"},
  {label: "http-1M", url: "http://ionspm-synth.akamaized.net/tests/1M.bin"},
  {label: "https-now", url: "https://ionspm-synth.akamaized.net/now.txt"},
  {label: "https-1M", url: "https://ionspm-synth.akamaized.net/tests/1M.bin"},
];

let probe_id = null;

// some fields are not available sometimes, so we have to catch the errors and return undefined.
function getFieldValue(obj, name) {
  try {
    return obj[name];
  } catch (ex) {
    return undefined;
  }
}



const IPV4 = /^(\d{1,3}\.){3,}\d{1,3}(:\d+)?$/;
const IPV6 = /^[0-9A-F:\[\]]{1,4}$/i;

function isIpv4(ipaddress) {
  return IPV4.test(ipaddress)
}

function isIpv6(ipaddress) {
  return IPV6.test(ipaddress)
}

async function getInfo(xhr) {
  let result = {};

  try {
    let channel = xhr.channel;

    // this is the most important value based on which we can find out the problem
    let j = channel.QueryInterface(Ci.nsIRequest);
    let i = channel.QueryInterface(Ci.nsITimedChannel);

    // Commented out keys never seem to be populated
    [
      "channelCreationTime",
      "asyncOpenTime",
      //"launchServiceWorkerStartTime",
      //"launchServiceWorkerEndTime",
      //"dispatchFetchEventStartTime",
      //"dispatchFetchEventEndTime",
      //"handleFetchEventStartTime",
      //"handleFetchEventEndTime",
      "domainLookupStartTime",
      "domainLookupEndTime",
      "connectStartTime",
      "tcpConnectEndTime",
      "secureConnectionStartTime",
      "connectEndTime",
      "requestStartTime",
      "responseStartTime",
      "responseEndTime",
      //"cacheReadStartTime",
      //"cacheReadEndTime",
      //"redirectStartTime",
      //"redirectEndTime",
    ].forEach((key) => {
      result[key] = getFieldValue(channel, key);
    });

    channel.QueryInterface(Ci.nsIHttpChannelInternal);
    if (isIpv4(channel.remoteAddress)) {
      result.ipVersion = 4;
    } else if (isIpv6(channel.remoteAddress)) {
      result.ipVersion = 6;
    } else {
      // Doesn't look like a valid ip
      result.ipVersion = 0;
    }

    result.status = getFieldValue(channel, "status");
    result.dnsLookupDiff = result.domainLookupEndTime - result.domainLookupStartTime;

    let headersArray = xhr.getAllResponseHeaders().split(/[\r\n]+/).filter((header) => {
      return /^synth[-]timings/.test(header);
    });

    result.headers = headersArray;

    let securityInfo = getFieldValue(channel, "securityInfo");

    if (securityInfo instanceof Ci.nsITransportSecurityInfo) {
      securityInfo.QueryInterface(Ci.nsITransportSecurityInfo);

      // extract security state and error code by which we can identify the reasons the connection failed
      result.securityState = getFieldValue(securityInfo, "securityState");
      result.errorCode = getFieldValue(securityInfo, "errorCode");
    }
  } catch (ex) {
    result.exception = ex.message;
  }

  return result;
}

function makeRequest(config) {
  return new Promise((resolve, reject) => {
    // put together the configuration and the info collected from the connection
    async function reportResult(event, xhr) {
      resolve(Object.assign({"event": event, "responseCode": xhr.status}, await getInfo(xhr)));
      return true;
    }

    try {
      let xhr = new XMLHttpRequest({ mozSystem: false});
      xhr.open("GET", config.url, true);

      xhr.timeout = XHR_TIMEOUT;

      xhr.channel.loadFlags = 0;
      xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
      xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
      xhr.channel.loadFlags |= Ci.nsIRequest.INHIBIT_CACHING;
      xhr.channel.loadFlags |= Ci.nsIRequest.INHIBIT_PIPELINE;
      xhr.channel.loadFlags |= Ci.nsIRequest.INHIBIT_PERSISTENT_CACHING;
      xhr.channel.loadFlags |= Ci.nsIRequest.LOAD_FRESH_CONNECTION;
      xhr.channel.loadFlags |= Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;


      if (!config.doh) {
        xhr.channel.loadFlags |= Ci.nsIChannel.LOAD_DISABLE_TRR;
      }
      xhr.channel.QueryInterface(Ci.nsITimedChannel);
      xhr.channel.timingEnabled = true;

      xhr.channel.QueryInterface(Ci.nsIHttpChannelInternal);
      let versionMax = 2;
      let versionFallbackLimit = 2;
      xhr.channel.tlsFlags = 0;
      xhr.channel.tlsFlags |= (versionMax << 0);
      xhr.channel.tlsFlags |= (versionFallbackLimit << 3);

/*
      xhr.addEventListener("loadstart", e => {
console.log("load start");
let i = e.target.channel.QueryInterface(Ci.nsITimedChannel);
console.log("load start", i, "" + i.asyncOpenTime);
       // reportResult("load", e.target);
      });
      xhr.addEventListener("load", e => {
console.log("load");
let i = e.target.channel.QueryInterface(Ci.nsITimedChannel);
console.log("load", ""+i.asyncOpenTime);
       // reportResult("load", e.target);
      });
      xhr.addEventListener("progress", e => {
console.log("progress");
let i = e.target.channel.QueryInterface(Ci.nsITimedChannel);
console.log("progress", ""+i.asyncOpenTime);
      });

*/
      xhr.addEventListener("loadend", e => {
        reportResult("loadend", e.target);
      });

      xhr.addEventListener("error", e => {
        reportResult("error", e.target);
      });

      xhr.addEventListener("abort", e => {
        reportResult("abort", e.target);
      });

      xhr.addEventListener("timeout", e => {
        reportResult("timeout", e.target);
      });

      xhr.send();
    } catch (ex) {
      resolve(Object.assign({result: {"event": "exception", "description": ex.toSource()}}, config));
    }
  });
}

// shuffle the array randomly
function shuffleArray(original_array) {
  let copy_array = original_array.slice();

  let output_array = [];

  while (copy_array.length > 0) {
    let x = Math.floor(Math.random() * copy_array.length);
    output_array.push(copy_array.splice(x, 1)[0]);
  }

  return output_array;
}

// make the request for each configuration
async function runConfigurations() {
  let results = [];

  let configs = shuffleArray(measurements);

  for (let c = 0; c < configs.length; c++) {
    results.push(Object.assign({}, configs[c], {"results": []}));
  }

  for (let i = 0; i < REPEAT_COUNT; i++) {
    for (let c = 0; c < configs.length; c++) {
      // we wait until the result is ready for the current configuration
      // and then move on to the next configuration
      results[c].results.push(await makeRequest(configs[c]));
    }
  }

console.log("r", JSON.stringify(results, undefined, 2));
  return results;
}

async function measure() {
  let output = {};
  try {
    await runConfigurations().then(testResults => {
      output.status = "complete";
      output.tests = testResults;

      return true;
    }).catch(err => {
      output.status = "canceled";
      output.exception = err.toSource();
    });
  } catch (ex) {
    output.status = "canceled";
    output.exception = err.toSource();
  }
  return output;
}

var perf = class settings extends ExtensionAPI {
  getAPI(context) {
    const {extension} = context;
    return {
      experiments: {
        perf: {
          async measure() {
            return measure();
          }
        },
      },
    };
  }
};
