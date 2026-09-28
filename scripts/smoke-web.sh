#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DSH_VERSION:?Set DSH_VERSION to an exact DSH release}"
DSH_CHANNEL=${DSH_CHANNEL:-pinned}
DSH_PORT=${DSH_PORT:-3198}
smoke_dir=$(mktemp -d "${TMPDIR:-/tmp}/dsh-autonomy-smoke.XXXXXX")
export DSH_HOME="$smoke_dir/home"
export DSH_TELEMETRY_MODE=DISABLED
printf 'Testing isolated Web profile: DSH %s\n' "$DSH_VERSION"
pack_dir="$smoke_dir/pack"
mkdir -p "$pack_dir"
pnpm pack --pack-destination "$pack_dir"
package_version=$(node -p "require('./package.json').version")
pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" plugin --profile web add \
  "$pack_dir/dsh-autonomy-$package_version.tgz"
pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" --profile web --dump-config \
  > "$smoke_dir/dsh-autonomy-$DSH_CHANNEL-config.txt"
grep -q 'name: dsh-autonomy' \
  "$smoke_dir/dsh-autonomy-$DSH_CHANNEL-config.txt"

log="$smoke_dir/dsh-autonomy-$DSH_CHANNEL-web.log"
index="$smoke_dir/dsh-autonomy-$DSH_CHANNEL-index.html"
cookies="$smoke_dir/dsh-autonomy-$DSH_CHANNEL-cookies.txt"
bundle="$smoke_dir/dsh-autonomy-$DSH_CHANNEL-client.js"
pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" web --no-open --port "$DSH_PORT" \
  > "$log" 2>&1 &
dsh_pid=$!
cleanup() {
  status=$?
  kill "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid" 2>/dev/null || true
  if [ "$status" -ne 0 ]; then
    sed -E 's/(token=)[^&[:space:]]+/\1[redacted]/g' "$log"
  fi
}
trap cleanup EXIT

launch_url=''
for attempt in {1..90}; do
  launch_url=$(grep -Eo "http://127[.]0[.]0[.]1:$DSH_PORT/[^[:space:]]*" "$log" | head -1 || true)
  if [ -n "$launch_url" ]; then
    break
  fi
  if ! kill -0 "$dsh_pid" 2>/dev/null; then
    exit 1
  fi
  sleep 1
done
if [ -z "$launch_url" ]; then
  echo 'Timed out waiting for the Web launch URL' >&2
  exit 1
fi

curl --fail --silent --show-error --location \
  --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 10 \
  --cookie-jar "$cookies" --cookie "$cookies" \
  "$launch_url" > "$index"
grep -q '"id":"dsh-autonomy"' "$index"
node - "$index" "http://127.0.0.1:$DSH_PORT/" > "$smoke_dir/plugin-url.txt" <<'NODE'
const fs = require('fs')
const html = fs.readFileSync(process.argv[2], 'utf8')
const match = html.match(/"id":"dsh-autonomy","url":"((?:\\.|[^"])*)"/)
if (match === null) process.exit(1)
process.stdout.write(new URL(JSON.parse(`"${match[1]}"`), process.argv[3]).href)
NODE
plugin_url=$(cat "$smoke_dir/plugin-url.txt")
curl --fail --silent --show-error \
  --max-time 30 \
  --cookie "$cookies" "$plugin_url" > "$bundle"
grep -q 'id: "dsh-autonomy"' "$bundle"

pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" plugin --profile web remove dsh-autonomy
pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" --profile web --dump-config > "$smoke_dir/removed.txt"
if grep -q 'dsh-autonomy' "$smoke_dir/removed.txt"; then
  echo 'Plugin remained in the profile after uninstall' >&2
  exit 1
fi
echo "Web install, authenticated bundle load, and uninstall passed for DSH $DSH_VERSION"
