import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { executionAsyncId } from 'async_hooks';

let runner: vscode.StatusBarItem;
let terminal: vscode.Terminal | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    let runId = 'pcse-ext.runPcse';
    let cmd = vscode.commands.registerCommand(runId, () => {
        new Promise<string>((res, rej) => {
          
            let folder = path.join(context.extensionPath, 'bin');
            vscode.window.showInformationMessage(folder);
            fs.readdir(folder, (err, files) => {
                if(err) rej(err);
                let executable = files.find(name => name.indexOf(os.platform()) !== -1);
                vscode.window.showInformationMessage(executable === undefined ? "undefined" : executable);
                if(executable === undefined){
                    rej('Unsupported OS. If you are on MacOS/Windows/Linux, this is a bug, and please report it.' +
                    'If you are on a different OS, file an issue, and I will get around to making a build for it.');
                } else {
                    let full: string = path.join(folder, executable);
                    fs.chmod(full, 0o777,  (err) => {
                        if(err) rej(err);
                        res(full);
                    });
                }
            });
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
