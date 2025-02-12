"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const input = __importStar(require("./input"));
const openai_1 = __importDefault(require("openai"));
/**
 * These environment variables are exposed for GitHub Actions.
 *
 * See https://bit.ly/2WlFUD7 for more information.
 */
const { GITHUB_WORKSPACE } = process.env;
const prompt = `
`;
function systemPrompt(content) {
    return `I am going to give you a markdown file and a json data set. Here is the schema of a single json object: {"message": "<msg>", "location": {"path": "<file path>", "range": {"start": {"line": 14, "column": 15}, "end": {"line": 14, "column": 18}}}, "suggestions": [{"range": {"start": {"line": 14, "column": 15}, "end": {"line": 14, "column": 18}}, "text": "<replacement text>"}], "severity": "WARNING"}. I want you to examine each entry in the data and consulting the markdown file populate the suggestions entries where there is an obvious fix based on the data. When calculating the end position for the suggestions you need to ensure it matches the columns correctly. Please tweak the end column in suggestions to ensure letters are not being repeated. In many cases the column will be trucated by one, ensure this does not happen by checking what the output substitution would look like!. Here is the content: ${content}. End of content. You must ensure that multiple messages are returned NOT just a single message.`;
}
function run(actionInput) {
    return __awaiter(this, void 0, void 0, function* () {
        const openai = new openai_1.default({
            apiKey: core.getInput('openai_api_key')
        });
        const workdir = core.getInput('workdir') || '.';
        const cwd = path.relative(process.env['GITHUB_WORKSPACE'] || process.cwd(), workdir);
        try {
            const code = yield core.group('Running vale with reviewdog 🐶 ...', () => __awaiter(this, void 0, void 0, function* () {
                // Vale output ...
                const output = yield exec.getExecOutput(actionInput.exePath, actionInput.args, {
                    cwd,
                    ignoreReturnCode: true,
                    env: {
                        PATH: `${process.env['PATH']}:/home/runner/.local/share/gem/ruby/3.0.0/bin`
                    }
                });
                const vale_code = output.exitCode;
                const should_fail = core.getInput('fail_on_error');
                const content = fs.readFileSync("/home/runner/work/vale-test/vale-test/" + actionInput.path, { encoding: 'utf8', flag: 'r' });
                const data = JSON.parse(output.stdout
                    .replace(/(\r\n|\n|\r)/gm, ',')
                    .replace(/,\s*$/, '')
                    .trim());
                console.log(data);
                const response = yield openai.chat.completions.create({
                    model: 'gpt-4-turbo-preview',
                    response_format: { type: 'json_object' },
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
                if (!(response.choices &&
                    response.choices.length === 1 &&
                    response.choices[0].message &&
                    typeof response.choices[0].message.content === 'string')) {
                    return 1;
                }
                const enriched = JSON.parse(response.choices[0].message.content);
                console.log(enriched);
                // Pipe to reviewdog ...
                process.env['REVIEWDOG_GITHUB_API_TOKEN'] = core.getInput('token');
                return yield exec.exec(actionInput.reviewdogPath, [
                    '-f=rdjsonl',
                    `-name=vale`,
                    `-reporter=${core.getInput('reporter')}`,
                    `-fail-on-error=${should_fail}`,
                    `-filter-mode=${core.getInput('filter_mode')}`,
                    `-level=${vale_code == 1 && should_fail === 'true' ? 'error' : 'info'}`
                ], {
                    cwd,
                    input: Buffer.from(enriched.map(JSON.stringify).join("\n"), 'utf-8'),
                    ignoreReturnCode: true
                });
            }));
            if (code !== 0) {
                core.setFailed(`reviewdog exited with status code: ${code}`);
            }
        }
        catch (error) {
            if (error instanceof Error) {
                core.setFailed(error);
            }
            else {
                core.setFailed(`${error}`);
            }
        }
    });
}
exports.run = run;
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userToken = core.getInput('token');
            const workspace = GITHUB_WORKSPACE;
            const actionInput = yield input.get(userToken, workspace);
            yield run(actionInput);
        }
        catch (error) {
            if (error instanceof Error) {
                core.setFailed(error);
            }
            else {
                core.setFailed(`${error}`);
            }
        }
    });
}
main();
