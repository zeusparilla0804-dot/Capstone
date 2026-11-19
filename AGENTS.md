# Git workflow

After completing and verifying a requested change, commit only the files for that task and push the commit to `origin` without waiting for a separate push request. Keep unrelated local changes, generated output, and secrets out of the commit.

Use the branch requested by the owner. If the checkout is on `main`, use a task branch when a push could deploy code before a required migration or other release prerequisite is ready. Report the branch, commit, and verification result.
