#!/bin/bash
# Kyano Comm Hub — auto-start via LaunchAgent nl.endlessminds.kyano-hub
# Wordt gestart door ~/Library/LaunchAgents/nl.endlessminds.kyano-hub.plist
#
# PRODUCTIE: de server serveert de vooraf gebouwde client uit client/dist op
# http://localhost:3001 — geen Vite dev server meer (die werd traag bij wekenlang draaien).
# Na het wijzigen van client-code opnieuw bouwen met:  cd client && npm run build
set -e
cd "$HOME/kyano-hub"
export NODE_ENV=production
exec node server/index.js
