## HTTP DNS

This is a test WebExtension + Experimental API to enable HTTP DNS in the browser, for
testing purposes.

## How to install this API and WebExtension

1. npm install web-ext - `npm install -g web-ext`
2. npm run build
3. `web-ext run --verbose -f Nightly`

---

1. Run a non-release build (Nightly or Aurora) version 59 (or newer)
   build.
2. Run `npm run build`
3. Navigate to `about:debugging`, choose
   "Load Temporary Add-on" and select `manifest.json`
   in this project.  You should see a new entry in the list of
   extensions titled "HTTP DNS".

## TODO list

- Document functions
- Add tests for unset hidden prefs and public ones
- Decide if pref setting should be synced across devices
