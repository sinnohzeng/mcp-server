#\!/bin/bash
# MCP Docs Server - Deploy Script
# Can be run manually or by systemd timer

set -e
cd /home/ecs-user/mcp-docs-server

# Fetch latest
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "[$(date)] No changes."
    exit 0
fi

echo "[$(date)] Changes detected, deploying..."
git pull origin main --quiet

# Check if source code changed (needs rebuild + restart)
CHANGED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE")
if echo "$CHANGED_FILES" | grep -qE "^(src/|package\.json|tsconfig\.json)"; then
    echo "[$(date)] Code changed, rebuilding..."
    npm install --production=false --quiet 2>/dev/null
    npx tsc
    sudo systemctl restart mcp-docs
    echo "[$(date)] Service restarted."
else
    echo "[$(date)] Only docs changed, no restart needed."
fi

echo "[$(date)] Deploy complete."
