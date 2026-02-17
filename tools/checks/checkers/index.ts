import type { Checker } from "../core/types";
import { archlintChecker } from "./archlint";
import { doclintChecker } from "./doclint";
import { fmtChecker } from "./fmt";
import { fmtcheckChecker } from "./fmtcheck";
import { lintChecker } from "./lint";
import { taskflowChecker } from "./taskflow";
import { testChecker } from "./test";
import { typeChecker } from "./type";
import { uiChecker } from "./ui";
import { workflowChecker } from "./workflow";

export const CHECKERS: Checker[] = [
	fmtChecker,
	fmtcheckChecker,
	lintChecker,
	typeChecker,
	testChecker,
	uiChecker,
	doclintChecker,
	archlintChecker,
	workflowChecker,
	taskflowChecker,
];

export const CHECK_ORDER_ALL = [
	"workflow",
	"fmtcheck",
	"lint",
	"type",
	"test",
	"ui",
	"doclint",
	"archlint",
	"taskflow",
] as const;
