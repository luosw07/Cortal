#!/bin/bash
# This script installs dependencies and starts the development server.
# Usage: bash setup.sh

set -e

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. Please install Node.js and npm first." >&2
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Starting development server on http://localhost:3000"
npm start