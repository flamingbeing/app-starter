#!/usr/bin/env bash
# Re-download e2e/fixtures/core/ (the files the pages load from core.anawj.com) for the file list already there. After a
# version change in app/index.html: delete the old version's folder, add the new files (a file missing from the copy
# answers 404 "not in e2e/fixtures/core: <path>" in the run), then run this.
set -euo pipefail
cd "$(dirname "$0")/../e2e/fixtures/core"
find . -type f | sed 's|^\./||' | while read -r p; do curl -sfS "https://core.anawj.com/$p" -o "$p"; done
