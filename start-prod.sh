#!/bin/bash
cd ~/kyano-hub
export NODE_ENV=production
# Server serveert de gebouwde client bestanden uit client/dist
node server/index.js
