#include "WebServer.h"

#include <AsyncJson.h>

#include "ElegooCC.h"
#include "Logger.h"

#define SPIFFS LittleFS

// External reference to firmware version from main.cpp
extern const char* firmwareVersion;
extern const char* chipFamily;

WebServer::WebServer(int port) : server(port) {}

void WebServer::begin()
{
    server.begin();

    // Get settings endpoint
    server.on("/get_settings", HTTP_GET,
              [](AsyncWebServerRequest* request)
              {
                  String jsonResponse = settingsManager.toJson(false);
                  request->send(200, "application/json", jsonResponse);
              });

    server.addHandler(new AsyncCallbackJsonWebHandler(
        "/update_settings",
        [this](AsyncWebServerRequest* request, JsonVariant& json)
        {
            JsonObject jsonObj = json.as<JsonObject>();
            settingsManager.setElegooIP(jsonObj["elegooip"].as<String>());
            settingsManager.setSSID(jsonObj["ssid"].as<String>());
            settingsManager.setElegooIP(jsonObj["elegooip"].as<String>());
            settingsManager.setSSID(jsonObj["ssid"].as<String>());
            if (jsonObj.containsKey("passwd") && jsonObj["passwd"].as<String>().length() > 0)
            {
                settingsManager.setPassword(jsonObj["passwd"].as<String>());
            }
            settingsManager.setAPMode(jsonObj["ap_mode"].as<bool>());
            settingsManager.setTimeout(jsonObj["timeout"].as<int>());
            settingsManager.setFirstLayerTimeout(jsonObj["first_layer_timeout"].as<int>());
            settingsManager.setPauseOnRunout(jsonObj["pause_on_runout"].as<bool>());
            settingsManager.setEnabled(jsonObj["enabled"].as<bool>());
            settingsManager.setStartPrintTimeout(jsonObj["start_print_timeout"].as<int>());
            bool saved = settingsManager.save();

            // Return the current settings to validate they were saved
            DynamicJsonDocument responseDoc(512);
            responseDoc["success"]                         = saved;
            const user_settings& currentSettings           = settingsManager.getSettings();
            responseDoc["settings"]["timeout"]             = currentSettings.timeout;
            responseDoc["settings"]["first_layer_timeout"] = currentSettings.first_layer_timeout;
            responseDoc["settings"]["pause_on_runout"]     = currentSettings.pause_on_runout;
            responseDoc["settings"]["start_print_timeout"] = currentSettings.start_print_timeout;
            responseDoc["settings"]["enabled"]             = currentSettings.enabled;
            responseDoc["settings"]["elegooip"]            = currentSettings.elegooip;
            responseDoc["settings"]["ssid"]                = currentSettings.ssid;
            responseDoc["settings"]["ap_mode"]             = currentSettings.ap_mode;

            String jsonResponse;
            serializeJson(responseDoc, jsonResponse);
            jsonObj.clear();
            request->send(saved ? 200 : 500, "application/json", jsonResponse);
        }));

    // Setup ElegantOTA
    ElegantOTA.begin(&server);

    // Sensor status endpoint
    server.on("/sensor_status", HTTP_GET,
              [this](AsyncWebServerRequest* request)
              {
                  // Add elegoo status information using singleton
                  printer_info_t elegooStatus = elegooCC.getCurrentInformation();

                  // Increase capacity to ensure all fields (including new statistics)
                  // are serialized without truncation
                  DynamicJsonDocument jsonDoc(1024);
                  jsonDoc["stopped"]        = elegooStatus.filamentStopped;
                  jsonDoc["filamentRunout"] = elegooStatus.filamentRunout;

                  jsonDoc["elegoo"]["mainboardID"]          = elegooStatus.mainboardID;
                  jsonDoc["elegoo"]["printStatus"]          = (int) elegooStatus.printStatus;
                  jsonDoc["elegoo"]["isPrinting"]           = elegooStatus.isPrinting;
                  jsonDoc["elegoo"]["currentLayer"]         = elegooStatus.currentLayer;
                  jsonDoc["elegoo"]["totalLayer"]           = elegooStatus.totalLayer;
                  jsonDoc["elegoo"]["progress"]             = elegooStatus.progress;
                  jsonDoc["elegoo"]["currentTicks"]         = elegooStatus.currentTicks;
                  jsonDoc["elegoo"]["totalTicks"]           = elegooStatus.totalTicks;
                  jsonDoc["elegoo"]["PrintSpeedPct"]        = elegooStatus.PrintSpeedPct;
                  jsonDoc["elegoo"]["isWebsocketConnected"] = elegooStatus.isWebsocketConnected;
                  jsonDoc["elegoo"]["currentZ"]             = elegooStatus.currentZ;
                  // Overall tick statistics
                  jsonDoc["elegoo"]["avgTimeBetweenTicks"]  = elegooStatus.avgTimeBetweenTicks;
                  jsonDoc["elegoo"]["minTickTime"]          = elegooStatus.minTickTime;
                  jsonDoc["elegoo"]["maxTickTime"]          = elegooStatus.maxTickTime;
                  jsonDoc["elegoo"]["tickSampleCount"]      = elegooStatus.tickSampleCount;
                  // Start phase statistics
                  jsonDoc["elegoo"]["startAvgTickTime"]     = elegooStatus.startAvgTickTime;
                  jsonDoc["elegoo"]["startMinTickTime"]     = elegooStatus.startMinTickTime;
                  jsonDoc["elegoo"]["startMaxTickTime"]     = elegooStatus.startMaxTickTime;
                  jsonDoc["elegoo"]["startTickCount"]       = elegooStatus.startTickCount;
                  // First layer statistics
                  jsonDoc["elegoo"]["firstLayerAvgTickTime"] = elegooStatus.firstLayerAvgTickTime;
                  jsonDoc["elegoo"]["firstLayerMinTickTime"] = elegooStatus.firstLayerMinTickTime;
                  jsonDoc["elegoo"]["firstLayerMaxTickTime"] = elegooStatus.firstLayerMaxTickTime;
                  jsonDoc["elegoo"]["firstLayerTickCount"]   = elegooStatus.firstLayerTickCount;
                  // Later layers statistics
                  jsonDoc["elegoo"]["laterLayersAvgTickTime"] = elegooStatus.laterLayersAvgTickTime;
                  jsonDoc["elegoo"]["laterLayersMinTickTime"] = elegooStatus.laterLayersMinTickTime;
                  jsonDoc["elegoo"]["laterLayersMaxTickTime"] = elegooStatus.laterLayersMaxTickTime;
                  jsonDoc["elegoo"]["laterLayersTickCount"]   = elegooStatus.laterLayersTickCount;

                  // Add current timeout settings
                  const user_settings& settings              = settingsManager.getSettings();
                  jsonDoc["settings"]["timeout"]             = settings.timeout;
                  jsonDoc["settings"]["first_layer_timeout"] = settings.first_layer_timeout;
                  jsonDoc["settings"]["enabled"]             = settings.enabled;

                  String jsonResponse;
                  serializeJson(jsonDoc, jsonResponse);
                  request->send(200, "application/json", jsonResponse);
              });

    // Reset device-side tick statistics
    server.on("/reset_stats", HTTP_POST,
              [](AsyncWebServerRequest* request)
              {
                  elegooCC.resetTickStats();

                  DynamicJsonDocument jsonDoc(64);
                  jsonDoc["success"] = true;
                  String jsonResponse;
                  serializeJson(jsonDoc, jsonResponse);
                  request->send(200, "application/json", jsonResponse);
              });

    // Logs endpoint
    server.on("/logs", HTTP_GET,
              [](AsyncWebServerRequest* request)
              {
                  String jsonResponse = logger.getLogsAsJson();
                  request->send(200, "application/json", jsonResponse);
              });

    // Version endpoint
    server.on("/version", HTTP_GET,
              [](AsyncWebServerRequest* request)
              {
                  DynamicJsonDocument jsonDoc(256);
                  jsonDoc["firmware_version"] = firmwareVersion;
                  jsonDoc["chip_family"]      = chipFamily;
                  jsonDoc["build_date"]       = __DATE__;
                  jsonDoc["build_time"]       = __TIME__;

                  String jsonResponse;
                  serializeJson(jsonDoc, jsonResponse);
                  request->send(200, "application/json", jsonResponse);
              });

    // Serve static files from SPIFFS
    // Cache hashed assets aggressively; avoid caching index.htm so new hashes are picked up
    server.serveStatic("/assets/", SPIFFS, "/assets/").setCacheControl("max-age=31536000, immutable");
    server.serveStatic("/", SPIFFS, "/").setDefaultFile("index.htm").setCacheControl("no-cache");
}

void WebServer::loop()
{
    ElegantOTA.loop();
}