"use strict";

let {interfaces: Ci} = Components;

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const {Svc} = ChromeUtils.import("resource://services-sync/util.js");

XPCOMUtils.defineLazyModuleGetter(this, "Preferences", "resource://gre/modules/Preferences.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryController", "resource://gre/modules/TelemetryController.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "certDB", "@mozilla.org/security/x509certdb;1", "nsIX509CertDB");
XPCOMUtils.defineLazyServiceGetter(this, "uuidGenerator", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator");
XPCOMUtils.defineLazyGlobalGetters(this, ["XMLHttpRequest"]);

const XHR_TIMEOUT = 10000;

const measurements = [
  {label: "http-now-doh", url: "http://ionspm-synth.akamaized.net/now.txt", doh: true, ccheck: false},
  {label: "http-1M-doh", url: "http://ionspm-synth.akamaized.net/tests/1M.bin", doh: true, ccheck: true},
  {label: "https-now-doh", url: "https://ionspm-synth.akamaized.net/now.txt", doh: true, ccheck: false},
  {label: "https-1M-doh", url: "https://ionspm-synth.akamaized.net/tests/1M.bin", doh: true, ccheck: true},

  {label: "http-now", url: "http://ionspm-synth.akamaized.net/now.txt", doh: false, ccheck: false},
  {label: "http-1M", url: "http://ionspm-synth.akamaized.net/tests/1M.bin", doh: false, ccheck: true},
  {label: "https-now", url: "https://ionspm-synth.akamaized.net/now.txt", doh: false, ccheck: false},
  {label: "https-1M", url: "https://ionspm-synth.akamaized.net/tests/1M.bin", doh: false, ccheck: true},

  {label: "https-fb-43b-doh", url: "https://scontent.xx.fbcdn.net/test-1px.gif", doh: true, ccheck: false, facebook: true},
  {label: "https-fb-100k-doh", url: "https://scontent.xx.fbcdn.net/r20-100KB.png", doh: true, ccheck: false, facebook: true},

  {label: "https-fb-43b", url: "https://scontent.xx.fbcdn.net/test-1px.gif", doh: false, ccheck: false, facebook: true},
  {label: "https-fb-100k", url: "https://scontent.xx.fbcdn.net/r20-100KB.png", doh: false, ccheck: false, facebook: true},
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


async function getInfo(xhr, config) {
  let result = {};
  // TODO check TTL also

  try {
    let channel = xhr.channel;

    channel.QueryInterface(Ci.nsIRequest);
    channel.QueryInterface(Ci.nsITimedChannel);

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
    result.remoteAddress = channel.remoteAddress;

    result.status = getFieldValue(channel, "status");
    //result.dnsLookupDiff = result.domainLookupEndTime - result.domainLookupStartTime;

    let allHeaders = xhr.getAllResponseHeaders().split(/[\r\n]+/);

    // If we are checking we got a cache hit
    if (config.ccheck) {
      let xcache = allHeaders.find((header) => {
        return /^x-cache/i.test(header);
      });
      if (xcache && !/TCP_HIT|TCP_MEM_HIT/.test(xcache)) {
        // Will retry request
        return null;
      }
    }
    result.headers = allHeaders.filter((header) => {
      return /^synth[-]timings/i.test(header);
    });

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

  if (config.doh) {
    let url = new URL(config.url);
    try {
      let res = await verifyWasTRR(url.hostname);
      if (!res.isTRR) {
        Cu.reportError("trr record not found");
        return null;
      }
      result.isTRR = res.isTRR;
    } catch {
      Cu.reportError("dns didn't return");
      return null;
    }
  }

  return result;
}


function verifyWasTRR(hostname) {
  return new Promise((resolve, reject) => {
    let response = {};
    let request;
    let listener = {
      onLookupComplete: function(inRequest, inRecord, inStatus) {
        if (inRequest === request) {
          if (!Components.isSuccessCode(inStatus)) {
            return reject({message: getErrorString(inStatus)});
          }
          response.isTRR = inRecord.IsTRR();
          return resolve(response);
        }
      },
    };

    let dns = Cc["@mozilla.org/network/dns-service;1"].getService(Ci.nsIDNSService);
    try {
      request = dns.asyncResolve(hostname, Ci.nsIDNSService.RESOLVE_OFFLINE, listener, null, {} /* defaultOriginAttributes */);
    } catch (e) {
      // handle exceptions such as offline mode.
      return reject({message: e.name});
    }
  });
}

function buildRequest(config, reportResult) {
  // Clear the cache
  Svc.Obs.notify("network:link-status-changed", null, "up");

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

  // If we should be checking the cache then send the cache on header.
  // As we have LOAD_BYPASS_CACHE this will end up sending: "Pragma: akamai-x-cache-on, no-cache"
  if (config.ccheck) {
    xhr.setRequestHeader("Pragma", "akamai-x-cache-on");
  }

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

  // Ignoring loadstart, load and progress events

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
}

function makeRequest(config) {
  return new Promise((resolve, reject) => {
    let retry = 0;
    // put together the configuration and the info collected from the connection
    async function reportResult(event, xhr) {
      let info = await getInfo(xhr, config);
      if (info == null) {
        ++retry;
        if (retry > 3) {
          resolve(Object.assign({result: {"event": "retry-limit", "description": `Retried ${retry} times`}}, config));
          return;
        }
        buildRequest(config, reportResult);
      } else {
        resolve(Object.assign({"event": event, "responseCode": xhr.status}, info));
      }
      return true;
    }

    try {
      buildRequest(config, reportResult);
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
async function runConfigurations(repeatCount, facebook) {
  let results = [];

  let configs = shuffleArray(measurements);

  for (let c = 0; c < configs.length; c++) {
    results.push(Object.assign({}, { label: configs[c].label }, {"results": []}));
  }

  for (let i = 0; i < repeatCount; i++) {
    for (let c = 0; c < configs.length; c++) {
      let config = configs[c];

      // Skip facebook payloads when the user doens't have a facebook cookie
      if (!facebook && "facebook" in config && config.facebook) {
        continue;
      }
      // we wait until the result is ready for the current configuration
      // and then move on to the next configuration
      results[c].results.push(await makeRequest(config));
    }
  }

  return results;
}

async function measure(repeatCount, facebook) {
  let output = {};
  await runConfigurations(repeatCount, facebook).then(testResults => {
    output.status = "complete";
    output.tests = testResults;

    return true;
  }).catch(err => {
    output.status = "canceled";
    output.exception = err.toSource();
  });
  return output;
}

var perf = class settings extends ExtensionAPI {
  getAPI(context) {
    const {extension} = context;
    return {
      experiments: {
        perf: {
          async measure(repeatCount, facebook) {
            return measure(repeatCount, facebook);
          }
        },
      },
    };
  }
};
