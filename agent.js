import {config} from "dotenv";

config();

import {OpenAI} from "openai";
import util from "node:util";
import fs from "node:fs/promises";
import * as readline from "node:readline/promises";
import * as child_process from "node:child_process";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const exec = util.promisify(child_process.exec);


const TOOLS = [
    {
        "type": "function",
        "name": "list_files",
        "description": "List files and directories at a given path",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "descriptions": "Path to directory to list content of it (defaults to current directory)"
                }
            },
        },
        "required": ["path"],
        "additionalProperties": false
    },
    {
        "type": "function",
        "name": "read_file",
        "description": "Read the content of a file at a given path",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "descriptions": "Path to the file to read"
                }
            }
        },
        "required": ["path"],
        "additionalProperties": false
    },
    {
        "type": "function",
        "name": "edit_file",
        "description": "Edit a file by replacing old text with new text",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "descriptions": "Path to the file to edit"
                },
                "old_text": {
                    "type": "string",
                    "description": "Text to search for and replace"
                },
                "new_text": {
                    "type": "string",
                    "description": "Text to replace with"
                }
            }
        },
        "required": ["path"],
        "additionalProperties": false
    },
    {
        "type": "function",
        "name": "run_bash",
        "description": "Run a bash command and return the output",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "descriptions": "The bash command to run"
                }
            }
        },
        "required": ["command"],
        "additionalProperties": false
    },
];


async function executeTool(toolName, args) {
    try {
        switch (toolName) {
            case "list_files": {
                const path = args.path ?? ".";
                try {
                    const content = await fs.readdir(path, {withFileTypes: true});
                    const contentList = content.map((c) => c.name);
                    return JSON.stringify(contentList);
                } catch (error) {
                    throw new Error(`Failed to list files in directory '${path}': ${error.message}`);
                }
            }
            case "read_file": {
                const path = args.path;
                if (!path) {
                    throw new Error("File path is required for read_file operation");
                }
                try {
                    return await fs.readFile(path, "utf8");
                } catch (error) {
                    if (error.code === 'ENOENT') {
                        throw new Error(`File '${path}' does not exist`);
                    }
                    throw new Error(`Failed to read file '${path}': ${error.message}`);
                }
            }
            case "edit_file": {
                const path = args.path ?? ".";
                const old_text = args.old_text;
                const new_text = args.new_text;

                if (!path) {
                    throw new Error("File path is required for edit_file operation");
                }

                try {
                    if (old_text === "") {
                        await fs.writeFile(path, new_text);
                        return "File created";
                    }

                    const file_content = await fs.readFile(path, "utf8");
                    const new_file_content = file_content.replace(old_text, new_text);
                    await fs.writeFile(path, new_file_content);
                    return "File edited";
                } catch (error) {
                    if (error.code === 'ENOENT' && old_text !== "") {
                        throw new Error(`File '${path}' does not exist and cannot be edited`);
                    }
                    throw new Error(`Failed to edit file '${path}': ${error.message}`);
                }
            }
            case "run_bash": {
                const command = args.command;
                if (!command) {
                    throw new Error("Command is required for run_bash operation");
                }
                try {
                    const res = await exec(command);
                    return `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`;
                } catch (error) {
                    throw new Error(`Command execution failed: ${error.message}\nstderr: ${error.stderr || 'No stderr output'}`);
                }
            }
            default: {
                throw new Error(`Unknown tool: ${toolName}`);
            }
        }
    } catch (error) {
        console.error(`❌ Tool execution error: ${error.message}`);
        return `Error: ${error.message}`;
    }
}

if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    process.exit(1);
}

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const context = [{role: "user", content: prompt}];

async function runAgent(prompt) {
    console.log(`🤖 Working on... ${prompt} \n`);

    let iterationCount = 0;
    const MAX_ITERATIONS = 20;

    while (iterationCount < MAX_ITERATIONS) {
        try {
            iterationCount++;
            
            const response = await client.responses.create({
                model: "gpt-4o",
                input: context,
                tools: TOOLS,
                tool_choice: "auto"
            });

            context.push(...response.output)

            const toolCalls = response.output.filter((o) => o.type === "function_call");

            if (toolCalls.length) {
                const toolResults = [];

                for (let call of toolCalls) {
                    console.log(`🔧 Using tool: ${call.name}`)
                    
                    let toolArgs;
                    try {
                        toolArgs = JSON.parse(call.arguments);
                    } catch (error) {
                        console.error(`❌ Failed to parse tool arguments for ${call.name}: ${error.message}`);
                        toolResults.push({
                            type: "function_call_output",
                            call_id: call.call_id,
                            output: JSON.stringify(`Error: Invalid tool arguments - ${error.message}`)
                        });
                        continue;
                    }

                    const result = await executeTool(call.name, toolArgs);

                    toolResults.push({
                        type: "function_call_output",
                        call_id: call.call_id,
                        output: JSON.stringify(result)
                    })
                }

                context.push(...toolResults);
            } else {
                console.log(`\n✅Done: ${response.output_text}`)
                break
            }
        } catch (error) {
            console.error(`❌ Agent execution error: ${error.message}`);
            if (error.code === 'insufficient_quota' || error.code === 'invalid_api_key') {
                console.error("❌ OpenAI API error - please check your API key and billing");
                break;
            }
            if (error.code === 'rate_limit_exceeded') {
                console.error("❌ Rate limit exceeded - please wait before trying again");
                break;
            }
            
            console.error("⚠️ Continuing despite error...");
            context.push({
                role: "assistant", 
                content: `I encountered an error: ${error.message}. Please try a different approach.`
            });
        }
    }

    if (iterationCount >= MAX_ITERATIONS) {
        console.error("❌ Maximum iterations reached. The agent may be stuck in a loop.");
    }
}


async function main() {
    while (true) {
        try {
            const prompt = await rl.question("\n💬 What would you like me to do? (or 'quit' to exit)\n> ")
            if (prompt.toLowerCase() === "quit") {
                rl.close();
                console.log("\n👋Goodbye!");
                break;
            }

            await runAgent(prompt);
        } catch (e) {
            console.error(`❌ Unexpected error: ${e.message}`);
            console.log("👋Goodbye!");
            rl.close();
            break;
        }
    }
}

main();