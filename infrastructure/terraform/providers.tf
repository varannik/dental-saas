# Provider configuration for AWS
# Supports both LocalStack (local) and real AWS (staging/production)

locals {
  # Detect if we're using LocalStack
  use_localstack = var.environment == "local"
  
  # LocalStack endpoints
  localstack_endpoints = local.use_localstack ? {
    s3             = "http://localhost:4566"
    dynamodb       = "http://localhost:4566"
    cloudwatch     = "http://localhost:4566"
    iam            = "http://localhost:4566"
    lambda         = "http://localhost:4566"
    apigateway     = "http://localhost:4566"
    rds            = "http://localhost:4566"
    secretsmanager = "http://localhost:4566"
    sns            = "http://localhost:4566"
    sqs            = "http://localhost:4566"
  } : {}
}

provider "aws" {
  region = var.aws_region
  
  # Use fake credentials for LocalStack
  access_key = local.use_localstack ? "test" : null
  secret_key = local.use_localstack ? "test" : null
  
  # Skip credential validation for LocalStack
  skip_credentials_validation = local.use_localstack
  skip_metadata_api_check     = local.use_localstack
  skip_requesting_account_id  = local.use_localstack
  
  # Configure endpoints for LocalStack
  dynamic "endpoints" {
    for_each = local.use_localstack ? [1] : []
    content {
      s3             = local.localstack_endpoints.s3
      dynamodb       = local.localstack_endpoints.dynamodb
      cloudwatch     = local.localstack_endpoints.cloudwatch
      iam            = local.localstack_endpoints.iam
      lambda         = local.localstack_endpoints.lambda
      apigateway     = local.localstack_endpoints.apigateway
      rds            = local.localstack_endpoints.rds
      secretsmanager = local.localstack_endpoints.secretsmanager
      sns            = local.localstack_endpoints.sns
      sqs            = local.localstack_endpoints.sqs
    }
  }
  
  default_tags {
    tags = {
      Project     = "Dental SaaS"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

