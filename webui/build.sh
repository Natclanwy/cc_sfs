#!/bin/bash
# Build script for webui

# Run TypeScript compiler and Vite build
tsc -b && vite build

# Clean old files
rm -rf ../data/assets ../data/index.htm ../data/index.htm.gz

# Copy new files
cp -r dist/* ../data/

# Rename index.html to index.htm
mv ../data/index.html ../data/index.htm

# Gzip all .htm, .css, and .js files
find ../data -type f \( -name '*.htm' -o -name '*.css' -o -name '*.js' \) -exec gzip -k {} \;
