SHELL := /bin/bash
PORT ?= 4173

.PHONY: i install engines up build preview test clean

i: install
install: ## Install dependencies
	npm install

node_modules: package.json
	npm install
	@touch node_modules

engines: node_modules ## Fetch the pinned engines into public/engines/ (ENGINE_SRC_<ID>=dir for a local build)
	npm run engines

up: node_modules ## Dev server with COOP/COEP (fetches engines first)
	npm run dev -- --host

build: node_modules ## Production build → dist/ (PWA, service worker included)
	npm run build

preview: ## Serve dist/ with COOP/COEP on :$(PORT)
	npx vite preview --host --port $(PORT)

test: node_modules ## Catalog checks
	npm test

clean: ## Remove build output and fetched engines
	rm -rf dist dev-dist public/engines

help: ## List targets
	@grep -E '^[a-zA-Z_.-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
