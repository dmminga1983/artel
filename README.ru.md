# Artel

**Лёгкий и безопасный маркетплейс агентов и навыков для Claude Code.** Ставите небольшое ядро (12 агентов, 17 навыков, сторож утечек), а потом добавляете только нужные стек-паки: Python, TypeScript, Go, Rust, Java/Kotlin, .NET, PHP, Ruby, Swift, Flutter, C/C++, данные, DevOps, веб, контент.

[English version →](README.md)

```
/plugin marketplace add dmminga1983/artel
/plugin install artel@artel
/plugin install artel-python@artel      # добавьте нужные паки
```

Затем введите `/artel:start` — Artel спросит, что вы хотите сделать, и подскажет один следующий шаг.

*Артель* — объединение мастеров для общего дела.

---

## Почему Artel

Большие наборы вроде [ECC](https://github.com/affaan-m/ECC) ставят сотни навыков сразу. Claude Code ограничивает список навыков примерно 1% окна контекста: при переполнении описания отбрасываются, навыки перестают срабатывать, а постоянная «цена» платится в каждой сессии. Artel устроен иначе:

| | ECC (замер, окт. 2026) | Artel |
|---|---|---|
| Постоянный расход контекста | ~44,8 тыс. токенов | **~3,0 тыс. токенов** на ядро; ~180 на стек-пак |
| Структура | один большой плагин, ~68 агентов, ~290 навыков | ядро + 15 необязательных паков; **один навык на стек**, справочники читаются по требованию |
| Безопасность | сканер конфигурации | **сторож, включённый с установки**: блокирует коммиты и пуши с ключами, токенами, `.env` и файлами ключей |
| Независимая проверка | — | агент `verifier`, который не оценивает собственную работу |
| Языки | английский | агенты отвечают на языке пользователя; навыки срабатывают на русском и английском |
| Сеть и деньги | платные тарифы, реферальные ссылки | без сетевых вызовов, платных действий, рекламы и телеметрии |
| Зависимости | — | нет; Node ≥ 18 нужен только сторожу, при сбое он не мешает |

Цифры токенов получены командой `claude plugin details`; их можно воспроизвести после установки.

## Цикл Artel

1. **Спланировать** многошаговую работу (`/artel:plan-first`).
2. **Сделать** маленькими проверяемыми шагами.
3. **Проверить**: запустить, открыть, сверить с источниками (`/artel:verify-done`).
4. **Безопасно опубликовать**: сначала скан секретов, потом push (`/artel:secure-publish`).

## Ядро (`artel@artel`)

### Агенты

Агент — помощник с одной ролью и собственным контекстом. Claude подключает его сам, либо попросите: «пусть `security-auditor` проверит репозиторий». Если установлен стек-пак, агенты подгружают его для найденного стека.

| Агент | Что делает |
|---|---|
| `planner` | Превращает размытую задачу в план с критерием готовности |
| `architect` | Выбирает стек и структуру, фиксирует компромиссы |
| `verifier` | Независимо проверяет готовое: запускает, открывает, сверяет факты |
| `code-reviewer` | Ревью по важности: баги, безопасность, тесты, ясность |
| `security-auditor` | Секреты в истории, `.gitignore`, GitHub Actions, зависимости |
| `test-engineer` | Пишет тесты, сначала тест |
| `debugger` | Ищет первопричину, а не симптом |
| `build-fixer` | Чинит сборку и упавший CI минимальной правкой |
| `refactorer` | Переделывает код малыми шагами под защитой тестов |
| `performance-engineer` | Сначала измеряет, потом оптимизирует реальное узкое место |
| `researcher` | Исследование с источниками: каждое утверждение со ссылкой |
| `docs-writer` | Понятные README и инструкции |

### Навыки

| Команда | Что делает |
|---|---|
| `/artel:start` | Подбирает агента, навык или пак под задачу |
| `/artel:plan-first` | План и критерий готовности до начала работы |
| `/artel:verify-done` | Проверка перед тем, как сказать «готово» |
| `/artel:code-review` | Ревью текущих изменений |
| `/artel:tdd` | Разработка через тесты |
| `/artel:debug` | Систематическая отладка |
| `/artel:refactor` | Рефакторинг без изменения поведения |
| `/artel:perf` | Профилирование, правка узкого места, повторный замер |
| `/artel:onboard` | Быстро разобраться в незнакомом проекте |
| `/artel:git-workflow` | Ветки, коммиты, pull request'ы |
| `/artel:ship` | Чек-лист релиза, changelog, тег |
| `/artel:research` | Исследование с источниками |
| `/artel:secure-publish` | Проверка секретов, `.gitignore` и Actions перед публикацией |
| `/artel:secrets-setup` | Настройка `.env`, `.env.example` и защиты ключей |
| `/artel:repo-audit` | Аудит чужого репозитория или плагина перед установкой |
| `/artel:injection-defense` | Защита LLM-приложений, ботов и агентов от prompt injection, чек-лист и тесты |
| `/artel:make-skill` | Создать свой навык или агента |

## Стек-паки

Каждый пак — один навык: как определить проект, настройки по умолчанию, идиомы, ошибки, тесты, подводные камни безопасности, производительность, таблица ошибок сборки и чек-лист ревью; справочные файлы читаются по требованию.

| Установка | Команда | Охват |
|---|---|---|
| `artel-python@artel` | `/artel-python:python` | uv/poetry/pip, типизация, pytest, Django, FastAPI, Flask |
| `artel-typescript@artel` | `/artel-typescript:typescript` | Node, React, Next.js, Vue, Angular, Svelte, Express/Nest |
| `artel-go@artel` | `/artel-go:go` | модули, конкурентность, тесты, net/http, gRPC |
| `artel-rust@artel` | `/artel-rust:rust` | cargo, владение, async, ревью unsafe, axum |
| `artel-jvm@artel` | `/artel-jvm:jvm` | Java, Kotlin, Gradle/Maven, Spring Boot, Android |
| `artel-dotnet@artel` | `/artel-dotnet:dotnet` | C#, ASP.NET Core, EF Core |
| `artel-php@artel` | `/artel-php:php` | Composer, Laravel, Symfony |
| `artel-ruby@artel` | `/artel-ruby:ruby` | Bundler, Rails, RSpec |
| `artel-swift@artel` | `/artel-swift:swift` | SwiftPM/Xcode, SwiftUI, конкурентность |
| `artel-flutter@artel` | `/artel-flutter:flutter` | Dart, управление состоянием, виджет-тесты |
| `artel-cpp@artel` | `/artel-cpp:cpp` | CMake, санитайзеры, ошибки линковки |
| `artel-data@artel` | `/artel-data:data` | SQL, схемы, безопасные миграции, Redis |
| `artel-devops@artel` | `/artel-devops:devops` | Docker, Kubernetes, Terraform, защита Actions |
| `artel-web@artel` | `/artel-web:landing-page`, `/artel-web:seo-audit`, `/artel-web:telegram-bot` | агенты `web-builder`, `bot-builder` |
| `artel-content@artel` | `/artel-content:reel-script`, `/artel-content:youtube-script`, `/artel-content:unit-economics` | агенты `content-producer`, `business-analyst` |

## Сторож утечек

Ядро ставит хук, который срабатывает перед каждым `git commit` и `git push`:

- **блокирует**, если в изменении есть API-ключ, токен, приватный ключ или файл `.env`/ключа;
- **спрашивает** при значениях, похожих на пароль (в коде, конфиге, URL, JWT), при `--force` в `main`/`master` и при изменениях свыше 20 МБ, которые не удалось проверить полностью;
- понимает `cd dir && git commit`, кавычки, `bash -c`, git-алиасы, push другой ветки или тега и `gh repo create --push`;
- ничего не меняет в репозитории и никуда ничего не отправляет;
- при сбое не мешает работе.

Находит ключи AWS, GitHub, Anthropic, OpenAI, Google, Slack, Stripe и другие, токены ботов, приватные ключи и файлы `.env`, `.pem`, `id_rsa`.

- Ложное срабатывание: добавьте в строку комментарий `artel:allow`.
- Отключить: запустите Claude Code с переменной окружения `ARTEL_GUARD=off` (или задайте её в `env` настроек Claude Code). Указать её внутри команды сознательно не работает.
- Проверить весь репозиторий с историей: `/artel:secure-publish` или `node plugins/artel/hooks/scripts/scan-secrets.mjs --history <репозиторий>`.
- Это страховка, а не гарантия — см. [SECURITY.md](SECURITY.md). Включите также secret scanning и push protection на GitHub.

Нужен **Node.js 18+**. Без Node сторож молча неактивен, остальное работает.

## Удаление

```
/plugin uninstall artel@artel
/plugin marketplace remove artel
```

## В приложении Claude (claude.ai)

Навыки совместимы с приложением Claude. Соберите ZIP: `python3 tools/package_skills.py` (все) или `python3 tools/package_skills.py python`, затем загрузите в настройках Claude. Агенты и сторож работают только в Claude Code.

## Участие в проекте

```bash
npm run validate   # структура, frontmatter, бюджеты, покрытие документацией
npm test           # тесты сторожа и сканера
npm run scan       # секреты в файлах и истории
claude plugin validate . --strict
```

Новый стек-пак: [docs/STACK_PACK_GUIDE.md](docs/STACK_PACK_GUIDE.md) и [CONTRIBUTING.md](CONTRIBUTING.md).

## Важно

Агенты помогают, но не заменяют специалиста. Юридические, налоговые и критичные для безопасности выводы проверяйте сами, а персональные данные обезличивайте перед отправкой в любой ИИ-сервис. О найденной уязвимости сообщайте по [SECURITY.md](SECURITY.md).

## Лицензия

[MIT](LICENSE)
