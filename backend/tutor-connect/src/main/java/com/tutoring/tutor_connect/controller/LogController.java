package com.tutoring.tutor_connect.controller;

import com.tutoring.tutor_connect.model.LogBatch;
import com.tutoring.tutor_connect.model.LogEntry;
import com.tutoring.tutor_connect.service.ClientLogService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Controller to receive logs from frontend
 * Logs include filename and location information automatically captured by the Logger class
 */
@RestController
@RequestMapping("/api/logs")
// CORS is handled by WebConfig - no need for @CrossOrigin here
// Using @CrossOrigin(origins = "*") conflicts with allowCredentials(true) in global CORS config
public class LogController {
    private static final Logger logger = LoggerFactory.getLogger(LogController.class);
    
    @Autowired
    private ClientLogService clientLogService;

    /**
     * Receive batch of logs from frontend
     * Each log entry contains:
     * - timestamp
     * - level (ERROR, WARN, INFO, DEBUG, VERBOSE)
     * - message
     * - data (optional)
     * - source (filename, fullPath, line, column, function)
     * - userAgent
     * - url
     */
    @PostMapping
    public ResponseEntity<?> receiveLogs(@RequestBody LogBatch logBatch) {
        try {
            logger.info("📥 Received log batch with {} entries", 
                logBatch != null && logBatch.getLogs() != null ? logBatch.getLogs().size() : 0);
            
            if (logBatch == null || logBatch.getLogs() == null || logBatch.getLogs().isEmpty()) {
                logger.warn("⚠️ Empty log batch received");
                return ResponseEntity.badRequest().body("No logs provided");
            }

            // Process each log entry
            int processedCount = 0;
            int savedCount = 0;
            for (LogEntry logEntry : logBatch.getLogs()) {
                processedCount++;
                logger.info("📝 Processing log entry {}/{} - username: {}, message: {}", 
                    processedCount,
                    logBatch.getLogs().size(),
                    logEntry.getUsername() != null ? logEntry.getUsername() : "null",
                    logEntry.getMessage() != null ? logEntry.getMessage().substring(0, Math.min(50, logEntry.getMessage().length())) : "null");
                // Log to server's own logger with source information
                String sourceInfo = String.format("[%s:%d] %s", 
                    logEntry.getSource() != null ? logEntry.getSource().getFilename() : "unknown",
                    logEntry.getSource() != null ? logEntry.getSource().getLine() : 0,
                    logEntry.getSource() != null ? logEntry.getSource().getFunction() : "unknown"
                );

                // Include client ID and username in log message for identification
                String clientInfo = String.format("[ClientId:%s", 
                    logEntry.getClientId() != null ? logEntry.getClientId() : "unknown");
                if (logEntry.getUsername() != null && !logEntry.getUsername().isEmpty()) {
                    clientInfo += String.format(" | User:%s", logEntry.getUsername());
                } else if (logEntry.getUserId() != null && !logEntry.getUserId().isEmpty()) {
                    // Fallback to userId if username not available
                    clientInfo += String.format(" | UserId:%s", logEntry.getUserId());
                }
                clientInfo += "]";
                
                String logMessage = String.format("[CLIENT] %s %s - %s", 
                    clientInfo, sourceInfo, logEntry.getMessage());

                // Use appropriate log level
                switch (logEntry.getLevel()) {
                    case "ERROR":
                        logger.error("{} | Data: {} | URL: {} | UserAgent: {}", 
                            logMessage, 
                            logEntry.getData(), 
                            logEntry.getUrl(),
                            logEntry.getUserAgent());
                        break;
                    case "WARN":
                        logger.warn("{} | Data: {} | URL: {}", 
                            logMessage, 
                            logEntry.getData(), 
                            logEntry.getUrl());
                        break;
                    case "INFO":
                        logger.info("{} | Data: {}", 
                            logMessage, 
                            logEntry.getData());
                        break;
                    case "DEBUG":
                        logger.debug("{} | Data: {}", 
                            logMessage, 
                            logEntry.getData());
                        break;
                    case "VERBOSE":
                        logger.trace("{} | Data: {}", 
                            logMessage, 
                            logEntry.getData());
                        break;
                    default:
                        logger.info("{} | Data: {}", 
                            logMessage, 
                            logEntry.getData());
                }

                // Save log entry to file
                try {
                    // Log username availability for debugging
                    if (logEntry.getUsername() == null || logEntry.getUsername().isEmpty()) {
                        logger.warn("⚠️ Log entry missing username - clientId: {}, userId: {}, message: {}", 
                            logEntry.getClientId(), 
                            logEntry.getUserId(),
                            logEntry.getMessage() != null ? logEntry.getMessage().substring(0, Math.min(50, logEntry.getMessage().length())) : "null");
                    } else {
                        logger.info("✅ Log entry HAS username: {} - message: {}", 
                            logEntry.getUsername(),
                            logEntry.getMessage() != null ? logEntry.getMessage().substring(0, Math.min(50, logEntry.getMessage().length())) : "null");
                    }
                    clientLogService.saveLog(logEntry);
                    savedCount++;
                } catch (Exception e) {
                    // Don't fail the request if file saving fails, but log the error
                    logger.error("❌ FAILED to save log entry to file - username: {}, clientId: {}, error: {}", 
                        logEntry.getUsername() != null ? logEntry.getUsername() : "null",
                        logEntry.getClientId() != null ? logEntry.getClientId() : "null",
                        e.getMessage(), 
                        e);
                }
            }
            
            logger.info("✅ Log batch processing complete - processed: {}, saved: {}", processedCount, savedCount);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("received", logBatch.getLogs().size());
            response.put("timestamp", logBatch.getTimestamp());

            return ResponseEntity.ok(response);

        } catch (org.springframework.http.converter.HttpMessageNotReadableException e) {
            logger.error("❌ JSON parsing error - cannot deserialize log batch. Error: {}", e.getMessage(), e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Invalid JSON format: " + e.getMessage());
            errorResponse.put("hint", "Check that 'data' field is an object, not a primitive value");
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            logger.error("❌ Error processing logs from frontend: {}", e.getMessage(), e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            errorResponse.put("type", e.getClass().getSimpleName());
            return ResponseEntity.status(500).body(errorResponse);
        }
    }

    /**
     * Debug endpoint to get actual log directory path
     */
    @GetMapping("/debug/path")
    public ResponseEntity<Map<String, Object>> getLogPath() {
        Map<String, Object> response = new HashMap<>();
        try {
            String logDir = clientLogService.getLogDirectory();
            Path logPath = Paths.get(logDir);
            
            response.put("success", true);
            response.put("logDirectory", logDir);
            response.put("absolutePath", logPath.toAbsolutePath().toString());
            response.put("exists", Files.exists(logPath));
            response.put("isDirectory", Files.isDirectory(logPath));
            response.put("isWritable", Files.isWritable(logPath));
            response.put("userDir", System.getProperty("user.dir"));
            response.put("javaIoTmpdir", System.getProperty("java.io.tmpdir"));
            
            // List subdirectories and files if exists
            if (Files.exists(logPath) && Files.isDirectory(logPath)) {
                try {
                    List<String> subdirs = Files.list(logPath)
                        .filter(Files::isDirectory)
                        .map(p -> p.getFileName().toString())
                        .collect(java.util.stream.Collectors.toList());
                    response.put("subdirectories", subdirs);
                    
                    // Also list files in each subdirectory
                    Map<String, List<String>> subdirFiles = new HashMap<>();
                    for (String subdir : subdirs) {
                        try {
                            Path subdirPath = logPath.resolve(subdir);
                            List<String> files = Files.list(subdirPath)
                                .filter(Files::isRegularFile)
                                .map(p -> p.getFileName().toString() + " (" + p.toFile().length() + " bytes)")
                                .collect(java.util.stream.Collectors.toList());
                            subdirFiles.put(subdir, files);
                        } catch (Exception e) {
                            subdirFiles.put(subdir, java.util.Arrays.asList("Error: " + e.getMessage()));
                        }
                    }
                    response.put("subdirectoryFiles", subdirFiles);
                } catch (Exception e) {
                    response.put("subdirectoriesError", e.getMessage());
                }
            } else {
                response.put("subdirectories", java.util.Collections.emptyList());
                response.put("note", "Log directory does not exist or is not a directory");
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Test endpoint to verify file writing works
     */
    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> testLogging(@RequestParam(required = false) String username) {
        Map<String, Object> response = new HashMap<>();
        try {
            // Create a test log entry
            LogEntry testEntry = new LogEntry();
            testEntry.setTimestamp(new java.util.Date().toString());
            testEntry.setLevel("INFO");
            testEntry.setMessage("[TEST] Test log entry from /api/logs/test endpoint");
            testEntry.setUsername(username != null ? username : "test@example.com");
            testEntry.setClientId("test-client-" + System.currentTimeMillis());
            testEntry.setUserId("test-user-123");
            
            // Create source info
            LogEntry.SourceInfo source = new LogEntry.SourceInfo();
            source.setFilename("LogController.java");
            source.setLine(150);
            source.setFunction("testLogging");
            testEntry.setSource(source);
            
            // Try to save it
            clientLogService.saveLog(testEntry);
            
            response.put("success", true);
            response.put("message", "Test log entry written successfully");
            response.put("username", testEntry.getUsername());
            response.put("timestamp", testEntry.getTimestamp());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Test logging failed", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Clear log file for a user (called on login to start fresh session)
     * @param username The username (email) of the user
     */
    @PostMapping("/clear")
    public ResponseEntity<Map<String, Object>> clearLogFile(@RequestParam(required = false) String username) {
        logger.info("📥 /api/logs/clear endpoint called with username: {}", username);
        Map<String, Object> response = new HashMap<>();
        try {
            if (username == null || username.isEmpty()) {
                logger.warn("⚠️ /api/logs/clear - Username parameter is missing or empty");
                response.put("success", false);
                response.put("error", "Username parameter is required");
                return ResponseEntity.badRequest().body(response);
            }
            
            logger.info("📥 /api/logs/clear - Calling clientLogService.clearLogFile() for username: {}", username);
            boolean cleared = clientLogService.clearLogFile(username);
            
            if (cleared) {
                response.put("success", true);
                response.put("message", "Log file cleared successfully for user: " + username);
                response.put("username", username);
                logger.info("✅ /api/logs/clear - SUCCESS: Log file cleared for user: {}", username);
            } else {
                response.put("success", false);
                response.put("error", "Failed to clear log file (file may not exist)");
                response.put("username", username);
                logger.warn("⚠️ /api/logs/clear - FAILED: Failed to clear log file for user: {}", username);
            }
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ /api/logs/clear - EXCEPTION: Error clearing log file for user: {} - {}", 
                username, e.getMessage(), e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Get current logging status
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getLoggingStatus() {
        Map<String, Object> response = new HashMap<>();
        try {
            if (clientLogService != null) {
                response.put("success", true);
                response.put("loggingEnabled", clientLogService.isLoggingEnabled());
                if (clientLogService.isLoggingEnabled()) {
                    response.put("logDirectory", clientLogService.getLogDirectory());
                }
            } else {
                response.put("success", false);
                response.put("loggingEnabled", false);
                response.put("error", "ClientLogService not available");
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error getting logging status", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    /**
     * Enable logging
     */
    @PostMapping("/enable")
    public ResponseEntity<Map<String, Object>> enableLogging() {
        Map<String, Object> response = new HashMap<>();
        try {
            if (clientLogService != null) {
                clientLogService.enableLogging();
                response.put("success", true);
                response.put("message", "Logging enabled");
                response.put("loggingEnabled", true);
                logger.info("✅ Logging enabled via API");
            } else {
                response.put("success", false);
                response.put("error", "ClientLogService not available");
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error enabling logging", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    /**
     * Disable logging
     */
    @PostMapping("/disable")
    public ResponseEntity<Map<String, Object>> disableLogging() {
        Map<String, Object> response = new HashMap<>();
        try {
            if (clientLogService != null) {
                clientLogService.disableLogging();
                response.put("success", true);
                response.put("message", "Logging disabled");
                response.put("loggingEnabled", false);
                logger.info("❌ Logging disabled via API");
            } else {
                response.put("success", false);
                response.put("error", "ClientLogService not available");
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error disabling logging", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    /**
     * Toggle logging on/off
     */
    @PostMapping("/toggle")
    public ResponseEntity<Map<String, Object>> toggleLogging() {
        Map<String, Object> response = new HashMap<>();
        try {
            if (clientLogService != null) {
                boolean newState = clientLogService.toggleLogging();
                response.put("success", true);
                response.put("message", "Logging toggled to: " + (newState ? "enabled" : "disabled"));
                response.put("loggingEnabled", newState);
                logger.info("🔄 Logging toggled via API to: {}", newState ? "enabled" : "disabled");
            } else {
                response.put("success", false);
                response.put("error", "ClientLogService not available");
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error toggling logging", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }
    
    /**
     * Set logging state (enable/disable)
     * @param enabled true to enable, false to disable (default: true)
     */
    @PostMapping("/set")
    public ResponseEntity<Map<String, Object>> setLogging(@RequestParam(defaultValue = "true") boolean enabled) {
        Map<String, Object> response = new HashMap<>();
        try {
            if (clientLogService != null) {
                clientLogService.setLoggingEnabled(enabled);
                response.put("success", true);
                response.put("message", "Logging set to: " + (enabled ? "enabled" : "disabled"));
                response.put("loggingEnabled", enabled);
                logger.info("📝 Logging set via API to: {}", enabled ? "enabled" : "disabled");
            } else {
                response.put("success", false);
                response.put("error", "ClientLogService not available");
            }
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error setting logging state", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Test endpoint to manually test clearLogFile functionality
     * Useful for debugging: GET /api/logs/test-clear?username=test@example.com
     */
    @GetMapping("/test-clear")
    public ResponseEntity<Map<String, Object>> testClearLogFile(@RequestParam(required = false) String username) {
        logger.info("🧪 TEST ENDPOINT: /api/logs/test-clear called with username: {}", username);
        Map<String, Object> response = new HashMap<>();
        try {
            if (username == null || username.isEmpty()) {
                response.put("success", false);
                response.put("error", "Username parameter is required");
                response.put("example", "GET /api/logs/test-clear?username=test@example.com");
                return ResponseEntity.badRequest().body(response);
            }
            
            logger.info("🧪 TEST: Calling clearLogFile() for username: {}", username);
            boolean cleared = clientLogService.clearLogFile(username);
            
            response.put("success", cleared);
            response.put("username", username);
            response.put("cleared", cleared);
            response.put("message", cleared ? "Log file cleared successfully" : "Failed to clear log file");
            
            // Also get the log directory info
            try {
                String logDir = clientLogService.getLogDirectory();
                response.put("logDirectory", logDir);
                
                // Check if file exists after clearing
                String folderName = username.replace("@", "_").replace(".", "_").replace(" ", "_");
                java.nio.file.Path baseLogDir = java.nio.file.Paths.get(logDir);
                java.nio.file.Path userLogDir = baseLogDir.resolve(folderName);
                String filename = String.format("%s.txt", folderName);
                java.nio.file.Path logFilePath = userLogDir.resolve(filename);
                
                boolean fileExists = java.nio.file.Files.exists(logFilePath);
                response.put("fileExistsAfterClear", fileExists);
                if (fileExists) {
                    long fileSize = java.nio.file.Files.size(logFilePath);
                    response.put("fileSize", fileSize);
                    response.put("filePath", logFilePath.toAbsolutePath().toString());
                }
            } catch (Exception e) {
                response.put("directoryCheckError", e.getMessage());
            }
            
            logger.info("🧪 TEST: clearLogFile result - success: {}, username: {}", cleared, username);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("🧪 TEST ERROR: Exception in test-clear endpoint", e);
            response.put("success", false);
            response.put("error", e.getMessage());
            response.put("exceptionType", e.getClass().getName());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Health check endpoint for logging service
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "running");
        
        // Safely check if service is available
        try {
            if (clientLogService != null) {
                response.put("fileLoggingEnabled", clientLogService.isLoggingEnabled());
                if (clientLogService.isLoggingEnabled()) {
                    response.put("logDirectory", clientLogService.getLogDirectory());
                }
            } else {
                response.put("fileLoggingEnabled", false);
                response.put("error", "ClientLogService not available");
            }
        } catch (Exception e) {
            logger.warn("Error checking logging service status", e);
            response.put("fileLoggingEnabled", false);
            response.put("error", e.getMessage());
        }
        
        return ResponseEntity.ok(response);
    }
}
