package com.tutoring.tutor_connect.service;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.concurrent.CompletableFuture;

@Service
public class FileSyncService {
    
    private static final String CDN_BASE_URL = "https://cdnendpoint-axaja4h5fuesg7gj.z03.azurefd.net";
    private static final String STORAGE_ACCOUNT_NAME = "tutorcancenstorage";
    private static final String CONTAINER_NAME = "whiteboard-images";
    
    public FileSyncService() {
        System.out.println("=== FileSyncService Constructor ===");
        System.out.println("FileSyncService is being instantiated");
        System.out.println("CDN Base URL: " + CDN_BASE_URL);
        System.out.println("Storage Account: " + STORAGE_ACCOUNT_NAME);
        System.out.println("Container: " + CONTAINER_NAME);
    }
    
    @Async
    public CompletableFuture<Void> syncFileToCDN(String filename) {
        System.out.println("=== FileSyncService.syncFileToCDN ===");
        System.out.println("Uploading file to Azure Blob Storage: " + filename);
        
        try {
            // Get the uploaded file from the backend storage
            Path sourcePath = Paths.get(System.getProperty("java.io.tmpdir") + "/uploads", filename);
            
            if (Files.exists(sourcePath)) {
                // Upload directly to Azure Blob Storage
                uploadToBlobStorage(sourcePath, filename);
                
                System.out.println("✅ File uploaded to Azure Blob Storage: " + filename);
                System.out.println("🌐 CDN URL: " + CDN_BASE_URL + "/" + filename);
                System.out.println("📁 File is now available via CDN");
                
            } else {
                System.out.println("❌ Source file not found: " + sourcePath);
            }
            
        } catch (Exception e) {
            System.out.println("❌ Failed to upload file to Blob Storage: " + e.getMessage());
        }
        
        return CompletableFuture.completedFuture(null);
    }
    
    private void uploadToBlobStorage(Path sourcePath, String filename) {
        try {
            // Get connection string from environment variable
            String connectionString = System.getenv("AZURE_STORAGE_CONNECTION_STRING");
            if (connectionString == null || connectionString.isEmpty()) {
                System.out.println("❌ AZURE_STORAGE_CONNECTION_STRING environment variable not set");
                return;
            }
            
            // Create BlobServiceClient
            BlobServiceClient blobServiceClient = new BlobServiceClientBuilder()
                .connectionString(connectionString)
                .buildClient();
            
            // Get container client
            BlobContainerClient containerClient = blobServiceClient.getBlobContainerClient(CONTAINER_NAME);
            
            // Create blob client
            BlobClient blobClient = containerClient.getBlobClient(filename);
            
            // Upload file
            blobClient.uploadFromFile(sourcePath.toString(), true);
            
            System.out.println("✅ File uploaded to Blob Storage: " + filename);
            System.out.println("📁 Container: " + CONTAINER_NAME);
            System.out.println("🌐 CDN URL: " + CDN_BASE_URL + "/" + filename);
            
        } catch (Exception e) {
            System.out.println("❌ Failed to upload to Blob Storage: " + e.getMessage());
            throw new RuntimeException("Failed to upload file to Blob Storage", e);
        }
    }
    
    private void triggerFrontendDeployment() {
        System.out.println("🚀 File uploaded to Blob Storage - CDN will pull automatically");
        System.out.println("📝 No frontend deployment needed - CDN pulls from Blob Storage");
    }
    
    public String getCdnUrl(String filename) {
        return CDN_BASE_URL + "/" + filename;
    }
}
