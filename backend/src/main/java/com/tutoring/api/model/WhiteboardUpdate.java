package com.tutoring.api.model;

public class WhiteboardUpdate {
    private String userId;
    private String username;
    private String action; // "draw", "erase", "clear"
    private Object shape;
    private Object position;
    private String color;

    // Getters and Setters
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public Object getShape() { return shape; }
    public void setShape(Object shape) { this.shape = shape; }

    public Object getPosition() { return position; }
    public void setPosition(Object position) { this.position = position; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
} 