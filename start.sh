#!/bin/bash
# Kyano Comm Hub — auto-start via LaunchAgent nl.endlessminds.kyano-hub
# Wordt gestart door ~/Library/LaunchAgents/nl.endlessminds.kyano-hub.plist
set -e
cd "$HOME/kyano-hub"
exec npm run dev
