package com.tutoring.tutor_connect.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.tutoring.tutor_connect.model.User;
import com.tutoring.tutor_connect.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private static final Logger logger = LoggerFactory.getLogger(UserController.class);

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        logger.info("Health check requested");
        return ResponseEntity.ok("Backend is running!");
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody User user) {
        try {
            logger.info("Received signup request for email: {}", user.getEmail());
            
            // Check if email already exists
            if (userRepository.existsByEmail(user.getEmail())) {
                logger.warn("Email already exists: {}", user.getEmail());
                return ResponseEntity.badRequest().body("Email already exists");
            }

            // Save the user
            User savedUser = userRepository.save(user);
            logger.info("User successfully registered with email: {}", savedUser.getEmail());
            return ResponseEntity.ok(savedUser);
        } catch (Exception e) {
            logger.error("Signup failed for email: " + user.getEmail(), e);
            return ResponseEntity.badRequest().body("Signup failed: " + e.getMessage());
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest) {
        try {
            logger.info("Received login request for email: {}", loginRequest.getEmail());
            
            // Find user by email
            User user = userRepository.findByEmail(loginRequest.getEmail())
                .orElse(null);

            // Check if user exists first
            if (user == null) {
                logger.warn("Login failed - User does not exist: {}", loginRequest.getEmail());
                return ResponseEntity.badRequest().body("User does not exist");
            }
            
            // Check if password matches
            if (!user.getPassword().equals(loginRequest.getPassword())) {
                logger.warn("Login failed - Password incorrect for email: {}", loginRequest.getEmail());
                return ResponseEntity.badRequest().body("Password incorrect");
            }
            
            // Login successful
            logger.info("Login successful for email: {}", loginRequest.getEmail());
            return ResponseEntity.ok(user);
            
        } catch (Exception e) {
            logger.error("Login failed for email: " + loginRequest.getEmail(), e);
            return ResponseEntity.badRequest().body("Login failed: " + e.getMessage());
        }
    }
}

class LoginRequest {
    private String email;
    private String password;

    // Getters and setters
    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
} 