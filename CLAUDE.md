# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**cat-catch (猫抓)** is a browser extension for resource sniffing that filters and lists media resources (video, audio, m3u8, mpd, etc.) from the current webpage. It supports Chrome, Edge, Firefox, and Edge Android.

- **Type:** Browser Extension (Manifest V3)
- **Version:** 2.6.7
- **License:** GPL-3.0 (v1.x was MIT)

## Development Commands

This project uses `just` (justfile) for build automation instead of npm scripts.

```bash
# Install dependencies (npm + crx3)
just install

# Validate manifest.json
just validate

# Quick build (ZIP only)
just quick

# Full build (CRX + ZIP)
just build

# Lint/validate extension files
just lint

# Show project status
just status

# Full release workflow
just release

# Clean build artifacts
just clean
```

For local development, run `just prepare` to copy files to `build/`, then load the `build/` directory in Chrome's "Load unpacked" extension.

## Architecture

### Core Components

- **js/background.js** - Service worker (Chrome/Edge)
- **js/content-script.js** - Injected into pages for resource sniffing
- **js/popup.js** - Popup UI logic
- **js/options.js** - Settings page logic
- **js/function.js** - Utility functions
- **js/m3u8.js** - M3U8 parser/demuxer (large file, ~72KB)
- **js/mpd.js** - MPD (DASH) parser
- **js/downloader.js** - Download manager
- **js/preview.js** - Preview functionality
- **js/media-control.js** - Media control
- **js/json.js** - JSON viewer
- **js/firefox.js** - Firefox-specific code

### Key Files

- **manifest.json** - Chrome/Edge manifest (MV3)
- **manifest.firefox.json** - Firefox manifest (MV3)
- **lib/** - Bundled third-party libraries (hls.js, jQuery, mux.js, mpd-parser, etc.)
- **_locales/** - Internationalization (en, zh_CN, zh_TW, ja, es, pt_BR, tr, vi)

### Third-Party Libraries

The project includes bundled libraries in `lib/`:
- hls.js - HLS streaming
- jQuery 3.7.1
- mux.js - MP4/MPEG-TS demuxing
- mpd-parser - DASH MPD parsing
- StreamSaver.js - File streaming/download
- js-base64 - Base64 encoding

## Notes

- This is a vanilla JavaScript project with no bundler, TypeScript, or testing framework
- Third-party libraries are included directly in `lib/` rather than managed via npm
- Firefox uses a separate manifest (manifest.firefox.json)
- The extension runs entirely locally - no data is sent to remote servers
