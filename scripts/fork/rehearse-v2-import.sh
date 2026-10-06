#!/usr/bin/env bash
# Snapshot the live v1 database into this worktree so a V2 server can rehearse
# the cutover. The source is opened read-only. The destination is the worktree
# `.t3` and is refused when it would be the installed app's home.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="${TANDEM_V1_DB:-$HOME/.t3-jcode/userdata/state.sqlite}"
DEST_HOME="$ROOT/.t3"
DEST_DIR="$DEST_HOME/userdata"
DEST_DB="$DEST_DIR/state.sqlite"
SOURCE_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

case "$DEST_HOME" in
  "$HOME/.t3" | "$HOME/.t3-jcode")
    echo "refusing to write the installed T3 home: $DEST_HOME" >&2
    exit 1
    ;;
esac

if [[ "$DEST_DIR" == "$SOURCE_DIR" ]]; then
  echo "refusing to snapshot a database onto itself: $DEST_DIR" >&2
  exit 1
fi

if [[ ! -f "$SOURCE" ]]; then
  echo "v1 database not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
rm -f "$DEST_DIR"/state.sqlite "$DEST_DIR"/state.sqlite-wal "$DEST_DIR"/state.sqlite-shm \
  "$DEST_DIR"/statev2.sqlite "$DEST_DIR"/statev2.sqlite-wal "$DEST_DIR"/statev2.sqlite-shm

node --input-type=module -e '
import { DatabaseSync, backup } from "node:sqlite";
const source = process.argv[1];
const destination = process.argv[2];
const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, destination);
} finally {
  database.close();
}
' "$SOURCE" "$DEST_DB"

for name in settings.json keybindings.json; do
  if [[ -f "$SOURCE_DIR/$name" ]]; then
    cp "$SOURCE_DIR/$name" "$DEST_DIR/$name"
  fi
done

echo "snapshot: $DEST_DB"
echo "start the rehearsal with: npm run dev:server -- --home-dir $(printf %q "$DEST_HOME")"
