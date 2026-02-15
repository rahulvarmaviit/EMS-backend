# EMS Backend Deployment Guide

## 1. Initial Server Setup (One-Time)

### A. Prepare Directories
On your physical server:
```bash
mkdir -p ems-backend
mkdir -p ems-backend/config
mkdir -p ems-backend/uploads
cd ems-backend
```

### B. Upload Secrets (Securely)
You must manually copy these files from your local machine to the server's `ems-backend/config/` directory:
1.  `backend/.env` -> `ems-backend/config/.env`
2.  `backend/service-account.json` -> `ems-backend/config/service-account.json`

### C. Copy Docker Compose
Copy the `docker-compose.yml` file to the server's `ems-backend/` directory.

## 2. Deploying Updates

When you push code to `main`, GitHub Actions will build a new Docker image. To update the server:

```bash
# On the server
cd ems-backend
docker-compose pull
docker-compose up -d
```

This commands will:
1.  Download the new image.
2.  Recreate the container with the new code.
3.  Keep your data and configuration intact.
