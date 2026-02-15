.PHONY: setup init-feature fmt fmtcheck lint type test ui doclint archlint workflow taskflow pr-ready pr-submit pr-cleanup check

setup:
	bun run ./tools/checks/cli.ts setup

init-feature:
	@if [ -z "$(FEATURE)" ]; then \
		echo "Usage: make init-feature FEATURE=<slug> [BASE=<branch>] [WORKTREE_ROOT=/tmp/unslop-worktrees] [BRANCH_PREFIX=feat] [AUTO_SYNC_BASE=1]" >&2; \
		exit 64; \
	fi
	bash ./tools/agent/init_feature.sh "$(FEATURE)" "$(BASE)" "$(WORKTREE_ROOT)"

fmt:
	bun run ./tools/checks/cli.ts check fmt

fmtcheck:
	bun run ./tools/checks/cli.ts check fmtcheck

lint:
	bun run ./tools/checks/cli.ts check lint

type:
	bun run ./tools/checks/cli.ts check type

test:
	bun run ./tools/checks/cli.ts check test

ui:
	bun run ./tools/checks/cli.ts check ui

doclint:
	bun run ./tools/checks/cli.ts check doclint

archlint:
	bun run ./tools/checks/cli.ts check archlint

workflow:
	bun run ./tools/checks/cli.ts check workflow

taskflow:
	bun run ./tools/checks/cli.ts check taskflow

pr-ready:
	bun run ./tools/checks/cli.ts pr-ready

pr-submit:
	bun run ./tools/checks/cli.ts pr-submit

pr-cleanup:
	bun run ./tools/checks/cli.ts pr-cleanup

check:
	bun run ./tools/checks/cli.ts check all
