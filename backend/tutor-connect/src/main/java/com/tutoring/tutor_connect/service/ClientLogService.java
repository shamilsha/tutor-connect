package com.tutoring.tutor_connect.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tutoring.tutor_connect.model.LogEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileWriter;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.locks.ReentrantLock;
import jakarta.annotation.PostConstruct;

/**
 * Service to save client logs to files
 * Logs are saved in JSON format, one entry per line (JSONL format)
 * Files are organized by date: logs/client-logs-YYYY-MM-DD.jsonl
 */
@Service
public class ClientLogService {
    private static final Logger logger = LoggerFactory.getLogger(ClientLogService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final ReentrantLock fileLock = new ReentrantLock();
    
    @Value("${client.logging.directory:logs}")
    private String logDirectory;
    
    @Value("${client.logging.enabled:true}")
    private boolean initialLoggingEnabled;
    
    // Runtime flag to enable/disable logging (can be toggled via API)
    private volatile boolean loggingEnabled;
    
    @Value("${client.logging.max-file-size-mb:100}")
    private long maxFileSizeMB;
    
    /**
     * Initialize logging enabled state from configuration
     */
    @PostConstruct
    public void init() {
        loggingEnabled = initialLoggingEnabled;
        logger.info("📝 Client logging initialized - enabled: {}", loggingEnabled);
    }
    
    /**
     * Save a log entry to file
     * Files are organized by username: logs/{username}/{username}.txt
     * Format: logs/upmbook_yahoo_com/upmbook_yahoo_com.txt (username sanitized: @ -> _)
     * Falls back to clientId if username not available, then "unknown"
     * @param logEntry The log entry to save
     */
    public void saveLog(LogEntry logEntry) {
        if (!loggingEnabled) {
            logger.warn("⚠️ Logging is DISABLED - not saving log entry");
            return;
        }
        
        logger.info("📝 saveLog called - username: {}, clientId: {}, message: {}", 
            logEntry.getUsername() != null ? logEntry.getUsername() : "null",
            logEntry.getClientId() != null ? logEntry.getClientId() : "null",
            logEntry.getMessage() != null ? logEntry.getMessage().substring(0, Math.min(50, logEntry.getMessage().length())) : "null");
        
        fileLock.lock();
        File logFile = null;
        try {
            // Create base log directory if it doesn't exist
            Path baseLogDir = Paths.get(logDirectory);
            if (!Files.exists(baseLogDir)) {
                Files.createDirectories(baseLogDir);
                logger.info("Created base log directory: {}", baseLogDir.toAbsolutePath());
            }
            
            // Get username for folder name (preferred), fallback to clientId, then "unknown"
            String folderName = null;
            String originalUsername = null;
            
            if (logEntry.getUsername() != null && !logEntry.getUsername().isEmpty()) {
                originalUsername = logEntry.getUsername();
                // Sanitize folder name: replace @ and . with _ for filesystem safety
                // Format: logs/upmbook_yahoo_com/upmbook_yahoo_com.txt
                folderName = originalUsername.replace("@", "_").replace(".", "_").replace(" ", "_");
                logger.debug("Sanitized folder name: {} -> {}", originalUsername, folderName);
            } else if (logEntry.getClientId() != null && !logEntry.getClientId().isEmpty()) {
                // Fallback to clientId if username not available
                folderName = "client-" + logEntry.getClientId();
                logger.warn("Username not available for log entry, using clientId: {}", logEntry.getClientId());
            } else {
                folderName = "unknown";
                logger.warn("Neither username nor clientId available for log entry");
            }
            
            // Create user-specific directory under logs folder
            Path userLogDir = baseLogDir.resolve(folderName);
            boolean isNewDirectory = false;
            try {
                if (!Files.exists(userLogDir)) {
                    Files.createDirectories(userLogDir);
                    isNewDirectory = true;
                    logger.info("✅ Created NEW user log directory: {} (username: {})", 
                        userLogDir.toAbsolutePath(), 
                        originalUsername != null ? originalUsername : "N/A");
                } else {
                    logger.debug("📁 Using existing user log directory: {} (username: {})", 
                        userLogDir.toAbsolutePath(), 
                        originalUsername != null ? originalUsername : "N/A");
                }
                
                // Verify directory was actually created and is writable
                if (!Files.exists(userLogDir)) {
                    throw new IOException("Failed to create user log directory: " + userLogDir.toAbsolutePath());
                }
                if (!Files.isDirectory(userLogDir)) {
                    throw new IOException("Path exists but is not a directory: " + userLogDir.toAbsolutePath());
                }
                if (!Files.isWritable(userLogDir)) {
                    throw new IOException("Directory is not writable: " + userLogDir.toAbsolutePath());
                }
                logger.debug("✅ Verified user log directory exists and is writable: {}", userLogDir.toAbsolutePath());
            } catch (IOException dirException) {
                logger.error("❌ ERROR creating/verifying user log directory: {} - {}", 
                    userLogDir.toAbsolutePath(), dirException.getMessage(), dirException);
                throw dirException;
            }
            
            // Use the same sanitized folder name for the filename
            // Format: logs/upmbook_yahoo_com/upmbook_yahoo_com.txt
            String filename = String.format("%s.txt", folderName);
            logFile = userLogDir.resolve(filename).toFile();
            Path logFilePath = logFile.toPath();
            
            // If it's a new directory but file somehow exists, delete it (shouldn't happen, but be safe)
            boolean fileExisted = Files.exists(logFilePath);
            if (isNewDirectory && fileExisted) {
                try {
                    Files.delete(logFilePath);
                    logger.info("🗑️ Deleted existing log file for new directory (username: {}) - {}", 
                        originalUsername != null ? originalUsername : "N/A",
                        logFile.getAbsolutePath());
                    fileExisted = false;
                } catch (Exception deleteException) {
                    logger.error("❌ ERROR deleting existing log file for new directory: {} - {}", 
                        logFile.getAbsolutePath(), deleteException.getMessage(), deleteException);
                }
            }
            
            // ALWAYS create file if it doesn't exist (safeguard - in case clearLogFile wasn't called or failed)
            if (!Files.exists(logFilePath)) {
                try {
                    logger.info("📄 File does not exist, creating it now (username: {})", 
                        originalUsername != null ? originalUsername : "N/A");
                    
                    // Create new log file with a header line
                    String headerLine = String.format("{\"timestamp\":\"%s\",\"level\":\"INFO\",\"message\":\"Log file created for user: %s\",\"username\":\"%s\"}%n",
                        java.time.Instant.now().toString(),
                        originalUsername != null ? originalUsername : "unknown",
                        originalUsername != null ? originalUsername : "unknown");
                    
                    Files.write(logFilePath, 
                        headerLine.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        StandardOpenOption.CREATE,
                        StandardOpenOption.WRITE);
                    
                    // Force sync to disk
                    try (FileOutputStream fos = new FileOutputStream(logFile, false)) {
                        fos.getFD().sync();
                    }
                    
                    // Verify file was created
                    boolean fileCreated = Files.exists(logFilePath);
                    long fileSize = fileCreated ? Files.size(logFilePath) : 0;
                    
                    if (fileCreated && fileSize > 0) {
                        logger.info("✅ SUCCESSFULLY created log file in saveLog(): {} (size: {} bytes, username: {})", 
                            logFile.getAbsolutePath(), fileSize, originalUsername != null ? originalUsername : "N/A");
                    } else {
                        logger.error("❌ FAILED to create log file in saveLog(): {} (exists: {}, size: {} bytes)", 
                            logFile.getAbsolutePath(), fileCreated, fileSize);
                    }
                } catch (Exception createException) {
                    logger.error("❌ ERROR creating log file in saveLog(): {} - {}", 
                        logFile.getAbsolutePath(), createException.getMessage(), createException);
                    // Don't throw - continue to try writing the actual log entry
                }
            } else {
                logger.debug("📄 File already exists, will append to it: {}", logFilePath.toAbsolutePath());
            }
            
            // Ensure parent directory exists (double-check)
            File parentDir = logFile.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                logger.warn("⚠️ Parent directory does not exist, attempting to create: {}", parentDir.getAbsolutePath());
                if (!parentDir.mkdirs()) {
                    throw new IOException("Failed to create parent directory: " + parentDir.getAbsolutePath());
                }
            }
            
            // Check file size and rotate if needed
            if (logFile.exists() && logFile.length() > maxFileSizeMB * 1024 * 1024) {
                rotateLogFile(logFile, folderName);
                logFile = userLogDir.resolve(filename).toFile();
            }
            
            // Append log entry as JSON line
            logger.info("📄 About to write to file: {} (exists: {}, writable: {}, parent exists: {}, parent writable: {})", 
                logFile.getAbsolutePath(),
                logFile.exists(),
                logFile.canWrite(),
                parentDir != null ? parentDir.exists() : false,
                parentDir != null ? parentDir.canWrite() : false);
            
            // Use Files.write for atomic write operations with better error handling
            String jsonLine = objectMapper.writeValueAsString(logEntry);
            long fileSizeBefore = logFile.exists() ? logFile.length() : 0;
            
            try {
                // Use Files.write with append option for better reliability
                // logFilePath is already defined above, reuse it
                String lineToWrite = jsonLine + System.lineSeparator();
                
                // Write using Files API which is more reliable
                Files.write(logFilePath, 
                    lineToWrite.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND,
                    StandardOpenOption.WRITE);
                
                // Force sync to disk using FileDescriptor
                try (FileOutputStream fos = new FileOutputStream(logFile, true)) {
                    fos.getFD().sync();
                }
                
                // Verify file was written
                boolean fileExistsAfter = Files.exists(logFilePath);
                long actualFileSize = fileExistsAfter ? Files.size(logFilePath) : 0;
                
                logger.info("✅ SUCCESSFULLY wrote log entry to: {} (username: {}, clientId: {}, entry size: {} bytes, size before: {} bytes, size after: {} bytes, file exists: {})", 
                    logFile.getAbsolutePath(),
                    logEntry.getUsername() != null ? logEntry.getUsername() : "N/A",
                    logEntry.getClientId() != null ? logEntry.getClientId() : "N/A",
                    jsonLine.length(),
                    fileSizeBefore,
                    actualFileSize,
                    fileExistsAfter);
                
                // Additional verification - check if file is readable and has content
                if (fileExistsAfter) {
                    if (actualFileSize > 0) {
                        logger.debug("✅ File verification - Path: {}, Size: {} bytes, Readable: {}, Writable: {}", 
                            logFile.getAbsolutePath(),
                            actualFileSize,
                            Files.isReadable(logFilePath),
                            Files.isWritable(logFilePath));
                        
                        // List all files in the directory to verify
                        try {
                            java.util.List<Path> filesInDir = Files.list(userLogDir)
                                .filter(Files::isRegularFile)
                                .collect(java.util.stream.Collectors.toList());
                            logger.info("📂 Files in directory {}: {}", userLogDir, filesInDir.stream()
                                .map(p -> p.getFileName().toString() + " (" + p.toFile().length() + " bytes)")
                                .collect(java.util.stream.Collectors.joining(", ")));
                        } catch (Exception listException) {
                            logger.warn("Could not list files in directory: {}", listException.getMessage());
                        }
                    } else {
                        logger.warn("⚠️ File exists but has 0 bytes! Path: {}", logFile.getAbsolutePath());
                    }
                } else {
                    logger.error("❌ CRITICAL: File was written but does not exist! Path: {}", logFile.getAbsolutePath());
                    // Try to list what's actually in the directory
                    try {
                        java.util.List<Path> filesInDir = Files.list(userLogDir)
                            .filter(Files::isRegularFile)
                            .collect(java.util.stream.Collectors.toList());
                        logger.error("❌ Directory contents: {} files found: {}", filesInDir.size(), filesInDir);
                    } catch (Exception e) {
                        logger.error("❌ Could not list directory contents: {}", e.getMessage());
                    }
                }
            } catch (Exception writeException) {
                logger.error("❌ ERROR writing to file: {} - {}", logFile.getAbsolutePath(), writeException.getMessage(), writeException);
                throw writeException; // Re-throw to be caught by outer catch
            }
            
        } catch (IOException e) {
            String filePath = logFile != null ? logFile.getAbsolutePath() : "unknown";
            String folderPath = logFile != null && logFile.getParentFile() != null ? 
                logFile.getParentFile().getAbsolutePath() : "unknown";
            logger.error("❌ IOException saving client log to file: {} - Error: {}", filePath, e.getMessage(), e);
            logger.error("❌ File path details - File: {}, Parent: {}, Parent exists: {}, Parent writable: {}", 
                filePath,
                folderPath,
                logFile != null && logFile.getParentFile() != null ? logFile.getParentFile().exists() : false,
                logFile != null && logFile.getParentFile() != null ? logFile.getParentFile().canWrite() : false);
            logger.error("❌ Full exception stack trace:", e);
        } catch (Exception e) {
            String filePath = logFile != null ? logFile.getAbsolutePath() : "unknown";
            logger.error("❌ Unexpected exception saving client log to file: {} - Error: {}", filePath, e.getMessage(), e);
            logger.error("❌ Stack trace:", e);
        } finally {
            fileLock.unlock();
        }
    }
    
    /**
     * Rotate log file when it exceeds max size
     */
    private void rotateLogFile(File logFile, String folderName) {
        try {
            String baseName = logFile.getName().replace(".txt", "");
            int counter = 1;
            File rotatedFile;
            
            do {
                String rotatedName = String.format("%s-%d.txt", baseName, counter);
                rotatedFile = logFile.getParentFile().toPath().resolve(rotatedName).toFile();
                counter++;
            } while (rotatedFile.exists() && counter < 1000);
            
            if (logFile.renameTo(rotatedFile)) {
                logger.info("Rotated log file: {} -> {}", logFile.getName(), rotatedFile.getName());
            } else {
                logger.warn("Failed to rotate log file: {}", logFile.getName());
            }
        } catch (Exception e) {
            logger.error("Error rotating log file", e);
        }
    }
    
    /**
     * Get the log directory path
     */
    public String getLogDirectory() {
        return Paths.get(logDirectory).toAbsolutePath().toString();
    }
    
    /**
     * Check if logging is enabled
     */
    public boolean isLoggingEnabled() {
        return loggingEnabled;
    }
    
    /**
     * Enable logging
     */
    public void enableLogging() {
        loggingEnabled = true;
        logger.info("✅ Client logging ENABLED");
    }
    
    /**
     * Disable logging
     */
    public void disableLogging() {
        loggingEnabled = false;
        logger.info("❌ Client logging DISABLED");
    }
    
    /**
     * Toggle logging on/off
     * @return the new state (true if enabled, false if disabled)
     */
    public boolean toggleLogging() {
        loggingEnabled = !loggingEnabled;
        logger.info("🔄 Client logging toggled to: {}", loggingEnabled ? "ENABLED" : "DISABLED");
        return loggingEnabled;
    }
    
    /**
     * Set logging enabled state
     * @param enabled true to enable, false to disable
     */
    public void setLoggingEnabled(boolean enabled) {
        loggingEnabled = enabled;
        logger.info("📝 Client logging set to: {}", enabled ? "ENABLED" : "DISABLED");
    }
    
    /**
     * Clear/truncate the log file for a user (called on login to start fresh session)
     * Immediately deletes the file if it exists and creates a new one
     * @param username The username (email) of the user
     * @return true if file was cleared and new file created, false if error occurred
     */
    public boolean clearLogFile(String username) {
        logger.info("🔍 clearLogFile() CALLED with username: {}", username);
        
        if (!loggingEnabled) {
            logger.warn("⚠️ Logging is DISABLED - cannot clear log file");
            return false;
        }
        
        if (username == null || username.isEmpty()) {
            logger.warn("⚠️ Cannot clear log file - username is null or empty");
            return false;
        }
        
        fileLock.lock();
        try {
            logger.info("🔍 clearLogFile() - Acquired file lock, starting file operations");
            
            // Create base log directory if it doesn't exist
            Path baseLogDir = Paths.get(logDirectory);
            logger.info("🔍 clearLogFile() - Base log directory: {} (absolute: {})", 
                logDirectory, baseLogDir.toAbsolutePath());
            
            if (!Files.exists(baseLogDir)) {
                Files.createDirectories(baseLogDir);
                logger.info("✅ Created base log directory: {}", baseLogDir.toAbsolutePath());
            } else {
                logger.info("✅ Base log directory already exists: {}", baseLogDir.toAbsolutePath());
            }
            
            String folderName = username.replace("@", "_").replace(".", "_").replace(" ", "_");
            logger.info("🔍 clearLogFile() - Sanitized folder name: {} -> {}", username, folderName);
            
            Path userLogDir = baseLogDir.resolve(folderName);
            logger.info("🔍 clearLogFile() - User log directory path: {} (absolute: {})", 
                userLogDir, userLogDir.toAbsolutePath());
            
            // Create user-specific directory if it doesn't exist
            boolean userDirExisted = Files.exists(userLogDir);
            if (!userDirExisted) {
                Files.createDirectories(userLogDir);
                logger.info("✅ Created user log directory: {} (username: {})", 
                    userLogDir.toAbsolutePath(), username);
            } else {
                logger.info("✅ User log directory already exists: {} (username: {})", 
                    userLogDir.toAbsolutePath(), username);
            }
            
            String filename = String.format("%s.txt", folderName);
            File logFile = userLogDir.resolve(filename).toFile();
            Path logFilePath = logFile.toPath();
            
            logger.info("🔍 clearLogFile() - Checking for log file: {} (absolute: {})", 
                logFile.getAbsolutePath(), logFilePath.toAbsolutePath());
            
            // Delete existing file if it exists
            boolean fileExisted = Files.exists(logFilePath);
            logger.info("🔍 clearLogFile() - File exists check result: {} (path: {})", 
                fileExisted, logFilePath.toAbsolutePath());
            
            if (fileExisted) {
                long fileSizeBefore = Files.size(logFilePath);
                logger.info("🔍 clearLogFile() - File EXISTS! Size: {} bytes, attempting to delete: {}", 
                    fileSizeBefore, logFilePath.toAbsolutePath());
                
                try {
                    Files.delete(logFilePath);
                    logger.info("🗑️ SUCCESSFULLY DELETED existing log file on login: {} (size was: {} bytes, username: {})", 
                        logFile.getAbsolutePath(), fileSizeBefore, username);
                    
                    // Verify deletion
                    boolean stillExists = Files.exists(logFilePath);
                    if (stillExists) {
                        logger.error("❌ CRITICAL: File still exists after deletion attempt! Path: {}", 
                            logFilePath.toAbsolutePath());
                    } else {
                        logger.info("✅ Verified file deletion - file no longer exists");
                    }
                } catch (Exception deleteException) {
                    logger.error("❌ ERROR during file deletion: {} - {}", 
                        logFilePath.toAbsolutePath(), deleteException.getMessage(), deleteException);
                    throw deleteException; // Re-throw to be caught by outer catch
                }
            } else {
                logger.info("📄 clearLogFile() - File does NOT exist (will create new file): {}", 
                    logFilePath.toAbsolutePath());
            }
            
            // Create new log file with a header line
            logger.info("🔍 clearLogFile() - Creating new log file with header line");
            String headerLine = String.format("{\"timestamp\":\"%s\",\"level\":\"INFO\",\"message\":\"Log file created for user: %s (login session started)\",\"username\":\"%s\"}%n",
                java.time.Instant.now().toString(),
                username,
                username);
            
            logger.info("🔍 clearLogFile() - Writing header line ({} bytes) to: {}", 
                headerLine.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                logFilePath.toAbsolutePath());
            
            Files.write(logFilePath, 
                headerLine.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE);
            
            logger.info("🔍 clearLogFile() - File written, forcing sync to disk");
            
            // Force sync to disk
            try (FileOutputStream fos = new FileOutputStream(logFile, false)) {
                fos.getFD().sync();
            }
            
            logger.info("🔍 clearLogFile() - Sync complete, verifying file creation");
            
            // Verify file was created
            boolean fileCreated = Files.exists(logFilePath);
            long fileSize = fileCreated ? Files.size(logFilePath) : 0;
            
            logger.info("🔍 clearLogFile() - Verification: exists={}, size={} bytes", fileCreated, fileSize);
            
            if (fileCreated && fileSize > 0) {
                logger.info("✅ SUCCESS: Created new log file on login: {} (size: {} bytes, username: {})", 
                    logFile.getAbsolutePath(), fileSize, username);
                return true;
            } else {
                logger.error("❌ FAILED to create new log file on login: {} (exists: {}, size: {} bytes, username: {})", 
                    logFile.getAbsolutePath(), fileCreated, fileSize, username);
                return false;
            }
        } catch (Exception e) {
            logger.error("❌ ERROR clearing/creating log file on login: {} - {} (stack trace follows)", 
                username, e.getMessage(), e);
            return false;
        } finally {
            fileLock.unlock();
            logger.info("🔍 clearLogFile() - Released file lock");
        }
    }
}
