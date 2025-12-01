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

  backend "s3" {
    bucket         = "saas-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "SaaS Platform"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"

  cluster_name    = "saas-${var.environment}"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  environment     = var.environment
}

# RDS PostgreSQL
module "rds" {
  source = "./modules/rds"

  identifier     = "saas-${var.environment}"
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.database_subnet_ids
  instance_class = var.rds_instance_class
  environment    = var.environment
}

# ElastiCache Redis
module "elasticache" {
  source = "./modules/elasticache"

  cluster_id  = "saas-${var.environment}"
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids
  node_type   = var.redis_node_type
  environment = var.environment
}

# S3 Buckets
module "s3" {
  source = "./modules/s3"

  bucket_name = "saas-${var.environment}-uploads"
  environment = var.environment
}

