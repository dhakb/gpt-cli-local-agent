`agent.js` is a **Node.js** script that acts as an interactive command-line agent powered by **OpenAI's API**.  
It is equipped with tools to perform:

- Local file operations
- Execute bash commands
- Interact with the user

It is designed to run in a terminal environment and can be used to automate tasks, answer questions, and perform various operations based on user input.

---

#### Prerequisites

- **Node.js**: Ensure you have Node.js installed on your system.
- **Environment Variables**:
    - Set the `OPENAI_API_KEY` environment variable with your OpenAI API key.
    - You can use a `.env` file or export it directly in your terminal:
      ```bash
      export OPENAI_API_KEY=your_api_key_here
      ```
- **Dependencies**:
    - Install required dependencies using npm:
      ```bash
      npm install dotenv openai
      ```

---

#### How to Run

1. Make the script executable:
   ```bash
   chmod +x agent.js

2. Run the script:
   ```bash
   node agent.js
   ```

#### Available tools

| Tool Name        | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| **list\_files**  | Lists files and directories at a specified path.                       |
| **read\_file**   | Reads the content of a file.                                           |
| **create\_file** | Creates a new file with specified content.                             |
| **edit\_file**   | Edits an existing file by replacing old text with new text.            |
| **run\_bash**    | Executes a bash command (requires user confirmation before execution). |
****

#### Error Handling

If an error occurs (e.g., file not found, invalid command), the script will display an error message and continue running.

**Common errors include:**

- Missing required arguments for tools
- Invalid file paths
- OpenAI API errors (e.g., invalid API key, rate limits)  


#### Notes

The script tracks token usage for OpenAI API calls and displays a warning if usage exceeds 80% of the context window.

#### Session control

- **Reset context**: Type `reset` at the prompt to clear the conversation history and token usage, starting a fresh session.

