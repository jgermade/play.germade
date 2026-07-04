SHELL := /bin/bash

PORT ?= 8080

.PHONY: build.celeste build ui up

build.celeste:
	./scripts/build-celeste-docker.sh

build.ui:
	npm run build

build:
	$(MAKE) build.celeste
	$(MAKE) build.ui

up:
	npm run dev -- --host --port $(PORT)

