import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as path from 'path';
import * as input from './input';
import OpenAI from 'openai';

/**
 * These environment variables are exposed for GitHub Actions.
 *
 * See https://bit.ly/2WlFUD7 for more information.
 */
const {GITHUB_WORKSPACE} = process.env;

const prompt = `I am going to give you a markdown file and a json lines data set.
Here is the the schema of the jsonlines data:
{"message": "<msg>", "location": {"path": "<file path>", "range": {"start": {"line": 14, "column": 15}, "end": {"line": 14, "column": 18}}}, "suggestions": [{"range": {"start": {"line": 14, "column": 15}, "end": {"line": 14, "column": 18}}, "text": "<replacement text>"}], "severity": "WARNING"}

I want you to examine each entry in the data and consulting the markdown file populate the suggestions entries where there is an obvious fix based on the data.

When calculating the end position for the suggestions you need to ensure it matches the columns correctly. Please tweak the end column in suggestions to ensure letters are not being repeated. In many cases the column will be trucated by one, ensure this does not happen by checking what the output substitution would look like!

Your output should be raw jsonlines data with the addition of suggestions for each message in the input data.
`;

export async function run(actionInput: input.Input): Promise<void> {
  const openai = new OpenAI({
    apiKey: core.getInput('openai_api_key'),
  });
  const Promise = require('bluebird');
  const fs = Promise.promisifyAll(require('fs'));
  const workdir = core.getInput('workdir') || '.';
  const cwd = path.relative(
    process.env['GITHUB_WORKSPACE'] || process.cwd(),
    workdir
  );

  try {
    const code = await core.group(
      'Running vale with reviewdog 🐶 ...',
      async (): Promise<number> => {
        // Vale output ...
        const output = await exec.getExecOutput(
          actionInput.exePath,
          actionInput.args,
          {
            cwd,
            ignoreReturnCode: true,
            env: {
              PATH: `${process.env['PATH']}:/home/runner/.local/share/gem/ruby/3.0.0/bin`
            }
          }
        );

        const vale_code = output.exitCode;
        const should_fail = core.getInput('fail_on_error');

        const content = await fs.readFile(actionInput.path, err => {});

        console.log(JSON.string(output.stdout));

        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo-0125",
          response_format: { type: 'json_object'},
          messages: [
            {role: 'system', content: prompt},
            {role: 'user', content: `Here is the file: ${content}`},
            {role: 'user', content: `Here is the json data: ${JSON.stringify(output.stdout)}. Please return in jsonlines format.`}
          ]
        });

        if (
          !(
            response.choices &&
            response.choices.length === 1 &&
            response.choices[0].message &&
            typeof response.choices[0].message.content === 'string'
          )
        ) {
          return 1;
        }

        console.log(response.choices[0].message);
        const enriched: string = response.choices[0].message.content;

        // Pipe to reviewdog ...
        process.env['REVIEWDOG_GITHUB_API_TOKEN'] = core.getInput('token');
        return await exec.exec(
          actionInput.reviewdogPath,
          [
            '-f=rdjsonl',
            `-name=vale`,
            `-reporter=${core.getInput('reporter')}`,
            `-fail-on-error=${should_fail}`,
            `-filter-mode=${core.getInput('filter_mode')}`,
            `-level=${
              vale_code == 1 && should_fail === 'true' ? 'error' : 'info'
            }`
          ],
          {
            cwd,
            input: Buffer.from(JSON.stringify(JSON.parse(enriched)), 'utf-8'),
            ignoreReturnCode: true
          }
        );
      }
    );

    if (code !== 0) {
      core.setFailed(`reviewdog exited with status code: ${code}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
    } else {
      core.setFailed(`${error}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    const userToken = core.getInput('token');
    const workspace = GITHUB_WORKSPACE as string;

    const actionInput = await input.get(userToken, workspace);
    await run(actionInput);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
    } else {
      core.setFailed(`${error}`);
    }
  }
}

main();
