SHELL := /bin/bash

PORT ?= 8080

.PHONY: build.celeste build ui up

build.celeste:
	./scripts/build-celeste-docker.sh

build: build.celeste

ui:
	npm run dev -- --host --port $(PORT)

up:
	$(MAKE) ui
