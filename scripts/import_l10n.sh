#! /usr/bin/env bash

# Clone the l10n repository in a temporary folder
git clone https://github.com/mozilla-l10n/dns-over-https-l10n temp_l10n

# Import translations
./node_modules/pontoon-to-webext/pontoon-to-webext.js --src temp_l10n/locales --dest src/_locales/

# Remove temporary folder
rm -rf temp_l10n
