export function extractHashtags(markdown: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  let openFence: { character: "`" | "~"; length: number } | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    if (openFence) {
      if (isClosingFence(line, openFence)) {
        openFence = undefined;
      }
      continue;
    }

    const openingFence = getOpeningFence(line);
    if (openingFence) {
      openFence = openingFence;
      continue;
    }

    for (const tag of scanLine(line)) {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
  }

  return tags;
}

function scanLine(line: string): string[] {
  const characters = Array.from(line);
  const tags: string[] = [];

  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] === "`") {
      const length = runLength(characters, index, "`");
      const close = findClosingBackticks(characters, index + length, length);
      if (close !== undefined) {
        index = close + length - 1;
        continue;
      }
    }

    if (characters[index] !== "#" || !hasSafeBoundary(characters, index)) {
      continue;
    }

    let end = index + 1;
    while (end < characters.length && isTagCharacter(characters[end]!)) {
      end += 1;
    }
    if (end > index + 1) {
      tags.push(characters.slice(index + 1, end).join(""));
      index = end - 1;
    }
  }

  return tags;
}

function getOpeningFence(line: string): { character: "`" | "~"; length: number } | undefined {
  const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match?.[1]) {
    return undefined;
  }
  const character = match[1][0]! as "`" | "~";
  return { character, length: match[1].length };
}

function isClosingFence(
  line: string,
  fence: { character: "`" | "~"; length: number },
): boolean {
  const trimmed = line.trimStart();
  const length = runLength(Array.from(trimmed), 0, fence.character);
  return length >= fence.length && trimmed.slice(length).trim() === "";
}

function findClosingBackticks(
  characters: string[],
  start: number,
  length: number,
): number | undefined {
  for (let index = start; index < characters.length; index += 1) {
    if (characters[index] === "`" && runLength(characters, index, "`") === length) {
      return index;
    }
  }
  return undefined;
}

function runLength(characters: string[], start: number, character: string): number {
  let index = start;
  while (characters[index] === character) {
    index += 1;
  }
  return index - start;
}

function hasSafeBoundary(characters: string[], index: number): boolean {
  return index === 0 || !isTagCharacter(characters[index - 1]!);
}

function isTagCharacter(character: string): boolean {
  return /^[\p{L}\p{N}_\-/]$/u.test(character);
}
