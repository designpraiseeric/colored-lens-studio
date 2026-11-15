#!/usr/bin/env bash
# Fetches the open-source OpenFX SDK used to build the Resolve plugin.
# The After Effects SDK (for the Premiere effect) cannot be redistributed: download it from
# https://developer.adobe.com/after-effects/ (free, Adobe login) and pass -DAE_SDK=/path/to/it to CMake,
# or store it as the AE_SDK_ZIP_URL secret for GitHub Actions.
set -euo pipefail
cd "$(dirname "$0")/../engine"
mkdir -p third_party
if [ ! -f third_party/openfx/include/ofxImageEffect.h ]; then
  git clone --depth 1 --branch OFX_Release_1_4_TAG https://github.com/AcademySoftwareFoundation/openfx.git third_party/openfx
fi
echo "OpenFX ready: engine/third_party/openfx"
