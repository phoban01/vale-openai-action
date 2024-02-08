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
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = exports.parse = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const install_1 = require("./install");
function parse(flags) {
    flags = flags.trim();
    if (flags === '') {
        return [];
    }
    // TODO: need to simulate bash?
    return flags.split(/\s+/);
}
exports.parse = parse;
/**
 * Log debugging information to `stdout`.
 *
 * @msg is the message to log.
 */
function logIfDebug(msg) {
    const debug = core.getInput('debug') == 'true';
    if (debug) {
        core.info(msg);
    }
}
/**
 * Parse our user input and set up our Vale environment.
 */
function get(tok, dir) {
    return __awaiter(this, void 0, void 0, function* () {
        logIfDebug('Ensuring core python and ruby dependencies are present');
        yield exec.exec('pip', ['install', 'docutils']);
        logIfDebug('`pip install docutils` complete');
        yield exec.exec('gem', ['install', 'asciidoctor', '--user-install']);
        logIfDebug('`gem install asciidoctor --user-install` complete');
        const localVale = yield (0, install_1.installLint)(core.getInput('version'));
        const localReviewDog = yield (0, install_1.installReviewDog)('0.17.0', core.getInput('reviewdog_url'));
        const valeFlags = core.getInput('vale_flags');
        let version = '';
        yield exec.exec(localVale, ['-v'], {
            silent: true,
            listeners: {
                stdout: (buffer) => (version = buffer.toString().trim())
            }
        });
        version = version.split(' ').slice(-1)[0];
        logIfDebug(`Using Vale ${version}`);
        const path = core.getInput("path");
        const configPath = core.getInput("vale_ini_path");
        let stderr = '';
        let resp = yield exec.exec(localVale, [...parse(valeFlags), `--config=${configPath}`, 'sync'], {
            cwd: dir,
            listeners: {
                stderr: (data) => {
                    stderr += data.toString();
                }
            }
        });
        if (resp !== 0) {
            core.setFailed(stderr);
        }
        let args = [
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
    });
}
exports.get = get;
