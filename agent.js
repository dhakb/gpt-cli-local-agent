import {config} from "dotenv"

config()

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
]


async function executeTool(toolName, args) {
    switch (toolName) {
        case "list_files": {
            const path = args.path ?? ".";
            const content = await fs.readdir(path, {withFileTypes: true});
            const contentList = content.map((c) => c.name);

            return JSON.stringify(contentList);
        }
        case "read_file": {
            const path = args.path;
            return await fs.readFile(path, "utf8");
        }
        case "edit_file": {
            const path = args.path ?? "."
            const old_text = args.old_text;
            const new_text = args.new_text;

            if (old_text === "") {
                await fs.writeFile(path, new_text)
                return "File created"
            }

            const file_content = await fs.readFile(path, "utf8");
            const new_file_content = file_content.replace(old_text, new_text);
            await fs.writeFile(path, new_file_content)

            return "File edited"
        }
        case "run_bash": {
            const res = await exec(args["command"])

            return `stdout:\n${res.stdout}\n${res.stderr}`
        }
    }
}

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function runAgent(prompt) {
    const input = [{role: "user", content: prompt}];

    console.log(`🤖 Working on... ${prompt} \n`)

    while (true) {
        const response = await client.responses.create({
            model: "gpt-4o",
            input: input,
            tools: TOOLS,
            tool_choice: "auto"
        });

        input.push(...response.output)

        const toolCalls = response.output.filter((o) => o.type === "function_call");

        if (toolCalls.length) {
            const toolResults = [];

            for (let call of toolCalls) {
                console.log(`🔧 Using tool: ${call.name}`)
                const result = await executeTool(call.name, JSON.parse(call.arguments))

                toolResults.push({
                    type: "function_call_output",
                    call_id: call.call_id,
                    output: JSON.stringify(result)
                })
            }

            input.push(...toolResults);
        } else {
            console.log(`\n✅Done: ${response.output_text}`)
            break
        }
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
            console.log(e);
            console.log("👋Goodbye!");
            rl.close();
            break;
        }
    }


}

main();