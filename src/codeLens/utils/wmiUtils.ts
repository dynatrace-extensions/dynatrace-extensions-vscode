import * as vscode from "vscode";
import { exec } from "child_process";

const ignoreProperties = 'Select-Object -Property * -ExcludeProperty @("Scope", "Path", "Options", "Properties", "SystemProperties", "ClassPath", "Qualifiers", "Site", "Container", "PSComputerName", "__GENUS", "__CLASS", "__SUPERCLASS", "__DYNASTY", "__RELPATH", "__PROPERTY_COUNT", "__DERIVATION", "__SERVER", "__NAMESPACE", "__PATH")';

interface QueryResult {
  [key: string]: string | number
}

export interface WmiQueryResult {
  query: string;
  error: boolean;
  errorMessage?: string;
  results: Array<QueryResult>;
}

export async function runWMIQuery(query: string, oc: vscode.OutputChannel, callback: (query: string, result: WmiQueryResult) => void) {
  const command = `Get-WmiObject -Query "${query}" | ${ignoreProperties} | ConvertTo-Json`;
  console.log(`Running command: ${command}`);

  exec(command, { shell: "powershell.exe", maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      oc.clear();
      oc.appendLine(error.message);
      oc.show();
      callback(query, { query, error: true, errorMessage: error.message, results: [] });
      return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        oc.clear();
        oc.appendLine(stderr);
        oc.show();
        callback(query, { query, error: true, errorMessage: stderr, results: [] });
        return;
        }
    
    const jsonResponse = JSON.parse(stdout);
    
    callback(query, {
      query,
      error: false,
      results: jsonResponse,
    });
    oc.clear();
  });
}
