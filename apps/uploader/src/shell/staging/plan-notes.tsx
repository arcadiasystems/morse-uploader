import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import { IDENTIFIER_PROBLEM_TEXT } from "@/upload/quilt-identifier";
import {
	type PlanProblem,
	RELAY_MAX_UPLOAD_BYTES,
	type UploadPlan,
} from "@/upload/upload-plan";

/** Left-out files listed before the rest is summed up. */
const LEFT_OUT_LINES = 5;

/** What the plan leaves out of a quilt, and the problems that stop the upload. */
export function PlanNotes({ plan }: { plan: UploadPlan }) {
	return (
		<>
			{plan.leftOut.length > 0 ? (
				<div className="note warn">
					<b>
						{plan.leftOut.length === 1
							? "1 file is left out"
							: `${groupThousands(String(plan.leftOut.length))} files are left out`}{" "}
						of the quilt
					</b>
					<ul className="leftout">
						{plan.leftOut.slice(0, LEFT_OUT_LINES).map((file) => (
							<li key={file.file.id}>
								<code>
									{file.quiltName}/{file.identifier}
								</code>
								: {IDENTIFIER_PROBLEM_TEXT[file.problem]}.
							</li>
						))}
						{plan.leftOut.length > LEFT_OUT_LINES ? (
							<li>and {plan.leftOut.length - LEFT_OUT_LINES} more.</li>
						) : null}
					</ul>
					Choose one blob per file to upload them as they are.
				</div>
			) : null}
			{plan.problems.map((problem) => (
				<p
					className="problem"
					role="alert"
					key={`${problem.kind}:${problem.name}`}
				>
					{problemText(problem)}
				</p>
			))}
		</>
	);
}

function problemText(problem: PlanProblem): string {
	switch (problem.kind) {
		case "too-large":
			return `${problem.name} would send ${formatBytes(BigInt(problem.bytes))}; the upload relay takes at most ${formatBytes(BigInt(RELAY_MAX_UPLOAD_BYTES))} (1 GiB) per upload. Leave it out or split it.`;
		case "too-many-files":
			return `${problem.name}/ has ${groupThousands(String(problem.files))} files; a quilt holds at most ${problem.limit}. Choose one blob per file or split the folder.`;
		case "nothing-left":
			return `No file in ${problem.name}/ can go in a quilt. Choose one blob per file.`;
	}
}
