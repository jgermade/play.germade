SHELL := /bin/bash

PORT ?= 8080

.PHONY: build.celeste build.sonic-1 build.sonic-2 build.sonic-3 build.sonic-mania build.smw build ui up

i: install
install:; npm install
node_modules: install

build.celeste:
	./scripts/celeste/build-celeste-docker.sh

build.sonic-1:
	./scripts/sonic/build-sonic-docker.sh 1

build.sonic-2:
	./scripts/sonic/build-sonic-docker.sh 2

build.sonic-3:
	./scripts/sonic3/build-sonic3-web.sh

build.sonic-mania:
	./scripts/sonic-mania/build-sonic-mania-docker.sh

build.sonic-cd:
	./scripts/sonic-cd/build-sonic-cd-docker.sh

build.smw:
	./scripts/smario-world/build-smw-docker.sh

build.ui: node_modules
	npm run build

build:
	$(MAKE) build.celeste
	$(MAKE) build.sonic-1
	$(MAKE) build.ui

up: node_modules
	npm run dev -- --host --port $(PORT)

