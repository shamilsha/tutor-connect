package com.tutoring.tutor_connect.controller;

import com.tutoring.tutor_connect.service.FileUploadService;
import com.tutoring.tutor_connect.service.StaticWebAppsService;
import com.tutoring.tutor_connect.service.FileSyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
public class FileController {
    
    public FileController() {
        System.out.println("=== FileController Constructor ===");
        System.out.println("FileController is being instantiated");
    }
    
    @Autowired
    private FileUploadService fileUploadService;
    
    @Autowired
    private StaticWebAppsService staticWebAppsService;
    
    @Autowired
    private FileSyncService fileSyncService;
    
    @GetMapping("/test")
    public ResponseEntity<String> test() {
        System.out.println("=== FileController.test ===");
        System.out.println("FileController test endpoint called");
        return ResponseEntity.ok("FileController test endpoint works!");
    }
    
    @GetMapping("/health")
    public ResponseEntity<?> healthCheck() {
        System.out.println("=== FileController.healthCheck ===");
        System.out.println("FileController health endpoint called");
        System.out.println("CORS headers should be set");
        System.out.println("Returning success response");
        return ResponseEntity.ok("File upload service is running");
    }
    
    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            System.out.println("=== FileController.uploadFile ===");
            System.out.println("File upload requested: " + file.getOriginalFilename());
            
            // Validate file
            if (file.isEmpty()) {
                return ResponseEntity.badRequest().body("File is empty");
            }
            
            // Check file size (max 50MB for PDFs, 10MB for images)
            String contentType = file.getContentType();
            long maxSize = (contentType != null && contentType.equals("application/pdf")) ? 
                50 * 1024 * 1024 : 10 * 1024 * 1024;
            
            if (file.getSize() > maxSize) {
                return ResponseEntity.badRequest().body("File too large (max " + 
                    (maxSize / (1024 * 1024)) + "MB)");
            }
            
            // Check file type (images and PDFs allowed)
            if (contentType == null || 
                (!contentType.startsWith("image/") && !contentType.equals("application/pdf"))) {
                return ResponseEntity.badRequest().body("Only image and PDF files are allowed");
            }
            
            // Upload file
            String filename = fileUploadService.uploadFile(file);
            
            // Sync file to CDN
            fileSyncService.syncFileToCDN(filename);
            
            // Get CDN URL from StaticWebAppsService
            String cdnUrl = staticWebAppsService.getCdnUrl(filename);
            
            // Return response
            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("filename", filename);
            response.put("url", cdnUrl);
            response.put("originalName", file.getOriginalFilename());
            response.put("size", file.getSize());
            
            return ResponseEntity.ok(response);
            
        } catch (IOException e) {
            System.out.println("Upload failed: " + e.getMessage());
            return ResponseEntity.status(500).body("Upload failed: " + e.getMessage());
        } catch (Exception e) {
            System.out.println("Upload failed: " + e.getMessage());
            return ResponseEntity.status(500).body("Upload failed: " + e.getMessage());
        }
    }
    
    @GetMapping("/download/{filename}")
    public ResponseEntity<byte[]> downloadFile(@PathVariable String filename) {
        try {
            System.out.println("=== FileController.downloadFile ===");
            System.out.println("Download requested for: " + filename);
            
            byte[] fileContent = fileUploadService.downloadFile(filename);
            
            // Determine content type based on file extension
            String contentType = "application/octet-stream";
            if (filename.toLowerCase().endsWith(".png")) {
                contentType = "image/png";
            } else if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) {
                contentType = "image/jpeg";
            } else if (filename.toLowerCase().endsWith(".gif")) {
                contentType = "image/gif";
            } else if (filename.toLowerCase().endsWith(".pdf")) {
                contentType = "application/pdf";
            }
            
            return ResponseEntity.ok()
                    .header("Content-Type", contentType)
                    .header("Content-Disposition", "inline; filename=\"" + filename + "\"")
                    .body(fileContent);
                    
        } catch (IllegalArgumentException e) {
            System.out.println("Download failed - File not found: " + e.getMessage());
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            System.out.println("Download failed - IO error: " + e.getMessage());
            return ResponseEntity.status(500).body(null);
        } catch (Exception e) {
            System.out.println("Download failed - Unexpected error: " + e.getMessage());
            return ResponseEntity.status(500).body(null);
        }
    }
    
    @GetMapping("/proxy/{filename}")
    public ResponseEntity<byte[]> proxyFile(@PathVariable String filename) {
        try {
            System.out.println("=== FileController.proxyFile ===");
            System.out.println("Proxy requested for: " + filename);
            
            // Get CDN URL
            String cdnUrl = staticWebAppsService.getCdnUrl(filename);
            System.out.println("Fetching from CDN: " + cdnUrl);
            
            // Fetch file from CDN
            java.net.URL url = new java.net.URL(cdnUrl);
            java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(30000);
            
            int responseCode = connection.getResponseCode();
            if (responseCode != 200) {
                System.out.println("CDN fetch failed with code: " + responseCode);
                return ResponseEntity.notFound().build();
            }
            
            // Read file content
            java.io.InputStream inputStream = connection.getInputStream();
            byte[] fileContent = inputStream.readAllBytes();
            inputStream.close();
            
            // Determine content type based on file extension
            String contentType = "application/octet-stream";
            if (filename.toLowerCase().endsWith(".png")) {
                contentType = "image/png";
            } else if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) {
                contentType = "image/jpeg";
            } else if (filename.toLowerCase().endsWith(".gif")) {
                contentType = "image/gif";
            } else if (filename.toLowerCase().endsWith(".pdf")) {
                contentType = "application/pdf";
            }
            
            System.out.println("Proxy successful, content type: " + contentType + ", size: " + fileContent.length);
            
            return ResponseEntity.ok()
                    .header("Content-Type", contentType)
                    .header("Content-Disposition", "inline; filename=\"" + filename + "\"")
                    .header("Cache-Control", "public, max-age=3600")
                    .body(fileContent);
                    
        } catch (Exception e) {
            System.out.println("Proxy failed: " + e.getMessage());
            return ResponseEntity.status(500).body(null);
        }
    }
}