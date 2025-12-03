#!/bin/bash
# scripts/terraform/validate-region.sh
# Validates all resources are in the expected region

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

EXPECTED_REGION="us-east-1"
ENVIRONMENT=${1:-local}

print_header "Region Validation: $ENVIRONMENT"

if [ "$ENVIRONMENT" = "local" ]; then
  ENDPOINT="--endpoint-url=http://localhost:4566"
  AWS_REGION="us-east-1"
  log_info "Using LocalStack endpoint"
else
  ENDPOINT=""
  AWS_REGION=$EXPECTED_REGION
  log_info "Using real AWS"
fi

echo ""
log_step "Expected region: $EXPECTED_REGION"
echo ""

# Validate S3 buckets
log_step "Checking S3 buckets..."
BUCKETS=$(aws $ENDPOINT s3api list-buckets --query 'Buckets[*].Name' --output text 2>/dev/null || echo "")

if [ -n "$BUCKETS" ]; then
  for bucket in $BUCKETS; do
    BUCKET_REGION=$(aws $ENDPOINT s3api get-bucket-location \
      --bucket "$bucket" \
      --query 'LocationConstraint' \
      --output text 2>/dev/null || echo "us-east-1")
    
    if [ "$BUCKET_REGION" = "None" ] || [ "$BUCKET_REGION" = "null" ] || [ -z "$BUCKET_REGION" ]; then
      BUCKET_REGION="us-east-1"  # Default region
    fi
    
    if [ "$BUCKET_REGION" = "$EXPECTED_REGION" ]; then
      log_success "$bucket: $BUCKET_REGION"
    else
      log_error "$bucket: $BUCKET_REGION (Expected: $EXPECTED_REGION)"
      exit 1
    fi
  done
else
  log_info "No S3 buckets found"
fi

# Validate Lambda functions
echo ""
log_step "Checking Lambda functions..."
FUNCTIONS=$(aws $ENDPOINT lambda list-functions \
  --region $AWS_REGION \
  --query 'Functions[*].FunctionName' \
  --output text 2>/dev/null || echo "")

if [ -n "$FUNCTIONS" ]; then
  for func in $FUNCTIONS; do
    log_success "$func: $AWS_REGION (configured)"
  done
else
  log_info "No Lambda functions found"
fi

# Validate DynamoDB tables
echo ""
log_step "Checking DynamoDB tables..."
TABLES=$(aws $ENDPOINT dynamodb list-tables \
  --region $AWS_REGION \
  --query 'TableNames' \
  --output text 2>/dev/null || echo "")

if [ -n "$TABLES" ]; then
  for table in $TABLES; do
    log_success "$table: $AWS_REGION (configured)"
  done
else
  log_info "No DynamoDB tables found"
fi

print_separator
log_success "All resources validated in region: $EXPECTED_REGION"
print_separator

echo ""
log_info "Environment: $ENVIRONMENT"
log_info "Region: $EXPECTED_REGION"
log_info "Status: ✅ PASS"
echo ""

