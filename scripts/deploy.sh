#!/bin/bash

# EMS Deployment Script
# Usage: ./deploy.sh

# Stop execution on any error
set -e

echo "🚀 Starting Deployment..."

# 1. Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm ci

# 3. Build the application
echo "🔨 Building the backend..."
npm run build

# 4. Run Database Migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# 5. Restart the application using PM2
echo "🔄 Restarting application..."
# Check if ems-backend is already running
if pm2 list | grep -q "ems-backend"; then
    pm2 restart ems-backend
else
    echo "⚠️  App not running in PM2. Starting it now..."
    pm2 start dist/index.js --name ems-backend
    pm2 save
fi

echo "✅ Deployment Successful!"
