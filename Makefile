SHELL := /bin/bash

PORT ?= 8080

.PHONY: build.celeste build ui up

i: install
install:; npm install
node_modules: install

build.celeste:
	./scripts/build-celeste-docker.sh

build.ui: node_modules
	npm run build

build:
	$(MAKE) build.celeste
	$(MAKE) build.ui

up: node_modules
	npm run dev -- --host --port $(PORT)

