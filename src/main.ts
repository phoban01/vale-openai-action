import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import * as input from './input';
import OpenAI from 'openai';

/**
 * These environment variables are exposed for GitHub Actions.
 *
 * See https://bit.ly/2WlFUD7 for more information.
 */
const {GITHUB_WORKSPACE} = process.env;

const prompt = `
`;

function systemPrompt(content: string): string {
      return `I am going to give you a markdown file and a json data set. Here is the schema of a single json object: {"message": "<msg>", "location": {"path": "<file path>", "range": {"start": {"line": 14, "column": 15}, "end": {"line": 14, "column": 18}}}, "suggestions": [{"range": {"start": {"line": 14, "column": 15}, "end": {"line": 14, "column": 18}}, "text": "<replacement text>"}], "severity": "WARNING"}. I want you to examine each entry in the data and consulting the markdown file populate the suggestions entries where there is an obvious fix based on the data. When calculating the end position for the suggestions you need to ensure it matches the columns correctly. Please tweak the end column in suggestions to ensure letters are not being repeated. In many cases the column will be trucated by one, ensure this does not happen by checking what the output substitution would look like!. Here is the content: ${content}. End of content. You must ensure that multiple messages are returned NOT just a single message.`
}

export async function run(actionInput: input.Input): Promise<void> {
  const openai = new OpenAI({
    apiKey: core.getInput('openai_api_key')
  });
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

        const content = fs.readFileSync("/home/runner/work/vale-test/vale-test/" + actionInput.path, { encoding: 'utf8', flag: 'r'});

        const data = JSON.parse(output.stdout
          .replace(/(\r\n|\n|\r)/gm, ',')
          .replace(/,\s*$/, '')
          .trim());

        console.log(data);

        const response = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          response_format: {type: 'json_object'},
          messages: [
            {
              role: 'system',
              content: systemPrompt(content),
            },
            {
              role: "user",
              content: `Here is the data: ${data}. End of data. Please return in jsonlines format with one line for each message.`
            }
          ]
        });

        console.log(JSON.stringify(response));

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

        const enriched = JSON.parse(response.choices[0].message.content);
        console.log(enriched);
        
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
            input: Buffer.from(enriched.map(JSON.stringify).join("\n"), 'utf-8'),
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


