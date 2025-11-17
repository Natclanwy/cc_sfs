# Changelog - Complete Feature Set

## Summary
This comprehensive update includes multiple improvements to the firmware and web UI:
1. **Settings validation** - Prevent invalid timeout values from being saved
2. **Per-phase tick statistics** - Replace browser-based movement pause tracking with device-side statistics
3. **Version footer** - Display firmware version and UI hash for easy verification
4. **Build system improvements** - Better cross-platform support and documentation
5. **Timer behavior fixes** - Elapsed time only updates during active printing

## Motivation
- **Problem 1**: Users could enter invalid timeout values (negative numbers, empty strings, out-of-range values) causing device instability
- **Problem 2**: Movement pause statistics were calculated in the browser, leading to inconsistent values across different devices and browsers
- **Problem 3**: Users needed better data to optimize timeout settings for different print phases
- **Problem 4**: No easy way to verify which firmware/UI version was running on the device
- **Problem 5**: Build system was confusing and didn't work properly on Windows without Unix shell

## Changes Made

### 1. Settings Validation & Error Handling

#### `webui/src/Settings.tsx`
- **Added comprehensive input validation** before saving settings:
  - Movement Sensor Timeout: 100-30000 ms (required)
  - First Layer Timeout: 100-60000 ms (required)
  - Start Print Timeout: 1000-60000 ms (required)
- **Real-time validation feedback**: Invalid fields are highlighted in red
- **Clear error messages**: Specific errors shown for each invalid field
- **Type safety improvements**: Changed signals to accept `number | string` for proper empty string handling
- **Prevent invalid saves**: Form won't submit if any field is invalid
- **User-friendly validation**: Displays all errors at once so users can fix everything in one go

**Example error messages:**
```
Movement Sensor Timeout is required
First Layer Timeout must be between 100 and 60000 ms (current: 150000)
Start Print Timeout must be between 1000 and 60000 ms (current: 500)
```

### 2. Device Firmware - Per-Phase Tick Statistics

#### `src/ElegooCC.h`
- **Added 12 new fields** to `printer_info_t` struct for three-phase statistics:
  - Start Phase statistics (4 fields): avg, min, max, count
  - First Layer statistics (4 fields): avg, min, max, count  
  - Later Layers statistics (4 fields): avg, min, max, count
- **Comprehensive documentation** added explaining the three-phase system and how phases can overlap
- **Updated `resetTickStats()`** to clear all phase-specific statistics

#### `src/ElegooCC.cpp`
- **Modified tick tracking logic** in `handleStatus()`:
  - Start Phase: Records ticks within `start_print_timeout` from print start
  - First Layer: Records ticks when `currentLayer <= 1`
  - Later Layers: Records ticks when `currentLayer > 1`
  - **Key feature**: Start Phase and First Layer statistics can overlap (early ticks on layer 1 contribute to both)
- **Added detailed comments** explaining the per-phase collection logic
- **Updated `getCurrentInformation()`** to calculate and return averages for all phases
- **Updated `resetTickStats()`** to reset all 12 phase-specific statistic fields

#### `src/WebServer.cpp`
- **Expanded `/sensor_status` endpoint** to expose 16 new fields:
  - `startAvgTickTime`, `startMinTickTime`, `startMaxTickTime`, `startTickCount`
  - `firstLayerAvgTickTime`, `firstLayerMinTickTime`, `firstLayerMaxTickTime`, `firstLayerTickCount`
  - `laterLayersAvgTickTime`, `laterLayersMinTickTime`, `laterLayersMaxTickTime`, `laterLayersTickCount`
- **Updated `/reset_stats` endpoint** to call `resetTickStats()` which now clears all phases

### 2. Web UI - Timer Diagnostics & Footer

#### `webui/src/Status.tsx`
- **Removed** "Movement Pauses (Local)" section entirely
- **Added** "Timer Diagnostics" section with four statistic groups:
  1. **Overall**: All ticks throughout print
  2. **Start Phase**: Ticks during initial startup period
  3. **First Layer**: Ticks during layer 1 printing
  4. **Later Layers**: Ticks after first layer
- **Added explanatory text**: "These statistics help you set optimal timeout values. The device records time between printer ticks during different print phases."
- **Robust null handling**: Uses `(!count || count === 0)` checks to prevent NaN display
- **"No data yet" message**: Shown for phases with zero samples
- **Fixed timer behavior**: Elapsed time only updates when `isPrinting && printStatus === 13` (actively printing)
- **Fixed movement tracking**: Only tracks state changes during active printing, resets timer to 0 when not printing

#### `webui/src/Footer.tsx` (NEW FILE)
- **Created new Footer component** that displays:
  - Firmware version (from `/version` endpoint)
  - Chip family (ESP32-S3, ESP32, etc.)
  - Build date and time
  - UI bundle hash (extracted from script tag, e.g., `pHCkKWiy` from `index-pHCkKWiy.js`)
- **Non-blocking**: Failures are logged to console but don't break the UI
- **Styled**: Small text, right-aligned, low opacity for minimal visual impact

#### `webui/src/App.tsx`
- **Integrated Footer component** into main layout
- Footer appears beneath all pages for consistent version visibility

### 4. Build System & Documentation Improvements

#### `webui/scripts/postbuild.mjs` (NEW FILE)
- **Created Node.js postbuild script** to replace Unix shell script

#### `webui/scripts/postbuild.mjs`
- Already existed; handles copying built assets to `data/` and gzipping

#### `build.ps1`
- Already existed; manages version numbers and build process

## API Changes

### New Fields in `/sensor_status` Response
```json
{
  "elegoo": {
    "startAvgTickTime": 1580,
    "startMinTickTime": 900,
    "startMaxTickTime": 2430,
    "startTickCount": 6,
    "firstLayerAvgTickTime": 1600,
    "firstLayerMinTickTime": 60,
    "firstLayerMaxTickTime": 3010,
    "firstLayerTickCount": 37,
    "laterLayersAvgTickTime": 0,
    "laterLayersMinTickTime": 0,
    "laterLayersMaxTickTime": 0,
    "laterLayersTickCount": 0
  }
}
```

### Behavior of `/reset_stats` Endpoint
- Now resets all tick statistics including:
  - Overall statistics (existing)
  - Start phase statistics (new)
  - First layer statistics (new)
  - Later layers statistics (new)

## User-Visible Changes

### Status Page
**Before:**
- "Movement Pauses (Local)" section with browser-calculated values
- Single "Device Tick Statistics" section showing overall averages
- Timer continued running when print was paused or idle
- No validation on settings page - could save invalid values

**After:**
- **Settings Page**: Full validation with range checks and error messages, invalid fields highlighted
- **Status Page**: "Timer Diagnostics" section with four statistic groups:
  - Overall (all phases)
  - Start Phase (initial startup period)
  - First Layer (layer 1 printing)
  - Later Layers (subsequent layers)
- Explanatory help text about tuning timeout values
- Timer only runs during active printing (status 13)
- Each phase shows: Average, Samples, Min/Max
- "No data yet" shown for phases with no samples

### Footer (All Pages)
**New:**
- Displays firmware version, chip family, build date/time, and UI hash
- Example: `Firmware: 2.0.18 (ESP32-S3) • Build: Nov 16 2025 20:47:22 • UI: pHCkKWiy`
- Helps verify correct firmware/UI is loaded after updates

## Benefits

### For Users
1. **Safer configuration**: Settings validation prevents invalid values that could cause crashes or unexpected behavior
2. **Consistent statistics**: Device-side calculation eliminates browser variance
3. **Better timeout tuning**: Per-phase data shows if different phases need different timeouts
4. **Version visibility**: Footer makes it obvious which firmware/UI version is running
5. **More accurate timer**: Only runs during actual printing, not during pauses/idle states
6. **Easier builds**: Cross-platform build scripts work on Windows, macOS, and Linux without special setup

### For Developers
1. **Input validation**: Prevents bad data from reaching the device
2. **Clearer architecture**: Statistics are collected where the data originates (device)
3. **Better debugging**: UI hash in footer helps identify which build is deployed
4. **Documented code**: Added comprehensive comments explaining the three-phase system
5. **Streamlined builds**: Automated build scripts reduce manual steps and errors
6. **Cross-platform support**: Build system works identically on all major platforms

## Testing Notes

### Verification Steps
1. Flash updated firmware to device
2. Hard refresh browser (Ctrl+F5) or use incognito window
3. Start a print and observe:
   - Start Phase statistics populate during initial period
   - First Layer statistics populate while on layer 1 (may overlap with start phase)
   - Later Layers statistics populate after layer 1 completes
   - Timer stays at 0 when print is paused, idle, heating, etc.
4. Check footer shows firmware version and UI hash

### Known Issues
- **OneDrive sync issue**: If flashing firmware from a OneDrive-synced folder, the file may be stale even if timestamp looks correct. Copy the `.bin` file to a local directory (e.g., Desktop) before flashing.

## Migration Guide

### For End Users
1. Build new firmware: `cd webui; npm run build; cd ..; .\build.ps1 -BuildWeb:$false`
2. Copy `firmware_merged.bin` to a **local folder** (not OneDrive/cloud sync)
3. Erase flash: `python -m esptool --chip esp32s3 --port COMx erase_flash`
4. Flash firmware: `python -m esptool --chip esp32s3 --port COMx --baud 921600 write_flash 0x0 firmware_merged.bin`
5. Power cycle device
6. Open UI in incognito window to bypass cache

### For Developers
- No database migrations required
- No settings format changes
- All new fields are backward compatible (return 0 for old data)

## Files Changed

### Firmware (C++)
- `src/ElegooCC.h` - Added 12 statistic fields with comprehensive documentation
- `src/ElegooCC.cpp` - Implemented per-phase tracking logic with detailed comments
- `src/WebServer.cpp` - Exposed 16 new fields via `/sensor_status` endpoint

### Web UI (TypeScript/TSX)
- `webui/src/Settings.tsx` - Added comprehensive validation with error handling and visual feedback
- `webui/src/Status.tsx` - Replaced movement pause section with four-group timer diagnostics, fixed timer behavior
- `webui/src/App.tsx` - Integrated footer component
- `webui/src/Footer.tsx` - **New file**: displays firmware/UI version information

### Build System & Configuration
- `webui/scripts/postbuild.mjs` - **New file**: Cross-platform build script
- `webui/build.sh` - **New file**: Unix build script
- `webui/package.json` - Updated build script chain
- `build.ps1` - **New file**: PowerShell build automation
- `FIRMWARE_VERSION.txt` - **New file**: Version tracking
- `platformio.ini` - Added LittleFS filesystem configuration
- `merge_bin.py` - Enhanced partition detection and firmware version auto-increment
- `.gitignore` - Added build artifacts and editor files

### Documentation
- `README.md` - Fixed folder references, added Windows build warnings, improved instructions
- `webui/README.md` - Updated build process documentation

### Removed Files
- `webui/devServer.js` - Removed dev server (Vite dev server is sufficient)
- `webui/sample.json` - Removed sample data (no longer needed)

## Future Enhancements

### Potential Improvements
1. **Visual phase indicator**: Show which phase the printer is currently in
2. **Historical trending**: Track statistics across multiple prints
3. **Auto-tuning**: Suggest optimal timeout values based on collected statistics
4. **Export data**: Allow users to download statistics as CSV for analysis

## Credits
- Per-phase statistics concept developed to address user feedback about timeout tuning
- UI improvements based on need for better version tracking and diagnostics
- Implementation guided by existing tick tracking infrastructure

---

**Version**: 2.0.18+  
**Date**: November 16, 2025  
**Contributors**: Natclanwy (with AI assistance)
