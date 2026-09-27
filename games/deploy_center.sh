#!/usr/bin/env bash
# Build a fresh immutable release and atomically switch the center symlink.
# The running game-center server does not need to restart.
set -euo pipefail

REMOTE="${1:-huaning-mac}"
REMOTE_ROOT="/Users/huaning/work/tech_bit"
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
BUNDLE="$(mktemp -t games-center).tar.gz"

tar -czf "$BUNDLE" \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '*.log' \
  --exclude '*.pid' \
  --exclude 'games/prize-lottery/data.json' \
  games

scp -O -q "$BUNDLE" "$REMOTE:/tmp/games-center-$STAMP.tar.gz"
ssh -o BatchMode=yes "$REMOTE" \
  REMOTE_ROOT="$REMOTE_ROOT" RELEASE="$STAMP" /usr/bin/python3 - <<'PY'
import os
import pathlib
import tarfile

root = pathlib.Path(os.environ["REMOTE_ROOT"])
release = root / "center" / "releases" / os.environ["RELEASE"]
bundle = pathlib.Path("/tmp") / f"games-center-{os.environ['RELEASE']}.tar.gz"
release.mkdir(parents=True, exist_ok=False)
with tarfile.open(bundle, "r:gz") as tf:
    tf.extractall(release)

link = root / "current"
temporary = root / f".current-{os.getpid()}"
if temporary.exists() or temporary.is_symlink():
    temporary.unlink()
os.symlink(release, temporary)
os.replace(temporary, link)
bundle.unlink()
print(link)
print(release)
PY
echo "Deployed release $STAMP to $REMOTE without restarting the game center."
