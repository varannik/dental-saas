# 🎯 Terraform with LocalStack Guide

## ✅ What's Been Configured

Your Terraform setup now supports **both LocalStack (local) and real AWS (staging/production)**!

---

## 📋 **Three Environments**

```
┌─────────────────────────────────────────────────────┐
│  Local        → LocalStack (Docker)                 │
│  Staging      → Real AWS                            │
│  Production   → Real AWS                            │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 **How It Works**

### **Environment Detection:**

```hcl
# infrastructure/terraform/providers.tf

locals {
  use_localstack = var.environment == "local"
}

provider "aws" {
  # If environment = "local" → Uses LocalStack endpoints
  # If environment = "staging/production" → Uses real AWS
}
```

---

## 💻 **Local Development (LocalStack)**

### **Step 1: Start LocalStack**

```bash
# Start all local services (PostgreSQL, Redis, MinIO, LocalStack)
cd ~/Desktop/Dental/dental-saas
make docker-up

# Or manually:
cd infrastructure/docker
docker-compose up -d

# Verify LocalStack is running
curl http://localhost:4566/_localstack/health
```

**Expected Output:**

```json
{
  "services": {
    "s3": "available",
    "dynamodb": "available",
    "lambda": "available",
    ...
  }
}
```

---

### **Step 2: Initialize Terraform for Local**

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init -backend=false

# Use local.tfvars
terraform plan -var-file="environments/local.tfvars"
```

---

### **Step 3: Create Resources in LocalStack**

```bash
# Apply Terraform configuration
terraform apply -var-file="environments/local.tfvars" -auto-approve

# Resources will be created in LocalStack (localhost:4566)
```

**What Gets Created:**

- ✅ S3 Buckets (LocalStack)
- ✅ IAM Roles (LocalStack)
- ✅ Lambda Functions (LocalStack)
- ✅ API Gateway (LocalStack)
- ✅ DynamoDB Tables (LocalStack)

**What You Should Use Docker For:**

- ✅ PostgreSQL (Docker postgres, NOT LocalStack RDS)
- ✅ Redis (Docker redis, NOT LocalStack ElastiCache)

**Why?** LocalStack's RDS and ElastiCache support is limited. Direct Docker containers work better!

---

### **Step 4: Verify Resources**

```bash
# List S3 buckets
aws --endpoint-url=http://localhost:4566 s3 ls

# List Lambda functions
aws --endpoint-url=http://localhost:4566 lambda list-functions

# Describe DynamoDB tables
aws --endpoint-url=http://localhost:4566 dynamodb list-tables
```

---

## ☁️ **Staging Environment (Real AWS)**

### **Step 1: Configure AWS Credentials**

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"
```

---

### **Step 2: Initialize Terraform for Staging**

```bash
cd infrastructure/terraform

# Initialize with S3 backend
terraform init

# Use staging.tfvars
terraform plan -var-file="environments/staging.tfvars"
```

---

### **Step 3: Create Resources in AWS**

```bash
# Apply (with confirmation)
terraform apply -var-file="environments/staging.tfvars"

# Resources will be created in REAL AWS
```

---

## 🏭 **Production Environment (Real AWS)**

### **Step 1: Extra Caution!**

```bash
# Always plan first
terraform plan -var-file="environments/production.tfvars"

# Review carefully before applying
terraform apply -var-file="environments/production.tfvars"
```

---

## 📊 **Comparison Table**

| Feature         | Local (LocalStack) | Staging (AWS)       | Production (AWS)    |
| --------------- | ------------------ | ------------------- | ------------------- |
| **Provider**    | LocalStack         | AWS                 | AWS                 |
| **Endpoint**    | localhost:4566     | AWS API             | AWS API             |
| **Credentials** | "test"/"test"      | Real AWS keys       | Real AWS keys       |
| **Cost**        | FREE               | $$$                 | $$$                 |
| **Speed**       | Fast               | Slower              | Slower              |
| **Backend**     | Local file         | S3                  | S3                  |
| **Database**    | Docker PostgreSQL  | Aurora Serverless   | Aurora Serverless   |
| **Cache**       | Docker Redis       | ElastiCache/Upstash | ElastiCache/Upstash |
| **Storage**     | LocalStack S3      | Real S3             | Real S3             |

---

## 🎯 **Recommended Resource Strategy**

### **What to Use LocalStack For:**

```
✅ S3 (works great!)
✅ Lambda (good for testing)
✅ API Gateway (good for testing)
✅ DynamoDB (works well)
✅ IAM (basic role testing)
✅ Secrets Manager (works well)
✅ SQS/SNS (works well)
```

### **What to Use Docker Directly For:**

```
✅ PostgreSQL (docker postgres:16)
✅ Redis (docker redis:7)
✅ MinIO (docker minio - S3 alternative)
```

**Why?** Docker containers are more reliable and feature-complete for databases!

---

## 🔧 **Your Current Setup**

### **docker-compose.yml Services:**

```yaml
services:
  postgres: ✅ Port 5432
  redis: ✅ Port 6379
  minio: ✅ Port 9000 (API), 9001 (Console)
  localstack: ✅ Port 4566 (All AWS services)
```

### **Terraform Configuration:**

```
infrastructure/terraform/
├── main.tf               ✅ Resource definitions
├── providers.tf          ✅ NEW: Conditional provider (LocalStack/AWS)
├── variables.tf          ✅ Variable definitions
├── outputs.tf            ✅ Output values
└── environments/
    ├── local.tfvars      ✅ NEW: LocalStack config
    ├── staging.tfvars    ✅ Real AWS config
    └── production.tfvars ✅ Real AWS config
```

---

## 🎨 **Architecture Flow**

### **Local Development:**

```
Your Code
    ↓
Terraform (environment = "local")
    ↓
LocalStack (localhost:4566)
    ├── S3 Buckets
    ├── Lambda Functions
    ├── DynamoDB Tables
    └── IAM Roles

Separate Docker Containers:
    ├── PostgreSQL (port 5432)
    ├── Redis (port 6379)
    └── MinIO (port 9000)
```

### **Staging/Production:**

```
Your Code
    ↓
Terraform (environment = "staging/production")
    ↓
Real AWS
    ├── Aurora Serverless (PostgreSQL)
    ├── ElastiCache or Upstash (Redis)
    ├── S3 Buckets
    ├── Lambda Functions
    └── IAM Roles
```

---

## 📝 **Example Workflow**

### **Day 1: Local Development**

```bash
# Start local infrastructure
make docker-up

# Initialize Terraform
cd infrastructure/terraform
terraform init -backend=false

# Create S3 bucket in LocalStack
terraform apply -var-file="environments/local.tfvars" \
  -target=aws_s3_bucket.uploads

# Verify
aws --endpoint-url=http://localhost:4566 s3 ls

# Code your app using LocalStack
```

---

### **Day 2: Deploy to Staging**

```bash
# Configure AWS credentials
aws configure

# Plan staging deployment
terraform plan -var-file="environments/staging.tfvars"

# Apply to real AWS
terraform apply -var-file="environments/staging.tfvars"

# Test your app on staging
```

---

## 🛠️ **Useful Commands**

### **LocalStack:**

```bash
# Check health
curl http://localhost:4566/_localstack/health

# List S3 buckets
aws --endpoint-url=http://localhost:4566 s3 ls

# Create S3 bucket manually
aws --endpoint-url=http://localhost:4566 s3 mb s3://test-bucket

# List Lambda functions
aws --endpoint-url=http://localhost:4566 lambda list-functions

# View LocalStack logs
docker logs -f dental-saas-localstack

# Restart LocalStack
docker restart dental-saas-localstack

# Stop all services
make docker-down
```

### **Terraform:**

```bash
# Format code
terraform fmt

# Validate configuration
terraform validate

# Plan (don't apply)
terraform plan -var-file="environments/local.tfvars"

# Apply specific resource
terraform apply -var-file="environments/local.tfvars" \
  -target=aws_s3_bucket.uploads

# Destroy everything
terraform destroy -var-file="environments/local.tfvars"

# Show current state
terraform show

# List resources
terraform state list
```

---

## ⚠️ **Important Notes**

### **LocalStack Limitations:**

1. **RDS**: Basic support only, use Docker PostgreSQL instead
2. **ElastiCache**: Not fully implemented, use Docker Redis instead
3. **VPC**: Limited networking support
4. **IAM**: Basic policies, not all features
5. **Lambda**: Good for testing, but not 100% identical to real AWS

### **Best Practice:**

```
✅ Use LocalStack for: S3, Lambda, API Gateway, DynamoDB
✅ Use Docker for: PostgreSQL, Redis
✅ Use real AWS for: Staging and Production
```

---

## 🎯 **Environment Variables**

### **Local (.env.local):**

```bash
# Database (Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dental_saas

# Redis (Docker)
REDIS_URL=redis://localhost:6379

# S3 (LocalStack)
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
S3_BUCKET=dental-saas-local-uploads
```

### **Staging (.env.staging):**

```bash
# Database (Aurora Serverless)
DATABASE_URL=postgresql://user:pass@aurora-endpoint:5432/dental_saas

# Redis (Upstash)
REDIS_URL=redis://user:pass@upstash-endpoint:6379

# S3 (Real AWS)
AWS_REGION=us-east-1
S3_BUCKET=dental-saas-staging-uploads
```

---

## 📋 **Quick Reference**

### **Start Local Development:**

```bash
make docker-up
cd infrastructure/terraform
terraform apply -var-file="environments/local.tfvars"
```

### **Deploy to Staging:**

```bash
cd infrastructure/terraform
terraform apply -var-file="environments/staging.tfvars"
```

### **Deploy to Production:**

```bash
cd infrastructure/terraform
terraform apply -var-file="environments/production.tfvars"
```

---

## ✅ **Summary**

### **What You Have Now:**

1. ✅ **LocalStack** configured in docker-compose
2. ✅ **Conditional Terraform provider** (LocalStack vs AWS)
3. ✅ **Environment-specific configs** (local.tfvars, staging.tfvars, production.tfvars)
4. ✅ **Single Terraform codebase** works for both local and cloud

### **Your Workflow:**

```
Local Development:
  docker-compose up → LocalStack + PostgreSQL + Redis
  terraform apply -var-file="environments/local.tfvars"

Staging Deployment:
  terraform apply -var-file="environments/staging.tfvars"

Production Deployment:
  terraform apply -var-file="environments/production.tfvars"
```

---

## 🚀 **Next Steps**

1. **Start LocalStack:**

   ```bash
   cd ~/Desktop/Dental/dental-saas
   make docker-up
   ```

2. **Test Terraform with LocalStack:**

   ```bash
   cd infrastructure/terraform
   terraform init -backend=false
   terraform plan -var-file="environments/local.tfvars"
   ```

3. **Create your first resource in LocalStack!**

---

**Your infrastructure is now ready for local development with LocalStack and cloud deployment with real AWS!** 🎉
