# Terraform configuration for cloud infrastructure
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
  }

  # Backend for staging/production only
  # For local development, use local state (no backend block)
  # Uncomment and configure when deploying to AWS:
  # backend "s3" {
  #   bucket         = "saas-terraform-state"
  #   key            = "infrastructure/terraform.tfstate"
  #   region         = "eu-central-1"  # Fixed: was us-east-1, actual bucket is in eu-central-1
  #   encrypt        = true
  #   dynamodb_table = "terraform-lock"
  # }
}

# Provider configuration is in providers.tf

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

# EKS Cluster (Commented out - uncomment when needed for Kubernetes deployment)
# module "eks" {
#   source = "./modules/eks"
#
#   cluster_name    = "saas-${var.environment}"
#   cluster_version = "1.29"
#   vpc_id          = module.vpc.vpc_id
#   subnet_ids      = module.vpc.private_subnet_ids
#   environment     = var.environment
# }

# RDS PostgreSQL (Commented out - use Aurora Serverless or create module when needed)
# module "rds" {
#   source = "./modules/rds"
#
#   identifier     = "saas-${var.environment}"
#   vpc_id         = module.vpc.vpc_id
#   subnet_ids     = module.vpc.database_subnet_ids
#   instance_class = var.rds_instance_class
#   environment    = var.environment
# }

# ElastiCache Redis (Commented out - use Upstash or create module when needed)
# module "elasticache" {
#   source = "./modules/elasticache"
#
#   cluster_id  = "saas-${var.environment}"
#   vpc_id      = module.vpc.vpc_id
#   subnet_ids  = module.vpc.private_subnet_ids
#   node_type   = var.redis_node_type
#   environment = var.environment
# }

# S3 Buckets (Commented out - create module when needed)
# module "s3" {
#   source = "./modules/s3"
#
#   bucket_name = "saas-${var.environment}-uploads"
#   environment = var.environment
# }

