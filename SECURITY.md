# Security / Безопасность

## What Artel runs on your machine / Что Artel запускает на компьютере

Only one thing runs automatically: the **guard hook** (`hooks/scripts/guard.mjs`), before Bash/PowerShell commands that contain `git`. It:

- reads the command text and runs read-only `git diff`, `git log`, `git ls-files`, `git rev-parse`;
- reads files that the command is about to stage (up to 1 MB each);
- never writes files, never changes git state, never uses the network, never reads secrets outside the repository;
- exits with code 2 (block) or prints an `ask` decision; on any internal error it exits 0 and does nothing.

Everything else in Artel is Markdown instructions (agents and skills) that Claude reads. Agents have the tool lists shown in their frontmatter; review agents get no `Write`/`Edit` tools (some can still run commands through Bash).

Автоматически запускается только хук-сторож. Он только читает репозиторий, ничего не меняет и не ходит в сеть. Всё остальное — текстовые инструкции.

## Limits / Ограничения

The guard is a safety net, not a guarantee. Known gaps:

- it recognises secrets by patterns, so unusual formats can slip through;
- it only sees git commands written in the tool call: git run from inside a script, a Makefile, an npm script or another program is not checked;
- shell features such as variables (`git -C "$DIR"`), command substitution and functions are not evaluated;
- changes larger than 20 MB are not fully scanned — the guard asks instead of blocking;
- placeholders it considers safe (`your_token_here`, `${VAR}`, `example`) are skipped.

Keep GitHub **secret scanning** and **push protection** enabled as a second layer.

Сторож — страховка, а не гарантия: он не видит git, запущенный из скриптов, не вычисляет переменные оболочки и только спрашивает при изменениях больше 20 МБ. Включите на GitHub secret scanning и push protection.

## Reporting a vulnerability / Сообщить об уязвимости

Please do not open a public issue. Use GitHub's **Report a vulnerability** button on the repository's *Security* tab (private advisory). Include steps to reproduce and the Artel version.

Пожалуйста, не создавайте публичный issue — используйте кнопку **Report a vulnerability** на вкладке *Security* репозитория.
