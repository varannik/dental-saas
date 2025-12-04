# Terraform Backend Configuration Guide

## 🎯 Overview

This project uses **different backend strategies** for different environments:

- **Local Development**: Local state file (no S3)
- **Staging/Production**: S3 backend with DynamoDB locking

---

## 📦 Current Status

### ✅ Local Development (Active)

```bash
# Backend: Local file (terraform.tfstate)
# Location: infrastructure/terraform/terraform.tfstate
# Status: ✅ Initialized and ready
```

**Commands:**

```bash
cd infrastructure/terraform
terraform init -var-file=environments/local.tfvars
terraform plan -var-file=environments/local.tfvars
terraform apply -var-file=environments/local.tfvars
```

### ⚠️ Staging/Production (Needs Setup)

```bash
# Backend: S3 + DynamoDB
# Bucket: saas-terraform-state (in eu-central-1)
# Status: ⚠️ Bucket exists but not configured in Terraform yet
```

---

## 🚀 Setup Instructions

### For Local Development (Already Done ✅)

You're all set! The backend block in `main.tf` is commented out, so Terraform uses local state.

```bash
# Just use it:
make terraform-init        # Initialize
make terraform-local       # Apply
```

### For Staging Environment (When Ready)

#### Step 1: Verify S3 Bucket Exists

```bash
# Check if bucket exists in eu-central-1
aws s3 ls s3://saas-terraform-state --region eu-central-1

# If not, create it:
aws s3 mb s3://saas-terraform-state --region eu-central-1

# Enable versioning (recommended):
aws s3api put-bucket-versioning \
    --bucket saas-terraform-state \
    --versioning-configuration Status=Enabled \
    --region eu-central-1

# Enable encryption:
aws s3api put-bucket-encryption \
    --bucket saas-terraform-state \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            }
        }]
    }' \
    --region eu-central-1
```

#### Step 2: Create DynamoDB Lock Table

```bash
# Create lock table for state locking
aws dynamodb create-table \
    --table-name terraform-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region eu-central-1
```

#### Step 3: Initialize with Backend

```bash
cd infrastructure/terraform

# Option A: Use backend config file (recommended)
terraform init \
    -backend-config=backend-staging.hcl \
    -var-file=environments/staging.tfvars

# Option B: Uncomment backend block in main.tf and run
terraform init -migrate-state -var-file=environments/staging.tfvars
```

### For Production Environment (When Ready)

Same steps as staging, but:

```bash
# Use production backend config
terraform init \
    -backend-config=backend-production.hcl \
    -var-file=environments/production.tfvars
```

---

## 🔧 Backend Configuration Files

### Local (No Backend)

The `main.tf` has the backend block commented out for local development.

### Staging: `backend-staging.hcl`

```hcl
bucket         = "saas-terraform-state"
key            = "staging/terraform.tfstate"
region         = "eu-central-1"
encrypt        = true
dynamodb_table = "terraform-lock"
```

### Production: `backend-production.hcl`

```hcl
bucket         = "saas-terraform-state"
key            = "production/terraform.tfstate"
region         = "eu-central-1"
encrypt        = true
dynamodb_table = "terraform-lock"
```

**Benefits:**

- ✅ Separate state files per environment
- ✅ No need to modify main.tf
- ✅ Easy to switch between environments

---

## 🎓 Understanding the Architecture

### Backend Strategy

```
Local Development:
┌─────────────────────────────────────┐
│ main.tf (backend commented out)     │
│         ↓                            │
│ terraform.tfstate (local file)      │
└─────────────────────────────────────┘

Staging/Production:
┌─────────────────────────────────────┐
│ main.tf + backend-staging.hcl       │
│         ↓                            │
│ S3: saas-terraform-state            │
│   └─ staging/terraform.tfstate      │
│   └─ production/terraform.tfstate   │
│         ↓                            │
│ DynamoDB: terraform-lock            │
└─────────────────────────────────────┘
```

### Why Different Backends?

**Local Development:**

- ✅ No AWS credentials needed
- ✅ Works offline
- ✅ Fast and simple
- ✅ Can reset/destroy easily

**Staging/Production:**

- ✅ Team collaboration (shared state)
- ✅ State locking (prevents conflicts)
- ✅ State versioning (can rollback)
- ✅ Secure (encrypted at rest)

---

## 📋 Common Tasks

### Check Current Backend

```bash
cd infrastructure/terraform
terraform show
```

### Switch Between Environments

```bash
# Local (no backend)
terraform init -reconfigure -var-file=environments/local.tfvars

# Staging (with S3 backend)
terraform init -reconfigure -backend-config=backend-staging.hcl -var-file=environments/staging.tfvars

# Production (with S3 backend)
terraform init -reconfigure -backend-config=backend-production.hcl -var-file=environments/production.tfvars
```

### Migrate Local State to S3

```bash
# When you're ready to move from local to S3
cd infrastructure/terraform

# Initialize with S3 backend and migrate existing state
terraform init -migrate-state -backend-config=backend-staging.hcl -var-file=environments/staging.tfvars
```

### View Remote State

```bash
# Download and view S3 state
aws s3 cp s3://saas-terraform-state/staging/terraform.tfstate - | jq '.' | less

# Or use terraform
terraform state list
```

### Backup State

```bash
# Local state
cp infrastructure/terraform/terraform.tfstate backup-$(date +%Y%m%d).tfstate

# Remote state (automatic versioning enabled)
aws s3api list-object-versions \
    --bucket saas-terraform-state \
    --prefix staging/terraform.tfstate
```

---

## ⚠️ Important Notes

### Region Consistency

**✅ FIXED**: Your backend is now configured for `eu-central-1` (where your bucket actually exists).

Previously, there was a mismatch:

- ❌ Backend config said: `us-east-1`
- ✅ Actual bucket location: `eu-central-1`

This caused the 301 redirect error you saw.

### Deprecated Parameter

The `dynamodb_table` parameter is deprecated. In the future, replace it with:

```hcl
# Old (deprecated)
dynamodb_table = "terraform-lock"

# New (recommended)
use_lockfile = true
```

However, for now, `dynamodb_table` still works fine.

---

## 🐛 Troubleshooting

### Error: "Backend initialization required"

**Solution:**

```bash
cd infrastructure/terraform
rm -rf .terraform .terraform.lock.hcl
terraform init -var-file=environments/local.tfvars
```

### Error: "S3 bucket does not exist"

**Solution:**

```bash
# Create the bucket first
aws s3 mb s3://saas-terraform-state --region eu-central-1
```

### Error: "requested bucket from X, actual location Y"

**Solution:**

- This means region mismatch
- Check `backend-*.hcl` files have correct region
- Or check the `region` in the backend block of `main.tf`

### Error: "Error acquiring the state lock"

**Solution:**

```bash
# Someone else is running terraform, or previous run crashed
# List locks:
aws dynamodb scan --table-name terraform-lock

# Force unlock (use with caution):
terraform force-unlock <LOCK_ID>
```

### Clean Start

```bash
# Remove all local terraform files
cd infrastructure/terraform
rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup

# Reinitialize
terraform init -var-file=environments/local.tfvars
```

---

## ✅ Checklist

### Local Development Setup ✅

- [x] Backend block commented out in main.tf
- [x] Terraform initialized with local backend
- [x] Can run `terraform plan` successfully
- [x] State file created: `terraform.tfstate`

### Staging Setup (When Ready)

- [ ] S3 bucket created in eu-central-1
- [ ] S3 versioning enabled
- [ ] S3 encryption enabled
- [ ] DynamoDB lock table created
- [ ] Backend config file ready: `backend-staging.hcl`
- [ ] AWS credentials configured
- [ ] Initialized with S3 backend
- [ ] State migrated from local (if needed)

### Production Setup (When Ready)

- [ ] Same as staging, but with production config
- [ ] Production backend config: `backend-production.hcl`
- [ ] Separate state path in S3: `production/terraform.tfstate`

---

## 🎯 Quick Reference

### Commands by Environment

```bash
# Local
terraform init -var-file=environments/local.tfvars
terraform plan -var-file=environments/local.tfvars
terraform apply -var-file=environments/local.tfvars

# Staging
terraform init -backend-config=backend-staging.hcl -var-file=environments/staging.tfvars
terraform plan -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars

# Production
terraform init -backend-config=backend-production.hcl -var-file=environments/production.tfvars
terraform plan -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars
```

### Using Makefile

```bash
# Local
make terraform-init           # Runs init for local
make terraform-local          # Applies local config

# Staging (when backend is configured)
make terraform-init staging
make terraform-staging

# Production (when backend is configured)
make terraform-init production
make terraform-production
```

---

## 📚 Related Documentation

- **REGION_CONSISTENCY_CHECK.md** - Region configuration guide
- **TERRAFORM_LOCALSTACK_GUIDE.md** - LocalStack setup
- **TERRAFORM_FIX.md** - General Terraform fixes
- **INIT_INSTRUCTIONS.md** - Original initialization guide

---

## ✅ Summary

**Current Status:**

- ✅ Local development: Working with local backend
- ✅ Region mismatch: Fixed (eu-central-1)
- ✅ Backend configs: Created for staging/production
- ⚠️ Staging/Production: Need to run setup steps when ready

**You can now:**

- ✅ Run `terraform plan/apply` locally
- ✅ Develop without AWS credentials
- ✅ Deploy to staging/production when ready (following the setup steps above)

**No more "Backend initialization required" errors!** 🎉
