# Backend configuration for STAGING environment
# Usage: terraform init -backend-config=backend-staging.hcl

bucket         = "saas-terraform-state"
key            = "staging/terraform.tfstate"
region         = "eu-central-1"
encrypt        = true
dynamodb_table = "terraform-lock"  # Note: deprecated, but still works
# use_lockfile = true  # Use this in Terraform 1.9+ instead

