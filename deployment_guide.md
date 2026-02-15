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

### D. Run Database Migrations & Seed (Important)
After the container is running for the first time, initialize the database and create the Super Admin user:
```bash
# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Seed Super Admin (0987654321 / superadmin)
docker-compose exec backend npx prisma db seed
```

## 2. Deploying Updates

When you push code to `main`, GitHub Actions will build a new Docker image. To update the server:

```bash
# On the server
cd ems-backend
docker-compose pull
docker-compose up -d

# If there were database changes, run migrations:
docker-compose exec backend npx prisma migrate deploy
```

This commands will:
1.  Download the new image.
2.  Recreate the container with the new code.
3.  Keep your data and configuration intact.
