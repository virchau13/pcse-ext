import * as vscode from 'vscode';
import * as os from 'os';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolve } from 'path';
import { rejects } from 'assert';

let runner: vscode.StatusBarItem;
let terminal: vscode.Terminal | undefined = undefined;

function promiseValue<T>(val: T): Promise<T> {
    return new Promise((res) => res(val));
}

function makeSureDirExists(path: string): Promise<void> {
    return new Promise((res, rej) => {
        fs.mkdir(path, (err) => {
            vscode.window.showInformationMessage(path + ' ' + err);
            if(err && err.code !== 'EEXIST')  rej(err);
            else res();
        })
    });
}

function isValidFile(file: string | undefined): Promise<boolean> {
    if(file === undefined) return promiseValue(false);
    return new Promise((res) => {
        fs.access(file, fs.constants.X_OK | fs.constants.R_OK, (err) => {
            res(!err);
        });
    });
}

async function downloadPcse(ctx: vscode.ExtensionContext, url: string, filename: string): Promise<string> {
    let fileRes = await axios.get(url, {responseType: 'stream'});
    vscode.window.showInformationMessage("Downloading pcse...");
    return new Promise((res, rej) => {
        let pcsepath = path.join(ctx.globalStoragePath, filename);
        let writeStream = fs.createWriteStream(pcsepath);
        fileRes.data.pipe(writeStream);
        writeStream.on('finish', () => {
            vscode.window.showInformationMessage("Finished!");
            fs.chmod(pcsepath, 0o777, () => 
                res(pcsepath)
            );
        });
        writeStream.on('error', err => {
            rej('Could not finish download: ' + err);
        })
    });
}

async function getLatest(ctx: vscode.ExtensionContext) : Promise<any> {
    let releases = await axios.get('https://api.github.com/repos/virchau13/pcse/releases/latest');
    let assets: Array<any> = releases.data.assets;
    let asset = assets.find(el => el.name.indexOf(os.platform()) !== -1);
    if(asset){
        return asset;
    } else {
        return Promise.reject('Incompatible OS. Please file a bug report, and I will get around to building a version for it.' +
        '(If you are on MacOS/Linux/Windows, this is a BUG, and you should report it.)');
    }
}

export function activate(context: vscode.ExtensionContext) {
    new Promise((res) => {
        let old = context.globalState.get<string>('pcsepath');
        if(old !== undefined){
            let name: string = old;
            res(getLatest(context).then(latest_asset => {
                if(latest_asset.name !== path.basename(name)){
                    // new update
                    return makeSureDirExists(context.globalStoragePath)
                        .then(() => downloadPcse(context, latest_asset.browser_download_url, latest_asset.name))
                        .then((pcsepath: string) => context.globalState.update('pcsepath', pcsepath));
                }
            }));
        } else /* will be downloaded inside */ res();
    }).then(() => {
        let runId = 'pcse-ext.runPcse';
        let cmd = vscode.commands.registerCommand(runId, () => {
            new Promise<string>((res, rej) => {
                let stored = context.globalState.get<string>('pcsepath');
                res(isValidFile(stored).then((isValid: boolean) : string | Promise<string> => {
                    if(!isValid){
                        return makeSureDirExists(context.globalStoragePath)
                            .then(() => getLatest(context))
                            .then((asset: any) => downloadPcse(context, asset.browser_download_url, asset.name))
                            .then((pcsepath: string) => context.globalState.update('pcsepath', pcsepath).then(() => pcsepath));
                    } else {
                        return stored === undefined ? "" /* will never happen */ : stored;
                    }
                }));
            }).then((pcsepath: string) => {
                let ed = vscode.window.activeTextEditor;
                if(ed && ed.document.fileName.endsWith('.pcse')){
                    if(terminal === undefined){
                        terminal = vscode.window.createTerminal("pcse");
                    }
                    terminal.show();
                    terminal.sendText(escapeStrTerm(pcsepath) + ' ' + escapeStrTerm(ed.document.fileName));
                    
                } else {
                    vscode.window.showErrorMessage("Not a valid file!");
                }
            }).catch(err => {
                vscode.window.showErrorMessage(err);
            })
        });
        context.subscriptions.push(cmd);
    
        runner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        runner.command = runId;
        context.subscriptions.push(runner);
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onChangeBuffer));
        onChangeBuffer(vscode.window.activeTextEditor);
    });
}

function escapeStrTerm(str: string) : string {
    return "'" + str.replace(/'/gm, "'\\''") + "'";
}

function onChangeBuffer(editor: vscode.TextEditor | undefined) : void {
    if(editor){
        if(editor.document.fileName.endsWith('.pcse')){
            runner.text = '$(run) Run pseudocode';
            runner.show();
        } else {
            runner.hide();
        }
    }
}

export function deactivate() {}
