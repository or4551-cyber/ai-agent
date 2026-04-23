import { runCommand } from './terminal';

export async function gitStatus(repoPath: string): Promise<string> {
  return runCommand('git status', repoPath);
}

export async function gitCommit(
  repoPath: string,
  message: string,
  push = false
): Promise<string> {
  let output = '';
  output += await runCommand('git add -A', repoPath);
  output += '\n' + await runCommand(`git commit -m "${message}"`, repoPath);
  if (push) {
    output += '\n' + await runCommand('git push', repoPath);
  }
  return output;
}

export async function gitClone(url: string, targetPath: string): Promise<string> {
  return runCommand(`git clone "${url}" "${targetPath}"`);
}
