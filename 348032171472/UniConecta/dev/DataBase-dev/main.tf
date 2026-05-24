terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  backend "s3" {
    bucket         = "backend-unicin"
    key            = "348032171472/UniConecta/dev/DataBase-dev/main.tfstate"
    region         = "sa-east-1"
    dynamodb_table = "Table"
    encrypt        = true
  }
}

# --- Main Cloud Provider ---
provider "aws" {
  region = "sa-east-1"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

### CATEGORY: STORAGE ###

resource "aws_dynamodb_table" "DBBot-dev" {
  name                              = "DBBot-dev"
  billing_mode                      = "PAY_PER_REQUEST"
  deletion_protection_enabled       = false
  hash_key                          = "ID"
  read_capacity                     = 1
  stream_enabled                    = false
  table_class                       = "STANDARD"
  write_capacity                    = 1
  tags                              = {
    Name = "DBBot-dev"
    State = "DataBase-dev"
    Struct8User = "Unicin"
    Stage = "dev"
  }
}

resource "aws_dynamodb_table" "SolicitacoesAtivas-dev" {
  name                              = "SolicitacoesAtivas-dev"
  billing_mode                      = "PAY_PER_REQUEST"
  deletion_protection_enabled       = false
  hash_key                          = "ID"
  read_capacity                     = 5
  stream_enabled                    = false
  table_class                       = "STANDARD"
  write_capacity                    = 5
  tags                              = {
    Name = "SolicitacoesAtivas-dev"
    State = "DataBase-dev"
    Struct8User = "Unicin"
    Stage = "dev"
  }
}




### CATEGORY: MISC ###

resource "aws_ssm_parameter" "whapikey-dev" {
  name                              = "whapikey-dev"
  data_type                         = "text"
  overwrite                         = false
  tier                              = "Standard"
  type                              = "String"
  value                             = "a"
  tags                              = {
    Name = "whapikey-dev"
    State = "DataBase-dev"
    Struct8User = "Unicin"
    Stage = "dev"
  }
}


