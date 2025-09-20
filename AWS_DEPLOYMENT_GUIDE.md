# AWS Deployment Guide for VoiceBot Demo

## Architecture Overview

### Recommended AWS Services Setup
```
┌─────────────────────────────────────────────────────────┐
│                     CloudFront                           │
│                  (CDN for static files)                  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│              Application Load Balancer (ALB)             │
│                 (WebSocket & HTTP support)               │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                    ECS Fargate                           │
│                 (Container hosting)                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │            VoiceBot Container                    │    │
│  │   - FastAPI server on port 3000                  │    │
│  │   - WebSocket handling                           │    │
│  │   - OpenAI Realtime API integration              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                 Supporting Services                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   RDS/Aurora │  │     S3       │  │   Secrets    │  │
│  │  (ChromaDB)  │  │  (RAG docs)  │  │   Manager    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Deployment Options

### Option 1: ECS Fargate (Recommended for Production)
Best for: Scalable production deployments with managed infrastructure

### Option 2: EC2 Instance
Best for: More control, persistent storage needs, development/testing

### Option 3: Lambda + API Gateway WebSockets
Best for: Cost optimization with sporadic usage (requires significant refactoring)

## Step-by-Step Deployment to ECS Fargate

### 1. Prerequisites
```bash
# Install AWS CLI
brew install awscli  # macOS
# or
pip install awscli

# Configure AWS credentials
aws configure

# Install Docker
# Download from https://www.docker.com/

# Install AWS CDK (optional, for infrastructure as code)
npm install -g aws-cdk
```

### 2. Containerize the Application

Create a `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/
COPY *.py ./

# Create directories for runtime
RUN mkdir -p /app/logs /app/data/chroma_db /app/data/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:3000/health')" || exit 1

# Run the application
CMD ["python", "src/server.py"]
```

### 3. Build and Push to ECR

```bash
# Create ECR repository
aws ecr create-repository --repository-name voicebot-demo --region us-east-1

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin [YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com

# Build Docker image
docker build -t voicebot-demo .

# Tag image
docker tag voicebot-demo:latest [YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/voicebot-demo:latest

# Push to ECR
docker push [YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/voicebot-demo:latest
```

### 4. Create ECS Task Definition

Create `ecs-task-definition.json`:
```json
{
  "family": "voicebot-demo",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "voicebot",
      "image": "[YOUR_ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/voicebot-demo:latest",
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
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:[ACCOUNT_ID]:secret:voicebot/openai-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/voicebot-demo",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 5. Store Secrets in AWS Secrets Manager

```bash
# Store OpenAI API key
aws secretsmanager create-secret \
    --name voicebot/openai-key \
    --secret-string "sk-your-openai-api-key"

# Store Amadeus credentials
aws secretsmanager create-secret \
    --name voicebot/amadeus \
    --secret-string '{"client_id":"your_id","client_secret":"your_secret"}'
```

### 6. Deploy with CDK (Infrastructure as Code)

Create `cdk-deploy/app.py`:
```python
#!/usr/bin/env python3
import os
from aws_cdk import (
    App,
    Stack,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ec2 as ec2,
    aws_elasticloadbalancingv2 as elbv2,
    aws_secretsmanager as sm,
    aws_s3 as s3,
    aws_rds as rds,
    Duration,
    CfnOutput
)
from constructs import Construct

class VoiceBotStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)
        
        # VPC
        vpc = ec2.Vpc(self, "VoiceBotVPC", max_azs=2)
        
        # ECS Cluster
        cluster = ecs.Cluster(self, "VoiceBotCluster", vpc=vpc)
        
        # Task Definition
        task_definition = ecs.FargateTaskDefinition(
            self, "VoiceBotTask",
            memory_limit_mib=2048,
            cpu=1024
        )
        
        # Get secrets
        openai_secret = sm.Secret.from_secret_name_v2(
            self, "OpenAIKey", "voicebot/openai-key"
        )
        
        # Container
        container = task_definition.add_container(
            "voicebot",
            image=ecs.ContainerImage.from_registry(
                f"{self.account}.dkr.ecr.{self.region}.amazonaws.com/voicebot-demo:latest"
            ),
            environment={
                "PORT": "3000",
                "NODE_ENV": "production"
            },
            secrets={
                "OPENAI_API_KEY": ecs.Secret.from_secrets_manager(openai_secret)
            },
            logging=ecs.LogDrivers.aws_logs(stream_prefix="voicebot")
        )
        
        container.add_port_mappings(
            ecs.PortMapping(container_port=3000, protocol=ecs.Protocol.TCP)
        )
        
        # ALB with WebSocket support
        service = ecs_patterns.ApplicationLoadBalancedFargateService(
            self, "VoiceBotService",
            cluster=cluster,
            task_definition=task_definition,
            desired_count=2,
            listener_port=443,
            certificate=elbv2.ListenerCertificate.from_arn(
                "arn:aws:acm:region:account:certificate/id"  # Your SSL cert
            ),
            redirect_http=True,
            public_load_balancer=True
        )
        
        # Configure health check for WebSocket
        service.target_group.configure_health_check(
            path="/health",
            healthy_http_codes="200"
        )
        
        # Auto-scaling
        scaling = service.service.auto_scale_task_count(max_capacity=10)
        scaling.scale_on_cpu_utilization(
            "CpuScaling",
            target_utilization_percent=70
        )
        
        # S3 bucket for RAG documents
        rag_bucket = s3.Bucket(
            self, "VoiceBotRAGBucket",
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED
        )
        
        # Output the ALB URL
        CfnOutput(
            self, "LoadBalancerDNS",
            value=service.load_balancer.load_balancer_dns_name
        )

app = App()
VoiceBotStack(app, "VoiceBotStack")
app.synth()
```

Deploy with CDK:
```bash
cd cdk-deploy
cdk init
pip install aws-cdk-lib constructs
cdk deploy
```

### 7. Alternative: Quick Deploy with AWS Copilot

```bash
# Install Copilot
brew install aws/tap/copilot-cli  # macOS

# Initialize application
copilot app init voicebot-demo

# Create environment
copilot env init --name production

# Deploy environment
copilot env deploy --name production

# Create service
copilot svc init --name api

# Deploy service
copilot svc deploy --name api --env production
```

## Environment Variables Configuration

Create `.env.production`:
```bash
# API Keys (use AWS Secrets Manager in production)
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-realtime-preview-2024-12-17

# Server Configuration
PORT=3000
HOST=0.0.0.0

# AWS Services
AWS_REGION=us-east-1
S3_BUCKET_NAME=voicebot-rag-documents
CHROMA_DB_HOST=your-rds-endpoint.amazonaws.com

# Logging
LOG_LEVEL=info
LOG_FILE=/app/logs/app.log

# Production flags
NODE_ENV=production
DEBUG=false
```

## Cost Optimization Tips

### 1. Use Spot Instances for ECS
```json
{
  "capacityProviders": ["FARGATE_SPOT"],
  "defaultCapacityProviderStrategy": [
    {
      "capacityProvider": "FARGATE_SPOT",
      "weight": 2
    },
    {
      "capacityProvider": "FARGATE",
      "weight": 1
    }
  ]
}
```

### 2. Implement Auto-scaling
- Scale down during off-hours
- Scale based on WebSocket connections
- Use predictive scaling for known patterns

### 3. Use CloudFront for Static Assets
- Cache JavaScript, CSS, images
- Reduce load on application servers

### 4. Optimize Container Size
- Use multi-stage Docker builds
- Remove development dependencies
- Use Alpine Linux base images when possible

## Monitoring & Logging

### CloudWatch Setup
```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/voicebot-demo

# Set retention
aws logs put-retention-policy \
    --log-group-name /ecs/voicebot-demo \
    --retention-in-days 30
```

### Create CloudWatch Dashboard
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
          [".", "MemoryUtilization", {"stat": "Average"}],
          ["AWS/ApplicationELB", "ActiveConnectionCount"],
          [".", "WebSocketConnectionCount"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "VoiceBot Metrics"
      }
    }
  ]
}
```

## Security Best Practices

1. **Use IAM Roles** for ECS tasks instead of embedding credentials
2. **Enable VPC Flow Logs** for network monitoring
3. **Use AWS WAF** to protect against common attacks
4. **Enable AWS Shield** for DDoS protection
5. **Encrypt data at rest** using AWS KMS
6. **Regular security audits** with AWS Security Hub

## Troubleshooting

### Common Issues and Solutions

1. **WebSocket connections dropping**
   - Increase ALB idle timeout (default 60s)
   - Configure stickiness on target group
   - Check security group rules

2. **High latency**
   - Use CloudFront for static assets
   - Enable ECS Service Connect
   - Consider multi-region deployment

3. **Container crashes**
   - Check CloudWatch logs
   - Increase memory allocation
   - Verify all environment variables are set

## CI/CD Pipeline

### GitHub Actions Workflow
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Login to Amazon ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin ${{ secrets.ECR_REGISTRY }}
      
      - name: Build and push Docker image
        run: |
          docker build -t voicebot .
          docker tag voicebot:latest ${{ secrets.ECR_REGISTRY }}/voicebot:latest
          docker push ${{ secrets.ECR_REGISTRY }}/voicebot:latest
      
      - name: Update ECS service
        run: |
          aws ecs update-service --cluster voicebot-cluster --service voicebot-service --force-new-deployment
```

## Estimated AWS Costs (Monthly)

### Small Scale (100 concurrent users)
- ECS Fargate: ~$75 (2 tasks × 1 vCPU × 2GB RAM)
- ALB: ~$25
- CloudWatch: ~$10
- Secrets Manager: ~$2
- **Total: ~$112/month**

### Medium Scale (500 concurrent users)
- ECS Fargate: ~$300 (8 tasks × 1 vCPU × 2GB RAM)
- ALB: ~$25
- CloudWatch: ~$30
- RDS for ChromaDB: ~$50
- **Total: ~$405/month**

### Large Scale (2000+ concurrent users)
- ECS Fargate: ~$1200 (30 tasks × 2 vCPU × 4GB RAM)
- ALB: ~$50
- CloudWatch: ~$100
- RDS Aurora: ~$200
- CloudFront: ~$50
- **Total: ~$1,600/month**

## Next Steps

1. Set up your AWS account and configure CLI
2. Build and push Docker image to ECR
3. Deploy using either CDK or Copilot
4. Configure domain name with Route 53
5. Set up monitoring and alerts
6. Implement CI/CD pipeline
7. Load test the deployment