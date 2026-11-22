#!/bin/bash
set -eu
project_root="$(cd "$(dirname "$0")/.." && pwd)"
resource_root="$project_root"
if [ -f "$project_root/resources/app/server.cjs" ]; then resource_root="$project_root/resources"; fi
fail() { printf '\nBolt: %s\n' "$1" >&2; if [ -t 0 ]; then read -r -p 'Press Return to close.' || true; fi; exit 1; }
[ "$(uname -s)" = Darwin ] || fail 'This launcher is for macOS. On Windows, use Start Bolt.cmd.'
[ -f "$resource_root/app/server.cjs" ] || fail 'Extract the entire Bolt folder first.'
if [ "${1:-}" != --check ]; then
  desktop_arch="$(uname -m)"; if [ "$desktop_arch" = x86_64 ]; then desktop_arch=x64; fi
  for desktop_app in "$project_root/Desktop/Bolt-darwin-$desktop_arch/Bolt.app" "$project_root/releases/desktop/Bolt-darwin-$desktop_arch/Bolt.app"; do
    if [ -d "$desktop_app" ]; then
      export BOLT_LEGACY_DATA_DIR="$resource_root/.app-runtime"
      if [ "$resource_root" = "$project_root" ]; then export BOLT_DATA_DIR="$project_root/.app-runtime" BOLT_DESKTOP_PROFILE="$project_root/.app-runtime/desktop"; fi
      nohup "$desktop_app/Contents/MacOS/Bolt" >/dev/null 2>&1 </dev/null & exit 0
    fi
  done
fi
node_path=''
for candidate in "$resource_root/runtime/node" "$project_root/tools/runtime/node" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -x "$candidate" ]; then node_path="$candidate"; break; fi
done
if [ -z "$node_path" ]; then node_path="$(command -v node || true)"; fi
[ -n "$node_path" ] || fail 'The runtime is missing. Extract a fresh Mac package or install Node.js 24 LTS.'
cd "$resource_root"
"$node_path" -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(!((major===22&&minor>=13)||major>=24))process.exit(1)' || fail 'Install Node.js 24 LTS or extract a fresh Mac package.'
"$node_path" -e 'require.resolve("pdfjs-dist/legacy/build/pdf.mjs")' >/dev/null 2>&1 || fail 'PDF tools are missing. Extract the full package, or run npm ci in a source checkout.'
"$node_path" -e 'require("./app/browser.cjs").findBrowser()' >/dev/null 2>&1 || fail 'Install Google Chrome or Brave in Applications, then open Bolt again.'
if [ "${1:-}" = --check ]; then "$node_path" -e 'console.log(JSON.stringify({ok:true,platform:process.platform,architecture:process.arch,node:process.versions.node}))'; exit 0; fi
mkdir -p .app-runtime
if ! /usr/bin/curl --silent --fail --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ollama_path=''
  for candidate in /usr/local/bin/ollama /opt/homebrew/bin/ollama /Applications/Ollama.app/Contents/Resources/ollama; do
    if [ -x "$candidate" ]; then ollama_path="$candidate"; break; fi
  done
  if [ -n "$ollama_path" ]; then nohup "$ollama_path" serve >.app-runtime/ollama.stdout.log 2>.app-runtime/ollama.stderr.log </dev/null & fi
fi
port="${BOLT_PORT:-${CHATTERHIGH_PORT:-43117}}"
case "$port" in *[!0-9]*|'') fail 'The app port must be a number.';; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail 'The app port must be between 1 and 65535.'
nohup "$node_path" app/server.cjs --open >.app-runtime/startup.stdout.log 2>.app-runtime/startup.stderr.log </dev/null &
server_pid=$!
for attempt in {1..50}; do
  if /usr/bin/curl --silent --fail --max-time 1 "http://127.0.0.1:$port/health" | "$node_path" -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{if(!["bolt-local-app","chatterhigh-local-app"].includes(JSON.parse(s).app))process.exit(1)}catch{process.exit(1)}})'; then exit 0; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  sleep .2
done
fail "Bolt could not start. See $resource_root/.app-runtime/startup.stderr.log."
