#!/bin/bash
# Keep this Terminal window open while viewing recordings; Control-C stops it.
exec /opt/homebrew/bin/python3 "/Users/yasirdev/Applications/COMTEC Viewer/server.py" --open "$@"
