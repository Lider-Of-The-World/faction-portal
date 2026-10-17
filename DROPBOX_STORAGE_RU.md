# Dropbox для постоянного хранения скриншотов

В Render приложение использует Dropbox API v2 с короткоживущим access token, который сервер получает по `DROPBOX_REFRESH_TOKEN`. Refresh token, App Secret и App Key читаются только серверным процессом из переменных окружения. В браузер не передаются ни токены, ни Dropbox-пути, ни публичные ссылки.

Переключение провайдера не копирует прежние объекты из GCS/Replit Object Storage в Dropbox. Если старые скриншоты должны сохраниться, заранее перенесите их отдельно и проверьте ссылки/метаданные; доступ к прежнему хранилищу в ходе этой подготовки не проверялся.

## Создание Dropbox App

1. Создайте приложение в [Dropbox App Console](https://www.dropbox.com/developers/apps).
2. Выберите **Scoped access** и **App folder** (минимально достаточная область доступа).
3. В Permissions включите минимальные scopes, необходимые для чтения и записи файлов и чтения метаданных:
   - `files.content.read`
   - `files.content.write`
   - `files.metadata.read`
4. Сохраните изменения scopes и получите `App key` и `App secret`.
5. Получите OAuth refresh token через официальный OAuth 2.0 Authorization Code flow с `token_access_type=offline`. Обычный access token является короткоживущим и не подходит как постоянная production-настройка. Используйте только refresh token из ответа Dropbox, не передавайте его в чат или GitHub.
6. В Render → Web Service → Environment добавьте:
   - `DROPBOX_APP_KEY`
   - `DROPBOX_APP_SECRET`
   - `DROPBOX_REFRESH_TOKEN`
   - `OBJECT_STORAGE_PROVIDER=dropbox`
   - `DROPBOX_ROOT_PATH=/FactionControl/screenshots`
7. Перезапустите сервис и проверьте, что `/ready` отвечает `200`; затем выполните тестовую авторизованную загрузку и откройте файл из аккаунта с правами.

Если App настроен на App Folder, корневой путь относится к папке приложения и не требует доступа ко всему Dropbox. Не переключайте app на Full Dropbox, если это не требуется вашей политикой хранения.

## Поток загрузки и авторизация

1. Только вошедший пользователь может запросить ticket загрузки.
2. Браузер отправляет бинарный файл на тот же-origin маршрут API. Сервер проверяет пользователя, владельца ticket, MIME, расширение, заявленный/фактический размер до 10 МБ и сигнатуру JPEG/PNG/WebP.
3. Сервер загружает байты на закрытый Dropbox-путь через `/2/files/upload`. Ссылка общего доступа не создаётся.
4. При последующей отправке сервер ещё раз читает файл и сверяет фактическое содержимое; метаданные связаны с PostgreSQL.
5. Просмотр идёт через `/api/storage/objects/...` после авторизации и проверки владельца, руководящей роли или связи с назначением. Ответы приватные и не кэшируются общедоступно.

На Render файлы не сохраняются на локальный диск. Успешный запрос Dropbox подтверждает только прием файла Dropbox API; работоспособность интеграции нужно проверить после добавления настоящих секретов пользователя.

## Безопасность и эксплуатация

- Храните секреты только в Render Environment/Secrets или в локальном `.env`, который игнорируется Git.
- Не используйте `DROPBOX_ACCESS_TOKEN` как постоянную конфигурацию: приложение использует обновляемую OAuth-авторизацию.
- Если Dropbox App Secret/refresh token отозван или scopes изменены, обновите его в Render Environment, затем перезапустите сервис.
- Удаление файла Dropbox отдельно от PostgreSQL может оставить метаданные без файла; удаление строки БД отдельно может оставить файл в Dropbox. Удаляйте их согласованно через предусмотренные операции обслуживания.
- Старый `OBJECT_STORAGE_PROVIDER=replit` оставлен для совместимости с исходным окружением; для Render Blueprint выбран Dropbox.

Официальные материалы: [Dropbox OAuth](https://docs.dropboxapi.com/dropbox-api/docs/oauth), [Dropbox API v2](https://docs.dropboxapi.com/dropbox-api/api-reference/overview), [Upload](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload), [Download](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download).
