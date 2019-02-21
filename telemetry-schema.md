## Attributes

Key | Description
--- | ---
event | `perf-report` (can this take other values?)
results | String holding a JSON-encoded `OuterResults`
sentCount | string-encoded integer representing the number of `Results` in each `Test`

## OuterResults

Key | Description
--- | ---
status | `"complete"` (Can this take other values?)
tests | array of `Test`

## Test

Key | Description
--- | ---
ccheck | ?
doh | `true` or `false`; whether DOH was used to resolve the remote endpoint
facebook | `true` or missing; whether the remote endpoint is Facebook
label | friendly slug with a 1:1 mapping to a (`doh`, `url`) pair
results | array of `Result`
url | URL of endpoint

## Result

Key | Description
--- | ---
asyncOpenTime | timestamp
channelCreationTime | timestamp
connectEndTime | timestamp
connectStartTime | timestamp
domainLookupEndTime | timestamp
domainLookupStartTime | timestamp
errorCode | `0` or missing?
event | `"loadend"` (Can this take other values?)
headers | array of `Header`
isTRR | `true` or missing; whether DOH was used to resolve the remote endpoint
remoteAddress | IPv[46] address of the fetch endpoint
requestStartTime | timestamp
responseCode | HTTP status code for the fetch
responseEndTime | timestamp
responseStartTime | timestamp
secureConnectionStartTime | timestamp or `0`?
securityState | `2` or missing?
status | `0`?
tcpConnectEndTime | timestamp

## Header

Strings matching one of (whitespace added for legibility):

```
synth-timings-incoming:
  now=(\d+);
  turnaround=(\d+);
  client_rtt=(\d+), now=(\d+);
  turnaround=(\d+);
  client_rtt=(\d+);
```

```
synth-timings-outgoing:
  now=(\d+);
  turnaround=(\d+);
  client_rtt=(\d+)
```

(What do these values mean?)
