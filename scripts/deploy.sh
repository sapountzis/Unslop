#!/bin/bash
set -e

echo "Unslop Backend Deployment Script"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Link to Railway project (if not already linked)
if ! railway status &> /dev/null; then
    echo "Linking to Railway project..."
    railway link
fi

# Deploy
echo "Deploying to Railway..."
railway up

echo "Deployment complete!"
echo "Get your service URL with: railway domain"
