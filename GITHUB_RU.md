# GitHub: чистый репозиторий

## Содержимое и секреты

В репозитории должны оставаться продуктовые исходники, Drizzle SQL-миграции, unit-тесты, README, `render.yaml` и GitHub Actions. Файл `.gitignore` исключает `.env`, локальные секреты и файлы, содержащие пользовательский/agent context; `.env.example` можно публиковать, потому что в нём только placeholders.

Перед первым push проверьте:

```bash
git status --short
git ls-files | grep -E '(^|/)\.env($|\.)|node_modules|\.agents|\.local|replit\.md'
```

Команда `grep` не должна показывать `.env`, `node_modules`, `.agents`, `.local` и приватные файлы. Не копируйте реальные секреты в GitHub Actions Variables или исходники.

## Создание и push вручную

Если GitHub-репозиторий уже создан:

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
# распакуйте исходники в эту папку, не перезаписывая существующий код без сравнения
git add .
git commit -m "Prepare production deployment"
git push -u origin main
```

Если публикуете локальную копию впервые:

```bash
git init -b main
git add .
git commit -m "Prepare production deployment"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Не включайте `.env` даже если репозиторий закрытый. При утечке токена удаление файла из следующего коммита не отзывает секрет — немедленно отзовите и замените его у провайдера.

## CI

`.github/workflows/ci.yml` запускает на pull request и push:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run build
```

CI не подключается к production PostgreSQL или Dropbox и не выполняет production deploy. Для рутинного CI секреты Dropbox и `DATABASE_URL` не требуются; интеграционные проверки с внешними сервисами запускаются отдельно после настройки аккаунтов.

## Деплой на Render

В Render выберите **New → Blueprint** и подключите репозиторий с `render.yaml`. Создайте Supabase-проект, сохраните его Session Pooler URI как `DATABASE_URL` в Render, затем добавьте секреты Dropbox. GitHub хранит код; Render Free запускает приложение, а Supabase и Dropbox хранят данные.
