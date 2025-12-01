# VPC Module - Basic structure
variable "environment" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "saas-${var.environment}-vpc"
  }
}

# Outputs
output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = [] # TODO: Implement subnets
}

output "database_subnet_ids" {
  value = [] # TODO: Implement subnets
}

