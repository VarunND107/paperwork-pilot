#!/bin/sh
# Applies migrations, seeds sample data if the database is empty, then starts the API.
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Seeding sample data (only creates what is missing)..."
node dist/seed/run.js

echo "Starting API..."
exec node dist/server.js
