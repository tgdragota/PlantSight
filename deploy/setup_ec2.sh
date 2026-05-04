#!/bin/bash
# PlantSight — EC2 setup script (Ubuntu 22.04)
# Run once after launching the EC2 instance:
#   chmod +x setup_ec2.sh && ./setup_ec2.sh

set -e

echo "=== Installing Docker ==="
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
newgrp docker

echo "=== Cloning repo ==="
git clone https://github.com/YOUR_USERNAME/PlantSightRepo.git
cd PlantSightRepo

echo "=== Copying model weights ==="
# Upload weights manually via scp before running this:
#   scp -i key.pem training/checkpoints/best_model.pth ubuntu@EC2_IP:~/PlantSightRepo/backend/assets/models/
#   scp -i key.pem mobile/assets/model_int8.tflite ubuntu@EC2_IP:~/PlantSightRepo/backend/assets/models/
mkdir -p backend/assets/models

echo "=== Starting services ==="
docker compose up -d --build

echo ""
echo "=== Done! ==="
echo "API available at: http://$(curl -s ifconfig.me)/api/"
echo "Health check:     http://$(curl -s ifconfig.me)/health"
