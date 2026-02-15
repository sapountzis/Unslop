.PHONY: setup fmt fmtcheck lint type test ui doclint archlint check

setup:
	./dev/setup.sh

fmt:
	./tools/agent/check.sh fmt

fmtcheck:
	./tools/agent/check.sh fmtcheck

lint:
	./tools/agent/check.sh lint

type:
	./tools/agent/check.sh type

test:
	./tools/agent/check.sh test

ui:
	./tools/agent/check.sh ui

doclint:
	./tools/agent/check.sh doclint

archlint:
	./tools/agent/check.sh archlint

check:
	./tools/agent/check.sh all
