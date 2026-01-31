package com.tutoring.tutor_connect.model;

import java.util.List;

/**
 * Model class for batch log entries received from frontend
 */
public class LogBatch {
    private List<LogEntry> logs;
    private String timestamp;

    // Getters and Setters
    public List<LogEntry> getLogs() {
        return logs;
    }

    public void setLogs(List<LogEntry> logs) {
        this.logs = logs;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }
}
