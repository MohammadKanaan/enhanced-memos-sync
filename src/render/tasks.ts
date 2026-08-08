export interface TaskStateMap {
  [trimmedCaseSensitiveTaskText: string]: " " | "x" | "X";
}

const TASK_LINE = /^([ \t]*)- \[([ xX])\](.*)$/;

export function extractTaskStates(markdown: string): TaskStateMap {
  const states: TaskStateMap = {};

  for (const line of markdown.split(/\r?\n/)) {
    const task = parseTaskLine(line);
    if (task) {
      states[task.text] = task.state;
    }
  }

  return states;
}

export function applyTaskStates(local: TaskStateMap, freshRemote: string): string {
  return freshRemote
    .split(/(\r?\n)/)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      const task = parseTaskLine(part);
      const state = task ? local[task.text] : undefined;
      return task && state !== undefined ? `${task.indentation}- [${state}]${task.trailing}` : part;
    })
    .join("");
}

function parseTaskLine(
  line: string,
): { indentation: string; state: " " | "x" | "X"; trailing: string; text: string } | undefined {
  const match = line.match(TASK_LINE);
  if (!match) {
    return undefined;
  }
  return {
    indentation: match[1]!,
    state: match[2]! as " " | "x" | "X",
    trailing: match[3]!,
    text: match[3]!.trim(),
  };
}
