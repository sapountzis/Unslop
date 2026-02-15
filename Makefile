.PHONY: setup fmt fmtcheck lint type test ui doclint archlint taskflow check

setup:
	bash ./tools/agent/run_with_cleanup.sh bash ./dev/setup.sh

fmt:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh fmt

fmtcheck:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh fmtcheck

lint:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh lint

type:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh type

test:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh test

ui:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh ui

doclint:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh doclint

archlint:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh archlint

taskflow:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh taskflow

check:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh all
