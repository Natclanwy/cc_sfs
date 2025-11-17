#ifndef ELEGOOCC_H
#define ELEGOOCC_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

#include "UUID.h"

#define CARBON_CENTAURI_PORT 3030

// Pin definitions - can be overridden via build flags
#ifndef FILAMENT_RUNOUT_PIN
#define FILAMENT_RUNOUT_PIN 12
#endif

#ifndef MOVEMENT_SENSOR_PIN
#define MOVEMENT_SENSOR_PIN 13
#endif

// Status codes
typedef enum
{
    SDCP_PRINT_STATUS_IDLE          = 0,   // Idle
    SDCP_PRINT_STATUS_HOMING        = 1,   // Homing
    SDCP_PRINT_STATUS_DROPPING      = 2,   // Descending
    SDCP_PRINT_STATUS_EXPOSURING    = 3,   // Exposing
    SDCP_PRINT_STATUS_LIFTING       = 4,   // Lifting
    SDCP_PRINT_STATUS_PAUSING       = 5,   // Executing Pause Action
    SDCP_PRINT_STATUS_PAUSED        = 6,   // Suspended
    SDCP_PRINT_STATUS_STOPPING      = 7,   // Executing Stop Action
    SDCP_PRINT_STATUS_STOPED        = 8,   // Stopped
    SDCP_PRINT_STATUS_COMPLETE      = 9,   // Print Completed
    SDCP_PRINT_STATUS_FILE_CHECKING = 10,  // File Checking in Progress
    SDCP_PRINT_STATUS_PRINTING      = 13,  // Printing
    SDCP_PRINT_STATUS_UNKNOWN_15    = 15,  // unknown
    SDCP_PRINT_STATUS_HEATING       = 16,  // Heating
    SDCP_PRINT_STATUS_UNKNOWN_18    = 18,  // Unknown
    SDCP_PRINT_STATUS_UNKNOWN_19    = 19,  // Unknown
    SDCP_PRINT_STATUS_BED_LEVELING  = 20,  // Bed Leveling
    SDCP_PRINT_STATUS_UNKNOWN_21    = 21,  // Unknown
} sdcp_print_status_t;

// Extended Status Error Codes
typedef enum
{
    SDCP_PRINT_ERROR_NONE               = 0,  // Normal
    SDCP_PRINT_ERROR_CHECK              = 1,  // File MD5 Check Failed
    SDCP_PRINT_ERROR_FILEIO             = 2,  // File Read Failed
    SDCP_PRINT_ERROR_INVLAID_RESOLUTION = 3,  // Resolution Mismatch
    SDCP_PRINT_ERROR_UNKNOWN_FORMAT     = 4,  // Format Mismatch
    SDCP_PRINT_ERROR_UNKNOWN_MODEL      = 5   // Machine Model Mismatch
} sdcp_print_error_t;

typedef enum
{
    SDCP_MACHINE_STATUS_IDLE              = 0,  // Idle
    SDCP_MACHINE_STATUS_PRINTING          = 1,  // Executing print task
    SDCP_MACHINE_STATUS_FILE_TRANSFERRING = 2,  // File transfer in progress
    SDCP_MACHINE_STATUS_EXPOSURE_TESTING  = 3,  // Exposure test in progress
    SDCP_MACHINE_STATUS_DEVICES_TESTING   = 4,  // Device self-check in progress
} sdcp_machine_status_t;

typedef enum
{
    SDCP_COMMAND_STATUS                = 0,
    SDCP_COMMAND_ATTRIBUTES            = 1,
    SDCP_COMMAND_START_PRINT           = 128,
    SDCP_COMMAND_PAUSE_PRINT           = 129,
    SDCP_COMMAND_STOP_PRINT            = 130,
    SDCP_COMMAND_CONTINUE_PRINT        = 131,
    SDCP_COMMAND_STOP_FEEDING_MATERIAL = 132,
} sdcp_command_t;

// Struct to hold current printer information
typedef struct
{
    String              mainboardID;
    sdcp_print_status_t printStatus;
    bool                filamentStopped;
    bool                filamentRunout;
    int                 currentLayer;
    int                 totalLayer;
    int                 progress;
    int                 currentTicks;
    int                 totalTicks;
    int                 PrintSpeedPct;
    bool                isWebsocketConnected;
    bool                isPrinting;
    float               currentZ;
    bool                waitingForAck;
    
    // === Tick Statistics System ===
    // The device tracks time between printer tick changes to help tune timeout settings.
    // Statistics are collected across three overlapping phases:
    // - Overall: All ticks throughout the entire print
    // - Start Phase: Ticks within start_print_timeout (e.g., first 30 seconds)
    // - First Layer: Ticks while currentLayer <= 1 (can overlap with start phase)
    // - Later Layers: Ticks after first layer (currentLayer > 1)
    //
    // This allows users to see if different phases need different timeout values.
    
    // Overall tick statistics (all phases)
    unsigned long       avgTimeBetweenTicks;  // Average time in milliseconds
    unsigned long       minTickTime;          // Minimum time between ticks in milliseconds
    unsigned long       maxTickTime;          // Maximum time between ticks in milliseconds
    int                 tickSampleCount;      // Number of tick samples collected
    
    // Start phase statistics (within start_print_timeout from print start)
    unsigned long       startAvgTickTime;     // Average tick time during start phase
    unsigned long       startMinTickTime;     // Minimum tick time during start phase
    unsigned long       startMaxTickTime;     // Maximum tick time during start phase
    int                 startTickCount;       // Number of samples in start phase
    
    // First layer statistics (currentLayer <= 1, can overlap with start phase)
    unsigned long       firstLayerAvgTickTime;  // Average tick time during first layer
    unsigned long       firstLayerMinTickTime;  // Minimum tick time during first layer
    unsigned long       firstLayerMaxTickTime;  // Maximum tick time during first layer
    int                 firstLayerTickCount;    // Number of samples in first layer
    
    // Later layers statistics (currentLayer > 1)
    unsigned long       laterLayersAvgTickTime; // Average tick time after first layer
    unsigned long       laterLayersMinTickTime; // Minimum tick time after first layer
    unsigned long       laterLayersMaxTickTime; // Maximum tick time after first layer
    int                 laterLayersTickCount;   // Number of samples after first layer
} printer_info_t;

class ElegooCC
{
   private:
    WebSocketsClient webSocket;
    UUID             uuid;

    String ipAddress;

    unsigned long lastPing;
    unsigned long lastStatusPoll;
    // Variables to track movement sensor state
    int           lastMovementValue;  // Initialize to invalid value
    unsigned long lastChangeTime;

    // machine/status info
    String              mainboardID;
    sdcp_print_status_t printStatus;
    uint8_t             machineStatusMask;  // Bitmask for active statuses
    int                 currentLayer;
    float               currentZ;
    int                 totalLayer;
    int                 progress;
    int                 currentTicks;
    int                 totalTicks;
    int                 PrintSpeedPct;
    bool                filamentStopped;
    bool                filamentRunout;

    unsigned long startedAt;

    // Tick timing statistics - overall
    unsigned long lastTickTime;
    unsigned long totalTickTime;
    int           tickCount;
    unsigned long minTickTime;
    unsigned long maxTickTime;

    // Tick timing statistics - start phase (within start_print_timeout)
    unsigned long startTotalTickTime;
    int           startTickCount;
    unsigned long startMinTickTime;
    unsigned long startMaxTickTime;

    // Tick timing statistics - first layer (layer <= 1)
    unsigned long firstLayerTotalTickTime;
    int           firstLayerTickCount;
    unsigned long firstLayerMinTickTime;
    unsigned long firstLayerMaxTickTime;

    // Tick timing statistics - later layers (layer > 1)
    unsigned long laterLayersTotalTickTime;
    int           laterLayersTickCount;
    unsigned long laterLayersMinTickTime;
    unsigned long laterLayersMaxTickTime;

    // Acknowledgment tracking
    bool          waitingForAck;
    int           pendingAckCommand;
    String        pendingAckRequestId;
    unsigned long ackWaitStartTime;

    ElegooCC();

    // Delete copy constructor and assignment operator
    ElegooCC(const ElegooCC &)            = delete;
    ElegooCC &operator=(const ElegooCC &) = delete;

    void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);
    void connect();
    void handleCommandResponse(JsonDocument &doc);
    void handleStatus(JsonDocument &doc);
    void sendCommand(int command, bool waitForAck = false);
    void pausePrint();
    void continuePrint();

    // Helper methods for machine status bitmask
    bool hasMachineStatus(sdcp_machine_status_t status);
    void setMachineStatuses(const int *statusArray, int arraySize);
    bool isPrinting();
    bool shouldPausePrint(unsigned long currentTime);
    void checkFilamentMovement(unsigned long currentTime);
    void checkFilamentRunout(unsigned long currentTime);

   public:
    // Singleton access method
    static ElegooCC &getInstance();

    void setup();
    void loop();

    // Get current printer information
    printer_info_t getCurrentInformation();

    // Reset device-side tick timing statistics (all phases)
    void resetTickStats();  // Resets all tick statistics (overall + all three phases)
};

// Convenience macro for easier access
#define elegooCC ElegooCC::getInstance()

#endif  // ELEGOOCC_H
