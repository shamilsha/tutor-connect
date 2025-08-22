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

            // Check if user exists and password matches
            if (user != null && user.getPassword().equals(loginRequest.getPassword())) {
                logger.info("Login successful for email: {}", loginRequest.getEmail());
                return ResponseEntity.ok(user);
            } else {
                logger.warn("Login failed for email: {}", loginRequest.getEmail());
                return ResponseEntity.badRequest().body("Invalid email or password");
            }
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