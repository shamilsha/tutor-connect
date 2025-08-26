# Azure Deployment Guide for Tutor Connect WebRTC Application

## Overview
This guide will help you deploy your WebRTC tutoring application to Microsoft Azure. You'll get:
- ✅ Free public IP address
- ✅ Free subdomain (yourapp.azurewebsites.net)
- ✅ Free SSL certificate
- ✅ Automatic scaling
- ✅ Global CDN

## Prerequisites
1. **Azure Account**: Sign up at [azure.microsoft.com](https://azure.microsoft.com)
2. **Azure CLI**: Install from [docs.microsoft.com](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
3. **Git**: For source control
4. **Node.js**: For local development

## Step 1: Azure Account Setup

### 1.1 Create Azure Account
```bash
# Sign up for free Azure account
# Get $200 credit for 30 days + free tier services
```

### 1.2 Install Azure CLI
```bash
# Windows (PowerShell)
winget install Microsoft.AzureCLI

# macOS
brew install azure-cli

# Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

### 1.3 Login to Azure
```bash
az login
# This will open browser for authentication
```

## Step 2: Create Azure Resources

### 2.1 Create Resource Group
```bash
# Create resource group
az group create --name tutor-connect-rg --location eastus

# Set as default resource group
az config set defaults.group=tutor-connect-rg
```

### 2.2 Create App Service Plan
```bash
# Create free tier app service plan
az appservice plan create \
  --name tutor-connect-plan \
  --resource-group tutor-connect-rg \
  --sku F1 \
  --is-linux
```

## Step 3: Deploy Backend (Spring Boot)

### 3.1 Create Web App for Backend
```bash
# Create web app for Spring Boot backend
az webapp create \
  --name tutor-connect-backend \
  --resource-group tutor-connect-rg \
  --plan tutor-connect-plan \
  --runtime "JAVA|17-java17"
```

### 3.2 Configure Backend Environment Variables
```bash
# Set environment variables for backend
az webapp config appsettings set \
  --name tutor-connect-backend \
  --resource-group tutor-connect-rg \
  --settings \
    ALLOWED_ORIGINS="https://tutor-connect-frontend.azurestaticapps.net,https://localhost:3000" \
    DATABASE_URL="jdbc:h2:file:./data/tutoringdb" \
    DATABASE_DRIVER="org.h2.Driver" \
    DATABASE_USERNAME="sa" \
    DATABASE_PASSWORD="" \
    HIBERNATE_DIALECT="org.hibernate.dialect.H2Dialect"
```

### 3.3 Deploy Backend Code
```bash
# Navigate to backend directory
cd backend/tutor-connect

# Build the application
mvn clean package -DskipTests

# Deploy to Azure
az webapp deployment source config-zip \
  --resource-group tutor-connect-rg \
  --name tutor-connect-backend \
  --src target/tutor-connect-0.0.1-SNAPSHOT.jar
```

## Step 4: Deploy Signaling Server (Node.js)

### 4.1 Create Web App for Signaling Server
```bash
# Create web app for Node.js signaling server
az webapp create \
  --name tutor-connect-signaling \
  --resource-group tutor-connect-rg \
  --plan tutor-connect-plan \
  --runtime "NODE|18-lts"
```

### 4.2 Configure Signaling Server Environment Variables
```bash
# Set environment variables for signaling server
az webapp config appsettings set \
  --name tutor-connect-signaling \
  --resource-group tutor-connect-rg \
  --settings \
    ALLOWED_ORIGINS="https://tutor-connect-frontend.azurestaticapps.net,https://localhost:3000" \
    PORT="8081"
```

### 4.3 Deploy Signaling Server Code
```bash
# Navigate to signaling server directory
cd signaling-server

# Install dependencies
npm install

# Create deployment package
zip -r signaling-deploy.zip . -x "node_modules/*"

# Deploy to Azure
az webapp deployment source config-zip \
  --resource-group tutor-connect-rg \
  --name tutor-connect-signaling \
  --src signaling-deploy.zip
```

## Step 5: Deploy Frontend (React)

### 5.1 Create Static Web App
```bash
# Create static web app for React frontend
az staticwebapp create \
  --name tutor-connect-frontend \
  --resource-group tutor-connect-rg \
  --source https://github.com/yourusername/tutor-connect \
  --branch main \
  --app-location "/frontend" \
  --output-location "build"
```

### 5.2 Configure Frontend Environment Variables
```bash
# Set environment variables for frontend
az staticwebapp appsettings set \
  --name tutor-connect-frontend \
  --resource-group tutor-connect-rg \
  --setting-names \
    REACT_APP_BACKEND_URL="https://tutor-connect-backend.azurewebsites.net" \
    REACT_APP_SIGNALING_URL="wss://tutor-connect-signaling.azurewebsites.net"
```

## Step 6: Configure WebSocket Support

### 6.1 Enable WebSocket for Signaling Server
```bash
# Enable WebSocket support
az webapp config set \
  --name tutor-connect-signaling \
  --resource-group tutor-connect-rg \
  --web-sockets-enabled true
```

### 6.2 Configure CORS for Backend
```bash
# Enable CORS for backend
az webapp cors add \
  --name tutor-connect-backend \
  --resource-group tutor-connect-rg \
  --allowed-origins "https://tutor-connect-frontend.azurestaticapps.net"
```

## Step 7: Test Your Deployment

### 7.1 Get Your URLs
```bash
# Get your application URLs
echo "Frontend: https://tutor-connect-frontend.azurestaticapps.net"
echo "Backend: https://tutor-connect-backend.azurewebsites.net"
echo "Signaling: wss://tutor-connect-signaling.azurewebsites.net"
```

### 7.2 Test Health Endpoints
```bash
# Test backend health
curl https://tutor-connect-backend.azurewebsites.net/actuator/health

# Test signaling server health
curl https://tutor-connect-signaling.azurewebsites.net/health
```

## Step 8: Monitor and Scale

### 8.1 Enable Application Insights
```bash
# Create Application Insights
az monitor app-insights component create \
  --app tutor-connect-insights \
  --location eastus \
  --resource-group tutor-connect-rg \
  --application-type web
```

### 8.2 Set Up Monitoring
```bash
# Configure monitoring for backend
az webapp config appsettings set \
  --name tutor-connect-backend \
  --resource-group tutor-connect-rg \
  --settings \
    APPLICATIONINSIGHTS_CONNECTION_STRING="YOUR_APP_INSIGHTS_CONNECTION_STRING"
```

## Step 9: Custom Domain (Optional)

### 9.1 Add Custom Domain
```bash
# Add custom domain to frontend
az staticwebapp hostname add \
  --name tutor-connect-frontend \
  --resource-group tutor-connect-rg \
  --hostname "yourdomain.com"
```

### 9.2 Configure DNS
```bash
# Add CNAME record in your DNS provider
# yourdomain.com -> tutor-connect-frontend.azurestaticapps.net
```

## Troubleshooting

### Common Issues:

1. **WebSocket Connection Failed**
   ```bash
   # Check WebSocket is enabled
   az webapp config show --name tutor-connect-signaling --resource-group tutor-connect-rg
   ```

2. **CORS Errors**
   ```bash
   # Update CORS settings
   az webapp cors add --name tutor-connect-backend --resource-group tutor-connect-rg --allowed-origins "https://yourdomain.com"
   ```

3. **Build Failures**
   ```bash
   # Check build logs
   az webapp log tail --name tutor-connect-backend --resource-group tutor-connect-rg
   ```

### Useful Commands:

```bash
# View logs
az webapp log tail --name tutor-connect-backend --resource-group tutor-connect-rg
az webapp log tail --name tutor-connect-signaling --resource-group tutor-connect-rg

# Restart services
az webapp restart --name tutor-connect-backend --resource-group tutor-connect-rg
az webapp restart --name tutor-connect-signaling --resource-group tutor-connect-rg

# Check status
az webapp show --name tutor-connect-backend --resource-group tutor-connect-rg
az webapp show --name tutor-connect-signaling --resource-group tutor-connect-rg
```

## Cost Optimization

### Free Tier Limits:
- **App Service**: 1 GB RAM, 1 CPU, 1 GB storage
- **Static Web Apps**: 100 GB bandwidth/month
- **Application Insights**: 5 GB data/month

### Scaling Up:
```bash
# Scale to Basic tier ($13/month)
az appservice plan update \
  --name tutor-connect-plan \
  --resource-group tutor-connect-rg \
  --sku B1
```

## Security Best Practices

1. **Enable HTTPS**: Automatic with Azure
2. **Set up Authentication**: Use Azure AD
3. **Configure Firewall**: Restrict access if needed
4. **Monitor Logs**: Use Application Insights
5. **Regular Updates**: Keep dependencies updated

## Next Steps

1. **Set up CI/CD**: Connect to GitHub for automatic deployments
2. **Add Database**: Use Azure Database for PostgreSQL
3. **Implement Authentication**: Use Azure AD B2C
4. **Add CDN**: Use Azure CDN for better performance
5. **Set up Monitoring**: Configure alerts and dashboards

Your application will be accessible at:
- **Frontend**: https://tutor-connect-frontend.azurestaticapps.net
- **Backend**: https://tutor-connect-backend.azurewebsites.net
- **Signaling**: wss://tutor-connect-signaling.azurewebsites.net

