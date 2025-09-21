package com.tutoring.tutor_connect.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
public class StaticWebAppsService {
    
    // Your Azure Front Door CDN URL
    private static final String CDN_BASE_URL = "https://cdnendpoint-axaja4h5fuesg7gj.z03.azurefd.net";
    private static final String UPLOAD_DIR = System.getProperty("java.io.tmpdir") + "/staticwebapps";
    
    @Autowired
    private FileSyncService fileSyncService;
    
    public StaticWebAppsService() {
        System.out.println("=== StaticWebAppsService Constructor ===");
        System.out.println("StaticWebAppsService is being instantiated");
        System.out.println("CDN Base URL: " + CDN_BASE_URL);
        System.out.println("Upload directory: " + UPLOAD_DIR);
    }
    
    public String uploadFile(MultipartFile file) throws IOException {
        System.out.println("=== StaticWebAppsService.uploadFile ===");
        
        // Validate file
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }
        
        // Generate unique filename
        String originalFilename = file.getOriginalFilename();
        String extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        String filename = UUID.randomUUID().toString() + extension;
        
        // Save file temporarily for upload to Blob Storage
        Path tempPath = Paths.get(System.getProperty("java.io.tmpdir") + "/uploads", filename);
        Files.createDirectories(tempPath.getParent());
        Files.copy(file.getInputStream(), tempPath);
        
        System.out.println("File saved temporarily: " + tempPath.toAbsolutePath());
        System.out.println("CDN URL will be: " + CDN_BASE_URL + "/" + filename);
        
        // Upload to Blob Storage asynchronously
        fileSyncService.syncFileToCDN(filename);
        
        // Return the filename
        return filename;
    }
    
    public String getCdnUrl(String filename) {
        return CDN_BASE_URL + "/" + filename;
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
