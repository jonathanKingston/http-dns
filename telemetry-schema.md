## Attributes

Key | Description
--- | ---
event | `perf-report`
results | String holding a JSON-encoded `OuterResults`
sentCount | count of perf reports from this client, starting at 1


OR

Key | Description
--- | ---
stateKey | (enabled,disabled,UIdisabled,UIOk,uninstalled,loaded)

## OuterResults

Key | Description
--- | ---
status | (complete,canceled)
tests | array of `Test`

## Test

Key | Description
--- | ---
label | friendly slug
results | array of `Result`

## Result

Key | Description
--- | ---
asyncOpenTime | timestamp
channelCreationTime | timestamp
connectEndTime | timestamp
connectStartTime | timestamp
domainLookupEndTime | timestamp
domainLookupStartTime | timestamp
errorCode | `0` on success; missing for insecure contexts. Value of nsITransportSecurityInfo.errorCode.
event | `(loadend,abort,timeout,retry-limit,exception)`; `"loadend"` is the only success value
headers | array of `Header`
isTRR | `true` or missing; whether DOH was used to resolve the remote endpoint
remoteAddress | IPv[46] address of the fetch endpoint
requestStartTime | timestamp
responseCode | HTTP status code for the fetch
responseEndTime | timestamp
responseStartTime | timestamp
secureConnectionStartTime | timestamp or `0`?
securityState | `2` on success; missing for HTTP. Value of nsITransportSecurityInfo.securityState. Bitfield including fields from [nsIWebProgressListener].
status | integer [nsresult] for the fetch; 0 on success
tcpConnectEndTime | timestamp

## Header

Strings matching one of (whitespace added for legibility):

```
synth-timings-incoming:
  now=(\d+);
  turnaround=(\d+);
  client_rtt=(\d+), now=(\d+);
  # turnaround=(\d+);  # These last two values should not appear, but might!
  # client_rtt=(\d+);
```

```
synth-timings-outgoing:
  now=(\d+);
  turnaround=(\d+);
  client_rtt=(\d+)
```

The `client_rtt` is the round-trip time to the client, measured by Cloudflare.

[nsresult]: https://searchfox.org/mozilla-central/source/__GENERATED__/xpcom/base/ErrorList.h#52
[nsIWebProgressListener]: https://searchfox.org/mozilla-central/rev/3e0f1d95fcf8832413457e3bec802113bdd1f8e8/uriloader/base/nsIWebProgressListener.idl#153-175
