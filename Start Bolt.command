#!/bin/bash
set -eu
cd "$(dirname "$0")"
exec /bin/bash tools/Start-Bolt.sh "$@"
