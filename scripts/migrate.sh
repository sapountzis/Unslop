#!/bin/bash
set -e

echo "Running database migrations..."

# Load .env variables
if [ -f backend/.env ]; then
    export $(cat backend/.env | grep -v '^#' | xargs)
else
    echo "Error: backend/.env not found"
    exit 1
fi

# Run migrations
cd backend
bun run migrate:push

echo "Migrations completed!"
