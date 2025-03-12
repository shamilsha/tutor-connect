package com.tutoring.api.controller;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@RestController
@RequestMapping("/api/files")
@CrossOrigin(origins = "http://localhost:3000")
public class FileController {
    private final Path uploadDir = Paths.get("uploads");

    @PostMapping("/upload")
    public ResponseEntity<String> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            if (!Files.exists(uploadDir)) {
                Files.createDirectories(uploadDir);
            }
            
            // Add logging
            System.out.println("Uploading file: " + file.getOriginalFilename());
            System.out.println("File type: " + file.getContentType());
            System.out.println("File size: " + file.getSize());
            
            String filename = UUID.randomUUID() + "-" + file.getOriginalFilename();
            Path filePath = uploadDir.resolve(filename);
            
            // Check if file already exists
            if (Files.exists(filePath)) {
                Files.delete(filePath);
            }
            
            Files.copy(file.getInputStream(), filePath);
            System.out.println("File saved to: " + filePath);
            
            return ResponseEntity.ok(filename);
        } catch (IOException e) {
            // Log the error
            System.err.println("Error uploading file: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/{filename}")
    public ResponseEntity<Resource> getFile(@PathVariable String filename) {
        try {
            Path file = uploadDir.resolve(filename);
            Resource resource = new UrlResource(file.toUri());
            
            // Determine content type based on file extension
            String contentType = "application/pdf";
            if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) {
                contentType = "image/jpeg";
            } else if (filename.toLowerCase().endsWith(".png")) {
                contentType = "image/png";
            }
            
            return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))  // Set correct content type
                .body(resource);
        } catch (IOException e) {
            return ResponseEntity.notFound().build();
        }
    }
} 