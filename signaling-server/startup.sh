#!/bin/bash
echo "Installing dependencies..."
npm install
echo "Starting signaling server..."
node server.js
