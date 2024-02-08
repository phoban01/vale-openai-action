import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import {installLint, installReviewDog} from './install';

export function parse(flags: string): string[] {
  flags = flags.trim();
  if (flags === '') {
    return [];
  }

  // TODO: need to simulate bash?
  return flags.split(/\s+/);
}

/**
 * Our expected input.
 *
 * @token is automatically created; see https://bit.ly/336fZSk.
 *
 * @workspace is the directory that Vale is run within.
 *
 * @args are Vale's run-time arguments.
 */
export interface Input {
  token: string;
  workspace: string;
  exePath: string;
  reviewdogPath: string;
  path: string;
  args: string[];
}

/**
 * Log debugging information to `stdout`.
 *
 * @msg is the message to log.
 */
function logIfDebug(msg: string) {
  const debug = core.getInput('debug') == 'true';
  if (debug) {
    core.info(msg);
  }
}

/**
 * Parse our user input and set up our Vale environment.
 */
export async function get(tok: string, dir: string): Promise<Input> {
  logIfDebug('Ensuring core python and ruby dependencies are present');

  await exec.exec('pip', ['install', 'docutils']);
  logIfDebug('`pip install docutils` complete');

  await exec.exec('gem', ['install', 'asciidoctor', '--user-install']);
  logIfDebug('`gem install asciidoctor --user-install` complete');

  const localVale = await installLint(core.getInput('version'));
  const localReviewDog = await installReviewDog(
    '0.17.0',
    core.getInput('reviewdog_url')
  );
  const valeFlags = core.getInput('vale_flags');

  let version = '';
  await exec.exec(localVale, ['-v'], {
    silent: true,
    listeners: {
      stdout: (buffer: Buffer) => (version = buffer.toString().trim())
    }
  });
  version = version.split(' ').slice(-1)[0];
  logIfDebug(`Using Vale ${version}`);

  let stderr = '';
  let resp = await exec.exec(localVale, [...parse(valeFlags), 'sync'], {
    cwd: dir,
    listeners: {
      stderr: (data: Buffer) => {
        stderr += data.toString();
      }
    }
  });

  if (resp !== 0) {
    core.setFailed(stderr);
  }

  const path = core.getInput("path");
  const configPath = core.getInput("vale_ini_path");

  let args: string[] = [
    `--output=JSON`,
    `--config=${configPath}`,
    path,
  ];

  logIfDebug(`Vale set-up complete; using '${args}' with ${localReviewDog}.`);


  return {
    token: tok,
    workspace: dir,
    exePath: localVale,
    args: args,
    path: core.getInput("path"),
    reviewdogPath: localReviewDog
  };
}
