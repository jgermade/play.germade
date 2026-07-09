SHELL := /bin/bash

PORT ?= 8080

.PHONY: build.celeste build.sonic-1 build.sonic-2 build.sonic-3 build.sonic-mania build.sonic-cd build.smw build.jgenesis build ui up

i: install
install:; npm install
node_modules: install

build.celeste:
	./scripts/engines/celeste/build-celeste-docker.sh

build.sonic-1:
	./scripts/engines/rsdkv4/build-rsdkv4-docker.sh sonic-1

build.sonic-2:
	./scripts/engines/rsdkv4/build-rsdkv4-docker.sh sonic-2

build.sonic-3:
	./scripts/games/sonic-3/build-sonic3-web.sh

build.sonic-mania:
	./scripts/engines/rsdkv5/build-rsdkv5-docker.sh

build.sonic-cd:
	./scripts/engines/rsdkv3/build-rsdkv3-docker.sh

build.smw:
	./scripts/engines/smw/build-smw-docker.sh

build.jgenesis:
	./scripts/engines/jgenesis/build-jgenesis-docker.sh

build.blastem:
	./scripts/engines/blastem/build-blastem-docker.sh

build.neo-geo:
	./scripts/engines/fbneo/build-fbneo-docker.sh

build.ui: node_modules
	npm run build

build:
	$(MAKE) build.celeste
	$(MAKE) build.sonic-1
	$(MAKE) build.sonic-2
	$(MAKE) build.sonic-3
	$(MAKE) build.sonic-mania
	$(MAKE) build.sonic-cd
	$(MAKE) build.smw
	$(MAKE) build.jgenesis
	$(MAKE) build.blastem
	$(MAKE) build.neo-geo
	$(MAKE) build.ui

up: node_modules
	npm run dev -- --host --port $(PORT)

