#!/bin/bash
set -euo pipefail
export MACOSX_DEPLOYMENT_TARGET=12.0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/comtec-media-build"
mkdir -p "$WORK" "$ROOT/src-tauri/resources/media"
ARCHIVE="$WORK/ffmpeg-8.0.1.tar.xz"
if [ ! -f "$ARCHIVE" ]; then curl -fL https://ffmpeg.org/releases/ffmpeg-8.0.1.tar.xz -o "$ARCHIVE"; fi
echo "05ee0b03119b45c0bdb4df654b96802e909e0a752f72e4fe3794f487229e5a41  $ARCHIVE" | shasum -a 256 -c -
cd "$WORK"
tar -xf "$ARCHIVE"
cd ffmpeg-8.0.1
if [ -f ffbuild/config.mak ]; then make distclean; fi
./configure --disable-autodetect --disable-everything --disable-network --disable-doc --disable-debug --disable-shared --enable-static --enable-ffmpeg --enable-ffprobe --enable-avcodec --enable-avformat --enable-avfilter --enable-swresample --enable-swscale --enable-protocol=file --enable-demuxer=mov --enable-muxer=mp4 --enable-parser=h264,aac --enable-decoder=h264,aac --enable-bsf=aac_adtstoasc,h264_mp4toannexb --enable-filter=anull,null --cc=clang
make -j8
cp ffmpeg ffprobe COPYING.LGPLv2.1 "$ROOT/src-tauri/resources/media/"
cp "$ARCHIVE" "$ROOT/src-tauri/resources/media/"
cp "$ROOT/scripts/build-media.sh" "$ROOT/src-tauri/resources/media/build-media.sh"
for helper in ffmpeg ffprobe; do
  strip "$ROOT/src-tauri/resources/media/$helper"
  codesign --force --sign - "$ROOT/src-tauri/resources/media/$helper"
  otool -L "$ROOT/src-tauri/resources/media/$helper"
done
