# Database Setup Instructions

Since Docker is not available in your current environment, you have a few options to set up the PostgreSQL database:

## Option 1: Install PostgreSQL Locally
1. Download and install PostgreSQL from https://www.postgresql.org/download/windows/
2. During installation, set the password to `password` (or update `.env` file with your password)
3. Create a database called `ems`:
   ```sql
   CREATE DATABASE ems;
   ```

## Option 2: Install Docker Desktop
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Install and restart your computer
3. After Docker is running, use: `docker compose up -d`

## Option 3: Use an Existing PostgreSQL Server
If you already have PostgreSQL running somewhere:
1. Update `backend/.env` with the correct `DATABASE_URL`
2. Run the migration commands

## After Database is Running

Once PostgreSQL is accessible at `127.0.0.1:5432`:

```powershell
cd e:\EMS_verify_clone\backend

# Apply the schema changes
npx prisma db push

# Create the PostgreSQL user
npx ts-node create_postgres_user.ts
```

## Verify the Setup
Login to the mobile app with:
- Mobile: `0987654321`
- Password: `superadmin`
