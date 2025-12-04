# Terraform Initialization Instructions

## Problem

The S3 backend is configured, but:

- For **local development**: S3 bucket doesn't exist yet
- For **staging/production**: S3 bucket needs to be created first

## Solution for Local Development

### Option 1: Comment out the backend (Recommended for local)

```bash
# 1. Edit main.tf and comment out the backend block:
cd infrastructure/terraform

# Backup main.tf
cp main.tf main.tf.backup

# Comment out backend (lines 16-22)
# Or just initialize without backend
terraform init -backend=false
```

### Option 2: Initialize with local backend

```bash
cd infrastructure/terraform

# Initialize without remote backend
terraform init -backend=false

# This will use local state file (terraform.tfstate)
```

## Solution for Staging/Production

### Step 1: Create S3 bucket and DynamoDB table first

```bash
# Using AWS CLI
aws s3 mb s3://saas-terraform-state --region us-east-1
aws dynamodb create-table \
    --table-name terraform-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region us-east-1
```

### Step 2: Then initialize Terraform

```bash
terraform init -var-file=environments/staging.tfvars
```

## Recommended Approach

For a cleaner setup, use **partial backend configuration**:

1. Remove backend block from main.tf
2. Create separate backend config files per environment
3. Pass backend config during init

See TERRAFORM_BACKEND_SETUP.md for full guide.
