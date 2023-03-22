/**
  Copyright 2023 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import * as vscode from "vscode";
import * as jszip from "jszip";
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { JMXExtensionV1, JMXExtensionV2, JMXSubGroup, MetricDto, SourceDto } from "../interfaces/extensionMeta";

const OPTION_LOCAL_FILE = "Local (filesystem)";
const OPTION_DYNATRACE_ENVIRONMENT = "Remote (dynatrace environment)";

export async function convertJMXExtension(context: vscode.ExtensionContext, dt: Dynatrace) {

    // User choses if they want to use a local file or browse from the Dynatrace environment
    const pluginJSONOrigins = [OPTION_LOCAL_FILE, OPTION_DYNATRACE_ENVIRONMENT];
    const pluginJSONOrigin = await vscode.window.showQuickPick(pluginJSONOrigins, {
        placeHolder: "How would you like to import the JMX v1 plugin.json?",
        title: "Dynatrace: Convert JMX extension",
    });

    // If the user cancels the operation, return
    if (!pluginJSONOrigin) {
        return;
    }

    let jmxV1Extension = null;

    // If the user chose to use a local file, ask them to select the file
    if (pluginJSONOrigin === OPTION_LOCAL_FILE) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: "Select",
            title: "Select JMX v1 plugin.json",
            filters: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "JMX v1 plugin": ["json", "zip"]              
            },
        };
        const pluginJSONFile = await vscode.window.showOpenDialog(options);
        if (!pluginJSONFile) {
            vscode.window.showErrorMessage("No file was selected. Operation cancelled.");
            return;
        }

        // If this is a zip file, extract the plugin.json file from it
        if (pluginJSONFile[0].fsPath.endsWith(".zip")) {
            const binaryData = await vscode.workspace.fs.readFile(pluginJSONFile[0]);
            jmxV1Extension = await extractPluginJSONFromZip(binaryData);
        } else {
            // If this is a json file, just read it
            const fileContents = await vscode.workspace.fs.readFile(pluginJSONFile[0]);
            jmxV1Extension = JSON.parse(fileContents.toString());
        }
    }

    // If the user chose to browse from the Dynatrace environment, use the API to list the current extensions
    if (pluginJSONOrigin === OPTION_DYNATRACE_ENVIRONMENT) {
        const currentExtensions = await dt.extensionsV1.getExtensions();

        // We only want JMX custom extensions (not the built-in ones)
        // Dynatrace created extensions cannot be downloaded via the API
        const currentJMXExtensions = currentExtensions.filter((extension) => extension.type === "JMX" && !extension.id.startsWith("dynatrace."));
        const jmxExtensionNames = currentJMXExtensions.map((extension) => `${extension.id} | ${extension.name}`);
        
        const jmxExtensionName = await vscode.window.showQuickPick(jmxExtensionNames, {
            placeHolder: "Choose a JMX v1 extension",
            title: "Dynatrace: Convert JMX extension",
        });
        if (!jmxExtensionName) {
            vscode.window.showErrorMessage("No extension was selected. Operation cancelled.");
            return;
        }

        // Get the binary of the extension zip file
        const jmxExtensionId = jmxExtensionName.split(" | ")[0];
        const binaryData = await dt.extensionsV1.getExtensionBinary(jmxExtensionId);
        
        // Extract the plugin.json file from the zip
        jmxV1Extension = await extractPluginJSONFromZip(binaryData);        
    }

    // Convert the JMX v1 extension to v2
    const jmxV2Extension = convertJMXExtensionToV2(jmxV1Extension);

    // Ask the user where they would like to save the file to
    const options: vscode.SaveDialogOptions = {
        saveLabel: "Save",
        title: "Save JMX v2 extension.yaml",
        filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "JMX v2 extension": ["yaml"]
        },
        defaultUri: vscode.Uri.file(`${jmxV2Extension.name}.yaml`),
    };
    const extensionYAMLFile = await vscode.window.showSaveDialog(options);
    if (!extensionYAMLFile) {
        vscode.window.showErrorMessage("No file was selected. Operation cancelled.");
        return;
    }
    // Save the file as yaml
    const yamlFileContents = yaml.stringify(jmxV2Extension);
    await vscode.workspace.fs.writeFile(extensionYAMLFile, Buffer.from(yamlFileContents));
    
}


/**
 * Get the contents of the plugin.json file from a zip file binary data
 * @param binaryData The binary data of the zip file
 * @returns The contents of the plugin.json file
*/
async function extractPluginJSONFromZip(binaryData: Buffer | Uint8Array): Promise<JMXExtensionV1> {

    const zip = await jszip.loadAsync(binaryData);
    
    // Find the first ocurrence of plugin.json in the files in the zip
    const pluginJSONFile = Object.keys(zip.files).find((file) => file.endsWith("plugin.json"));
    if (!pluginJSONFile) {
        throw new Error("The selected extension does not contain a plugin.json file.");
    }

    console.log(`Found plugin.json at ${pluginJSONFile}`);

    const pluginJsonFileContent = await zip.file(pluginJSONFile)?.async("string");
    if (!pluginJsonFileContent) {
        throw new Error("Could not extract the plugin.json file.");
    }

    const jmxV1Extension = JSON.parse(pluginJsonFileContent) as JMXExtensionV1;
    return jmxV1Extension;

}


/**
* Converts a JMX extension v1 to the v2 format
* @param jmxV1Extension The v1 extension (plugin.json)
* @returns The converted v2 extension (extension.yaml)
*/
function convertJMXExtensionToV2(jmxV1Extension: JMXExtensionV1): JMXExtensionV2 {

    const extensionName = jmxV1Extension.metricGroup || jmxV1Extension.name;

    const jmxV2Extension: JMXExtensionV2 = {
        name: `custom:${extensionName}`,
        version: '1.0.0',
        minDynatraceVersion: '1.265',
        author: {
            name: 'Dynatrace'
        }
    };

    // First get the metric metadata from the v1 extension
    jmxV2Extension.metrics = jmxV1Extension.metrics.map(metric => {
        return {
            key: metric.timeseries.key,
            metadata: {
                displayName: metric.timeseries.displayname,
                unit: metric.timeseries.unit
            }
        };
    });

    // Populate the subgroups
    jmxV2Extension.jmx = {
        groups: [
        {
            group: "jmx",
            subgroups: jmxV1Extension.metrics.map(metric => {

                const extensionDefinition: JMXSubGroup =  {
                    subgroup: metric.timeseries.key,
                    query: extractQueryString(metric.source),
                    // queryFilters: [],
                    metrics: [{
                        key: `${extensionName}.${metric.timeseries.key}`,
                        value: `attribute:${metric.source.attribute}`,
                        type: metric.source.calculateDelta ? 'count' : 'gauge'
                    }],

                };
                const dimensions = extractSplittings(metric).map(splitting => {
                    return {
                        key: splitting,
                        value: `property:${splitting}`
                    };
                }) ;
                if (dimensions.length > 0) {
                    extensionDefinition.dimensions = dimensions;
                }
                return extensionDefinition;
        
            })
        }   
    ]};

    return jmxV2Extension;

}

/**
 * Converts a v1 JMX query to the v2 format
 * Original: {"domain": "java.lang", "keyProperties": {"name": "G1 Eden Space", "type": "MemoryPool"}},
 * Converted: java.lang:name=G1 Eden Space,type=MemoryPool
 * @param v1MetricSource The plugin v1 metric 'source' property
 * @returns The query string
*/
function extractQueryString(v1MetricSource: SourceDto): string {
    if (v1MetricSource.domain === null) {
        throw new Error('No MBean domain found');
    }

    // Convert the key properties to a string separated by commas
    const keyProperties = Object.entries(v1MetricSource.keyProperties).map(([key, value]) => `${key}=${value}`).join(',');
    const query = `${v1MetricSource.domain}:${keyProperties}`;
    
    if (v1MetricSource.allowAdditionalKeys) {
        return query + ",*";
    }
    return query;

}

/**
 * Converts a v1 JMX splitting (dimensions) to the v2 format
 * Original: {"name": "ConnectionPool"}
 * Converted: connection_pool
 * @param v1Metric The plugin v1 metric object
 * @returns A list of valid dimension names
 */
function extractSplittings(v1Metric: MetricDto): string[] {
    const splittings: string[] = [];
    if (v1Metric.source.splitting) {
        splittings.push(fixDimensionKey(v1Metric.source.splitting.name));
    }
    if (v1Metric.source.splittings) {
        v1Metric.source.splittings.forEach(splitting => {
            splittings.push(fixDimensionKey(splitting.name));
        });
    }
    return splittings;

}

/*
Dimension keys cannot have uppercase letters
We need to convert them to lowercase and add an underscore before the uppercase letters.
*/
function fixDimensionKey(name: string): string {
    let sb = '';
    for (let i = 0; i < name.length; i++) {
        const ch = name.charAt(i);
        if (ch.toUpperCase() === ch) {
            if (i > 0) {
                sb += '_';
            }
            sb += ch.toLowerCase();
        } else {
            sb += ch;
        }
    }
    return sb;
}