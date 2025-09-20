#!/bin/bash

# Quick Start Script for AWS Deployment
# This script provides a simplified deployment process

echo "🚀 VoiceBot AWS Quick Start"
echo "============================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://www.docker.com/get-started"
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install awscli
    else
        pip install awscli
    fi
fi

# Configure AWS if needed
echo "Checking AWS configuration..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Please configure AWS CLI with your credentials:"
    aws configure
fi

# Get AWS account info
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo "✅ AWS Account: $AWS_ACCOUNT_ID"
echo "✅ Region: $AWS_REGION"
echo ""

# Choose deployment method
echo "Choose deployment method:"
echo "1) Quick deploy with AWS Copilot (Recommended for beginners)"
echo "2) Deploy with ECS and ECR (More control)"
echo "3) Local Docker test only"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo "Installing AWS Copilot..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install aws/tap/copilot-cli
        else
            curl -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
            chmod +x copilot
            sudo mv copilot /usr/local/bin/copilot
        fi
        
        echo "Initializing Copilot application..."
        copilot app init voicebot-demo
        
        echo "Creating environment..."
        copilot env init --name production
        copilot env deploy --name production
        
        echo "Creating service..."
        cat > copilot/environments/production/addons/secrets.yml <<EOF
Parameters:
  App:
    Type: String

Resources:
  OpenAISecret:
    Type: AWS::SecretsManager::Secret
    Properties:
      Name: /copilot/\${COPILOT_APPLICATION_NAME}/\${COPILOT_ENVIRONMENT_NAME}/secrets/OPENAI_API_KEY
      SecretString: !Sub |
        {
          "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY_HERE"
        }
EOF
        
        echo "Please edit copilot/environments/production/addons/secrets.yml"
        echo "and add your OpenAI API key, then run:"
        echo ""
        echo "copilot svc init --name api"
        echo "copilot svc deploy --name api --env production"
        ;;
        
    2)
        echo "Deploying with ECS..."
        
        # Create ECR repository
        aws ecr create-repository --repository-name voicebot-demo --region $AWS_REGION 2>/dev/null || true
        
        # Build and push Docker image
        echo "Building Docker image..."
        docker build -t voicebot-demo .
        
        # Login to ECR
        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
        
        # Tag and push
        docker tag voicebot-demo:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/voicebot-demo:latest
        docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/voicebot-demo:latest
        
        echo "✅ Docker image pushed to ECR"
        echo ""
        echo "Next steps:"
        echo "1. Create an ECS cluster in AWS Console"
        echo "2. Create a task definition using the pushed image"
        echo "3. Create an ECS service with ALB"
        echo "4. Add your OpenAI API key to AWS Secrets Manager"
        echo ""
        echo "Or use the deploy-aws.sh script for automated deployment"
        ;;
        
    3)
        echo "Testing locally with Docker..."
        
        # Check for .env file
        if [ ! -f .env ]; then
            echo "Creating .env file..."
            cp .env.example .env
            echo "Please edit .env and add your OpenAI API key"
            read -p "Press enter when ready..."
        fi
        
        # Build and run with docker-compose
        docker-compose up --build
        ;;
        
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Setup complete!"
echo ""
echo "Additional resources:"
echo "- Full deployment guide: AWS_DEPLOYMENT_GUIDE.md"
echo "- Automated deployment: ./deploy-aws.sh"
echo "- Local testing: docker-compose up"