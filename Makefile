.PHONY: setup init-feature fmt fmtcheck lint type test ui doclint archlint workflow taskflow pr-ready pr-submit pr-cleanup check

setup:
	bash ./tools/agent/run_with_cleanup.sh bash ./dev/setup.sh

init-feature:
	@if [ -z "$(FEATURE)" ]; then \
		echo "Usage: make init-feature FEATURE=<slug> [BASE=<branch>] [WORKTREE_ROOT=/tmp/unslop-worktrees] [BRANCH_PREFIX=feat]" >&2; \
		exit 64; \
	fi
	bash ./tools/agent/init_feature.sh "$(FEATURE)" "$(BASE)" "$(WORKTREE_ROOT)"

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

workflow:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh workflow

taskflow:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh taskflow

pr-ready:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/pr_ready.sh

pr-submit:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/pr_submit.sh

pr-cleanup:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/post_pr_cleanup.sh

check:
	bash ./tools/agent/run_with_cleanup.sh bash ./tools/agent/check.sh all
