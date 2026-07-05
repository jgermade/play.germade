#!/usr/bin/env bash
set -euo pipefail

# Deploys Sonic 3 A.I.R. (Angel Island Revisited) for the web.
#
# Unlike Sonic 1/2 (RSDKv4, compiled from source via Docker with a preloaded
# Data.rsdk), Sonic 3 A.I.R. is built by its own upstream project (Eukaryot/sonic3air)
# which already publishes an official prebuilt Emscripten web release on GitHub.
# We fetch that release directly instead of recompiling the C++ engine ourselves.
#
# The engine loads its ROM-derived game data at runtime from an IndexedDB-backed
# filesystem (IDBFS), normally prompting the user with a native file picker on
# first launch. We patch the shell to auto-fetch the ROM from a same-origin path
# instead, so it "just works" like Sonic 1/2 do.
#
# Usage: scripts/sonic3/build-sonic3-web.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/sonic3-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/sonic-3"
TARGET_DIR="$ROOT_DIR/public/game/sonic-3"
ROM_FILE="$ASSETS_DIR/Sonic_Knuckles_wSonic3.bin"

if [ ! -f "$ROM_FILE" ]; then
    echo "Error: Sonic_Knuckles_wSonic3.bin not found in $ASSETS_DIR"
    exit 1
fi

ROM_SIZE=$(stat -f%z "$ROM_FILE" 2>/dev/null || stat -c%s "$ROM_FILE")
if [ "$ROM_SIZE" != "4194304" ]; then
    echo "Error: ROM file is $ROM_SIZE bytes, expected 4194304 (4MB)."
    echo "Are you sure this is a legal Sonic_Knuckles_wSonic3.bin dump?"
    exit 1
fi

echo "Looking up latest Sonic 3 A.I.R. release on GitHub..."
RELEASE_JSON=$(curl -sL https://api.github.com/repos/Eukaryot/sonic3air/releases/latest)
ASSET_URL=$(echo "$RELEASE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next(a['browser_download_url'] for a in d['assets'] if a['name']=='sonic3air_web_data.zip'))")
TAG_NAME=$(echo "$RELEASE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")
echo "Latest release: $TAG_NAME"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

echo "Downloading $ASSET_URL..."
curl -sL -o "$WORK_DIR/sonic3air_web_data.zip" "$ASSET_URL"

echo "Extracting release archive..."
unzip -q "$WORK_DIR/sonic3air_web_data.zip" -d "$WORK_DIR/extracted"

# The zip contains a single dated subfolder, e.g. "20260328_beta/"
RELEASE_DIR=$(find "$WORK_DIR/extracted" -mindepth 1 -maxdepth 1 -type d | head -n1)

echo "Deploying build output to $TARGET_DIR..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -R "$RELEASE_DIR/." "$TARGET_DIR/"

# Drop the iOS install-instructions page and other files we don't need;
# the actual playable entry point becomes our index.html.
rm -f "$TARGET_DIR/.DS_Store" "$TARGET_DIR/index.html" "$TARGET_DIR/addToHome.png" "$TARGET_DIR/share.svg"
mv "$TARGET_DIR/sonic3air_web.html" "$TARGET_DIR/index.html"

echo "Copying ROM alongside the build (gitignored; served same-origin so the game can auto-load it)..."
mkdir -p "$TARGET_DIR/rom"
cp "$ROM_FILE" "$TARGET_DIR/rom/Sonic_Knuckles_wSonic3.bin"

echo "Patching index.html to auto-provision the ROM instead of prompting the user..."

# Insert an async helper, anchored right before the existing installS3kFile() function.
HELPER='async function ensureRomThenContinue(){
	if(FS.analyzePath("/sonic3air/savedata/Sonic_Knuckles_wSonic3.bin", true).exists !== true){
		try {
			const res = await fetch("rom/Sonic_Knuckles_wSonic3.bin");
			if(res.ok){
				const data = new Uint8Array(await res.arrayBuffer());
				Module["FS_createDataFile"]("/sonic3air/savedata/", "Sonic_Knuckles_wSonic3.bin", data, true, true, true);
				await new Promise((resolve) => FS.syncfs(false, resolve));
			}
		} catch(e) {
			console.warn("Auto ROM provisioning failed:", e);
		}
	}
	onDownloadsComplete();
}

function installS3kFile'

python3 - "$TARGET_DIR/index.html" "$HELPER" <<'PYEOF'
import sys
path, helper = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

anchor = "function installS3kFile"
assert content.count(anchor) == 1, "expected exactly one installS3kFile definition"
content = content.replace(anchor, helper, 1)

call = "onDownloadsComplete();"
assert content.count(call) == 2, "expected helper def + one call site"
# Replace only the call site (second occurrence), not the one inside the new helper (first occurrence).
first = content.find(call)
second = content.find(call, first + 1)
content = content[:second] + "ensureRomThenContinue();" + content[second + len(call):]

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

echo "Build complete. Output available in $TARGET_DIR"
