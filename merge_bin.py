# originally from here: https://github.com/platformio/platform-espressif32/issues/1078#issuecomment-1636793463
Import("env")
import os
from os.path import join

# -------------------------------
# Auto-increment firmware version
# -------------------------------
def _parse_semver(text, default=(2, 0, 0)):
    try:
        parts = [int(p) for p in str(text).strip().split(".")]
        while len(parts) < 3:
            parts.append(0)
        return parts[0], parts[1], parts[2]
    except Exception:
        return default

def bump_and_set_firmware_version(env):
    project_dir = env.subst("$PROJECT_DIR")
    version_file = os.path.join(project_dir, "FIRMWARE_VERSION.txt")

    # Read current version or initialize
    if os.path.exists(version_file):
        with open(version_file, "r", encoding="utf-8") as f:
            current = f.read().strip()
    else:
        current = "2.0.0"

    major, minor, patch = _parse_semver(current)
    # Increment patch on every build
    patch += 1
    new_version = f"{major}.{minor}.{patch}"

    # Persist the bumped version
    try:
        with open(version_file, "w", encoding="utf-8") as f:
            f.write(new_version)
    except Exception as e:
        print(f"Warning: could not write {version_file}: {e}")

    # Inject into build as C define used by main.cpp/Web UI /version endpoint
    env.Append(CPPDEFINES=[f'FIRMWARE_VERSION_RAW="{new_version}"'])
    print(f"Firmware version set to {new_version}")

# Perform the bump immediately so all compilation uses the new version
bump_and_set_firmware_version(env)

APP_BIN = "$BUILD_DIR/${PROGNAME}.bin"
LITTLEFS_BIN = "$BUILD_DIR/littlefs.bin"
MERGED_BIN = "$BUILD_DIR/${PROGNAME}_merged.bin"
BOARD_CONFIG = env.BoardConfig()


def get_littlefs_partition_address(env):
    """Get the LittleFS partition address from the partition table"""
    try:
        partitions_csv = None
        
        if hasattr(env, 'GetProjectOption'):
            partitions_csv = env.GetProjectOption("board_build.partitions", None)
        
        if not partitions_csv:
            # Get the board's partition table from the framework
            board_name = env.subst("$BOARD")
            framework_dir = env.subst("$PROJECT_PACKAGES_DIR/framework-arduinoespressif32")
            
            # Try to find the default partition table for the board
            variants_dir = os.path.join(framework_dir, "variants", board_name)
            if os.path.exists(variants_dir):
                for file in os.listdir(variants_dir):
                    if file.endswith(".csv"):
                        partitions_csv = os.path.join(variants_dir, file)
                        break
            
            # Fallback to default partition table
            if not partitions_csv:
                # Check flash size to determine which default partition table to use
                flash_size = BOARD_CONFIG.get("upload.flash_size", "4MB")
                print(f"Board flash size: {flash_size}")
                
                # TODO: make this less dumb
                if flash_size == "8MB":
                    default_csv = "default_8MB.csv"
                else:
                    default_csv = "default.csv"
                
                print(f"Getting partitions from default {os.path.join(framework_dir, "tools", "partitions", default_csv)}")
                partitions_csv = os.path.join(framework_dir, "tools", "partitions", default_csv)
        
        # If we still don't have a partition table file, try to get it from the build process
        if not partitions_csv or not os.path.exists(partitions_csv):
            # Try to find the generated partition table
            build_dir = env.subst("$BUILD_DIR")
            generated_partitions = os.path.join(build_dir, "partitions.csv")
            if os.path.exists(generated_partitions):
                partitions_csv = generated_partitions
            else:
                # Fall back to the default known address
                print("Warning: Could not find partition table, using default LittleFS address 0x3d0000")
                return "0x3d0000"
        
        # Read and parse the partition table
        with open(partitions_csv, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 5:
                        name, type_field, subtype, offset, size = parts[:5]
                        # Look for spiffs or littlefs partition
                        if ('spiffs' in name.lower() or 'littlefs' in name.lower() or 
                            type_field.lower() == 'data' and subtype.lower() in ['spiffs', 'littlefs']):
                            # Clean up the offset (remove quotes and whitespace)
                            offset = offset.strip('"\'')
                            if not offset.startswith('0x'):
                                offset = '0x' + offset
                            print(f"Found LittleFS partition '{name}' at address {offset}")
                            return offset
        
        print("Warning: LittleFS partition not found in partition table, using default address 0x3d0000")
        return "0x3d0000"
        
    except Exception as e:
        print(f"Error reading partition table: {e}")
        print("Using default LittleFS address 0x3d0000")
        return "0x3d0000"


def build_littlefs(source, target, env):
    """Build LittleFS filesystem before main build"""
    print("Building LittleFS filesystem...")
        
    # Build the LittleFS partition with --disable-auto-clean to prevent cleanup
    env.Execute("$PYTHONEXE -m platformio run -e $PIOENV --target buildfs --disable-auto-clean")


def merge_bin(source, target, env):
    # Get the dynamic LittleFS partition address
    littlefs_address = get_littlefs_partition_address(env)
    
    # The list contains all extra images (bootloader, partitions, eboot) and
    # the final application binary
    flash_images = env.Flatten(env.get("FLASH_EXTRA_IMAGES", [])) + ["$ESP32_APP_OFFSET", APP_BIN, littlefs_address, LITTLEFS_BIN]

    # Run esptool to merge images into a single binary
    env.Execute(
        " ".join(
            [
                "$PYTHONEXE",
                "$OBJCOPY",
                "--chip",
                BOARD_CONFIG.get("build.mcu", "esp32"),
                "merge_bin",
                "--fill-flash-size",
                BOARD_CONFIG.get("upload.flash_size", "4MB"),
                "-o",
                MERGED_BIN,
            ]
            + flash_images
        )
    )

# Add a pre-action to build LittleFS before main build
env.AddPreAction(APP_BIN, build_littlefs)

# Add a post action that runs esptoolpy to merge available flash images
env.AddPostAction(APP_BIN , merge_bin)

# Patch the upload command to flash the merged binary at address 0x0
env.Replace(
    UPLOADERFLAGS=[
        "write_flash"
        ]
        + ["0x0", MERGED_BIN],
    UPLOADCMD='"$PYTHONEXE" "$UPLOADER" $UPLOADERFLAGS',
)

