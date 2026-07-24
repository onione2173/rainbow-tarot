#!/bin/zsh
# Fukumaru dead-man heartbeat.
# Stamps the FUKUMARU_HEARTBEAT repo variable (unix seconds, UTC) so the
# fukumaru-watchdog GitHub Actions workflow knows the owner's laptop is alive.
# Installed on the laptop as a launchd agent running every 10 minutes:
#   ~/Library/LaunchAgents/com.rainbow-tarot.fukumaru-heartbeat.plist
# Remove with:
#   launchctl bootout gui/$UID/com.rainbow-tarot.fukumaru-heartbeat
#   rm ~/Library/LaunchAgents/com.rainbow-tarot.fukumaru-heartbeat.plist
/opt/homebrew/bin/gh variable set FUKUMARU_HEARTBEAT \
  --body "$(date -u +%s)" \
  --repo onione2173/rainbow-tarot
