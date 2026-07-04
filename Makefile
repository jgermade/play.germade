SHELL := /bin/bash

PORT ?= 8080

.PHONY: build.celeste build.sonic-1 build ui up

i: install
install:; npm install
node_modules: install

build.celeste:
	./scripts/celeste/build-celeste-docker.sh

build.sonic-1:
	./scripts/sonic1/build-sonic1-docker.sh

build.ui: node_modules
	npm run build

build:
	$(MAKE) build.celeste
	$(MAKE) build.sonic-1
	$(MAKE) build.ui

up: node_modules
	npm run dev -- --host --port $(PORT)

