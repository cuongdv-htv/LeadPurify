---
name: Git Branching Rule
description: Rules for handling tasks and git branching
---

# Task Branching Rule

Whenever a user requests a new feature, bug fix, or any new task, you MUST follow this workflow:

1. Create a corresponding Git branch before modifying any code.
2. The branch name should be descriptive of the task, using the format: `feature/task-name` or `bugfix/issue-description`.
3. Use the `run_command` tool to execute `git checkout -b <branch_name>`.
4. Proceed with tracking the tasks and implementing the changes on the new branch.
