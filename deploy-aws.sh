#!/bin/bash

# AWS Deployment Script for VoiceBot Demo
# This script automates the deployment process to AWS ECS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
ECR_REPOSITORY=${ECR_REPOSITORY:-voicebot-demo}
ECS_CLUSTER=${ECS_CLUSTER:-voicebot-cluster}
ECS_SERVICE=${ECS_SERVICE:-voicebot-service}
TASK_FAMILY=${TASK_FAMILY:-voicebot-task}

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo -e "${GREEN}AWS VoiceBot Deployment Script${NC}"
echo "=================================="
echo "Region: ${AWS_REGION}"
echo "Account: ${AWS_ACCOUNT_ID}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists aws; then
    echo -e "${RED}AWS CLI is not installed. Please install it first.${NC}"
    exit 1
fi

if ! command_exists docker; then
    echo -e "${RED}Docker is not installed. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"

# Function to create ECR repository if it doesn't exist
create_ecr_repository() {
    echo -e "${YELLOW}Checking ECR repository...${NC}"
    
    if aws ecr describe-repositories --repository-names ${ECR_REPOSITORY} --region ${AWS_REGION} >/dev/null 2>&1; then
        echo -e "${GREEN}✓ ECR repository exists${NC}"
    else
        echo "Creating ECR repository..."
        aws ecr create-repository \
            --repository-name ${ECR_REPOSITORY} \
            --region ${AWS_REGION} \
            --image-scanning-configuration scanOnPush=true
        echo -e "${GREEN}✓ ECR repository created${NC}"
    fi
}

# Function to build and push Docker image
build_and_push_image() {
    echo -e "${YELLOW}Building Docker image...${NC}"
    
    # Build the image
    docker build -t ${ECR_REPOSITORY}:latest .
    
    # Tag for ECR
    docker tag ${ECR_REPOSITORY}:latest ${ECR_URI}/${ECR_REPOSITORY}:latest
    docker tag ${ECR_REPOSITORY}:latest ${ECR_URI}/${ECR_REPOSITORY}:$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
    
    echo -e "${GREEN}✓ Docker image built${NC}"
    
    # Login to ECR
    echo -e "${YELLOW}Logging in to ECR...${NC}"
    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URI}
    
    # Push to ECR
    echo -e "${YELLOW}Pushing image to ECR...${NC}"
    docker push ${ECR_URI}/${ECR_REPOSITORY}:latest
    docker push ${ECR_URI}/${ECR_REPOSITORY}:$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
    
    echo -e "${GREEN}✓ Image pushed to ECR${NC}"
}

# Function to create or update task definition
update_task_definition() {
    echo -e "${YELLOW}Updating ECS task definition...${NC}"
    
    # Create task definition JSON
    cat > task-definition.json <<EOF
{
    "family": "${TASK_FAMILY}",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "2048",
    "containerDefinitions": [
        {
            "name": "voicebot",
            "image": "${ECR_URI}/${ECR_REPOSITORY}:latest",
            "essential": true,
            "portMappings": [
                {
                    "containerPort": 3000,
                    "protocol": "tcp"
                }
            ],
            "environment": [
                {
                    "name": "PORT",
                    "value": "3000"
                },
                {
                    "name": "HOST",
                    "value": "0.0.0.0"
                },
                {
                    "name": "NODE_ENV",
                    "value": "production"
                }
            ],
            "secrets": [
                {
                    "name": "OPENAI_API_KEY",
                    "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:voicebot/openai-key:OPENAI_API_KEY::"
                }
            ],
            "healthCheck": {
                "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
                "interval": 30,
                "timeout": 10,
                "retries": 3,
                "startPeriod": 60
            },
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/${TASK_FAMILY}",
                    "awslogs-region": "${AWS_REGION}",
                    "awslogs-stream-prefix": "ecs"
                }
            }
        }
    ],
    "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
    "taskRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskRole"
}
EOF

    # Register task definition
    aws ecs register-task-definition --cli-input-json file://task-definition.json --region ${AWS_REGION}
    
    echo -e "${GREEN}✓ Task definition updated${NC}"
}

# Function to create or update ECS service
update_ecs_service() {
    echo -e "${YELLOW}Checking ECS service...${NC}"
    
    if aws ecs describe-services --cluster ${ECS_CLUSTER} --services ${ECS_SERVICE} --region ${AWS_REGION} | grep -q "ACTIVE"; then
        echo "Updating existing ECS service..."
        aws ecs update-service \
            --cluster ${ECS_CLUSTER} \
            --service ${ECS_SERVICE} \
            --task-definition ${TASK_FAMILY} \
            --force-new-deployment \
            --region ${AWS_REGION}
        echo -e "${GREEN}✓ ECS service updated${NC}"
    else
        echo -e "${YELLOW}Service doesn't exist. Please create it manually or use CDK/CloudFormation.${NC}"
    fi
}

# Function to store secrets
store_secrets() {
    echo -e "${YELLOW}Checking secrets...${NC}"
    
    # Check if OpenAI key secret exists
    if aws secretsmanager describe-secret --secret-id voicebot/openai-key --region ${AWS_REGION} >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OpenAI API key secret exists${NC}"
    else
        echo -e "${YELLOW}Creating OpenAI API key secret...${NC}"
        echo -e "${YELLOW}Please enter your OpenAI API key:${NC}"
        read -s OPENAI_KEY
        
        aws secretsmanager create-secret \
            --name voicebot/openai-key \
            --secret-string "{\"OPENAI_API_KEY\":\"${OPENAI_KEY}\"}" \
            --region ${AWS_REGION}
        
        echo -e "${GREEN}✓ Secret created${NC}"
    fi
}

# Function to create CloudWatch log group
create_log_group() {
    echo -e "${YELLOW}Checking CloudWatch log group...${NC}"
    
    LOG_GROUP="/ecs/${TASK_FAMILY}"
    
    if aws logs describe-log-groups --log-group-name-prefix ${LOG_GROUP} --region ${AWS_REGION} | grep -q ${LOG_GROUP}; then
        echo -e "${GREEN}✓ Log group exists${NC}"
    else
        echo "Creating log group..."
        aws logs create-log-group --log-group-name ${LOG_GROUP} --region ${AWS_REGION}
        aws logs put-retention-policy --log-group-name ${LOG_GROUP} --retention-in-days 30 --region ${AWS_REGION}
        echo -e "${GREEN}✓ Log group created${NC}"
    fi
}

# Main deployment process
main() {
    echo -e "${GREEN}Starting deployment process...${NC}"
    echo ""
    
    # Step 1: Create ECR repository
    create_ecr_repository
    
    # Step 2: Build and push Docker image
    build_and_push_image
    
    # Step 3: Store secrets
    store_secrets
    
    # Step 4: Create log group
    create_log_group
    
    # Step 5: Update task definition
    update_task_definition
    
    # Step 6: Update ECS service
    update_ecs_service
    
    echo ""
    echo -e "${GREEN}=================================="
    echo "Deployment completed successfully!"
    echo "=================================="
    echo ""
    echo "Next steps:"
    echo "1. If this is your first deployment, create an ECS cluster and service"
    echo "2. Configure your Application Load Balancer"
    echo "3. Set up Route 53 for your domain"
    echo "4. Monitor logs in CloudWatch"
    echo ""
    echo "To view logs:"
    echo "aws logs tail /ecs/${TASK_FAMILY} --follow"
    echo ""
    echo "To check service status:"
    echo "aws ecs describe-services --cluster ${ECS_CLUSTER} --services ${ECS_SERVICE}"
    echo -e "${NC}"
}

# Run main function
main