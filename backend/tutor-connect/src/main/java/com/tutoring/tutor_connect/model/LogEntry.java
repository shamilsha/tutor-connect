package com.tutoring.tutor_connect.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Model class for log entries received from frontend
 */
public class LogEntry {
    private String timestamp;
    private String level;
    private String message;
    
    @JsonDeserialize(using = FlexibleDataDeserializer.class)
    private Map<String, Object> data;
    private SourceInfo source;
    private String userAgent;
    private String url;
    private String clientId;  // Unique identifier for this client session
    private String userId;   // User ID if logged in (optional)
    private String username; // Username (email) if logged in (optional)

    // Getters and Setters
    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public String getLevel() {
        return level;
    }

    public void setLevel(String level) {
        this.level = level;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Map<String, Object> getData() {
        return data;
    }

    public void setData(Map<String, Object> data) {
        this.data = data;
    }

    public SourceInfo getSource() {
        return source;
    }

    public void setSource(SourceInfo source) {
        this.source = source;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    /**
     * Custom deserializer for data field - accepts both objects and primitives
     */
    public static class FlexibleDataDeserializer extends JsonDeserializer<Map<String, Object>> {
        @Override
        public Map<String, Object> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            if (p.getCurrentToken().isStructStart()) {
                // It's an object/map - deserialize normally
                return p.getCodec().readValue(p, Map.class);
            } else {
                // It's a primitive (string, number, boolean, null) - wrap it in a map
                Map<String, Object> result = new HashMap<>();
                Object value = p.getCodec().readValue(p, Object.class);
                result.put("value", value);
                return result;
            }
        }
    }

    /**
     * Inner class for source information
     */
    public static class SourceInfo {
        private String filename;
        
        @JsonProperty("fullPath")
        private String fullPath;
        
        private int line;
        private int column;
        
        @JsonProperty("function")
        private String function;

        // Getters and Setters
        public String getFilename() {
            return filename;
        }

        public void setFilename(String filename) {
            this.filename = filename;
        }

        public String getFullPath() {
            return fullPath;
        }

        public void setFullPath(String fullPath) {
            this.fullPath = fullPath;
        }

        public int getLine() {
            return line;
        }

        public void setLine(int line) {
            this.line = line;
        }

        public int getColumn() {
            return column;
        }

        public void setColumn(int column) {
            this.column = column;
        }

        public String getFunction() {
            return function;
        }

        public void setFunction(String function) {
            this.function = function;
        }
    }
}
