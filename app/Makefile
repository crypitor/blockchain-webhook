SHELL := /bin/bash

include .env

default: up

## 


## ▄▄▄▄▄▄▄▄▄▄▄  ▄▄        ▄  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄   ▄▄▄▄▄▄▄▄▄▄▄  ▄       ▄ 
##▐░░░░░░░░░░░▌▐░░▌      ▐░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░▌ ▐░░░░░░░░░░░▌▐░▌     ▐░▌
##▐░█▀▀▀▀▀▀▀█░▌▐░▌░▌     ▐░▌▐░█▀▀▀▀▀▀▀▀▀ ▐░█▀▀▀▀▀▀▀█░▌▐░█▀▀▀▀▀▀▀█░▌ ▐░▌   ▐░▌ 
##▐░▌       ▐░▌▐░▌▐░▌    ▐░▌▐░▌          ▐░▌       ▐░▌▐░▌       ▐░▌  ▐░▌ ▐░▌  
##▐░▌       ▐░▌▐░▌ ▐░▌   ▐░▌▐░█▄▄▄▄▄▄▄▄▄ ▐░█▄▄▄▄▄▄▄█░▌▐░▌       ▐░▌   ▐░▐░▌   
##▐░▌       ▐░▌▐░▌  ▐░▌  ▐░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░▌ ▐░▌       ▐░▌    ▐░▌    
##▐░▌       ▐░▌▐░▌   ▐░▌ ▐░▌▐░█▀▀▀▀▀▀▀▀▀ ▐░█▀▀▀▀▀▀▀█░▌▐░▌       ▐░▌   ▐░▌░▌   
##▐░▌       ▐░▌▐░▌    ▐░▌▐░▌▐░▌          ▐░▌       ▐░▌▐░▌       ▐░▌  ▐░▌ ▐░▌  
##▐░█▄▄▄▄▄▄▄█░▌▐░▌     ▐░▐░▌▐░█▄▄▄▄▄▄▄▄▄ ▐░█▄▄▄▄▄▄▄█░▌▐░█▄▄▄▄▄▄▄█░▌ ▐░▌   ▐░▌ 
##▐░░░░░░░░░░░▌▐░▌      ▐░░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░▌ ▐░░░░░░░░░░░▌▐░▌     ▐░▌
## ▀▀▀▀▀▀▀▀▀▀▀  ▀        ▀▀  ▀▀▀▀▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀▀▀▀   ▀▀▀▀▀▀▀▀▀▀▀  ▀       ▀                                                    
##                           
## Commands:
##
## help		: Prints this help screen.
## up		: Builds the application container and starts it with logging.
## up-silent	: Builds the application container and starts it in background mode, no active logging.
## down		: Removes the docker containers.
## stop		: Stops the running containers.
## shell		: SSH into the main app container.
##
.PHONY: help
help : Makefile
	@sed -n 's/^##//p' $<

.PHONY: up dev
up-dev:
	@echo "Building application and starting container..."
	@docker compose --env-file .env.docker -f docker-compose-dev.yml up

.PHONY: build dev
build-dev:
	@echo "Re-building container and installing dependancies..."
	@docker compose -f docker-compose-dev.yml down && TARGET=development docker compose -f docker-compose-dev.yml build --no-cache && docker compose -f docker-compose-dev.yml up

.PHONY: log
log-dev:
	@echo "Building application and starting container in background mode..."
	@docker compose -f docker-compose-dev.yml logs api monitor worker -f -n 10

.PHONY: down
down-dev:
	@echo "Shutting down and removing containers for api..."
	@docker compose -f docker-compose-dev.yml down

.PHONY: stop
stop-dev:
	@echo "Stopping containers for api..."
	@docker compose -f docker-compose-dev.yml stop

.PHONY: shell
shell:
	@docker compose exec -ti api /bin/sh

.PHONY: shell-db
shell-db:
	@docker exec -ti mongo mongosh -u ${DB_USERNAME} -p ${DB_PASSWORD}

.PHONY: db
db:
	@echo "-------------------------------------------------------------------------"
	@echo "### Host machine URL (use to access mongo outside Docker Containers e.g: MongoDB Compass GUI) ###"
	@echo 'mongodb://${DB_USERNAME}:${DB_PASSWORD}@127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.5.0'
	@echo "-------------------------------------------------------------------------"
	@echo "### Localhost URL ###"
	@echo 'mongodb://${DB_USERNAME}:${DB_PASSWORD}@mongo:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.5.0'
	@echo "-------------------------------------------------------------------------"

.PHONY: up
up:
	# @echo "Init environment..."
	@echo "Building application and starting container..."
	@docker compose --env-file docker/.env -f docker/docker-compose.yml up -d

.PHONY: down
down:
	@echo "Building application and starting container..."
	@docker compose --env-file docker/.env -f docker/docker-compose.yml down

.PHONY: build
build:
	@echo "Re-building container and installing dependancies..."
	@docker compose --env-file docker/.env -f docker/docker-compose.yml down && docker compose --env-file docker/.env -f docker/docker-compose.yml build --no-cache && docker compose --env-file docker/.env -f docker/docker-compose.yml up


.PHONY: up-deps
up-deps:
	@echo "Start dependencies..."
	@docker compose -f docker/docker-compose-deps.yml --env-file .env up -d
	@docker compose -f docker/docker-compose-wh.yml --env-file .env up -d

.PHONY: down-deps
down-deps:
	@echo "Start dependencies..."
	@docker compose -f docker/docker-compose-deps.yml --env-file .env down
	@docker compose -f docker/docker-compose-wh.yml --env-file .env down
# https://stackoverflow.com/a/6273809/1826109
%:
	@: