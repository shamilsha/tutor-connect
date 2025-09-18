package com.tutoring.tutor_connect.service;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
public class FileUploadService {
    
    private static final String UPLOAD_DIR = System.getProperty("java.io.tmpdir") + "/uploads";
    
    public FileUploadService() {
        System.out.println("=== FileUploadService Constructor ===");
        System.out.println("FileUploadService is being instantiated");
        System.out.println("Upload directory: " + UPLOAD_DIR);
        System.out.println("Temp directory: " + System.getProperty("java.io.tmpdir"));
    }
    
    public String uploadFile(MultipartFile file) throws IOException {
        System.out.println("=== FileUploadService.uploadFile ===");
        System.out.println("Upload directory: " + UPLOAD_DIR);
        
        // Validate file
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }
        
        // Create upload directory if it doesn't exist
        Path uploadPath = Paths.get(UPLOAD_DIR);
        System.out.println("Upload path: " + uploadPath.toAbsolutePath());
        
        if (!Files.exists(uploadPath)) {
            System.out.println("Creating directory: " + uploadPath);
            Files.createDirectories(uploadPath);
        }
        
        System.out.println("Directory exists: " + Files.exists(uploadPath));
        System.out.println("Directory writable: " + Files.isWritable(uploadPath));
        
        // Generate unique filename
        String originalFilename = file.getOriginalFilename();
        String extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        String filename = UUID.randomUUID().toString() + extension;
        
        // Save file
        Path filePath = uploadPath.resolve(filename);
        Files.copy(file.getInputStream(), filePath);
        
        // Return the filename (not full path for security)
        return filename;
    }
    
    public byte[] downloadFile(String filename) throws IOException {
        Path filePath = Paths.get(UPLOAD_DIR, filename);
        if (!Files.exists(filePath)) {
            throw new IllegalArgumentException("File not found");
        }
        return Files.readAllBytes(filePath);
    }
    
    public void deleteFile(String filename) throws IOException {
        Path filePath = Paths.get(UPLOAD_DIR, filename);
        if (Files.exists(filePath)) {
            Files.delete(filePath);
        }
    }
}
